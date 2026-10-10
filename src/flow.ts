import { WORD_CATEGORY } from './words';

// わたしのこと（C3.）の計算：日をまたいだ流れ（矢印）と、育っていること。RN に依存しないので node で検証できる。
// 同じ回・同じ日の中の順番は使わない（川が順番を決めてしまうため。設計書 D.）

export type Arrow = { from: string; to: string; weight: number };

// 何日後に拾ったかごとの重さ（次の日 1、2日後 0.5、3日後 0.25。設計書 D. の仮の値）
export const ARROW_WEIGHTS = [1, 0.5, 0.25];

// 元気に近い気持ちの言葉（決定 2026-10-07）。好奇心の言葉も行き先に入れる（案）
export const GENKI_WORDS = new Set([
  'わくわく', 'ときめき', '喜び', 'うれしい', '高揚感', '満足', '穏やか', 'ほっとした', '解放感', 'スッキリ', '軽い',
]);
export const isGenki = (w: string) => GENKI_WORDS.has(w) || WORD_CATEGORY[w] === 'curiosity';

type Cap = { word: string; capturedAt: number };

// 暦の日の番号（端末の時計の0時切り。dayKey と同じ日の区切り）。端末の暦の日付を UTC の日に置きかえて数えるので、時差や夏時間でずれない
export function dayNumber(t: number): number {
  const d = new Date(t);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
}

// 日ごとの言葉（1日に何回拾っても1回）
export function wordsByDay(captures: Cap[]): Map<number, Set<string>> {
  const m = new Map<number, Set<string>>();
  for (const c of captures) {
    const d = dayNumber(c.capturedAt);
    let s = m.get(d);
    if (!s) m.set(d, (s = new Set()));
    s.add(c.word);
  }
  return m;
}

// 矢印：ある日に拾った言葉 → 3日以内（暦の日。開かなかった日も詰めない）に拾った言葉。同じ言葉どうしは引かない
export function arrows(captures: Cap[]): Arrow[] {
  const byDay = wordsByDay(captures);
  const w = new Map<string, number>();
  for (const [d, froms] of byDay)
    ARROW_WEIGHTS.forEach((weight, i) => {
      const tos = byDay.get(d + i + 1);
      if (!tos) return;
      for (const a of froms)
        for (const b of tos) {
          if (a === b) continue;
          const key = `${a}\n${b}`;
          w.set(key, (w.get(key) ?? 0) + weight);
        }
    });
  return [...w].map(([key, weight]) => {
    const [from, to] = key.split('\n');
    return { from, to, weight };
  });
}

// 元気・好奇心の源（入次数）：元気・好奇心の言葉へ向かう矢印の重さを、出どころの言葉ごとに足す。重い順（同じなら名前順）
export function genkiSources(list: Arrow[]): { word: string; weight: number }[] {
  const m = new Map<string, number>();
  for (const a of list) if (isGenki(a.to)) m.set(a.from, (m.get(a.from) ?? 0) + a.weight);
  return [...m]
    .map(([word, weight]) => ({ word, weight }))
    .sort((x, y) => y.weight - x.weight || x.word.localeCompare(y.word));
}

// PageRank：矢印に沿って重みを少しずつ流すのをくり返す。
// 「行き着きやすい気持ち」に使う予定だったが、やめた（2026-10-10。毎日の記録は次の日へ必ず続くので行き止まりがなく、偶然と区別できなかった）。答え合わせの道具のために残す。
// 矢印の出ない言葉からは、全体に均等に流す。合計は1
export function pageRank(list: Arrow[], damping = 0.85, iterations = 100): Map<string, number> {
  const nodes = [...new Set(list.flatMap((a) => [a.from, a.to]))].sort();
  const n = nodes.length;
  const out = new Map<string, number>();
  for (const a of list) out.set(a.from, (out.get(a.from) ?? 0) + a.weight);
  let rank = new Map(nodes.map((v) => [v, 1 / n]));
  for (let it = 0; it < iterations; it++) {
    let dangling = 0;
    for (const v of nodes) if (!out.has(v)) dangling += rank.get(v)!;
    const next = new Map(nodes.map((v) => [v, (1 - damping) / n + (damping * dangling) / n]));
    for (const a of list) next.set(a.to, next.get(a.to)! + (damping * rank.get(a.from)! * a.weight) / out.get(a.from)!);
    rank = next;
  }
  return rank;
}

