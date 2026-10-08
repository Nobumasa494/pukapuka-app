import { CATEGORY_LABEL, WORD_CATEGORY, type Category } from './words';

export type WordStat = { word: string; category: Category; count: number; avgStrength: number };

export type Placed = WordStat & {
  x: number;
  y: number;
  w: number;
  h: number;
  size: number;
  textOpacity: number;
  sparkle: number;
  group: number;
  haloR: number;
  haloOpacity: number;
};

// 文字のきらめきは、時間をずらした数グループに分けてまたたかせる（言葉ごとにアニメーションを持たせない）
export const SPARKLE_GROUPS = 3;

export type Area = { x: number; y: number; w: number; h: number };

// 文字と光の色＝カテゴリ。ブルーアワーの空で読める淡い色（ネオンにしない）
export const CATEGORY_COLOR: Record<Category, [number, number, number]> = {
  emotion: [246, 178, 194],
  body: [248, 200, 150],
  situation: [170, 204, 238],
  value: [242, 222, 150],
  curiosity: [178, 232, 208],
  doing: [201, 182, 239],
};

export const LEGEND = (Object.keys(CATEGORY_LABEL) as Category[]).map((c) => ({
  category: c,
  label: CATEGORY_LABEL[c],
  color: CATEGORY_COLOR[c],
}));

const MIN_SIZE = 16;
const MAX_SIZE = 40;

// 周りの光の広がりは強さだけで決める（文字の大きさに比例させると、大きい言葉ほど光も大きくなり回数と混ざる）
const HALO_MIN_R = 16;
const HALO_EXTRA_R = 40;
// 青は空と同系色で強く光って見えやすい（NG「強い青発光」）ので控えめにする
const HALO_TINT: Record<Category, number> = { emotion: 1, body: 1, situation: 0.75, value: 1, curiosity: 1, doing: 1 };
// 光の4分の3ほどは隣と重なってよい（全部避けると間が空きすぎる）
const HALO_KEEP = 0.25;

export function aggregate(captures: { word: string; strength: number }[]): WordStat[] {
  const map = new Map<string, { sum: number; count: number }>();
  for (const c of captures) {
    const cur = map.get(c.word) ?? { sum: 0, count: 0 };
    cur.sum += c.strength;
    cur.count += 1;
    map.set(c.word, cur);
  }
  const out: WordStat[] = [];
  for (const [word, { sum, count }] of map) {
    const category = WORD_CATEGORY[word];
    if (!category) continue;
    out.push({ word, category, count, avgStrength: sum / count });
  }
  return out;
}

