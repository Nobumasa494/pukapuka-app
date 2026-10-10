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

// 大きい順に並べる比べ方。「当たりなし」（-Infinity）どうしを b - a で比べると NaN になり、並べ方が乱れる（2026-10-10 に見つけた）
const desc = (a: number, b: number) => (a < b ? 1 : a > b ? -1 : 0);

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

// 日の入れ替え方（2026-10-10）：1日ずつ全体でばらばらにすると、「いい週に散歩もわくわくもまとまって来る」だけの人でも
// 「散歩のあとに、わくわく」と出てしまう（気分は何日か続くため）。そこで、同じ週（月曜はじまり）の中だけで日を入れ替える。
// 週ごとの気分のまとまりは偶然の側に残り、「その週の中で、どちらが先か」だけを比べられる。0 なら全体で入れ替える
export let SHUFFLE_BLOCK_DAYS = 7;
export const setShuffleBlock = (d: number) => (SHUFFLE_BLOCK_DAYS = d);
const blockOf = (d: number) => (SHUFFLE_BLOCK_DAYS ? Math.floor((d + 3) / SHUFFLE_BLOCK_DAYS) : 0); // 1970-01-01 は木曜。+3 で月曜はじまり
function shuffleDays<T>(perm: T[], days: number[], r: () => number) {
  let i = 0;
  while (i < perm.length) {
    let j = i;
    while (j < perm.length && blockOf(days[j]) === blockOf(days[i])) j++;
    for (let k = j - 1; k > i; k--) {
      const x = i + Math.floor(r() * (k - i + 1));
      [perm[k], perm[x]] = [perm[x], perm[k]];
    }
    i = j;
  }
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
    shuffleDays(perm, days, r);
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
export type ScoredSource = { word: string; to: string; weight: number; z: number; zAt: number[] }; // zAt[L]＝重さ L 以上の矢印の中での、いちばん大きい z

// 1回の並べかえで、どの厳しさ・重さの下限でも決められるように、重さの下限（1・2・3）ごとの「いちばんの当たり」を記録する
function sourcesScored(captures: Cap[], shuffles = SHUFFLES, seed = 2, onlyDoing = true) {
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
      shuffleDays(perm, days, r);
      pass(arrowMatrix(days, perm, n));
    }
  };
  const sum = new Float64Array(cand.length);
  const sq = new Float64Array(cand.length);
  shuffled((m) => cand.forEach((x, k) => ((sum[k] += m[x]), (sq[k] += m[x] * m[x]))));
  const mean = cand.map((_, k) => sum[k] / shuffles);
  const sd = cand.map((_, k) => Math.sqrt(Math.max(sq[k] / shuffles - mean[k] ** 2, 0)) || 0.25); // ばらつき0は、いちばん小さい重さで代える
  const LEVELS = [0, 1, 2, 3];
  const maxima = LEVELS.map(() => [] as number[]);
  shuffled((m) => {
    const mx = LEVELS.map(() => -Infinity);
    cand.forEach((x, k) => {
      const z = (m[x] - mean[k]) / sd[k];
      for (const L of LEVELS) if (m[x] >= L && z > mx[L]) mx[L] = z;
    });
    LEVELS.forEach((L) => maxima[L].push(mx[L]));
  });
  maxima.forEach((m) => m.sort(desc));
  const cutAt = (alpha: number, minWeight: number) =>
    alpha >= 1 ? -Infinity : (maxima[Math.min(3, Math.ceil(minWeight))][Math.floor(alpha * shuffles)] ?? -Infinity);
  const best = new Map<number, ScoredSource>();
  cand.forEach((x, k) => {
    if (real[x] <= 0) return;
    const z = (real[x] - mean[k]) / sd[k];
    const a = Math.floor(x / n);
    const cur = best.get(a) ?? { word: words[a], to: words[x % n], weight: real[x], z, zAt: LEVELS.map(() => -Infinity) };
    if (z > cur.z) Object.assign(cur, { to: words[x % n], weight: real[x], z });
    for (const L of LEVELS) if (real[x] >= L && z > cur.zAt[L]) cur.zAt[L] = z;
    best.set(a, cur);
  });
  const scored = [...best.values()].sort((p, q) => q.z - p.z || p.word.localeCompare(q.word));
  return { scored, cutAt };
}

