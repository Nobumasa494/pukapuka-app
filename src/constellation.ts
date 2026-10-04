import { dayKey } from './period';
import { aggregate, type WordStat } from './wordCloud';

// ふりかえり（共起ネットワーク）の計算。RN に依存しないので node で検証できる。
// 言葉＝星、同じ日に一緒に拾った関係＝細い金色の線。星の大きさ＝拾った回数、線の太さ＝共起回数

export type Line = { a: string; b: string; count: number };

export type Star = WordStat & {
  x: number;
  y: number;
  r: number;
  labelSize: number;
  labelW: number;
  labelH: number;
};

export type Area = { x: number; y: number; w: number; h: number };

// 線を出す共起回数の下限（1回だけ一緒だった組は偶然が多いので出さない）
export const MIN_CO = 2;
// 星の数と線の数の上限（SE の画面で名前が読める量）
const MAX_STARS = 22;
const MAX_LINES = 34;
// 1つの星から出す線の上限。よく拾う言葉が全部とつながる「団子」を防ぐ
const MAX_LINES_PER_STAR = 5;

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

// 見せる星と線を選ぶ。強い線から順に採り、星の数・1つの星の線の数が上限を超えるものは飛ばす。
// focus（拾ったことばでタップした言葉）は線がなくても必ず出し、その言葉の線を先に採る
export function selectConstellation(
  captures: { word: string; strength: number; capturedAt: number }[],
  focus?: string,
): { stats: WordStat[]; lines: Line[] } {
  const all = aggregate(captures);
  const statOf = new Map(all.map((s) => [s.word, s]));
  const candidates = cooccurrence(captures)
    .filter((l) => l.count >= MIN_CO && statOf.has(l.a) && statOf.has(l.b))
    .sort((p, q) => {
      const pf = p.a === focus || p.b === focus ? 1 : 0;
      const qf = q.a === focus || q.b === focus ? 1 : 0;
      return qf - pf || q.count - p.count || `${p.a}${p.b}`.localeCompare(`${q.a}${q.b}`);
    });

  const words = new Set<string>(focus && statOf.has(focus) ? [focus] : []);
  const degree = new Map<string, number>();
  const lines: Line[] = [];
  for (const l of candidates) {
    if (lines.length >= MAX_LINES) break;
    if ((degree.get(l.a) ?? 0) >= MAX_LINES_PER_STAR || (degree.get(l.b) ?? 0) >= MAX_LINES_PER_STAR) continue;
    const added = (words.has(l.a) ? 0 : 1) + (words.has(l.b) ? 0 : 1);
    if (words.size + added > MAX_STARS) continue;
    words.add(l.a);
    words.add(l.b);
    degree.set(l.a, (degree.get(l.a) ?? 0) + 1);
    degree.set(l.b, (degree.get(l.b) ?? 0) + 1);
    lines.push(l);
  }
  return { stats: [...words].map((w) => statOf.get(w)!), lines };
}

// 星の芯の半径＝回数（1回 1.75px、20回で上限 5px）
export function starRadius(count: number): number {
  return Math.min(5, 1.4 + 0.35 * count);
}

// 星の名前の大きさ（9.5〜13px）。回数が多いほど少し大きい
export function labelSizeFor(count: number): number {
  return Math.min(13, 9.5 + 0.25 * count);
}

// 線の太さ＝共起回数（2回 0.6px から、1回ごとに太く、上限 2px）
export function lineWidth(count: number): number {
  return Math.min(2, 0.6 + 0.28 * (count - MIN_CO));
}

// 線の濃さ（0.28〜0.5）
export function lineOpacity(count: number): number {
  return Math.min(0.5, 0.28 + 0.05 * (count - MIN_CO));
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
export function layoutConstellation(stats: WordStat[], lines: Line[], area: Area, focus?: string): Star[] {
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

  const edges = lines.map((l) => ({ i: index.get(l.a)!, j: index.get(l.b)!, w: 0.6 + 0.4 * Math.min(1, (l.count - 1) / 5) }));
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
