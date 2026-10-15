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
// ?demo=day1 は、使いはじめ1日目のダミーの人。?until=13 で、今日の13時までに拾った分だけを見せる（1日の変わり方を撮るため。2026-10-13）
const search = typeof window !== 'undefined' && typeof window.location?.search === 'string' ? window.location.search : '';
const demoKind = /[?&]demo=day1\b/.test(search) ? 'day1' : /[?&]demo=1\b/.test(search) ? '1' : null;
const DEMO_DEVICE_ID = demoKind === 'day1' ? 'demo-day1-00000000000000000001' : 'demo-persona-0000000000000001';
export const isDemo = demoKind !== null;
const untilHour = isDemo ? Number(/[?&]until=(\d+)/.exec(search)?.[1] ?? NaN) : NaN;
export function demoUntil(): number | null {
  if (!Number.isFinite(untilHour)) return null;
  const d = new Date();
  d.setHours(untilHour, 0, 0, 0);
  return d.getTime();
}

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
  const rows = useQuery(api.captures.listRecent, deviceId ? { deviceId, days } : 'skip');
  return useMemo(() => {
    const until = demoUntil();
    return rows && until !== null ? rows.filter((c) => c.capturedAt <= until) : rows;
  }, [rows]);
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
  // 今日の分と、過去の日の分を別々に読む（2026-10-15）。流れた記録は今日の分が1分ごとに増える。まとめて読むと、そのたびに
  // 過去の日まで全部読み直して、Convex の無料の読み込み量を使い切った。過去の日は変わらないので、1回読めば読み直さない
  const today = useQuery(api.flows.listDays, deviceId && !isDemo ? { deviceId, days: keys.slice(0, 1) } : 'skip');
  const past = useQuery(api.flows.listDays, deviceId && !isDemo ? { deviceId, days: keys.slice(1) } : 'skip');
  const rows = today && past ? [...today, ...past] : undefined;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, past]);
}
