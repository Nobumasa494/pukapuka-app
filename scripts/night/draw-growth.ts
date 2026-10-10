/// <reference types="node" />
// 使い始めの星空が、日がたつとどう育つかを絵（PNG）にする。ダミーの人の記録を、最初の N 日だけ使う
// 使い方: npx tsx scripts/night/draw-growth.ts <出力PNG> [日数…]   例: npx tsx scripts/night/draw-growth.ts /tmp/g.png 4 10 20
// 実線＝星座の骨組み、点線（青っぽい）＝別の星座どうし、細かい点線＝まだ確かめている途中の線（濃い＝偶然の確率5%未満）
import { chromium } from "playwright";
import { makeDemoCaptures, type DemoDay } from "../../src/demoPersona";
import { selectConstellation, skeleton, layoutSky } from "../../src/constellation";

const out = process.argv[2];
if (!out) throw new Error("出力PNGを指定してください");
const spans = process.argv.slice(3).map(Number).filter((n) => n > 0);
const W = 390, H = 714;

function panel(n: number): string {
  const days: DemoDay[] = [];
  const start = new Date(2026, 8, 1);
  for (let d = 0; d < n; d++) {
    const x = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
    days.push({ start: x.getTime(), dow: x.getDay() });
  }
  const all = makeDemoCaptures(days, 5);
  const picked = selectConstellation(all);
  const sky = layoutSky(picked.stats, picked.lines, { x: 20, y: 40, w: W - 40, h: H - 80 }, undefined, picked.tentative);
  const at = new Map(sky.stars.map((s) => [s.word, s]));
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#0b1630"/>`;
  for (const l of picked.tentative) {
    const a = at.get(l.a)!, b = at.get(l.b)!;
    svg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#ffd78c" stroke-width="0.9" stroke-opacity="${l.p < 0.05 ? 0.42 : 0.24}" stroke-dasharray="1 5" stroke-linecap="round"/>`;
  }
  for (const l of [...skeleton(picked.lines), ...picked.lines.filter((l) => l.cross)]) {
    const a = at.get(l.a)!, b = at.get(l.b)!;
    svg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#ffd78c" stroke-width="${l.cross ? 1.2 : 1.6}" stroke-opacity="${l.cross ? 0.45 : 0.8}" ${l.cross ? 'stroke-dasharray="3 4"' : ""}/>`;
  }
  for (const s of sky.stars) {
    svg += `<circle cx="${s.x}" cy="${s.y}" r="${s.r}" fill="#fff6dc"/><text x="${s.x}" y="${s.y + s.r + s.labelSize}" fill="#e8e2d0" font-size="${s.labelSize}" text-anchor="middle" font-family="Noto Sans CJK JP">${s.word}</text>`;
  }
  svg += "</svg>";
  const solid = picked.lines.filter((l) => !l.cross).length;
  return `<div><div style="font:16px 'Noto Sans CJK JP';margin:0 0 6px">${n}日目（星座の線 ${solid}本・途中の線 ${picked.tentative.length}本）</div>${svg}</div>`;
}

async function main() {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: (W + 20) * spans.length + 20, height: H + 60 } });
  await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;padding:10px;display:flex;gap:20px;background:#f4f1ec">${spans.map(panel).join("")}</body>`);
  await page.screenshot({ path: out });
  await browser.close();
}
main();
