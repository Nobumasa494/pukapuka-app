// 倉庫の言葉（設計書 第2部 A.「倉庫と箱」。決定 2026-10-14）。画面や通信に依存しない部分（分析の計算・node の試算からも読める）
// 言葉 →（箱の番号）→ 箱 → グループ。言葉に付いているのは箱の番号だけ
import { BOXES, GENKI_BOXES, isActionBox, type Group } from '../convex/boxes';

export type BoxWord = { text: string; box: number };

const boxOfText = new Map<string, number>();
const wordsOfBox = new Map<number, string[]>();
const GROUP_OF_BOX = new Map(BOXES.map((b) => [b.id, b.group]));

// 倉庫の言葉が、川に流せるくらいそろったら、倉庫で動かす（そろうまでは前の言葉のまま）
export const READY_WORDS = 1500;
export const READY_PER_BOX = 10; // どの箱にも、最低この数の言葉がそろってから切りかえる（箱が空のまま切りかわらないように。2026-10-14）
let ready = false;
export const warehouseReady = () => ready;

// 倉庫で動かせるだけ言葉がそろっているか（読み込んだ一覧だけで決まる。setWarehouse の前でも使える）
export function isWarehouseReady(list: BoxWord[]): boolean {
  const forced = typeof window !== 'undefined' && typeof window.location?.search === 'string' && /[?&]warehouse=1\b/.test(window.location.search);
  if (forced && list.length > 0) return true;
  if (list.length < READY_WORDS) return false;
  const n = new Map<number, number>();
  for (const w of list) n.set(w.box, (n.get(w.box) ?? 0) + 1);
  return BOXES.every((b) => (n.get(b.id) ?? 0) >= READY_PER_BOX);
}

export function setWarehouse(list: BoxWord[]) {
  boxOfText.clear();
  wordsOfBox.clear();
  for (const w of list) {
    boxOfText.set(w.text, w.box);
    const l = wordsOfBox.get(w.box);
    if (l) l.push(w.text);
    else wordsOfBox.set(w.box, [w.text]);
  }
  // 開発用：web で ?warehouse=1 をつけると、言葉が少なくても倉庫で動かす（見た目の確認用）
  ready = isWarehouseReady(list);
}

export const boxOf = (text: string): number | undefined => boxOfText.get(text);
export const groupOf = (text: string): Group | undefined => {
  const b = boxOfText.get(text);
  return b === undefined ? undefined : GROUP_OF_BOX.get(b);
};
export const boxWords = (box: number): readonly string[] => wordsOfBox.get(box) ?? [];
export const isGenkiBoxWord = (text: string) => {
  const b = boxOfText.get(text);
  return b !== undefined && GENKI_BOXES.has(b);
};
// 夜明け・好みの量で使う、前の6種類（していること・感情…）への当てはめ
export const categoryOfBoxWord = (text: string): 'doing' | 'emotion' | 'value' | 'situation' | undefined => {
  const b = boxOfText.get(text);
  if (b === undefined) return undefined;
  return isActionBox(b) ? 'doing' : b <= 40 ? 'emotion' : b === 45 ? 'value' : 'situation';
};

// 分析（星空・夜明け・夕空）用：拾った記録を箱で数える。箱の名前（画面に出る言葉）は、渡された記録の中で
// その箱でいちばん多く拾った言葉、同じ回数なら最後に拾ったのが新しい言葉（決定 2026-10-14）。
// 倉庫の言葉でない記録（前の言葉）は数えない（切りかえた日から数えなおし。決定 2026-10-14）
export function boxCaptures<T extends { word: string; capturedAt: number }>(captures: T[]): T[] {
  const stat = new Map<number, Map<string, { n: number; last: number }>>();
  for (const c of captures) {
    const b = boxOfText.get(c.word);
    if (b === undefined) continue;
    const m = stat.get(b) ?? stat.set(b, new Map()).get(b)!;
    const s = m.get(c.word) ?? { n: 0, last: 0 };
    s.n++;
    s.last = Math.max(s.last, c.capturedAt);
    m.set(c.word, s);
  }
  const name = new Map<number, string>();
  for (const [b, m] of stat) {
    let best = '';
    let bs = { n: -1, last: -1 };
    for (const [w, s] of m) if (s.n > bs.n || (s.n === bs.n && s.last > bs.last)) [best, bs] = [w, s];
    name.set(b, best);
  }
  const out: T[] = [];
  for (const c of captures) {
    const b = boxOfText.get(c.word);
    if (b !== undefined) out.push({ ...c, word: name.get(b)! });
  }
  return out;
}

// 箱の名前ごとに、その箱の言葉が流れた回数を足す（夕空の割合）
export function boxShown(shown: Map<string, number>, names: Iterable<string>): Map<string, number> {
  const byBox = new Map<number, number>();
  for (const [w, n] of shown) {
    const b = boxOfText.get(w);
    if (b !== undefined) byBox.set(b, (byBox.get(b) ?? 0) + n);
  }
  const out = new Map<string, number>();
  for (const name of names) {
    const b = boxOfText.get(name);
    if (b !== undefined) out.set(name, byBox.get(b) ?? 0);
  }
  return out;
}
