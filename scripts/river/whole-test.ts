/// <reference types="node" />
// その人向けの川を、川 → 記録 → そろえる → 分析 まで通しで動かす（2026-10-11 の壁打ち。アプリのコードは変えない）
// 使い方: npx tsx scripts/river/whole-test.ts [人数=60]
// - 1. 川：見つける枠（全部の言葉から均等）＋その人向けの枠（よく拾う家族を多めに。家族の中は均等にいろいろ）。週に1回だけ入れかえる。
//        していることを拾うと、すぐその家族の細かい言葉が1つ流れる（応える泡）
// - 2. 記録：拾った言葉（細かい言葉のまま）
// - 3. そろえる：細かい言葉はいつも元の言葉にも数える。期間の中で GRAD_DAYS 日以上拾われた細かい言葉は、自分としても数える（自分の言葉で出る）
// - 4. 分析：夜明けの源（genkiSourcesTested）・星空の線（significantLinks。元の言葉と細かい言葉どうしの線は引かない）
import { GENKI_WORDS, genkiSourcesTested, isGenki } from '../../src/flow';
import { significantLinks } from '../../src/communities';
import { WORD_CATEGORY, WORD_LIST } from '../../src/words';

type Cap = { word: string; capturedAt: number };
const rng = (seed: number) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// 細かい言葉（AI が作る想定）。親 → 子
const FAMILY: Record<string, string[]> = {
  散歩: ['夜の散歩', '朝の散歩', '知らない道を歩く', '川沿いを歩く'],
  料理: ['新しいレシピ', '作り置き', '誰かに作る'],
  写真: ['空の写真', '街角の写真', '人を撮る'],
  読書: ['小説', '古本屋をのぞく', '読みかけ'],
  わくわく: ['待ちきれない', '胸が高鳴る', 'そわそわ楽しい'],
  ほっとした: ['肩の力が抜けた', '帰ってきた感じ'],
  疲れ: ['ぐったり', '頭がいっぱい'],
};
const PARENT = new Map<string, string>();
for (const [p, cs] of Object.entries(FAMILY)) for (const c of cs) { PARENT.set(c, p); WORD_CATEGORY[c] = WORD_CATEGORY[p]; if (GENKI_WORDS.has(p)) GENKI_WORDS.add(c); }
const BASE = [...WORD_LIST];
const familyOf = (w: string) => PARENT.get(w) ?? w;
const members = (p: string) => [p, ...(FAMILY[p] ?? [])];

export const GRAD_DAYS = Number(process.env.GRAD ?? 6); // 自分の言葉で出る：期間の中で何日拾われたら（案）
const GATHER = !!process.env.GATHER, GATHER_DOING = process.env.GATHER === 'doing';
const BUBBLES = Number(process.env.BUBBLES ?? 60), DISCOVER = 0.2, MAX_TILT = 4;

