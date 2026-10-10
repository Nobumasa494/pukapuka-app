// わたしのこと（src/flow.ts）の、過去の時点のスナップショットを端末にとっておく。
// 週の終わりの結果は、あとから変わらないので、1回計算すれば次からは読むだけ（毎日計算するのは「今」の1回だけ）
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SnapCache, Snapshot } from './flow';

const PREFIX = 'pukapuka.me.';
const mem = new Map<string, Snapshot>(); // 同じ起動の間は、読み込みも省く

export function meCache(deviceId: string): SnapCache {
  const k = (key: string) => `${PREFIX}${deviceId}.${key}`;
  return {
    async get(key) {
      const m = mem.get(k(key));
      if (m) return m;
      try {
        const v = await AsyncStorage.getItem(k(key));
        if (!v) return null;
        const sn = JSON.parse(v) as Snapshot;
        mem.set(k(key), sn);
        return sn;
      } catch {
        return null; // 読めない環境では、計算し直すだけ
      }
    },
    async set(key, v) {
      mem.set(k(key), v);
      try {
        await AsyncStorage.setItem(k(key), JSON.stringify(v));
      } catch {
        // 覚えられない環境でも、この起動の間は mem で使える
      }
    },
  };
}
