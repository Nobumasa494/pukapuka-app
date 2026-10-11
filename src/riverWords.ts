// 川に流す言葉を選ぶ（SPEC 第2部 A.「その人向けの川」）。
// 見つける枠（FIND_SHARE）は全部の言葉から均等。残りは、その人の好みの量（convex/river.ts の weights）で選ぶ
import { WORD_CATEGORY, WORD_LIST } from './words';
import { isGenki, isHardFeeling } from './flow';

type AiWord = { text: string; category: string; parent: string; kind: 'near' | 'abstract' | 'behind' };

export const FIND_SHARE = 0.2; // 10個に2個（案）
export type Frame = 'even' | 'like' | 'find' | 'gather' | 'answer';

// 拾いやすくする時間（決定 2026-10-11、ユーザーが A を選んだ）：その日はじめて川を開いたら、しばらく
// していることと元気・好奇心の言葉を多めに流す。散歩した日に「散歩」が、わくわくした日に「わくわく」が流れてこないと、夜明けが気づけないため。
// 毎日同じように起きるので「何のあとに何」にはならない
export const GATHER_SEC = 90; // 案
export const GATHER_SHARE = 0.6; // この間、泡の6割（案）
export const GATHER_WORDS: readonly string[] = WORD_LIST.filter((w) => WORD_CATEGORY[w] === 'doing' || isGenki(w));
let gatherUntil = 0;
export const startGather = (now = Date.now()) => (gatherUntil = now + GATHER_SEC * 1000);

// AI の言葉（2026-10-11）：好みの枠（like）の半分は、AI の言葉から選ぶ。見つける枠・拾いやすくする時間は決まった言葉のまま
// AI の言葉の重さ＝元の言葉の好みの量 × その言葉自身の好みの量。好きなことは仲間の言葉になって流れ、
// 拾った離れた言葉（寄り道）は、元の言葉と関係なく、それ自身が多めに流れてくる。つらい気持ちから生まれた言葉は少なめ（案）
export const AI_SHARE = 0.5; // 案
export const HARD_FEELING_FACTOR = 0.3; // 案
let aiWords: { text: string; parent: string; hard: boolean }[] = [];
const kidsOf = new Map<string, string[]>();
export function setRiverAiWords(list: AiWord[]) {
  // 裏側の言葉（嫉妬 → あの人みたいになりたい）は、つらさを深めないので、ふつうの量で流す（2026-10-11、ユーザー「はい」）
  aiWords = list.map((w) => ({ text: w.text, parent: w.parent, hard: w.kind !== 'behind' && isHardFeeling(w.parent) }));
  kidsOf.clear();
  for (const w of list) kidsOf.set(w.parent, [...(kidsOf.get(w.parent) ?? []), w.text]);
  rebuild();
}

let more = new Map<string, number>(); // Convex から来る、1倍より多く流す言葉（ほかは1倍）
let weights: { word: string; weight: number }[] | null = null; // null はまだ好みがない（均等）
let total = 0;
let aiPool: { word: string; weight: number }[] = [];
let aiTotal = 0;
function rebuild() {
  if (!weights) return;
  const w = (x: string) => more.get(x) ?? 1;
  weights = WORD_LIST.map((word) => ({ word, weight: w(word) }));
  total = weights.reduce((a, x) => a + x.weight, 0);
  aiPool = aiWords.map((a) => ({ word: a.text, weight: w(a.parent) * w(a.text) * (a.hard ? HARD_FEELING_FACTOR : 1) }));
  aiTotal = aiPool.reduce((a, x) => a + x.weight, 0);
}
export function setRiverWeights(list: { word: string; weight: number }[] | null | undefined) {
  if (!list) {
    weights = null;
    total = 0;
    return;
  }
  more = new Map(list.map((w) => [w.word, w.weight]));
  weights = [];
  rebuild();
}

function pickWeighted(pool: { word: string; weight: number }[], sum: number): string {
  let x = Math.random() * sum, i = 0;
  while (i < pool.length - 1 && (x -= pool[i].weight) > 0) i++;
  return pool[i].word;
}

// 応える泡（SPEC 第2部 A.。決定 2026-10-11）：していることを拾ったら、すぐその言葉から生まれた言葉が流れてくる（散歩 → 夜の散歩）。
// 同じ日の中だけのことなので、次の日以降を見る夜明けには響かない。どれが来るかは均等。気持ちの言葉には応えない（つらさに引きこまれないため）
export const ANSWER_COUNT = 2; // 案
export const ANSWER_SEC = 10; // 案：この間に浮かべられなかった分は流さない
let answers: { word: string; until: number; triedAt: number }[] = [];
export function answerTo(word: string, now = Date.now()) {
  if (WORD_CATEGORY[word] !== 'doing') return;
  const kids = [...(kidsOf.get(word) ?? [])];
  for (let i = 0; i < ANSWER_COUNT && kids.length; i++) {
    const [w] = kids.splice(Math.floor(Math.random() * kids.length), 1);
    answers.push({ word: w, until: now + ANSWER_SEC * 1000, triedAt: 0 });
  }
}

// 今、川に浮かんでいる言葉が、どの枠から来たか（同じ言葉は同時に流れないので、言葉で引ける）。
// 泡が実際に浮かんだときにだけ覚える（選んだのに浮かべられなかった言葉で、浮かんでいる泡の枠を上書きしないため）
const frames = new Map<string, Frame>();
const pending = new Map<string, Frame>();
export const frameOf = (word: string): Frame => frames.get(word) ?? 'even';
export const chooseFrame = (word: string, frame: Frame) => pending.set(word, frame); // 流そうと選んだ
export const floated = (word: string) => {
  frames.set(word, pending.get(word) ?? 'even'); // 浮かんだ
  answers = answers.filter((a) => a.word !== word);
};

export function pickRiverWord(): { word: string; frame: Frame } {
  let word: string, frame: Frame;
  const now = Date.now();
  answers = answers.filter((a) => a.until > now);
  // 応える泡は、浮かぶまで（10秒まで）出し直す。置く場所がなくて浮かべられないことがあるため。
  // 浮かんだと分かるまで少し時間がかかるので、出したばかりの言葉は1秒あける（同じ泡が2つ浮かばないように）
  const a = answers.find((x) => now - x.triedAt > 1000);
  if (a) {
    a.triedAt = now;
    return { word: a.word, frame: 'answer' };
  }
  if (now < gatherUntil && Math.random() < GATHER_SHARE) {
    word = GATHER_WORDS[Math.floor(Math.random() * GATHER_WORDS.length)];
    frame = 'gather';
  } else if (!weights) {
    word = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
    frame = 'even'; // 好みがまだ読めていない（開いた直後・ダミーでない web など）
  } else if (Math.random() < FIND_SHARE) {
    word = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
    frame = 'find';
  } else {
    word = aiTotal > 0 && Math.random() < AI_SHARE ? pickWeighted(aiPool, aiTotal) : pickWeighted(weights, total);
    frame = 'like';
  }
  return { word, frame };
}
