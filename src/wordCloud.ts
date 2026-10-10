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
const HALO_EXTRA_R = 56;
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

// 文字の大きさ＝回数（1回ごとに2px、上限あり）。2026-10-10 から夕空では使わず、下の段階（sizeTiers）にした
export function fontSizeFor(count: number): number {
  return Math.min(MAX_SIZE, MIN_SIZE + count * 2);
}

// 文字の大きさの段階：その夕空の中で、拾った回数の順位で5段階（上位10%＝特大、次の15%＝大、次の25%＝中、次の25%＝小、残り＝最小）。
// 少しずつ大きくすると、場所に合わせて縮んだとき差が見えなかった（ユーザー「ワードクラウドだと、かなり大きいことばも出る」「それでいこうか」2026-10-10）。
// はじめ3段階（28/19/15）にしたが、スマホで見て「５段階ぐらいあるといいかも」→ 5段階に（2026-10-10）。
// 星空の星の等級と同じ考え方。Galaxy S20 で一番小さい文字が12px以上になるように測って決めた
export const SIZE_TIER = [34, 27, 21, 17, 13] as const;
const SIZE_TIER_UPTO = [0.1, 0.25, 0.5, 0.75, 1];
export function sizeTiers(stats: WordStat[]): (s: WordStat) => number {
  const ranked = [...stats].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
  const size = new Map(
    ranked.map((s, i) => [s.word, SIZE_TIER[SIZE_TIER_UPTO.findIndex((f) => i < Math.ceil(ranked.length * f))]]),
  );
  return (s) => size.get(s.word) ?? SIZE_TIER[SIZE_TIER.length - 1];
}

// 光の段階：水辺で長押ししたときの「光の粒」の数（強さ 0〜1 を5つの粒に。2秒で5つ）にそろえる。強さは1回あたりの平均。
// 粒1つ＝光らない、2つ＝うっすら光る（キラキラなし）、3つ＝小さく光る＋少しキラキラ、4つ＝大きめ、5つ＝一番大きく強くキラキラ。
// （ユーザー「川辺で拾う言葉のつよさ５だんかいあるよね」→ はじめは3段階、スマホで見て「ひかりも」5段階に 2026-10-10）
export function dotsFor(avgStrength: number): number {
  return Math.min(5, Math.floor(clamp01(avgStrength) * 5) + 1);
}
const GLOW_BY_DOTS = [0, 0.25, 0.45, 0.7, 1];
export function glowTier(avgStrength: number): number {
  return GLOW_BY_DOTS[dotsFor(avgStrength) - 1];
}
// 文字そのもののキラキラ（光る写し）の強さ。粒2つは周りの光だけでキラキラさせない。4と5の差が見えるように開ける
const SPARKLE_BY_DOTS = [0, 0, 0.3, 0.6, 1];

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

// 種類（色）ごとの区画。3段×2列（左上から、感情・身体感覚／状況・場面・価値観・欲求／好奇心・していること）。決定 2026-10-09
// 言葉の量に合わせて、段の高さと列の幅を決める。言葉は、自分の種類の区画の中だけに置く
const CATEGORY_ROWS: [Category, Category][] = [
  ['emotion', 'body'],
  ['situation', 'value'],
  ['curiosity', 'doing'],
];
const REGION_GAP = 8;

type Region = { x: number; y: number; w: number; h: number };

// 言葉の量（文字の大きさに合わせた、必要な広さ）で、6つの区画の大きさを決める
function regionsFor(boxes: Map<Category, { w: number; h: number }[]>, area: Area): Map<Category, Region> {
  const need = (c: Category) => (boxes.get(c) ?? []).reduce((n, b) => n + (b.w + 14) * (b.h + 8) * 1.5, 0) + 1500;
  const widest = (c: Category) => Math.max(0, ...(boxes.get(c) ?? []).map((b) => b.w + 4));
  const rowNeed = CATEGORY_ROWS.map(([a, b]) => need(a) + need(b));
  const total = rowNeed.reduce((n, v) => n + v, 0);
  const out = new Map<Category, Region>();
  let y = area.y;
  CATEGORY_ROWS.forEach(([a, b], i) => {
    const h = (area.h - REGION_GAP * (CATEGORY_ROWS.length - 1)) * (rowNeed[i] / total);
    // 幅は量の割合で分けるが、いちばん長い言葉が入る幅は必ず残す（細い区画に長い言葉が入らず、全体を縮めていた 2026-10-10）
    const free = area.w - REGION_GAP;
    const minA = Math.min(widest(a), free / 2);
    const minB = Math.min(widest(b), free / 2);
    const wa = Math.min(free - minB, Math.max(minA, free * (need(a) / (need(a) + need(b)))));
    out.set(a, { x: area.x, y, w: wa, h });
    out.set(b, { x: area.x + wa + REGION_GAP, y, w: area.w - REGION_GAP - wa, h });
    y += h + REGION_GAP;
  });
  return out;
}

