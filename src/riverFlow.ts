// 泡の流れの計算。すべて worklet なので UI スレッドで毎コマ動かせる（JS スレッドの遅れで泡が止まらない）。
// 起動時の先回し計算では JS スレッドからも同じ関数を呼ぶ。
import riverData from './data/riverPath.json';
import { coverRect, type VideoRect } from './riverPath';

// 流れの速さ（px/秒）。遠近は泡の大きさで出し、速さは奥でも手前の9割（奥で詰まらないように）
const SPEED_NEAR = 32;
const SPEED_FAR_RATIO = 0.9;
// 泡は奥〜中ほど（川筋の最初の250px）の水面から浮かび上がる。奥の狭いS字だけから出すと一列に詰まり6個しか流れない
const SPAWN_S_MAX = 250;
const SPAWN_MARGIN = 1.25;
// 泡が横に並ぶ位置（その場所で泡が使える横幅＝川幅の半分−泡の半径 に対する割合）。
// 以前は「川幅の半分×0.42×奥ほど小さい係数」で、川の中央の狭い帯に集まり一列に見えた（横の散らばり 0.24 → 0.45）
const LANES = [-0.95, 0.95, 0, -0.55, 0.55];
// 横よけで横に滑る速さ（px/秒）。流れ（32px/秒）より速いので、追いついた泡は回り込める。
// 速すぎると「跳ねた」ように見える。遅すぎると接触してから横移動するので重なる
const AVOID_SPEED = 150;
// よけるときの最低間隔（泡の半径の和＋余白）
const AVOID_MARGIN = 8;
// 触る前に何分手前まで横へ動き始めるか（px）。ここが小さいと接触してからよけるので重なる
const AVOID_LOOKAHEAD = 55;

export type PathData = {
  rect: VideoRect;
  xs: number[];
  ys: number[];
  hws: number[];
  nys: number[];
  cum: number[];
  length: number;
  refHalfw: number;
  height: number;
};

export type SimBubble = {
  id: number;
  s: number;      // 川筋に沿った位置（画面 px、0=奥）
  lane: number;   // 川幅の半分に対する横の位置
  age: number;    // 浮かび上がってからの秒数
  len: number;    // 文字数（大きさの計算用）
  pressed: boolean;
  // 水面を離れた（指で引っぱり出された・拾われて空へ昇り始めた）。流れの中にもう居ないので、ほかの泡の障害物にしない
  lifted: boolean;
  drift: number;  // px。押された泡や前にいる泡をよけるため横にずらす量（0=元のレーン）
};

export type Placed = { x: number; y: number; size: number; t: number };

// 川筋上の位置と、画面上の形
type Spot = { s: number; pl: Placed };
// 横の空き（画面 px）。left / right は 0〜川幅/2
type Free = { left: number; right: number };

export function buildPathData(screenW: number, screenH: number): PathData {
  const rect = coverRect(screenW, screenH);
  const raw = riverData.points as [number, number, number][];
  const xs = raw.map(([x]) => rect.left + x * rect.width);
  const ys = raw.map(([, y]) => rect.top + y * rect.height);
  const hws = raw.map(([, , hw]) => hw * rect.width);
  const nys = raw.map(([, y]) => y);
  const cum = [0];
  for (let i = 1; i < xs.length; i++) cum.push(cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]));
  // 手前（画面の高さ85%付近）の川幅を速さの基準にする
  let ref = 0;
  for (let i = 1; i < ys.length; i++) if (Math.abs(ys[i] - screenH * 0.85) < Math.abs(ys[ref] - screenH * 0.85)) ref = i;
  return { rect, xs, ys, hws, nys, cum, length: cum[cum.length - 1], refHalfw: hws[ref], height: screenH };
}

export function pathAt(P: PathData, s: number) {
  'worklet';
  const c = Math.min(P.length, Math.max(0, s));
  let i = 1;
  while (i < P.cum.length - 1 && P.cum[i] < c) i++;
  const c0 = P.cum[i - 1];
  const c1 = P.cum[i];
  const u = c1 === c0 ? 0 : (c - c0) / (c1 - c0);
  const ny = P.nys[i - 1] + (P.nys[i] - P.nys[i - 1]) * u;
  return {
    x: P.xs[i - 1] + (P.xs[i] - P.xs[i - 1]) * u,
    y: P.ys[i - 1] + (P.ys[i] - P.ys[i - 1]) * u,
    halfw: P.hws[i - 1] + (P.hws[i] - P.hws[i - 1]) * u,
    t: Math.min(1, Math.max(0, (ny - 0.33) / 0.3)),
  };
}

