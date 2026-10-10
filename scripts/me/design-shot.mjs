// わたしのこと（見本）の下の部分を、スマホの大きさ2つで撮る（デザインを見直すとき用）。8091 で
// 使い方: node scripts/me/design-shot.mjs <出力フォルダ>
import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch();
for (const [name, w, h] of [['se', 375, 667], ['p8', 412, 915]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await p.goto('http://127.0.0.1:8091/', { waitUntil: 'networkidle', timeout: 90000 });
  await p.waitForTimeout(4000);
  await p.mouse.click(w - 33, 67); await p.waitForTimeout(700);
  await p.getByText('わたしのこと', { exact: true }).first().click(); await p.waitForTimeout(2500);
  await p.getByText('見本を見る').first().click(); await p.waitForTimeout(1200);
  for (let k = 1; k <= 3; k++) {
    await p.mouse.move(w / 2, h / 2); await p.mouse.wheel(0, h * 0.85); await p.waitForTimeout(600);
    await p.screenshot({ path: `${out}/d-${name}-${k}.png` });
  }
  await p.close();
}
await b.close();
