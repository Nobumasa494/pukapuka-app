// 水の流れを短い動画で撮る（2026-10-07。静止画では流れの自然さが分からないため）。
// 使い方: 確認用サーバー（8091）を起動したまま node scripts/island/flowvideo.mjs <保存先フォルダ> [秒]
// 近くの数か所（[名前, x, z, 距離, 回りこみ, 見下ろす]）を順に、それぞれ数秒ずつ撮って1本の webm にする
import { chromium } from 'playwright';

const out = process.argv[2] ?? '.';
const secs = Number(process.argv[3] ?? 4);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, recordVideo: { dir: out, size: { width: 390, height: 844 } } });
const p = await ctx.newPage();
await p.goto('http://localhost:8091/', { waitUntil: 'networkidle', timeout: 120000 });
await p.getByText('島（試作）').click();
await p.waitForFunction(() => (globalThis.__islandFrames ?? 0) > 0, null, { timeout: 60000 });
await p.getByText('数か月', { exact: true }).click();
await p.waitForTimeout(3000);
for (const [, x, z, dist, az, el] of [
  ['open', 0, 0, 46, 0.7, 0.3], // 開いたとき
  ['falls', -10.2, -2.9, 13, 2.2, 0.85], // 段の池と滝
  ['lake', 8.6, -2.6, 12, 0.7, 0.5], // 湖
  ['mouth', 16.0, 18.0, 12, 0.7, 0.5], // 橋から海へ
  ['open', 0, 0, 42, 0.7, 0.3], // 開いたとき
]) {
  await p.evaluate(([x, z, dist, az, el]) => {
    const r = globalThis.__islandRigRef;
    const y = (globalThis.__islandGroundY?.(x, z) ?? 0) + 0.6;
    r.goalTarget.set(x, y, z);
    r.target.set(x, y, z);
    r.goalDist = r.dist = dist;
    r.az = az;
    r.el = el;
    r.invalidate?.();
  }, [x, z, dist, az, el]);
  await p.waitForTimeout(secs * 1000);
}
const v = p.video();
await ctx.close();
console.log(await v.path());
await b.close();
