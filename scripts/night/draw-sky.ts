/// <reference types="node" />
// 見本の夜空の配置を、絵（PNG）にして見る。スマホを開かずに、星座の置き方・大きさを確かめるため
// 使い方: npx tsx scripts/night/draw-sky.ts <出力フォルダ> [記録の倍数…]   例: npx tsx scripts/night/draw-sky.ts /tmp/out 1 4
// 1＝「見本を見る」、4＝記録4倍（星が多い人。動かせる夜空の見え方）。点線の四角＝スマホ1画面（390×714）、赤い丸＝開いたときの画面の真ん中
import { chromium } from "playwright";
import { makeDemoCaptures, type DemoDay } from "../../src/demoPersona";
import {
  selectConstellation,
  layoutSky,
  WIDE_CAPS,
} from "../../src/constellation";

const out = process.argv[2];
if (!out) throw new Error("出力フォルダを指定してください");
const multiples = process.argv
  .slice(3)
  .map(Number)
  .filter((n) => n > 0);
const W = 390,
  H = 844,
  WINDOW_BOTTOM = 130;

const days: DemoDay[] = [];
const today = new Date();
today.setHours(0, 0, 0, 0);
for (let d = 41; d >= 0; d--) {
  const x = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - d,
  );
  days.push({ start: x.getTime(), dow: x.getDay() });
}

async function main() {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();
  for (const k of multiples.length ? multiples : [1, 4]) {
    const all = Array.from({ length: k }, (_, i) =>
      makeDemoCaptures(days, 5 + 6 * i, Date.now()),
    ).flat();
    const picked = selectConstellation(all, undefined, WIDE_CAPS);
    const sky = layoutSky(picked.stats, picked.lines, {
      x: 20,
      y: 100,
      w: W - 40,
      h: H - 250,
    });
    const at = new Map(sky.stars.map((s) => [s.word, s]));
    const w = Math.max(W, sky.extentW),
      h = Math.max(H - WINDOW_BOTTOM, sky.extentH);
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#071324"/>`;
    svg += `<rect x="0" y="0" width="${W}" height="${H - WINDOW_BOTTOM}" fill="none" stroke="#58a" stroke-dasharray="6 6"/>`;
    for (const l of picked.lines.filter((l) => !l.cross)) {
      const a = at.get(l.a)!,
        b = at.get(l.b)!;
      svg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#ffd78c" stroke-opacity=".6"/>`;
    }
    for (const s of sky.stars) {
      svg += `<circle cx="${s.x}" cy="${s.y}" r="${s.r}" fill="#fffae6"/>`;
      svg += `<text x="${s.x}" y="${s.y + s.r + s.labelSize + 2}" font-size="${s.labelSize}" fill="#fff6e8" text-anchor="middle" font-family="Noto Sans CJK JP, sans-serif">${s.word}</text>`;
    }
    // 開いたときの真ん中（layoutSky が home を返すときだけ）
    const home = (sky as { home?: { x: number; y: number } }).home;
    if (home) svg += `<circle cx="${home.x}" cy="${home.y}" r="6" fill="none" stroke="#f66"/>`;
    svg += "</svg>";
    await page.setContent(`<body style="margin:0">${svg}</body>`);
    await page.screenshot({ path: `${out}/sky${k}.png`, fullPage: true });
    console.log(
      `sky${k}.png  星${sky.stars.length} 線${picked.lines.length}  ${Math.round(w)}×${Math.round(h)}`,
    );
  }
  await browser.close();
}
main();
