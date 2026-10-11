/// <reference types="node" />
// 川をその人向けにしたとき、星空・夜明けの検定がだまされないかを、ダミーの人で数える（2026-10-11 の壁打ちの根拠）
// 使い方: SCEN=all|sky|null|why|power|genki|dbg [BUBBLES=60] [STRONG=1] [SCRAMBLE=1] npx tsx scripts/river/personalize-test.ts [人数]
// 乱数は mulberry32。最初に使った簡単な乱数（LCG）は、日をまたいだかたよりを作り、偽の源を 8%→19% に見せた
import { arrows, genkiSourcesTested, isGenki } from '../../src/flow';
import { significantLinks } from '../../src/communities';
import { WORD_CATEGORY, WORD_LIST } from '../../src/words';

type Cap = { word: string; capturedAt: number };
// mulberry32（前の簡単な乱数は、日をまたいだかたよりを作ってしまった）
const rng = (seed: number) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

const EFFECT = new Set(process.env.STRONG ? ['わくわく'] : ['わくわく', 'ほっとした', 'もっと知りたい']);
const CHILD = ['夜の散歩', '朝の散歩', '川沿いの散歩', '知らない道', '一人で歩く'];
for (const c of CHILD) WORD_CATEGORY[c] = 'doing';
const DOING = WORD_LIST.filter((w) => WORD_CATEGORY[w] === 'doing');
const OTHER = WORD_LIST.filter((w) => WORD_CATEGORY[w] !== 'doing');

type Opt = {
  s1: number; s2: number; // ①ものさし・②育つ枠の割合（残りは③見つける枠）。uniform なら全部均等
  uniform?: boolean;
  boost?: 'top' | '散歩' | null; boostTo?: number; // ②の中で増やす言葉と、12週目の倍率
  children?: 'none' | 'respond' | 'grow'; // 細かい言葉：なし／拾ったら応えるだけ／②でも流す
  source?: '散歩' | '夜の散歩' | null; // 本物の源（次の日に元気な言葉を拾いやすい）
  weeks?: number;
  daily?: boolean; flat?: boolean; genkiX?: number; likeAll?: boolean; trend?: boolean; assoc?: boolean; // 全部の言葉を好みで増やす／散歩の次の日にわくわくを増やす（つながりで寄せる） // ①の中で元気・好奇心の言葉を何倍流すか // 中身を毎日入れかえる（false なら週に1回）
};

function person(seed: number, o: Opt): Cap[] {
  const r = rng(seed);
  const weeks = o.weeks ?? 12;
  const doP = new Map(DOING.map((w) => [w, 0.05 + r() * 0.35])); // その日にそれをした確率
  doP.set('散歩', process.env.STRONG ? 0.5 : 0.4);
  const aff = new Map(OTHER.map((w) => [w, Math.exp((r() - 0.5) * 2)])); // 気持ちなどの拾いやすさ
  const top = [...doP].sort((a, b) => b[1] - a[1])[0][0];
  const boosted = o.boost === 'top' ? top : o.boost ?? null;
  const out: Cap[] = [];
  const start = new Date(2026, 6, 13);
  let effect = false; let prevWalk = false;
  for (let day = 0; day < weeks * 7; day++) {
    const t = new Date(start.getFullYear(), start.getMonth(), start.getDate() + day, 20).getTime();
    const did = new Set(DOING.filter((w) => r() < doP.get(w)!));
    let walkKind = '';
    if (did.has('散歩')) { walkKind = r() < 0.4 ? '夜の散歩' : CHILD[1 + Math.floor(r() * 4)]; did.add(walkKind); }
    const open = r() < 0.85;
    const ramp = o.flat ? (o.boostTo ?? 1) : 1 + ((o.boostTo ?? 1) - 1) * (o.daily ? day / (weeks * 7 - 1) : Math.floor(day / 7) / (weeks - 1));
    const kids = o.children === 'grow' ? CHILD : [];
    const pool2 = [...DOING, ...kids];
    const w2 = pool2.map((w) => (w === boosted || (boosted === '散歩' && CHILD.includes(w) && o.children === 'grow') ? ramp : 1));
    const tot2 = w2.reduce((a, b) => a + b, 0);
    const pick = (w: string) => {
      if (WORD_CATEGORY[w] === 'doing') return did.has(w) ? 0.55 : 0.03;
      let p = 0.05 * aff.get(w)!;
      if (effect && EFFECT.has(w)) p = Math.min(0.8, p * (process.env.STRONG ? 20 : 8));
      return Math.min(p, 0.9);
    };
    const picked = new Set<string>();
    if (open)
      for (let b = 0; b < BUBBLES; b++) {
        const u = r();
        let w: string;
        if (o.likeAll) { const ex = o.trend ? 4 * day / (weeks * 7) : 2; const ws = WORD_LIST.map((x) => (WORD_CATEGORY[x] === 'doing' ? doP.get(x)! * 5 : aff.get(x)!) ** ex); const tot = ws.reduce((a, b) => a + b, 0); let x = r() * tot, i = 0; while ((x -= ws[i]) > 0) i++; w = WORD_LIST[i]; if (o.assoc && prevWalk && r() < 0.05) w = 'わくわく'; }
        else if (o.uniform) w = WORD_LIST[Math.floor(r() * WORD_LIST.length)];
        else if (u < o.s1) {
          if (o.genkiX) { const tot = OTHER.reduce((a, x) => a + (isGenki(x) ? o.genkiX! : 1), 0); let x = r() * tot, i = 0; while ((x -= isGenki(OTHER[i]) ? o.genkiX : 1) > 0) i++; w = OTHER[i]; }
          else w = OTHER[Math.floor(r() * OTHER.length)];
        }
        else if (u < o.s1 + o.s2) { let x = r() * tot2, i = 0; while ((x -= w2[i]) > 0) i++; w = pool2[i]; }
        else w = WORD_LIST[Math.floor(r() * WORD_LIST.length)];
        if (r() < pick(w)) {
          picked.add(w);
          // その場で応える：散歩を拾ったら、細かい言葉が1つ流れてくる
          if (w === '散歩' && o.children && o.children !== 'none') {
            const c = CHILD[Math.floor(r() * CHILD.length)];
            if (r() < pick(c)) picked.add(c);
          }
        }
      }
    for (const w of picked) out.push({ word: w, capturedAt: t });
    prevWalk = picked.has('散歩');
    effect = o.source ? did.has(o.source) : false;
  }
  return out;
}

