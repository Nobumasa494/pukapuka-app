import { MIN_CO, cooccurrence, labelGroups, significantLinks, tentativeLinks, type Line, type Link } from './communities';
import { aggregate, type WordStat } from './wordCloud';

// ふりかえり（共起ネットワーク）の計算。RN に依存しないので node で検証できる。
// 言葉＝星、偶然では起きにくい「同じ日に一緒に拾った」関係＝細い金色の線。星の大きさ＝拾った回数、線の太さ・星どうしの引き合う力＝つながりの強さ


export type Star = WordStat & {
  // 等級（1・2・3）。その夜空の中で、拾った回数の順位で決める（magnitudes）
  mag: Mag;
  x: number;
  y: number;
  r: number;
  labelSize: number;
  labelW: number;
  labelH: number;
};

export type Area = { x: number; y: number; w: number; h: number };

// 星の等級：本物の星のように、拾った回数を3段階で見せる（ユーザー「星の大きさは回数で区別しているのに差が分かりづらい」「回数は明るさと大きさで表現したら？」2026-10-10）。
// その夜空の中での順位で決める（上位15%＝1等星、次の35%＝2等星、残り＝3等星）ので、記録の多い少ないによらず、必ず3段階の差が見える
export type Mag = 1 | 2 | 3;
export const MAG_TOP = 0.15;
export const MAG_MID = 0.5;
// 等級ごとの大きさ（芯の半径・名前の文字）。明るさ（芯の濃さ・光のにじみ・名前の濃さ）は NightOverlay の MAG_LOOK
export const MAG_SIZE: Record<Mag, { r: number; label: number }> = { 1: { r: 4.6, label: 14 }, 2: { r: 2.8, label: 12 }, 3: { r: 1.6, label: 10.5 } };
export function magnitudes(stats: WordStat[]): Map<string, Mag> {
  const ranked = [...stats].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
  const top = Math.ceil(ranked.length * MAG_TOP);
  const mid = Math.ceil(ranked.length * MAG_MID);
  return new Map(ranked.map((s, i) => [s.word, (i < top ? 1 : i < mid ? 2 : 3) as Mag]));
}

export { MIN_CO, cooccurrence, type Line, type Link };
// cross: 別のまとまりをつなぐ線。画面にはうすい点線で出し、星は引き寄せない
export type StarLink = Link & { cross: boolean };
// まだ確かめている途中の線（とてもうすい点線）。p＝偶然でこうなる確率
export type TentativeLink = Link & { p: number };
// 途中の線は、多くても5本（記録が少ない間は、ほとんどが偶然なので、空を点線だらけにしない）
export const TENTATIVE_MAX = 5;
// 星座の星が少ない間に、線がなくても出す星の数（回数の多い順。決定 2026-10-10 案A「星だけ先に出る」）
export const EARLY_STARS = 12;
// 上限は、星の数だけ（名前が読める星の数）。描く線は骨組み（星の数−星座の数）なので、線の数・1つの星からの線の数の上限は持たない
// （2026-10-10 ユーザー「はい」。前は線38・150本、1つの星から5・3本）
export type Caps = { stars: number };
export const NORMAL_CAPS: Caps = { stars: 26 }; // 1画面に収める
// 星が26個を超える人（たくさん記録する人）は、夜空を、画面より大きくして、なぞって動かせるようにする（試作 2026-10-09）
export const WIDE_CAPS: Caps = { stars: 60 };

// 星座の骨組み（最大全域木）：星座の中の線（実線）から、輪を作らずに、強い線をできるだけ残す。星座の星は全部つながったまま、
// 一本道や枝分かれ（星座らしい形）になる。強い順に足し、輪になる線は飛ばす。画面に描く線と、星の位置を決める線に使う。
// 星座分け・検定は、全部の線で計算する（骨組みは見せ方だけ。ユーザー「位置も骨組みの線で決める」2026-10-10）
export function skeleton(lines: StarLink[]): StarLink[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const q = find(p);
    parent.set(x, q);
    return q;
  };
  const out: StarLink[] = [];
  const solid = lines.filter((l) => !l.cross).sort((p, q) => q.strength - p.strength || q.count - p.count || `${p.a}${p.b}`.localeCompare(`${q.a}${q.b}`));
  for (const l of solid) {
    const a = find(l.a);
    const b = find(l.b);
    if (a === b) continue;
    parent.set(a, b);
    out.push(l);
  }
  return out;
}
const MAX_STARS = NORMAL_CAPS.stars;