type Person = { fine: boolean; seed: number };
function live(p: Person, weeks: number, personal: boolean): Cap[] {
  const r = rng(p.seed);
  // その日にしたこと・感じたこと（本人の中のこと。川とは関係ない）
  const doP = new Map(BASE.filter((w) => WORD_CATEGORY[w] === 'doing').map((w) => [w, 0.05 + r() * 0.3]));
  doP.set('散歩', 0.45);
  const feelP = new Map(BASE.filter((w) => WORD_CATEGORY[w] !== 'doing').map((w) => [w, 0.02 + r() * 0.15]));
  const prefer = new Map(Object.entries(FAMILY).map(([k, cs]) => [k, cs[Math.floor(r() * cs.length)]])); // その人がよく感じる・する細かい形
  if (p.fine) prefer.set('散歩', '夜の散歩');
  const out: Cap[] = [];
  const start = new Date(2026, 6, 13); // 月曜
  const shown = new Map<string, number>(), picked = new Map<string, number>(); // 家族ごと（川の重みを決める）
  let tilt = new Map<string, number>();
  let nightWalk = false;
  for (let day = 0; day < weeks * 7; day++) {
    if (personal && day % 7 === 0) {
      // 週に1回：家族ごとに「流れた回数のうち何回拾ったか」（はじめは全部同じ点から：+1/+10）。いちばん低い家族の MAX_TILT 倍まで
      const rate = (f: string) => ((picked.get(f) ?? 0) + 1) / ((shown.get(f) ?? 0) + 10);
      const rs = BASE.map(rate); const lo = Math.min(...rs);
      tilt = new Map(BASE.map((f, i) => [f, Math.min(MAX_TILT, rs[i] / lo)]));
    }
    const t = new Date(start.getFullYear(), start.getMonth(), start.getDate() + day, 20).getTime();
    const did = new Set<string>();
    for (const [w, q] of doP) if (r() < q) { did.add(w); if (FAMILY[w]) did.add(r() < 0.5 ? prefer.get(w)! : FAMILY[w][Math.floor(r() * FAMILY[w].length)]); }
    const felt = new Set<string>();
    for (const [w, q] of feelP) {
      let qq = q;
      if (nightWalk && w === 'わくわく') qq = 0.7; // 本物の源：夜の散歩の次の日は、わくわく
      if (r() < qq) { felt.add(w); if (FAMILY[w]) felt.add(r() < 0.5 ? prefer.get(w)! : FAMILY[w][Math.floor(r() * FAMILY[w].length)]); }
    }
    const pickP = (w: string) => (did.has(w) || felt.has(w) ? 0.55 : 0.02);
    const tot = BASE.reduce((a, f) => a + (tilt.get(f) ?? 1), 0);
    const day1 = new Set<string>();
    const meet = (w: string) => {
      const f = familyOf(w); shown.set(f, (shown.get(f) ?? 0) + 1);
      if (r() < pickP(w)) {
        day1.add(w); picked.set(f, (picked.get(f) ?? 0) + 1);
        if (personal && FAMILY[f] && WORD_CATEGORY[f] === 'doing') { const c = FAMILY[f][Math.floor(r() * FAMILY[f].length)]; if (c !== w) meet(c); } // 応える泡（同じ日）
      }
    };
    const open = r() < 0.85;
    if (open)
      for (let b = 0; b < BUBBLES; b++) {
        let f: string;
        if (!personal || r() < DISCOVER) f = BASE[Math.floor(r() * BASE.length)];
        else { let x = r() * tot, i = 0; while ((x -= tilt.get(BASE[i]) ?? 1) > 0) i++; f = BASE[i]; }
        const m = personal ? members(f) : [f]; // 家族の中はいろいろ（均等）
        meet(m[Math.floor(r() * m.length)]);
      }
    // 気持ちを拾いやすくする（案）：1日に1回、元気・好奇心の言葉がまとめて流れてくる
    if (GATHER && personal && open) for (const w of BASE) if (isGenki(w) || (GATHER_DOING && WORD_CATEGORY[w] === 'doing')) { const m = members(w); meet(m[Math.floor(r() * m.length)]); }
    for (const w of day1) out.push({ word: w, capturedAt: t });
    nightWalk = did.has('夜の散歩');
  }
  return out;
}

// 3. そろえる：細かい言葉はいつも元の言葉にも数える。GRAD_DAYS 日以上なら自分としても
function align(caps: Cap[]): { caps: Cap[]; grad: Set<string> } {
  const days = new Map<string, Set<number>>();
  for (const c of caps) if (PARENT.has(c.word)) (days.get(c.word) ?? days.set(c.word, new Set()).get(c.word)!).add(Math.floor(c.capturedAt / 86400000));
  const grad = new Set([...days].filter(([, d]) => d.size >= GRAD_DAYS).map(([w]) => w));
  const out: Cap[] = [];
  for (const c of caps) {
    const p = PARENT.get(c.word);
    if (!p) { out.push(c); continue; }
    out.push({ word: p, capturedAt: c.capturedAt });
    if (grad.has(c.word)) out.push(c);
  }
  return { caps: out, grad };
}
const window = (caps: Cap[], endDay: number, days: number) => {
  const start = new Date(2026, 6, 13).getTime();
  return caps.filter((c) => { const d = Math.floor((c.capturedAt - start) / 86400000); return d < endDay && d >= endDay - days; });
};
const skyLinks = (caps: Cap[]) => significantLinks(caps).filter((l) => PARENT.get(l.a) !== l.b && PARENT.get(l.b) !== l.a);

