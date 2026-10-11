// 川に流す言葉を選ぶ（SPEC 第2部 A.「その人向けの川」）。
// 見つける枠（FIND_SHARE）は全部の言葉から均等。残りは、その人の好みの量（convex/river.ts の weights）で選ぶ
import { WORD_CATEGORY, WORD_LIST } from './words';
import { isGenki } from './flow';

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

let weights: { word: string; weight: number }[] | null = null;
let total = 0;
export function setRiverWeights(list: { word: string; weight: number }[] | undefined) {
  weights = list && list.length ? list : null;
  total = weights ? weights.reduce((a, w) => a + w.weight, 0) : 0;
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
    word = weights[i].word;
    frame = 'like';
  }
  return { word, frame };
}