// 見せる星と線を選ぶ。偶然では起きにくい組（検定）だけを線の候補にして、つながりの強さ（コサイン類似度）の強い順に採り、星の数が上限を超える線は飛ばす。
// focus（拾ったことばでタップした言葉）は線がなくても必ず出し、その言葉の線を先に採る
export function selectConstellation(
  captures: { word: string; strength: number; capturedAt: number }[],
  focus?: string,
  caps: Caps = NORMAL_CAPS,
): { stats: WordStat[]; lines: StarLink[]; tentative: TentativeLink[]; truncated: boolean } {
  const all = aggregate(captures);
  const statOf = new Map(all.map((s) => [s.word, s]));
  // まとまりは、上限で切る前の、偶然ではない線の全部で決める。回数の多い言葉から順に見る
  // 線の候補は、検定1%（実線も点線も同じ1つの決まり）。点線だけ2%・FDR も試したが、1%に戻した（2026-10-10。scripts/night/fdr-test.ts）
  const found = significantLinks(captures).filter((l) => statOf.has(l.a) && statOf.has(l.b));
  const linked = [...new Set(found.flatMap((l) => [l.a, l.b]))].sort((a, b) => statOf.get(b)!.count - statOf.get(a)!.count || a.localeCompare(b));
  const group = labelGroups(linked, found, (w) => statOf.get(w)!.count);
  const candidates: StarLink[] = found
    .map((l) => ({ ...l, cross: group.get(l.a) !== group.get(l.b) }))
    .sort((p, q) => {
      const pf = p.a === focus || p.b === focus ? 1 : 0;
      const qf = q.a === focus || q.b === focus ? 1 : 0;
      return qf - pf || q.strength - p.strength || q.count - p.count || `${p.a}${p.b}`.localeCompare(`${q.a}${q.b}`);
    });

  const words = new Set<string>(focus && statOf.has(focus) ? [focus] : []);
  const lines: StarLink[] = [];
  let truncated = false; // 星の上限で、入れられなかった星があるか（あれば、動かせる夜空にする）
  for (const l of candidates) {
    const added = (words.has(l.a) ? 0 : 1) + (words.has(l.b) ? 0 : 1);
    if (words.size + added > caps.stars) {
      truncated = true;
      continue;
    }
    words.add(l.a);
    words.add(l.b);
    lines.push(l);
  }
  // 星座の線（実線）が1本もない星は出さない（点線の相手の星が、1つだけ浮かないように）
  const inConstellation = new Set(lines.filter((l) => !l.cross).flatMap((l) => [l.a, l.b]));
  if (focus && statOf.has(focus)) inConstellation.add(focus);
  const kept = lines.filter((l) => inConstellation.has(l.a) && inConstellation.has(l.b));
  // 星座の星が少ない間（使い始め）は、よく拾った言葉を、線がなくても星として出して EARLY_STARS まで足す。
  // 星座ができたとたんに空の星が減らないように（線がまだないときだけ足すと、10日目に星が12→6に減った 2026-10-10）
  const shown = new Set(inConstellation);
  for (const s of [...all].sort((p, q) => q.count - p.count || p.word.localeCompare(q.word))) {
    if (shown.size >= EARLY_STARS) break;
    shown.add(s.word);
  }
  // 途中の線（うすい点線）。両はしの星も出す（星の上限の中で）
  const tentative: TentativeLink[] = [];
  // 選ぶ順は、偶然の確率 p の小さい順（本物らしい順）。同じ p の組の中だけ、まだ線の少ない言葉の組を先にする
  // （記録が少ないと全部同じ p で、1つの言葉に集まった。1つの言葉から何本までという上限は、本当につながりの多い言葉を隠すのでつけない 2026-10-10）
  const per = new Map<string, number>();
  const used = (l: Link) => (per.get(l.a) ?? 0) + (per.get(l.b) ?? 0);
  const pool = tentativeLinks(captures).filter((l) => statOf.has(l.a) && statOf.has(l.b));
  while (tentative.length < TENTATIVE_MAX && pool.length > 0) {
    const tied = pool.filter((l) => Math.abs(l.p - pool[0].p) < 1e-9);
    const l = tied.reduce((best, x) => (used(x) < used(best) ? x : best), tied[0]);
    pool.splice(pool.indexOf(l), 1);
    const added = (shown.has(l.a) ? 0 : 1) + (shown.has(l.b) ? 0 : 1);
    if (shown.size + added > caps.stars) continue;
    shown.add(l.a);
    shown.add(l.b);
    per.set(l.a, (per.get(l.a) ?? 0) + 1);
    per.set(l.b, (per.get(l.b) ?? 0) + 1);
    tentative.push(l);
  }
  return { stats: [...shown].map((w) => statOf.get(w)!), lines: kept, tentative, truncated };
}

