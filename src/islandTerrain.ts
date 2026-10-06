// 島の地形（v7、2026-10-06）。Blender の scripts/island/blender/island_terrain.py と必ず同じ式・同じ数にする
// （違うと、言葉の植物が浮く・埋まる・小川の上に植わる）。座標はアプリの (x, z)。RN に依存しないので node で確かめられる
//
// - 草地の高さ meadow()：ゆるい起伏、奥（230°）ほど少し高い傾き、ワクワクの木の根もとの淵のまわりのくぼ地
// - 小川・淵・池・湧き水の場所：言葉の植物を、この上には植えない

const AZ0 = 0.7;
const CAMD = [Math.sin(AZ0), Math.cos(AZ0)] as const; // カメラのいる向き（50°）
const TILT = 0.03; // 奥ほど高くする傾き（1m あたり）

export const P = (deg: number, r: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [r * Math.cos(a), r * Math.sin(a)];
};

export const MEADOW_R = 10.3; // 言葉の植物が育つ草地
export const POND = P(34, 11.6); // 手前の池（池は言葉ではなく、ほとりに言葉が咲く）
const POND_R = 3.3;
export const SPRING = P(230, 11.8); // 奥の丘の湧き水（本流）
export const SPRING2 = P(298, 11.2); // 右奥の丘の湧き水（支流）
export const POOL = P(50, 3.7); // ワクワクの木の根もとの淵
export const POOL_R = 1.2;
const BASIN = 0.42; // 淵のまわりのくぼ地の深さ
const BASIN_R = 3.6;
// 小川の道すじ。0＝本流（湧き水 → 淵）、1＝支流（右奥 → 淵）、2＝淵 → 池、3＝池 → 浜 → 海（たまる一方にしない。拾った言葉は、やがて海へ帰る）
export const STREAMS: [number, number][][] = [
  [SPRING, P(225, 9.8), P(213, 7.6), P(196, 5.8), P(170, 4.6), P(132, 4.2), P(92, 4.3), POOL],
  [SPRING2, P(305, 9.2), P(318, 7.0), P(338, 5.4), P(8, 4.4), POOL],
  [POOL, P(45, 5.8), P(40, 7.2), POND],
  [POND, P(31, 15.2), P(28, 18.2), P(26, 21.0), P(25, 23.5)],
];
const STREAM_WS: [number, number][] = [
  [0.28, 0.5],
  [0.2, 0.38],
  [0.52, 0.68],
  [0.6, 0.95],
];

// 水面に貼る絵の場所（u＝道すじの始まりからの長さ m、v＝道すじからの横のずれ m。右が＋）。
// きらめきの絵を流れの向きに貼り、下流へずらすのに使う（3D で動かすための計算。絵そのものは Blender）
export function flowUV(x: number, z: number, ks: number[]): [number, number] {
  let best = Infinity;
  let uv: [number, number] = [0, 0];
  for (const k of ks) {
    const S = STREAMS[k];
    let acc = 0;
    for (let i = 0; i < S.length - 1; i++) {
      const [ax, az] = S[i];
      const [bx, bz] = S[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const L = Math.hypot(dx, dz);
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (L * L)));
      const px = x - (ax + t * dx);
      const pz = z - (az + t * dz);
      const d = Math.hypot(px, pz);
      if (d < best) {
        best = d;
        uv = [acc + t * L, (px * dz - pz * dx) / L];
      }
      acc += L;
    }
  }
  return uv;
}

const back = (x: number, z: number) => -(x * CAMD[0] + z * CAMD[1]);

// 草地の高さ（island_terrain.py の meadow() と同じ）
export function meadow(x: number, z: number): number {
  const dq2 = (x - POOL[0]) ** 2 + (z - POOL[1]) ** 2;
  return (
    0.6 +
    0.2 * Math.sin(0.33 * x + 1.3) * Math.cos(0.29 * z - 0.4) +
    0.1 * Math.sin(0.71 * x - 0.47 * z + 2.0) +
    TILT * back(x, z) -
    BASIN * Math.exp(-dq2 / BASIN_R ** 2)
  );
}

function pondR(a: number): number {
  return POND_R * (1 + 0.16 * Math.sin(2 * a + 0.7) + 0.09 * Math.sin(3 * a + 2.1) + 0.05 * Math.sin(5 * a + 0.4));
}

// 池の中心からの距離 ÷ その向きの縁の半径（1＝縁）
export function pondU(x: number, z: number): number {
  const dx = x - POND[0];
  const dz = z - POND[1];
  return Math.hypot(dx, dz) / pondR(Math.atan2(dz, dx));
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
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      const d = Math.hypot(x - (ax + t * dx), z - (az + t * dz));
      const prog = (i + t) / n;
      const w = STREAM_WS[k][0] + (STREAM_WS[k][1] - STREAM_WS[k][0]) * prog;
      best = Math.min(best, d - w);
    }
  });
  return best;
}

// 言葉の植物を植えてはいけない所までの近さ（正なら植えてよい。値はその所までの余白）
// 小川・淵・池・湧き水と、ワクワクの木の葉の下（真ん中 TREE_R）
export const TREE_R = 3.0;
export function plantRoom(x: number, z: number): number {
  return Math.min(
    streamGap(x, z) - 0.25,
    Math.hypot(x - POOL[0], z - POOL[1]) - POOL_R - 0.3,
    (pondU(x, z) - 1) * POND_R - 0.3,
    Math.hypot(x - SPRING[0], z - SPRING[1]) - 1.6,
    Math.hypot(x - SPRING2[0], z - SPRING2[1]) - 1.6,
    Math.hypot(x, z) - TREE_R,
  );
}
