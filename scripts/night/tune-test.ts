/// <reference types="node" />
// 夜空の線の条件（検定の値・一緒の日の下限・期間）を、ダミーの人で総当たりして比べる（数字の根拠 A）
// 使い方: npx tsx scripts/night/tune-test.ts [人数=100]
// - ダミーの人（src/demoPersona.ts）：本当のつながり＝同じテーマの言葉どうし＋わざと混ぜた3組。関係のない言葉（NOISE）の線は偽物
// - でたらめな人：ダミーの人と、日ごとの拾う数・言葉の拾われやすさは同じで、組み合わせだけをばらばらにした人。出た線はすべて偽物
// 本物の記録がたまったら、同じ試しをやり直す（ダミーに合わせすぎないように）
import { makeDemoCaptures, type DemoDay } from '../../src/demoPersona';
import { chanceOfAtLeast, cooccurrence } from '../../src/communities';
import { dayKey } from '../../src/period';

type Cap = { word: string; strength: number; capturedAt: number };

const THEME: Record<string, string> = {};
for (const [t, ws] of Object.entries({
  work: ['仕事', '疲れ', '眠い', '締め切り', '会議', '不安', 'プレッシャー', '肩が凝る', '目が疲れた', '帰り道'],
  make: ['絵を描く', '作る', 'ひらめいた', 'わくわく', '気になる', 'もっと知りたい', 'やってみたい', '試してみたい', '面白い', '書く'],
  rest: ['散歩', 'お風呂', '安心', 'ほっとした', '休みたい', '穏やか', '軽い', '音楽', 'カフェ'],
  people: ['友達', '家族', '感謝', 'うれしい', '人と話す', '一緒に食べる', '喜び'],
}))
  for (const w of ws) THEME[w] = t;
const PLANTED = new Set(['散歩\nひらめいた', 'ひらめいた\n散歩', '会議\nわくわく', 'わくわく\n会議', '疲れ\n絵を描く', '絵を描く\n疲れ']);
const kind = (a: string, b: string) => {
  if (!THEME[a] || !THEME[b]) return 'noise'; // 関係のない言葉
  if (THEME[a] === THEME[b] || PLANTED.has(`${a}\n${b}`)) return 'true';
  return 'mixed'; // テーマをまたぐ（同じ日に2つのテーマがある日の組。本当とも偽とも言えない）
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

// 本番の significantLinks と同じ計算。下限 minCo を変えられるようにしたもの
function links(caps: Cap[], alpha: number, minCo: number) {
  const days = new Map<string, Set<string>>();
  const active = new Set<string>();
  for (const c of caps) {
    const k = dayKey(c.capturedAt);
    active.add(k);
    if (!days.has(c.word)) days.set(c.word, new Set());
    days.get(c.word)!.add(k);
  }
  const lf = [0];
  for (let i = 1; i <= active.size; i++) lf[i] = lf[i - 1] + Math.log(i);
  const out: { a: string; b: string }[] = [];
  for (const { a, b, count } of cooccurrence(caps)) {
    if (count < minCo) continue;
    if (chanceOfAtLeast(lf, active.size, days.get(a)!.size, days.get(b)!.size, count) >= alpha) continue;
    out.push({ a, b });
  }
  return out;
}

// でたらめな人：日ごとの「拾った言葉の種類の数」と、全体での言葉の拾われやすさを保ったまま、言葉を引き直す
function shuffled(caps: Cap[], seed: number): Cap[] {
  const r = rng(seed);
  const byDay = new Map<string, Cap[]>();
  for (const c of caps) {
    const k = dayKey(c.capturedAt);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(c);
  }
  const freq = new Map<string, number>();
  for (const list of byDay.values()) for (const w of new Set(list.map((c) => c.word))) freq.set(w, (freq.get(w) ?? 0) + 1);
  const words = [...freq.keys()];
  const out: Cap[] = [];
  for (const list of byDay.values()) {
    const n = new Set(list.map((c) => c.word)).size;
    const pool = new Map(freq);
    const chosen: string[] = [];
    while (chosen.length < n && pool.size) {
      let x = r() * [...pool.values()].reduce((a, b) => a + b, 0);
      for (const w of words) {
        if (!pool.has(w)) continue;
        x -= pool.get(w)!;
        if (x <= 0) {
          chosen.push(w);
          pool.delete(w);
          break;
        }
      }
    }
    chosen.forEach((w, i) => out.push({ word: w, strength: 0.5, capturedAt: list[Math.min(i, list.length - 1)].capturedAt }));
  }
  return out;
}

function daysFor(weeks: number): DemoDay[] {
  const today = new Date(2026, 9, 9);
  const days: DemoDay[] = [];
  for (let d = weeks * 7 - 1; d >= 0; d--) {
    const x = new Date(today.getFullYear(), today.getMonth(), today.getDate() - d);
    days.push({ start: x.getTime(), dow: x.getDay() });
  }
  return days;
}

const PEOPLE = Number(process.argv[2] ?? 100);
const ALPHAS = [0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.001];
const MINCOS = [1, 2, 3];
const WEEKS = [2, 4, 6, 8];

type Row = { weeks: number; minCo: number; alpha: number; fakeRandom: number; trueLines: number; noiseLines: number; mixedLines: number };
const rows: Row[] = [];
for (const weeks of WEEKS) {
  const people = Array.from({ length: PEOPLE }, (_, i) => makeDemoCaptures(daysFor(weeks), 1000 + i));
  const randoms = people.map((p, i) => shuffled(p, 5000 + i));
  for (const minCo of MINCOS)
    for (const alpha of ALPHAS) {
      let fr = 0, t = 0, n = 0, m = 0;
      for (const p of randoms) fr += links(p, alpha, minCo).length;
      for (const p of people)
        for (const l of links(p, alpha, minCo)) {
          const k = kind(l.a, l.b);
          if (k === 'true') t++;
          else if (k === 'noise') n++;
          else m++;
        }
      rows.push({ weeks, minCo, alpha, fakeRandom: fr / PEOPLE, trueLines: t / PEOPLE, noiseLines: n / PEOPLE, mixedLines: m / PEOPLE });
    }
}
console.log(JSON.stringify(rows));