// くり返すめぐり（強連結成分分解・Tarjan）：お互いに行き来できる言葉の輪。2語以上の輪だけ、大きい順
export function cycles(list: Arrow[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const a of list) {
    if (!adj.has(a.from)) adj.set(a.from, []);
    if (!adj.has(a.to)) adj.set(a.to, []);
    adj.get(a.from)!.push(a.to);
  }
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const result: string[][] = [];
  const visit = (v: string) => {
    idx.set(v, index);
    low.set(v, index++);
    stack.push(v);
    onStack.add(v);
    for (const w of adj.get(v)!) {
      if (!idx.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length >= 2) result.push(comp.sort());
    }
  };
  for (const v of [...adj.keys()].sort()) if (!idx.has(v)) visit(v);
  return result.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}

// 育っていること：週（月曜はじまり）または月ごとに、拾った言葉（日ごとに1回）のうち元気・好奇心の言葉の割合。
// 数ではなく割合にするのは、開かなかった週が「元気がなかった」ように下がって見えないため（案 2026-10-10）
export function growth(captures: Cap[], unit: 'week' | 'month'): { start: number; ratio: number; total: number }[] {
  const buckets = new Map<number, { genki: number; total: number }>();
  for (const [d, words] of wordsByDay(captures)) {
    const date = new Date(d * 86400000); // UTC で読む（dayNumber の逆）
    const start =
      unit === 'month'
        ? new Date(date.getUTCFullYear(), date.getUTCMonth(), 1).getTime()
        : new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - ((date.getUTCDay() + 6) % 7)).getTime();
    const b = buckets.get(start) ?? { genki: 0, total: 0 };
    for (const w of words) {
      b.total++;
      if (isGenki(w)) b.genki++;
    }
    buckets.set(start, b);
  }
  return [...buckets]
    .sort((a, b) => a[0] - b[0])
    .map(([start, b]) => ({ start, ratio: b.genki / b.total, total: b.total }));
}

// 偶然との比べ（並べかえ検定）：日ごとの言葉はそのまま、日の並びだけをでたらめに入れ替えて、矢印の重さを何度も数え直す。
// 本物の重さ以上になった割合（p）が alpha 未満のものだけ「偶然より、はっきり多い」とする。
// 毎日拾う言葉（疲れ・仕事）は、並びを入れ替えてもどこへでも矢印が出るので、残らない。
// 乱数は種を決めてあるので、同じ記録からは毎回同じ結果になる
export const FLOW_ALPHA = 0.01; // 仮の値（scripts/me/tune-test.ts で決める）
export const SHUFFLES = 500;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

// 矢印の重さを、言葉の番号の表（n×n）に数える（文字列の Map より速い。並べかえで何百回も数えるため）
function arrowMatrix(days: number[], sets: number[][], n: number): Float64Array {
  const at = new Map(days.map((d, i) => [d, i]));
  const m = new Float64Array(n * n);
  days.forEach((d, i) =>
    ARROW_WEIGHTS.forEach((weight, k) => {
      const j = at.get(d + k + 1);
      if (j === undefined) return;
      for (const a of sets[i]) for (const b of sets[j]) if (a !== b) m[a * n + b] += weight;
    }),
  );
  return m;
}

export type FlowResult = {
  arrows: (Arrow & { p: number })[]; // 偶然より多い矢印
  sources: { word: string; weight: number; p: number }[]; // 偶然より多い源（重い順）
};

