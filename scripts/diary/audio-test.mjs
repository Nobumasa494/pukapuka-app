// 日記を開くと曲が消え、水辺に戻ると水辺の曲に戻るかを web で確かめる（8091）。
// この環境の Chromium は AAC を鳴らせないので、m4a の代わりに同じ名前の wav を返す（/pukapuka-music の「Web での確かめ方」）
// 使い方: node scripts/diary/audio-test.mjs <wav のフォルダ（bgm_*.wav）>
import { chromium } from 'playwright';
import fs from 'fs';
const dir = process.argv[2];
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.route(/\.m4a(\?|$)/, (r) => {
  const name = decodeURIComponent(r.request().url()).match(/(bgm_\w+|chime_\d)/)?.[1];
  const f = name && `${dir}/${name}.wav`;
  if (f && fs.existsSync(f)) r.fulfill({ body: fs.readFileSync(f), contentType: 'audio/wav' });
  else r.continue();
});
await p.addInitScript(() => {
  window.__els = [];
  const orig = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { if (!window.__els.includes(this)) window.__els.push(this); return orig.apply(this, arguments); };
});
// 鳴っている曲（止まっていず、音量が 0.05 より大きいもの）
const playing = () => p.evaluate(() => window.__els.filter((e) => /bgm/.test(decodeURIComponent(e.currentSrc)) && !e.paused && e.volume > 0.05).map((e) => decodeURIComponent(e.currentSrc).match(/bgm_\w+/)[0]));
await p.goto('http://127.0.0.1:8091/', { waitUntil: 'networkidle', timeout: 90000 });
await p.mouse.click(200, 800); // 一度さわる（自動再生の制限をはずす）
await p.waitForTimeout(4000);
let ok = true;
const check = (name, v, extra) => { console.log(v ? '✅' : '❌', name, extra ?? ''); if (!v) ok = false; };
const a = await playing();
check('水辺で水辺の曲', a.length === 1 && a[0] === 'bgm_river', a.join(','));
await p.mouse.click(390 - 33, 67); await p.waitForTimeout(700);
await p.getByText('日記', { exact: true }).first().click(); await p.waitForTimeout(1500);
const d = await playing();
check('日記では曲なし', d.length === 0, d.join(','));
await p.getByText('← 水辺へ').first().click(); await p.waitForTimeout(1500);
const r = await playing();
check('戻ると水辺の曲', r.length === 1 && r[0] === 'bgm_river', r.join(','));
await b.close();
process.exit(ok ? 0 : 1);
