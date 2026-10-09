/// <reference types="node" />
// 夜空の試し（tune-test・fdr-test）で使う、共通の部品：ダミーの人のテーマ、本当／偽の線の見分け、でたらめな人、日付
import { type DemoDay } from '../../src/demoPersona';
import { dayKey } from '../../src/period';

export type Cap = { word: string; strength: number; capturedAt: number };

export const THEME: Record<string, string> = {};
for (const [t, ws] of Object.entries({
  work: ['仕事', '疲れ', '眠い', '締め切り', '会議', '不安', 'プレッシャー', '肩が凝る', '目が疲れた', '帰り道'],
  make: ['絵を描く', '作る', 'ひらめいた', 'わくわく', '気になる', 'もっと知りたい', 'やってみたい', '試してみたい', '面白い', '書く'],
  rest: ['散歩', 'お風呂', '安心', 'ほっとした', '休みたい', '穏やか', '軽い', '音楽', 'カフェ'],
  people: ['友達', '家族', '感謝', 'うれしい', '人と話す', '一緒に食べる', '喜び'],
}))
  for (const w of ws) THEME[w] = t;
export const PLANTED = new Set(['散歩\nひらめいた', 'ひらめいた\n散歩', '会議\nわくわく', 'わくわく\n会議', '疲れ\n絵を描く', '絵を描く\n疲れ']);
export const kind = (a: string, b: string) => {
  if (!THEME[a] || !THEME[b]) return 'noise'; // 関係のない言葉
  if (THEME[a] === THEME[b] || PLANTED.has(`${a}\n${b}`)) return 'true';
  return 'mixed'; // テーマをまたぐ（同じ日に2つのテーマがある日の組。本当とも偽とも言えない）
};

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

// でたらめな人：日ごとの「拾った言葉の種類の数」と、全体での言葉の拾われやすさを保ったまま、言葉を引き直す
export function shuffled(caps: Cap[], seed: number): Cap[] {
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

export function daysFor(weeks: number): DemoDay[] {
  const today = new Date(2026, 9, 9);
  const days: DemoDay[] = [];
  for (let d = weeks * 7 - 1; d >= 0; d--) {
    const x = new Date(today.getFullYear(), today.getMonth(), today.getDate() - d);
    days.push({ start: x.getTime(), dow: x.getDay() });
  }
  return days;
}

