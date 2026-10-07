import { Suspense, useEffect, useMemo, useRef } from 'react';
import { LogBox, Platform } from 'react-native';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Asset } from 'expo-asset';
import * as THREE from 'three';
import type { SharedValue } from 'react-native-reanimated';
import type { IslandLayout, Plant } from '../islandLayout';
import { RIVER, STREAMS, flowInfo, meadow, nearestPond, streamHalfW, streamLevel } from '../islandTerrain';
import { CATEGORY_COLOR } from '../wordCloud';
import { ISLAND_KIT, type KitPart } from '../islandKit';

// THREE.Clock の「使わなくなる予定」は @react-three/fiber の中から出る（こちらのコードではない）。動きに影響しないので出さない
LogBox.ignoreLogs(['THREE.Clock: This module has been deprecated', 'WEBGL_lose_context extension not supported']); // 後者は島を閉じるとき、スマホの GL に「わざと捨てる」機能がないというだけの知らせ

// 島（朝）の3D（2026-10-05、v7 2026-10-06）。見えるものはすべて Blender で作った形と、Blender で焼いた色（光と影）だけ。
// 島の地面・景色（林・岩・野の花）・池・淵・小川・湧き水・水たまり・海・空・太陽・遠くの山と河口・言葉の植物・根もとの影・種の光・選んだ印の輪、
// どれも src/islandKit.ts から（Blender: pk_island_v7.blend、書き出しは scripts/island/blender/export_kit.py）。
// 水の様子は時期で出し分ける（layout.water）：none＝溝のない地面だけ、puddles＝水たまりと湧き水、streams＝溝のある地面と小川・淵
// アプリは光の計算をせず（MeshBasic）、形も作らない。回す・寄る・歩く・植物に触れる・種が降りる、の動きだけをアプリで行う。
// 言葉の植物は部品ごとに InstancedMesh 1つで描く。何も動いていないときは描かない（frameloop="demand"）

// ---- カメラ（指の操作は画面側で受けて、ここに書き込む） ----

export type CameraRig = {
  az: number; // 回りこみ（ラジアン）
  el: number; // 見下ろす角度（ラジアン）
  dist: number;
  goalDist: number;
  home: number; // 全体が見える距離（画面の縦横比と、見せる範囲で決まる）
  target: THREE.Vector3;
  goalTarget: THREE.Vector3;
  tap: { x: number; y: number } | null;
  reset: boolean;
  invalidate?: () => void; // 指で動かしたら描き直してもらう
};

export const EL_MIN = 0.12;
export const EL_MAX = 1.2;
const DIST_MIN = 2.2;
const FOV = 45;
// カメラを少し上に向ける（ラジアン）。地平線を上から約25%、草地の真ん中を約60%に置く
const TILT = 0.09;
const AZ0 = 0.7;
const EL0 = 0.3;
// 最初に見せる範囲の半径：草地（言葉の植物が育つ所）全体と、その奥の林が入る。
// v7: Blender の配置図の開いたとき（距離 42、縦長 390×844）が範囲 約8
const FRAME_MIN = 8;
const FRAME_MAX = 9;
// 見る点：ワクワクの木の根もとの少し上
const LOOK_Y = meadow(0, 0) + 0.6;

// 範囲（半径 extent）が横に収まる距離。縦長の画面では横の画角が狭いので、横で決まる
function frameDist(extent: number, aspect: number): number {
  const tanH = Math.tan(((FOV / 2) * Math.PI) / 180) * Math.min(1, aspect);
  return extent / tanH;
}

export function makeRig(): CameraRig {
  const home = frameDist(FRAME_MIN, 0.56);
  return {
    az: AZ0,
    el: EL0,
    dist: home * 1.25, // 開いたとき、少し遠くから近づく
    goalDist: home,
    home,
    target: new THREE.Vector3(0, LOOK_Y, 0),
    goalTarget: new THREE.Vector3(0, LOOK_Y, 0),
    tap: null,
    reset: false,
  };
}

// 引きで見られるよう、全体が見える距離の 2 倍まで離れられる（v7）
export const distLimits = (rig: CameraRig) => [DIST_MIN, rig.home * 2] as const;

// ---- 地面の高さ ----
// 島の地形は Blender で作った（scripts/island/blender/island_terrain.py）。言葉の植物が育つ草地の高さだけを、
// 同じ式の src/islandTerrain.ts の meadow() で計算する（違うと植物が浮く・埋まる）
const groundY = meadow;

// ---- Blender の部品を読む ----

