/// <reference types="node" />
// わたしのことの「偶然より、はっきり多い」の厳しさ（FLOW_ALPHA）と期間を、2種類の人で比べる（数字の根拠 A）
// 使い方: npx tsx scripts/me/tune-test.ts [人数=30]
// - でたらめな人：見本の人の記録から、日の並びだけをばらばらにした人。日をまたいだ流れはないので、出た源・矢印・めぐりはすべて偽物
// - 流れのある人：見本の人に「散歩の次の日、6割で『わくわく』を拾う」を足した人。本当の源は「散歩」
// 本物の記録がたまったら、同じ試しをやり直す
import { makeDemoCaptures, type DemoDay } from '../../src/demoPersona';
import { significantFlow, cycles, dayNumber, isGenki } from '../../src/flow';

type Cap = { word: string; strength: number; capturedAt: number };
function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
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
function withFlow(caps: Cap[], seed: number): Cap[] {
  const r = rng(seed);
  const out = caps.slice();
  const walkDays = new Set(caps.filter((c) => c.word === '散歩').map((c) => dayNumber(c.capturedAt)));
  const recorded = new Set(caps.map((c) => dayNumber(c.capturedAt)));
  for (const d of walkDays) if (recorded.has(d + 1) && r() < 0.6) out.push({ word: 'わくわく', strength: 0.7, capturedAt: d * 86400000 + 86400000 + 12 * 3600000 + new Date().getTimezoneOffset() * 60000 });
  return out;
}

// 源の決め方（2通りを比べる）
//  合計：元気・好奇心の言葉への矢印を全部足して、偶然と比べる（significantFlow の sources）
//  1本：元気・好奇心の言葉への矢印が1本でも偶然より多ければ源（矢印の重さ minW 以上だけ。1回きりの偶然を出さない）
const arrowSources = (f: ReturnType<typeof significantFlow>, minW: number) =>
  [...new Set(f.arrows.filter((a) => isGenki(a.to) && a.weight >= minW).sort((x, y) => x.p - y.p || y.weight - x.weight).map((a) => a.from))];

const PEOPLE = Number(process.argv[2] ?? 30);
const ALPHAS = [0.01, 0.005];
const WEEKS = [4, 6, 8, 12];
const METHODS: [string, (f: ReturnType<typeof significantFlow>) => string[]][] = [
  ['合計', (f) => f.sources.map((s) => s.word)],
  ['1本', (f) => arrowSources(f, 0)],
  ['1本・重さ2以上', (f) => arrowSources(f, 2)],
  ['1本・重さ3以上', (f) => arrowSources(f, 3)],
];
console.log('期間  厳しさ  決め方 | でたらめな人：偽の源・偽のめぐりの最大語数 | 流れのある人：散歩が源に出た割合・散歩の順位・ほかの源');
for (const weeks of WEEKS)
  for (const alpha of ALPHAS) {
    const acc = METHODS.map(() => ({ fakeSrc: 0, fakeCyc: 0, found: 0, rankSum: 0, others: 0 }));
    for (let i = 0; i < PEOPLE; i++) {
      const base = makeDemoCaptures(daysFor(weeks), 3000 + i);
      const f = significantFlow(shuffleDays(base, 7 + i), alpha);
      const t = significantFlow(withFlow(base, 11 + i), alpha);
      const cyc = Math.max(0, ...cycles(f.arrows).map((c) => c.length));
      METHODS.forEach(([, m], j) => {
        acc[j].fakeSrc += m(f).length; acc[j].fakeCyc += cyc;
        const src = m(t); const k = src.indexOf('散歩');
        if (k >= 0) { acc[j].found++; acc[j].rankSum += k + 1; }
        acc[j].others += src.filter((w) => w !== '散歩').length;
      });
    }
    const n = PEOPLE;
    METHODS.forEach(([name], j) => {
      const a = acc[j];
      console.log(`${String(weeks).padStart(2)}週  ${(alpha * 100).toFixed(1)}%  ${name.padEnd(8, '　')} | 偽の源 ${(a.fakeSrc / n).toFixed(2)}・めぐり ${(a.fakeCyc / n).toFixed(1)}語 | 散歩 ${Math.round((a.found / n) * 100)}%・順位 ${a.found ? (a.rankSum / a.found).toFixed(1) : '-'}・ほか ${(a.others / n).toFixed(1)}`);
    });
  }
