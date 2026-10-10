// README に載せる画面の絵を、開発中のアプリ（web・ダミーの人 ?demo=1）から撮る。
// 使い方: 8091 で web を立ててから（npx expo start --web --port 8091）
//   node docs/screens/render.mjs [URL=http://127.0.0.1:8091/?demo=1]
//   → docs/screens/1_river.png … 5_diary.png（390×844 の2倍）
// 画面を変えたら、これを動かして撮り直す。ダミーの記録が古いときは npx convex run demo:seedDemo '{}'
import { chromium } from 'playwright';
import path from 'path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const url = process.argv[2] ?? 'http://127.0.0.1:8091/?demo=1';
const W = 390, H = 844;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const shot = (name) => p.screenshot({ path: path.join(dir, `${name}.png`) });
const moon = async (dest) => {
  await p.mouse.click(W - 33, 67); await p.waitForTimeout(700);
  await p.getByText(dest, { exact: true }).first().click();
};
const home = async () => { await p.goto(url, { waitUntil: 'networkidle', timeout: 120000 }); await p.waitForTimeout(6000); };

// 1 水辺：泡が流れているところ
await home();
await shot('1_river');
// 2 夕空：言葉が出そろうまで待つ
await moon('夕空'); await p.waitForTimeout(6000);
await shot('2_words');
// 3 星空
await home();
await moon('星空'); await p.waitForTimeout(6000);
await shot('3_sky');
// 4 夜明け：計算が終わるまで待つ
await home();
await moon('夜明け');
await p.waitForFunction(() => /のあとに|見えてきます|見えていません/.test(document.body.innerText), null, { timeout: 120000 }).catch(() => {});
await p.waitForTimeout(2000);
await shot('4_me');
// 5 日記：見本（ダミーの人は保存しないので、見本の日記で見せる）
await home();
await moon('日記'); await p.waitForTimeout(1500);
await p.getByLabel('日記の使い方').first().click(); await p.waitForTimeout(500);
await p.getByText('見本を見る').last().click(); await p.waitForTimeout(800);
await shot('5_diary');
console.log('wrote 5 images');
await b.close();
