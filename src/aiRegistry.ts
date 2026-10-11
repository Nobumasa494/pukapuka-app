// AI が作った細かい言葉の一覧（画面や通信に依存しない。分析の計算・node の試算からも読める）
import { WORD_CATEGORY, type Category } from './words';

export type AiWord = { text: string; category: string; parent: string; kind: 'near' | 'abstract' };

const registry = new Map<string, AiWord>();
export function setAiRegistry(list: AiWord[]) {
  registry.clear();
  for (const w of list) registry.set(w.text, w);
}

// 言葉の種類（決まった言葉も AI の言葉も）
export const categoryOf = (word: string): Category | undefined => WORD_CATEGORY[word] ?? (registry.get(word)?.category as Category | undefined);

// 自分の言葉で出る（SPEC 第2部 A.。案 2026-10-11）：読んだ期間のうち、この日数以上拾った AI の言葉は、その言葉のまま星空・夜明けで数える
export const OWN_WORD_DAYS = 6;

// 数えるのは名札（決定 2026-10-11）：近い言葉は元の言葉として数える。離れた言葉は元の言葉に入れない。決まった言葉はそのまま。
// 何日も拾った AI の言葉は、その言葉としても数える（近い言葉は元の言葉としても数え続けるので、元の言葉が急に消えない）
export function tagCaptures<T extends { word: string; capturedAt: number }>(captures: T[]): T[] {
  const days = new Map<string, Set<string>>();
  for (const c of captures) {
    if (!registry.has(c.word)) continue;
    const d = new Date(c.capturedAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    let s = days.get(c.word);
    if (!s) days.set(c.word, (s = new Set()));
    s.add(key);
  }
  const out: T[] = [];
  for (const c of captures) {
    const a = registry.get(c.word);
    if (!a) {
      out.push(c);
      continue;
    }
    if (a.kind === 'near') out.push({ ...c, word: a.parent });
    if ((days.get(c.word)?.size ?? 0) >= OWN_WORD_DAYS) out.push(c);
  }
  return out;
}
