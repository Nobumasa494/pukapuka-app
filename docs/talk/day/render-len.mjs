// 泡の文字数の見本を撮る（2026-10-13）。8091 で web を立ててから: node docs/talk/day/render-len.mjs
import { chromium } from 'playwright';
import path from 'path';
const dir = path.dirname(new URL(import.meta.url).pathname);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
for (const n of ['6', '8', '10']) {
  await p.goto(`http://127.0.0.1:8091/?demo=1&len=${n}`, { waitUntil: 'networkidle', timeout: 120000 });
  await p.waitForTimeout(25000);
  await p.screenshot({ path: path.join(dir, `len${n}.png`) });
}
await b.close();
