// 夜明けの「ほかのこと」（01 そのあとに／02 行ったり来たり／03 変化）まで開いて撮る。使い方: node docs/talk/day/render-dawn.mjs 名前
import { chromium } from 'playwright';
import path from 'path';
const dir = path.dirname(new URL(import.meta.url).pathname);
const name = process.argv[2] ?? 'dawn';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await p.goto('http://127.0.0.1:8091/?demo=1&warehouse=1', { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForTimeout(6000);
await p.mouse.click(390 - 33, 67); await p.waitForTimeout(700);
await p.getByText('夜明け', { exact: true }).first().click();
await p.waitForFunction(() => /のあとに|見えてきます|見えていません/.test(document.body.innerText), null, { timeout: 90000 }).catch(() => {});
await p.waitForTimeout(2000);
await p.getByText('ほかのこと').first().click().catch(() => {});
await p.waitForTimeout(1500);
for (let i = 0; i < 3; i++) { await p.mouse.move(195, 500); await p.mouse.wheel(0, 700); await p.waitForTimeout(700); await p.screenshot({ path: path.join(dir, `${name}_${i}.png`) }); }
await b.close();
