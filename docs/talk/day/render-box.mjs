// 倉庫で動く画面を撮る（2026-10-14）。8091 で web を立ててから: node docs/talk/day/render-box.mjs
// 先に npx convex run demo:seedBoxDemo '{"days":28}'
import { chromium } from 'playwright';
import path from 'path';
const dir = path.dirname(new URL(import.meta.url).pathname);
const W = 390, H = 844;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const url = 'http://127.0.0.1:8091/?demo=1&warehouse=1';
const moon = async (dest) => { await p.mouse.click(W - 33, 67); await p.waitForTimeout(700); await p.getByText(dest, { exact: true }).first().click(); };
const home = async () => { await p.goto(url, { waitUntil: 'networkidle', timeout: 120000 }); await p.waitForTimeout(8000); };
await home(); await p.screenshot({ path: path.join(dir, 'box_1river.png') });
await moon('夕空'); await p.waitForTimeout(6000); await p.screenshot({ path: path.join(dir, 'box_2yuzora.png') });
await home(); await moon('星空'); await p.waitForTimeout(6000); await p.screenshot({ path: path.join(dir, 'box_3sky.png') });
await home(); await moon('夜明け');
await p.waitForFunction(() => /のあとに|見えてきます|見えていません/.test(document.body.innerText), null, { timeout: 90000 }).catch(() => {});
await p.waitForTimeout(2000); await p.screenshot({ path: path.join(dir, 'box_4dawn.png') });
await b.close();