const N = Number(process.argv[2] ?? 60);
if (process.env.DBG) { const c = align(live({ fine: true, seed: 42 }, 12, true)).caps; const days = (w: string) => new Set(c.filter((x) => x.word === w).map((x) => Math.floor(x.capturedAt / 864e5))); const W = days("散歩"), K = days("わくわく"); let hit = 0; for (const d of W) if (K.has(d + 1)) hit++; console.log("散歩の日", W.size, "わくわくの日", K.size, "散歩の次の日にわくわく", hit); console.log(genkiSourcesTested(c, 1, 0).slice(0, 5).map((s) => `${s.word}→${s.to} z${s.z.toFixed(1)} w${s.weight}`)); process.exit(0); }
const WEEKS = 24;

// (a) ひとりの人の歩み
const one = live({ fine: true, seed: 42 }, WEEKS, true);
console.log('--- 夜の散歩が本当の源の人（1人）。週ごとの夜明けと星空');
for (let w = 4; w <= WEEKS; w += 2) {
  const dawn = align(window(one, w * 7, 84));
  const sky = align(window(one, w * 7, 42));
  const sure = genkiSourcesTested(dawn.caps).map((s) => s.word);
  const maybe = genkiSourcesTested(dawn.caps, 0.3, 2).map((s) => s.word).filter((x) => !sure.includes(x));
  const stars = new Set(skyLinks(sky.caps).flatMap((l) => [l.a, l.b]));
  console.log(`${String(w).padStart(2)}週 | 源 よく:${sure.join('・') || '-'} かも:${maybe.join('・') || '-'} | 自分の言葉で出る:${[...dawn.grad].join('・') || '-'} | 星空の細かい星:${[...stars].filter((s) => PARENT.has(s)).join('・') || '-'}`);
}

// (b)(c) たくさんの人
const pct = (x: number) => `${Math.round((x / N) * 100)}%`;
function many(name: string, fine: boolean, personal: boolean, weeks: number) {
  let any = 0, walk = 0, night = 0, lines = 0, grads = 0;
  for (let i = 0; i < N; i++) {
    const caps = live({ fine, seed: 1000 + i }, weeks, personal);
    const dawn = align(window(caps, weeks * 7, 84));
    const s = genkiSourcesTested(dawn.caps).map((x) => x.word);
    if (s.length) any++; if (s.includes('散歩')) walk++; if (s.includes('夜の散歩')) night++;
    lines += skyLinks(align(window(caps, weeks * 7, 42)).caps).length; grads += dawn.grad.size;
  }
  console.log(`${name.padEnd(26)} | 源が出た ${pct(any).padStart(4)}（散歩 ${pct(walk)}・夜の散歩 ${pct(night)}）| 星空の線 ${(lines / N).toFixed(1)}本 | 自分の言葉で出る ${(grads / N).toFixed(1)}語`);
}
console.log(`--- たくさんの人 N=${N}（源のない人は、出たら偽物）`);
many('源のない人・今の川・12週', false, false, 12);
many('源のない人・その人向け・12週', false, true, 12);
many('夜の散歩の人・今の川・12週', true, false, 12);
many('夜の散歩の人・その人向け・12週', true, true, 12);
many('夜の散歩の人・その人向け・24週', true, true, 24);
