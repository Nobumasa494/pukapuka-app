import { useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { SharedValue } from 'react-native-reanimated';
import type { IslandLayout, Plant } from '../islandLayout';
import { CATEGORY_COLOR } from '../wordCloud';
import { ISLAND_KIT, type KitPart } from '../islandKit';

// 島（朝）の3D（2026-10-05）。見えるものはすべて Blender で作った形と、Blender で焼いた色（光と影）だけ。
// 島の地面・景色（林・池・岩・飛び石）・海・空・太陽・言葉の植物・根もとの影・種の光・選んだ印の輪、どれも src/islandKit.ts から。
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
// 最初に見せる範囲の半径：草地（言葉の植物が育つ所）全体と、その奥の林が入る
const FRAME_MIN = 7.5;
const FRAME_MAX = 12;

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
    target: new THREE.Vector3(0, 0.6, 0),
    goalTarget: new THREE.Vector3(0, 0.6, 0),
    tap: null,
    reset: false,
  };
}

export const distLimits = (rig: CameraRig) => [DIST_MIN, rig.home * 1.5] as const;

// ---- 地面の高さ ----
// 島の地形は Blender で作った（scripts/island/blender/island_terrain.py）。言葉の植物が育つ草地（半径 7 まで）の高さだけをここで計算する。
// 式は island_terrain.py の meadow() と必ず同じにする（違うと植物が浮く・埋まる）
function groundY(x: number, z: number): number {
  return 0.6 + 0.2 * Math.sin(0.33 * x + 1.3) * Math.cos(0.29 * z - 0.4) + 0.1 * Math.sin(0.71 * x - 0.47 * z + 2.0);
}

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

// ---- 言葉の植物 ----
// 種類ごとの部品（Poly Pizza の素材を Blender で塗り直し、光を焼いたもの）
//   base＝葉・幹など（焼いた色のまま）、accent＝花びら・実（白で焼いてある。種類の色を掛ける）
type Kind = 'sprout' | 'flower' | 'grass' | 'bush' | 'tree_small' | 'tree_big';
const KIND_OF: Record<Plant['category'], Kind> = { emotion: 'flower', body: 'grass', situation: 'bush', value: 'tree_small', curiosity: 'tree_big' };
const KINDS: Kind[] = ['sprout', 'flower', 'grass', 'bush', 'tree_small', 'tree_big'];
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
  return hasAccent ? WHITE : WHITE.clone().lerp(tint(p), 0.28);
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
    let moving = false;

    // カメラ
    if (rig.reset) {
      rig.reset = false;
      rig.home = frameDist(frame.extent, size.width / size.height);
      rig.goalTarget.set(0, 0.6, 0);
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
      {/* 海・島の地面・景色（林・池・岩・飛び石）。どれも Blender で光を焼いてある */}
      <mesh geometry={geo('island__sea')}>
        <meshBasicMaterial vertexColors />
      </mesh>
      <mesh ref={groundRef} geometry={geo('island__ground')}>
        <meshBasicMaterial vertexColors />
      </mesh>
      <mesh geometry={geo('island__scenery')}>
        <meshBasicMaterial vertexColors side={THREE.DoubleSide} />
      </mesh>
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
    <Canvas style={{ width, height }} flat frameloop="demand" camera={{ fov: FOV, near: 0.1, far: 600, position: [10, 6, 10] }}>
      <Scene {...scene} />
    </Canvas>
  );
}
