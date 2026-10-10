// 水辺の月と星が、何度でも押せるか（わたしのこと・星空・夕空へ行って戻ったあとも）。web（8091・?demo=1）で確かめる
// 使い方: node scripts/me/moon-test.mjs [URL=http://127.0.0.1:8091/?demo=1]
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://127.0.0.1:8091/?demo=1';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
await p.waitForTimeout(5000);
const X = 1280 - 33, Y = 67;
const menu = async () => (await p.getByText('夜明け', { exact: true }).count()) > 0;
const open = async () => { await p.mouse.click(X, Y); await p.waitForTimeout(700); return menu(); };
let ok = true;
const check = (name, v) => { console.log(v ? '✅' : '❌', name); if (!v) ok = false; };
check('1回目に開く', await open());
await p.mouse.click(X, Y); await p.waitForTimeout(700);
check('もう一度押すと閉じる', !(await menu()));
check('3回目に開く', await open());
// 星空の右上（月と星と同じ場所）の「星の見方」が、見えない月と星にふさがれていないか
if (!(await menu())) await open();
await p.getByText('星空', { exact: true }).first().click();
await p.waitForTimeout(2500);
const before = await p.evaluate(() => document.body.innerText.length);
await p.mouse.click(X, Y); await p.waitForTimeout(800);
const after = await p.evaluate(() => document.body.innerText.length);
check('星空の右上が押せる（星の見方が開く）', after > before);
await p.mouse.click(X, Y); await p.waitForTimeout(800);
const t = p.getByText('水辺へ戻る'); if (await t.count()) await t.first().click({ force: true });
await p.waitForTimeout(4000);
check('星空から戻ったあと開く', await open());
for (const [dest, back, wait] of [['夜明け', '← 水辺へ', 2500], ['星空', null, 2500], ['夕空', '← 水辺へ', 4500], ['夜明け', '← 水辺へ', 2500]]) {
  if (!(await menu())) await open();
  await p.getByText(dest, { exact: true }).first().click();
  await p.waitForTimeout(wait);
  if (back) await p.getByText(back).first().click();
  else await p.getByText('水辺へ戻る').first().click({ force: true });
  await p.waitForTimeout(dest === '夕空' ? 5000 : 4000);
  check(`${dest}から戻ったあと開く`, await open());
}
await b.close();
process.exit(ok ? 0 : 1);
