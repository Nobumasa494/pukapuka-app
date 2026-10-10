// 日記を、書く → カレンダーに印 → 書き足す → 前の日に書く → けす まで通して確かめる（web・8091）。
// ダミーの人は保存しないので、テスト用の端末の目印で開く（開発用 Convex に書き、最後に消す）
// 使い方: node scripts/diary/save-test.mjs [URL=http://127.0.0.1:8091/]
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://127.0.0.1:8091/';
const ID = 'diarytest-000000000000000000000001';
const W = 390, H = 844;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await p.addInitScript((id) => localStorage.setItem('pukapuka.deviceId', id), ID);
await p.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForTimeout(5000);
let ok = true;
const check = (name, v) => { console.log(v ? '✅' : '❌', name); if (!v) ok = false; };
const wait = (t) => p.getByText(t, { exact: false }).first().waitFor({ timeout: 10000 }).then(() => true, () => false);
await p.mouse.click(W - 33, 67); await p.waitForTimeout(700);
await p.getByText('日記', { exact: true }).first().click();
await p.getByText('今日の日記を書く').first().waitFor({ timeout: 15000 });
await p.getByText('今日の日記を書く').first().click();
await p.getByPlaceholder('自由に書けます').fill('川沿いを遠回りした\n夕日がきれいで、しばらく見ていた');
await p.getByText('のこす', { exact: true }).first().click();
check('書いた日記が出る', await wait('夕日がきれいで'));
check('カレンダーの今日に印', (await p.locator('[aria-label$="日記あり"]').count()) === 1);
await p.getByText('書き足す・直す').first().click();
await p.getByPlaceholder('自由に書けます').fill('川沿いを遠回りした\n夕日がきれいで、しばらく見ていた\n帰ってから絵を描いた');
await p.getByText('のこす', { exact: true }).first().click();
check('書き足せる', await wait('帰ってから絵を描いた'));
// 前の日（カレンダーで今日の1つ前のマス。月はじめなら前の月へ）
const d = new Date(); d.setDate(d.getDate() - 1);
if (d.getDate() > new Date().getDate()) { await p.getByLabel('前の月').first().click(); await p.waitForTimeout(300); }
await p.locator(`[aria-label^="${d.getMonth() + 1}/${d.getDate()}（"]`).first().click();
await p.getByText('この日の日記を書く').first().click();
await p.getByPlaceholder('自由に書けます').fill('きのうのこと');
await p.getByText('のこす', { exact: true }).first().click();
check('前の日にも書ける', await wait('きのうのこと'));
await p.screenshot({ path: '/tmp/pukapuka-screenshots/diary-saved.png', fullPage: true });
const erase = async () => { await p.getByText('けす', { exact: true }).first().click(); await p.getByText('この日記をけす').first().click(); await p.waitForTimeout(800); };
await erase();
await p.locator(`[aria-label$="日記あり"]`).first().click();
await erase();
check('けすと印が消える', await p.locator('[aria-label$="日記あり"]').count().then(async (n) => { await p.waitForTimeout(800); return (await p.locator('[aria-label$="日記あり"]').count()) === 0; }));
await b.close();
process.exit(ok ? 0 : 1);
