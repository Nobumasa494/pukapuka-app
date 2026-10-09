import { dayKey } from './period';
import type { WordStat } from './wordCloud';

// 言葉どうしのつながりと、まとまり（コミュニティ）の計算。RN に依存しないので node で検証できる。
// 夜空（星座）と島の植え方で同じ計算を使う

export type Line = { a: string; b: string; count: number };
// strength: つながりの強さ 0〜1（コサイン類似度）。よく拾う言葉が何とでもつながらないよう、拾った日数で割り引いた値
export type Link = Line & { strength: number };

// 線を出す共起回数の下限（1回だけ一緒だった組は偶然が多いので出さない）
export const MIN_CO = 2;
// つながりとみなす強さの下限（コサイン類似度：一緒の日数 ÷ √(片方の日数 × もう片方の日数)）
const MIN_ASSOC = 0.3;
// 1つの言葉から残すつながりの数（よく拾う言葉が全部とつながって、1つのまとまりになるのを防ぐ）
const MAX_LINKS = 3;

// 共起回数: 同じ日に2つの言葉を両方拾った日の数（1日に何回拾っても1日は1回）
export function cooccurrence(captures: { word: string; capturedAt: number }[]): Line[] {
  const byDay = new Map<string, Set<string>>();
  for (const c of captures) {
    const k = dayKey(c.capturedAt);
    let s = byDay.get(k);
    if (!s) byDay.set(k, (s = new Set()));
    s.add(c.word);
  }
  const counts = new Map<string, number>();
  for (const words of byDay.values()) {
    const list = [...words].sort();
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const key = `${list[i]}\n${list[j]}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
  }
  return [...counts].map(([key, count]) => {
    const [a, b] = key.split('\n');
    return { a, b, count };
  });
}

// つながりの強さで選んだ線。一緒の日が2日以上・強さ 0.3 以上で、お互いの上位 3 つに入る組だけ残す。
// known を渡すと、その言葉どうしだけを使う
export function strongLinks(captures: { word: string; capturedAt: number }[], known?: Set<string>): Link[] {
  const days = new Map<string, Set<string>>();
  for (const c of captures) {
    if (known && !known.has(c.word)) continue;
    if (!days.has(c.word)) days.set(c.word, new Set());
    days.get(c.word)!.add(dayKey(c.capturedAt));
  }
  const links = new Map<string, Link[]>([...days.keys()].map((w) => [w, []]));
  for (const { a, b, count } of cooccurrence(captures)) {
    if (count < MIN_CO || !links.has(a) || !links.has(b)) continue;
    const strength = count / Math.sqrt(days.get(a)!.size * days.get(b)!.size);
    if (strength < MIN_ASSOC) continue;
    links.get(a)!.push({ a, b, count, strength });
    links.get(b)!.push({ a, b, count, strength });
  }
  const top = new Map(
    [...links].map(([w, l]) => [
      w,
      new Set(l.sort((x, y) => y.strength - x.strength || `${x.a}${x.b}`.localeCompare(`${y.a}${y.b}`)).slice(0, MAX_LINKS).map((k) => (k.a === w ? k.b : k.a))),
    ]),
  );
  const seen = new Set<string>();
  const kept: Link[] = [];
  for (const l of [...links.values()].flat()) {
    const key = `${l.a}\n${l.b}`;
    if (seen.has(key) || !top.get(l.a)!.has(l.b) || !top.get(l.b)!.has(l.a)) continue;
    seen.add(key);
    kept.push(l);
  }
  return kept;
}

// 夜空の線：偶然では起きにくい組だけ残す。
// 「偶然なら何日いっしょになるか」を超幾何分布で数え、実際の日数以上になる確率（フィッシャーの正確確率検定の片側）が alpha 未満の組を線にする。
// 全体の日数は、記録のある日の数。日数が少ない間は、どの組も偶然を超えにくく、線がほとんど出ない
export const ALPHA = 0.01;
function logFactorials(n: number): number[] {
  const lf = [0];
  for (let i = 1; i <= n; i++) lf[i] = lf[i - 1] + Math.log(i);
  return lf;
}
export function chanceOfAtLeast(lf: number[], total: number, a: number, b: number, k: number): number {
  const logC = (n: number, r: number) => (r < 0 || r > n ? -Infinity : lf[n] - lf[r] - lf[n - r]);
  let p = 0;
  for (let x = k; x <= Math.min(a, b); x++) {
    const t = logC(a, x) + logC(total - a, b - x) - logC(total, b);
    if (t > -Infinity) p += Math.exp(t);
  }
  return Math.min(1, p);
}
export function significantLinks(captures: { word: string; capturedAt: number }[], alpha = ALPHA): Link[] {
  const days = new Map<string, Set<string>>();
  const active = new Set<string>();
  for (const c of captures) {
    const k = dayKey(c.capturedAt);
    active.add(k);
    if (!days.has(c.word)) days.set(c.word, new Set());
    days.get(c.word)!.add(k);
  }
  const lf = logFactorials(active.size);
  const links: Link[] = [];
  for (const { a, b, count } of cooccurrence(captures)) {
    if (count < MIN_CO) continue;
    const da = days.get(a)!.size;
    const db = days.get(b)!.size;
    if (chanceOfAtLeast(lf, active.size, da, db, count) >= alpha) continue;
    links.push({ a, b, count, strength: count / Math.sqrt(da * db) });
  }
  return links;
}

// つながりの強さを重みにした、ラベル伝播（となりの組の強さを足して、いちばん大きい組に入る。順番を固定して毎回同じ結果にする）。
// words は、並べる順番（回数の多い順にしておく）。戻り値は、言葉 → まとまりの番号（大きいまとまりが 0）
export function labelGroups(words: string[], links: { a: string; b: string; strength: number }[], weightOf: (w: string) => number): Map<string, number> {
  const nb = new Map<string, Map<string, number>>(words.map((w) => [w, new Map()]));
  for (const { a, b, strength } of links) {
    if (!nb.has(a) || !nb.has(b)) continue;
    nb.get(a)!.set(b, strength);
    nb.get(b)!.set(a, strength);
  }
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
  for (const w of words) total.set(label.get(w)!, (total.get(label.get(w)!) ?? 0) + weightOf(w));
  const order = [...total].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([l]) => l);
  return new Map(words.map((w) => [w, order.indexOf(label.get(w)!)]));
}

// 同じ日に一緒に拾った組から、まとまりを見つける（島の植え方）。
// 一緒の日数そのままだと、よく拾う言葉がどれとも強くつながる。拾った日数で割って「偶然より多いか」に近づける
export function findGroups(stats: WordStat[], captures: { word: string; capturedAt: number }[]): Map<string, number> {
  const words = [...stats].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word)).map((s) => s.word);
  const count = new Map(stats.map((s) => [s.word, s.count]));
  return labelGroups(words, strongLinks(captures, new Set(words)), (w) => count.get(w) ?? 0);
}
