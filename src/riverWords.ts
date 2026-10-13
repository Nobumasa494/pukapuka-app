// 川に流す言葉を選ぶ（SPEC 第2部 A.「その人向けの川」）。
// 見つける枠（FIND_SHARE）は全部の言葉から均等。残りは、その人の好みの量（convex/river.ts の weights）で選ぶ
import { WORD_CATEGORY, WORD_LIST } from './words';
import { isGenki, isHardFeeling } from './flow';
import { boxOf, boxWords, warehouseReady } from './warehouse';
import { BOXES, isActionBox } from '../convex/boxes';

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
// 川の中心は「したいこと・していること」（決定 2026-10-13）。気持ち・体・場面・願いの言葉から生まれた言葉は、流れる量を半分にする（案）。
// 流れた回数は記録するので、割合で数える星空・夜明けは変わらない
export const FEELING_FACTOR = 0.5; // 案
export const WISH_FACTOR = 4; // したいことの言葉（「〜したい」で終わる近い言葉）は4倍流す（案）
const FEELING_CATEGORIES = new Set(['emotion', 'body', 'situation', 'value']);
let aiWords: { text: string; parent: string; hard: boolean; feeling: boolean; wish: boolean }[] = [];
const kidsOf = new Map<string, string[]>();
export function setRiverAiWords(list: AiWord[]) {
  // 裏側の言葉（嫉妬 → あの人みたいになりたい）は、つらさを深めないので、ふつうの量で流す（2026-10-11、ユーザー「はい」）
  aiWords = list.map((w) => ({ text: w.text, parent: w.parent, hard: w.kind !== 'behind' && isHardFeeling(w.parent), feeling: w.kind !== 'behind' && FEELING_CATEGORIES.has(w.category), wish: w.kind === 'near' && w.category === 'doing' && w.text.endsWith('たい') }));
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
  aiPool = aiWords.map((a) => ({ word: a.text, weight: w(a.parent) * w(a.text) * (a.hard ? HARD_FEELING_FACTOR : 1) * (a.feeling ? FEELING_FACTOR : 1) * (a.wish ? WISH_FACTOR : 1) }));
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
  if (warehouseReady()) {
    // 倉庫で動くとき：行動の箱の言葉を拾ったら、同じ箱の言葉が2つ流れてくる（気持ちには応えない）
    const b = boxOf(word);
    if (b === undefined || !isActionBox(b)) return;
    const kids = boxWords(b).filter((w) => w !== word);
    for (let i = 0; i < ANSWER_COUNT && kids.length; i++) {
      const [w] = kids.splice(Math.floor(Math.random() * kids.length), 1);
      answers.push({ word: w, until: now + ANSWER_SEC * 1000, triedAt: 0 });
    }
    return;
  }
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

// 見本（開発用。web で ?len=10 / 14 / 16）：その文字数の言葉だけを流して、泡の読みやすさを比べる（2026-10-13）
const LEN_SAMPLES: Record<string, string[]> = {
  '6': ['野原でフルート', '夜にギター', '読書で音楽', '広場でダンス', '朝の散歩', '山でコーヒー', '古本屋めぐり', '星空を撮る', '餃子を包む', '海を走る'],
  '8': ['野原でフルートを吹く', '読書中に音を聴く', '広場でリズムを聴く', '雨の日にクラシック', '夜の河原でギター', '山頂でコーヒーを飲む', '古本屋をのぞく', '知らない駅で降りる', '餃子をみんなで包む', '海沿いを走ってみる'],
  '10': ['夜にギターを弾いた', '朝の公園を歩きたい', '山頂でコーヒーを飲む', '古本屋をのぞきたい', '星空の写真を撮った', '新しい曲を覚えたい', '週末に餃子を包んだ', '知らない駅で降りる', '海沿いを走ってみたい', '陶芸で器を作りたい'],
  '14': ['夕暮れの河原でギターを弾いた', '秋の山頂でコーヒーを淹れたい', '休日にドラマを一気見したいな', '晴れた日曜に海沿いを走りたい', '隣町の隠れ家カフェを探したい', 'お風呂で好きな曲を熱唱したい', '初めての日本画展に行ってみる', '玄関に花を飾って華やかにする', '懐かしいレトロゲームをしたい', '休日の知らない路地を歩きたい'],
  '16': ['休日に家で気になるドラマを見たい', '旅先で星空を長時間露光してみたい', '週末は高尾山へハイキングに行きたい', '音声ガイドを借りて解説を聞きたい', '夕暮れの河川敷でギターを弾いてた', '合唱団でみんなと声を重ねてみたい', '海辺でウクレレを陽気に弾いてみたい', 'オンラインで協力して敵を倒したい', '休日にソファで話題のパズルを解いた', '仕事帰りに小劇場で演劇を観たい'],
};
const lenSample = typeof window !== 'undefined' && typeof window.location?.search === 'string' ? /[?&]len=(\d+)/.exec(window.location.search)?.[1] : undefined;

// 川の配合（決定 2026-10-14。設計書 A.「倉庫と箱」）：泡10個のうち、自分の箱（よく拾う行動の箱）3・知らない箱（まだ拾ったことのない行動の箱）3・
// 気持ちとそのほかの箱4（ユーザー「流れる言葉が行動多すぎない？」→ 案A。前は 4・3・3）。自分の箱は「流れた回数のうち何回拾ったか」で重みを付ける。使いはじめ（自分の箱がない）は、3の分も知らない箱から
export const MIX_OWN = 0.3;
export const MIX_UNKNOWN = 0.3;
const ACTION_BOXES = BOXES.filter((b) => isActionBox(b.id)).map((b) => b.id);
const FEEL_BOXES = BOXES.filter((b) => !isActionBox(b.id)).map((b) => b.id);
let myBoxes: { box: number; weight: number }[] = [];
export function setMyBoxes(stats: Map<number, { picked: number; shown: number }>) {
  myBoxes = [...stats]
    .filter(([b, s]) => isActionBox(b) && s.picked > 0)
    .map(([box, s]) => ({ box, weight: (s.picked + 1) / (s.shown + 10) }));
}
function pickBoxWord(): { word: string; frame: Frame } | null {
  const x = Math.random();
  let box: number, frame: Frame;
  if (x < MIX_OWN && myBoxes.length) {
    const tot = myBoxes.reduce((a, b) => a + b.weight, 0);
    let y = Math.random() * tot, i = 0;
    while (i < myBoxes.length - 1 && (y -= myBoxes[i].weight) > 0) i++;
    box = myBoxes[i].box;
    frame = 'like';
  } else if (x < MIX_OWN + MIX_UNKNOWN || (x < MIX_OWN && !myBoxes.length)) {
    const known = new Set(myBoxes.map((b) => b.box));
    const unknown = ACTION_BOXES.filter((b) => !known.has(b) && boxWords(b).length);
    const list = unknown.length ? unknown : ACTION_BOXES;
    box = list[Math.floor(Math.random() * list.length)];
    frame = 'find';
  } else {
    box = FEEL_BOXES[Math.floor(Math.random() * FEEL_BOXES.length)];
    frame = 'even';
  }
  const words = boxWords(box);
  if (!words.length) return null;
  return { word: words[Math.floor(Math.random() * words.length)], frame };
}

export function pickRiverWord(): { word: string; frame: Frame } {
  if (warehouseReady()) {
    const now = Date.now();
    answers = answers.filter((a) => a.until > now);
    const a = answers.find((x) => now - x.triedAt > 1000);
    if (a) {
      a.triedAt = now;
      return { word: a.word, frame: 'answer' };
    }
    for (let i = 0; i < 5; i++) {
      const p = pickBoxWord();
      if (p) return p;
    }
  }
  if (lenSample && LEN_SAMPLES[lenSample]) {
    const list = LEN_SAMPLES[lenSample];
    return { word: list[Math.floor(Math.random() * list.length)], frame: 'even' };
  }
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