// 夜空の配置。星が1画面に収まるときは、いつもの配置。収まらないとき（星が MAX_STARS より多い）は、
// 星座ごとに形を決めてから、本物の夜空のように、空に散らして置く。画面より大きな夜空になり、なぞって動かす（試作 2026-10-09）
// home：開いたときに、画面の真ん中に見せる点（いちばん大きな星座。拾ったことばから来たときは、その言葉の星座）
const SKY_GAP = 44; // 星座どうしの、いちばん近いところの間
const SKY_ASPECT = 1.15; // 散らす広がりの、横÷縦（横に少し広く。上下にも左右にも動かせる夜空に）
export function layoutSky(
  stats: WordStat[],
  lines: StarLink[],
  area: Area,
  focus?: string,
  weak: Link[] = [],
): { stars: Star[]; extentW: number; extentH: number; home?: { x: number; y: number } } {
  const mags = magnitudes(stats); // 等級は、夜空全体の中の順位で決める
  const solid = lines.filter((l) => !l.cross);
  const parent = new Map<string, string>(stats.map((s) => [s.word, s.word]));
  const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
  for (const l of solid) parent.set(find(l.a), find(l.b));
  const comps = new Map<string, WordStat[]>();
  for (const s of stats) comps.set(find(s.word), [...(comps.get(find(s.word)) ?? []), s]);
  const list = [...comps.values()];
  if (stats.length <= MAX_STARS || list.length <= 3) {
    return { stars: layoutConstellation(stats, lines, area, focus, mags, weak), extentW: area.x + area.w + area.x, extentH: area.y + area.h };
  }
  // 拾ったことばから来た言葉の星座を最初に、あとは星の多い順（大きいものから置くと、すき間に小さいものが入る）
  const hasFocus = (g: WordStat[]) => (focus && g.some((s) => s.word === focus) ? 1 : 0);
  list.sort((a, b) => hasFocus(b) - hasFocus(a) || b.length - a.length || a[0].word.localeCompare(b[0].word));

  // 点線でつながる星座を、続けて置く（すでに置いた相手のそばに置くため）
  const groupOf = new Map<string, number>();
  list.forEach((g, i) => g.forEach((s) => groupOf.set(s.word, i)));
  const partners = list.map(() => new Set<number>());
  for (const l of lines) {
    if (!l.cross) continue;
    const g = groupOf.get(l.a);
    const h = groupOf.get(l.b);
    if (g === undefined || h === undefined || g === h) continue;
    partners[g].add(h);
    partners[h].add(g);
  }

  // 1. 星座ごとに、星の数に合った広さで形を決め、名前まで含めた外側の箱を測る
  const shapes = list.map((g) => {
    const set = new Set(g.map((s) => s.word));
    const side = 150 + 80 * Math.sqrt(g.length);
    const local = layoutConstellation(g, lines.filter((l) => set.has(l.a) && set.has(l.b)), { x: 0, y: 0, w: side, h: side }, focus && set.has(focus) ? focus : undefined, mags);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of local) {
      const b = starBox(s, 4);
      x0 = Math.min(x0, b.x);
      y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w);
      y1 = Math.max(y1, b.y + b.h);
    }
    return { local, x0, y0, w: x1 - x0, h: y1 - y0, seed: hash(g[0].word + '~') };
  });

  // 2. 大きい星座から順に、真ん中のまわりを、うず巻き状にたどって、ほかと重ならない最初の場所に置く
  //    （たどり始める向きを星座ごとにずらして、格子のように並ばないようにする）
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const hits = (x: number, y: number, w: number, h: number) =>
    placed.some((p) => x < p.x + p.w + SKY_GAP && p.x < x + w + SKY_GAP && y < p.y + p.h + SKY_GAP && p.y < y + h + SKY_GAP);
  shapes.forEach((sh, si) => {
    // 点線の相手がもう置いてあれば、その真ん中のまわりから探す（なければ、夜空の真ん中から）
    const near = [...partners[si]].filter((h) => h < si);
    const ox = near.length ? near.reduce((a, h) => a + placed[h].x + placed[h].w / 2, 0) / near.length : 0;
    const oy = near.length ? near.reduce((a, h) => a + placed[h].y + placed[h].h / 2, 0) / near.length : 0;
    let t = 0;
    const turn = sh.seed * Math.PI * 2;
    for (;;) {
      const r = 9 * t;
      const x = ox + Math.cos(t + turn) * r * Math.sqrt(SKY_ASPECT) - sh.w / 2;
      const y = oy + Math.sin(t + turn) * r / Math.sqrt(SKY_ASPECT) - sh.h / 2;
      if (!hits(x, y, sh.w, sh.h) || t > 400) {
        placed.push({ x, y, w: sh.w, h: sh.h });
        break;
      }
      t += 0.15;
    }
  });

  // 3. 全体の左上が、area の左上に来るようにずらす
  const minX = Math.min(...placed.map((p) => p.x));
  const minY = Math.min(...placed.map((p) => p.y));
  const maxX = Math.max(...placed.map((p) => p.x + p.w));
  const maxY = Math.max(...placed.map((p) => p.y + p.h));
  const stars: Star[] = [];
  shapes.forEach((sh, i) => {
    const dx = area.x + placed[i].x - minX - sh.x0;
    const dy = area.y + placed[i].y - minY - sh.y0;
    for (const s of sh.local) stars.push({ ...s, x: s.x + dx, y: s.y + dy });
  });
  const first = placed[0];
  const home = { x: area.x + first.x - minX + first.w / 2, y: area.y + first.y - minY + first.h / 2 };
  return { stars, extentW: area.x + (maxX - minX) + area.x, extentH: area.y + (maxY - minY) + 40, home };
}

