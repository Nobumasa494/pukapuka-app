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

// 数えるのは名札（決定 2026-10-11）：近い言葉は元の言葉として数える。抽象的に近い言葉は元の言葉に入れない（null）。決まった言葉はそのまま
export function tagOf(word: string): string | null {
  const a = registry.get(word);
  if (!a) return word;
  return a.kind === 'near' ? a.parent : null;
}