// 泡の直径。遠近は大きさの差で残しつつ、奥でも文字10px以上を守る（/pukapuka-blender の式と同じ）
export function sizeAt(halfw: number, t: number, len: number) {
  'worklet';
  const persp = halfw * 0.44 * (0.85 + 0.06 * len);
  const minFit = (10 * len) / 0.82 + 4;
  return Math.min(100, Math.max(minFit * (0.9 + 0.1 * t), 40 + (persp - 40) * t, persp));
}

export function placeBubble(P: PathData, b: SimBubble): Placed {
  'worklet';
  const p = pathAt(P, b.s);
  const size = sizeAt(p.halfw, p.t, b.len);
  // 横ずれ（drift）は水のなかに収める。岸まで行くと泡が岸の上に載ってしまう。
  // 川幅の割合で区切るのではなく「泡の半径ぶん内側」で区切る。割合で区切ると、
  // 狭いところではよけ幅が足りずよけても通れずに列が残る
  const room = Math.max(0, p.halfw - size / 2 - 2);
  // 横の位置も同じ room を基準にする。奥の狭いS字では room がほぼ0なので自然に中心線へ寄る
  const laneX = p.x + b.lane * room;
  const x = Math.max(p.x - room, Math.min(p.x + room, laneX + b.drift));
  return { x, y: p.y, size, t: p.t };
}

function clashes(a: Placed, b: Placed) {
  'worklet';
  return Math.hypot(a.x - b.x, a.y - b.y) < ((a.size + b.size) / 2) * 1.04;
}

// 押されている泡の「ここには寄らない」圏。押された泡は川筋上の s で前後に並べる。
// 画面上の y で前後も判定すると、川が S 字に曲がっているせいで「すぐ後ろの泡」が
// y が同じかむしろ小さくなり（= 奥に見える）、よけるべき泡が通過済みと誤認される。
// s が大きい方が手前。押された泡が手前にある（s > 自分）ときだけ敵になる
function hitsHeld(P: PathData, b: SimBubble, held: Spot[]) {
  'worklet';
  const p = placeBubble(P, b);
  for (let j = 0; j < held.length; j++) {
    if (held[j].s <= b.s) continue;
    if (Math.hypot(p.x - held[j].pl.x, p.y - held[j].pl.y) < (p.size + held[j].pl.size) / 2 + AVOID_MARGIN) return true;
  }
  return false;
}

function hitsDone(P: PathData, b: SimBubble, done: Placed[]) {
  'worklet';
  const p = placeBubble(P, b);
  for (let j = 0; j < done.length; j++) if (clashes(done[j], p)) return true;
  return false;
}

function blocked(P: PathData, b: SimBubble, done: Placed[], held: Spot[]) {
  'worklet';
  return hitsDone(P, b, done) || hitsHeld(P, b, held);
}

// この先（手前）の川筋が左右どちらへどれだけ開いているか（画面 px）。
// 「押した泡をよけるならどちらへ寄るか」を決めるのに使う
function freeRoom(P: PathData, fromX: number, fromY: number): Free {
  'worklet';
  let left = 0;
  let right = 0;
  for (let j = 0; j < P.ys.length; j++) {
    if (P.ys[j] <= fromY) continue;
    const d = P.xs[j] - fromX;
    if (d < 0) {
      if (-d > left) left = -d;
    } else if (d > right) right = d;
  }
  return { left, right };
}

// 横よけで入ろうとしている場所は、他の泡と重ならないか。
// すでに入ってしまった場所（重なり中の泡から抜け出すとき）は許す
function sideIsFree(P: PathData, cand: SimBubble, base: Placed, done: Placed[], others: Placed[]) {
  'worklet';
  const p = placeBubble(P, cand);
  for (let j = 0; j < done.length; j++) if (clashes(done[j], p)) return false;
  for (let j = 0; j < others.length; j++) {
    const o = others[j];
    const was = Math.hypot(base.x - o.x, base.y - o.y) < (base.size + o.size) / 2 + AVOID_MARGIN;
    const now = Math.hypot(p.x - o.x, p.y - o.y) < (p.size + o.size) / 2 + AVOID_MARGIN;
    if (now && !was) return false;
  }
  return true;
}

