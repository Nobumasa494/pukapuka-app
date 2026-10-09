/// <reference types="node" />
// アプリの fdrLinks と、教科書どおりの別の計算（fdr_check.py）を比べるための、記録を書き出す
// 使い方: npx tsx scripts/night/crosscheck/export.ts <フォルダ（caps.jsonl を置く。npx convex data captures --format jsonl）> → python3 scripts/night/crosscheck/fdr_check.py <フォルダ>/fdr_cases.json
import { writeFileSync, readFileSync } from 'fs';
import { makeDemoCaptures, type DemoDay } from '../../../src/demoPersona';
import { fdrLinks } from '../../../src/communities';
const days: DemoDay[] = []; const t = new Date(2026, 9, 9);
for (let d = 41; d >= 0; d--) { const x = new Date(t.getFullYear(), t.getMonth(), t.getDate() - d); days.push({ start: x.getTime(), dow: x.getDay() }); }
const cases: Record<string, any[]> = {};
for (const s of [2000, 2001, 2002, 2003, 463]) cases[`demo${s}`] = makeDemoCaptures(days, s);
const rows = readFileSync(process.argv[2] + '/caps.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
cases.real4days = rows.filter((r: any) => r.deviceId === 'sqlt49mapoho8bx5wbbv1z2aqknb7rsw');
// 少ない日数のダミー（2週間）
const d14 = days.slice(-14); cases.demo14days = makeDemoCaptures(d14, 2000);
const out: any = {};
for (const [k, c] of Object.entries(cases)) out[k] = { caps: c.map((x: any) => ({ w: x.word, t: x.capturedAt })), app: Object.fromEntries([0.1, 0.2, 0.3].map((q) => [q, fdrLinks(c, q).map((l) => [l.a, l.b].sort().join('|')).sort()])) };
writeFileSync(process.argv[2] + '/fdr_cases.json', JSON.stringify(out));
