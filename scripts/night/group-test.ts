/// <reference types="node" />
// 星座分けの方法を比べる（今のラベル伝播 と モジュラリティ＝ルーヴァン法）。アプリは変えずに、ダミーの人で測る
// 使い方: npx tsx scripts/night/group-test.ts [人数=100]
// 測ること：わざと混ぜた「意外なつながり」（散歩–ひらめいた など3組）が、点線になる割合／1人あたりの点線の数／星座の数と大きさ
import { makeDemoCaptures, type DemoDay } from '../../src/demoPersona';
import { labelGroups, significantLinks, type Link } from '../../src/communities';
import { aggregate } from '../../src/wordCloud';
import { NORMAL_CAPS, WIDE_CAPS } from '../../src/constellation';

type Grouper = (words: string[], links: Link[], weightOf: (w: string) => number) => Map<string, number>;

// ルーヴァン法：まとまりのよさ（モジュラリティ）が上がるかぎり、言葉を隣のまとまりへ動かす → まとまりを1つの点にまとめて、くり返す。
// 重み＝つながりの強さ。resolution が大きいほど、細かく分かれる。順番は words の順（毎回同じ結果）
export function louvain(words: string[], links: Link[], resolution = 1): Map<string, number> {
  let nodes = words.map((w) => [w]); // 今の点ごとの、元の言葉
  let edges = links.map((l) => ({ a: words.indexOf(l.a), b: words.indexOf(l.b), w: l.strength })).filter((e) => e.a >= 0 && e.b >= 0);
  for (let level = 0; level < 10; level++) {
    const n = nodes.length;
    const adj: Map<number, number>[] = Array.from({ length: n }, () => new Map());
    const k = new Array<number>(n).fill(0); // 点ごとの重みの合計（まとめた点の、中の線も入れる）
    let m2 = 0; // 重みの合計 ×2
    for (const e of edges) {
      m2 += 2 * e.w;
      if (e.a === e.b) {
        k[e.a] += 2 * e.w; // まとめた点の中の線
        continue;
      }
      adj[e.a].set(e.b, (adj[e.a].get(e.b) ?? 0) + e.w);
      adj[e.b].set(e.a, (adj[e.b].get(e.a) ?? 0) + e.w);
      k[e.a] += e.w;
      k[e.b] += e.w;
    }
    if (m2 === 0) break;
    const com = Array.from({ length: n }, (_, i) => i);
    const tot = [...k];
    let moved = true;
    let any = false;
    for (let pass = 0; moved && pass < 50; pass++) {
      moved = false;
      for (let i = 0; i < n; i++) {
        const ci = com[i];
        const toCom = new Map<number, number>();
        for (const [j, w] of adj[i]) if (j !== i) toCom.set(com[j], (toCom.get(com[j]) ?? 0) + w);
        tot[ci] -= k[i];
        let best = ci;
        let bestGain = (toCom.get(ci) ?? 0) - (resolution * tot[ci] * k[i]) / m2;
        for (const [c, w] of toCom) {
          const gain = w - (resolution * tot[c] * k[i]) / m2;
          if (gain > bestGain + 1e-12) {
            best = c;
            bestGain = gain;
          }
        }
        tot[best] += k[i];
        if (best !== ci) {
          com[i] = best;
          moved = true;
          any = true;
        }
      }
    }
    if (!any) break;
    const ids = [...new Set(com)];
    const idx = new Map(ids.map((c, i) => [c, i]));
    const next: string[][] = ids.map(() => []);
    nodes.forEach((ws, i) => next[idx.get(com[i])!].push(...ws));
    const agg = new Map<string, number>();
    for (const e of edges) {
      const a = idx.get(com[e.a])!;
      const b = idx.get(com[e.b])!;
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      agg.set(key, (agg.get(key) ?? 0) + e.w);
    }
    nodes = next;
    edges = [...agg].map(([key, w]) => {
      const [a, b] = key.split('-').map(Number);
      return { a, b, w };
    });
  }
  const out = new Map<string, number>();
  nodes.forEach((ws, g) => ws.forEach((w) => out.set(w, g)));
  return out;
}

