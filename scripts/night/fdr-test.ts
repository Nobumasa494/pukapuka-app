/// <reference types="node" />
// 線の決め方を比べる：「1%」「点線だけ2%」と、FDR（偽発見率）で決める方法（ベンジャミニ・ホッホベルク法）
// FDR：「出した線のうち、偽物の割合を q までにする」と先に決め、試した組の数に合わせて、通す基準を自動で決める
// 使い方: npx tsx scripts/night/fdr-test.ts [人数=100]
import { makeDemoCaptures } from '../../src/demoPersona';
import { chanceOfAtLeast, cooccurrence, fdrLinks, labelGroups, MIN_CO } from '../../src/communities';
import { dayKey } from '../../src/period';
import { type Cap, daysFor, kind, PLANTED, shuffled } from './testkit';

type Pair = { a: string; b: string; count: number; p: number; strength: number };

// 全部の組の「偶然でもこれ以上重なる確率」（p）。試した組の数 m は、拾った言葉の、全部の2つ組
function pairs(caps: Cap[]) {
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
  const out: Pair[] = [];
  for (const { a, b, count } of cooccurrence(caps)) {
    if (count < MIN_CO) continue;
    const da = days.get(a)!.size;
    const db = days.get(b)!.size;
    out.push({ a, b, count, p: chanceOfAtLeast(lf, active.size, da, db, count), strength: count / Math.sqrt(da * db) });
  }
  const n = days.size;
  return { list: out, m: (n * (n - 1)) / 2, dayCount: (w: string) => days.get(w)?.size ?? 0 };
}

// ベンジャミニ・ホッホベルク法：p の小さい順に並べ、k 番目が (k/m)·q 以下になる、いちばん大きい k までを通す
function bh(list: Pair[], m: number, q: number) {
  const s = [...list].sort((x, y) => x.p - y.p);
  let k = 0;
  s.forEach((x, i) => {
    if (x.p <= ((i + 1) / m) * q) k = i + 1;
  });
  return s.slice(0, k);
}

type Rule = { name: string; pick: (caps: Cap[]) => { lines: Pair[]; crossOnly?: Pair[] } };
const rules: Rule[] = [
  { name: '1%（前）', pick: (c) => ({ lines: pairs(c).list.filter((x) => x.p < 0.01) }) },
  {
    name: '実線1%・点線2%（今）',
    pick: (c) => {
      const all = pairs(c).list;
      return { lines: all.filter((x) => x.p < 0.01), crossOnly: all.filter((x) => x.p >= 0.01 && x.p < 0.02) };
    },
  },
  ...[0.05, 0.1, 0.2].map((q) => ({ name: `FDR ${q * 100}%`, pick: (c: Cap[]) => ({ lines: bh(pairs(c).list, pairs(c).m, q) }) })),
  // タロンの方法で数える組を決めてから、FDR（正式）
  // タロンの方法＋FDR（正式）。アプリと同じ fdrLinks を使う
  ...[0.1, 0.2, 0.3].map((q) => ({ name: `FDR ${q * 100}%（タロン＝正式・アプリと同じ）`, pick: (c: Cap[]) => ({ lines: fdrLinks(c, q).map((l) => ({ ...l, p: 0 })) }) })),
  // 試した組を「一緒の日が2日以上ある組」だけと数える（ゆるい数え方）
  ...[0.1, 0.2].map((q) => ({ name: `FDR ${q * 100}%（2日以上の組だけ数える）`, pick: (c: Cap[]) => ({ lines: bh(pairs(c).list, pairs(c).list.length, q) }) })),
];

const N = Number(process.argv[2] ?? 100);
const days = daysFor(6);
for (const rule of rules) {
  let fake = 0, t = 0, cross = 0, zero = 0, plantedAll = 0, noiseCross = 0, noiseAll = 0, allLines = 0;
  for (let i = 0; i < N; i++) {
    const person = makeDemoCaptures(days, 2000 + i);
    // でたらめな人の線は、全部偽物
    const rnd = rule.pick(shuffled(person, 7000 + i));
    fake += rnd.lines.length + (rnd.crossOnly?.length ?? 0);
    const { lines, crossOnly = [] } = rule.pick(person);
    const counts = new Map<string, number>();
    for (const c of person) counts.set(c.word, (counts.get(c.word) ?? 0) + 1);
    const words = [...new Set(lines.flatMap((l) => [l.a, l.b]))].sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b));
    const g = labelGroups(words, lines, (w) => counts.get(w)!);
    const crossLines = [...lines.filter((l) => g.get(l.a) !== g.get(l.b)), ...crossOnly.filter((l) => g.has(l.a) && g.has(l.b) && g.get(l.a) !== g.get(l.b))];
    cross += crossLines.length;
    if (!crossLines.length) zero++;
    for (const l of lines) if (kind(l.a, l.b) === 'true') t++;
    for (const l of lines) if (kind(l.a, l.b) === 'noise') noiseAll++;
    allLines += lines.length;
    for (const l of [...lines, ...crossOnly]) if (PLANTED.has(`${l.a}\n${l.b}`)) plantedAll++;
    for (const l of crossLines) {
      if (kind(l.a, l.b) === 'noise') noiseCross++;
    }
  }
  console.log(
    `${rule.name}\n  でたらめな人の偽の線 ${(fake / N).toFixed(1)}本  ダミーの人の本当の線 ${(t / N).toFixed(1)}本\n  点線 平均${(cross / N).toFixed(1)}本・0本の人${Math.round((100 * zero) / N)}%・点線のうち関係ない言葉 ${cross ? Math.round((100 * noiseCross) / cross) : 0}%・意外なつながりが見つかる ${(plantedAll / N).toFixed(2)}組/人\n  全部の線 ${(allLines / N).toFixed(1)}本・そのうち関係ない言葉の線 ${allLines ? ((100 * noiseAll) / allLines).toFixed(1) : 0}%`,
  );
}
