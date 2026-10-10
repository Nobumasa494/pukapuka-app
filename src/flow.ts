import { WORD_CATEGORY } from './words';

// わたしのこと（C3.）の計算：日をまたいだ流れ（矢印）と、育っていること。RN に依存しないので node で検証できる。
// 同じ回・同じ日の中の順番は使わない（川が順番を決めてしまうため。設計書 D.）

export type Arrow = { from: string; to: string; weight: number };

// 何日後に拾ったかごとの重さ（次の日 1、2日後 0.5、3日後 0.25。設計書 D. の仮の値）
export const ARROW_WEIGHTS = [1, 0.5, 0.25];

// 元気に近い気持ちの言葉（決定 2026-10-07）。好奇心の言葉も行き先に入れる（案）
export const GENKI_WORDS = new Set([
  'わくわく', 'ときめき', '喜び', 'うれしい', '高揚感', '満足', '穏やか', 'ほっとした', '解放感', 'スッキリ', '軽い',
]);
export const isGenki = (w: string) => GENKI_WORDS.has(w) || WORD_CATEGORY[w] === 'curiosity';

type Cap = { word: string; capturedAt: number };

// 暦の日の番号（端末の時計の0時切り。dayKey と同じ日の区切り）。端末の暦の日付を UTC の日に置きかえて数えるので、時差や夏時間でずれない
export function dayNumber(t: number): number {
  const d = new Date(t);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
}

// 日ごとの言葉（1日に何回拾っても1回）
export function wordsByDay(captures: Cap[]): Map<number, Set<string>> {
  const m = new Map<number, Set<string>>();
  for (const c of captures) {
    const d = dayNumber(c.capturedAt);
    let s = m.get(d);
    if (!s) m.set(d, (s = new Set()));
    s.add(c.word);
  }
  return m;
}

// 矢印：ある日に拾った言葉 → 3日以内（暦の日。開かなかった日も詰めない）に拾った言葉。同じ言葉どうしは引かない
export function arrows(captures: Cap[]): Arrow[] {
  const byDay = wordsByDay(captures);
  const w = new Map<string, number>();
  for (const [d, froms] of byDay)
    ARROW_WEIGHTS.forEach((weight, i) => {
      const tos = byDay.get(d + i + 1);
      if (!tos) return;
      for (const a of froms)
        for (const b of tos) {
          if (a === b) continue;
          const key = `${a}\n${b}`;
          w.set(key, (w.get(key) ?? 0) + weight);
        }
    });
  return [...w].map(([key, weight]) => {
    const [from, to] = key.split('\n');
    return { from, to, weight };
  });
}

// 元気・好奇心の源（入次数）：元気・好奇心の言葉へ向かう矢印の重さを、出どころの言葉ごとに足す。重い順（同じなら名前順）
export function genkiSources(list: Arrow[]): { word: string; weight: number }[] {
  const m = new Map<string, number>();
  for (const a of list) if (isGenki(a.to)) m.set(a.from, (m.get(a.from) ?? 0) + a.weight);
  return [...m]
    .map(([word, weight]) => ({ word, weight }))
    .sort((x, y) => y.weight - x.weight || x.word.localeCompare(y.word));
}

// 行き着きやすい気持ち（PageRank）：矢印に沿って重みを少しずつ流すのをくり返す。
// 矢印の出ない言葉からは、全体に均等に流す。合計は1
export function pageRank(list: Arrow[], damping = 0.85, iterations = 100): Map<string, number> {
  const nodes = [...new Set(list.flatMap((a) => [a.from, a.to]))].sort();
  const n = nodes.length;
  const out = new Map<string, number>();
  for (const a of list) out.set(a.from, (out.get(a.from) ?? 0) + a.weight);
  let rank = new Map(nodes.map((v) => [v, 1 / n]));
  for (let it = 0; it < iterations; it++) {
    let dangling = 0;
    for (const v of nodes) if (!out.has(v)) dangling += rank.get(v)!;
    const next = new Map(nodes.map((v) => [v, (1 - damping) / n + (damping * dangling) / n]));
    for (const a of list) next.set(a.to, next.get(a.to)! + (damping * rank.get(a.from)! * a.weight) / out.get(a.from)!);
    rank = next;
  }
  return rank;
}

// くり返すめぐり（強連結成分分解・Tarjan）：お互いに行き来できる言葉の輪。2語以上の輪だけ、大きい順
export function cycles(list: Arrow[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const a of list) {
    if (!adj.has(a.from)) adj.set(a.from, []);
    if (!adj.has(a.to)) adj.set(a.to, []);
    adj.get(a.from)!.push(a.to);
  }
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const result: string[][] = [];
  const visit = (v: string) => {
    idx.set(v, index);
    low.set(v, index++);
    stack.push(v);
    onStack.add(v);
    for (const w of adj.get(v)!) {
      if (!idx.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length >= 2) result.push(comp.sort());
    }
  };
  for (const v of [...adj.keys()].sort()) if (!idx.has(v)) visit(v);
  return result.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}

// 育っていること：週（月曜はじまり）または月ごとに、拾った言葉（日ごとに1回）のうち元気・好奇心の言葉の割合。
// 数ではなく割合にするのは、開かなかった週が「元気がなかった」ように下がって見えないため（案 2026-10-10）
export function growth(captures: Cap[], unit: 'week' | 'month'): { start: number; ratio: number; total: number }[] {
  const buckets = new Map<number, { genki: number; total: number }>();
  for (const [d, words] of wordsByDay(captures)) {
    const date = new Date(d * 86400000); // UTC で読む（dayNumber の逆）
    const start =
      unit === 'month'
        ? new Date(date.getUTCFullYear(), date.getUTCMonth(), 1).getTime()
        : new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - ((date.getUTCDay() + 6) % 7)).getTime();
    const b = buckets.get(start) ?? { genki: 0, total: 0 };
    for (const w of words) {
      b.total++;
      if (isGenki(w)) b.genki++;
    }
    buckets.set(start, b);
  }
  return [...buckets]
    .sort((a, b) => a[0] - b[0])
    .map(([start, b]) => ({ start, ratio: b.genki / b.total, total: b.total }));
}
