import { MIN_CO, cooccurrence } from './constellation';
import { dayKey } from './period';
import { makeSampleCaptures, type Capture } from './sampleCaptures';
import { aggregate, type WordStat } from './wordCloud';

// 島（朝）の植え方。拾った記録だけから、植物の場所・大きさ・色づきを決める。RN に依存しないので node で検証できる。
// 3D の試作用（2026-10-05）。数値は仮。実機で見て調整する

export type Plant = WordStat & {
  x: number;
  z: number;
  // 育ち：1回だけなら芽（0）。回数が増えるほど 1 に近づく
  growth: number;
  // 大きさの倍率（回数で決まる）
  size: number;
  // よく一緒に拾う言葉のまとまり（同じ番号は近くに植わる）
  group: number;
};

export type IslandLayout = { radius: number; plants: Plant[] };

// 1つの言葉から残すつながりの数（よく拾う言葉が全部とつながって、島じゅうが1つのまとまりになるのを防ぐ）
const MAX_LINKS = 3;
// つながりとみなす強さの下限（コサイン：一緒の日数 ÷ √(片方の日数 × もう片方の日数)）
const MIN_ASSOC = 0.3;

// 同じ日に一緒に拾った組から、まとまりを見つける（重み付きのラベル伝播。順番を固定して毎回同じ結果にする）。
// 一緒の日数そのままだと、よく拾う言葉がどれとも強くつながる。拾った日数で割って「偶然より多いか」に近づける
export function findGroups(stats: WordStat[], captures: Capture[]): Map<string, number> {
  const words = [...stats].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word)).map((s) => s.word);
  const days = new Map<string, Set<string>>();
  for (const c of captures) {
    if (!days.has(c.word)) days.set(c.word, new Set());
    days.get(c.word)!.add(dayKey(c.capturedAt));
  }
  const links = new Map<string, [string, number][]>(words.map((w) => [w, []]));
  for (const { a, b, count } of cooccurrence(captures)) {
    if (count < MIN_CO || !links.has(a) || !links.has(b)) continue;
    const w = count / Math.sqrt(days.get(a)!.size * days.get(b)!.size);
    if (w < MIN_ASSOC) continue;
    links.get(a)!.push([b, w]);
    links.get(b)!.push([a, w]);
  }
  // お互いの上位 MAX_LINKS に入る組だけ残す
  const top = new Map([...links].map(([w, l]) => [w, new Set(l.sort((x, y) => y[1] - x[1]).slice(0, MAX_LINKS).map(([o]) => o))]));
  const nb = new Map<string, Map<string, number>>(words.map((w) => [w, new Map()]));
  for (const [a, l] of links)
    for (const [b, w] of l) if (top.get(a)!.has(b) && top.get(b)!.has(a)) nb.get(a)!.set(b, w);

  const label = new Map(words.map((w, i) => [w, i]));
  for (let round = 0; round < 20; round++) {
    let changed = false;
    for (const w of words) {
      const score = new Map<number, number>();
      for (const [o, c] of nb.get(w)!) score.set(label.get(o)!, (score.get(label.get(o)!) ?? 0) + c);
      let best = label.get(w)!;
      let bestScore = score.get(best) ?? 0;
      for (const [l, s] of score) if (s > bestScore || (s === bestScore && l < best)) [best, bestScore] = [l, s];
      if (best !== label.get(w)) {
        label.set(w, best);
        changed = true;
      }
    }
    if (!changed) break;
  }
  // 番号を、まとまりの大きい順に 0, 1, 2… に振り直す
  const total = new Map<number, number>();
  for (const s of stats) total.set(label.get(s.word)!, (total.get(label.get(s.word)!) ?? 0) + s.count);
  const order = [...total].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([l]) => l);
  return new Map(words.map((w) => [w, order.indexOf(label.get(w)!)]));
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export function sizeFor(count: number): number {
  return Math.min(1.8, 0.55 + 0.25 * Math.sqrt(count));
}

export function growthFor(count: number): number {
  return count <= 1 ? 0 : Math.min(1, 0.35 + 0.13 * count);
}

