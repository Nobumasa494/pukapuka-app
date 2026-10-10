// 日記の日付まわり（カレンダー）。RN にも Convex にも依存しない。日の鍵は src/period.ts の dayKey（"2026-10-11"）
import { dayKey } from './period';

export const DOW = ['日', '月', '火', '水', '木', '金', '土'];

export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// 「10/11（日）」
export function dayLabel(day: string): string {
  const d = parseDay(day);
  return `${d.getMonth() + 1}/${d.getDate()}（${DOW[d.getDay()]}）`;
}

// その月のカレンダーのマス（日曜はじまり）。前後の月の分は null
export function monthCells(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1).getDay();
  const n = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(first).fill(null);
  for (let d = 1; d <= n; d++) cells.push(dayKey(new Date(year, month, d).getTime()));
  while (cells.length % 7) cells.push(null);
  return cells;
}
