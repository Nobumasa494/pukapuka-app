// 流れた記録（SPEC 第2部 G.）：川に浮かんだ泡を端末で数え、1分ごとと、アプリが裏に回ったときにまとめて Convex に送る
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { dayKey } from './period';
import { isDemo, useDeviceId } from './useCaptures';
import { addSessionShown, isPickedWord, notifySessionShown } from './flowSession';
import { warehouseReady } from './warehouse';

const FLUSH_MS = 60_000;
// 日 → 「枠\n言葉」 → 回数。0時をまたいでも、浮かんだ日の分として数える
let tally = new Map<string, Map<string, number>>();

// 泡が1つ川に浮かんだ（frame：どの枠から。今は均等だけ）
export function countFlow(word: string, frame = 'even') {
  addSessionShown(word);
  const day = dayKey(Date.now());
  let m = tally.get(day);
  if (!m) tally.set(day, (m = new Map()));
  const key = `${frame}\n${word}`;
  m.set(key, (m.get(key) ?? 0) + 1);
}

// 数えた分を送る。送り損ねた分は、次に送るときに足し戻す
export function useFlowFlush() {
  const deviceId = useDeviceId();
  const add = useMutation(api.flows.add);
  const busy = useRef(false);
  useEffect(() => {
    if (!deviceId || isDemo) return;
    const flush = async () => {
      if (busy.current || tally.size === 0) return;
      busy.current = true;
      const sending = tally;
      tally = new Map();
      for (const [day, m] of sending) {
        const counts = [...m].map(([key, n]) => {
          const [frame, word] = key.split('\n');
          return { word, frame, n };
        });
        try {
          // 倉庫で動くときは、拾ったことのある言葉を一緒に送る（サーバーは言葉の表を引かず、その言葉のカードだけ直す）
          await add(warehouseReady() ? { deviceId, day, counts, picked: counts.filter((c) => isPickedWord(c.word)).map((c) => c.word) } : { deviceId, day, counts });
        } catch {
          for (const c of counts) {
            let back = tally.get(day);
            if (!back) tally.set(day, (back = new Map()));
            const key = `${c.frame}\n${c.word}`;
            back.set(key, (back.get(key) ?? 0) + c.n);
          }
        }
      }
      busy.current = false;
      notifySessionShown(); // 1分に1回、夕空の割合を描き直す合図
    };
    const timer = setInterval(flush, FLUSH_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') flush();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
      flush();
    };
  }, [deviceId, add]);
}

// その日はじめて川を開いたら、拾いやすくする時間を始める（src/riverWords.ts）。日は端末に覚える
const GATHER_KEY = 'pukapuka.gatherDay';
export function useDailyGather(start: () => void) {
  useEffect(() => {
    const check = async () => {
      const today = dayKey(Date.now());
      try {
        if ((await AsyncStorage.getItem(GATHER_KEY)) === today) return;
        await AsyncStorage.setItem(GATHER_KEY, today);
      } catch {
        // 覚えられない環境では、開くたびに始める
      }
      start();
    };
    check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check(); // 日をまたいで開き直したとき
    });
    return () => sub.remove();
  }, [start]);
}