// base64 → 型付き配列（ローダーなしで読む）
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64I = new Int16Array(128).fill(-1);
for (let i = 0; i < 64; i++) B64I[B64.charCodeAt(i)] = i;
function b64(str: string): ArrayBuffer {
  let len = str.length;
  while (len > 0 && str[len - 1] === '=') len--;
  const out = new Uint8Array(Math.floor((len * 3) / 4));
  let o = 0;
  for (let i = 0; i < len; i += 4) {
    const n = (B64I[str.charCodeAt(i)] << 18) | (B64I[str.charCodeAt(i + 1)] << 12) | ((B64I[str.charCodeAt(i + 2)] & 63) << 6) | (B64I[str.charCodeAt(i + 3)] & 63);
    out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out.buffer;
}
const S2L = new Float32Array(256).map((_, i) => {
  const v = i / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
});

// ローポリは三角形ごとに1色。位置（まとめた頂点）と面から、三角形ごとに頂点を分けて色を付ける。
// fx__（影・印）は頂点ごとの色と透明度のまま
function buildGeometry(k: KitPart): THREE.BufferGeometry {
  const src = ISLAND_KIT[k];
  const pos = new Float32Array(b64(src.p));
  const idx = src.big ? new Uint32Array(b64(src.i)) : new Uint16Array(b64(src.i));
  const col = new Uint8Array(b64(src.c));
  const g = new THREE.BufferGeometry();
  if (src.fx) {
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const c = new Float32Array(col.length);
    for (let i = 0; i < col.length; i++) c[i] = i % 4 === 3 ? col[i] / 255 : S2L[col[i]];
    g.setAttribute('color', new THREE.BufferAttribute(c, 4));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  } else {
    const n = idx.length;
    const p = new Float32Array(n * 3);
    const c = new Float32Array(n * 3);
    for (let t = 0; t < n; t++) {
      const v = idx[t];
      p[t * 3] = pos[v * 3];
      p[t * 3 + 1] = pos[v * 3 + 1];
      p[t * 3 + 2] = pos[v * 3 + 2];
      const f = Math.floor(t / 3) * 3;
      c[t * 3] = S2L[col[f]];
      c[t * 3 + 1] = S2L[col[f + 1]];
      c[t * 3 + 2] = S2L[col[f + 2]];
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
const GEO_CACHE = new Map<KitPart, THREE.BufferGeometry>();
function geo(k: KitPart): THREE.BufferGeometry {
  let g = GEO_CACHE.get(k);
  if (!g) GEO_CACHE.set(k, (g = buildGeometry(k)));
  return g;
}

// ---- 光の絵と、流れる水（試し 2026-10-06：川の画面に近い質にする）----
// 地面：光を焼く前の元の色（三角形ごと）× Blender の Cycles で焼いた光の絵（scripts/island/blender/bake_lightmap.py）。
//   絵は上から見た向き。位置 (x, z) から絵の場所を出す（bake_lightmap.py の LM_S と同じ）。明るさは半分で入っているので 2 倍に戻す
// 水：色と光の網目の絵は Blender（水面の色・water_glint.py）、流れの動きはアプリ（下の WATER_FRAG。2026-10-07）
const LM_S = 33; // 光の絵が覆う範囲（bake_lightmap.py の LM_S と同じ）
const LM_GAIN = 2 * 1.15; // 2 倍に戻す × 明るさ（前の三角形ごとの光の草地と同じ明るさになるよう、ブラウザで撮った色を数値で比べて合わせた）
const WATER_FPS = 15; // 水が流れるので、島を見ている間は1秒にこの回数だけ描く（60回より電池を食わない）
// 水の流れ（2026-10-07、ユーザー「川の流れはアプリで作ったほうが自然かも」）
// 前は光の網目の絵を2枚、どこでも同じ速さでずらしていて、同じ模様が滑るだけに見えた。今は場所ごとに速さを変える：
//   細い所・坂は速く、淵・湖に入る所は遅い。速い所では模様が流れの向きに伸びる。岸ぎわと速い所に少し白い泡
// 動かし方：水面の各点に「上流の始まりからそこまで、水が何秒で着くか」（aFlow.x）を持たせ、模様を（その秒 − 今の時刻）で描く。
//   どの場所でも、その場所の速さで模様が進み、時間がたっても模様が伸び縮みしない
//   （「流れの地図」のやり方＝2つの時間を重ねて入れ替える、を最初に試したが、細い光の網目が入れ替わりのたびに薄れて点滅した）
const FLOW = { speed: 0.5 }; // 基本の速さ（m/秒）
const WATER_VERT = `
attribute vec4 aFlow;
varying vec3 vColor;
varying vec4 vFlow;
void main() {
  vColor = color.rgb;
  vFlow = aFlow;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const WATER_FRAG = `
uniform sampler2D uTex;
uniform float uTime;
varying vec3 vColor;
varying vec4 vFlow;
float caus(vec2 p) { return texture2D(uTex, p).r; }
void main() {
  float s = vFlow.x; // 着くまでの秒
  float v = vFlow.y; // 横のずれ（m）
  float sp = vFlow.z;
  float across = clamp(abs(v) / vFlow.w, 0.0, 1.5);
  float wob = 0.04 * sin(s * 0.9 + uTime * 1.1) + 0.025 * sin(s * 2.1 - uTime * 1.6 + v * 4.0);
  // 大きい網目は水と同じ速さ、細かい網目は少し遅く・少し横へ。重なりが変わり続けて、ゆらいで見える
  // 淵・湖（半分の幅 99 の印）は速さが一定なので、模様の大きさを川と同じに戻す（秒で描くと、遅い水ほど模様が細かくなる）
  float k = vFlow.w > 50.0 ? sp / ${FLOW.speed.toFixed(2)} : 1.0;
  // 光の網目の絵は筋が流れの向きに細長い。そのまま流すと、筋が自分の長さの向きに滑るだけで、動いて見えなかった
  // （ユーザー「川流れてないけど」）。大きい網目は向きを横にして（さざ波の向き）流し、さらに小さな泡の粒を流す
  float a = (s - uTime) * k * ${FLOW.speed.toFixed(2)}; // 下流へ進む長さの座標（m）。水と同じ速さで動く
  float c1 = caus(vec2(v / 1.5 + wob, a / 1.6));
  float c2 = caus(vec2(((s - 0.7 * uTime) * k * ${FLOW.speed.toFixed(2)}) / 1.1 + 0.37, v / 0.8 - wob * 0.5 + uTime * 0.015));
  float glint = smoothstep(0.1, 0.8, c1) * 0.24 + smoothstep(0.12, 0.85, c2) * 0.12;
  // 泡の粒：水に乗って流れる小さな白い点（0.4m の升ごとに1つ、3割の升だけ）
  vec2 g = vec2(a, v + 3.0) / 0.4;
  vec2 cell = floor(g);
  float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  float h2 = fract(sin(dot(cell, vec2(269.5, 183.3))) * 43758.5453);
  vec2 ctr = cell + 0.25 + 0.5 * vec2(h, h2);
  float dotv = (1.0 - smoothstep(0.035, 0.075, length((g - ctr) * vec2(0.8, 1.0)))) * step(0.7, h2) * (1.0 - smoothstep(0.75, 1.0, across));
  float foam = smoothstep(0.7, 1.05, across) * smoothstep(0.35, 0.7, c2) * 0.3 + smoothstep(0.8, 1.4, sp) * smoothstep(0.5, 0.85, c1) * 0.22 + dotv * 0.4 * (vFlow.w > 50.0 ? 0.3 : 1.0);
  // 遠くからでも流れが見えるよう、大きくやわらかい光の帯（間隔 約2.4m）も水と一緒に流す
  // （細かい網目と泡の粒は、開いたときの距離では1ピクセルより小さく、止まって見えた）
  // 帯は規則正しい縞にしない（同じ間隔の縞は機械的に見えた）。光の網目の絵を大きく引きのばして、まだらな明るさとして流す
  float band = smoothstep(0.45, 0.85, caus(vec2(v / 7.0 + 0.2, a / 4.5))) * (1.0 - smoothstep(0.6, 1.1, across));
  glint += band * (vFlow.w > 50.0 ? 0.05 : 0.16);
  // 滝（速い所）：白い泡が強く、筋になって落ちる
  float fall = smoothstep(1.3, 2.6, sp);
  foam += fall * (0.35 + 0.4 * smoothstep(0.3, 0.8, caus(vec2(v / 0.5, a / 0.9))));
  gl_FragColor = vec4(vColor + vec3(0.95, 1.0, 1.0) * glint + vec3(foam), 1.0);
  #include <colorspace_fragment>
}`;

const texSrc = (mod: number) => (Platform.OS === 'web' ? Asset.fromModule(mod).uri : (mod as unknown as string));
const LM_SRC = [texSrc(require('../../assets/island/lm_ground.png')), texSrc(require('../../assets/island/lm_ground_early.png'))];
const GLINT_SRC = texSrc(require('../../assets/island/water_glint.png'));

function withUV(k: KitPart, uvOf: (x: number, z: number) => [number, number]): THREE.BufferGeometry {
  const g = geo(k).clone();
  const pos = g.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const [u, v] = uvOf(pos.getX(i), pos.getZ(i));
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
const planarLM = (x: number, z: number): [number, number] => [(x + LM_S) / (2 * LM_S), (-z + LM_S) / (2 * LM_S)];
const ss = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// 小川の水面に、流れの情報（u＝下流への長さ, v＝横のずれ, 速さ, 半分の幅）を付ける
function streamGeo(k: KitPart, ks: number[]): THREE.BufferGeometry {
  const g = geo(k).clone();
  const pos = g.getAttribute('position');
  const info = Array.from({ length: pos.count }, (_, i) => flowInfo(pos.getX(i), pos.getZ(i), ks));
  const lens = new Map<number, number>();
  for (const kk of ks) {
    const S = STREAMS[kk];
    let L = 0;
    for (let i = 0; i < S.length - 1; i++) L += Math.hypot(S[i + 1][0] - S[i][0], S[i + 1][1] - S[i][1]);
    lens.set(kk, L);
  }
  const speedOf = (u: number, kk: number, prog: number) => {
    const hw = streamHalfW(prog, kk);
    // 坂：Blender が決めた水面の高さ（streamLevel）の下がり方。滝では大きく、速く白い流れになる
    const dp = 0.6 / lens.get(kk)!;
    const slope = Math.max(0, (streamLevel(prog - dp, kk) - streamLevel(prog + dp, kk)) / 1.2);
    let sp = FLOW.speed * Math.min(1.5, Math.max(0.7, 0.34 / hw)) * (1 + Math.min(4, slope * 6));
    if (kk !== RIVER) sp *= 1 - 0.6 * ss(0.9, 1, prog); // 池・湖に入る所で遅く
    return sp;
  };
  // 道すじごとに、0.5m の区切りの速さ（その区切りの点の平均）→ 始まりから各区切りまでの秒
  const BIN = 0.5;
  const binSp = new Map<number, number[]>();
  const sps = info.map(([u, , kk, prog]) => speedOf(u, kk, prog));
  info.forEach(([u, , kk], i) => {
    const key = kk * 1000 + Math.floor(u / BIN);
    const b = binSp.get(key) ?? [0, 0];
    b[0] += sps[i];
    b[1] += 1;
    binSp.set(key, b);
  });
  const arrive = new Map<number, number[]>(); // 道すじ → 区切りの始まりの秒
  const binSpeed = (kk: number, j: number, last: number) => {
    const b = binSp.get(kk * 1000 + j);
    return b ? b[0] / b[1] : last;
  };
  for (const kk of ks) {
    const S: number[] = [0];
    let last = FLOW.speed;
    for (let j = 0; j < 400; j++) {
      last = binSpeed(kk, j, last);
      S.push(S[j] + BIN / last);
    }
    arrive.set(kk, S);
  }
  const flow = new Float32Array(pos.count * 4);
  info.forEach(([u, v, kk, prog], i) => {
    const j = Math.max(0, Math.min(399, Math.floor(u / BIN)));
    const sp = binSpeed(kk, j, sps[i]);
    flow.set([arrive.get(kk)![j] + (u - j * BIN) / sp, v, sp, streamHalfW(prog, kk)], i * 4);
  });
  g.setAttribute('aFlow', new THREE.BufferAttribute(flow, 4));
  return g;
}

// 淵・池・湖：いちばん近い池の向き（流れの向き）にそって、ほぼ止まった水（1つの部品に池がいくつも入っている）
function stillGeo(k: KitPart, speed: number): THREE.BufferGeometry {
  const g = geo(k).clone();
  const pos = g.getAttribute('position');
  const flow = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const p = nearestPond(pos.getX(i), pos.getZ(i));
    const a = (p.deg * Math.PI) / 180;
    const [dx, dz] = [Math.cos(a), Math.sin(a)];
    const x = pos.getX(i) - p.x;
    const z = pos.getZ(i) - p.z;
    flow.set([(x * dx + z * dz) / speed, x * dz - z * dx, speed, 99], i * 4); // 着くまでの秒 ＝ 長さ ÷ 速さ
  }
  g.setAttribute('aFlow', new THREE.BufferAttribute(flow, 4));
  return g;
}

// ---- 言葉の植物 ----
// 種類ごとの部品（Poly Pizza の素材を Blender で塗り直し、光を焼いたもの）
//   base＝葉・幹など（焼いた色のまま）、accent＝花びら・実（白で焼いてある。種類の色を掛ける）
type Kind = 'sprout' | 'flower' | 'grass' | 'bush' | 'tree_small' | 'tree_big' | 'fruitbush';
const KIND_OF: Record<Plant['category'], Kind> = { emotion: 'flower', body: 'grass', situation: 'bush', value: 'tree_small', curiosity: 'tree_big', doing: 'fruitbush' };
// fruitbush（実のなる低木）は6つ目の種類「していること」用
const KINDS: Kind[] = ['sprout', 'flower', 'grass', 'bush', 'tree_small', 'tree_big', 'fruitbush'];
const PARTS_OF = Object.fromEntries(
  KINDS.map((kind) => [kind, (Object.keys(ISLAND_KIT) as KitPart[]).filter((k) => k.startsWith(kind + '__'))]),
) as Record<Kind, KitPart[]>;
const KIND_SIZE = Object.fromEntries(
  KINDS.map((kind) => {
    const box = new THREE.Box3();
    PARTS_OF[kind].forEach((k) => box.union(geo(k).boundingBox!));
    return [kind, { height: box.max.y, foot: Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z) }];
  }),
) as Record<Kind, { height: number; foot: number }>;

// 種類の色。強く拾った言葉ほど色が濃く、軽い言葉は白っぽい
function tint(p: Plant): THREE.Color {
  const [r, g, b] = CATEGORY_COLOR[p.category];
  const c = new THREE.Color(r / 255, g / 255, b / 255);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  const s = Math.max(0, Math.min(1, p.avgStrength));
  return new THREE.Color().setHSL(hsl.h, 0.3 + 0.6 * s, 0.8 - 0.18 * s);
}
const WHITE = new THREE.Color(1, 1, 1);
const GOLD = new THREE.Color('#ffc65c');

const kindOf = (p: Plant): Kind => (p.growth === 0 ? 'sprout' : KIND_OF[p.category]);
const growScale = (p: Plant) => (p.growth === 0 ? 1.2 : 0.7 + 0.3 * p.growth);
const plantHeight = (p: Plant) => KIND_SIZE[kindOf(p)].height * growScale(p);
const footprint = (p: Plant) => KIND_SIZE[kindOf(p)].foot * growScale(p);

// 部品と、その部品に掛ける色。花びら・実がある種類は accent に種類の色。ない種類（茂み・草・若木）は葉に種類の色を少しだけ
function colorFor(part: KitPart, p: Plant): THREE.Color {
  const kind = kindOf(p);
  // ワクワクの木の実は金色（好奇心の色だけだと白っぽく、雪のように見えた）。強く拾うほど濃い金
  if (part.endsWith('__accent')) return p.category === 'curiosity' ? GOLD.clone().lerp(tint(p), 0.2).multiplyScalar(0.85 + 0.25 * p.avgStrength) : tint(p);
  const hasAccent = PARTS_OF[kind].some((k) => k.endsWith('__accent'));
  // 葉に混ぜる種類の色は 13% まで（28% では緑が灰色に濁った。補色に近い色を混ぜると濁る。Blender の配置図と同じ割合）
  return hasAccent ? WHITE : WHITE.clone().lerp(tint(p), 0.13);
}

// ---- 場面 ----

type Anim = { from: number; to: number; t0: number; seed: boolean };

const SEED_FALL = 1.3; // 種が空から降りる秒数
const GROW = 0.9; // 芽が出て育つ秒数
const STAGGER = 1.6; // 種が降りはじめる時刻のばらつき（秒）
const PICK_PX = 44; // 触れた所から、この距離（px）までの植物を選ぶ
const PULSE_SEC = 2.4; // 選んだ印が脈打つ秒数

const easeOutBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

type SceneProps = {
  layout: IslandLayout;
  rig: CameraRig;
  selected: string | null;
  onPick: (word: string | null) => void;
  labelX: SharedValue<number>;
  labelY: SharedValue<number>;
  labelOn: SharedValue<number>;
};

function Scene({ layout, rig, selected, onPick, labelX, labelY, labelOn }: SceneProps) {
  const { camera, size, invalidate } = useThree();
  const groundRef = useRef<THREE.Mesh>(null);
  const skyRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const anims = useRef(new Map<string, Anim>());
  const animEnd = useRef(0);
  const prevSize = useRef(new Map<string, number>());
  const clock = useRef(0);
  const plantsDirty = useRef(true);
  const lastSelected = useRef<string | null>(null);

  rig.invalidate = invalidate;

  // 光の絵（地面）と、きらめきの絵（水）
  const [lmGround, lmEarly] = useLoader(THREE.TextureLoader, LM_SRC);
  const glintBase = useLoader(THREE.TextureLoader, GLINT_SRC);
  const look = useMemo(() => {
    for (const t of [lmGround, lmEarly]) {
      t.colorSpace = THREE.NoColorSpace;
      t.needsUpdate = true;
    }
    const tex = glintBase.clone();
    tex.colorSpace = THREE.NoColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    const waterMat = new THREE.ShaderMaterial({
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      vertexColors: true,
      uniforms: { uTex: { value: tex }, uTime: { value: 0 } },
    });
    return {
      ground: withUV('island__ground_albedo', planarLM),
      early: withUV('island__ground_early_albedo', planarLM),
      groundMat: new THREE.MeshBasicMaterial({ vertexColors: true, map: lmGround, color: new THREE.Color(LM_GAIN, LM_GAIN, LM_GAIN) }),
      earlyMat: new THREE.MeshBasicMaterial({ vertexColors: true, map: lmEarly, color: new THREE.Color(LM_GAIN, LM_GAIN, LM_GAIN) }),
      stream: streamGeo('island__stream', STREAMS.map((_, k) => k).filter((k) => k !== RIVER)),
      river: streamGeo('island__river', [RIVER]),
      pond: stillGeo('island__pond', 0.05),
      pool: stillGeo('island__pool', 0.07),
      waterMat,
    };
  }, [lmGround, lmEarly, glintBase]);
  useEffect(() => {
    const id = setInterval(invalidate, 1000 / WATER_FPS);
    return () => clearInterval(id);
  }, [invalidate]);

  // 選んだ植物が変わったら描き直す（何も動いていないと描かないので、選んだことが画面に出ない）
  const selectedAt = useRef(0);
  useEffect(() => {
    selectedAt.current = clock.current;
    invalidate();
  }, [selected, invalidate]);

  // 全体を見るときの見る点と範囲：草地の真ん中から、植物のある範囲（草地と奥の林が入る広さ以上）
  const frame = useMemo(() => {
    const ps = layout.plants;
    const far = ps.length ? Math.max(...ps.map((p) => Math.hypot(p.x, p.z) + footprint(p) * p.size)) : 0;
    return { extent: Math.min(FRAME_MAX, Math.max(FRAME_MIN, far + 2)) };
  }, [layout]);

  // 言葉の植物：部品ごとの InstancedMesh
  const built = useMemo(() => {
    const lists = {} as Record<KitPart, { plant: number; color: THREE.Color }[]>;
    layout.plants.forEach((p, i) =>
      PARTS_OF[kindOf(p)].forEach((part) => {
        (lists[part] ??= []).push({ plant: i, color: colorFor(part, p) });
      }),
    );
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const meshes = (Object.keys(lists) as KitPart[]).map((k) => {
      const m = new THREE.InstancedMesh(geo(k), mat, lists[k].length);
      lists[k].forEach(({ color }, i) => m.setColorAt(i, color));
      m.frustumCulled = false;
      return { mesh: m, items: lists[k] };
    });
    // 植物ごとの少しの違い（同じ形が並ぶと人工的に見える）：横 ±8%・高さ ±6%
    const vary = layout.plants.map((_, i) => {
      const h = (k: number) => {
        const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
        return v - Math.floor(v);
      };
      return new THREE.Vector3(1 + (h(1) - 0.5) * 0.16, 1 + (h(2) - 0.5) * 0.12, 1 + (h(3) - 0.5) * 0.16);
    });
    const n = Math.max(1, layout.plants.length);
    // 根もとの影（Blender の fx__shadow：真ん中が濃く、縁で透明）
    const shadows = new THREE.InstancedMesh(
      geo('fx__shadow'),
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
      n,
    );
    shadows.frustumCulled = false;
    // 種（Blender の fx__seed：小さな光の玉）
    const seeds = new THREE.InstancedMesh(geo('fx__seed'), new THREE.MeshBasicMaterial({ vertexColors: true }), n);
    seeds.frustumCulled = false;
    seeds.count = 0;
    plantsDirty.current = true;
    return { meshes, vary, shadows, seeds };
  }, [layout]);

  useEffect(
    () => () => {
      built.meshes.forEach(({ mesh }) => mesh.dispose());
      built.shadows.dispose();
      built.seeds.dispose();
    },
    [built],
  );

  // 時期が変わったら：新しい言葉は種が降りてから芽が出る。前からある言葉は大きさが変わるだけ
  useEffect(() => {
    const now = clock.current;
    const next = new Map<string, Anim>();
    const fresh = layout.plants.filter((p) => !prevSize.current.has(p.word));
    let end = now;
    layout.plants.forEach((p) => {
      const old = prevSize.current.get(p.word);
      let a: Anim;
      if (old === undefined) {
        const k = fresh.indexOf(p);
        a = { from: 0, to: p.size, t0: now + (fresh.length > 1 ? (k / (fresh.length - 1)) * STAGGER : 0), seed: true };
      } else a = { from: old, to: p.size, t0: now, seed: false };
      next.set(p.word, a);
      end = Math.max(end, a.t0 + (a.seed ? SEED_FALL : 0) + GROW);
    });
    anims.current = next;
    animEnd.current = end;
    rig.reset = true;
    prevSize.current = new Map(layout.plants.map((p) => [p.word, p.size]));
    invalidate();
  }, [layout, rig, invalidate]);

  const tmp = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      v: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      s: new THREE.Vector3(),
      ray: new THREE.Raycaster(),
      ndc: new THREE.Vector2(),
      scales: [] as number[],
    }),
    [],
  );

  useFrame((_, dt) => {
    clock.current += Math.min(dt, 0.1);
    const now = clock.current;
    look.waterMat.uniforms.uTime.value = now; // 水の流れ（WATER_FRAG）
    let moving = false;

    // カメラ
    if (rig.reset) {
      rig.reset = false;
      rig.home = frameDist(frame.extent, size.width / size.height);
      rig.goalTarget.set(0, LOOK_Y, 0);
      rig.goalDist = rig.home;
    }
    const k = Math.min(1, dt * 4);
    rig.target.lerp(rig.goalTarget, k);
    rig.dist += (rig.goalDist - rig.dist) * k;
    if (Math.abs(rig.goalDist - rig.dist) > 0.01 || rig.target.distanceTo(rig.goalTarget) > 0.003) moving = true;
    const ce = Math.cos(rig.el);
    camera.position.set(
      rig.target.x + rig.dist * ce * Math.sin(rig.az),
      rig.target.y + rig.dist * Math.sin(rig.el),
      rig.target.z + rig.dist * ce * Math.cos(rig.az),
    );
    // 水の下にもぐらない
    camera.position.y = Math.max(camera.position.y, 0.25);
    camera.lookAt(rig.target);
    camera.rotateX(TILT);
    camera.updateMatrixWorld();

    // 空はカメラについて動く（遠くの景色として、近づいても大きさが変わらない）
    skyRef.current?.position.copy(camera.position);

    // 植物の大きさ（育っている間・選んだものが変わったときだけ計算し直す）
    const growing = now < animEnd.current;
    if (growing) moving = true;
    if (selected !== lastSelected.current) {
      lastSelected.current = selected;
      plantsDirty.current = true;
    }
    const scales = tmp.scales;
    if (growing || plantsDirty.current) {
      scales.length = layout.plants.length;
      layout.plants.forEach((p, i) => {
        const a = anims.current.get(p.word);
        let s = p.size;
        if (a) {
          const t = now - a.t0;
          if (a.seed) s = t < SEED_FALL ? 0 : a.to * easeOutBack(Math.min(1, (t - SEED_FALL) / GROW));
          else s = a.from + (a.to - a.from) * (1 - (1 - Math.min(1, Math.max(0, t) / GROW)) ** 3);
        }
        scales[i] = Math.max(0, s);
      });
      built.meshes.forEach(({ mesh, items }) => {
        items.forEach(({ plant }, i) => {
          const p = layout.plants[plant];
          tmp.v.set(p.x, groundY(p.x, p.z) - 0.02, p.z);
          tmp.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, plant * 2.4);
          tmp.m.compose(tmp.v, tmp.q, tmp.s.copy(built.vary[plant]).multiplyScalar(scales[plant] * growScale(p)));
          mesh.setMatrixAt(i, tmp.m);
        });
        mesh.instanceMatrix.needsUpdate = true;
      });
      layout.plants.forEach((p, i) => {
        const r = footprint(p) * scales[i] * 1.1;
        // 影の円盤は Blender の XY 平面。glTF で Y が上になるので、アプリでは XZ 平面に寝ている
        tmp.m.compose(tmp.v.set(p.x, groundY(p.x, p.z) + 0.015, p.z), tmp.q.identity(), tmp.s.set(r, 1, r));
        built.shadows.setMatrixAt(i, tmp.m);
      });
      built.shadows.count = layout.plants.length;
      built.shadows.instanceMatrix.needsUpdate = true;
      plantsDirty.current = false;
    }

    // 種
    let n = 0;
    if (growing)
      layout.plants.forEach((p) => {
        const a = anims.current.get(p.word);
        if (!a?.seed) return;
        const t = now - a.t0;
        if (t < 0 || t >= SEED_FALL) return;
        const f = t / SEED_FALL;
        const y0 = groundY(p.x, p.z);
        tmp.v.set(p.x + 0.3 * Math.sin(f * 6 + p.x), y0 + 7 * (1 - f) ** 1.6, p.z + 0.3 * Math.cos(f * 5 + p.z));
        const s = 0.08 + 0.03 * Math.sin(now * 12 + p.x);
        tmp.m.compose(tmp.v, tmp.q.identity(), tmp.s.set(s, s, s));
        built.seeds.setMatrixAt(n++, tmp.m);
      });
    built.seeds.count = n;
    built.seeds.instanceMatrix.needsUpdate = true;

    // 触れた所：植物なら言葉を出す。地面なら、そこへ歩いて近づく
    const tap = rig.tap;
    if (tap) {
      rig.tap = null;
      tmp.ndc.set((tap.x / size.width) * 2 - 1, -(tap.y / size.height) * 2 + 1);
      tmp.ray.setFromCamera(tmp.ndc, camera);
      // 植物は細い所が多く、指では当てにくい。画面の上で、触れた所にいちばん近い植物（の真ん中）を選ぶ
      let best = -1;
      let bestD = PICK_PX;
      layout.plants.forEach((p, i) => {
        tmp.v.set(p.x, groundY(p.x, p.z) + plantHeight(p) * scales[i] * 0.5, p.z).project(camera);
        if (tmp.v.z > 1) return;
        const d = Math.hypot(((tmp.v.x + 1) / 2) * size.width - tap.x, ((1 - tmp.v.y) / 2) * size.height - tap.y);
        if (d < bestD) [best, bestD] = [i, d];
      });
      if (best >= 0) onPick(layout.plants[best].word);
      else {
        const ground = groundRef.current ? tmp.ray.intersectObject(groundRef.current, false)[0] : undefined;
        if (ground && ground.point.y > 0.05) {
          // 見る点は植物の高さ。距離は全体の約半分（寄りすぎると地面しか写らない）
          rig.goalTarget.set(ground.point.x, ground.point.y + 0.6, ground.point.z);
          rig.goalDist = Math.max(DIST_MIN + 2, rig.home * 0.5);
          moving = true;
        }
        onPick(null);
      }
    }

    // 選んだ植物：根もとに光の輪（Blender の fx__ring）、上に言葉
    const sp = selected ? layout.plants.findIndex((p) => p.word === selected) : -1;
    if (sp >= 0) {
      const p = layout.plants[sp];
      const y0 = groundY(p.x, p.z);
      if (ringRef.current) {
        // 光の輪は選んでから少しの間だけ脈打ち、そのあと止まる（ずっと描き続けると電池を食う）
        const pulse = now - selectedAt.current < PULSE_SEC ? Math.sin((now - selectedAt.current) * 4) : 0;
        const r = Math.max(0.45, footprint(p) * scales[sp] * 1.4) * (1 + 0.06 * pulse);
        ringRef.current.visible = true;
        ringRef.current.position.set(p.x, y0 + 0.03, p.z);
        ringRef.current.scale.set(r, 1, r);
        (ringRef.current.material as THREE.MeshBasicMaterial).opacity = 0.8 + 0.2 * pulse;
        if (pulse !== 0) moving = true;
      }
      tmp.v.set(p.x, y0 + plantHeight(p) * scales[sp] + 0.15, p.z).project(camera);
      labelX.value = ((tmp.v.x + 1) / 2) * size.width;
      labelY.value = ((1 - tmp.v.y) / 2) * size.height;
      labelOn.value = tmp.v.z < 1 ? 1 : 0;
    } else {
      if (ringRef.current) ringRef.current.visible = false;
      labelOn.value = 0;
    }

    // 確かめ用（Web の開発中だけ）：植物の画面上の位置を出す。scripts/island/audit.mjs が植物に触れるのに使う
    if (__DEV__ && Platform.OS === 'web') {
      const g = globalThis as { __island?: unknown; __islandFrames?: number; __islandRig?: unknown };
      g.__islandFrames = (g.__islandFrames ?? 0) + 1;
      g.__islandRig = { dist: rig.dist, home: rig.home, x: rig.target.x, y: rig.target.y, z: rig.target.z };
      (g as { __islandRigRef?: CameraRig }).__islandRigRef = rig; // 確かめ用：撮るスクリプトがカメラを動かす
      (g as { __islandGroundY?: (x: number, z: number) => number }).__islandGroundY = groundY; // 確かめ用：地面の高さ
      g.__island = layout.plants.map((p, i) => {
        tmp.v.set(p.x, groundY(p.x, p.z) + plantHeight(p) * scales[i] * 0.5, p.z).project(camera);
        return { word: p.word, x: ((tmp.v.x + 1) / 2) * size.width, y: ((1 - tmp.v.y) / 2) * size.height, scale: scales[i] };
      });
    }

    if (moving) invalidate();
  });

  return (
    <>
      {/* 空と朝日（Blender で描いた空の色を焼いた半球）。カメラについて動き、いちばん先に、奥行きを書かずに描く */}
      <group ref={skyRef}>
        <mesh geometry={geo('island__sky')} renderOrder={-2}>
          <meshBasicMaterial vertexColors side={THREE.DoubleSide} depthWrite={false} depthTest={false} />
        </mesh>
        <mesh geometry={geo('island__sun')} renderOrder={-1}>
          <meshBasicMaterial vertexColors side={THREE.DoubleSide} depthWrite={false} depthTest={false} />
        </mesh>
      </group>
      {/* 海・遠くの山と河口・島の地面・景色（林・岩・野の花）・池。どれも Blender で光を焼いてある */}
      <mesh geometry={geo('island__sea')}>
        <meshBasicMaterial vertexColors />
      </mesh>
      <mesh geometry={geo('island__far')}>
        <meshBasicMaterial vertexColors side={THREE.DoubleSide} />
      </mesh>
      {/* 地面：小川が出るまでは溝のない地面（溝だけ見えると、まだない小川の跡に見える） */}
      <mesh
        ref={groundRef}
        geometry={layout.water === 'streams' ? look.ground : look.early}
        material={layout.water === 'streams' ? look.groundMat : look.earlyMat}
      />
      <mesh geometry={geo('island__scenery')}>
        <meshBasicMaterial vertexColors side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={look.pond} material={look.waterMat} />
      {/* 池から浜を通って海へ出る川（いつも流れている。たまる一方にしない） */}
      <mesh geometry={look.river} material={look.waterMat} />
      {/* 水の様子：1か月ほどで水たまりと湧き水、データがたまると小川と木の根もとの淵（SPEC 5. の「最初のころ」） */}
      {layout.water !== 'none' && (
        <>
          <mesh geometry={geo('island__spring')}>
            <meshBasicMaterial vertexColors />
          </mesh>
        </>
      )}
      {layout.water === 'puddles' && (
        <mesh geometry={geo('island__puddles')}>
          <meshBasicMaterial vertexColors />
        </mesh>
      )}
      {layout.water === 'streams' && (
        <>
          <mesh geometry={look.stream} material={look.waterMat} />
          <mesh geometry={look.pool} material={look.waterMat} />
        </>
      )}
      <primitive object={built.shadows} />
      {built.meshes.map(({ mesh }) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
      <primitive object={built.seeds} />
      <mesh ref={ringRef} geometry={geo('fx__ring')} visible={false}>
        <meshBasicMaterial vertexColors transparent depthWrite={false} />
      </mesh>
    </>
  );
}

type Props = SceneProps & { width: number; height: number };

export default function Island3D({ width, height, ...scene }: Props) {
  return (
    // antialias：縁のギザギザを減らす。dpr：細かさは 1.5 倍まで（2 倍では描く量が4倍になり、スマホで重かった）
    <Canvas style={{ width, height }} flat frameloop="demand" gl={{ antialias: true }} dpr={[1, 1.5]} camera={{ fov: FOV, near: 0.1, far: 600, position: [10, 6, 10] }}>
      {/* 光の絵・きらめきの絵を読み込む間は何も出さない */}
      <Suspense fallback={null}>
        <Scene {...scene} />
      </Suspense>
    </Canvas>
  );
}