export function layoutIsland(captures: Capture[]): IslandLayout {
  const stats = aggregate(captures);
  const groups = findGroups(stats, captures);
  const categories = new Set(stats.map((s) => s.category));
  // 新しい種類の言葉を拾うと島が少し広がる。言葉が増えても少し広がる
  const radius = 2.4 + 0.55 * categories.size + 0.06 * stats.length;

  const byGroup = new Map<number, WordStat[]>();
  for (const s of stats) {
    const g = groups.get(s.word)!;
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push(s);
  }
  const nGroups = byGroup.size;
  const plants: Plant[] = [];
  for (const [g, members] of [...byGroup].sort((a, b) => a[0] - b[0])) {
    // まとまりの中心：大きいまとまりほど島の真ん中寄り。黄金角でずらして重ならないようにする
    // 言葉が少ない間は、まとまりを真ん中に寄せる（島じゅうに散らばると、小さな芽がばらばらで見えない）
    const spread = Math.min(1, Math.sqrt(stats.length / 20));
    const cr = nGroups <= 1 ? 0 : radius * 0.62 * spread * Math.sqrt((g + 0.5) / nGroups);
    const ca = g * GOLDEN * 1.7 + 0.6;
    const cx = cr * Math.cos(ca);
    const cz = cr * Math.sin(ca);
    members.sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
    members.forEach((s, j) => {
      const r = 0.62 * Math.sqrt(j);
      const a = j * GOLDEN + g;
      let x = cx + r * Math.cos(a);
      let z = cz + r * Math.sin(a);
      // 島からはみ出さない
      const d = Math.hypot(x, z);
      const max = radius * 0.8;
      if (d > max) [x, z] = [(x / d) * max, (z / d) * max];
      plants.push({ ...s, x, z, growth: growthFor(s.count), size: sizeFor(s.count), group: g });
    });
  }
  relax(plants, radius * 0.8);
  return { radius, plants };
}

// 近すぎる植物どうしを押し離す（まとまりどうしが重なることがあるため）。島の外へ出たものは内側へ戻す
function relax(plants: Plant[], max: number) {
  const gap = (p: Plant) => 0.22 + 0.2 * p.size;
  for (let it = 0; it < 60; it++) {
    for (let i = 0; i < plants.length; i++)
      for (let j = i + 1; j < plants.length; j++) {
        const a = plants[i];
        const b = plants[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz) || 0.001;
        const need = gap(a) + gap(b);
        if (d >= need) continue;
        const push = (need - d) / 2;
        a.x -= (dx / d) * push;
        a.z -= (dz / d) * push;
        b.x += (dx / d) * push;
        b.z += (dz / d) * push;
      }
    for (const p of plants) {
      const d = Math.hypot(p.x, p.z);
      if (d > max) [p.x, p.z] = [(p.x / d) * max, (p.z / d) * max];
    }
  }
}

// ---- 試作の仮データ：使い始めてからの4つの時期 ----

export type Stage = { key: string; label: string; days: number };

export const STAGES: Stage[] = [
  { key: 'day1', label: '1回目', days: 1 },
  { key: 'week', label: '1週間', days: 7 },
  { key: 'month', label: '1か月', days: 30 },
  { key: 'months', label: '数か月', days: 90 },
];

const DAY = 24 * 60 * 60 * 1000;

// 数か月で新しく拾い始める言葉（島が広がるのを見るため。好奇心と体の感じが増える）
const LATER_WORDS: [word: string, perMonth: number, strength: number][] = [
  ['やってみたい', 3, 0.8],
  ['調べたい', 2, 0.7],
  ['ひらめいた', 2, 0.9],
  ['スッキリ', 3, 0.4],
  ['趣味', 4, 0.6],
  ['楽しみたい', 2, 0.7],
];

// 28日分の仮の記録を3回くり返して、約3か月分にする。2か月目からは新しい言葉も拾う
export function makeIslandSample(now: number): Capture[] {
  const base = makeSampleCaptures(now);
  const out: Capture[] = [];
  for (let m = 0; m < 3; m++) {
    base.forEach((c, i) => {
      // くり返すたびに少しだけ抜ける（毎月まったく同じにならないように）
      if (m > 0 && (i + m) % 5 === 0) return;
      out.push({ ...c, capturedAt: c.capturedAt - m * 28 * DAY });
    });
  }
  const start = now - 84 * DAY;
  let k = 0;
  for (const [word, perMonth, strength] of LATER_WORDS) {
    for (let m = 1; m < 3; m++) {
      for (let i = 0; i < perMonth; i++) {
        // 週末の昼に、組になって拾う
        const day = 28 * (3 - m) - 6 - 7 * ((i + k) % 3);
        out.push({ word, strength, capturedAt: now - day * DAY + ((k % 3) - 1) * 3600_000 });
      }
    }
    k++;
  }
  out.sort((a, b) => a.capturedAt - b.capturedAt);
  return out.filter((c) => c.capturedAt >= start);
}

// 使い始めた日から days 日目までの記録
export function capturesUntil(all: Capture[], days: number): Capture[] {
  if (all.length === 0) return [];
  const first = new Date(all[0].capturedAt);
  first.setHours(0, 0, 0, 0);
  const end = first.getTime() + days * DAY;
  const firstDay = dayKey(all[0].capturedAt);
  return days === 1 ? all.filter((c) => dayKey(c.capturedAt) === firstDay) : all.filter((c) => c.capturedAt < end);
}

