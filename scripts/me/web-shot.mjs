// わたしのことを web（?demo=1）で開いて撮る。使い方: node scripts/me/web-shot.mjs <出力フォルダ> [URL=http://127.0.0.1:8091/?demo=1]
import { chromium } from 'playwright';
const out = process.argv[2];
const url = process.argv[3] ?? 'http://127.0.0.1:8091/?demo=1';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const logs = [];
p.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
p.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(4000);
// 右上の月と星 → わたしのこと
await p.mouse.click(390 - 16 - 17, 52 + 15);
await p.waitForTimeout(800);
await p.getByText('夜明け', { exact: true }).first().click();
const t0 = Date.now();
await p.waitForFunction(() => /のあとに|見えてきます|見えていません/.test(document.body.innerText), null, { timeout: 120000 }).catch(() => {});
console.log('表示まで', Date.now() - t0, 'ms');
await p.waitForTimeout(1200);
await p.screenshot({ path: `${out}/me-web-1.png` });
// 下へスクロール
for (let k = 2; k <= 4; k++) {
  await p.mouse.move(195, 500);
  await p.mouse.wheel(0, 700);
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${out}/me-web-${k}.png` });
}
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 10).join('\n'));
await b.close();
