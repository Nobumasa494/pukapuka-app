// 拾った記録（本物）。第1段はログインなしで、端末ごとの仮の ID で Convex に保存する（SPEC 8. の決定）
import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import type { Capture } from './sampleCaptures';
import { dayKey } from './period';

const KEY = 'pukapuka.deviceId';
let cached: string | null = null;

// 開発用：web で ?demo=1 をつけて開くと、ダミーの人の記録（convex/demo.ts）で動く。この間は、拾っても保存しない
const DEMO_DEVICE_ID = 'demo-persona-0000000000000001';
export const isDemo = typeof window !== 'undefined' && typeof window.location?.search === 'string' && /[?&]demo=1\b/.test(window.location.search);

function newId(): string {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 32; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

// 端末ごとの仮の ID（最初の1回だけ作って端末に覚える）
export function useDeviceId(): string | null {
  const [id, setId] = useState<string | null>(isDemo ? DEMO_DEVICE_ID : cached);
  useEffect(() => {
    if (isDemo || cached) return;
    let alive = true;
    (async () => {
      let v: string | null = null;
      try {
        v = await AsyncStorage.getItem(KEY);
        if (!v) {
          v = newId();
          await AsyncStorage.setItem(KEY, v);
        }
      } catch {
        v = v ?? newId(); // 覚えられない環境でも、この起動の間は使えるように
      }
      cached = v;
      if (alive) setId(v);
    })();
    return () => {
      alive = false;
    };
  }, []);
  return id;
}

// 直近 days 日の記録。読み込み中は undefined
export function useCaptures(days: number): Capture[] | undefined {
  const deviceId = useDeviceId();
  return useQuery(api.captures.listRecent, deviceId ? { deviceId, days } : 'skip');
}

// 拾った言葉を保存する
export function useAddCapture() {
  const deviceId = useDeviceId();
  const add = useMutation(api.captures.add);
  return (word: string, strength: number, frame?: string) => (deviceId && !isDemo ? add({ deviceId, word, strength, frame }) : Promise.resolve(null));
}

// 直近 days 日に、言葉ごとに何回流れたか（夕空の割合。流れた記録 SPEC 第2部 G.）。読み込み中は undefined。
// since：流れた記録がある、いちばん古い日の0時。それより前に拾った言葉は何回流れたか分からないので、割合には使わない（流れた記録がなければ null）
export function useShownCounts(days: number): { shown: Map<string, number>; since: number | null } | undefined {
  const deviceId = useDeviceId();
  const [keys] = useState(() => Array.from({ length: days }, (_, i) => dayKey(Date.now() - i * 86400000)));
  const rows = useQuery(api.flows.listDays, deviceId && !isDemo ? { deviceId, days: keys } : 'skip');
  return useMemo(() => {
    if (isDemo) return { shown: new Map(), since: null };
    if (!rows) return undefined;
    const m = new Map<string, number>();
    let since: number | null = null;
    for (const r of rows) {
      for (const c of r.counts) m.set(c.word, (m.get(c.word) ?? 0) + c.n);
      const [y, mo, d] = r.day.split('-').map(Number);
      const t = new Date(y, mo - 1, d).getTime();
      if (since === null || t < since) since = t;
    }
    return { shown: m, since };
  }, [rows]);
}
