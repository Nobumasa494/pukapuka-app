/// <reference types="node" />
// アプリの計算（src/flow.ts）と、Python の別の計算（check.py。NetworkX を使う）を比べるための、記録と答えを書き出す
// 使い方: npx tsx scripts/me/crosscheck/export.ts <フォルダ> → uv run --no-project --with networkx,scipy python3 scripts/me/crosscheck/check.py <フォルダ>/cases.json
import { writeFileSync } from 'fs';
import { makeDemoCaptures, type DemoDay } from '../../../src/demoPersona';
import { arrows, genkiSources, pageRank, cycles, growth } from '../../../src/flow';
const days: DemoDay[] = []; const t = new Date(2026, 9, 9);
for (let d = 89; d >= 0; d--) { const x = new Date(t.getFullYear(), t.getMonth(), t.getDate() - d); days.push({ start: x.getTime(), dow: x.getDay() }); }
const cases: Record<string, { word: string; capturedAt: number }[]> = {};
for (const s of [2000, 2001, 2002, 463]) cases[`demo90days_${s}`] = makeDemoCaptures(days, s);
cases.demo14days = makeDemoCaptures(days.slice(-14), 2000);
cases.demo4days = makeDemoCaptures(days.slice(-4), 2001);
const out: Record<string, unknown> = {};
for (const [k, c] of Object.entries(cases)) {
  const list = arrows(c);
  out[k] = {
    caps: c.map((x) => ({ w: x.word, t: x.capturedAt })),
    app: {
      arrows: list.map((a) => [a.from, a.to, a.weight]),
      sources: genkiSources(list).map((s) => [s.word, s.weight]),
      pagerank: Object.fromEntries(pageRank(list)),
      cycles: cycles(list),
      week: growth(c, 'week').map((g) => [g.start, g.total, g.ratio]),
      month: growth(c, 'month').map((g) => [g.start, g.total, g.ratio]),
    },
  };
}
writeFileSync(process.argv[2] + '/cases.json', JSON.stringify(out));