export function genkiSourcesTested(
  captures: Cap[],
  familyAlpha = SOURCE_ALPHA,
  minWeight = SOURCE_MIN_WEIGHT,
  shuffles = SHUFFLES,
  seed = 2,
  onlyDoing = true,
): { word: string; to: string; weight: number; z: number }[] {
  const { scored, cutAt } = sourcesScored(captures, shuffles, seed, onlyDoing);
  const cut = cutAt(familyAlpha, minWeight);
  const L = Math.min(3, Math.ceil(minWeight));
  return scored.filter((x) => x.zAt[L] > cut).sort((p, q) => q.zAt[L] - p.zAt[L] || p.word.localeCompare(q.word));
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

const STAGE_RANK: Record<Stage, number> = { sure: 3, tentative: 2, seen: 1, none: 0, few: 0 };
export type SourceItem = { word: string; to: string; weight: number; stage: 'seen' | 'tentative' | 'sure'; z: number };
export type LoopItem = { a: string; b: string; stage: 'tentative' | 'sure'; z: number };

// 一度②③に出た言葉は、2週間は②で残す（今日の段階が低いときだけ。なくなっていても②で足す）
function holdItems<T extends { stage: string; z: number }>(cur: T[], past: T[][], key: (x: T) => string): T[] {
  const out = new Map(cur.map((x) => [key(x), x]));
  for (const list of past)
    for (const p of list) {
      if (p.stage !== 'sure' && p.stage !== 'tentative') continue;
      const c = out.get(key(p));
      if (!c || STAGE_RANK[c.stage as Stage] < 2) out.set(key(p), { ...(c ?? p), stage: 'tentative' });
    }
  return [...out.values()];
}

const sortItems = <T extends { stage: string; z: number }>(l: T[]) =>
  l.sort((a, b) => STAGE_RANK[b.stage as Stage] - STAGE_RANK[a.stage as Stage] || b.z - a.z);

// くり返すめぐり（A ⇄ B の2語の輪。max-T の並べかえ検定）：行き（A→B）と帰り（B→A）の z の、弱いほうを輪の強さにする。
// 並べかえのたびに全部の組でいちばん強い輪を記録し、本物がその上位 familyAlpha に入る輪だけ残す（決定 2026-10-10：めぐりも時間とともに確かになる）
// ほとんど同じ意味の言葉の組（決定 2026-10-10）。めぐりで「疲れ ⇄ 目が疲れた」のような組が出ても気づきにならないので、同じ組どうしの輪は試さない
export const SIMILAR_GROUPS: string[][] = [
  ['疲れ', '目が疲れた', '体が重い', '重い', '力が抜ける'],
  ['眠い', 'ぼーっとする'],
  ['不安', '恐れ', '怖い', '焦り', '緊張', 'どきどき', 'ざわざわ'],
  ['悲しみ', '寂しい', '孤独', '切ない', '虚しい'],
  ['怒り', 'むかつく', '悔しい'],
  ['わくわく', 'ワクワクする', 'ときめき', '高揚感'],
  ['喜び', 'うれしい'],
  ['安心', 'ほっとした', '穏やか', '安心したい'],
  ['解放感', 'スッキリ', '軽い'],
  ['面白い', '気になる', 'もっと知りたい', '調べたい', '深掘りしたい', '不思議', 'なんで？'],
  ['やってみたい', '試してみたい'],
  ['頭が痛い', '胸が痛い', '息苦しい'],
  ['仕事', '会議', '締め切り', 'プレッシャー', '責任'],
  ['休みたい', '逃げたい', '一人になりたい'],
];
const SIMILAR = new Map(SIMILAR_GROUPS.flatMap((g, i) => g.map((w) => [w, i] as const)));
export const isSimilar = (a: string, b: string) => SIMILAR.has(a) && SIMILAR.get(a) === SIMILAR.get(b);

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
      shuffleDays(perm, days, r);
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
  const similar = new Set<number>();
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (isSimilar(words[a], words[b])) similar.add(a * n + b);
  const loopZ = (m: Float64Array, a: number, b: number) => {
    if (similar.has(a * n + b)) return -Infinity;
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
  maxima.sort(desc);
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

// 育っていること（決定 2026-10-10。割合だけだと「はいそれで？」になる、とユーザー。A・B の両方）
// B：元気の中身の変わり方。最初の4週と最近の4週で、よく拾った元気・好奇心の言葉（拾った日の数）を2つずつ。
// 偶然とは比べない事実（「よく拾った」）。8週たまるまでは出さない
export const SHIFT_WEEKS = 4;
// よく拾う言葉の変化：直近12週の、はじめの4週と最近の4週で、元気・好奇心の言葉を拾った日の数を比べる。
// どちらかでよく拾った言葉を4つまで、増えた順に（2026-10-10、ユーザー「うつりかわりの意味」→ 時期と日数を出す形に）
export type ShiftRow = { word: string; before: number; after: number };
export type Shift = { beforeFrom: number; afterFrom: number; rows: ShiftRow[] }; // beforeFrom・afterFrom は暦の日の番号（dayNumber）
export function genkiShift(captures: Cap[], now: number): Shift | null {
  if (!captures.length) return null;
  const firstDay = dayNumber(Math.min(...captures.map((c) => c.capturedAt)));
  const today = dayNumber(now);
  const span = SHIFT_WEEKS * 7;
  if (today - firstDay + 1 < span * 2) return null;
  const from = Math.max(firstDay, today - SOURCE_DAYS + 1); // 源と同じ12週の中で比べる
  const count = (lo: number, hi: number) => {
    const days = new Map<string, Set<number>>();
    for (const c of captures) {
      const d = dayNumber(c.capturedAt);
      if (d < lo || d > hi || !isGenki(c.word)) continue;
      if (!days.has(c.word)) days.set(c.word, new Set());
      days.get(c.word)!.add(d);
    }
    return new Map([...days].map(([w, s]) => [w, s.size]));
  };
  const b = count(from, from + span - 1), a = count(today - span + 1, today);
  const rows = [...new Set([...b.keys(), ...a.keys()])]
    .map((word) => ({ word, before: b.get(word) ?? 0, after: a.get(word) ?? 0 }))
    .sort((x, y) => Math.max(y.before, y.after) - Math.max(x.before, x.after) || x.word.localeCompare(y.word))
    .slice(0, 4)
    .sort((x, y) => y.after - y.before - (x.after - x.before) || x.word.localeCompare(y.word));
  return { beforeFrom: from, afterFrom: today - span + 1, rows };
}

// ---- わたしのこと全体の計算（速くした形。2026-10-10） ----
// ある時点の「源の一覧」と「めぐり」を、1回の並べかえ（500回×2周）でまとめて出す。これを「スナップショット」と呼ぶ。
// 過去の時点のスナップショットは、記録が増えても変わらない（その時点までの記録だけで決まる）ので、端末にとっておける（meCache）
// 並べかえのたびに矢印の表を数え直す道具（速くした形。2026-10-10、スマホで12週を全部計算すると10秒かかったため）
// ・どの日とどの日が「n日後」の関係かは、並べかえても変わらないので、最初に1回だけ調べておく
// ・表は1枚を使い回す（毎回新しく作らない）
function arrowCounter(days: number[], n: number) {
  const at = new Map(days.map((d, i) => [d, i]));
  const pi: number[] = [], pj: number[] = [], pw: number[] = [];
  days.forEach((d, i) =>
    ARROW_WEIGHTS.forEach((w, k) => {
      const j = at.get(d + k + 1);
      if (j === undefined) return;
      pi.push(i);
      pj.push(j);
      pw.push(w);
    }),
  );
  const m = new Float64Array(n * n);
  return (sets: number[][]): Float64Array => {
    m.fill(0);
    for (let q = 0; q < pi.length; q++) {
      const A = sets[pi[q]], B = sets[pj[q]], w = pw[q];
      for (let x = 0; x < A.length; x++) {
        const row = A[x] * n;
        for (let y = 0; y < B.length; y++) if (A[x] !== B[y]) m[row + B[y]] += w;
      }
    }
    return m;
  };
}

// わたしのこと本番の並べかえの回数（2026-10-10。スマホで速くするため 500 から減らした。まちがいの割合は scripts/me で確かめた）
export const SNAP_SHUFFLES = 300;
export type Snapshot = { t: number; sources: SourceItem[]; loops: LoopItem[] } | { t: number; few: true };

export function snapshot(captures: Cap[], t: number, shuffles = SNAP_SHUFFLES, seed = 2): Snapshot {
  const upto = captures.filter((c) => c.capturedAt <= t);
  if (isFew(upto, t)) return { t, few: true };
  const recent = recentOf(captures, t);
  const byDay = wordsByDay(recent);
  const days = [...byDay.keys()].sort((a, b) => a - b);
  const words = [...new Set(recent.map((c) => c.word))].sort();
  const id = new Map(words.map((w, i) => [w, i]));
  const n = words.length;
  const sets = days.map((d) => [...byDay.get(d)!].map((w) => id.get(w)!));
  const doing = words.map((w) => WORD_CATEGORY[w] === 'doing');
  const genki = words.map(isGenki);
  const cand: number[] = [];
  for (let a = 0; a < n; a++) if (doing[a]) for (let b = 0; b < n; b++) if (a !== b && genki[b]) cand.push(a * n + b);
  const pairs: number[] = []; // めぐりの組（a < b、似た言葉どうしは除く）
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (!isSimilar(words[a], words[b])) pairs.push(a * n + b);
  const count = arrowCounter(days, n);
  // 使う矢印（源の候補・めぐりの行きと帰り）だけを、並べかえ1回ごとに覚えておく。2周しなくてよくなる（スマホで速く）
  const N2 = n * n;
  const slot = new Int32Array(N2).fill(-1);
  const idx: number[] = [];
  const keep = (x: number) => {
    if (slot[x] < 0) {
      slot[x] = idx.length;
      idx.push(x);
    }
  };
  for (const x of cand) keep(x);
  for (const x of pairs) {
    keep(x);
    keep((x % n) * n + Math.floor(x / n));
  }
  const K = idx.length;
  const buf = new Float32Array(shuffles * K);
  const sum = new Float64Array(K);
  const sq = new Float64Array(K);
  {
    const r = rng(seed);
    const perm = sets.slice();
    for (let t = 0; t < shuffles; t++) {
      shuffleDays(perm, days, r);
      const m = count(perm);
      const o = t * K;
      for (let k = 0; k < K; k++) {
        const v = m[idx[k]];
        buf[o + k] = v;
        sum[k] += v;
        sq[k] += v * v;
      }
    }
  }
  const mean = Float64Array.from(sum, (v) => v / shuffles);
  const sd = Float64Array.from(sq, (v, k) => Math.sqrt(Math.max(v / shuffles - mean[k] ** 2, 0)) || 0.25);
  const candK = cand.map((x) => slot[x]);
  const pairK = pairs.map((x) => slot[x]);
  const pairBK = pairs.map((x) => slot[(x % n) * n + Math.floor(x / n)]);
  // 並べかえのたびに「いちばんの当たり」を記録（源は重さの下限 2・3 ごと、めぐりは1つ）
  const srcMax2: number[] = [], srcMax3: number[] = [], loopMax: number[] = [];
  for (let t = 0; t < shuffles; t++) {
    const o = t * K;
    let m2 = -Infinity, m3 = -Infinity, ml = -Infinity;
    for (let q = 0; q < candK.length; q++) {
      const k = candK[q], v = buf[o + k];
      if (v < TENTATIVE_MIN_WEIGHT) continue;
      const z = (v - mean[k]) / sd[k];
      if (z > m2) m2 = z;
      if (v >= SOURCE_MIN_WEIGHT && z > m3) m3 = z;
    }
    for (let q = 0; q < pairK.length; q++) {
      const k1 = pairK[q], k2 = pairBK[q], v1 = buf[o + k1], v2 = buf[o + k2];
      if (v1 < LOOP_MIN_WEIGHT || v2 < LOOP_MIN_WEIGHT) continue;
      const z = Math.min((v1 - mean[k1]) / sd[k1], (v2 - mean[k2]) / sd[k2]);
      if (z > ml) ml = z;
    }
    srcMax2.push(m2);
    srcMax3.push(m3);
    loopMax.push(ml);
  }
  const zOf = (m: Float64Array, x: number) => (m[x] - mean[slot[x]]) / sd[slot[x]];
  const loopZ = (m: Float64Array, x: number) => {
    const ba = (x % n) * n + Math.floor(x / n);
    if (m[x] < LOOP_MIN_WEIGHT || m[ba] < LOOP_MIN_WEIGHT) return -Infinity;
    return Math.min(zOf(m, x), zOf(m, ba));
  };
  // 大きい順に並べて、上位 alpha の所を境目にする。「当たりなし」（-Infinity）どうしを b - a で比べると NaN になり、
  // 並べ方が乱れて境目が -Infinity になっていた（2026-10-10、見本で一覧の8つが全部「よく来る」になった）。数の大小で比べる
  const cut = (arr: number[], alpha: number) => [...arr].sort(desc)[Math.floor(alpha * shuffles)] ?? -Infinity;
  const cutSure = cut(srcMax3, SOURCE_ALPHA), cutMaybe = cut(srcMax2, TENTATIVE_ALPHA);
  const loopSure = cut(loopMax, LOOP_ALPHA), loopMaybe = cut(loopMax, LOOP_TENTATIVE_ALPHA);
  const real = Float64Array.from(count(sets));
  // 源：言葉ごとに、いちばん目立つ矢印と、重さ2以上・3以上の中での z
  const best = new Map<number, { item: SourceItem; z2: number; z3: number }>();
  for (const x of cand) {
    const v = real[x];
    if (v <= 0) continue;
    const z = zOf(real, x), a = Math.floor(x / n);
    let e = best.get(a);
    if (!e) best.set(a, (e = { item: { word: words[a], to: words[x % n], weight: v, z, stage: 'seen' }, z2: -Infinity, z3: -Infinity }));
    if (z > e.item.z) Object.assign(e.item, { to: words[x % n], weight: v, z });
    if (v >= TENTATIVE_MIN_WEIGHT && z > e.z2) e.z2 = z;
    if (v >= SOURCE_MIN_WEIGHT && z > e.z3) e.z3 = z;
  }
  const sources = [...best.values()].map(({ item, z2, z3 }) => ({ ...item, stage: (z3 > cutSure ? 'sure' : z2 > cutMaybe ? 'tentative' : 'seen') as SourceItem['stage'] }));
  const loops: LoopItem[] = [];
  for (const x of pairs) {
    const z = loopZ(real, x);
    if (z > loopMaybe) loops.push({ a: words[Math.floor(x / n)], b: words[x % n], z, stage: z > loopSure ? 'sure' : 'tentative' });
  }
  return { t, sources: sortItems(sources), loops: sortItems(loops) };
}

// 計算する時点：週の終わり（日曜の夜）ごとと、今。週の終わりは毎日同じなので、とっておいたスナップショットを使い回せる
export function checkpoints(captures: Cap[], now: number): number[] {
  if (!captures.length) return [now];
  const first = Math.min(...captures.map((c) => c.capturedAt));
  const out: number[] = [];
  const d = new Date(first);
  // first を含む週の日曜 23:59:59.999
  let t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + ((7 - d.getDay()) % 7), 23, 59, 59, 999).getTime();
  while (t < now) {
    out.push(t);
    const x = new Date(t);
    t = new Date(x.getFullYear(), x.getMonth(), x.getDate() + 7, 23, 59, 59, 999).getTime();
  }
  out.push(now);
  return out;
}

export const LIST_MAX = 8;
export type StoryEvent = { at: number; word: string; to: string; stage: 'tentative' | 'sure' };
export type MeResult =
  | { few: true }
  | { few: false; top: SourceItem | null; topIsNew?: boolean; list: SourceItem[]; loops: LoopItem[]; story: StoryEvent[] | null; shift: Shift | null }; // story が null＝まだ計算中。topIsNew＝いちばん上が、新しく確かになったもの

// スナップショットの並び（古い順、最後が今）から、画面に出すものをまとめる
//  ・一覧：今の源。1つ前・2つ前の週の終わりに②③だった言葉は、②で残す（2週間残す。決定 2026-10-10）
//  ・いちばん上：2つ前の週の終わりには③でなかったのに、今③になった源（新しく見えてきた源）。なければ一覧の先頭
//  ・歩み：言葉が初めて②・③になった時点を並べる
export function assemble(snaps: Snapshot[], captures: Cap[], now: number): MeResult {
  const cur = snaps[snaps.length - 1];
  if (!cur || 'few' in cur) return { few: true };
  const past = snaps.slice(-3, -1).filter((x): x is Extract<Snapshot, { sources: SourceItem[] }> => !('few' in x));
  const list = sortItems(holdItems(cur.sources, past.map((x) => x.sources), (x) => x.word)).slice(0, LIST_MAX);
  const old = past[0];
  const wasSure = new Set(old ? old.sources.filter((x) => x.stage === 'sure').map((x) => x.word) : []);
  const fresh = old ? list.find((x) => x.stage === 'sure' && !wasSure.has(x.word)) : undefined;
  const top = fresh ?? list[0] ?? null;
  const loops = sortItems(holdItems(cur.loops, past.map((x) => x.loops), (x) => x.a + '\n' + x.b)).slice(0, 3);
  const rank = new Map<string, number>();
  const story: StoryEvent[] = [];
  for (const sn of snaps) {
    if ('few' in sn) continue;
    for (const x of sn.sources) {
      if (x.stage === 'seen') continue;
      const r = STAGE_RANK[x.stage];
      if (r > (rank.get(x.word) ?? 0)) {
        rank.set(x.word, r);
        story.push({ at: sn.t, word: x.word, to: x.to, stage: x.stage });
      }
    }
  }
  return { few: false, top, topIsNew: !!fresh, list, loops, story, shift: genkiShift(captures, now) };
}

// すべてをその場で計算する（テスト・試し用）。アプリでは computeMe（とっておいた結果を使う）
export function computeMeSync(captures: Cap[], now: number): MeResult {
  return assemble(checkpoints(captures, now).map((t) => snapshot(captures, t)), captures, now);
}

// とっておく場所（端末の AsyncStorage など）。鍵は「時点の日・その時点までの記録の数」。記録が後から足された（電波がなかったなど）ときは数が変わるので、計算し直す
export type SnapCache = { get: (key: string) => Promise<Snapshot | null>; set: (key: string, v: Snapshot) => Promise<void> };
export const SNAP_VERSION = 2; // 計算の中身を変えたら上げる（古いとっておきを使わない）
// 計算の順番：まず「今」と直近2つの週の終わり（いちばん上・一覧・めぐりに要る）→ onPartial で先に画面を出す → 残り（歩みに要る）
export async function computeMe(
  captures: Cap[],
  now: number,
  cache?: SnapCache,
  onProgress?: (done: number, total: number) => void,
  onPartial?: (r: MeResult) => void,
): Promise<MeResult> {
  const ts = checkpoints(captures, now);
  const snaps: (Snapshot | null)[] = ts.map(() => null);
  const order = [...ts.keys()].reverse(); // 新しい順
  let done = 0;
  for (const i of order) {
    const t = ts[i];
    const isNow = i === ts.length - 1;
    const key = `v${SNAP_VERSION}:${dayNumber(t)}:${captures.filter((c) => c.capturedAt <= t).length}`;
    let sn = !isNow && cache ? await cache.get(key) : null;
    if (!sn) {
      await new Promise((r) => setTimeout(r, 0)); // 画面を止めないよう、1つ計算するたびにひと息つく
      sn = snapshot(captures, t);
      if (!isNow && cache) await cache.set(key, sn);
    }
    snaps[i] = sn;
    onProgress?.(++done, ts.length);
    if (done === Math.min(3, ts.length) && done < ts.length && onPartial) {
      const r = assemble(snaps.filter((x): x is Snapshot => !!x), captures, now);
      onPartial(r.few ? r : { ...r, story: null });
    }
  }
  return assemble(snaps as Snapshot[], captures, now);
}

// 前の形（テストで使う）
export function topSource(captures: Cap[], now: number): SourceStage {
  const r = computeMeSync(captures, now);
  if (r.few) return { stage: 'few' };
  return r.top ? { stage: r.top.stage, word: r.top.word, to: r.top.to, weight: r.top.weight } : { stage: 'none' };
}
export function sourceList(captures: Cap[], now: number) {
  return computeMeSync(captures, now);
}

// いちばん上の源の数字：その言葉を拾った日のうち、次の日に元気・好奇心の言葉を拾った日の割合と、ふだんの日の割合（直近12週）。
// 次の日に記録のある日だけで数える（開かなかった日は「来なかった」に数えない）
export function nextDayRate(captures: Cap[], now: number, word: string): { days: number; hits: number; rate: number; base: number } {
  const byDay = wordsByDay(recentOf(captures, now));
  const has = (d: number) => [...(byDay.get(d) ?? [])].some(isGenki);
  const all = [...byDay.keys()].filter((d) => byDay.has(d + 1));
  const mine = all.filter((d) => byDay.get(d)!.has(word));
  const hits = mine.filter((d) => has(d + 1)).length;
  return { days: mine.length, hits, rate: mine.length ? hits / mine.length : 0, base: all.length ? all.filter((d) => has(d + 1)).length / all.length : 0 };
}

// 「たとえば」の欄：その言葉の日のあと3日以内に、行き先の言葉を拾った例を、新しい順に max 個（直近12週）。
// 割合の数字より、自分の記録の実際の日のほうが分かりやすい（2026-10-10、ユーザー「分析がわかりにくいのでは」）
export type Example = { from: number; to: number }; // 暦の日の番号（dayNumber）
export function examples(captures: Cap[], now: number, word: string, to: string, max = 3): Example[] {
  const byDay = wordsByDay(recentOf(captures, now));
  const out: Example[] = [];
  for (const d of [...byDay.keys()].sort((a, b) => b - a)) {
    if (!byDay.get(d)!.has(word)) continue;
    for (let k = 1; k <= ARROW_WEIGHTS.length; k++)
      if (byDay.get(d + k)?.has(to)) {
        out.push({ from: d, to: d + k });
        break;
      }
    if (out.length >= max) break;
  }
  return out;
}

// 回数：その言葉の日のあと3日以内に、行き先の言葉を拾ったことが何回あったか（直近12週）。画面には確かさの代わりに、この数えた事実だけを出す（2026-10-10）
export function pairCount(captures: Cap[], now: number, word: string, to: string): number {
  return examples(captures, now, word, to, Infinity).length;
}
// 行ったり来たりの回数：行き（a のあと b）と帰り（b のあと a）を合わせた回数
export function loopCount(captures: Cap[], now: number, a: string, b: string): number {
  return pairCount(captures, now, a, b) + pairCount(captures, now, b, a);
}
// 画面に出す回数をまとめて数える（一覧・行ったり来たり・いちばん上）
export type Counts = Record<string, number>; // 鍵は「a→b」（行ったり来たりは「a⇄b」）
export function countsFor(captures: Cap[], now: number, r: MeResult): Counts {
  const out: Counts = {};
  if (r.few) return out;
  for (const x of [...r.list, ...(r.top ? [r.top] : [])]) out[`${x.word}→${x.to}`] = pairCount(captures, now, x.word, x.to);
  for (const x of r.loops) out[`${x.a}⇄${x.b}`] = loopCount(captures, now, x.a, x.b);
  return out;
}