// 画面に出す言葉の上限（言葉が多いと、文字が小さくなったり、入りきらずに消えたりするため。仮の値）
export const MAX_WORDS = 30;
// 上限を超えるときの選び方：回数の多い言葉（口ぐせ）を2/3、残りから強く押した言葉（本音かも）を1/3
export function selectWords(stats: WordStat[], max = MAX_WORDS): WordStat[] {
  if (stats.length <= max) return stats;
  const byCount = [...stats].sort((a, b) => b.count - a.count || b.avgStrength - a.avgStrength || a.word.localeCompare(b.word));
  const habit = byCount.slice(0, Math.ceil((max * 2) / 3));
  const rest = byCount.slice(habit.length).sort((a, b) => b.avgStrength - a.avgStrength || b.count - a.count || a.word.localeCompare(b.word));
  return [...habit, ...rest.slice(0, max - habit.length)];
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// 文字の大きさ＝回数（1回ごとに2px、上限あり）
export function fontSizeFor(count: number): number {
  return Math.min(MAX_SIZE, MIN_SIZE + count * 2);
}

// 文字はカテゴリの色。読みやすさを優先し、強さはほんのり濃さに出すだけ
export function textOpacityFor(avgStrength: number): number {
  return 0.78 + 0.22 * clamp01(avgStrength);
}

// キラキラの度合い＝強さ（0〜1）。弱い言葉（0.25以下）は光らない
export function sparkleLevel(avgStrength: number): number {
  return clamp01((avgStrength - 0.25) / 0.75);
}

function textWidth(word: string, size: number): number {
  let em = 0;
  for (const ch of word) em += ch.charCodeAt(0) < 0x300 ? 0.58 : 1;
  return em * size;
}

function hash(word: string): number {
  let h = 2166136261;
  for (let i = 0; i < word.length; i++) h = Math.imul(h ^ word.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

// 詰めて並べると「単純なワードクラウド」に見えるので、空に散らばる程度に間を空ける
const GAP_X = 12;
const GAP_Y = 8;

type Rect = { x: number; y: number; w: number; h: number };

function overlaps(a: Rect, b: Rect, k: number) {
  const gx = GAP_X * k;
  const gy = GAP_Y * k;
  return a.x < b.x + b.w + gx && b.x < a.x + a.w + gx && a.y < b.y + b.h + gy && b.y < a.y + a.h + gy;
}

// 種類（色）ごとに、画面を6つに分けた区画の中心（面積に対する割合。左右 0〜1、上下 0〜1）。決定 2026-10-09
// 同じ色の言葉が、近くに集まる。区画の境目はなく、言葉が多い種類は、まわりへ広がる
const CATEGORY_CENTER: Record<Category, [number, number]> = {
  emotion: [0.27, 0.22],
  body: [0.73, 0.22],
  situation: [0.27, 0.52],
  value: [0.73, 0.52],
  curiosity: [0.27, 0.82],
  doing: [0.73, 0.82],
};

// 大きい言葉から順に、その言葉の種類の区画の中心から、渦を巻くように空いている場所へ置く。
// 位置は「種類」の目安（くわしい意味はない）。入りきらないときは全体を同じ割合で縮める（大きさの比は変えない）
export function layoutWords(stats: WordStat[], area: Area): { placed: Placed[]; scale: number; dropped: string[] } {
  const order = [...stats].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));

  let scale = 1;
  for (let attempt = 0; attempt < 10; attempt++) {
    const placed: Placed[] = [];
    const boxes: Rect[] = [];
    const dropped: string[] = [];
    for (const s of order) {
      const size = fontSizeFor(s.count) * scale;
      const w = textWidth(s.word, size) + 4;
      const h = size * 1.4;
      const k = sparkleLevel(s.avgStrength);
      const haloR = k > 0 ? (HALO_MIN_R + HALO_EXTRA_R * k) * scale : 0;
      const haloOpacity = 0.7 * k * HALO_TINT[s.category];
      // 光が文字より外へ出る分の一部を、置き場所の判定に含める（どの言葉の光か分からなくならないように）
      const px = Math.max(0, haloR - w / 2) * HALO_KEEP;
      const py = Math.max(0, haloR - h / 2) * HALO_KEEP;
      const phase = hash(s.word) * Math.PI * 2;
      const [fx, fy] = CATEGORY_CENTER[s.category];
      const cx = area.x + area.w * fx;
      const cy = area.y + area.h * fy;
      let found = false;
      for (let i = 0; i < 2400 && !found; i++) {
        const r = 9 * Math.sqrt(i);
        const ang = phase + i * 2.399963;
        const x = cx + Math.cos(ang) * r * 1.5 - w / 2;
        const y = cy + Math.sin(ang) * r - h / 2;
        if (x < area.x || y < area.y || x + w > area.x + area.w || y + h > area.y + area.h) continue;
        const box = { x: x - px, y: y - py, w: w + px * 2, h: h + py * 2 };
        if (boxes.some((b) => overlaps(box, b, scale * scale))) continue;
        boxes.push(box);
        placed.push({
          ...s,
          x,
          y,
          w,
          h,
          size,
          textOpacity: textOpacityFor(s.avgStrength),
          sparkle: k,
          haloR,
          haloOpacity,
          group: Math.floor(hash(s.word + '#') * SPARKLE_GROUPS),
        });
        found = true;
      }
      if (!found) dropped.push(s.word);
    }
    if (dropped.length === 0 || attempt === 9) return { placed, scale, dropped };
    scale *= 0.93;
  }
  return { placed: [], scale, dropped: order.map((s) => s.word) };
}
