import { chromium } from 'playwright';
import { mkdirSync, unlinkSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// 通常確認: iPhone SE のみ
// 最終確認: --all オプションで3サイズ
const allSizes = [
  { name: 'iphone-se',  width: 375, height: 667 },
  { name: 'iphone-14',  width: 390, height: 844 },
  { name: 'pixel-8',    width: 412, height: 915 },
];
const SIZES = process.argv.includes('--all') ? allSizes : [allSizes[0]];

const urlArg = process.argv.slice(2).find(a => !a.startsWith('--'));
const url = urlArg || 'http://localhost:8081';
// /tmp に保存してプロジェクトディレクトリを汚さない
const outDir = '/tmp/pukapuka-screenshots';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
});

const files = [];

for (const size of SIZES) {
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
  await page.addStyleTag({
    content: `@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300&display=swap');`
  });
  await page.evaluate(() => document.fonts.ready);
  const waitMs = process.argv.includes('--wait') ? 10000 : 0;
  if (waitMs) await page.waitForTimeout(waitMs);
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = join(outDir, `${ts}_${size.name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  files.push(file);
  await page.close();
}

await browser.close();

// ファイルパスを出力（Claude がこの出力を使って Read する）
console.log(JSON.stringify(files));
