/// <reference types="node" />
// 「いい週・つらい週」にだまされないか（数字の根拠 A）。日の入れ替え方（全体で／週の中で）を比べる
// 使い方: npx tsx scripts/me/mood-test.ts [人数=100]
// - 気分の週の人：週ごとに「いい週」か「つらい週」。いい週は 散歩・わくわく・ほっとした、つらい週は 仕事・疲れ・不安 を拾いやすい。
//   同じ週の中では日の順番に意味はない → 「散歩のあとに…」や「仕事⇄疲れ」が出たら、だまされている
// - 流れもある人：上に「料理の次の日、6割で『ひらめいた』」を足した人。本物の源は「料理」
import { dayNumber, genkiSourcesTested, loopsTested, setShuffleBlock } from '../../src/flow';

type Cap = { word: string; capturedAt: number };
const rng = (seed: number) => { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
const OTHER = ['友達', '家族', '音楽', '読書', 'お風呂', '眠い', '時間', 'お金', '面白い', '気になる', '安心', '退屈', 'カフェ', '映画'];
function moodPerson(weeks: number, seed: number, flow: boolean): Cap[] {
  const r = rng(seed); const out: Cap[] = [];
  const start = new Date(2026, 6, 13); // 月曜
  let cook = false;
  for (let w = 0; w < weeks; w++) {
    const good = r() < 0.5;
    for (let d = 0; d < 7; d++) {
      const t = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d, 20).getTime();
      const add = (word: string) => out.push({ word, capturedAt: t });
      if (good) { if (r() < 0.6) add('散歩'); if (r() < 0.6) add('わくわく'); if (r() < 0.5) add('ほっとした'); }
      else { if (r() < 0.7) add('仕事'); if (r() < 0.7) add('疲れ'); if (r() < 0.5) add('不安'); }
      for (let k = 0; k < 3; k++) add(OTHER[Math.floor(r() * OTHER.length)]);
      if (flow && cook && r() < 0.6) add('ひらめいた');
      cook = r() < 0.25; if (cook) add('料理');
    }
  }
  return out;
}
const N = Number(process.argv[2] ?? 100);
console.log('入れ替え方 | 気分の週の人：偽の源・偽のめぐり | 流れもある人：料理が源に出た');
for (const block of [0, 7]) {
  setShuffleBlock(block);
  let fakeS = 0, fakeL = 0, hit = 0;
  for (let i = 0; i < N; i++) {
    const m = moodPerson(12, 100 + i, false);
    if (genkiSourcesTested(m).length) fakeS++;
    if (loopsTested(m).length) fakeL++;
    if (genkiSourcesTested(moodPerson(12, 100 + i, true))[0]?.word === '料理') hit++;
  }
  console.log(`${block ? '週の中で' : '全体で　'} | 源 ${Math.round((fakeS / N) * 100)}%・めぐり ${Math.round((fakeL / N) * 100)}% | ${Math.round((hit / N) * 100)}%`);
}
void dayNumber;
