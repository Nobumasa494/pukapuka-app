/// <reference types="node" />
// わたしのことの見本の結果を、前もって計算して src/meSampleResult.json に書く（見本はいつも同じ人・同じ日なので、アプリで計算しない）。
// 使い方: npx tsx scripts/me/make-sample.ts   ← src/meSample.ts か src/flow.ts の計算を変えたら、作り直す
import { writeFileSync } from 'fs';
import { meSample } from '../../src/meSample';
import { computeMeSync, nextDayRate } from '../../src/flow';
const sm = meSample(Date.now());
const result = computeMeSync(sm.captures, sm.at);
const numbers = !result.few && result.top && result.top.stage !== 'seen' ? nextDayRate(sm.captures, sm.at, result.top.word) : null;
writeFileSync('src/meSampleResult.json', JSON.stringify({ at: sm.at, result, numbers }, null, 1) + '\n');
console.log('top', !result.few && result.top?.word, 'numbers', numbers);
