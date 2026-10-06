// 島の画面を、操作しながら撮る（UI の問題を洗い出すため）。
// 使い方: 確認用サーバー（8091）を起動してから
//   node scripts/island/audit.mjs <保存先フォルダ> [幅] [高さ]
// 撮るもの: 最初の画面 → 植物に触れる（言葉が出る）→ 1本指で回す → 地面に触れて歩く → 2回触れて戻る → 1回目の島
import { chromium } from 'playwright';

const [out = '.', W = '375', H = '667'] = process.argv.slice(2);
const w = Number(W);
const h = Number(H);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true });
const logs = [];
p.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') logs.push('error: ' + m.text()); });
await p.goto('http://localhost:8091/', { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForTimeout(1500);
await p.getByText('島（試作）').click();
await p.getByText('1か月', { exact: true }).click();
await p.waitForTimeout(4500);
const shot = (name) => p.screenshot({ path: `${out}/audit-${w}-${name}.png` });
await shot('1-start');

// 植物に触れる：画面の中ほどにある、いちばん大きい植物
const plants = await p.evaluate(() => globalThis.__island ?? []);
const target = plants
  .filter((q) => q.x > 40 && q.x < w - 40 && q.y > 120 && q.y < h - 160)
  .sort((a, c) => c.scale - a.scale)[0];
if (target) {
  await p.mouse.click(target.x, target.y);
  await p.waitForTimeout(800);
  await shot('2-tap-plant');
  console.log('触れた植物:', target.word);
} else console.log('触れられる植物が見つからない');

// 1本指で回す（右から左へなぞる）
await p.mouse.move(w * 0.8, h * 0.5);
await p.mouse.down();
for (let i = 1; i <= 10; i++) await p.mouse.move(w * (0.8 - 0.05 * i), h * 0.5, { steps: 2 });
await p.mouse.up();
await p.waitForTimeout(800);
await shot('3-rotate');

// 地面に触れて歩く：植物から 70px 以上はなれた所を、画面の下半分から探す
const now = await p.evaluate(() => globalThis.__island ?? []);
let spot = null;
for (let y = h * 0.52; y < h * 0.78 && !spot; y += 12)
  for (let x = w * 0.2; x < w * 0.8 && !spot; x += 12)
    if (now.every((q) => Math.hypot(q.x - x, q.y - y) > 70)) spot = { x, y };
const before = await p.evaluate(() => globalThis.__islandRig);
if (spot) {
  await p.mouse.click(spot.x, spot.y);
  await p.waitForTimeout(2500);
}
const after = await p.evaluate(() => globalThis.__islandRig);
console.log('歩く:', spot ? `(${spot.x | 0}, ${spot.y | 0}) に触れた` : '空いた地面が見つからない', '距離', before?.dist?.toFixed(1), '→', after?.dist?.toFixed(1));
await shot('4-walk');

// 2回触れて全体に戻る
await p.mouse.dblclick(w * 0.5, h * 0.3);
await p.waitForTimeout(1500);
await shot('5-reset');

// 何も動いていないときに描き続けていないか（2秒待って描いた回数が増えないこと）
const f0 = await p.evaluate(() => globalThis.__islandFrames);
await p.waitForTimeout(2000);
const f1 = await p.evaluate(() => globalThis.__islandFrames);
console.log('止まっているときに描いた回数（0 がよい）:', f1 - f0);

await p.getByText('1回目', { exact: true }).click();
await p.waitForTimeout(4500);
await shot('6-day1');

console.log(logs.filter((l) => !l.includes('play()')).join('\n') || 'エラーなし');
await b.close();
