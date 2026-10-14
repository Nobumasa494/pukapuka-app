// 夕空の見本を web で撮る（光が出ているかの確かめ。2026-10-14）。8091 で web を立ててから: node docs/talk/day/render-yz-web.mjs 出力.png
import { chromium } from 'playwright';
const W = 390, H = 844;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await p.goto('http://127.0.0.1:8091/?demo=1&warehouse=1', { waitUntil: 'networkidle', timeout: 120000 }); await p.waitForTimeout(8000);
await p.mouse.click(W - 33, 67); await p.waitForTimeout(700); await p.getByText('夕空', { exact: true }).first().click(); await p.waitForTimeout(6000);
await p.getByText('見本を見る').click(); await p.waitForTimeout(1500);
await p.screenshot({ path: process.argv[2] });
await b.close();
