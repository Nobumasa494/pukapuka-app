// AI が作った細かい言葉（SPEC 第2部 A.「その人向けの川」）。元の言葉（名札）から生まれた言葉を、川に流す・分析で名札にそろえるために使う
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { setAiRegistry, tagOf } from './aiRegistry';
import { setRiverAiWords } from './riverWords';

// アプリを開いたら AI の言葉を読み込む。読み込めたら、版が変わって記録の見え方が更新される
export function useAiWords(): number {
  const list = useQuery(api.aiWords.forRiver);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!list) return;
    setAiRegistry(list);
    setRiverAiWords(list);
    setVersion((v) => v + 1);
  }, [list]);
  return version;
}

// 分析（星空・夜明け）用：記録を名札にそろえる
export function useTagged<T extends { word: string }>(captures: T[] | undefined, version: number): T[] | undefined {
  return useMemo(() => {
    if (!captures) return captures;
    const out: T[] = [];
    for (const c of captures) {
      const tag = tagOf(c.word);
      if (tag) out.push(tag === c.word ? c : { ...c, word: tag });
    }
    return out;
  }, [captures, version]);
}