// 星の芯の半径＝回数（1回 1.75px、20回で上限 5px）
export function starRadius(count: number): number {
  return Math.min(5, 1.4 + 0.35 * count);
}

// 星の名前の大きさ（9.5〜13px）。回数が多いほど少し大きい
export function labelSizeFor(count: number): number {
  return Math.min(13, 9.5 + 0.25 * count);
}

// 線の太さ・濃さは、「いま画面に出ている線の中での強さ」（0〜1）で決める。
// 出ている線の強さは 0.5〜0.8 くらいに集まるので、0〜1 のままだと、太さの違いが見えない（2026-10-09）。
// 出ている線の強さの幅が 0.25 より小さいときは、差を大きく見せすぎないよう、真ん中に寄せる
const MIN_SPAN = 0.25;
export function relativeStrength(lines: { strength: number }[]): (strength: number) => number {
  if (lines.length === 0) return () => 0.5;
  let lo = Infinity;
  let hi = -Infinity;
  for (const l of lines) {
    lo = Math.min(lo, l.strength);
    hi = Math.max(hi, l.strength);
  }
  const mid = (lo + hi) / 2;
  const span = Math.max(hi - lo, MIN_SPAN);
  return (strength) => Math.min(1, Math.max(0, 0.5 + (strength - mid) / span));
}

