import { MIN_CO, cooccurrence, labelGroups, significantLinks, type Line, type Link } from './communities';
import { aggregate, type WordStat } from './wordCloud';

// ふりかえり（共起ネットワーク）の計算。RN に依存しないので node で検証できる。
// 言葉＝星、偶然では起きにくい「同じ日に一緒に拾った」関係＝細い金色の線。星の大きさ＝拾った回数、線の太さ・星どうしの引き合う力＝つながりの強さ


export type Star = WordStat & {
  x: number;
  y: number;
  r: number;
  labelSize: number;
  labelW: number;
  labelH: number;
};

export type Area = { x: number; y: number; w: number; h: number };

export { MIN_CO, cooccurrence, type Line, type Link };
// cross: 別のまとまりをつなぐ線。画面にはうすい点線で出し、星は引き寄せない
export type StarLink = Link & { cross: boolean };
// 星の数と線の数の上限（1画面に、名前が読める量。仮の値：6週間の記録で上限が効き始めるため、26・38に増やした。画面で見て調整する）
export type Caps = { stars: number; lines: number; perStar: number };
export const NORMAL_CAPS: Caps = { stars: 26, lines: 38, perStar: 5 }; // 1画面に収める
// 上限を超える記録のとき（たくさん記録する人）は、夜空を、画面より大きくして、なぞって動かせるようにする（試作 2026-10-09）
export const WIDE_CAPS: Caps = { stars: 60, lines: 150, perStar: 3 };
const MAX_STARS = NORMAL_CAPS.stars;

// 見せる星と線を選ぶ。偶然では起きにくい組（検定）だけを線の候補にして、つながりの強さ（コサイン類似度）の強い順に採り、星の数・1つの星の線の数が上限を超えるものは飛ばす。
// focus（拾ったことばでタップした言葉）は線がなくても必ず出し、その言葉の線を先に採る
export function selectConstellation(
  captures: { word: string; strength: number; capturedAt: number }[],
  focus?: string,
  caps: Caps = NORMAL_CAPS,
): { stats: WordStat[]; lines: StarLink[]; truncated: boolean } {
  const all = aggregate(captures);
  const statOf = new Map(all.map((s) => [s.word, s]));
  // まとまりは、上限で切る前の、偶然ではない線の全部で決める。回数の多い言葉から順に見る
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
  const degree = new Map<string, number>();
  const lines: StarLink[] = [];
  let truncated = false; // 上限で切った線があるか
  for (const l of candidates) {
    if (lines.length >= caps.lines) {
      truncated = true;
      break;
    }
    if ((degree.get(l.a) ?? 0) >= caps.perStar || (degree.get(l.b) ?? 0) >= caps.perStar) {
      truncated = true;
      continue;
    }
    const added = (words.has(l.a) ? 0 : 1) + (words.has(l.b) ? 0 : 1);
    if (words.size + added > caps.stars) {
      truncated = true;
      continue;
    }
    words.add(l.a);
    words.add(l.b);
    degree.set(l.a, (degree.get(l.a) ?? 0) + 1);
    degree.set(l.b, (degree.get(l.b) ?? 0) + 1);
    lines.push(l);
  }
  // 点線（星座をまたぐ線）は、星に触れたときだけ出す。星座の線が1本もない星は、ふだんは出さない（点線の相手の星が、1つだけ浮かないように）
  const inConstellation = new Set(lines.filter((l) => !l.cross).flatMap((l) => [l.a, l.b]));
  if (focus && statOf.has(focus)) inConstellation.add(focus);
  const kept = lines.filter((l) => inConstellation.has(l.a) && inConstellation.has(l.b));
  return { stats: [...inConstellation].map((w) => statOf.get(w)!), lines: kept, truncated };
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
): { stars: Star[]; extentW: number; extentH: number; home?: { x: number; y: number } } {
  const solid = lines.filter((l) => !l.cross);
  const parent = new Map<string, string>(stats.map((s) => [s.word, s.word]));
  const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
  for (const l of solid) parent.set(find(l.a), find(l.b));
  const comps = new Map<string, WordStat[]>();
  for (const s of stats) comps.set(find(s.word), [...(comps.get(find(s.word)) ?? []), s]);
  const list = [...comps.values()];
  if (stats.length <= MAX_STARS || list.length <= 3) {
    return { stars: layoutConstellation(stats, lines, area, focus), extentW: area.x + area.w + area.x, extentH: area.y + area.h };
  }
  // 拾ったことばから来た言葉の星座を最初に、あとは星の多い順（大きいものから置くと、すき間に小さいものが入る）
  const hasFocus = (g: WordStat[]) => (focus && g.some((s) => s.word === focus) ? 1 : 0);
  list.sort((a, b) => hasFocus(b) - hasFocus(a) || b.length - a.length || a[0].word.localeCompare(b[0].word));

  // 1. 星座ごとに、星の数に合った広さで形を決め、名前まで含めた外側の箱を測る
  const shapes = list.map((g) => {
    const set = new Set(g.map((s) => s.word));
    const side = 150 + 80 * Math.sqrt(g.length);
    const local = layoutConstellation(g, lines.filter((l) => set.has(l.a) && set.has(l.b)), { x: 0, y: 0, w: side, h: side }, focus && set.has(focus) ? focus : undefined);
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
  for (const sh of shapes) {
    let t = 0;
    const turn = sh.seed * Math.PI * 2;
    for (;;) {
      const r = 9 * t;
      const x = Math.cos(t + turn) * r * Math.sqrt(SKY_ASPECT) - sh.w / 2;
      const y = Math.sin(t + turn) * r / Math.sqrt(SKY_ASPECT) - sh.h / 2;
      if (!hits(x, y, sh.w, sh.h) || t > 400) {
        placed.push({ x, y, w: sh.w, h: sh.h });
        break;
      }
      t += 0.15;
    }
  }

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

// 力指向の配置: 線でつながる星は引き合い、どの星も押し合う。共起が強い組ほど近くに寄る。
// 壁の中で動かすと星が画面の端に貼りつくので、まず広さを気にせず動かし、入りきらないときだけ全体を縮めて真ん中に置く。
// 毎回同じ結果になるよう、最初の位置は言葉の hash で決める。focus は動かさず、ほかの星がそのまわりに並ぶ
export function layoutConstellation(stats: WordStat[], lines: StarLink[], area: Area, focus?: string): Star[] {
  const cx = area.x + area.w / 2;
  const cy = area.y + area.h / 2;
  const k = Math.min(IDEAL_LEN, 0.8 * Math.sqrt((area.w * area.h) / Math.max(1, stats.length)));
  const stars: Star[] = stats.map((s) => {
    const labelSize = labelSizeFor(s.count);
    const a = hash(s.word) * Math.PI * 2;
    const rr = k * 2 * Math.sqrt(hash(s.word + '#'));
    return {
      ...s,
      x: Math.cos(a) * rr,
      y: Math.sin(a) * rr,
      r: starRadius(s.count),
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

  // 引き合うのは、同じまとまりの線だけ（またぐ線は、点線で描くだけ）
  const edges = lines.filter((l) => !l.cross).map((l) => ({ i: index.get(l.a)!, j: index.get(l.b)!, w: 0.6 + 0.4 * Math.min(1, Math.max(0, l.strength)) }));
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