// selectConstellation と同じ流れで、星座分けだけ差し替える
function sky(captures: { word: string; strength: number; capturedAt: number }[], group: Grouper) {
  const all = aggregate(captures);
  const statOf = new Map(all.map((s) => [s.word, s]));
  const found = significantLinks(captures).filter((l) => statOf.has(l.a) && statOf.has(l.b));
  const linked = [...new Set(found.flatMap((l) => [l.a, l.b]))].sort((a, b) => statOf.get(b)!.count - statOf.get(a)!.count || a.localeCompare(b));
  const g = group(linked, found, (w) => statOf.get(w)!.count);
  const cand = found.map((l) => ({ ...l, cross: g.get(l.a) !== g.get(l.b) })).sort((p, q) => q.strength - p.strength || q.count - p.count);
  let cap = NORMAL_CAPS.stars;
  const pick = () => {
    const words = new Set<string>();
    const lines: typeof cand = [];
    let cut = false;
    for (const l of cand) {
      const add = (words.has(l.a) ? 0 : 1) + (words.has(l.b) ? 0 : 1);
      if (words.size + add > cap) {
        cut = true;
        continue;
      }
      words.add(l.a);
      words.add(l.b);
      lines.push(l);
    }
    return { lines, cut };
  };
  let r = pick();
  if (r.cut) {
    cap = WIDE_CAPS.stars;
    r = pick();
  }
  const inC = new Set(r.lines.filter((l) => !l.cross).flatMap((l) => [l.a, l.b]));
  const kept = r.lines.filter((l) => inC.has(l.a) && inC.has(l.b));
  // 星座＝実線でつながった星の集まり
  const par = new Map([...inC].map((w) => [w, w]));
  const f = (x: string): string => (par.get(x) === x ? x : f(par.get(x)!));
  for (const l of kept) if (!l.cross) par.set(f(l.a), f(l.b));
  const sizes = new Map<string, number>();
  for (const w of inC) sizes.set(f(w), (sizes.get(f(w)) ?? 0) + 1);
  return { kept, sizes: [...sizes.values()].sort((a, b) => b - a), stars: inC.size };
}

const PLANTED = new Set(['散歩\nひらめいた', 'ひらめいた\n散歩', '会議\nわくわく', 'わくわく\n会議', '疲れ\n絵を描く', '絵を描く\n疲れ']);
const days: DemoDay[] = [];
const anchor = new Date(2026, 9, 9);
for (let d = 41; d >= 0; d--) {
  const x = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - d);
  days.push({ start: x.getTime(), dow: x.getDay() });
}
const N = Number(process.argv[2] ?? 100);
const methods: [string, Grouper][] = [
  ['ラベル伝播（今）', labelGroups],
  ['モジュラリティ（細かさ 0.8）', (w, l) => louvain(w, l, 0.8)],
  ['モジュラリティ（細かさ 1.0）', (w, l) => louvain(w, l, 1.0)],
  ['モジュラリティ（細かさ 1.2）', (w, l) => louvain(w, l, 1.2)],
];
for (const [name, gr] of methods) {
  let pc = 0, ps = 0, cross = 0, zero = 0, ncon = 0, pairs = 0, stars = 0, maxc = 0;
  for (let i = 0; i < N; i++) {
    const r = sky(makeDemoCaptures(days, 2000 + i), gr);
    const c = r.kept.filter((l) => l.cross);
    cross += c.length;
    if (c.length === 0) zero++;
    for (const l of r.kept) if (PLANTED.has(`${l.a}\n${l.b}`)) (l.cross ? pc++ : ps++);
    ncon += r.sizes.length;
    pairs += r.sizes.filter((s) => s === 2).length;
    maxc += r.sizes[0] ?? 0;
    stars += r.stars;
  }
  const pt = pc + ps;
  console.log(`${name}\n  意外なつながりが点線になる: ${pt ? Math.round((100 * pc) / pt) : 0}%（${pt}組中）  点線 平均${(cross / N).toFixed(1)}本・0本の人${zero}%\n  星 平均${(stars / N).toFixed(0)}  星座 平均${(ncon / N).toFixed(1)}個（2つ組 ${(pairs / N).toFixed(1)}個・いちばん大きい星座 ${(maxc / N).toFixed(1)}個）`);
}
