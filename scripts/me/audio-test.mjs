// わたしのことに入ったとき、曲（bgm_me）に切りかわるかを web で確かめる（8091）。
// この環境の Chromium は AAC を鳴らせないので、m4a の代わりに同じ名前の wav を返す（/pukapuka-music の「Web での確かめ方」）
// 使い方: node scripts/me/audio-test.mjs <wav のフォルダ（bgm_*.wav）>
import { chromium } from 'playwright';
import fs from 'fs';
const dir = process.argv[2];
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.route(/\.m4a(\?|$)/, (r) => {
  const name = decodeURIComponent(r.request().url()).match(/(bgm_\w+|chime_\d)/)?.[1];
  const f = name && `${dir}/${name}.wav`;
  if (f && fs.existsSync(f)) r.fulfill({ body: fs.readFileSync(f), contentType: 'audio/wav' });
  else { console.log('見つからない音', r.request().url()); r.continue(); }
});
await p.addInitScript(() => {
  window.__els = [];
  const orig = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { if (!window.__els.includes(this)) window.__els.push(this); return orig.apply(this, arguments); };
});
const state = () => p.evaluate(() => window.__els.filter((e) => /bgm/.test(decodeURIComponent(e.currentSrc)) || e.currentSrc.startsWith('blob')).map((e) => `${(decodeURIComponent(e.currentSrc).match(/bgm_\w+/) || [e.currentSrc.slice(0, 30)])[0]} ${e.paused ? '止' : '鳴'} 音量${e.volume.toFixed(2)}`).join(' / '));
await p.goto('http://127.0.0.1:8091/', { waitUntil: 'networkidle', timeout: 90000 });
await p.mouse.click(200, 800); // 一度さわる（自動再生の制限をはずす）
await p.waitForTimeout(4000);
console.log('水辺:', await state());
await p.mouse.click(390 - 33, 67); await p.waitForTimeout(700);
await p.getByText('夜明け', { exact: true }).first().click();
for (const ms of [500, 1500, 3000]) { await p.waitForTimeout(ms); console.log(`わたしのこと +${ms}:`, await state()); }
await b.close();
