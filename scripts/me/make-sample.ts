/// <reference types="node" />
// わたしのことの見本の結果を、前もって計算して src/meSampleResult.json に書く（見本はいつも同じ人・同じ日なので、アプリで計算しない）。
// 使い方: npx tsx scripts/me/make-sample.ts   ← src/meSample.ts か src/flow.ts の計算を変えたら、作り直す
import { writeFileSync } from 'fs';
import { meSample } from '../../src/meSample';
import { computeMeSync, countsFor, examples } from '../../src/flow';
const sm = meSample(Date.now());
const result = computeMeSync(sm.captures, sm.at);
const ex = !result.few && result.top ? examples(sm.captures, sm.at, result.top.word, result.top.to) : [];
writeFileSync('src/meSampleResult.json', JSON.stringify({ at: sm.at, result, examples: ex, first: Math.min(...sm.captures.map((c) => c.capturedAt)), counts: countsFor(sm.captures, sm.at, result) }, null, 1) + '\n');
console.log('top', !result.few && result.top?.word, 'examples', ex);
