// 日記を web（8091・?demo=1）で開いて確かめ、写真を撮る。月と星 → 日記 → 使い方 → 見本 → 戻る → もう一度開く
// 使い方: node scripts/diary/web-test.mjs [URL=http://127.0.0.1:8091/?demo=1] [出力フォルダ=/tmp/pukapuka-screenshots]
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://127.0.0.1:8091/?demo=1';
const out = process.argv[3] ?? '/tmp/pukapuka-screenshots';
const W = 390, H = 844;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const errors = [];
// 動画の自動再生の禁止（ヘッドレスのブラウザだけ。ほかの画面でも出る）は数えない
p.on('pageerror', (e) => { if (!String(e).includes('NotAllowedError')) errors.push(String(e)); });
await p.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForTimeout(5000);
let ok = true;
const check = (name, v) => { console.log(v ? '✅' : '❌', name); if (!v) ok = false; };
const open = async () => {
  await p.mouse.click(W - 33, 67); await p.waitForTimeout(700);
  await p.getByText('日記', { exact: true }).first().click(); await p.waitForTimeout(1500);
};
await open();
check('日記が開く（カレンダー）', (await p.getByText('← 水辺へ').count()) > 0 && (await p.getByLabel('前の月').count()) > 0);
check('今日の日記を書く が出る', await p.getByText('今日の日記を書く').first().waitFor({ timeout: 15000 }).then(() => true, () => false));
await p.screenshot({ path: `${out}/diary-1.png` });
await p.getByLabel('日記の使い方').first().click(); await p.waitForTimeout(500);
check('使い方が開く', (await p.getByText('日記の使い方', { exact: true }).count()) > 0);
await p.screenshot({ path: `${out}/diary-intro.png` });
await p.getByText('見本を見る').last().click(); await p.waitForTimeout(600); // 使い方の中のもの
check('見本が開く（今日の日記が出る）', (await p.getByText('日記（見本）').count()) > 0 && (await p.getByText('書き足す・直す').count()) > 0);
await p.screenshot({ path: `${out}/diary-sample.png` });
await p.getByText('友だちとカレーを作った', { exact: false }).first().click(); await p.waitForTimeout(500);
check('一覧を押すと、その日が開く', (await p.getByText('また作りたい', { exact: false }).count()) >= 2);
await p.getByLabel('前の月').first().click(); await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/diary-prev.png` });
await p.getByLabel('見本をとじる').first().click(); await p.waitForTimeout(400);
check('見本をとじる', (await p.getByText('日記（見本）').count()) === 0);
await p.getByText('← 水辺へ').first().click(); await p.waitForTimeout(1500);
check('水辺へ戻る', (await p.getByText('← 水辺へ').count()) === 0);
await open();
check('もう一度開く', (await p.getByText('← 水辺へ').count()) > 0);
check('エラーなし', errors.length === 0);
if (errors.length) console.log(errors.slice(0, 3));
await b.close();
process.exit(ok ? 0 : 1);
