// 島の確かめを、ブラウザ1回の起動でまとめて行う（2026-10-07。時間を短くするため）。
// 前は shot.mjs・audit.mjs・closeup.mjs を別々に動かし、そのたびにブラウザ起動 → アプリ → 島、を一からやり直していた。
// 使い方: 確認用サーバー（8091）を起動したまま
//   node scripts/island/check.mjs <保存先> [stages] [close] [audit] [--dpr 2]
//   何も付けなければ stages と close。dpr は既定 1（確かめは 1 で十分。最後の1枚だけ 2）
// 決まった秒数は待たず、「描いた回数が増えた」「種が降り終わった」を待つ
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const out = args[0] ?? '.';
const dpr = args.includes('--dpr') ? Number(args[args.indexOf('--dpr') + 1]) : 1;
const want = new Set(args.slice(1).filter((a) => !a.startsWith('--') && !/^\d+$/.test(a)));
if (want.size === 0) ['stages', 'close'].forEach((w) => want.add(w));

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: dpr, hasTouch: true });
const logs = [];
p.on('pageerror', (e) => { if (!e.message.includes('play()')) logs.push(e.message); });
const t0 = Date.now();
await p.goto('http://localhost:8091/', { waitUntil: 'networkidle', timeout: 120000 });
await p.getByText('島（試作）').click();
await p.waitForFunction(() => (globalThis.__islandFrames ?? 0) > 0, null, { timeout: 60000 });
const opened = Date.now() - t0;

// 種が降りて育ち終わるまで待つ（全部の植物の大きさが変わらなくなるまで。最大 8 秒）
const settle = async () => {
  let prev = '';
  for (let i = 0; i < 16; i++) {
    await p.waitForTimeout(500);
    const s = await p.evaluate(() => JSON.stringify((globalThis.__island ?? []).map((q) => q.scale.toFixed(2))));
    if (s === prev) return;
    prev = s;
  }
};
// カメラが止まるまで待つ（動いている途中に触れると、植物の画面上の位置がずれて外れる）
const settleCam = async () => {
  let prev = -1;
  for (let i = 0; i < 20; i++) {
    await p.waitForTimeout(250);
    const d = await p.evaluate(() => globalThis.__islandRig.dist);
    if (Math.abs(d - prev) < 0.01) return;
    prev = d;
  }
};
const stage = async (label) => {
  await p.getByText(label, { exact: true }).click();
  await settle();
};

if (want.has('stages')) {
  for (const [label, name] of [['1回目', 'day1'], ['1か月', 'month'], ['数か月', 'months']]) {
    await stage(label);
    await p.screenshot({ path: `${out}/stage-${name}.png` });
  }
}
if (want.has('close')) {
  if (!want.has('stages')) await stage('数か月');
  // [名前, 見る点 x, z, 距離, 回りこみ, 見下ろす]（回りこみ 0.7＝開いたときの向き）
  for (const [name, x, z, dist, az, el] of [
    ['mouth', 16.0, 18.0, 14, 0.7, 0.55], // v10：橋から海への川 P(48, 24)
    ['lake', 8.6, -2.6, 14, 0.7, 0.5], // 右寄りの湖 P(343, 9)
    ['upper', -10.2, -2.9, 13, 2.2, 0.85], // 山のふもとの段の池と滝 P(196, 10.6)
  ]) {
    await p.evaluate(([x, z, dist, az, el]) => {
      const r = globalThis.__islandRigRef;
      const y = (globalThis.__islandGroundY?.(x, z) ?? 0) + 0.6; // v10：地面が高い（段）ので、見る点も地面の上に
      r.goalTarget.set(x, y, z);
      r.target.set(x, y, z);
      r.goalDist = r.dist = dist;
      r.az = az;
      r.el = el;
      r.invalidate?.();
    }, [x, z, dist, az, el]);
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${out}/close-${name}.png` });
  }
  // 近くから撮るために変えた向き（回りこみ・見下ろす角度）も、開いたときの向きに戻す（全体に戻す reset は向きを戻さない）
  await p.evaluate(() => { const r = globalThis.__islandRigRef; r.az = 0.7; r.el = 0.3; r.reset = true; r.invalidate?.(); });
  await settleCam();
}
if (want.has('audit')) {
  await stage('1か月');
  await settleCam();
  const plants = await p.evaluate(() => globalThis.__island ?? []);
  const t = plants.filter((q) => q.x > 40 && q.x < 350 && q.y > 120 && q.y < 680).sort((a, c) => c.scale - a.scale)[0];
  if (t) await p.mouse.click(t.x, t.y);
  // 1回触れたあと、2回目の触れ（全体に戻る）を待つ仕組みがあるので、言葉が出るまで少し遅れる
  await p.waitForFunction((w) => document.body.innerText.includes(w), t?.word ?? '', { timeout: 3000 }).catch(() => {});
  const label = await p.evaluate(() => document.body.innerText);
  const r0 = await p.evaluate(() => globalThis.__islandRig.dist);
  await p.mouse.click(100, 650); // 植物のない草地（v8 の島。260,420 は植物の 44px 以内で、歩かずに植物を選んだ）
  await p.waitForTimeout(400);
  await settleCam();
  const r1 = await p.evaluate(() => globalThis.__islandRig.dist);
  const f0 = await p.evaluate(() => globalThis.__islandFrames);
  await p.waitForTimeout(2000);
  const f1 = await p.evaluate(() => globalThis.__islandFrames);
  console.log(`触れた植物: ${t?.word ?? 'なし'}（言葉が出た: ${t && label.includes(t.word) ? 'はい' : 'いいえ'}）`);
  console.log(`歩く: 距離 ${r0.toFixed(1)} → ${r1.toFixed(1)}（約半分がよい）`);
  console.log(`触っていない2秒に描いた回数: ${f1 - f0}（30 前後がよい。水が流れる分）`);
}
console.log(`島を押してから最初に描くまで ${opened}ms ／ 全体 ${((Date.now() - t0) / 1000).toFixed(0)}秒 ／ エラー: ${logs.join(' / ') || 'なし'}`);
await b.close();
