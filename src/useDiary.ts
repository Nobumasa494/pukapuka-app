// 日記の保存（Convex の diaries 表）。拾った記録と同じ、端末ごとの仮の ID で分ける
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { isDemo, useDeviceId } from './useCaptures';

export type DiaryEntry = { day: string; text: string; savedAt: number };

// 書いた日記。読み込み中は undefined
export function useDiaries(): DiaryEntry[] | undefined {
  const deviceId = useDeviceId();
  return useQuery(api.diary.list, deviceId ? { deviceId } : 'skip');
}

// 残す（空なら消える）・消す。ダミーの人（?demo=1）のときは保存しない
export function useDiaryActions() {
  const deviceId = useDeviceId();
  const save = useMutation(api.diary.save);
  const remove = useMutation(api.diary.remove);
  return {
    save: (day: string, text: string) => (deviceId && !isDemo ? save({ deviceId, day, text }) : Promise.resolve(null)),
    remove: (day: string) => (deviceId && !isDemo ? remove({ deviceId, day }) : Promise.resolve(null)),
  };
}
