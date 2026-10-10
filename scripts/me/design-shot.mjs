// 夜明け（見本）を、スマホの大きさで撮る（デザインを見直すとき用）。8091 で
// 使い方: node scripts/me/design-shot.mjs <出力フォルダ> [幅=390] [高さ=844]
// 出力: v-0（何もないとき）v-1（見本の開いたとき）v-2,3,4（下にスクロール）v-help（見方）、v-all（並べたもの）
import { chromium } from 'playwright';
const [out, W = '390', H = '844'] = process.argv.slice(2);
const w = Number(W), h = Number(H);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
await p.goto('http://127.0.0.1:8091/', { waitUntil: 'networkidle', timeout: 90000 });
await p.waitForTimeout(4000);
await p.mouse.click(w - 33, 67); await p.waitForTimeout(700);
await p.getByText('夜明け', { exact: true }).first().click(); await p.waitForTimeout(2500);
await p.screenshot({ path: `${out}/v-0.png` });
await p.getByText('見本を見る').first().click(); await p.waitForTimeout(1200);
await p.screenshot({ path: `${out}/v-1.png` });
for (let k = 2; k <= 4; k++) {
  await p.mouse.move(w / 2, h / 2); await p.mouse.wheel(0, h * 0.8); await p.waitForTimeout(600);
  await p.screenshot({ path: `${out}/v-${k}.png` });
}
await p.getByLabel('夜明けの見方').click(); await p.waitForTimeout(700);
await p.screenshot({ path: `${out}/v-help.png` });
await b.close();
