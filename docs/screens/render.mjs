// 画面の一覧（docs/screens/screens.html）を、README に載せる画像にする。
// 使い方: node docs/screens/render.mjs   → docs/screens/1_river.png … 5_diary.png
// screens.html を直したら、これを動かして画像も作り直す（見本の絵と例の言葉は仮のもの）
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const names = ['1_river', '2_words', '3_sky', '4_me', '5_diary'];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 980, height: 800 }, deviceScaleFactor: 1.5 });
await p.setContent('<!doctype html><meta charset="utf-8">' + fs.readFileSync(path.join(dir, 'screens.html'), 'utf8'), { waitUntil: 'networkidle' });
await p.waitForTimeout(800);
const secs = await p.$$('section');
for (let i = 0; i < secs.length; i++) await secs[i].screenshot({ path: path.join(dir, `${names[i] ?? i + 1}.png`) });
console.log('wrote', secs.length, 'images');
await b.close();
