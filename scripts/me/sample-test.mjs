// わたしのことの「見本」と「見方」を web（8091）で確かめる。記録のない新しい端末として開く（?demo なし）
// 使い方: node scripts/me/sample-test.mjs <出力フォルダ>
import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://127.0.0.1:8091/', { waitUntil: 'networkidle', timeout: 90000 });
await p.waitForTimeout(5000);
let ok = true;
const check = (n, v) => { console.log(v ? '✅' : '❌', n); if (!v) ok = false; };
await p.mouse.click(390 - 33, 67); await p.waitForTimeout(700);
await p.getByText('夜明け', { exact: true }).first().click();
await p.waitForTimeout(3000);
await p.screenshot({ path: `${out}/s1-empty.png` });
check('何も出ないとき「見本を見る」がある', (await p.getByText('見本を見る').count()) > 0);
await p.getByText('見本を見る').first().click();
const t0 = Date.now();
await p.waitForFunction(() => /多いみたい|ありました/.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
console.log('見本が出るまで', Date.now() - t0, 'ms');
await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/s2-sample.png` });
check('見出しが「夜明け（見本）」', (await p.getByText('夜明け（見本）').count()) > 0);
await p.mouse.move(195, 500); await p.mouse.wheel(0, 800); await p.waitForTimeout(700);
await p.screenshot({ path: `${out}/s3-sample-scroll.png` });
await p.mouse.wheel(0, 900); await p.waitForTimeout(700);
await p.screenshot({ path: `${out}/s4-sample-scroll.png` });
// 見方
await p.getByLabel('夜明けの見方').click(); await p.waitForTimeout(700);
await p.screenshot({ path: `${out}/s5-help.png` });
check('見方が開く', (await p.getByText('夜明けの見方', { exact: true }).count()) > 0);
await p.mouse.click(390 - 30, 60); await p.waitForTimeout(600);
check('見方を閉じる', (await p.getByText('夜明けの見方', { exact: true }).count()) === 0);
// 見本をとじる
await p.getByLabel('見本をとじる').click(); await p.waitForTimeout(800);
check('見本をとじると「← 水辺へ」に戻る', (await p.getByText('← 水辺へ').count()) > 0);
// 見方の中から見本
await p.getByLabel('夜明けの見方').click(); await p.waitForTimeout(600);
check('見方の中に「見本を見る」', (await p.getByText('見本を見る').count()) > 0);
await p.getByText('見本を見る').last().click(); await p.waitForTimeout(1500);
check('見方から見本が開く（2回目はすぐ）', (await p.getByText('夜明け（見本）').count()) > 0 && /多いみたい/.test(await p.evaluate(() => document.body.innerText)));
await p.getByLabel('見本をとじる').click(); await p.waitForTimeout(600);
await p.getByText('← 水辺へ').first().click(); await p.waitForTimeout(3000);
await p.mouse.click(390 - 33, 67); await p.waitForTimeout(700);
check('水辺に戻って月と星が開く', (await p.getByText('夜明け', { exact: true }).count()) > 0);
console.log(errs.join('\n'));
await b.close();
process.exit(ok ? 0 : 1);
