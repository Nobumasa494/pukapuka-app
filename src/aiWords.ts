// AI が作った細かい言葉（SPEC 第2部 A.「その人向けの川」）。元の言葉（名札）から生まれた言葉を、川に流す・分析で名札にそろえるために使う
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { setAiRegistry, tagCaptures } from './aiRegistry';
import { setRiverAiWords } from './riverWords';
import { boxCaptures, isWarehouseReady, setWarehouse, warehouseReady } from './warehouse';

// アプリを開いたら AI の言葉を読み込む。読み込めたら、版が変わって記録の見え方が更新される
export function useAiWords(): number {
  const box = useQuery(api.warehouse.forRiver); // 倉庫の言葉（決定 2026-10-14）。そろうまでは前の言葉のまま
  // 倉庫で動くときは、前の言葉を読まない（約1.4MB。開くたびに読むと、Convex の無料の読み込み量を使い切る。2026-10-15）。倉庫の言葉が届くまでも読まない
  // 倉庫の言葉が届いたその場で決める（前は、届いたあとの1回の描き直しのあいだに、前の言葉を読みに行っていた。2026-10-15）
  const boxMode = useMemo(() => (box ? isWarehouseReady(box) : false), [box]);
  const list = useQuery(api.aiWords.forRiver, box === undefined || boxMode ? 'skip' : {});
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!list) return;
    setAiRegistry(list);
    setRiverAiWords(list);
    setVersion((v) => v + 1);
  }, [list]);
  useEffect(() => {
    if (!box) return;
    setWarehouse(box);
    setVersion((v) => v + 1);
  }, [box]);
  return version;
}

// 分析（星空・夜明け）用：記録を名札にそろえる
export function useTagged<T extends { word: string; capturedAt: number }>(captures: T[] | undefined, version: number): T[] | undefined {
  // version：AI の言葉を読み込めたら、そろえ直す
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // 倉庫で動くときは箱で数える（箱の名前＝その箱でいちばん多く拾った言葉）。そうでなければ前の名札のまま
  return useMemo(() => (captures ? (warehouseReady() ? boxCaptures(captures) : tagCaptures(captures)) : captures), [captures, version]);
}
