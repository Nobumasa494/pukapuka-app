import riverData from './data/riverPath.json';

// 背景動画の元サイズ（Blender の書き出し解像度）
export const VIDEO_W = 1080;
export const VIDEO_H = 1920;

export type VideoRect = { left: number; top: number; width: number; height: number };

export type PathPoint = {
  x: number;      // 画面 px
  y: number;      // 画面 px
  halfw: number;  // 川幅の半分（画面 px）
  t: number;      // 0=奥 1=手前
};

export type RiverPath = {
  rect: VideoRect;
  length: number;
  at: (s: number) => PathPoint;
};

// contentFit="cover" と同じ切り取り方。泡の座標も必ずこの rect で動画に合わせる
export function coverRect(screenW: number, screenH: number): VideoRect {
  const scale = Math.max(screenW / VIDEO_W, screenH / VIDEO_H);
  const width = VIDEO_W * scale;
  const height = VIDEO_H * scale;
  return { left: (screenW - width) / 2, top: (screenH - height) / 2, width, height };
}

export function buildRiverPath(screenW: number, screenH: number): RiverPath {
  const rect = coverRect(screenW, screenH);
  const raw = riverData.points as [number, number, number][];
  const pts = raw.map(([x, y, hw]) => ({
    x: rect.left + x * rect.width,
    y: rect.top + y * rect.height,
    halfw: hw * rect.width,
    ny: y,
  }));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const length = cum[cum.length - 1];

  const at = (s: number): PathPoint => {
    const c = Math.min(length, Math.max(0, s));
    let i = 1;
    while (i < cum.length - 1 && cum[i] < c) i++;
    const a = pts[i - 1], b = pts[i];
    const u = cum[i] === cum[i - 1] ? 0 : (c - cum[i - 1]) / (cum[i] - cum[i - 1]);
    const ny = a.ny + (b.ny - a.ny) * u;
    return {
      x: a.x + (b.x - a.x) * u,
      y: a.y + (b.y - a.y) * u,
      halfw: a.halfw + (b.halfw - a.halfw) * u,
      t: Math.min(1, Math.max(0, (ny - 0.33) / 0.3)),
    };
  };
  return { rect, length, at };
}

// 泡の直径。遠近は大きさの差で残しつつ、奥でも文字10px以上を守る
export function bubbleSize(p: PathPoint, len: number): number {
  const persp = p.halfw * 0.44 * (0.85 + 0.06 * len);
  const minFit = 10 * len / 0.82 + 4;
  return Math.min(100, Math.max(minFit * (0.9 + 0.1 * p.t), 40 + (persp - 40) * p.t, persp));
}

export function bubbleFontSize(size: number, len: number): number {
  return Math.max(10, Math.min(15, (size * 0.8) / len));
}