// 大きい言葉から順に、その言葉の種類の区画の真ん中から、渦を巻くように空いている場所へ置く。
// 位置は「種類」の目安（くわしい意味はない）。入りきらないときは全体を同じ割合で縮める（大きさの比は変えない）
// look：文字の大きさ（size）と光（glow 0〜1）の決め方を外から変える（見比べるため。ないときは今の決め方）
export type CloudLook = { size: (s: WordStat) => number; glow: (s: WordStat) => number };
export function layoutWords(stats: WordStat[], area: Area, look: CloudLook = { size: sizeTiers(stats), glow: (s) => glowTier(s.avgStrength) }): { placed: Placed[]; scale: number; dropped: string[] } {
  const order = [...stats].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));

  let scale = 1;
  for (let attempt = 0; attempt < 30; attempt++) {
    const placed: Placed[] = [];
    const boxesByCategory = new Map<Category, Rect[]>();
    const dropped: string[] = [];
    const sizes = new Map<Category, { w: number; h: number }[]>();
    for (const s of order) {
      const size = look.size(s) * scale;
      const list = sizes.get(s.category) ?? [];
      list.push({ w: textWidth(s.word, size) + 4, h: size * 1.4 });
      sizes.set(s.category, list);
    }
    const regions = regionsFor(sizes, area);
    const boxesOf = (c: Category) => boxesByCategory.get(c) ?? boxesByCategory.set(c, []).get(c)!;
    // bounds の中で、区画の真ん中から渦を巻くように、others と重ならない場所を探す
    const place = (s: WordStat, bounds: Region, others: Rect[]) => {
      const size = look.size(s) * scale;
      const w = textWidth(s.word, size) + 4;
      const h = size * 1.4;
      const k = look.glow(s);
      const haloR = k > 0 ? (HALO_MIN_R + HALO_EXTRA_R * k) * scale : 0;
      const haloOpacity = 0.85 * k * HALO_TINT[s.category];
      // 光が文字より外へ出る分の一部を、置き場所の判定に含める（どの言葉の光か分からなくならないように）
      const px = Math.max(0, haloR - w / 2) * HALO_KEEP;
      const py = Math.max(0, haloR - h / 2) * HALO_KEEP;
      const phase = hash(s.word) * Math.PI * 2;
      const region = regions.get(s.category)!;
      const cx = region.x + region.w / 2;
      const cy = region.y + region.h / 2;
      for (let i = 0; i < 2400; i++) {
        const r = 7 * Math.sqrt(i);
        const ang = phase + i * 2.399963;
        const x = cx + Math.cos(ang) * r * 1.5 - w / 2;
        const y = cy + Math.sin(ang) * r - h / 2;
        if (x < bounds.x || y < bounds.y || x + w > bounds.x + bounds.w || y + h > bounds.y + bounds.h) continue;
        const box = { x: x - px, y: y - py, w: w + px * 2, h: h + py * 2 };
        if (others.some((b) => overlaps(box, b, scale * scale))) continue;
        boxesOf(s.category).push(box);
        placed.push({
          ...s,
          x,
          y,
          w,
          h,
          size,
          textOpacity: textOpacityFor(s.avgStrength),
          sparkle: SPARKLE_BY_DOTS[dotsFor(s.avgStrength) - 1],
          haloR,
          haloOpacity,
          group: Math.floor(hash(s.word + '#') * SPARKLE_GROUPS),
        });
        return true;
      }
      return false;
    };
    const later: WordStat[] = [];
    for (const s of order) if (!place(s, regions.get(s.category)!, boxesOf(s.category))) later.push(s);
    // 自分の区画に入らない言葉は、同じ段の隣の区画にはみ出してよい（区画が小さいだけで全体を縮めないように 2026-10-10）
    for (const s of later) {
      const row = CATEGORY_ROWS.find((r) => r.includes(s.category))!;
      const [ra, rb] = row.map((c) => regions.get(c)!);
      const bounds = { x: ra.x, y: ra.y, w: rb.x + rb.w - ra.x, h: ra.h };
      if (!place(s, bounds, [...boxesOf(row[0]), ...boxesOf(row[1])])) dropped.push(s.word);
    }
    if (dropped.length === 0 || attempt === 29) return { placed, scale, dropped };
    // 少しずつ縮める（大きく縮めると、入るはずの大きさより小さくなる）
    scale *= 0.97;
  }
  return { placed: [], scale, dropped: order.map((s) => s.word) };
}
