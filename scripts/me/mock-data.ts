/// <reference types="node" />
// わたしのことのモック用に、見本の人（＋散歩の次の日にわくわく）の計算結果を JSON で書き出す
// 使い方: npx tsx scripts/me/mock-data.ts <出力.json> [週=12]
import { writeFileSync } from 'fs';
import { makeDemoCaptures, type DemoDay } from '../../src/demoPersona';
import { dayNumber, growth, topSource, loopList, sourceList, growthStory, genkiShift, isGenki, SOURCE_DAYS } from '../../src/flow';

export function demoWithFlow(weeks: number, seed = 418) {
  const days: DemoDay[] = []; const t = new Date(2026, 9, 10);
  for (let d = weeks * 7 - 1; d >= 0; d--) { const x = new Date(t.getFullYear(), t.getMonth(), t.getDate() - d); days.push({ start: x.getTime(), dow: x.getDay() }); }
  const caps = makeDemoCaptures(days, seed);
  let s = seed;
  const r = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const walk = new Set(caps.filter((c) => c.word === '散歩').map((c) => dayNumber(c.capturedAt)));
  for (const d of days) if (walk.has(dayNumber(d.start)) && r() < 0.6) caps.push({ word: 'わくわく', strength: 0.7, capturedAt: d.start + 86400000 + 19 * 3600000 });
  // 育つ人：はじめは「ほっとした・穏やか」の元気が多く、だんだん「もっと知りたい・やってみたい」が増える。後半は料理の次の日に「もっと知りたい」
  days.forEach((d, i) => {
    const f = i / days.length;
    if (r() < 0.35 * (1 - f)) caps.push({ word: r() < 0.5 ? 'ほっとした' : '穏やか', strength: 0.5, capturedAt: d.start + 20 * 3600000 });
    if (r() < 0.45 * f) caps.push({ word: r() < 0.5 ? 'もっと知りたい' : 'やってみたい', strength: 0.6, capturedAt: d.start + 20 * 3600000 });
    if (f > 0.5 && r() < 0.3) {
      caps.push({ word: '料理', strength: 0.5, capturedAt: d.start + 19 * 3600000 });
      if (r() < 0.7) caps.push({ word: 'もっと知りたい', strength: 0.6, capturedAt: d.start + 86400000 + 19 * 3600000 });
    }
  });
  return { caps, now: days[days.length - 1].start + 21 * 3600000 };
}

const weeks = Number(process.argv[3] ?? 12);
const { caps, now } = demoWithFlow(weeks);
const recent = caps.filter((c) => dayNumber(now) - dayNumber(c.capturedAt) < SOURCE_DAYS);
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
// 数字の欄：源の言葉を拾った日のうち、次の日に元気・好奇心の言葉を拾った日（直近12週）
const byDay = new Map<number, Set<string>>();
for (const c of recent) { const d = dayNumber(c.capturedAt); if (!byDay.has(d)) byDay.set(d, new Set()); byDay.get(d)!.add(c.word); }
const top0 = topSource(caps, now);
const srcDays = 'word' in top0 ? [...byDay].filter(([, w]) => w.has(top0.word)).map(([d]) => d) : [];
const nextGenki = srcDays.filter((d) => [...(byDay.get(d + 1) ?? [])].some(isGenki)).length;
const allDays = [...byDay.keys()];
const baseRate = allDays.filter((d) => [...(byDay.get(d + 1) ?? [])].some(isGenki)).length / allDays.length;
const sl = sourceList(caps, now);
const out = {
  list: 'list' in sl ? sl.list : [],
  topItem: 'top' in sl ? sl.top : null,
  loops: loopList(caps, now),
  story: growthStory(caps, now).map((e) => ({ ...e, label: `${new Date(e.at).getMonth() + 1}月${new Date(e.at).getDate()}日` })),
  shift: genkiShift(caps, now),
  numbers: { srcDays: srcDays.length, nextGenki, baseRate },
  stages,
  weeks,
  top: topSource(caps, now),
  week: growth(caps, 'week').map((g) => ({ ...g, label: `${new Date(g.start).getMonth() + 1}/${new Date(g.start).getDate()}` })),
  month: growth(caps, 'month').map((g) => ({ ...g, label: `${new Date(g.start).getMonth() + 1}月` })),
  genkiShare: recent.filter((c) => isGenki(c.word)).length / recent.length,
};
writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, week: out.week.length, month: out.month }, null, 1));