// 川筋に沿って dt 秒流す。前（手前）の泡から動かし、ぶつかる所へは進まない。流れ切った泡は exited に
export function stepBubbles(P: PathData, bs: SimBubble[], dt: number) {
  'worklet';
  const ordered = bs.slice().sort((a, b) => b.s - a.s);
  const done: Placed[] = [];
  const out: SimBubble[] = [];
  const exited: number[] = [];
  // 押されている泡は done（後ろを止める列）に入れない。ただし重ならない位置には留める。
  // 水面を離れた泡は障害物にもしない（元の場所に見えない壁が残り、後ろが一列に詰まった）
  const held: Spot[] = [];
  for (let k = 0; k < ordered.length; k++) {
    if (ordered[k].pressed && !ordered[k].lifted) held.push({ s: ordered[k].s, pl: placeBubble(P, ordered[k]) });
  }
  // 走っている泡の位置。横よけの重なり判定に使う。押されている泡も 넣어おく
  // （入れないと、横よけで押された泡の圏に踏み込んでしまう）
  const others: Placed[] = held.map((h) => h.pl);
  // 1コマでも止まった泡（奥側ほど古い）。前方の泡のよける対象になる
  const stalled: Spot[] = [];

  for (let k = 0; k < ordered.length; k++) {
    const b = ordered[k];
    const base = placeBubble(P, b);
    let nb: SimBubble = { ...b, age: b.age + dt };
    let stopped = false;
    if (!b.pressed) {
      const p = pathAt(P, b.s);
      const v = SPEED_NEAR * Math.min(1.15, Math.max(SPEED_FAR_RATIO, p.halfw / P.refHalfw));
      const room = freeRoom(P, base.x, base.y);
      const stepMax = AVOID_SPEED * dt;
      let drift = b.drift;

      // よける対象を、奥（s が小さい）から順に試す。
      // 前の泡は列の入口なので、真っ先に横へよけないと列が解けない
      const targets: Spot[] = [];
      for (let i = 0; i < stalled.length; i++) {
        if (stalled[i].s > b.s) targets.push(stalled[i]);
      }
      for (let i = 0; i < held.length; i++) if (held[i].s > b.s) targets.push(held[i]);
      targets.sort((a, c) => a.s - c.s);

      for (let i = 0; i < targets.length; i++) {
        const g = targets[i];
        const behind = g.s - b.s;
        const radii = (base.size + g.pl.size) / 2;
        if (behind > radii + AVOID_LOOKAHEAD) continue;
        // 遠いときは大きめ取って先に回り込む。近づくほど足りる幅は小さくなる
        const want = radii + AVOID_MARGIN + Math.max(0, AVOID_LOOKAHEAD - behind) * 0.35;
        if (Math.hypot(base.x - g.pl.x, base.y - g.pl.y) >= want) continue;
        const k2 = room.left >= room.right ? -1 : 1;
        const free = k2 < 0 ? room.left : room.right;
        // 横が足りなければよけない。足りる幅までで止める（求めると壁到最后路径の端に張り付く）
        const aim = Math.min(want, free);
        if (aim < radii) break;
        const dx = base.x - g.pl.x;
        const dir = dx === 0 ? k2 : dx > 0 ? 1 : -1;
        // その方向へ必要的だけ動く
        const move = dir * aim - drift;
        const step = Math.max(-stepMax, Math.min(stepMax, move));
        if (step === 0) continue;
        const trial: SimBubble = { ...b, age: nb.age, pressed: false, drift: drift + step };
        if (!sideIsFree(P, trial, base, done, others)) break;
        drift += step;
      }

      const side: SimBubble = { ...b, age: nb.age, pressed: false, drift };
      const fwd: SimBubble = { ...side, s: b.s + v * dt };
      if (!blocked(P, fwd, done, held)) {
        nb = fwd;
      } else if (!blocked(P, side, done, held) || sideIsFree(P, side, base, done, others)) {
        nb = side;
        stopped = Math.abs(drift - b.drift) < 0.01; // 横よけもできずに止まった
      } else {
        stopped = true;
      }
    }
    const np = placeBubble(P, nb);
    if (nb.s >= P.length || np.y - np.size / 2 >= P.height) {
      exited.push(nb.id);
      continue;
    }
    if (!nb.pressed) {
      done.push(np);
      others.push(np);
      if (stopped) stalled.push({ s: b.s, pl: base });
    }
    out.push(nb);
  }
  return { bs: out, exited };
}

// 奥〜中ほどの水面に、ほかの泡と重ならない場所があれば新しい泡を出す
export function spawnBubble(P: PathData, bs: SimBubble[], id: number, len: number): SimBubble | null {
  'worklet';
  const placed: Placed[] = [];
  for (let k = 0; k < bs.length; k++) if (!bs[k].lifted) placed.push(placeBubble(P, bs[k]));
  const lanes = LANES.slice();
  for (let i = lanes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = lanes[i];
    lanes[i] = lanes[j];
    lanes[j] = tmp;
  }
  for (let li = 0; li < lanes.length; li++) {
    const cand: SimBubble = { id, s: Math.random() * SPAWN_S_MAX, lane: lanes[li], age: 0, len, pressed: false, lifted: false, drift: 0 };
    const c = placeBubble(P, cand);
    let ok = true;
    for (let k = 0; k < placed.length; k++) {
      const o = placed[k];
      if (Math.hypot(o.x - c.x, o.y - c.y) < ((o.size + c.size) / 2) * SPAWN_MARGIN) {
        ok = false;
        break;
      }
    }
    if (ok) return cand;
  }
  return null;
}