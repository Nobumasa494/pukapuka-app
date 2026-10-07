// 島の地形（v10、2026-10-07）。形は Blender の scripts/island/blender/island_terrain.py だけで決め、
// scripts/island/export_terrain.py が数（高さの格子・小川・池）を src/islandTerrainData.ts に書き出す。
// アプリはその数で、植物を地面に置く・植えない所を決める・水を流す（式を写すと食い違いやすかったため）
import { G0, GN, GRID, GS, MEADOW_R as MR, PONDS as PD, RIVER as RV, SPRINGS as SP, STREAMS as ST, STREAM_LEVELS, STREAM_WS } from './islandTerrainData';

export const MEADOW_R = MR; // 言葉の植物が育つ草地（ワクワクの木のまわりの段）
export const RIVER = RV; // 湖から海へ出る川（最初のころからいつも流れている）
export const STREAMS = ST as unknown as [number, number][][];
type Pond = { name: string; x: number; z: number; A: number; B: number; deg: number; level: number };
export const PONDS: Pond[] = (PD as unknown as [string, number, number, number, number, number, number][]).map(
  ([name, x, z, A, B, deg, level]) => ({ name, x, z, A, B, deg, level }),
);
const pondOf = (n: string) => PONDS.find((p) => p.name === n)!;
export const POND: [number, number] = [pondOf('lake').x, pondOf('lake').z];
export const POOL: [number, number] = [pondOf('pool').x, pondOf('pool').z];
const SPRINGS = SP as unknown as [number, number][];
const WATER_PAD = 0.6; // 植えない余白（水の縁から）

// 地面の高さ（格子を4点で補う。Blender の height() と同じ形）
export function meadow(x: number, z: number): number {
  const fx = Math.max(0, Math.min(GN - 1.001, (x - G0) / GS));
  const fz = Math.max(0, Math.min(GN - 1.001, (z - G0) / GS));
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;
  const h = (a: number, b: number) => GRID[b * GN + a];
  return (h(i, j) * (1 - tx) + h(i + 1, j) * tx) * (1 - tz) + (h(i, j + 1) * (1 - tx) + h(i + 1, j + 1) * tx) * tz;
}

// 水面に貼る流れの場所（u＝道すじの始まりからの長さ m、v＝横のずれ m、k＝何本目、prog＝進み具合 0〜1）
export function flowInfo(x: number, z: number, ks: number[]): [number, number, number, number] {
  let best = Infinity;
  let out: [number, number, number, number] = [0, 0, 0, 0];
  for (const k of ks) {
    const S = STREAMS[k];
    const n = S.length - 1;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const [ax, az] = S[i];
      const [bx, bz] = S[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const L = Math.hypot(dx, dz) || 1e-6;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (L * L)));
      const px = x - (ax + t * dx);
      const pz = z - (az + t * dz);
      const d = Math.hypot(px, pz);
      if (d < best) {
        best = d;
        out = [acc + t * L, (px * dz - pz * dx) / L, k, (i + t) / n];
      }
      acc += L;
    }
  }
  return out;
}

// 小川の半分の幅
export function streamHalfW(prog: number, k: number): number {
  return STREAM_WS[k][0] + (STREAM_WS[k][1] - STREAM_WS[k][0]) * prog;
}

// 小川の水面の高さ（滝の所で急に下がる）
export function streamLevel(prog: number, k: number): number {
  const L = STREAM_LEVELS[k];
  const f = Math.max(0, Math.min(1, prog)) * (L.length - 1);
  const i = Math.min(Math.floor(f), L.length - 2);
  return L[i] + (L[i + 1] - L[i]) * (f - i);
}

// 池の中心からの距離 ÷ その向きの縁の半径（1＝縁）。island_terrain.py の pond_shape と同じ
export function pondShape(p: Pond, x: number, z: number): number {
  const dx = x - p.x;
  const dz = z - p.z;
  const a = Math.atan2(dz, dx);
  const ph = a - (p.deg * Math.PI) / 180;
  let r = 1 / Math.sqrt((Math.cos(ph) / p.A) ** 2 + (Math.sin(ph) / p.B) ** 2);
  r *= 1 + 0.06 * Math.sin(3 * a + 1.1 + p.name.length) + 0.04 * Math.sin(5 * a + 0.3);
  return Math.hypot(dx, dz) / r;
}

export function nearestPond(x: number, z: number): Pond {
  let best = PONDS[0];
  let bu = Infinity;
  for (const p of PONDS) {
    const u = pondShape(p, x, z);
    if (u < bu) {
      bu = u;
      best = p;
    }
  }
  return best;
}

// いちばん近い小川の縁までの距離（小川の上なら負）
export function streamGap(x: number, z: number): number {
  let best = Infinity;
  STREAMS.forEach((S, k) => {
    const n = S.length - 1;
    for (let i = 0; i < n; i++) {
      const [ax, az] = S[i];
      const [bx, bz] = S[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1e-6)));
      const d = Math.hypot(x - (ax + t * dx), z - (az + t * dz));
      best = Math.min(best, d - streamHalfW((i + t) / n, k));
    }
  });
  return best;
}

// 言葉の植物を植えてはいけない所までの近さ（正なら植えてよい）。小川・池・湧き水・段の崖・ワクワクの木の葉の下
export const TREE_R = 3.0;
export function plantRoom(x: number, z: number): number {
  let pond = Infinity;
  for (const p of PONDS) pond = Math.min(pond, (pondShape(p, x, z) - 1) * Math.min(p.A, p.B) - 0.3);
  let spring = Infinity;
  for (const [sx, sz] of SPRINGS) spring = Math.min(spring, Math.hypot(x - sx, z - sz) - 1.6);
  const h0 = meadow(x, z);
  const steep = Math.max(...[[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]].map(([dx, dz]) => Math.abs(meadow(x + dx, z + dz) - h0)));
  return Math.min(streamGap(x, z) - WATER_PAD - 0.15, pond, spring, Math.hypot(x, z) - TREE_R, (0.2 - steep) * 4);
}
