/// <reference types="node" />
// 45個の箱で数えたとき、星空・夜明けの検定が働くか（2026-10-14。設計書 A.「倉庫と箱」。アプリのコードは変えない）
// 使い方: npx tsx scripts/river/box-test.ts [人数=40]   環境変数 BUBBLES（1日の泡の数・既定60）WEEKS（既定12）
// - 箱：行動34・気持ち6（元気＝わくわく・うれしい・おだやか）・そのほか5。言葉はすべて箱の番号で数える
// - 川の配合：10個のうち 自分の箱4（拾った割合で重み）・知らない箱3（まだ拾ったことのない行動の箱）・気持ちとそのほか3
// - 人：その日にした行動・感じた気持ちの箱は 0.55、そうでない箱は 0.02 の確率で、流れてきた泡を拾う
// - 本物の源：「歩く」をした次の日は、わくわくを感じやすい（0.7）。源のない人では、出たら偽物
import { GENKI_WORDS, genkiSourcesTested } from '../../src/flow';
import { significantLinks } from '../../src/communities';
import { WORD_CATEGORY } from '../../src/words';
import { BOXES } from '../../convex/boxes';

type Cap = { word: string; capturedAt: number };
const rng = (seed: number) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

const ACT = BOXES.filter((b) => b.id <= 34).map((b) => b.name);
const FEEL = BOXES.filter((b) => b.id >= 35 && b.id <= 40).map((b) => b.name);
const OTHER = BOXES.filter((b) => b.id >= 41).map((b) => b.name);
const GENKI = ['わくわく・気になる', 'うれしい・楽しい', 'おだやか・ほっと'];
for (const w of ACT) WORD_CATEGORY[w] = 'doing';
for (const w of [...FEEL, ...OTHER]) WORD_CATEGORY[w] = 'emotion';
GENKI_WORDS.clear();
for (const w of GENKI) GENKI_WORDS.add(w);
GENKI_WORDS.add('元気');
WORD_CATEGORY['元気'] = 'emotion';
const SOURCE = '歩く', TARGET = 'わくわく・気になる';

const BUBBLES = Number(process.env.BUBBLES ?? 60);
const WEEKS = Number(process.env.WEEKS ?? 12);
// 気持ちの枠（3個）のうち、元気の3箱を流す割合（既定は11箱で均等＝3/11）。毎日同じ割合なので「何のあとに何」にはならない
// 川の配合（環境変数 OWN・UNK。既定は 0.4・0.3＝自分の箱4・知らない箱3・気持ち3）
const OWN = Number(process.env.OWN ?? 0.4), UNK = Number(process.env.UNK ?? 0.3);
const GENKI_SHARE = Number(process.env.GENKI ?? 3 / 11);
const start = new Date(2026, 6, 13).getTime();

function live(seed: number, withSource: boolean): Cap[] {
  const r = rng(seed);
  // その人の毎日：好きな行動の箱が3つ（よくする）、ほかはたまに
  const doP = new Map(ACT.map((w) => [w, 0.02 + r() * 0.06]));
  const fav = [...ACT].sort(() => r() - 0.5).slice(0, 3);
  for (const f of fav) doP.set(f, 0.3 + r() * 0.2);
  doP.set(SOURCE, 0.45);
  const feelP = new Map([...FEEL, ...OTHER].map((w) => [w, 0.1 + r() * 0.25]));
  const shown = new Map<string, number>(), picked = new Map<string, number>();
  const out: Cap[] = [];
  let walked = false;
  for (let day = 0; day < WEEKS * 7; day++) {
    const did = new Set(ACT.filter((w) => r() < doP.get(w)!));
    const felt = new Set([...FEEL, ...OTHER].filter((w) => r() < (withSource && walked && w === TARGET ? 0.7 : feelP.get(w)!)));
    const t = start + day * 86400000 + 20 * 3600000;
    const today = new Set<string>();
    if (r() < 0.85) {
      const known = ACT.filter((w) => (picked.get(w) ?? 0) > 0);
      const unknown = ACT.filter((w) => !(picked.get(w) ?? 0));
      const rate = (w: string) => ((picked.get(w) ?? 0) + 1) / ((shown.get(w) ?? 0) + 10);
      for (let b = 0; b < BUBBLES; b++) {
        const x = r();
        let box: string;
        if (x < OWN && known.length) {
          const tot = known.reduce((a, w) => a + rate(w), 0);
          let y = r() * tot, i = 0;
          while ((y -= rate(known[i])) > 0 && i < known.length - 1) i++;
          box = known[i];
        } else if (x < OWN + UNK) box = (unknown.length ? unknown : ACT)[Math.floor(r() * (unknown.length || ACT.length))];
        else if (r() < GENKI_SHARE) box = GENKI[Math.floor(r() * GENKI.length)];
        else { const fo = [...FEEL, ...OTHER].filter((w) => !GENKI.includes(w)); box = fo[Math.floor(r() * fo.length)]; }
        shown.set(box, (shown.get(box) ?? 0) + 1);
        if (r() < (did.has(box) || felt.has(box) ? 0.55 : 0.02)) { today.add(box); picked.set(box, (picked.get(box) ?? 0) + 1); }
      }
    }
    for (const w of today) out.push({ word: w, capturedAt: t });
    walked = did.has(SOURCE);
  }
  return out;
}

const N = Number(process.argv[2] ?? 40);
const pct = (x: number) => `${Math.round((x / N) * 100)}%`;
let walkDays = 0, walkPicked = 0;
for (const [name, withSource] of [['源のない人', false], ['歩くが源の人', true]] as const) {
  let any = 0, hit = 0, lines = 0;
  for (let i = 0; i < N; i++) {
    const caps = live(1000 + i, withSource);
    // MERGE=1：元気の3つの箱を、夜明けでは1つの「元気」として数える（比べる組が減り、検定が厳しくなりすぎない）
    const s = genkiSourcesTested(process.env.MERGE ? caps.map((c) => (GENKI.includes(c.word) ? { ...c, word: '元気' } : c)) : caps);
    if (s.length) any++;
    if (s.some((x) => x.word === SOURCE && GENKI_WORDS.has(x.to))) hit++;
    const last42 = caps.filter((c) => c.capturedAt >= start + (WEEKS * 7 - 42) * 86400000);
    lines += significantLinks(last42).length;
    if (withSource && i === 0) { walkPicked = new Set(caps.filter((c) => c.word === SOURCE).map((c) => c.capturedAt)).size; }
  }
  console.log(`${name.padEnd(8)} | 源が出た ${pct(any).padStart(4)}（歩く→元気 ${pct(hit)}）| 星空の線 ${(lines / N).toFixed(1)}本`);
}
walkDays = Math.round(WEEKS * 7 * 0.45);
console.log(`（1人目の例：${WEEKS}週で歩いた日は約${walkDays}日、そのうち「歩く」を拾った日 ${walkPicked}日）`);
