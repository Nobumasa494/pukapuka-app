// 川に流す言葉を選ぶ（SPEC 第2部 A.「その人向けの川」）。
// 見つける枠（FIND_SHARE）は全部の言葉から均等。残りは、その人の好みの量（convex/river.ts の weights）で選ぶ
import { WORD_CATEGORY, WORD_LIST } from './words';
import { isGenki } from './flow';

type AiWord = { text: string; category: string; parent: string; kind: 'near' | 'abstract' };

export const FIND_SHARE = 0.2; // 10個に2個（案）
export type Frame = 'even' | 'like' | 'find' | 'gather';

// 拾いやすくする時間（決定 2026-10-11、ユーザーが A を選んだ）：その日はじめて川を開いたら、しばらく
// していることと元気・好奇心の言葉を多めに流す。散歩した日に「散歩」が、わくわくした日に「わくわく」が流れてこないと、夜明けが気づけないため。
// 毎日同じように起きるので「何のあとに何」にはならない
export const GATHER_SEC = 90; // 案
export const GATHER_SHARE = 0.6; // この間、泡の6割（案）
export const GATHER_WORDS: readonly string[] = WORD_LIST.filter((w) => WORD_CATEGORY[w] === 'doing' || isGenki(w));
let gatherUntil = 0;
export const startGather = (now = Date.now()) => (gatherUntil = now + GATHER_SEC * 1000);

// AI の細かい言葉（決定 2026-10-11）：好みの枠（like）で元の言葉を選んだあと、一部をその細かい言葉に置きかえる。
// どの細かい言葉かは均等。つらい気持ちはあまり置きかえない（案）。見つける枠・拾いやすくする時間は決まった言葉のまま
export const AI_SHARE = 0.5; // 案
export const AI_SHARE_HARD_FEELING = 0.15; // 案
const children = new Map<string, string[]>();
export function setRiverAiWords(list: AiWord[]) {
  children.clear();
  for (const w of list) children.set(w.parent, [...(children.get(w.parent) ?? []), w.text]);
}
const isHardFeeling = (w: string) => WORD_CATEGORY[w] === 'emotion' && !isGenki(w);
function withAiWord(word: string): string {
  const kids = children.get(word);
  if (!kids?.length) return word;
  if (Math.random() >= (isHardFeeling(word) ? AI_SHARE_HARD_FEELING : AI_SHARE)) return word;
  return kids[Math.floor(Math.random() * kids.length)];
}

let weights: { word: string; weight: number }[] | null = null;
let total = 0;
// Convex から来るのは、1倍より多く流す言葉だけ。ほかの言葉は1倍で足す。null・undefined はまだ好みがない（均等）
export function setRiverWeights(list: { word: string; weight: number }[] | null | undefined) {
  if (!list) {
    weights = null;
    total = 0;
    return;
  }
  const more = new Map(list.map((w) => [w.word, w.weight]));
  weights = WORD_LIST.map((word) => ({ word, weight: more.get(word) ?? 1 }));
  total = weights.reduce((a, w) => a + w.weight, 0);
}

// 今、川に浮かんでいる言葉が、どの枠から来たか（同じ言葉は同時に流れないので、言葉で引ける）。
// 泡が実際に浮かんだときにだけ覚える（選んだのに浮かべられなかった言葉で、浮かんでいる泡の枠を上書きしないため）
const frames = new Map<string, Frame>();
const pending = new Map<string, Frame>();
export const frameOf = (word: string): Frame => frames.get(word) ?? 'even';
export const chooseFrame = (word: string, frame: Frame) => pending.set(word, frame); // 流そうと選んだ
export const floated = (word: string) => frames.set(word, pending.get(word) ?? 'even'); // 浮かんだ

export function pickRiverWord(): { word: string; frame: Frame } {
  let word: string, frame: Frame;
  if (Date.now() < gatherUntil && Math.random() < GATHER_SHARE) {
    word = GATHER_WORDS[Math.floor(Math.random() * GATHER_WORDS.length)];
    frame = 'gather';
  } else if (!weights) {
    word = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
    frame = 'even'; // 好みがまだ読めていない（開いた直後・ダミーでない web など）
  } else if (Math.random() < FIND_SHARE) {
    word = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
    frame = 'find';
  } else {
    let x = Math.random() * total, i = 0;
    while (i < weights.length - 1 && (x -= weights[i].weight) > 0) i++;
    word = withAiWord(weights[i].word);
    frame = 'like';
  }
  return { word, frame };
}
