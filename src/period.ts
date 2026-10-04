// 期間フィルター（拾ったことば・ふりかえりで共通）。区切りは端末の暦（週は月曜はじまり）

export type Period = 'week' | 'month' | 'year' | 'all';

export const PERIODS: { key: Period; label: string }[] = [
  { key: 'week', label: '今週' },
  { key: 'month', label: '今月' },
  { key: 'year', label: '今年' },
  { key: 'all', label: 'すべて' },
];

export function periodStart(period: Period, now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (period === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  else if (period === 'month') d.setDate(1);
  else if (period === 'year') d.setMonth(0, 1);
  else return -Infinity;
  return d.getTime();
}

export function filterByPeriod<T extends { capturedAt: number }>(captures: T[], period: Period, now: number): T[] {
  const start = periodStart(period, now);
  return captures.filter((c) => c.capturedAt >= start && c.capturedAt <= now);
}

// 同じ日（端末の暦の日付）かどうかを見るための鍵
export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
