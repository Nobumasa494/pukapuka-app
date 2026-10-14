// 背景動画の元サイズ（Blender の書き出し解像度）
export const VIDEO_W = 1080;
export const VIDEO_H = 1920;

export type VideoRect = { left: number; top: number; width: number; height: number };

// contentFit="cover" と同じ切り取り方。泡の座標も必ずこの rect で動画に合わせる
// 川を多く見せる（2026-10-14、ユーザー「カメラを少し下に向けて、川が映るところを増やしたい」→ 案A2：拡大せず、動画を上にずらして、空いた下は水の色で埋める）。
// 動画に下の絵はないので、下の端の水の色（BOTTOM_COLOR）をのばす。泡の通り道も同じ rect で動くので、ずれない。つなぎの動画も同じ rect なので、つなぎ目もずれない。
// web で ?shift=60（上にずらす px。0〜150）・?zoom=1.1（拡大。1〜1.5）をつけると見比べられる
const q = (name: string) => (typeof window !== 'undefined' && typeof window.location?.search === 'string' ? Number(new RegExp(`[?&]${name}=([\\d.]+)`).exec(window.location.search)?.[1]) : NaN);
const qz = q('zoom'), qs = q('shift');
export const VIDEO_ZOOM = Number.isFinite(qz) && qz >= 1 && qz <= 1.5 ? qz : 1.0;
export const VIDEO_SHIFT = Number.isFinite(qs) && qs >= 0 && qs <= 150 ? qs : 0;
export const BOTTOM_COLOR = 'rgb(26,82,120)'; // 動画の下の端の水の色（river_bg_poster.jpg の最下段の平均）
export function coverRect(screenW: number, screenH: number): VideoRect {
  const scale = Math.max(screenW / VIDEO_W, screenH / VIDEO_H) * VIDEO_ZOOM;
  const width = VIDEO_W * scale;
  const height = VIDEO_H * scale;
  return { left: (screenW - width) / 2, top: (screenH - height) / 2 - VIDEO_SHIFT, width, height };
}

// 夕空（ワードクラウド）で、背景を下にずらして、空の言葉の置き場を広げる（2026-10-14、ユーザー「夕空狭いから、上にカメラ上げて、空のスペースを上げたい」）。
// 空いた上は、動画の上の端の空の色（TOP_COLOR）でのばす。web で ?cloudshift=100（0〜200）で見比べられる
const qc = q('cloudshift');
export const CLOUD_SHIFT = Number.isFinite(qc) && qc >= 0 && qc <= 200 ? qc : 100; // 100px（決定 2026-10-14、ユーザー「真ん中にして」）
export const TOP_COLOR = 'rgb(30,38,86)'; // cloud_bg.jpg の上の端の色
