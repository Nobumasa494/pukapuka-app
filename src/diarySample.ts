// 日記の見本（保存しない）。今日から数えた日に、仮の日記を置く。カレンダーの印と、振り返りの見え方を見せるため
import { dayKey } from './period';
import type { DiaryEntry } from './useDiary';

const DAY = 86400000;
const SAMPLE: [ago: number, text: string][] = [
  [0, '帰りに川沿いを遠回りした。夕日がきれいで、しばらく見ていた。'],
  [1, '仕事がばたばたした日。夜は早めに寝る。'],
  [3, '友だちとカレーを作った。スパイスを3つ足したら、思ったよりおいしくなった。\nまた作りたい。'],
  [6, '雨。コーヒーを入れて、本を少し読んだ。'],
  [7, '新しいカフェに行ってみた。窓ぎわの席が静かだった。'],
  [12, '久しぶりに絵を描いた。うまくはないけど、楽しかった。'],
  [16, '会議が長かった。帰り道の風が気持ちよかった。'],
  [23, '家族と電話した。'],
  [30, '朝、少し散歩してから出かけた。いつもより頭がすっきりしていた。'],
];

export function diarySample(now: number): DiaryEntry[] {
  return SAMPLE.map(([ago, text]) => ({ day: dayKey(now - ago * DAY), text, savedAt: now - ago * DAY }));
}
