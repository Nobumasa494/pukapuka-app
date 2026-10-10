/// <reference types="node" />
// わたしのことのモック用に、見本の人（＋散歩の次の日にわくわく）の計算結果を JSON で書き出す
// 使い方: npx tsx scripts/me/mock-data.ts <出力.json> [週=12]
import { writeFileSync } from 'fs';
import { makeDemoCaptures, type DemoDay } from '../../src/demoPersona';
import { cycles, dayNumber, growth, pageRank, significantFlow, topSource, isGenki, SOURCE_DAYS } from '../../src/flow';
import { WORD_CATEGORY } from '../../src/words';

export function demoWithFlow(weeks: number, seed = 418) {
  const days: DemoDay[] = []; const t = new Date(2026, 9, 10);
  for (let d = weeks * 7 - 1; d >= 0; d--) { const x = new Date(t.getFullYear(), t.getMonth(), t.getDate() - d); days.push({ start: x.getTime(), dow: x.getDay() }); }
  const caps = makeDemoCaptures(days, seed);
  let s = seed;
  const r = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const walk = new Set(caps.filter((c) => c.word === '散歩').map((c) => dayNumber(c.capturedAt)));
  for (const d of days) if (walk.has(dayNumber(d.start)) && r() < 0.6) caps.push({ word: 'わくわく', strength: 0.7, capturedAt: d.start + 86400000 + 19 * 3600000 });
  return { caps, now: days[days.length - 1].start + 21 * 3600000 };
}

const weeks = Number(process.argv[3] ?? 12);
const { caps, now } = demoWithFlow(weeks);
const recent = caps.filter((c) => dayNumber(now) - dayNumber(c.capturedAt) < SOURCE_DAYS);
const flow = significantFlow(recent);
const pr = [...pageRank(flow.arrows)].sort((a, b) => b[1] - a[1]);
const prFeel = pr.filter(([w]) => WORD_CATEGORY[w] === 'emotion' || WORD_CATEGORY[w] === 'body');
// 週の終わりごとに、いちばん上の源がどの段階だったか（育ちのグラフの印に使う）
const stages = out0();
function out0() {
  const res: { label: string; stage: string; word?: string }[] = [];
  const end = now;
  for (let k = weeks - 1; k >= 0; k--) {
    const t = end - k * 7 * 86400000;
    const st = topSource(caps.filter((c) => c.capturedAt <= t), t);
    res.push({ label: `${new Date(t).getMonth() + 1}/${new Date(t).getDate()}`, stage: st.stage, word: 'word' in st ? st.word : undefined });
  }
  return res;
}
const out = {
  stages,
  weeks,
  top: topSource(caps, now),
  arrows: flow.arrows.length,
  cycles: cycles(flow.arrows),
  pagerank: prFeel.slice(0, 5),
  week: growth(caps, 'week').map((g) => ({ ...g, label: `${new Date(g.start).getMonth() + 1}/${new Date(g.start).getDate()}` })),
  month: growth(caps, 'month').map((g) => ({ ...g, label: `${new Date(g.start).getMonth() + 1}月` })),
  genkiShare: recent.filter((c) => isGenki(c.word)).length / recent.length,
};
writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, week: out.week.length, month: out.month }, null, 1));