const BUBBLES = Number(process.env.BUBBLES ?? 60);
const N = Number(process.argv[2] ?? 60);
const pct = (x: number) => `${Math.round((x / N) * 100)}%`;
function run(name: string, o: Opt, target: string | null) {
  let sure = 0, tent = 0, perDay = 0;
  for (let i = 0; i < N; i++) {
    let caps = person(1000 + i, o);
    if (process.env.SCRAMBLE) {
      // 日の中身を、同じ週の中でこちらでばらばらにする（日どうしのつながりを完全に消す）
      const DAY = 86400000; const byDay = new Map<number, string[]>();
      for (const c of caps) { const k = Math.round(c.capturedAt / DAY); (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(c.word); }
      const keys = [...byDay.keys()].sort((a, b) => a - b); const r = rng(77 + i);
      const wk = (k: number) => Math.floor((keys.indexOf(k) >= 0 ? k - keys[0] : 0) / 7);
      const groups = new Map<number, number[]>(); for (const k of keys) (groups.get(wk(k)) ?? groups.set(wk(k), []).get(wk(k))!).push(k);
      const out: Cap[] = [];
      for (const g of groups.values()) { const p = g.slice(); for (let a = p.length - 1; a > 0; a--) { const b = Math.floor(r() * (a + 1)); [p[a], p[b]] = [p[b], p[a]]; } g.forEach((k, j) => byDay.get(p[j])!.forEach((w) => out.push({ word: w, capturedAt: k * DAY }))); }
      caps = out;
    }
    perDay += caps.length / ((o.weeks ?? 12) * 7 * 0.85);
    const s = genkiSourcesTested(caps).map((x) => x.word);
    const t = genkiSourcesTested(caps, 0.3, 2).map((x) => x.word);
    if (target ? s.includes(target) : s.length) sure++;
    if (target ? t.includes(target) : t.length) tent++;
  }
  console.log(`${name.padEnd(34)} | ③${pct(sure).padStart(4)} ②${pct(tent).padStart(4)} | 1日 ${(perDay / N).toFixed(1)}語`);
}

if (process.env.SCEN === 'dbg') {
  for (let i = 0; i < 3; i++) {
    const caps = person(1000 + i, { s1: 0, s2: 0, uniform: true, source: '散歩' });
    const days = (w: string) => new Set(caps.filter((c) => c.word === w).map((c) => c.capturedAt)).size;
    const a = arrows(caps).filter((x) => x.from === '散歩' && ['わくわく', 'ほっとした', 'もっと知りたい'].includes(x.to));
    console.log('散歩の日', days('散歩'), 'わくわくの日', days('わくわく'), a.map((x) => x.to + x.weight).join(' '), '| 上位', genkiSourcesTested(caps, 1, 0).slice(0, 3).map((x) => x.word + '→' + x.to + ' z' + x.z.toFixed(1)).join(', '));
  }
} else if (process.env.SCEN === 'null') {
  console.log(`--- 源のない人 N=${N}`);
  run('今の川（全部均等）', { s1: 0, s2: 0, uniform: true }, null);
  run('6:3:1・よく拾う言葉を8倍・週1', { s1: 0.6, s2: 0.3, boost: 'top', boostTo: 8 }, null);
} else if (process.env.SCEN === 'why') {
  console.log(`--- 源のない人 切り分け N=${N}`);
  run('6:3:1・増やさない', { s1: 0.6, s2: 0.3 }, null);
  run('6:3:1・よく拾う言葉を最初から8倍', { s1: 0.6, s2: 0.3, boost: 'top', boostTo: 8, flat: true }, null);
} else if (process.env.SCEN === 'genki') {
  console.log(`--- 散歩が本物の源の人 泡${BUBBLES}/日 N=${N}`);
  run('今の川（全部均等）', { s1: 0, s2: 0, uniform: true, source: '散歩' }, '散歩');
  run('6:3:1・散歩8倍', { s1: 0.6, s2: 0.3, boost: '散歩', boostTo: 8, source: '散歩' }, '散歩');
  run('6:3:1・散歩8倍・元気3倍', { s1: 0.6, s2: 0.3, boost: '散歩', boostTo: 8, genkiX: 3, source: '散歩' }, '散歩');
  run('6:3:1・散歩8倍・元気3倍・24週', { s1: 0.6, s2: 0.3, boost: '散歩', boostTo: 8, genkiX: 3, source: '散歩', weeks: 24 }, '散歩');
  console.log(`--- 源のない人（偽物）`);
  run('6:3:1・よく拾う8倍・元気3倍', { s1: 0.6, s2: 0.3, boost: 'top', boostTo: 8, genkiX: 3 }, null);
} else if (process.env.SCEN === 'all') {
  console.log(`--- 源のない人（出たら偽物）N=${N}`);
  run('今の川（全部均等）', { s1: 0, s2: 0, uniform: true }, null);
  run('全部を好みで（気持ちも）', { s1: 0, s2: 0, likeAll: true }, null);
  run('全部を好み＋散歩の翌日にわくわく', { s1: 0, s2: 0, likeAll: true, assoc: true }, null);
} else if (process.env.SCEN === 'sky') {
  const sky = (name: string, o: Opt) => {
    let any = 0, lines = 0;
    for (let i = 0; i < N; i++) { const L = significantLinks(person(5000 + i, { ...o, weeks: 6 })).length; lines += L; if (L) any++; }
    console.log(`${name.padEnd(30)} | 偽の線が出た人 ${pct(any).padStart(4)} | 1人あたり ${(lines / N).toFixed(2)}本`);
  };
  console.log(`--- 星空：つながりのない人（線が出たら偽物）6週 N=${N}`);
  sky('今の川（全部均等）', { s1: 0, s2: 0, uniform: true });
  sky('全部を好みで（ずっと同じ強さ）', { s1: 0, s2: 0, likeAll: true });
  sky('全部を好みで（だんだん強く）', { s1: 0, s2: 0, likeAll: true, trend: true });
} else if (process.env.SCEN === 'power') {
  console.log(`--- 散歩が本物の源の人 泡${BUBBLES}/日 N=${N}`);
  run('今の川（全部均等）', { s1: 0, s2: 0, uniform: true, source: '散歩' }, '散歩');
  run('6:3:1・散歩を8倍', { s1: 0.6, s2: 0.3, boost: '散歩', boostTo: 8, source: '散歩' }, '散歩');
  run('4:5:1・散歩を8倍', { s1: 0.4, s2: 0.5, boost: '散歩', boostTo: 8, source: '散歩' }, '散歩');
  run('応える＋②で8倍 →夜の散歩', { s1: 0.6, s2: 0.3, children: 'grow', boost: '散歩', boostTo: 8, source: '夜の散歩' }, '夜の散歩');
} else {
console.log(`--- 源のない人（出たら偽物）N=${N}`);
run('今の川（全部均等）', { s1: 0, s2: 0, uniform: true }, null);
run('6:3:1・よく拾う言葉を8倍・週1', { s1: 0.6, s2: 0.3, boost: 'top', boostTo: 8 }, null);
run('6:3:1・よく拾う言葉を8倍・毎日', { s1: 0.6, s2: 0.3, boost: 'top', boostTo: 8, daily: true }, null);
console.log(`--- 散歩が本物の源の人`);
run('今の川（全部均等）', { s1: 0, s2: 0, uniform: true, source: '散歩' }, '散歩');
run('6:3:1・散歩を増やさない', { s1: 0.6, s2: 0.3, source: '散歩' }, '散歩');
run('6:3:1・散歩を8倍', { s1: 0.6, s2: 0.3, boost: '散歩', boostTo: 8, source: '散歩' }, '散歩');
run('4:5:1・散歩を8倍', { s1: 0.4, s2: 0.5, boost: '散歩', boostTo: 8, source: '散歩' }, '散歩');
console.log(`--- 本当の源は夜の散歩の人`);
run('細かい言葉なし →散歩', { s1: 0.6, s2: 0.3, source: '夜の散歩' }, '散歩');
run('応えるだけ →夜の散歩', { s1: 0.6, s2: 0.3, children: 'respond', source: '夜の散歩' }, '夜の散歩');
run('応える＋②で8倍 →夜の散歩', { s1: 0.6, s2: 0.3, children: 'grow', boost: '散歩', boostTo: 8, source: '夜の散歩' }, '夜の散歩');
run('応える＋②で8倍・24週 →夜の散歩', { s1: 0.6, s2: 0.3, children: 'grow', boost: '散歩', boostTo: 8, source: '夜の散歩', weeks: 24 }, '夜の散歩');
}
