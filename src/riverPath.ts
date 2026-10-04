// 背景動画の元サイズ（Blender の書き出し解像度）
export const VIDEO_W = 1080;
export const VIDEO_H = 1920;

export type VideoRect = { left: number; top: number; width: number; height: number };

// contentFit="cover" と同じ切り取り方。泡の座標も必ずこの rect で動画に合わせる
export function coverRect(screenW: number, screenH: number): VideoRect {
  const scale = Math.max(screenW / VIDEO_W, screenH / VIDEO_H);
  const width = VIDEO_W * scale;
  const height = VIDEO_H * scale;
  return { left: (screenW - width) / 2, top: (screenH - height) / 2, width, height };
}
