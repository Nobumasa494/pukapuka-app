// わたしのことの「見本」（アプリは前もって計算した src/meSampleResult.json を使う。作り直しは scripts/me/make-sample.ts）：まだ何も出ない間に見られる、ダミーの人の12週ぶん（自分の記録ではない）。RN に依存しない。
// 見本の人：ふだんの見本の人（src/demoPersona.ts）に、
//  ・散歩した次の日に、6割で「わくわく」を拾う（→ いちばん上に「散歩」が出る）
//  ・はじめは「ほっとした・穏やか」の元気が多く、だんだん「もっと知りたい・やってみたい」が増える（→ 元気の中身が変わる）
//  ・後半は、料理した次の日に「もっと知りたい」
// を足した人。毎日同じ形にするため、決まった日（ANCHOR）までの12週を決まった種（SEED）で作り、その日の結果を計算する。
// 画面に出す日付だけを、今日までずらす（記録そのものをずらすと曜日が変わり、日によって結果が変わった。2026-10-10）
import { makeDemoCaptures, type DemoDay } from './demoPersona';
import { dayNumber, SOURCE_DAYS } from './flow';

const SEED = 418;
const ANCHOR = new Date(2026, 9, 10);

export function meSample(now: number): { captures: { word: string; capturedAt: number }[]; at: number; shiftDays: number } {
  const days: DemoDay[] = [];
  for (let d = SOURCE_DAYS - 1; d >= 0; d--) {
    const x = new Date(ANCHOR.getFullYear(), ANCHOR.getMonth(), ANCHOR.getDate() - d);
    days.push({ start: x.getTime(), dow: x.getDay() });
  }
  const caps = makeDemoCaptures(days, SEED);
  let s = SEED;
  const r = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const walk = new Set(caps.filter((c) => c.word === '散歩').map((c) => dayNumber(c.capturedAt)));
  for (const d of days) if (walk.has(dayNumber(d.start)) && r() < 0.6) caps.push({ word: 'わくわく', strength: 0.7, capturedAt: d.start + 86400000 + 19 * 3600000 });
  days.forEach((d, i) => {
    const f = i / days.length;
    if (r() < 0.35 * (1 - f)) caps.push({ word: r() < 0.5 ? 'ほっとした' : '穏やか', strength: 0.5, capturedAt: d.start + 20 * 3600000 });
    if (r() < 0.45 * f) caps.push({ word: r() < 0.5 ? 'もっと知りたい' : 'やってみたい', strength: 0.6, capturedAt: d.start + 20 * 3600000 });
    if (f > 0.5 && r() < 0.3) {
      caps.push({ word: '料理', strength: 0.5, capturedAt: d.start + 19 * 3600000 });
      if (r() < 0.7) caps.push({ word: 'もっと知りたい', strength: 0.6, capturedAt: d.start + 86400000 + 19 * 3600000 });
    }
  });
  const at = days[days.length - 1].start + 22 * 3600000; // ANCHOR の日の夜に開いたことにする
  const today = new Date(now);
  const shiftDays = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - ANCHOR.getTime()) / 86400000);
  return { captures: caps.filter((c) => c.capturedAt <= at).map((c) => ({ word: c.word, capturedAt: c.capturedAt })), at, shiftDays };
}
