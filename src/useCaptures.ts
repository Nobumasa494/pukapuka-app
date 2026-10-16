// 拾った記録（本物）。第1段はログインなしで、端末ごとの仮の ID で Convex に保存する（SPEC 8. の決定）
import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { getSessionShown, onSessionShown } from './flowSession';
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
  // 過去の日（今日の0時まで）と今日を別々に読む。拾ったときに読み直すのは今日の分だけ（2026-10-15。前は拾うたびに28日分を読み直していた）。
  // 区切りは開いたときに決める（日をまたいで開いたままでも、今日の分の問い合わせが続きを受ける）
  const [range] = useState(() => {
    const now = Date.now();
    return { from: now - days * DAY_MS, today: new Date(new Date(now).setHours(0, 0, 0, 0)).getTime() };
  });
  const past = useQuery(api.captures.listRange, deviceId ? { deviceId, from: range.from, to: range.today } : 'skip');
  const today = useQuery(api.captures.listRange, deviceId ? { deviceId, from: range.today } : 'skip');
  return useMemo(() => {
    if (!past || !today) return undefined;
    const rows = [...today, ...past];
    const until = demoUntil();
    return until !== null ? rows.filter((c) => c.capturedAt <= until) : rows;
  }, [past, today]);
}
const DAY_MS = 86400000;

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
  // 過去の日は変わらないので、ふつうに読む（読み直しは起きない）。今日の分は1分ごとに増えるので、見張らずに、開いたときに1回だけ読み、
  // そのあとは、この端末で数えた回数（getSessionShown）を足す（2026-10-15。今日の分を見張ると、1分ごとに今日の全部を読み直し、1回 約280KB だった）
  const past = useQuery(api.flows.listDays, deviceId && !isDemo ? { deviceId, days: keys.slice(1) } : 'skip');
  const convex = useConvex();
  const [today, setToday] = useState<{ rows: { day: string; counts: { word: string; frame: string; n: number }[] }[]; base: Map<string, number> } | undefined>(undefined);
  useEffect(() => {
    if (!deviceId || isDemo) return;
    let alive = true;
    const base = new Map(getSessionShown()); // 読み込んだ時点で、この端末が数えた分（すでに今日の記録に入っているかもしれない分）
    convex
      .query(api.flows.listDays, { deviceId, days: keys.slice(0, 1) })
      .then((rows) => alive && setToday({ rows, base }))
      .catch(() => alive && setToday({ rows: [], base }));
    return () => {
      alive = false;
    };
  }, [convex, deviceId, keys]);
  const [tick, setTick] = useState(0);
  useEffect(() => onSessionShown(() => setTick((t) => t + 1)), []);
  const rows = today && past ? [...today.rows, ...past] : undefined;
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
    // 読み込んだあとに、この端末で流れた分を足す
    for (const [w, n] of getSessionShown()) {
      const extra = n - (today?.base.get(w) ?? 0);
      if (extra > 0) m.set(w, (m.get(w) ?? 0) + extra);
    }
    if (since === null && getSessionShown().size > 0) since = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
    return { shown: m, since };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, past, tick]);
}
