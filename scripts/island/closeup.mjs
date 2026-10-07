// 島の水まわりを近くで撮る（小川が浮いていないか・河口が自然か）。確認用サーバー（8091）を起動してから
//   node scripts/island/closeup.mjs <保存先フォルダ>
// 開発中だけ出している globalThis.__islandRigRef（カメラ）を書き換えて、決めた向きから撮る
import { chromium } from 'playwright';

const out = process.argv[2] ?? '.';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await p.goto('http://localhost:8091/', { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForTimeout(2500);
await p.getByText('島（試作）').click();
await p.getByText('数か月', { exact: true }).click();
await p.waitForTimeout(6000);
// [名前, 見る点 x, z, 距離, 回りこみ, 見下ろす]
// 回りこみ az：カメラは見る点から (sin az, cos az) の向きにいる。0.7 は開いたときの向き（手前 50°）
const views = [
  ['mouth', 16.0, 9.6, 11, 3.84, 0.5],  // 池から海へ出る川（河口）を、島の内側から海の方へ見る
  ['mouth2', 15.0, 9.0, 14, 0.7, 0.55], // 河口を、開いたときの向きから
  ['stream', 2.5, 1.5, 8, 0.7, 0.32],   // 木のそばの小川と淵
  ['upper', -5.5, -4.5, 9, 1.4, 0.4],   // 上流の小川
];
for (const [name, x, z, dist, az, el] of views) {
  await p.evaluate(([x, z, dist, az, el]) => {
    const r = globalThis.__islandRigRef;
    r.goalTarget.set(x, 0.6, z);
    r.target.set(x, 0.6, z);
    r.goalDist = r.dist = dist;
    r.az = az;
    r.el = el;
    r.invalidate?.();
  }, [x, z, dist, az, el]);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/close-${name}.png` });
}
await b.close();
