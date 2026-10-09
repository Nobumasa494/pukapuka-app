/// <reference types="node" />
// 夜空の線の条件（検定の値・一緒の日の下限・期間）を、ダミーの人で総当たりして比べる（数字の根拠 A）
// 使い方: npx tsx scripts/night/tune-test.ts [人数=100]
// - ダミーの人（src/demoPersona.ts）：本当のつながり＝同じテーマの言葉どうし＋わざと混ぜた3組。関係のない言葉（NOISE）の線は偽物
// - でたらめな人：ダミーの人と、日ごとの拾う数・言葉の拾われやすさは同じで、組み合わせだけをばらばらにした人。出た線はすべて偽物
// 本物の記録がたまったら、同じ試しをやり直す（ダミーに合わせすぎないように）
import { makeDemoCaptures } from '../../src/demoPersona';
import { type Cap, daysFor, kind, shuffled } from './testkit';
import { chanceOfAtLeast, cooccurrence } from '../../src/communities';
import { dayKey } from '../../src/period';

// 本番の significantLinks と同じ計算。下限 minCo を変えられるようにしたもの
function links(caps: Cap[], alpha: number, minCo: number) {
  const days = new Map<string, Set<string>>();
  const active = new Set<string>();
  for (const c of caps) {
    const k = dayKey(c.capturedAt);
    active.add(k);
    if (!days.has(c.word)) days.set(c.word, new Set());
    days.get(c.word)!.add(k);
  }
  const lf = [0];
  for (let i = 1; i <= active.size; i++) lf[i] = lf[i - 1] + Math.log(i);
  const out: { a: string; b: string }[] = [];
  for (const { a, b, count } of cooccurrence(caps)) {
    if (count < minCo) continue;
    if (chanceOfAtLeast(lf, active.size, days.get(a)!.size, days.get(b)!.size, count) >= alpha) continue;
    out.push({ a, b });
  }
  return out;
}

const PEOPLE = Number(process.argv[2] ?? 100);
const ALPHAS = [0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.001];
const MINCOS = [1, 2, 3];
const WEEKS = [2, 4, 6, 8];

type Row = { weeks: number; minCo: number; alpha: number; fakeRandom: number; trueLines: number; noiseLines: number; mixedLines: number };
const rows: Row[] = [];
for (const weeks of WEEKS) {
  const people = Array.from({ length: PEOPLE }, (_, i) => makeDemoCaptures(daysFor(weeks), 1000 + i));
  const randoms = people.map((p, i) => shuffled(p, 5000 + i));
  for (const minCo of MINCOS)
    for (const alpha of ALPHAS) {
      let fr = 0, t = 0, n = 0, m = 0;
      for (const p of randoms) fr += links(p, alpha, minCo).length;
      for (const p of people)
        for (const l of links(p, alpha, minCo)) {
          const k = kind(l.a, l.b);
          if (k === 'true') t++;
          else if (k === 'noise') n++;
          else m++;
        }
      rows.push({ weeks, minCo, alpha, fakeRandom: fr / PEOPLE, trueLines: t / PEOPLE, noiseLines: n / PEOPLE, mixedLines: m / PEOPLE });
    }
}
console.log(JSON.stringify(rows));
