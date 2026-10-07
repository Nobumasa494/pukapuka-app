// 拾った記録（本物）。第1段はログインなしで、端末ごとの仮の ID で Convex に保存する（SPEC 8. の決定）
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import type { Capture } from './sampleCaptures';

const KEY = 'pukapuka.deviceId';
let cached: string | null = null;

function newId(): string {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 32; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

// 端末ごとの仮の ID（最初の1回だけ作って端末に覚える）
export function useDeviceId(): string | null {
  const [id, setId] = useState<string | null>(cached);
  useEffect(() => {
    if (cached) return;
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
  return (word: string, strength: number) => (deviceId ? add({ deviceId, word, strength }) : Promise.resolve(null));
}
