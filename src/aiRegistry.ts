// AI が作った細かい言葉の一覧（画面や通信に依存しない。分析の計算・node の試算からも読める）
import { WORD_CATEGORY, type Category } from './words';

export type AiWord = { text: string; category: string; parent: string; kind: 'near' | 'abstract' | 'behind' };

const registry = new Map<string, AiWord>();
export function setAiRegistry(list: AiWord[]) {
  registry.clear();
  for (const w of list) registry.set(w.text, w);
}

// 言葉の種類（決まった言葉も AI の言葉も）
export const categoryOf = (word: string): Category | undefined => WORD_CATEGORY[word] ?? (registry.get(word)?.category as Category | undefined);

// 近い言葉の近い言葉（そのつど作った言葉）は、いちばん元までさかのぼる。離れた言葉で止まる
function rootOf(word: string): string {
  let w = word;
  for (let i = 0; i < 5; i++) {
    const a = registry.get(w);
    if (!a || a.kind !== 'near') break;
    w = a.parent;
  }
  return w;
}

// 自分の言葉で出る（SPEC 第2部 A.。案 2026-10-11）：読んだ期間のうち、この日数以上拾った AI の言葉は、その言葉のまま星空・夜明けで数える
export const OWN_WORD_DAYS = 6;

// 数えるのは名札（決定 2026-10-11）：近い言葉は元の言葉として数える。離れた言葉・裏側の言葉は元の言葉に入れない。決まった言葉はそのまま。
// 何日も拾った AI の言葉は、その言葉としても数える（近い言葉は元の言葉としても数え続けるので、元の言葉が急に消えない）
export function tagCaptures<T extends { word: string; capturedAt: number }>(captures: T[]): T[] {
  const dayOf = (t: number) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };
  // 言葉ごと・元までさかのぼった言葉ごとに、拾った日を数える
  const days = new Map<string, Set<string>>();
  const addDay = (w: string, t: number) => {
    let s = days.get(w);
    if (!s) days.set(w, (s = new Set()));
    s.add(dayOf(t));
  };
  for (const c of captures) {
    if (!registry.has(c.word)) continue;
    addDay(c.word, c.capturedAt);
    addDay('\n' + rootOf(c.word), c.capturedAt); // 元（近い言葉をさかのぼった先）の仲間ごと
  }
  const enough = (key: string) => (days.get(key)?.size ?? 0) >= OWN_WORD_DAYS;
  const out: T[] = [];
  for (const c of captures) {
    const a = registry.get(c.word);
    if (!a) {
      out.push(c);
      continue;
    }
    const root = rootOf(c.word);
    if (a.kind === 'near') {
      // 元が決まった言葉ならいつも数える。元が AI の言葉（寄り道）なら、その仲間も合わせて6日以上のときだけ
      if (!registry.has(root) || enough('\n' + root)) out.push({ ...c, word: root });
      if (enough(c.word)) out.push(c);
    } else if (enough('\n' + c.word)) out.push(c);
  }
  return out;
}
