import { chromium } from 'playwright';
import fs from 'fs';
const S = process.argv[2];
const d = JSON.parse(fs.readFileSync(S + '/mock12.json', 'utf8'));
const W = d.week, n = W.length, gx = (i) => 14 + (i * 290) / (n - 1), gy = (r) => 110 - r * 180;
const avg = W.map((_, i) => { const s = W.slice(Math.max(0, i - 2), i + 1); return s.reduce((a, w) => a + w.ratio * w.total, 0) / s.reduce((a, w) => a + w.total, 0); });
const smooth = avg.map((r, i) => (i < 2 ? '' : `${gx(i)},${gy(r)}`)).filter(Boolean).join(' ');
const sureLabel = d.stages.find((s) => s.stage === 'sure')?.label;
let markI = W.findIndex((w) => w.label === sureLabel); if (markI < 2) markI = 7;
const stTxt = { sure: 'よく来る', tentative: '来ているかも', seen: '見えはじめ' };
const listHtml = ['sure', 'tentative', 'seen'].map((st) => { const xs = d.list.filter((x) => x.stage === st); return xs.length ? `<div class="lv">${stTxt[st]}</div>` + xs.map((x) => `<div class="li ${st}">${x.word} → ${x.to}</div>`).join('') : ''; }).join('');
const loopHtml = d.loops.length ? d.loops.map((x) => `<div class="li ${x.stage}">「${x.a}」と「${x.b}」は、お互いのあとに${x.stage === 'sure' ? 'よく来ます' : '来ているかも'}</div>`).join('') : '<p class="note">まだ、くり返すめぐりは見えていません</p>';
const storyHtml = d.story.map((e) => `<div class="ev"><span>${e.label}</span>「${e.word}」のあとに「${e.to}」が${e.stage === 'sure' ? 'よく来るように <b>◎</b>' : '来ているかも'}</div>`).join('');
const shiftHtml = d.shift ? `<div class="shift"><div><small>はじめのころ</small><br>${d.shift.before.join('・')}</div><div class="arr">→</div><div><small>最近</small><br><b>${d.shift.after.join('・')}</b></div></div>` : '';
const N = d.numbers, pct = Math.round((N.nextGenki / N.srcDays) * 100), base = Math.round(N.baseRate * 100);
const graph = `<svg viewBox="0 0 320 140" class="g">
 <line x1="14" y1="110" x2="304" y2="110" class="ax"/><line x1="14" y1="65" x2="304" y2="65" class="grid"/><text x="0" y="68" class="t">25%</text><text x="4" y="113" class="t">0</text>
 ${W.map((w, i) => `<circle cx="${gx(i)}" cy="${gy(w.ratio)}" r="${w.total < 15 ? 1.4 : 2.4}" class="dot"/>`).join('')}
 <polyline points="${smooth}" class="smooth"/>
 <circle cx="${gx(markI)}" cy="${gy(avg[markI])}" r="5" class="mark"/><text x="${gx(markI) - 34}" y="${gy(avg[markI]) + 20}" class="mt">★ 散歩が加わった</text>
 <text x="14" y="132" class="t">${W[0].label}</text><text x="${gx(n - 1) - 26}" y="132" class="t">${W[n - 1].label}</text>
</svg>`;
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#eef0f5;font-family:'Noto Sans JP',sans-serif;display:flex;gap:30px;padding:24px;align-items:flex-start}
.phone{width:320px;border-radius:36px;padding:10px;background:#222}
.screen{position:relative;border-radius:28px;overflow:hidden;color:#3a3450;padding-bottom:30px;
 background:linear-gradient(180deg,#8fa3cf 0%,#c4bfdc 18%,#efc9cf 40%,#fadcc0 65%,#fdeccd 100%)}
.top{height:600px;position:relative}
.back{position:absolute;top:44px;left:16px;font-size:13px;color:#4a4566}.title{position:absolute;top:42px;width:100%;text-align:center;font-size:16px;letter-spacing:.1em}
.hero{position:absolute;top:200px;left:22px;right:22px;text-align:center}.hero p{font-size:24px;line-height:1.6;margin:0;color:#2f2a48}
.hsub{margin-top:14px;font-size:13px;color:#5d5674}
.more{position:absolute;bottom:24px;width:100%;text-align:center;font-size:12px;color:#6a6383}
.fold{border-top:2px dashed rgba(60,50,90,.35);margin:0 10px;position:relative}.fold span{position:absolute;right:0;top:-18px;font-size:10px;color:#6a6383}
.sec{background:rgba(255,255,255,.45);border-radius:14px;padding:10px 12px;margin:12px 14px 0}
h4{margin:0 0 4px;font-size:12px;color:#6a6383;font-weight:500}.faint{color:rgba(47,42,72,.5);font-size:15px;line-height:1.5;margin:4px 0}
.chip{display:inline-block;font-size:10px;padding:1px 8px;border-radius:999px;border:1px dashed rgba(47,42,72,.4);color:rgba(47,42,72,.6);margin-left:6px}
.big3{font-size:14px;margin:2px 0 4px}.note{font-size:10.5px;color:#6a6383;margin:2px 0}
.g{width:100%}.ax{stroke:#8a83a3;stroke-width:.8}.grid{stroke:#bdb6cf;stroke-width:.6;stroke-dasharray:3 3}.t{font-size:9px;fill:#6a6383}
.dot{fill:#c99ab0}.smooth{fill:none;stroke:#8f5f8a;stroke-width:2.2}.mark{fill:#f3c46b;stroke:#8f5f8a}.mt{font-size:10px;fill:#8f5f8a}
.cmp{display:grid;grid-template-columns:5.5em 1fr 2.6em;gap:6px;align-items:center;font-size:12px;margin-top:4px}.bar{height:9px;border-radius:5px;background:#c99ab0}.bar.b{background:#cfc8dc}
.lv{font-size:10.5px;color:#6a6383;margin:6px 0 2px}.li{font-size:14px;margin:2px 0 2px 8px}.li.sure{color:#2f2a48}.li.tentative{color:rgba(47,42,72,.6)}.li.seen{color:rgba(47,42,72,.38);font-size:13px}
.sub2{font-size:11px;color:#8f5f8a;margin:10px 0 4px;border-bottom:1px dashed #d9c8d8}.ev{font-size:12px;margin:3px 0}.ev span{display:inline-block;width:5.2em;color:#6a6383;font-size:11px}.ev b{color:#c9a03a}
.shift{display:flex;align-items:center;gap:10px;font-size:14px;text-align:center}.shift small{font-size:10px;color:#6a6383}.arr{font-size:18px;color:#8f5f8a}
.n{position:absolute;width:22px;height:22px;border-radius:50%;background:#e2574c;color:#fff;font-size:13px;display:flex;align-items:center;justify-content:center;font-weight:700;box-shadow:0 0 0 2px #fff}
.legend{width:430px;font-size:15px;line-height:1.7;color:#222}.legend h2{font-size:18px;margin:0 0 8px}.legend li{margin-bottom:12px}.legend b{color:#e2574c}
</style>
<div class="phone"><div class="screen">
 <div class="top">
  <div class="back">← 水辺へ</div><div class="title">わたしのこと</div>
  <div class="n" style="left:10px;top:200px">1</div>
  <div class="hero"><p>「散歩」のあとに、<br>元気な言葉が<br>よく来ます</p><div class="hsub">次の日に「わくわく」が来ることが多い</div></div>
  <div class="more">▼ ほかのこと</div>
 </div>
 <div class="fold"><span>ここから下はスクロール</span></div>
 <div class="sec" style="position:relative"><div class="n" style="left:-8px;top:-8px">2</div><h4>「散歩」の日と、ふだんの日</h4>
  <div class="cmp"><span>散歩の次の日</span><div class="bar" style="width:${pct}%"></div><span>${pct}%</span>
   <span>ふだんの次の日</span><div class="bar b" style="width:${base}%"></div><span>${base}%</span></div>
  <p class="note">元気・好奇心の言葉を拾った日の割合（この3か月。散歩は${N.srcDays}日のうち${N.nextGenki}日）</p></div>
 <div class="sec" style="position:relative"><div class="n" style="left:-8px;top:-8px">3</div><h4>元気・好奇心が来やすいこと</h4>${listHtml}</div>
 <div class="sec" style="position:relative"><div class="n" style="left:-8px;top:-8px">4</div><h4>くり返すめぐり</h4>${loopHtml}</div>
 <div class="sec" style="position:relative"><div class="n" style="left:-8px;top:-8px">5</div><h4>育っていること</h4>
  <div class="sub2">見つかってきたこと</div>${storyHtml}
  <div class="sub2">元気の中身</div>${shiftHtml}
  <div class="sub2">元気・好奇心の言葉の割合（週ごと）</div>${graph}</div>
</div></div>
<div class="legend"><h2>わたしのこと（見本の人・12週目）</h2>
<p style="margin-top:0">だんだん好奇心が育っていくように作った見本の人です。</p><ol style="padding-left:0;list-style:none">
<li><b>1</b>　<b>開いたときの文</b>。いちばん確かな（または新しく確かになった）1つ</li>
<li><b>2</b>　<b>1のもとの数字</b>。散歩の次の日と、ふだんの次の日の比べ</li>
<li><b>3</b>　<b>いろいろな源</b>。濃い字＝よく来る、うすい字＝かも、もっとうすい字＝見えはじめ。日がたつと下から上へ上がっていく</li>
<li><b>4</b>　<b>くり返すめぐり</b>。「かも」以上だけ</li>
<li><b>5</b>　<b>育っていること</b>。見つかってきたことの歩み（A）と、元気の中身の変わり方（B）。いちばん下に、前からの割合のグラフ（小さく）</li>
</ol></div>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 860, height: 800 }, deviceScaleFactor: 1.5 });
await p.setContent(html); await p.waitForTimeout(300);
await p.screenshot({ path: S + '/me-mock2.png', fullPage: true });
await b.close();
