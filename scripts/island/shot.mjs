// 島の試作を Web で4つの時期ごとに撮る。
// 使い方: 先に確認用サーバーを起動（npx expo start --web --port 8091。CI=1 は付けない）
//   node scripts/island/shot.mjs <保存先フォルダ>
// 起動するとアプリは必ず川に戻るので、川の画面の「島（試作）」を押して入る。
// 3D を撮るため、Chromium をソフトウェアの WebGL（swiftshader）で起動する
import { chromium } from 'playwright';

const out = process.argv[2] ?? '.';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const logs = [];
p.on('console', (m) => { if (m.type() === 'error') logs.push('error: ' + m.text()); });
p.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
await p.goto('http://localhost:8091/', { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForTimeout(2000);
await p.getByText('島（試作）').click();
for (const [label, name] of [['1回目', 'day1'], ['1週間', 'week'], ['1か月', 'month'], ['数か月', 'months']]) {
  await p.getByText(label, { exact: true }).click();
  // 種が降りて芽が出るまで（最大 約3.8秒）待つ
  await p.waitForTimeout(4500);
  await p.screenshot({ path: `${out}/island-${name}.png` });
}
console.log(logs.join('\n') || 'エラーなし');
await b.close();
