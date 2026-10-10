/// <reference types="node" />
// くり返すめぐり（A ⇄ B）の厳しさと期間を、2種類の人で比べる（数字の根拠 A）
// 使い方: npx tsx scripts/me/loop-test.ts [人数=60]
// - でたらめな人：見本の人の日の並びをばらばらにした人。出ためぐりはすべて偽物
// - めぐりのある人：見本の人に「焦り → 次の日 後悔 → 次の日 焦り …」の続きを、ときどき（週に1回ほど）足した人。本当のめぐりは 焦り⇄後悔
import { makeDemoCaptures, type DemoDay } from '../../src/demoPersona';
import { dayNumber, loopsTested } from '../../src/flow';

type Cap = { word: string; strength: number; capturedAt: number };
const rng = (seed: number) => { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
function daysFor(weeks: number): DemoDay[] {
  const out: DemoDay[] = []; const t = new Date(2026, 9, 9);
  for (let d = weeks * 7 - 1; d >= 0; d--) { const x = new Date(t.getFullYear(), t.getMonth(), t.getDate() - d); out.push({ start: x.getTime(), dow: x.getDay() }); }
  return out;
}
function shuffleDays(caps: Cap[], seed: number): Cap[] {
  const r = rng(seed);
  const days = [...new Set(caps.map((c) => dayNumber(c.capturedAt)))];
  const to = days.slice();
  for (let i = to.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [to[i], to[j]] = [to[j], to[i]]; }
  const map = new Map(days.map((d, i) => [d, to[i]]));
  return caps.map((c) => ({ ...c, capturedAt: c.capturedAt + (map.get(dayNumber(c.capturedAt))! - dayNumber(c.capturedAt)) * 86400000 }));
}
function withLoop(caps: Cap[], days: DemoDay[], seed: number): Cap[] {
  const r = rng(seed); const out = caps.slice();
  for (let i = 0; i < days.length; i++) {
    if (r() >= 0.15) continue;
    let k = i, w = '焦り';
    while (k < days.length) {
      out.push({ word: w, strength: 0.6, capturedAt: days[k].start + 20 * 3600000 });
      if (r() >= 0.6) break;
      k++; w = w === '焦り' ? '後悔' : '焦り';
    }
  }
  return out;
}
const N = Number(process.argv[2] ?? 60);
console.log('期間 厳しさ 重さ | でたらめな人に偽のめぐり | めぐりのある人で 焦り⇄後悔 が出た・ほかのめぐり');
for (const weeks of [3, 6, 12]) for (const [alpha, minW] of [[0.1, 2], [0.3, 2], [0.1, 1]] as const) {
  let fake = 0, hit = 0, others = 0;
  for (let i = 0; i < N; i++) {
    const days = daysFor(weeks); const base = makeDemoCaptures(days, 6000 + i);
    if (loopsTested(shuffleDays(base, 3 + i), alpha, minW).length) fake++;
    const l = loopsTested(withLoop(base, days, 50 + i), alpha, minW);
    if (l.some((x) => x.a + x.b === '後悔焦り' || x.a + x.b === '焦り後悔')) hit++;
    others += l.filter((x) => !(x.a + x.b === '後悔焦り' || x.a + x.b === '焦り後悔')).length;
  }
  console.log(`${String(weeks).padStart(2)}週 ${alpha * 100}% 重さ${minW} | ${Math.round((fake / N) * 100)}% | ${Math.round((hit / N) * 100)}%・ほか ${(others / N).toFixed(2)}`);
}
