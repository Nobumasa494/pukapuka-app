// Blender で書き出した島（assets/island/kit.glb）を、アプリがそのまま読める TS に変換する。
// 使い方: node scripts/island/glb-to-ts.mjs
// アプリの中で .glb を読み込む仕組み（ローダー・Metro の設定）を使わずに済み、スマホと Web で同じに動く。
// 部品の名前は「種類__役」（例: island__scenery・tree_big__base・fx__shadow）。
//
// 色は Blender で焼いた色（光と影を焼き込んだもの）。ローポリは三角形ごとに1色なので、
// 形は「重なった頂点をまとめた位置 + 面」、色は「三角形ごとの色（sRGB 8bit）」で出す（頂点ごとより約3分の1の大きさ）。
// fx__（影・選んだ印など、透明度のなめらかな変化が要る物）と空・太陽（色がなめらかに移り変わる。三角形ごとの1色だとタイル状に見えた）は、
// 頂点ごとの色と透明度（RGBA）で出す。
import { readFileSync, writeFileSync } from 'node:fs';

const buf = readFileSync('assets/island/kit.glb');
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
const bin = buf.subarray(20 + jsonLen + 8);

const SIZE = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };
const COMPS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function read(accIndex) {
  const acc = gltf.accessors[accIndex];
  const view = gltf.bufferViews[acc.bufferView];
  const comps = COMPS[acc.type];
  const sz = SIZE[acc.componentType];
  const stride = view.byteStride ?? comps * sz;
  const off = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const out = new Float64Array(acc.count * comps);
  for (let i = 0; i < acc.count; i++)
    for (let c = 0; c < comps; c++) {
      const p = off + i * stride + c * sz;
      let v =
        acc.componentType === 5126 ? bin.readFloatLE(p) : acc.componentType === 5125 ? bin.readUInt32LE(p) : acc.componentType === 5123 ? bin.readUInt16LE(p) : bin.readUInt8(p);
      if (acc.normalized) v /= acc.componentType === 5123 ? 65535 : 255;
      out[i * comps + c] = v;
    }
  return { data: out, comps };
}
const lin2srgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const to8 = (v) => Math.round(Math.min(1, Math.max(0, lin2srgb(v))) * 255);

const parts = {};
let tris = 0;
let bytes = 0;
for (const node of gltf.nodes) {
  if (node.mesh === undefined) continue;
  // Blender では書き出し用の写し（名前の最後に .x）を書き出す。元の名前に戻す
  const name = node.name.replace(/\.x$/, '');
  if (node.rotation || node.scale || (node.translation && node.translation.some((v) => Math.abs(v) > 1e-6)))
    throw new Error(`${name} に位置・回転・大きさが残っている（Blender で変形を適用してから書き出す）`);
  const fx = name.startsWith('fx__') || name === 'island__sky' || name === 'island__sun';
  const keyOf = new Map();
  const pos = [];
  const idx = [];
  const face = [];
  const vcol = [];
  for (const prim of gltf.meshes[node.mesh].primitives) {
    const P = read(prim.attributes.POSITION).data;
    if (prim.attributes.COLOR_0 === undefined) throw new Error(`${name} に焼いた色（COLOR_0）がない`);
    const C = read(prim.attributes.COLOR_0);
    const I = read(prim.indices).data;
    if (fx) {
      // 頂点をそのまま（色と透明度が頂点ごとに違うため、まとめない）
      const base = pos.length / 3;
      for (let v = 0; v < P.length / 3; v++) {
        pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
        for (let k = 0; k < 3; k++) vcol.push(to8(C.data[v * C.comps + k]));
        vcol.push(Math.round((C.comps === 4 ? C.data[v * C.comps + 3] : 1) * 255));
      }
      for (const i of I) idx.push(i + base);
      continue;
    }
    const vid = (v) => {
      const key = `${Math.round(P[v * 3] * 1e4)},${Math.round(P[v * 3 + 1] * 1e4)},${Math.round(P[v * 3 + 2] * 1e4)}`;
      let id = keyOf.get(key);
      if (id === undefined) {
        id = pos.length / 3;
        keyOf.set(key, id);
        pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
      }
      return id;
    };
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t];
      const b = I[t + 1];
      const c = I[t + 2];
      idx.push(vid(a), vid(b), vid(c));
      for (let k = 0; k < 3; k++) face.push(to8((C.data[a * C.comps + k] + C.data[b * C.comps + k] + C.data[c * C.comps + k]) / 3));
    }
  }
  const nv = pos.length / 3;
  if (!fx) {
    // 焼いた色ではない属性（ほぼ 1.0 の明るさのばらつき用など）が書き出されると全部白になる。平均が白に近ければ止める
    let sum = 0;
    for (const v of face) sum += v;
    const avg = sum / face.length;
    if (avg > 245) throw new Error(`${name} の色がほぼ白（平均 ${avg.toFixed(0)}）。焼いた色（Baked）でない属性が書き出されている`);
  }
  const posB = Buffer.from(new Float32Array(pos).buffer);
  const idxB = Buffer.from((nv > 65535 ? new Uint32Array(idx) : new Uint16Array(idx)).buffer);
  const colB = Buffer.from(new Uint8Array(fx ? vcol : face).buffer);
  parts[name] = { p: posB.toString('base64'), i: idxB.toString('base64'), c: colB.toString('base64'), big: nv > 65535, fx };
  tris += idx.length / 3;
  bytes += posB.length + idxB.length + colB.length;
}
const names = Object.keys(parts).sort();
const body = names
  .map((n) => `  ${n}: { p: '${parts[n].p}', i: '${parts[n].i}', c: '${parts[n].c}', big: ${parts[n].big}, fx: ${parts[n].fx} },`)
  .join('\n');
writeFileSync(
  'src/islandKit.ts',
  `// 自動生成（scripts/island/glb-to-ts.mjs）。手で直さない。元は assets/island/kit.glb（Blender: pukapuka_blender/pk_island_parts_v*.blend）\n` +
    `// 島の地面・景色・海・空・太陽・言葉の植物・印の形と、Blender で焼いた色（光と影）。\n` +
    `// p=位置 Float32、i=面 Uint16/32、c=色（fx=false: 三角形ごとの RGB、fx=true: 頂点ごとの RGBA。sRGB 8bit）。どれも base64\n` +
    `export const ISLAND_KIT = {\n${body}\n} as const;\n\nexport type KitPart = keyof typeof ISLAND_KIT;\n`,
);
console.log(`部品 ${names.length}・三角形 ${tris}・データ ${(bytes / 1024).toFixed(0)}KB`);
for (const n of names) console.log(`  ${n}: ${(Buffer.from(parts[n].i, 'base64').length / (parts[n].big ? 4 : 2)) / 3}`);