// 線の段階（1＝強い・2＝ふつう・3＝弱い）：描く骨組みの線の強さの順位で3等分する（星の等級と同じく、はっきりした段階で見せる。2026-10-10）
export function lineTiers(lines: StarLink[]): (strength: number) => Mag {
  const st = lines.filter((l) => !l.cross).map((l) => l.strength).sort((a, b) => b - a);
  if (st.length === 0) return () => 2;
  const hi = st[Math.min(st.length - 1, Math.floor(st.length / 3))];
  const lo = st[Math.min(st.length - 1, Math.floor((2 * st.length) / 3))];
  return (x) => (x > hi ? 1 : x > lo || st.length < 3 ? 2 : 3);
}

// 線の太さ（0.5〜3.6px）。rel は relativeStrength の値
export function lineWidth(rel: number): number {
  return 0.5 + 3.1 * rel;
}

// 線の濃さ（0.2〜0.75）。強いほど濃い
export function lineOpacity(rel: number): number {
  return 0.2 + 0.55 * rel;
}

function textWidth(word: string, size: number): number {
  let em = 0;
  for (const ch of word) em += ch.charCodeAt(0) < 0x300 ? 0.58 : 1;
  return em * size;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

// 星と名前（星の下）を合わせた箱。重なりの判定に使う
export function starBox(s: Star, padX = 0, padY = padX) {
  const w = Math.max(s.labelW, s.r * 2);
  return { x: s.x - w / 2 - padX, y: s.y - s.r - padY, w: w + padX * 2, h: s.r + 3 + s.labelH + padY * 2 };
}

const LABEL_GAP = 3;
// 箱同士の間隔。横に並んだ名前が1語に見えないよう、横は広めに空ける
const PAD_X = 5;
const PAD_Y = 1.5;
// 線でつながる星の理想の間隔（px）。星が少ないときに画面いっぱいに引き伸ばさない
const IDEAL_LEN = 64;
// 押し合う距離の上限（理想の間隔の何倍まで）と、中心へ引く強さ
const REPEL_RANGE = 2.5;
const GRAVITY = 0.12;
// 点線でつながる星座どうしを近づける強さ（星座の中の線の引き合いの何倍か）
const CROSS_PULL = 0.25;

// 力指向の配置: 線でつながる星は引き合い、どの星も押し合う。共起が強い組ほど近くに寄る。
// 壁の中で動かすと星が画面の端に貼りつくので、まず広さを気にせず動かし、入りきらないときだけ全体を縮めて真ん中に置く。
// 毎回同じ結果になるよう、最初の位置は言葉の hash で決める。focus は動かさず、ほかの星がそのまわりに並ぶ
// weak：まだ確かめている途中の線。星座の線より弱く引き合う（両はしの星が画面の端と端に離れて、長い点線にならないように 2026-10-10）
export function layoutConstellation(stats: WordStat[], lines: StarLink[], area: Area, focus?: string, mags: Map<string, Mag> = magnitudes(stats), weak: Link[] = []): Star[] {
  const cx = area.x + area.w / 2;
  const cy = area.y + area.h / 2;
  const k = Math.min(IDEAL_LEN, 0.8 * Math.sqrt((area.w * area.h) / Math.max(1, stats.length)));
  const stars: Star[] = stats.map((s) => {
    const mag = mags.get(s.word) ?? 3;
    const labelSize = MAG_SIZE[mag].label;
    const a = hash(s.word) * Math.PI * 2;
    const rr = k * 2 * Math.sqrt(hash(s.word + '#'));
    return {
      ...s,
      mag,
      x: Math.cos(a) * rr,
      y: Math.sin(a) * rr,
      r: MAG_SIZE[mag].r,
      labelSize,
      labelW: textWidth(s.word, labelSize) + 2,
      labelH: Math.ceil(labelSize * 1.35),
    };
  });
  const n = stars.length;
  if (n === 0) return stars;
  const index = new Map(stars.map((s, i) => [s.word, i]));
  const pinned = focus ? index.get(focus) : undefined;
  if (pinned !== undefined) {
    stars[pinned].x = 0;
    stars[pinned].y = 0;
  }

  // 引き合うのは、星座の骨組みの線だけ（またぐ線は点線で描くだけ。骨組みでない線で引き合うと、まるく固まって星座らしくならない）
  const edges = skeleton(lines).map((l) => ({ i: index.get(l.a)!, j: index.get(l.b)!, w: 0.6 + 0.4 * Math.min(1, Math.max(0, l.strength)) }));
  // 星座（実線でつながる星の集まり）。点線でつながる星座どうしは、星座ごと（形を変えずに）近づける（点線が長く、ほかの星座の上を通らないように。2026-10-10）
  const comp = Array.from({ length: n }, (_, i) => i);
  const root = (i: number): number => (comp[i] === i ? i : (comp[i] = root(comp[i])));
  for (const { i, j } of edges) comp[root(i)] = root(j);
  const members = new Map<number, number[]>();
  for (let i = 0; i < n; i++) members.set(root(i), [...(members.get(root(i)) ?? []), i]);
  // 星座の組ごとに、いちばん強い点線（画面に描く1本）の両はしの星どうしを近づける
  const strongest = new Map<string, { i: number; j: number; s: number }>();
  for (const l of lines) {
    if (!l.cross || !index.has(l.a) || !index.has(l.b)) continue;
    const i = index.get(l.a)!;
    const j = index.get(l.b)!;
    if (root(i) === root(j)) continue;
    const key = `${Math.min(root(i), root(j))}-${Math.max(root(i), root(j))}`;
    if (!strongest.has(key) || l.strength > strongest.get(key)!.s) strongest.set(key, { i, j, s: l.strength });
  }
  const bridges = [...strongest.values()];
  for (const l of weak) if (index.has(l.a) && index.has(l.b)) edges.push({ i: index.get(l.a)!, j: index.get(l.b)!, w: 0.3 });
  // 縦長の画面に合わせ、縦方向は押し合いを強め、中心へ引く力を弱める
  const aspect = Math.min(1.8, Math.max(1, area.h / area.w));

  const ITER = 400;
  for (let it = 0; it < ITER; it++) {
    const temp = k * 0.6 * (1 - it / ITER) + 0.2;
    const dx = new Float64Array(n);
    const dy = new Float64Array(n);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        let ex = stars[i].x - stars[j].x;
        let ey = (stars[i].y - stars[j].y) / aspect;
        let d = Math.hypot(ex, ey);
        if (d < 0.01) {
          ex = hash(`${i}-${j}`) - 0.5;
          ey = 0.5 - hash(`${j}-${i}`);
          d = Math.hypot(ex, ey);
        }
        // 遠い星同士は押し合わない（離れた組同士が際限なく遠ざかり、縮めたときに各組が小さく固まるのを防ぐ）
        if (d > REPEL_RANGE * k) continue;
        const f = (k * k) / d;
        dx[i] += (ex / d) * f;
        dy[i] += (ey / d) * f * aspect;
        dx[j] -= (ex / d) * f;
        dy[j] -= (ey / d) * f * aspect;
      }
    for (const { i, j, w } of edges) {
      const ex = stars[i].x - stars[j].x;
      const ey = stars[i].y - stars[j].y;
      const d = Math.max(0.01, Math.hypot(ex, ey));
      const f = ((d * d) / k) * w;
      dx[i] -= (ex / d) * f;
      dy[i] -= (ey / d) * f;
      dx[j] += (ex / d) * f;
      dy[j] += (ey / d) * f;
    }
    for (const { i: bi, j: bj } of bridges) {
      const mg = members.get(root(bi))!;
      const mh = members.get(root(bj))!;
      const ex = stars[bi].x - stars[bj].x;
      const ey = stars[bi].y - stars[bj].y;
      const d = Math.max(0.01, Math.hypot(ex, ey));
      const f = ((d * d) / k) * CROSS_PULL;
      for (const m of mg) {
        dx[m] -= (ex / d) * f;
        dy[m] -= (ey / d) * f;
      }
      for (const m of mh) {
        dx[m] += (ex / d) * f;
        dy[m] += (ey / d) * f;
      }
    }
    for (let i = 0; i < n; i++) {
      if (i === pinned) continue;
      // 中心へ弱く引く（つながりのない星の組が遠くへ飛ばないように）
      dx[i] -= stars[i].x * GRAVITY;
      dy[i] -= (stars[i].y * GRAVITY) / aspect;
      const d = Math.hypot(dx[i], dy[i]);
      if (d > 0) {
        stars[i].x += (dx[i] / d) * Math.min(d, temp);
        stars[i].y += (dy[i] / d) * Math.min(d, temp);
      }
    }
  }

  // 画面に入りきらないときだけ縮める（名前の大きさは変えない）。縮める中心は全体の真ん中
  const half = (s: Star) => Math.max(s.labelW, s.r * 2) / 2 + PAD_X;
  const originX = (Math.min(...stars.map((s) => s.x)) + Math.max(...stars.map((s) => s.x))) / 2;
  const originY = (Math.min(...stars.map((s) => s.y)) + Math.max(...stars.map((s) => s.y))) / 2;
  let scale = 1;
  for (const s of stars) {
    const rx = Math.abs(s.x - originX);
    const up = originY - s.y;
    const down = s.y - originY;
    if (rx > 0) scale = Math.min(scale, (area.w / 2 - half(s)) / rx);
    if (up > 0) scale = Math.min(scale, (area.h / 2 - s.r - PAD_Y) / up);
    if (down > 0) scale = Math.min(scale, (area.h / 2 - s.r - LABEL_GAP - s.labelH - PAD_Y) / down);
  }
  scale = Math.max(0.2, scale);
  for (const s of stars) {
    s.x = cx + (s.x - originX) * scale;
    s.y = cy + (s.y - originY) * scale;
  }
  // focus はできるだけ画面の中心へ。全体を平行に動かし、どの星も範囲からはみ出さない分だけ寄せる
  if (pinned !== undefined) {
    const f = stars[pinned];
    const room = (lo: number, hi: number, want: number) => Math.min(hi, Math.max(lo, want));
    const shiftX = room(
      Math.max(...stars.map((s) => area.x + half(s) - s.x)),
      Math.min(...stars.map((s) => area.x + area.w - half(s) - s.x)),
      cx - f.x,
    );
    const shiftY = room(
      Math.max(...stars.map((s) => area.y + s.r + PAD_Y - s.y)),
      Math.min(...stars.map((s) => area.y + area.h - s.r - LABEL_GAP - s.labelH - PAD_Y - s.y)),
      cy - f.y,
    );
    for (const s of stars) {
      s.x += shiftX;
      s.y += shiftY;
    }
  }

  const clamp = (s: Star) => {
    const hw = Math.max(s.labelW, s.r * 2) / 2;
    s.x = Math.min(area.x + area.w - hw, Math.max(area.x + hw, s.x));
    s.y = Math.min(area.y + area.h - s.r - LABEL_GAP - s.labelH, Math.max(area.y + s.r, s.y));
  };
  stars.forEach(clamp);

  // 名前同士の重なりをほどく（重なった組を、ずれの小さい向きへ押し分ける）
  for (let pass = 0; pass < 200; pass++) {
    let moved = false;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const a = starBox(stars[i], PAD_X / 2, PAD_Y / 2);
        const b = starBox(stars[j], PAD_X / 2, PAD_Y / 2);
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        // 中心に留めた星は動かさず、相手だけを押す
        const si = i === pinned ? 0 : j === pinned ? 1 : 0.5;
        if (ox < oy) {
          const sgn = a.x + a.w / 2 < b.x + b.w / 2 ? -1 : 1;
          stars[i].x += sgn * ox * si;
          stars[j].x -= sgn * ox * (1 - si);
        } else {
          const sgn = a.y + a.h / 2 < b.y + b.h / 2 ? -1 : 1;
          stars[i].y += sgn * oy * si;
          stars[j].y -= sgn * oy * (1 - si);
        }
        clamp(stars[i]);
        clamp(stars[j]);
      }
    if (!moved) break;
  }
  return stars;
}
