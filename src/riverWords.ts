// 川に流す言葉を選ぶ（SPEC 第2部 A.「その人向けの川」）。
// 見つける枠（FIND_SHARE）は全部の言葉から均等。残りは、その人の好みの量（convex/river.ts の weights）で選ぶ
import { WORD_LIST } from './words';

export const FIND_SHARE = 0.2; // 10個に2個（案）
export type Frame = 'even' | 'like' | 'find';

let weights: { word: string; weight: number }[] | null = null;
let total = 0;
export function setRiverWeights(list: { word: string; weight: number }[] | undefined) {
  weights = list && list.length ? list : null;
  total = weights ? weights.reduce((a, w) => a + w.weight, 0) : 0;
}

// 今、川に浮かんでいる言葉が、どの枠から来たか（同じ言葉は同時に流れないので、言葉で引ける）
const frames = new Map<string, Frame>();
export const frameOf = (word: string): Frame => frames.get(word) ?? 'even';

export function pickRiverWord(): { word: string; frame: Frame } {
  let word: string, frame: Frame;
  if (!weights) {
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
  frames.set(word, frame);
  return { word, frame };
}