export function significantFlow(captures: Cap[], alpha = FLOW_ALPHA, shuffles = SHUFFLES, seed = 1): FlowResult {
  const byDay = wordsByDay(captures);
  const days = [...byDay.keys()].sort((a, b) => a - b);
  const words = [...new Set(captures.map((c) => c.word))].sort();
  const id = new Map(words.map((w, i) => [w, i]));
  const n = words.length;
  const genki = words.map(isGenki);
  const sets = days.map((d) => [...byDay.get(d)!].map((w) => id.get(w)!));
  const srcOf = (m: Float64Array) => {
    const s = new Float64Array(n);
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (genki[b]) s[a] += m[a * n + b];
    return s;
  };
  const real = arrowMatrix(days, sets, n);
  const realSrc = srcOf(real);
  const hitA = new Uint32Array(n * n);
  const hitS = new Uint32Array(n);
  const r = rng(seed);
  const perm = sets.slice();
  for (let t = 0; t < shuffles; t++) {
    for (let i = perm.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    const m = arrowMatrix(days, perm, n);
    for (let x = 0; x < n * n; x++) if (real[x] > 0 && m[x] >= real[x]) hitA[x]++;
    const s = srcOf(m);
    for (let a = 0; a < n; a++) if (realSrc[a] > 0 && s[a] >= realSrc[a]) hitS[a]++;
  }
  const p = (hits: number) => (1 + hits) / (1 + shuffles);
  const outArrows: (Arrow & { p: number })[] = [];
  for (let a = 0; a < n; a++)
    for (let b = 0; b < n; b++) {
      const x = a * n + b;
      if (real[x] > 0 && p(hitA[x]) < alpha) outArrows.push({ from: words[a], to: words[b], weight: real[x], p: p(hitA[x]) });
    }
  const sources = words
    .map((word, a) => ({ word, weight: realSrc[a], p: p(hitS[a]) }))
    .filter((s) => s.weight > 0 && s.p < alpha)
    .sort((x, y) => x.p - y.p || y.weight - x.weight || x.word.localeCompare(y.word));
  return { arrows: outArrows, sources };
}

// 元気・好奇心の源（max-T の並べかえ検定）：「〇〇 → 元気・好奇心の言葉」の矢印をすべて試すので、1本ずつ比べると偶然でもどれかが通ってしまう。
// そこで、矢印ごとに「偶然ならどれくらいか」からのずれ（z＝(本物−偶然の平均)÷偶然のばらつき）を出し、
// 並べかえのたびに、全部の矢印の中でいちばん大きい z を記録する。本物の z が、その「いちばん大きい z」の上位 familyAlpha に入る矢印だけを源にする。
// 日をまたいだ流れのない人では、何か1つでも源が出るのは、およそ familyAlpha の割合になる
export const SOURCE_ALPHA = 0.1; // ③確か（決定 2026-10-10。scripts/me/tune-test.ts：12週で、流れのない人に出るのは約3%）
export const SOURCE_MIN_WEIGHT = 3; // 1回きりの偶然を出さない（次の日なら3回ぶん）
export function genkiSourcesTested(
  captures: Cap[],
  familyAlpha = SOURCE_ALPHA,
  minWeight = SOURCE_MIN_WEIGHT,
  shuffles = SHUFFLES,
  seed = 2,
  onlyDoing = true,
): { word: string; to: string; weight: number; z: number }[] {
  const byDay = wordsByDay(captures);
  const days = [...byDay.keys()].sort((a, b) => a - b);
  const words = [...new Set(captures.map((c) => c.word))].sort();
  const id = new Map(words.map((w, i) => [w, i]));
  const n = words.length;
  const sets = days.map((d) => [...byDay.get(d)!].map((w) => id.get(w)!));
  const cand: number[] = []; // 試す矢印（行き先が元気・好奇心の言葉）
  // 源の候補は「していること」の言葉だけ（設計書 C3.「していることを中心に見る」）。試す組を減らすと、本物が偶然に埋もれにくい
  for (let a = 0; a < n; a++)
    if (!onlyDoing || WORD_CATEGORY[words[a]] === 'doing')
      for (let b = 0; b < n; b++) if (a !== b && isGenki(words[b])) cand.push(a * n + b);
  const real = arrowMatrix(days, sets, n);
  const shuffled = (pass: (m: Float64Array) => void) => {
    const r = rng(seed);
    const perm = sets.slice();
    for (let t = 0; t < shuffles; t++) {
      for (let i = perm.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [perm[i], perm[j]] = [perm[j], perm[i]];
      }
      pass(arrowMatrix(days, perm, n));
    }
  };
  const sum = new Float64Array(cand.length);
  const sq = new Float64Array(cand.length);
  shuffled((m) => cand.forEach((x, k) => ((sum[k] += m[x]), (sq[k] += m[x] * m[x]))));
  const mean = cand.map((_, k) => sum[k] / shuffles);
  const sd = cand.map((_, k) => Math.sqrt(Math.max(sq[k] / shuffles - mean[k] ** 2, 0)) || 0.25); // ばらつき0は、いちばん小さい重さで代える
  const maxima: number[] = [];
  shuffled((m) => {
    let mx = -Infinity;
    cand.forEach((x, k) => {
      if (m[x] >= minWeight) mx = Math.max(mx, (m[x] - mean[k]) / sd[k]);
    });
    maxima.push(mx);
  });
  maxima.sort((a, b) => b - a);
  const cut = maxima[Math.floor(familyAlpha * shuffles)] ?? -Infinity;
  const best = new Map<number, { word: string; to: string; weight: number; z: number }>();
  cand.forEach((x, k) => {
    if (real[x] < minWeight) return;
    const z = (real[x] - mean[k]) / sd[k];
    if (z <= cut) return;
    const a = Math.floor(x / n);
    const prev = best.get(a);
    if (!prev || z > prev.z) best.set(a, { word: words[a], to: words[x % n], weight: real[x], z });
  });
  return [...best.values()].sort((p, q) => q.z - p.z || p.word.localeCompare(q.word));
}

// 源を見る期間：直近12週（決定 2026-10-10。6週より本物が見つかりやすく、偽物も少ない）
export const SOURCE_DAYS = 84;
// ②確かめ中の基準（決定 2026-10-10）：ゆるいので、3〜5回に1回は偶然。画面では必ず「〜かも」「確かめ中」と書く
export const TENTATIVE_ALPHA = 0.3;
export const TENTATIVE_MIN_WEIGHT = 2;
// ①データが少ない間：使い始めて2週間、または元気な日が5日たまるまで（決定 2026-10-07）
export const FEW_DAYS = 14;
export const FEW_GENKI_DAYS = 5;

// 段階（決定 2026-10-10。ユーザー「画面には何かは表示されていて、どんどん確かになっていればいい」）
//  few        ① 文だけ（データが少ない間）
//  seen       ②' 見えはじめ：偶然とは比べず、起きたことだけを言う（「〜した日がありました」）。事実なので、はずれない
//  tentative  ② 確かめ中：ゆるい基準を通った（「〜かも」）。3〜5回に1回は偶然
//  sure       ③ 確か：厳しい基準を通った（「よく来ます」）
//  none       矢印が1本もない（まれ）
export type Stage = 'few' | 'none' | 'seen' | 'tentative' | 'sure';
export type SourceStage = { stage: 'few' | 'none' } | { stage: 'seen' | 'tentative' | 'sure'; word: string; to: string; weight: number };
export type LoopStage = { stage: 'few' | 'none' } | { stage: 'seen' | 'tentative' | 'sure'; a: string; b: string };

// 一度出た源・めぐりは、2週間は残す（決定 2026-10-10）。自信が下がった間は「確かめ中」に戻すだけで、消さない
export const HOLD_DAYS = 14;

function isFew(captures: Cap[], now: number): boolean {
  if (!captures.length) return true;
  const first = Math.min(...captures.map((c) => c.capturedAt));
  const genkiDays = new Set(captures.filter((c) => GENKI_WORDS.has(c.word)).map((c) => dayNumber(c.capturedAt))).size;
  return dayNumber(now) - dayNumber(first) < FEW_DAYS && genkiDays < FEW_GENKI_DAYS;
}
const recentOf = (captures: Cap[], t: number) =>
  captures.filter((c) => c.capturedAt <= t && dayNumber(t) - dayNumber(c.capturedAt) < SOURCE_DAYS);

// 今日の結果が③でなければ、1週間前・2週間前の結果も見て、そのころ②③で出ていたものを②で残す
function withHold<T extends { stage: Stage }>(captures: Cap[], now: number, at: (t: number) => T): T {
  const cur = at(now);
  if (cur.stage === 'sure' || cur.stage === 'few') return cur;
  for (let k = 7; k <= HOLD_DAYS; k += 7) {
    const past = at(now - k * 86400000);
    if (past.stage === 'sure' || past.stage === 'tentative') return cur.stage === 'tentative' ? cur : { ...past, stage: 'tentative' };
  }
  return cur;
}

function sourceAt(captures: Cap[], t: number): SourceStage {
  if (isFew(captures.filter((c) => c.capturedAt <= t), t)) return { stage: 'few' };
  const recent = recentOf(captures, t);
  const sure = genkiSourcesTested(recent, SOURCE_ALPHA, SOURCE_MIN_WEIGHT)[0];
  if (sure) return { stage: 'sure', word: sure.word, to: sure.to, weight: sure.weight };
  const maybe = genkiSourcesTested(recent, TENTATIVE_ALPHA, TENTATIVE_MIN_WEIGHT)[0];
  if (maybe) return { stage: 'tentative', word: maybe.word, to: maybe.to, weight: maybe.weight };
  // 見えはじめ：「していること」→ 元気・好奇心の言葉で、いちばん重い矢印（なければ、どの言葉からでも）
  const list = arrows(recent).filter((a) => isGenki(a.to));
  const best = (l: Arrow[]) => l.sort((x, y) => y.weight - x.weight || x.from.localeCompare(y.from) || x.to.localeCompare(y.to))[0];
  const seen = best(list.filter((a) => WORD_CATEGORY[a.from] === 'doing')) ?? best(list.filter((a) => !isGenki(a.from))) ?? best(list);
  return seen ? { stage: 'seen', word: seen.from, to: seen.to, weight: seen.weight } : { stage: 'none' };
}

// いちばん上に出す源を1つ選ぶ（① → ②' → ② → ③ と、記録がたまるほど確かになる）
export function topSource(captures: Cap[], now: number): SourceStage {
  return withHold(captures, now, (t) => sourceAt(captures, t));
}

function loopAt(captures: Cap[], t: number): LoopStage {
  if (isFew(captures.filter((c) => c.capturedAt <= t), t)) return { stage: 'few' };
  const recent = recentOf(captures, t);
  const sure = loopsTested(recent, LOOP_ALPHA, LOOP_MIN_WEIGHT)[0];
  if (sure) return { stage: 'sure', a: sure.a, b: sure.b };
  const maybe = loopsTested(recent, LOOP_TENTATIVE_ALPHA, LOOP_MIN_WEIGHT)[0];
  if (maybe) return { stage: 'tentative', a: maybe.a, b: maybe.b };
  // 見えはじめ：行きと帰りの、弱いほうの重さがいちばん大きい組
  const w = new Map(arrows(recent).map((a) => [`${a.from}\n${a.to}`, a.weight]));
  let best: { a: string; b: string; v: number } | undefined;
  for (const [key, v] of w) {
    const [a, b] = key.split('\n');
    if (a > b) continue;
    const m = Math.min(v, w.get(`${b}\n${a}`) ?? 0);
    if (m > 0 && (!best || m > best.v)) best = { a, b, v: m };
  }
  return best ? { stage: 'seen', a: best.a, b: best.b } : { stage: 'none' };
}

// くり返すめぐりを1つ選ぶ（源と同じ段階・同じ残し方）
export function topLoop(captures: Cap[], now: number): LoopStage {
  return withHold(captures, now, (t) => loopAt(captures, t));
}

// くり返すめぐり（A ⇄ B の2語の輪。max-T の並べかえ検定）：行き（A→B）と帰り（B→A）の z の、弱いほうを輪の強さにする。
// 並べかえのたびに全部の組でいちばん強い輪を記録し、本物がその上位 familyAlpha に入る輪だけ残す（決定 2026-10-10：めぐりも時間とともに確かになる）
export const LOOP_ALPHA = 0.1; // ③確か（仮。scripts/me/loop-test.ts で決める）
export const LOOP_TENTATIVE_ALPHA = 0.3; // ②確かめ中（仮）
export const LOOP_MIN_WEIGHT = 2; // 行きも帰りも、この重さ以上（仮）
export function loopsTested(
  captures: Cap[],
  familyAlpha = LOOP_ALPHA,
  minWeight = LOOP_MIN_WEIGHT,
  shuffles = SHUFFLES,
  seed = 3,
): { a: string; b: string; z: number }[] {
  const byDay = wordsByDay(captures);
  const days = [...byDay.keys()].sort((x, y) => x - y);
  const words = [...new Set(captures.map((c) => c.word))].sort();
  const id = new Map(words.map((w, i) => [w, i]));
  const n = words.length;
  const sets = days.map((d) => [...byDay.get(d)!].map((w) => id.get(w)!));
  const shuffled = (pass: (m: Float64Array) => void) => {
    const r = rng(seed);
    const perm = sets.slice();
    for (let t = 0; t < shuffles; t++) {
      for (let i = perm.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [perm[i], perm[j]] = [perm[j], perm[i]];
      }
      pass(arrowMatrix(days, perm, n));
    }
  };
  const sum = new Float64Array(n * n);
  const sq = new Float64Array(n * n);
  shuffled((m) => {
    for (let x = 0; x < n * n; x++) {
      sum[x] += m[x];
      sq[x] += m[x] * m[x];
    }
  });
  const mean = Float64Array.from(sum, (v) => v / shuffles);
  const sd = Float64Array.from(sq, (v, x) => Math.sqrt(Math.max(v / shuffles - mean[x] ** 2, 0)) || 0.25);
  const loopZ = (m: Float64Array, a: number, b: number) => {
    const ab = a * n + b, ba = b * n + a;
    if (m[ab] < minWeight || m[ba] < minWeight) return -Infinity;
    return Math.min((m[ab] - mean[ab]) / sd[ab], (m[ba] - mean[ba]) / sd[ba]);
  };
  const maxima: number[] = [];
  shuffled((m) => {
    let mx = -Infinity;
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) mx = Math.max(mx, loopZ(m, a, b));
    maxima.push(mx);
  });
  maxima.sort((x, y) => y - x);
  const cut = maxima[Math.floor(familyAlpha * shuffles)] ?? -Infinity;
  const real = arrowMatrix(days, sets, n);
  const out: { a: string; b: string; z: number }[] = [];
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++) {
      const z = loopZ(real, a, b);
      if (z > cut) out.push({ a: words[a], b: words[b], z });
    }
  return out.sort((x, y) => y.z - x.z || x.a.localeCompare(y.a));
}
