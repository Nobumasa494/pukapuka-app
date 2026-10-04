import { AppState, type NativeEventSubscription } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

// 背景の曲と、泡を拾ったときの音。曲は3つとも同じ和音の進行（Dメジャー: GM7 A6 F#m7 Bm7 Em7 F#m7 GM7 A7sus4）で、
// 画面が変わるときは遷移の動画と同じ長さで重ねて切り替える。作り方はスキル pukapuka-design の「音」

export type Scene = 'river' | 'cloud' | 'night';

const BGM: Record<Scene, number> = {
  river: require('../assets/sounds/bgm_river.m4a'),
  cloud: require('../assets/sounds/bgm_cloud.m4a'),
  night: require('../assets/sounds/bgm_night.m4a'),
};

// ラ シ レ ミ ファ#（Dメジャーの五音音階）。どの和音の上でもぶつかりにくい
const CHIMES = [
  require('../assets/sounds/chime_0.m4a'),
  require('../assets/sounds/chime_1.m4a'),
  require('../assets/sounds/chime_2.m4a'),
  require('../assets/sounds/chime_3.m4a'),
  require('../assets/sounds/chime_4.m4a'),
];

// 曲の音量（3曲とも -20 LUFS にそろえてある）
const BGM_VOLUME = 0.8;
const STEP_MS = 40;

export type Ambient = {
  setScene: (scene: Scene, fadeMs: number) => void;
  setMuted: (muted: boolean) => void;
  chime: (strength: number) => void;
  dispose: () => void;
};

export function createAmbient(): Ambient {
  // マナーモードでは鳴らさない。ほかのアプリの音楽は止めずに重ねる。裏に回ったら止める
  setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false }).catch(() => {});

  const players = {} as Record<Scene, AudioPlayer>;
  for (const s of Object.keys(BGM) as Scene[]) {
    const p = createAudioPlayer(BGM[s]);
    p.loop = true;
    p.volume = 0;
    players[s] = p;
  }
  const chimes = CHIMES.map((src) => createAudioPlayer(src));

  let scene: Scene | null = null;
  let muted = false;
  let active = AppState.currentState === 'active';
  // 曲ごとの目標の音量と、1ミリ秒あたりに近づける量
  const target: Record<Scene, number> = { river: 0, cloud: 0, night: 0 };
  const rate: Record<Scene, number> = { river: 1, cloud: 1, night: 1 };
  let timer: ReturnType<typeof setInterval> | null = null;

  const tick = () => {
    let moving = false;
    for (const s of Object.keys(players) as Scene[]) {
      const p = players[s];
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
      for (const s of Object.keys(players) as Scene[]) {
        target[s] = s === next ? BGM_VOLUME : 0;
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
      const p = chimes[i];
      p.volume = 0.5 + 0.5 * strength;
      p.seekTo(0).catch(() => {});
      p.play();
    },
    dispose() {
      if (timer) clearInterval(timer);
      appState.remove();
      for (const p of [...Object.values(players), ...chimes]) p.remove();
    },
  };
}
