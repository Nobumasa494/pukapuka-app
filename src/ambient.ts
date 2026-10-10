import { AppState, type NativeEventSubscription } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

// 背景の曲と、泡を拾ったときの音。曲は画面ごとに別で、調だけ（Aメジャー／F#マイナー）そろえる。
// 画面が変わるときは遷移の動画と同じ長さで重ねて切り替える。作り方はスキル pukapuka-music

export type Scene = 'river' | 'cloud' | 'night' | 'me';

const BGM: Record<Scene, number> = {
  river: require('../assets/sounds/bgm_river.m4a'),
  cloud: require('../assets/sounds/bgm_cloud.m4a'),
  night: require('../assets/sounds/bgm_night.m4a'),
  me: require('../assets/sounds/bgm_me.m4a'),
};

// 泡を拾ったときの音「ぷかっ」。ミ ファ# ラ シ ド#（Aメジャーの五音音階）。どの和音の上でもぶつかりにくい
const CHIMES = [
  require('../assets/sounds/chime_0.m4a'),
  require('../assets/sounds/chime_1.m4a'),
  require('../assets/sounds/chime_2.m4a'),
  require('../assets/sounds/chime_3.m4a'),
  require('../assets/sounds/chime_4.m4a'),
];

// 曲の音量（3曲とも -20 LUFS にそろえてある）
const BGM_VOLUME = 0.8;
// わたしのこと（夜明け）は、読むのをじゃましないよう、ほかの画面より小さく鳴らす（SPEC E.。曲の音量そのものは -20 LUFS でそろえたまま）
const SCENE_VOLUME: Record<Scene, number> = { river: 1, cloud: 1, night: 1, me: 0.6 };
const STEP_MS = 40;
// 拾った音は1つの高さにつき2つずつ持つ。続けて同じ高さを拾っても、前の音の余韻を切らずに次の音を鳴らせる
const CHIME_VOICES = 2;

type Voice = { player: AudioPlayer; ready: boolean; startedAt: number };

export type Ambient = {
  setScene: (scene: Scene, fadeMs: number) => void;
  setMuted: (muted: boolean) => void;
  chime: (strength: number) => void;
  dispose: () => void;
};

export function createAmbient(): Ambient {
  // マナーモードでは鳴らさない。ほかのアプリの音楽は止めずに重ねる。裏に回ったら止める
  setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false }).catch(() => {});

  // 曲のプレーヤー。作れなかったとき（開発中に読みこみ直しを何度もくり返すと、Android で作れないことがあった。2026-10-10）は、
  // その曲が要るとき（setScene）にもう一度作る。作れないまま止まらないよう、ここで失敗しても先へ進む
  const players = {} as Partial<Record<Scene, AudioPlayer>>;
  const ensure = (s: Scene) => {
    if (players[s]) return players[s];
    try {
      const p = createAudioPlayer(BGM[s]);
      p.loop = true;
      p.volume = 0;
      players[s] = p;
    } catch {
      // 次に要るときに、もう一度作る
    }
    return players[s];
  };
  for (const s of Object.keys(BGM) as Scene[]) ensure(s);
  // 鳴り終わったら頭へ戻しておき（ready）、押したときは巻き戻しを待たずにすぐ鳴らす。
  // 巻き戻しは非同期で、待たずに play すると iPhone では前の音の終わりが一瞬鳴る・鳴り出しが遅れることがある。
  // keepAudioSessionActive: 鳴り終わるたびに iOS の音のセッションを切らない（切ると、ほかのアプリの音楽の音量が揺れる）
  const chimes: Voice[][] = CHIMES.map((src) =>
    Array.from({ length: CHIME_VOICES }, () => {
      const v: Voice = { player: createAudioPlayer(src, { keepAudioSessionActive: true }), ready: true, startedAt: 0 };
      v.player.addListener('playbackStatusUpdate', (st) => {
        if (st.didJustFinish) rewind(v);
      });
      return v;
    }),
  );
  function rewind(v: Voice) {
    v.player.pause();
    v.player
      .seekTo(0, 0, 0)
      .then(() => {
        v.ready = true;
      })
      .catch(() => {});
  }

  let scene: Scene | null = null;
  let muted = false;
  let active = AppState.currentState === 'active';
  // 曲ごとの目標の音量と、1ミリ秒あたりに近づける量
  const target: Record<Scene, number> = { river: 0, cloud: 0, night: 0, me: 0 };
  const rate: Record<Scene, number> = { river: 1, cloud: 1, night: 1, me: 1 };
  let timer: ReturnType<typeof setInterval> | null = null;

  const tick = () => {
    let moving = false;
    for (const s of Object.keys(players) as Scene[]) {
      const p = players[s]!;
      const goal = muted || !active ? 0 : target[s];
      const v = p.volume;
      if (v === goal) {
        if (goal === 0 && p.playing) p.pause();
        // 裏から戻ったとき、音量はそのままで止まっていることがある
        if (goal > 0 && !p.playing) p.play();
        continue;
      }
      if (goal > 0 && !p.playing) p.play();
      const next = v < goal ? Math.min(goal, v + rate[s] * STEP_MS) : Math.max(goal, v - rate[s] * STEP_MS);
      p.volume = next;
      moving = true;
    }
    if (!moving && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
  const run = () => {
    if (!timer) timer = setInterval(tick, STEP_MS);
    tick();
  };

  const appState: NativeEventSubscription = AppState.addEventListener('change', (s) => {
    active = s === 'active';
    for (const k of Object.keys(players) as Scene[]) rate[k] = BGM_VOLUME / 600;
    run();
  });

  return {
    setScene(next, fadeMs) {
      if (next === scene) return;
      scene = next;
      ensure(next);
      for (const s of Object.keys(players) as Scene[]) {
        target[s] = s === next ? BGM_VOLUME * SCENE_VOLUME[s] : 0;
        rate[s] = BGM_VOLUME / Math.max(1, fadeMs);
      }
      run();
    },
    setMuted(m) {
      if (m === muted) return;
      muted = m;
      for (const s of Object.keys(players) as Scene[]) rate[s] = BGM_VOLUME / 500;
      run();
    },
    // 押した強さ（0.1〜1）が強いほど高い音で、少し大きく
    chime(strength) {
      if (muted || !active) return;
      const i = Math.min(CHIMES.length - 1, Math.floor(strength * CHIMES.length));
      const voices = chimes[i];
      const v = voices.find((x) => x.ready) ?? voices.reduce((a, b) => (a.startedAt <= b.startedAt ? a : b));
      v.player.volume = 0.5 + 0.5 * strength;
      v.startedAt = Date.now();
      if (v.ready) {
        v.ready = false;
        v.player.play();
        return;
      }
      // 2つとも鳴っている（とても速く続けて拾った）ときは、古いほうを頭へ戻してから鳴らす
      v.player.pause();
      v.player
        .seekTo(0, 0, 0)
        .then(() => v.player.play())
        .catch(() => {});
    },
    dispose() {
      if (timer) clearInterval(timer);
      appState.remove();
      for (const p of [...Object.values(players), ...chimes.flat().map((v) => v.player)]) p.remove();
    },
  };
}
