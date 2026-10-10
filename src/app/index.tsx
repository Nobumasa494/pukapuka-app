import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View, Pressable, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle, useAnimatedProps, useAnimatedReaction, useFrameCallback, withTiming, withDelay, runOnJS, runOnUI,
  cancelAnimation, withRepeat, withSequence, Easing, FadeIn, FadeOut, type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';

import { useFocusEffect } from 'expo-router';
import { useAddCapture } from '../useCaptures';
import { getRandomWords } from '../words';
import WordCloudOverlay from '../components/WordCloudOverlay';
import NightOverlay from '../components/NightOverlay';
import MeOverlay from '../components/MeOverlay';
import DiaryOverlay from '../components/DiaryOverlay';
import { createAmbient, type Ambient, type Scene } from '../ambient';
import { buildPathData, placeBubble, spawnFlowing, stepBubbles, type PathData, type SimBubble } from '../riverFlow';
import type { VideoRect } from '../riverPath';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RIVER_VIDEO = require('../../assets/video/river_bg.mp4');
const RIVER_POSTER = require('../../assets/video/river_bg_poster.jpg');
// 川→空の遷移（2秒）。最初のコマは川、最後のコマは空のループの最初のコマと同じ絵
const TRANS_VIDEO = require('../../assets/video/river_to_cloud.mp4');
// 空のループ（拾ったことばの背景、4秒）
const CLOUD_VIDEO = require('../../assets/video/cloud_bg.mp4');
const CLOUD_BG = require('../../assets/video/cloud_bg.jpg');
// 空→川は行きの動画を逆順にしたもの。最初のコマ＝空、最後のコマ＝川
const BACK_VIDEO = require('../../assets/video/cloud_to_river.mp4');
// 空→夜（3秒）。カメラが空へ近づきながら夜が更けて星が出る。最初のコマ＝空のループの最初のコマ、最後のコマ＝夜の静止画
const NIGHT_VIDEO = require('../../assets/video/cloud_to_night.mp4');
const NIGHT_BG = require('../../assets/video/night_bg.jpg');
// 夜→空は行きの動画を逆順にしたもの。最初のコマ＝夜、最後のコマ＝空のループの最初のコマ
const NIGHT_BACK_VIDEO = require('../../assets/video/night_to_cloud.mp4');
const VIDEO_SURFACE = 'textureView' as const;

// 背景の動画は1本のプレーヤーで差し替える（stage ごとに1本）。同時に複数の動画を持つと、Android で
// 新しい動画を動かし始めた瞬間に表示中の動画が黒くなった（ボタンを押した瞬間に画面が黒く光る）
// 夜はループの動画を持たない。遷移の最後のコマと同じ静止画で止める
type Clip = 'river' | 'toCloud' | 'cloud' | 'toRiver' | 'toNight' | 'nightToCloud';
type Stage = Clip | 'night' | 'nightToRiver' | 'riverToNight' | 'me' | 'riverToMe' | 'meToRiver';

// 段階ごとに流す曲と、切り替えにかける時間（遷移の動画と同じ長さ）
const SCENE_OF: Record<Stage, Scene> = {
  river: 'river',
  toCloud: 'cloud',
  cloud: 'cloud',
  toRiver: 'river',
  toNight: 'night',
  night: 'night',
  nightToCloud: 'cloud',
  nightToRiver: 'river',
  riverToNight: 'night',
  me: 'me',
  riverToMe: 'me',
  meToRiver: 'river',
};
const MUSIC_FADE_MS: Partial<Record<Stage, number>> = {
  river: 1500,
  toCloud: 2000,
  toRiver: 2000,
  toNight: 3000,
  nightToCloud: 3000,
  nightToRiver: 900,
  riverToNight: 900,
  riverToMe: 900,
  meToRiver: 900,
};
type Still = 'river' | 'cloud' | 'night';
// first: 最初のコマと同じ静止画（差し替えの瞬間に被せる）。last: 遷移の最後のコマと同じ静止画（終わり際に被せる）
const CLIPS: Record<Clip, { src: number; loop: boolean; first: Still; last?: Still; ms?: number }> = {
  river: { src: RIVER_VIDEO, loop: true, first: 'river' },
  toCloud: { src: TRANS_VIDEO, loop: false, first: 'river', last: 'cloud', ms: 2000 },
  cloud: { src: CLOUD_VIDEO, loop: true, first: 'cloud' },
  toRiver: { src: BACK_VIDEO, loop: false, first: 'cloud', last: 'river', ms: 2000 },
  toNight: { src: NIGHT_VIDEO, loop: false, first: 'cloud', last: 'night', ms: 3000 },
  nightToCloud: { src: NIGHT_BACK_VIDEO, loop: false, first: 'night', last: 'cloud', ms: 3000 },
};
// 差し替えた動画は、再生位置が実際に進んだ合図（timeUpdate）で上の静止画を消して見せる
const TIME_UPDATE_S = 0.05;

// 右上の「振り返る」の印（三日月と小さな星）
const MOON_PATH = 'M15 4a9.5 9.5 0 1 0 5.2 14.2A7.6 7.6 0 0 1 15 4z';
const STAR_PATH = 'M24 4l.9 2.2 2.2.9-2.2.9L24 10.2l-.9-2.2-2.2-.9 2.2-.9z';
const MOON_HALO = 64;
const MOON_TWINKLE_EVERY_MS = 4000;
const GLINT = 26;

// 押せると分かるように、4秒に1回、星が「きらん」と光り、月のうしろの淡い光（月の暈）も一瞬明るくなる。
// 押した瞬間は少し縮んで明るくなり、軽く振動する
// （ユーザー「月ボタンが押せる感を出したい」→ 暈が息づく案 →「きらんと光るがいいかも、４秒に一回くらい」2026-10-10）
function LookBackMoon({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  const kiran = useSharedValue(0);
  const pressed = useSharedValue(0);
  useEffect(() => {
    kiran.set(
      withRepeat(
        withSequence(
          withDelay(MOON_TWINKLE_EVERY_MS - 700, withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) })),
          withTiming(0, { duration: 500, easing: Easing.in(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(kiran);
  }, [kiran]);
  const haloStyle = useAnimatedStyle(() => ({ opacity: 0.3 + 0.7 * Math.max(kiran.value, pressed.value) }));
  const glintStyle = useAnimatedStyle(() => ({
    opacity: kiran.value,
    transform: [{ scale: 0.3 + 0.9 * kiran.value }, { rotate: `${kiran.value * 20}deg` }],
  }));
  const moonStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.12 * pressed.value }] }));
  return (
    <Pressable
      // 水辺以外では押させない。ここ（ふつうの部品）の style なら、web でも戻したときに正しく効く
      style={[styles.archiveBtn, { pointerEvents: disabled ? 'none' : 'auto' }]}
      hitSlop={16}
      onPressIn={() => {
        pressed.set(withTiming(1, { duration: 80 }));
        Haptics.selectionAsync();
      }}
      onPressOut={() => pressed.set(withTiming(0, { duration: 220 }))}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="振り返る"
    >
      <Animated.View style={[styles.moonHalo, haloStyle]} pointerEvents="none">
        <Svg width={MOON_HALO} height={MOON_HALO}>
          <Defs>
            <RadialGradient id="moonHalo" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="rgb(255,238,205)" stopOpacity={0.55} />
              <Stop offset="0.5" stopColor="rgb(255,230,190)" stopOpacity={0.2} />
              <Stop offset="1" stopColor="rgb(255,230,190)" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={MOON_HALO / 2} cy={MOON_HALO / 2} r={MOON_HALO / 2} fill="url(#moonHalo)" />
        </Svg>
      </Animated.View>
      <Animated.View style={moonStyle}>
        <Svg width={34} height={30} viewBox="0 0 30 26">
          <Path d={MOON_PATH} fill="rgba(255,236,200,0.35)" stroke="rgba(255,236,200,0.35)" strokeWidth={3} strokeLinejoin="round" />
          <Path d={STAR_PATH} fill="rgba(255,236,200,0.35)" stroke="rgba(255,236,200,0.35)" strokeWidth={2.4} strokeLinejoin="round" />
          <Path d={MOON_PATH} fill="#fff6e4" />
          <Path d={STAR_PATH} fill="#fff6e4" />
        </Svg>
        {/* 星の「きらん」：細い十字の光 */}
        <Animated.View style={[styles.moonGlint, glintStyle]} pointerEvents="none">
          <Svg width={GLINT} height={GLINT}>
            <Path d={`M${GLINT / 2} 0 L${GLINT / 2 + 0.9} ${GLINT / 2} L${GLINT / 2} ${GLINT} L${GLINT / 2 - 0.9} ${GLINT / 2} Z`} fill="#fffaf0" />
            <Path d={`M0 ${GLINT / 2} L${GLINT / 2} ${GLINT / 2 - 0.9} L${GLINT} ${GLINT / 2} L${GLINT / 2} ${GLINT / 2 + 0.9} Z`} fill="#fffaf0" />
            <Circle cx={GLINT / 2} cy={GLINT / 2} r={2.2} fill="#ffffff" />
          </Svg>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}
const REVEAL_AT_S = 0.06;
// 静止画を消すのは「新しい動画の最初のコマが描かれた」合図（onFirstFrameRender）の後。再生位置が進んでも、
// スマホではまだ絵が描かれておらず黒いことがあった（遷移が終わってループに切り替えた直後に黒く光った）。
// 合図が来ない環境のための保険に、再生位置がこれを過ぎたら消す
const REVEAL_FALLBACK_AT_S = 0.4;
// 遷移の動画が終わる少し前から、次のループの最初のコマの静止画を被せておく（遷移の最後のコマと同じ絵なので見た目は変わらない）。
// 終わった瞬間にいきなり出すと、それまで不透明度0だった静止画の描く準備が間に合わず、黒が見えた
const PRECOVER_LEFT_S = 0.3;
const PRECOVER_MS = 250;
const REVEAL_MS = 120;
// 静止画で覆ってから差し替える（ループ中の波と静止画の波のずれをフェードで隠す）
const COVER_IN_MS = 180;
const UI_FADE_MS = 300;
const CLOUD_UI_IN_MS = 500;
const TRANS_RISE_MS = 1600;
const BACK_SURFACE_DELAY_MS = 1300;
const BACK_SURFACE_MS = 900;
// 演出と保険タイマーは動画が実際に見え始めた時から数える（スマホは再生開始が遅れる）
const CLIP_END_SLACK_MS = 800;
// 夜→川は動画を使わず、夜の静止画をフェードして夕方の川の静止画を見せる（仕様「夜空がフェードし、夕方の渓流へ戻る」）
const NIGHT_FADE_MS = 900;
// 動画が再生できない環境では、この時間待っても始まらなければ静止画のまま進める
const VIDEO_START_TIMEOUT_MS = 1200;

// プレーヤーの設定はコンポーネントの外で変える（中で代入すると react-hooks/immutability に引っかかる）
function setLoop(p: VideoPlayer, loop: boolean) {
  p.loop = loop;
}

const SURFACE_SEC = 1.2;
const PREWARM_SEC = 30;
const SPAWN_EVERY_MS = 250;
// 泡を押さえている間は、ほかの泡の流れをこの割合までゆっくりにする（選んでいるあいだ慌てないように）。
// 0.3 ではまだ慌てる（2026-10-04、ユーザー「止まってはいないけど、かなりゆっくり」）。0.12 で手前の泡は約4px/秒。
// いきなり変えると止まったように見えるので、FLOW_EASE_SEC 秒くらいかけてなめらかに落とす・戻す
const HOLD_FLOW_RATE = 0.12;
const FLOW_EASE_SEC = 0.35;
// 画面下のヒント文の手前で泡を消す
const BOTTOM_UI = 60;
// 泡はこの大きさで一度だけ描き、UI スレッドで拡大・縮小して正しい大きさにする（流れている泡は描き直さない）。
// 大きさが変わるたびに描き直すと、その1コマだけ大きさと位置が食い違って泡が跳ねた
const BASE = 80;
// 文字は拡大・縮小を打ち消して 10〜15px に保つ（奥でも文字10px以上）
const TEXT_BASE = 15;

let nextId = Date.now();

type ListItem = { id: number; word: string; bob: number };

function findBubble(bs: SimBubble[], id: number): SimBubble | null {
  'worklet';
  for (let k = 0; k < bs.length; k++) if (bs[k].id === id) return bs[k];
  return null;
}

// 同じ言葉が続けて・同時に流れないように選ぶ
function pickWordFrom(current: ListItem[], recent: string[], setRecent: (r: string[]) => void) {
  let word = getRandomWords(1)[0];
  for (let tries = 0; tries < 10 && (recent.includes(word) || current.some((w) => w.word === word)); tries++) {
    word = getRandomWords(1)[0];
  }
  setRecent([...recent.slice(-4), word]);
  return word;
}

function prewarm(P: PathData) {
  let bs: SimBubble[] = [];
  let items: ListItem[] = [];
  let recent: string[] = [];
  const dt = 0.1;
  for (let i = 0; i < PREWARM_SEC / dt; i++) {
    const word = pickWordFrom(items, recent, (r) => {
      recent = r;
    });
    const c = spawnFlowing(P, bs, nextId++, word.length);
    if (c) {
      bs = [...bs, c];
      items = [...items, { id: c.id, word, bob: Math.random() * Math.PI * 2 }];
    }
    const r = stepBubbles(P, bs, dt);
    bs = r.bs;
    if (r.exited.length) items = items.filter((w) => !r.exited.includes(w.id));
  }
  return { bs, items };
}

// 拾ったときの波紋。泡の中心から少し下（水の接点）为中心にして広がる
function Ripple({ size }: { size: number }) {
  const scale = useSharedValue(0.3);
  const opacity = useSharedValue(0.9);
  const d = size * 0.75;

  useEffect(() => {
    scale.set(withTiming(3, { duration: 600 }));
    opacity.set(withTiming(0, { duration: 600 }));
  }, [scale, opacity]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.ripple, style, { width: d, height: d, borderRadius: d / 2, left: size / 2 - d / 2, top: size * 0.62 - d / 2 }]}
    />
  );
}

type BubbleProps = {
  id: number;
  word: string;
  bob: number;
  P: PathData;
  sim: SharedValue<SimBubble[]>;
  time: SharedValue<number>;
  rise: SharedValue<number>;
  onCapture: (word: string, strength: number) => void;
  onRemove: (id: number) => void;
  onPressStart: (id: number) => void;
  onPressEnd: () => void;
  onLift: (id: number) => void;
};

// 長押しのリングと光の粒を出すまでの時間（ms）。タップ（強さ0.1になる 200ms 未満）の多くはこれより短い
const CHARGE_UI_DELAY_MS = 150;
// 指でこれ以上引っぱったら、泡は水面を離れたとみなす（px）
const LIFT_DRAG_PX = 20;

const Bubble = memo(function Bubble({ id, word, bob, P, sim, time, rise, onCapture, onRemove, onPressStart, onPressEnd, onLift }: BubbleProps) {
  const base = BASE;
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const translateY = useSharedValue(0);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const chargeScale = useSharedValue(0);
  const chargeOpacity = useSharedValue(0);
  // 押している時間の割合（0〜1、2秒で1）。強さと同じく時間に比例させる（chargeScale は見た目のための緩急つき）
  const charge = useSharedValue(0);
  const pressStart = useRef<number>(0);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const liftedRef = useRef(false);
  // 拾われた（離した）泡。空へ昇っている間にもう一度触れても、押したことにしない
  const capturedRef = useRef(false);
  const [rippling, setRippling] = useState(false);
  // 長押しのリング（SVG）と光の粒は、CHARGE_UI_DELAY_MS 押し続けてから描く。
  // すぐ離すタップでも作っていて、続けて拾うとリングと粒（アニメーションつきの部品6つ）の作成が重なりカクついた（2026-10-05）
  const [charging, setCharging] = useState(false);
  const chargeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (chargeTimer.current) clearTimeout(chargeTimer.current);
  }, []);

  // 位置・大きさ・透明度は UI スレッドで毎コマ、流れの計算結果（sim）から決める
  const posStyle = useAnimatedStyle(() => {
    const b = findBubble(sim.value, id);
    if (!b) return { opacity: 0 };
    const pl = (b.pl ?? placeBubble(P, b));
    const fadeIn = Math.min(1, b.age / SURFACE_SEC);
    // 泡の下の方がヒント文に近づいたら消える（中心で判定すると大きな泡が文字に重なる）
    const fadeOut = Math.min(1, Math.max(0, (P.height - BOTTOM_UI - (pl.y + pl.size * 0.35)) / 60));
    return {
      opacity: (0.8 + 0.2 * pl.t) * Math.min(fadeIn, fadeOut),
      transform: [{ translateX: pl.x - base / 2 }, { translateY: pl.y - base / 2 }, { scale: pl.size / base }],
    };
  });

  const CHARGE_MAX = 2000;

  const startPress = (touchX?: number, touchY?: number) => {
    // 押している最中にもう1本の指が触れた・拾われて昇っている泡に触れたときは数えない。
    // 数えると、押している指の数（holds）が離しても0に戻らず、流れがゆっくり（0.12倍）のまま残って「詰まった」ように見える
    if (pressStart.current !== 0 || capturedRef.current) return;
    pressStart.current = Date.now();
    if (touchX !== undefined) touchStartX.current = touchX;
    if (touchY !== undefined) touchStartY.current = touchY;
    dragX.set(0);
    dragY.set(0);
    liftedRef.current = false;
    chargeScale.set(0);
    chargeOpacity.set(withTiming(0.8, { duration: 200 }));
    chargeScale.set(withTiming(1, { duration: CHARGE_MAX }));
    charge.set(0);
    charge.set(withTiming(1, { duration: CHARGE_MAX, easing: Easing.linear }));
    chargeTimer.current = setTimeout(() => setCharging(true), CHARGE_UI_DELAY_MS);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPressStart(id);
  };

  // 水面を離れた泡は、元の場所に残る見えない壁にしない
  const lift = () => {
    if (liftedRef.current) return;
    liftedRef.current = true;
    onLift(id);
  };

  // 離したら必ず拾う。拾った泡は止まったまま空へ昇って消える
  const endPress = () => {
    if (pressStart.current === 0) return;
    const elapsed = Date.now() - pressStart.current;
    pressStart.current = 0;
    capturedRef.current = true;
    if (chargeTimer.current) clearTimeout(chargeTimer.current);
    onPressEnd();
    const strength = elapsed < 200 ? 0.1 : Math.min(elapsed / CHARGE_MAX, 1);
    // 離したら光の粒はその段で止める（振動もそれ以上は返さない）
    cancelAnimation(charge);
    // 拾った泡は空へ昇るので、昇りきるのを待たずに流れから外す（待つと1.4秒間、後ろをせき止めた）
    lift();
    chargeOpacity.set(withTiming(0, { duration: 300 }));
    setRippling(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    scale.set(withTiming(1.1, { duration: 1400 }));
    translateY.set(withTiming(-180, { duration: 1400, easing: Easing.in(Easing.quad) }));
    opacity.set(withTiming(0, { duration: 1400, easing: Easing.in(Easing.quad) }, () => {
      runOnJS(onRemove)(id);
    }));
    onCapture(word, strength);
  };

  const handleTouchMove = (event: any) => {
    if (pressStart.current === 0) return;
    const touch = event.nativeEvent.touches[0];
    if (touch) {
      const dx = touch.pageX - touchStartX.current;
      const dy = touch.pageY - touchStartY.current;
      dragX.set(dx);
      dragY.set(dy);
      if (Math.hypot(dx, dy) > LIFT_DRAG_PX) lift();
    }
  };

  // 泡全体は大きさ s 倍に拡大・縮小されているので、画面上の動き（指の移動・ぷかぷか±3px・拾って昇る）は 1/s で入れる
  const bodyStyle = useAnimatedStyle(() => {
    const b = findBubble(sim.value, id);
    const s = b ? (b.pl ?? placeBubble(P, b)).size / base : 1;
    return {
      transform: [
        { scale: scale.value },
        // 横のゆらゆら（見た目だけ ±SWAY_PX。流れの計算には入れない）
        { translateX: (dragX.value + SWAY_PX * Math.sin((2 * Math.PI * time.value) / SWAY_SEC + bob * 1.3)) / s },
        // ぷかぷか上下 ±3px・周期2.8秒（全体共通の時計に泡ごとの位相）
        { translateY: (translateY.value + 3 * Math.sin((2 * Math.PI * time.value) / 2.8 + bob) + dragY.value) / s },
        // 浮いているものらしく、ほんの少しゆっくり傾く（±3度。文字が読める範囲）
        { rotate: `${TILT_DEG * Math.sin((2 * Math.PI * time.value) / TILT_SEC + bob * 1.7)}deg` },
      ],
      opacity: opacity.value,
    };
  });
  // 文字は拡大・縮小を打ち消して、今までどおり泡の大きさに応じた 10〜15px にする
  const textStyle = useAnimatedStyle(() => {
    const b = findBubble(sim.value, id);
    if (!b) return {};
    const size = (b.pl ?? placeBubble(P, b)).size;
    const font = Math.max(10, Math.min(15, (size * 0.8) / word.length));
    return { transform: [{ scale: font / TEXT_BASE / (size / base) }] };
  });
  // 奥の泡ほど夕日のもやがかかる
  const hazeStyle = useAnimatedStyle(() => {
    const b = findBubble(sim.value, id);
    return { opacity: b ? 1 - (b.pl ?? placeBubble(P, b)).t : 0 };
  });
  // 水面の波紋と映り込みは水に残る（上下しない）。泡が水面を離れたら（遷移で空へ昇る・指で引っぱる・拾われて昇る）すぐ消す。
  // 消さないと、泡のいない場所に波紋の輪だけが痕跡として残る
  const waterStyle = useAnimatedStyle(() => {
    const dragAway = Math.max(0, 1 - Math.hypot(dragX.value, dragY.value) / LIFT_DRAG_PX);
    const risen = Math.max(0, 1 + translateY.value / 30);
    return { opacity: opacity.value * Math.max(0, 1 - rise.value * 5) * dragAway * risen };
  });

// 長押しのリングは泡に密着させる。padding を大きくすると、
  // 後ろの泡が「リングの手前で止まる」のでリングが障害物の境目に見える
  const RING_PADDING = 6;
  const ringSize = base + RING_PADDING * 2;
  const ringRadius = ringSize / 2 - 3;
  const circumference = 2 * Math.PI * ringRadius;

  const svgContainerStyle = useAnimatedStyle(() => ({ opacity: chargeOpacity.value }));
  const animatedCircleProps = useAnimatedProps(() => {
    const progress = chargeScale.value;
    const g = Math.round(200 - progress * 80);
    const b = Math.round(100 - progress * 60);
    return {
      strokeDashoffset: circumference * (1 - progress),
      stroke: `rgba(255,${g},${b},${0.7 + progress * 0.2})`,
    };
  });

  return (
    <Animated.View
      // 押している泡は手前に出す（光の粒が隣の泡の下に潜って、くすんで見えた）
      style={[styles.bubbleWrapper, { width: base, height: base }, charging && styles.bubbleFront, posStyle]}
      onTouchStart={(e) => startPress(e.nativeEvent.touches[0]?.pageX, e.nativeEvent.touches[0]?.pageY)}
      onTouchMove={handleTouchMove}
      onTouchEnd={endPress}
      onTouchCancel={endPress}
    >
      {/* 水との接点: 泡の足元の水面に、寝かせた波紋と淡い映り込み（最初から潰した形で描き、毎コマは動かさない） */}
      <Animated.View pointerEvents="none" style={[waterStyle, StyleSheet.absoluteFill]}>
        <WaterMarks size={base} />
      </Animated.View>

      <Animated.View style={[bodyStyle, { width: base, height: base }]}>
        {charging && (
          <Animated.View style={[svgContainerStyle, { position: 'absolute', top: -RING_PADDING, left: -RING_PADDING, width: ringSize, height: ringSize }]}>
            <Svg width={ringSize} height={ringSize}>
              <Circle cx={ringSize / 2} cy={ringSize / 2} r={ringRadius} stroke="rgba(255,255,255,0.08)" strokeWidth={2} fill="none" />
              <AnimatedCircle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={ringRadius}
                strokeWidth={3}
                fill="none"
                strokeDasharray={circumference}
                animatedProps={animatedCircleProps}
                strokeLinecap="round"
                transform={`rotate(-90, ${ringSize / 2}, ${ringSize / 2})`}
              />
            </Svg>
          </Animated.View>
        )}
        {rippling && <Ripple size={base} />}
        {charging && <ChargeDots id={id} P={P} sim={sim} charge={charge} visible={chargeOpacity} />}
        <BubbleFace size={base} />
        <Animated.View pointerEvents="none" style={[styles.haze, { borderRadius: base / 2 }, hazeStyle]} />
        <View pointerEvents="none" style={styles.textBox}>
          <Animated.Text style={[styles.bubbleText, { fontSize: TEXT_BASE }, textStyle]}>{word}</Animated.Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
});

// 長押しの強さを、指で隠れない泡の上に5つの光の粒で見せる（2026-10-04、ユーザー指摘「リングが指で隠れて、どれくらい押したか分からない」）。
// 粒は 0・0.4・0.8・1.2・1.6秒で1つずつ灯る。拾う音の高さ（floor(強さ×5) 段目）と同じ段なので、灯った数＝鳴る音の高さ。
// 段が上がるたびに軽い振動を返し、画面を見なくても分かるようにする。
// 泡と一緒に動く（指で引っぱる・ぷかぷか）が、大きさは泡の遠近に関係なく画面上で一定（1/s で打ち消す）
const DOT_COUNT = 5;
const DOT_SIZE = 7;
const DOT_GAP = 6;
const DOTS_WIDTH = DOT_COUNT * DOT_SIZE + (DOT_COUNT - 1) * DOT_GAP;
// 指先より上に出す: 泡の中心から「半径＋24px」と 60px（iPhone で約9mm）の遠いほう。
// 46px（約7mm）では、指先がタッチした所より上まで伸びたときにかかるおそれがあった
const DOTS_ABOVE_RIM = 24;
const DOTS_ABOVE_MIN = 60;

const tickHaptic = (level: number) => {
  if (level >= DOT_COUNT - 1) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  else Haptics.selectionAsync();
};

const ChargeDots = memo(function ChargeDots({ id, P, sim, charge, visible }: {
  id: number;
  P: PathData;
  sim: SharedValue<SimBubble[]>;
  charge: SharedValue<number>;
  visible: SharedValue<number>;
}) {
  useAnimatedReaction(
    () => Math.min(DOT_COUNT - 1, Math.floor(charge.value * DOT_COUNT)),
    (level, prev) => {
      if (prev !== null && level > prev) runOnJS(tickHaptic)(level);
    },
  );
  const rowStyle = useAnimatedStyle(() => {
    const b = findBubble(sim.value, id);
    const size = b ? (b.pl ?? placeBubble(P, b)).size : BASE;
    const s = size / BASE;
    const above = Math.max(size / 2 + DOTS_ABOVE_RIM, DOTS_ABOVE_MIN);
    return {
      opacity: Math.min(1, visible.value / 0.8),
      transform: [{ translateY: -above / s }, { scale: 1 / s }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.dotsRow, rowStyle]}>
      {Array.from({ length: DOT_COUNT }, (_, k) => <ChargeDot key={k} k={k} charge={charge} />)}
    </Animated.View>
  );
});

// 弱い段はゴールド、強い段ほどオレンジ（チャージリングと同じ色の流れ）
const dotColor = (k: number) => `rgb(255,${Math.round(200 - (80 * k) / (DOT_COUNT - 1))},${Math.round(100 - (60 * k) / (DOT_COUNT - 1))})`;

function ChargeDot({ k, charge }: { k: number; charge: SharedValue<number> }) {
  const color = dotColor(k);
  // 灯るときは 60ms でふわっと少し大きくなってから落ち着く
  const litStyle = useAnimatedStyle(() => {
    const a = Math.min(1, Math.max(0, (charge.value - k / DOT_COUNT) / 0.03));
    const lit = k === 0 ? 1 : a;
    return { opacity: lit, transform: [{ scale: 0.8 + 0.2 * lit + 0.35 * Math.sin(Math.PI * lit) }] };
  });
  return (
    <View style={styles.dot}>
      <View style={styles.dotGlow}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color, borderRadius: DOT_SIZE }, litStyle]} />
      </View>
      <Animated.View style={[styles.dotCore, { backgroundColor: color }, litStyle]} />
    </View>
  );
}

// 見た目の部品は大きさ・言葉が変わったときだけ描き直す
//
// 水面の波紋と映り込みは、泡の足元（FOOT）の水面に寝かせて描く。斜め上から見た水面なので、水面上の輪は縦に潰れた楕円に見える
// （円に近い輪にすると、立った円盤や泡の2重の輪郭に見え、泡が浮いて見えた。2026-10-05 ユーザー指摘）。
// 潰れ方は最初から形に入れて、毎コマは計算しない（泡ごとに毎コマ潰し・波紋・水の跡を動かしたら、スマホで重くなりカクついた）。
// 横幅は泡の 1.08 倍以内（はみ出すと「ここで泡が止まる」障害物の境目に見える）
// 泡の底の少し上（水に触れる所）。泡の中に置くと、泡の中に浮かぶ板に見えた
const FOOT = 0.95;
const WATER_ASPECT = 0.36;
const TILT_DEG = 3;
const TILT_SEC = 5.3;
const SWAY_PX = 3;
const SWAY_SEC = 6.1;

const WaterMarks = memo(function WaterMarks({ size }: { size: number }) {
  // 円を描いてから縦に縮める（横長の四角に角丸をつけると、楕円ではなくカプセル形になった）。変形は最初に決めた形で、毎コマは動かさない
  const ring = (k: number, dy = 0) => {
    const w = size * k;
    return { width: w, height: w, borderRadius: w / 2, left: (size - w) / 2, top: size * FOOT - w / 2 + dy, transform: [{ scaleY: WATER_ASPECT }] };
  };
  return (
    <>
      <View style={[styles.reflection, ring(0.74, size * 0.07)]} />
      <View style={[styles.ringOuter, ring(1.08)]} />
      <View style={[styles.ringInner, ring(0.86)]} />
    </>
  );
});

// 背景の動画は、親が描き直されても描き直さない。Web の VideoView は描き直すたびに読み込み先を設定し直し、
// 差し替えた直後の動画がもう一度読み込まれて止まった（空・川のループが動かなかった）
const BackgroundVideo = memo(function BackgroundVideo({ player, rect, onFirstFrame }: {
  player: VideoPlayer;
  rect: VideoRect;
  onFirstFrame: () => void;
}) {
  return (
    <VideoView
      player={player}
      style={{ position: 'absolute', left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      contentFit="cover"
      nativeControls={false}
      pointerEvents="none"
      surfaceType={VIDEO_SURFACE}
      onFirstFrameRender={onFirstFrame}
    />
  );
});

const BubbleFace = memo(function BubbleFace({ size }: { size: number }) {
  return (
    <View style={[styles.bubble, { width: size, height: size, borderRadius: size / 2 }]}>
      <LinearGradient colors={['rgba(150,190,220,0.22)', 'rgba(40,95,135,0.36)']} style={StyleSheet.absoluteFill} />
      {/* 夕日側の暖かい縁 */}
      <View style={[styles.warmRim, { borderRadius: size / 2 }]} />
      {/* 小さな光点1つだけ（大きなハイライトはNG） */}
      <View style={[styles.glint, { left: size * 0.24, top: size * 0.17, width: size * 0.07, height: size * 0.07, borderRadius: size }]} />
    </View>
  );
});

// 川を流れる泡の一覧。泡が出る・消えるたびに描き直すのはこの層だけにする。
// 以前は一覧を画面全体（Home）が持っていて、泡が出る・消える・「拾った」の表示が変わるたびに、背景・ボタン・重ねる画面まで
// 描き直していた。拾うとすぐ泡を補うようにしてから、続けて拾うと描き直しが集中してスマホでカクついた（2026-10-05）
const BubbleLayer = memo(function BubbleLayer({ P, initialItems, sim, time, rise, paused, hidden, holds, flowRate, onCapture }: {
  P: PathData;
  initialItems: ListItem[];
  sim: SharedValue<SimBubble[]>;
  time: SharedValue<number>;
  rise: SharedValue<number>;
  paused: SharedValue<boolean>;
  // 川が見えていない（拾ったことば・夜空にいる）
  hidden: SharedValue<boolean>;
  holds: SharedValue<number>;
  flowRate: SharedValue<number>;
  onCapture: (word: string, strength: number) => void;
}) {
  const [list, setList] = useState<ListItem[]>(initialItems);
  const listRef = useRef<ListItem[]>(initialItems);
  const recentRef = useRef<string[]>([]);

  useEffect(() => {
    listRef.current = list;
  }, [list]);

  const pickWord = useCallback((current: ListItem[]) => pickWordFrom(current, recentRef.current, (r) => {
    recentRef.current = r;
  }), []);

  const onSpawned = useCallback((id: number, word: string, bob: number) => {
    setList((prev) => [...prev, { id, word, bob }]);
  }, []);

  const onExited = useCallback((ids: number[]) => {
    setList((prev) => prev.filter((w) => !ids.includes(w.id)));
  }, []);

  // 毎コマ UI スレッドで流す。遷移中は止める
  useFrameCallback((fi) => {
    // 川が見えていない間は、泡の揺れ（time）も止める。止めないと、夜空などにいる間も、見えない泡の動きを毎コマ計算し続け、スマホが熱くなった（2026-10-09）
    if (hidden.get()) return;
    const dt = Math.min(0.05, (fi.timeSincePreviousFrame ?? 16) / 1000);
    time.set(time.get() + dt);
    if (paused.get()) return;
    const target = holds.get() > 0 ? HOLD_FLOW_RATE : 1;
    const rate = flowRate.get() + (target - flowRate.get()) * Math.min(1, dt / FLOW_EASE_SEC);
    flowRate.set(rate);
    const r = stepBubbles(P, sim.get(), dt * rate);
    sim.set(r.bs);
    if (r.exited.length) runOnJS(onExited)(r.exited);
  });

  // 新しい泡を出す（言葉は JS で選び、置ける場所の判定は UI スレッドで）
  useEffect(() => {
    const timer = setInterval(() => {
      if (paused.get()) return;
      // 流れがゆっくりの間は出す数も減らす（減らさないと奥に泡が溜まり、戻ったとき詰まって流れる）
      if (Math.random() > flowRate.get()) return;
      const word = pickWord(listRef.current);
      const id = nextId++;
      const bob = Math.random() * Math.PI * 2;
      runOnUI((pathData: PathData, bid: number, w: string, bb: number) => {
        'worklet';
        const c = spawnFlowing(pathData, sim.get(), bid, w.length);
        if (!c) return;
        sim.set([...sim.get(), c]);
        runOnJS(onSpawned)(bid, w, bb);
      })(P, id, word, bob);
    }, SPAWN_EVERY_MS);
    return () => clearInterval(timer);
  }, [P, sim, paused, flowRate, pickWord, onSpawned]);

  const onPressStart = useCallback((id: number) => {
    runOnUI((bid: number) => {
      'worklet';
      sim.set(sim.get().map((b) => (b.id === bid ? { ...b, pressed: true } : b)));
      holds.set(holds.get() + 1);
    })(id);
  }, [sim, holds]);

  const onPressEnd = useCallback(() => {
    runOnUI(() => {
      'worklet';
      holds.set(Math.max(0, holds.get() - 1));
    })();
  }, [holds]);

  const onLift = useCallback((id: number) => {
    runOnUI((bid: number) => {
      'worklet';
      sim.set(sim.get().map((b) => (b.id === bid ? { ...b, lifted: true } : b)));
    })(id);
  }, [sim]);

  const onRemove = useCallback((id: number) => {
    setList((prev) => prev.filter((w) => w.id !== id));
    runOnUI((bid: number) => {
      'worklet';
      sim.set(sim.get().filter((b) => b.id !== bid));
    })(id);
  }, [sim]);

  return (
    <>
      {list.map((w) => (
        <Bubble
          key={w.id}
          id={w.id}
          word={w.word}
          bob={w.bob}
          P={P}
          sim={sim}
          time={time}
          rise={rise}
          onCapture={onCapture}
          onRemove={onRemove}
          onPressStart={onPressStart}
          onPressEnd={onPressEnd}
          onLift={onLift}
        />
      ))}
    </>
  );
});

type ToastHandle = { show: (word: string) => void };

// 画面下の「「〇〇」を拾った」（1.8秒）とヒント。表示が変わっても画面全体を描き直さないよう、自分で状態を持つ
function CaptureToast({ ref }: { ref: React.Ref<ToastHandle> }) {
  const [captured, setCaptured] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useImperativeHandle(ref, () => ({
    show(word: string) {
      setCaptured(word);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCaptured(null), 1800);
    },
  }), []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return captured ? (
    <Text style={styles.capturedMsg}>「{captured}」を拾った</Text>
  ) : (
    <Text style={styles.hint}>気になる言葉をタップしてみてください</Text>
  );
}

export default function Home() {
  const { width, height } = useWindowDimensions();
  const toastRef = useRef<ToastHandle>(null);
  const addCapture = useAddCapture();

  const P = useMemo(() => buildPathData(width, height), [width, height]);

  // 起動時は約30秒流した状態を最初の描画の前に計算して、開いた瞬間から川全体に泡があるようにする（同じ worklet を JS で実行）
  const [initial] = useState(() => prewarm(buildPathData(width, height)));

  // 流れの状態は UI スレッドの sim が持つ。React は「どの泡があるか」だけ（泡が出る・消えるときだけ描き直す）
  const sim = useSharedValue<SimBubble[]>(initial.bs);
  const time = useSharedValue(0);
  const paused = useSharedValue(false);
  // 指で押さえている泡の数と、いまの流れの速さの倍率（1=ふだん）
  const holds = useSharedValue(0);
  const flowRate = useSharedValue(1);
  // 背景の曲と拾ったときの音
  const ambientRef = useRef<Ambient | null>(null);
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    const a = createAmbient();
    ambientRef.current = a;
    return () => {
      ambientRef.current = null;
      a.dispose();
    };
  }, []);
  useEffect(() => {
    ambientRef.current?.setMuted(muted);
  }, [muted]);

  const handleCapture = useCallback(
    async (word: string, strength: number) => {
      ambientRef.current?.chime(strength);
      toastRef.current?.show(word);
      try {
        await addCapture(word, strength);
      } catch {
        // エラー時は継続
      }
    },
    [addCapture],
  );

  // ---- 背景の動画と画面の段階（川 → 空へ → 空（拾ったことば）→ 川へ → 川）----
  const player = useVideoPlayer(RIVER_VIDEO, (p) => {
    p.loop = true;
    p.muted = true;
    p.timeUpdateEventInterval = TIME_UPDATE_S;
  });
  const [stage, setStage] = useState<Stage>('river');
  // 川が見えていない段階（拾ったことば・夜空と、その間の動画）。泡の揺れを止める
  const riverHidden = useSharedValue(false);
  useEffect(() => {
    riverHidden.set(stage === 'cloud' || stage === 'toNight' || stage === 'night' || stage === 'nightToCloud' || stage === 'riverToNight' || stage === 'me' || stage === 'riverToMe');
  }, [stage, riverHidden]);
  const [nightFocus, setNightFocus] = useState<string | undefined>(undefined);
  // 「振り返る」を押すと出る、行き先（夕空・星空）の選び
  const [lookBackOpen, setLookBackOpen] = useState(false);
  // 日記（5つ目の画面。設計書の名前は気づきの日記）。動画で移らず、川の上にふわっと重ねる。開いている間は川と動画を止める（重くしない）
  const [diaryOpen, setDiaryOpen] = useState(false);
  // 拾ったことばの画面は、離れるときに消え終わったら外す。外さないと、次の動画が流れている間（2〜3秒）も
  // 見えないキラキラと光のアニメーションが動き続け、動画の読み込みと重なってスマホで重かった（2026-10-05）
  const [cloudUiOn, setCloudUiOn] = useState(true);
  useEffect(() => {
    if (MUSIC_FADE_MS[stage] !== undefined) ambientRef.current?.setScene(SCENE_OF[stage], MUSIC_FADE_MS[stage]);
  }, [stage]);
  const stageRef = useRef<Stage>('river');
  const clipRef = useRef<Clip>('river');
  const loadedRef = useRef(true);
  const revealedRef = useRef(false);
  const firstFrameRef = useRef(false);
  const precoveredRef = useRef(false);
  const onFirstFrame = useCallback(() => {
    firstFrameRef.current = true;
  }, []);
  const startedRef = useRef(false);
  const leftRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // 動画の上に重ねる静止画（各動画の最初のコマと同じ絵）。最初から読み込んでおき、不透明度だけ切り替える
  const coverRiver = useSharedValue(1);
  const coverCloud = useSharedValue(0);
  const coverNight = useSharedValue(0);
  const covers: Record<Still, SharedValue<number>> = { river: coverRiver, cloud: coverCloud, night: coverNight };
  const nightUi = useSharedValue(0);
  const meUi = useSharedValue(0);
  const riverUi = useSharedValue(1);
  const cloudUi = useSharedValue(0);
  const rise = useSharedValue(0);
  const appear = useSharedValue(1);

  const later = (fn: () => void, ms: number) => {
    timersRef.current.push(setTimeout(fn, ms));
  };
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  // 再生は画面に出てから（作ったときに play しても Web では動画の要素がまだ無く、止まったままだった）
  useEffect(() => {
    player.play();
  }, [player]);

  const goStage = (s: Stage) => {
    stageRef.current = s;
    setStage(s);
  };

  // 動画を差し替える。差し替えの瞬間の動画は黒いことがあるので、次の動画の最初のコマと同じ静止画で覆っておく
  const playClip = (clip: Clip) => {
    const c = CLIPS[clip];
    (Object.keys(covers) as Still[]).forEach((k) => covers[k].set(k === c.first ? 1 : 0));
    clipRef.current = clip;
    loadedRef.current = false;
    revealedRef.current = false;
    firstFrameRef.current = false;
    precoveredRef.current = false;
    startedRef.current = false;
    setLoop(player, c.loop);
    player.replaceAsync(c.src).then(() => player.play());
    later(() => handlersRef.current.onClipStarted(clip), VIDEO_START_TIMEOUT_MS);
  };

  // 新しい動画の絵が実際に出た: 静止画を消す
  const reveal = () => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    (Object.keys(covers) as Still[]).forEach((k) => covers[k].set(withTiming(0, { duration: REVEAL_MS })));
    onClipStarted(clipRef.current);
  };

  // 動画が見え始めた（または再生できずに待ちきった）ときの演出
  const onClipStarted = (clip: Clip) => {
    if (clipRef.current !== clip || startedRef.current) return;
    if (!revealedRef.current && !player.playing) player.play();
    startedRef.current = true;
    if (clip === 'toCloud') {
      // カメラが空を見上げるのに合わせて泡は空へ昇って消える
      rise.set(withTiming(1, { duration: TRANS_RISE_MS, easing: Easing.in(Easing.quad) }));
      later(() => handlersRef.current.onClipEnd('toCloud'), CLIPS.toCloud.ms! + CLIP_END_SLACK_MS);
    } else if (clip === 'toRiver') {
      // カメラが川岸へ下りた後半、泡は元の水面から浮かび上がる
      appear.set(withDelay(BACK_SURFACE_DELAY_MS, withTiming(1, { duration: BACK_SURFACE_MS, easing: Easing.out(Easing.quad) })));
      later(() => handlersRef.current.onClipEnd('toRiver'), CLIPS.toRiver.ms! + CLIP_END_SLACK_MS);
    } else if (clip === 'toNight' || clip === 'nightToCloud') {
      later(() => handlersRef.current.onClipEnd(clip), CLIPS[clip].ms! + CLIP_END_SLACK_MS);
    }
  };

  // 遷移の動画が終わった: 次のループへ。行きの最後のコマ＝空のループの最初のコマ、帰りの最後のコマ＝川の最初のコマ
  const onClipEnd = (clip: Clip) => {
    if (clipRef.current !== clip) return;
    if (clip === 'toCloud' || clip === 'nightToCloud') {
      goStage('cloud');
      setCloudUiOn(true);
      playClip('cloud');
      cloudUi.set(withTiming(1, { duration: CLOUD_UI_IN_MS }));
    } else if (clip === 'toRiver') {
      goStage('river');
      playClip('river');
      appear.set(1);
      paused.set(false);
      riverUi.set(withTiming(1, { duration: UI_FADE_MS }));
    } else if (clip === 'toNight') {
      // 夜はループの動画が無いので、最後のコマと同じ静止画（終わり際に被せ済み）で止める
      goStage('night');
      coverNight.set(1);
      player.pause();
      nightUi.set(withTiming(1, { duration: CLOUD_UI_IN_MS }));
    }
  };

  // 拾ったことばの画面（夜空へ）から戻ってきた: 裏に回っている間に動画の描画面が捨てられているので、もう一度流し直す
  const onReturn = () => {
    if (stageRef.current === 'cloud') playClip('cloud');
  };

  // 遷移の動画の終わり際に、次のループの最初のコマ（＝遷移の最後のコマ）の静止画を被せておく
  const precover = (t: number) => {
    const c = CLIPS[clipRef.current];
    if (!revealedRef.current || precoveredRef.current || !c.last) return;
    const dur = player.duration > 0 ? player.duration : c.ms! / 1000;
    if (t < dur - PRECOVER_LEFT_S) return;
    precoveredRef.current = true;
    covers[c.last].set(withTiming(1, { duration: PRECOVER_MS }));
  };

  const handlersRef = useRef({ reveal, onClipStarted, onClipEnd, onReturn, precover });
  useEffect(() => {
    handlersRef.current = { reveal, onClipStarted, onClipEnd, onReturn, precover };
  });

  useEffect(() => {
    const subs = [
      player.addListener('sourceChange', () => {
        loadedRef.current = true;
      }),
      player.addListener('sourceLoad', () => {
        loadedRef.current = true;
      }),
      // 差し替えと同時に画面を描き直すと、動画の読み込みがもう一度走って再生の命令が打ち消される（Web で空のループが止まった）。
      // 準備ができた合図で、止まっていたら再生し直す
      player.addListener('statusChange', (e) => {
        if (e.status === 'readyToPlay' && !player.playing) player.play();
      }),
      player.addListener('timeUpdate', (e) => {
        const t = e.currentTime;
        // 差し替え直後の古い動画の再生位置で間違えないよう、新しい動画の出だしだけを見る
        if (loadedRef.current && !revealedRef.current && t < 1.5) {
          if ((firstFrameRef.current && t > REVEAL_AT_S) || t > REVEAL_FALLBACK_AT_S) handlersRef.current.reveal();
        }
        handlersRef.current.precover(t);
      }),
      player.addListener('playToEnd', () => handlersRef.current.onClipEnd(clipRef.current)),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [player]);

  useFocusEffect(
    useCallback(() => {
      if (leftRef.current) {
        leftRef.current = false;
        handlersRef.current.onReturn();
      }
      return () => {
        leftRef.current = true;
      };
    }, []),
  );

  const startTransition = () => {
    if (stageRef.current !== 'river') return;
    setLookBackOpen(false);
    goStage('toCloud');
    paused.set(true);
    rise.set(0);
    appear.set(1);
    riverUi.set(withTiming(0, { duration: UI_FADE_MS }));
    coverRiver.set(withTiming(1, { duration: COVER_IN_MS }));
    later(() => {
      if (stageRef.current === 'toCloud') playClip('toCloud');
    }, COVER_IN_MS + 20);
  };

  const backToRiver = () => {
    if (stageRef.current !== 'cloud') return;
    goStage('toRiver');
    rise.set(0);
    appear.set(0);
    cloudUi.set(withTiming(0, { duration: UI_FADE_MS }));
    later(() => setCloudUiOn(false), UI_FADE_MS + 50);
    coverCloud.set(withTiming(1, { duration: COVER_IN_MS }));
    later(() => {
      if (stageRef.current === 'toRiver') playClip('toRiver');
    }, COVER_IN_MS + 20);
  };

  // 拾ったことば → ふりかえり（夜）。画面は切り替えず、同じプレーヤーで夜への遷移を流す。
  // 言葉をタップして来たときは、その言葉を星座の中心に置く
  const goNight = (word?: string) => {
    if (stageRef.current !== 'cloud') return;
    setNightFocus(word);
    goStage('toNight');
    cloudUi.set(withTiming(0, { duration: UI_FADE_MS }));
    later(() => setCloudUiOn(false), UI_FADE_MS + 50);
    coverCloud.set(withTiming(1, { duration: COVER_IN_MS }));
    later(() => {
      if (stageRef.current === 'toNight') playClip('toNight');
    }, COVER_IN_MS + 20);
  };

  // ふりかえり（夜）→ 拾ったことば。夜の静止画のまま、行きの逆順の動画を流す
  const nightToCloud = () => {
    if (stageRef.current !== 'night') return;
    goStage('nightToCloud');
    nightUi.set(withTiming(0, { duration: UI_FADE_MS }));
    playClip('nightToCloud');
  };

  // ふりかえり（夜）→ 川。夜の静止画をフェードして、下の夕方の川の静止画を見せてから川のループへ
  const nightToRiver = () => {
    if (stageRef.current !== 'night') return;
    goStage('nightToRiver');
    rise.set(0);
    appear.set(0);
    nightUi.set(withTiming(0, { duration: UI_FADE_MS }));
    coverRiver.set(1);
    coverNight.set(withTiming(0, { duration: NIGHT_FADE_MS, easing: Easing.inOut(Easing.quad) }));
    later(() => {
      if (stageRef.current !== 'nightToRiver') return;
      goStage('river');
      playClip('river');
      appear.set(withTiming(1, { duration: BACK_SURFACE_MS, easing: Easing.out(Easing.quad) }));
      paused.set(false);
      riverUi.set(withTiming(1, { duration: UI_FADE_MS }));
    }, NIGHT_FADE_MS);
  };

  // 川 → ふりかえり（夜）。つなぐ動画が無いので、夜の静止画をふわっと重ねる（星空 → 川の逆。SPEC F. の「すぐ飛べる印」2026-10-10）
  const riverToNight = () => {
    if (stageRef.current !== 'river') return;
    setLookBackOpen(false);
    setNightFocus(undefined);
    goStage('riverToNight');
    paused.set(true);
    rise.set(0);
    riverUi.set(withTiming(0, { duration: UI_FADE_MS }));
    appear.set(withTiming(0, { duration: NIGHT_FADE_MS, easing: Easing.inOut(Easing.quad) }));
    coverNight.set(withTiming(1, { duration: NIGHT_FADE_MS, easing: Easing.inOut(Easing.quad) }));
    later(() => {
      if (stageRef.current !== 'riverToNight') return;
      goStage('night');
      player.pause();
      nightUi.set(withTiming(1, { duration: CLOUD_UI_IN_MS }));
    }, NIGHT_FADE_MS);
  };

  // 川 → わたしのこと（夜明け）。動画は使わず、夜明けの画面をふわっと重ねる（SPEC F.「川 → わたしのこと」案：0.9秒）
  const riverToMe = () => {
    if (stageRef.current !== 'river') return;
    setLookBackOpen(false);
    goStage('riverToMe');
    paused.set(true);
    rise.set(0);
    riverUi.set(withTiming(0, { duration: UI_FADE_MS }));
    appear.set(withTiming(0, { duration: NIGHT_FADE_MS, easing: Easing.inOut(Easing.quad) }));
    meUi.set(withTiming(1, { duration: NIGHT_FADE_MS, easing: Easing.inOut(Easing.quad) }));
    later(() => {
      if (stageRef.current !== 'riverToMe') return;
      goStage('me');
      player.pause();
    }, NIGHT_FADE_MS);
  };

  // わたしのこと → 川。夜明けが淡く消えて、夕方の川に戻る
  const meToRiver = () => {
    if (stageRef.current !== 'me') return;
    goStage('meToRiver');
    player.play();
    meUi.set(withTiming(0, { duration: NIGHT_FADE_MS, easing: Easing.inOut(Easing.quad) }));
    appear.set(withTiming(1, { duration: BACK_SURFACE_MS, easing: Easing.out(Easing.quad) }));
    later(() => {
      if (stageRef.current !== 'meToRiver') return;
      goStage('river');
      paused.set(false);
      riverUi.set(withTiming(1, { duration: UI_FADE_MS }));
    }, NIGHT_FADE_MS);
  };

  const openDiary = () => {
    if (stageRef.current !== 'river') return;
    setLookBackOpen(false);
    setDiaryOpen(true);
    paused.set(true);
    player.pause();
  };
  const closeDiary = () => {
    setDiaryOpen(false);
    paused.set(false);
    player.play();
  };

  const coverRiverStyle = useAnimatedStyle(() => ({ opacity: coverRiver.value }));
  const coverCloudStyle = useAnimatedStyle(() => ({ opacity: coverCloud.value }));
  const coverNightStyle = useAnimatedStyle(() => ({ opacity: coverNight.value }));
  const nightUiStyle = useAnimatedStyle(() => ({ opacity: nightUi.value }));
  const meUiStyle = useAnimatedStyle(() => ({ opacity: meUi.value }));
  // 行き: カメラが空を見上げるのに合わせて泡は空へ昇って消える。帰り: 水面から少し浮かび上がって現れる
  const riseStyle = useAnimatedStyle(() => ({
    opacity: (1 - rise.value) * appear.value,
    transform: [{ translateY: -rise.value * height * 0.6 + (1 - appear.value) * 10 }],
  }));
  const uiStyle = useAnimatedStyle(() => ({ opacity: riverUi.value }));
  const cloudUiStyle = useAnimatedStyle(() => ({ opacity: cloudUi.value }));
  const atRiver = stage === 'river';

  const { rect } = P;
  const fill = { position: 'absolute' as const, left: rect.left, top: rect.top, width: rect.width, height: rect.height };

  return (
    <View style={styles.container}>
      {/* 背景の動画（1本）。その上に、差し替えの瞬間を隠す静止画2枚 */}
      <BackgroundVideo player={player} rect={rect} onFirstFrame={onFirstFrame} />
      <Animated.Image source={RIVER_POSTER} style={[fill, coverRiverStyle]} />
      <Animated.Image source={CLOUD_BG} style={[fill, coverCloudStyle]} />
      <Animated.Image source={NIGHT_BG} style={[fill, coverNightStyle]} />
      {/* 画面下の文字が読めるよう、下端だけ少し暗く */}
      <LinearGradient
        colors={['rgba(14,30,48,0)', 'rgba(14,30,48,0.45)']}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 110, pointerEvents: 'none' }}
      />

      {/* 押させない指定は style で（props の pointerEvents は古い書き方で、効かないことがあった。夜空の右上を押すと、見えない「島（試作）」が押されて、島の画面が上に開き、夜空のボタンが全部押せなくなった 2026-10-09） */}
      {/* 月と星・行き先のメニュー・閉じるための面は、画面全体をおおう層に入れず、それぞれ直接置く（2026-10-10、ユーザー「1回目は反応するが2回目は反応しない」）。
          web では、押させない指定の 'box-none' が書けず（'auto' と同じになる）、一度 'none' にすると 'none' が残った。
          月と星は自分で押させない指定を持ち（水辺以外では押せない）、メニューと閉じる面は水辺で開いているときだけ置く */}
      {lookBackOpen && atRiver && <Pressable style={[StyleSheet.absoluteFill, { zIndex: 9 }]} onPress={() => setLookBackOpen(false)} />}
      {/* 振り返る：右上の小さな月と星（文字のボタンは景色から浮いた。ユーザー「ダサい」→ 印だけ「月と星」2026-10-10） */}
      {/* 包みは押させない（切りかえない）。押せるかどうかは中の月と星が決める。web は子の 'auto' で押せ、スマホは 'box-none' で子だけ押せる */}
      <Animated.View style={[styles.moonSpot, uiStyle, { pointerEvents: Platform.OS === 'web' ? 'none' : 'box-none' }]}>
        <LookBackMoon onPress={() => setLookBackOpen((o) => !o)} disabled={!atRiver} />
      </Animated.View>
      {/* 行き先を選ぶ（決定 2026-10-10。ユーザー「振り返るのボタン、夕空か夜空かを選べるようにしたい」） */}
      {lookBackOpen && atRiver && (
        <View style={styles.lookBackMenu}>
          <Pressable style={styles.lookBackBtn} hitSlop={6} onPress={startTransition}>
            <Text style={styles.lookBackItem}>夕空</Text>
          </Pressable>
          <Pressable style={styles.lookBackBtn} hitSlop={6} onPress={riverToNight}>
            <Text style={styles.lookBackItem}>星空</Text>
          </Pressable>
          <Pressable style={styles.lookBackBtn} hitSlop={6} onPress={riverToMe}>
            <Text style={styles.lookBackItem}>夜明け</Text>
          </Pressable>
          <Pressable style={styles.lookBackBtn} hitSlop={6} onPress={openDiary}>
            <Text style={styles.lookBackItem}>日記</Text>
          </Pressable>
        </View>
      )}

      <Animated.View style={[styles.bubbleClip, riseStyle, { pointerEvents: atRiver ? 'auto' : 'none' }]}>
        <BubbleLayer
          P={P}
          initialItems={initial.items}
          sim={sim}
          time={time}
          rise={rise}
          paused={paused}
          hidden={riverHidden}
          holds={holds}
          flowRate={flowRate}
          onCapture={handleCapture}
        />
      </Animated.View>

      <Animated.View style={[styles.uiLayer, uiStyle]} pointerEvents="none">
        <CaptureToast ref={toastRef} />
      </Animated.View>

      {/* 拾ったことば。空のループの上に重ねる（画面は切り替えない） */}
      {(stage === 'cloud' || ((stage === 'toRiver' || stage === 'toNight') && cloudUiOn)) && (
        <Animated.View style={[StyleSheet.absoluteFill, cloudUiStyle, { pointerEvents: stage === 'cloud' ? 'box-none' : 'none' }]}>
          <WordCloudOverlay width={width} height={height} onBack={backToRiver} onOpenArchive={goNight} />
        </Animated.View>
      )}

      {/* ふりかえり（夜）。夜の静止画の上に重ねる */}
      {(stage === 'night' || stage === 'nightToRiver' || stage === 'nightToCloud' || stage === 'riverToNight') && (
        <Animated.View style={[StyleSheet.absoluteFill, nightUiStyle, { pointerEvents: stage === 'night' ? 'box-none' : 'none' }]}>
          <NightOverlay width={width} height={height} focus={nightFocus} onBack={nightToCloud} onRiver={nightToRiver} />
        </Animated.View>
      )}

      {/* 夜明け（前の名前は「わたしのこと」）。背景の夜明けは画面が自分で持つ */}
      {(stage === 'me' || stage === 'riverToMe' || stage === 'meToRiver') && (
        <Animated.View style={[StyleSheet.absoluteFill, meUiStyle, { pointerEvents: stage === 'me' ? 'auto' : 'none' }]}>
          <MeOverlay width={width} height={height} onBack={meToRiver} />
        </Animated.View>
      )}

      {/* 日記。紙の画面をふわっと重ねる */}
      {diaryOpen && (
        <Animated.View entering={FadeIn.duration(350)} exiting={FadeOut.duration(250)} style={[StyleSheet.absoluteFill, { zIndex: 20 }]}>
          <DiaryOverlay width={width} height={height} onBack={closeDiary} />
        </Animated.View>
      )}

      {/* 音のオン・オフ。どの画面でも右下の同じ場所 */}
      <Pressable
        style={styles.soundBtn}
        hitSlop={12}
        onPress={() => setMuted((m) => !m)}
        accessibilityRole="button"
        accessibilityLabel={muted ? '音を出す' : '音を消す'}
      >
        <Text style={[styles.soundIcon, muted && styles.soundIconOff]}>♪</Text>
        {muted && <View style={styles.soundSlash} />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', backgroundColor: '#1e4a60' },
  bubbleClip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  uiLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 },
  bubbleWrapper: { position: 'absolute', left: 0, top: 0 },
  bubbleFront: { zIndex: 10 },
  // 光の粒の列は泡の中心に置き、transform で上へずらす
  dotsRow: {
    position: 'absolute', left: BASE / 2 - DOTS_WIDTH / 2, top: BASE / 2 - DOT_SIZE / 2, width: DOTS_WIDTH, height: DOT_SIZE,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  // 灯っていない粒: 明るい水面・空でも見えるよう、暗い芯にクリーム色の縁
  dot: {
    width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2,
    borderWidth: 1, borderColor: 'rgba(255,240,225,0.6)', backgroundColor: 'rgba(10,30,45,0.35)',
  },
  dotCore: { position: 'absolute', left: -1, top: -1, width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2 },
  // 粒の周りの淡い光（灯った粒だけ）。不透明度は包む箱で決め、灯るアニメーションの不透明度と掛け合わせる
  // 大きい（+8px・0.35）と茶色の円盤に見えて粒の輪郭がぼやけた
  dotGlow: { position: 'absolute', left: -3, top: -3, width: DOT_SIZE + 4, height: DOT_SIZE + 4, opacity: 0.22 },
  bubble: {
    borderWidth: 1.4,
    borderColor: 'rgba(255,240,225,0.78)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 1px 6px rgba(10,30,50,0.18)',
  },
  warmRim: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderTopWidth: 2.5,
    borderTopColor: 'rgba(255,200,150,0.55)',
  },
  glint: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.8)' },
  haze: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(250,200,175,0.12)' },
  // 文字は15pxで並べてから縮めるので、泡より広い箱で折り返さないようにする
  textBox: { position: 'absolute', top: 0, bottom: 0, left: -110, right: -110, alignItems: 'center', justifyContent: 'center' },
  reflection: { position: 'absolute', backgroundColor: 'rgba(255,230,205,0.07)' },
  ringInner: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,236,214,0.32)' },
  ringOuter: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,236,214,0.16)' },

  bubbleText: {
    color: '#fffaf0',
    textShadowColor: 'rgba(8,28,48,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  moonSpot: { position: 'absolute', top: 52, right: 16, zIndex: 10 },
  archiveBtn: { alignItems: 'center', justifyContent: 'center' },
  // 星の真ん中（viewBox 30×26 の (24, 7.1) を 34×30 に広げた位置）
  moonGlint: { position: 'absolute', left: 27.2 - GLINT / 2, top: 8.2 - GLINT / 2, width: GLINT, height: GLINT },
  moonHalo: { position: 'absolute', left: 17 - MOON_HALO / 2, top: 15 - MOON_HALO / 2, width: MOON_HALO, height: MOON_HALO },
  lookBackMenu: { position: 'absolute', top: 86, right: 12, alignItems: 'flex-end', gap: 4, zIndex: 10 },
  lookBackBtn: { paddingVertical: 8, paddingHorizontal: 10 },
  lookBackItem: { fontSize: 16, color: '#fff8ee', textShadowColor: 'rgba(70,25,45,0.65)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6 },
  soundBtn: { position: 'absolute', bottom: 34, right: 18, width: 28, height: 28, alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  soundIcon: { fontSize: 16, color: 'rgba(255,246,232,0.7)', textShadowColor: 'rgba(10,20,40,0.5)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 0 } },
  soundIconOff: { color: 'rgba(255,246,232,0.35)' },
  soundSlash: { position: 'absolute', width: 20, height: 1, backgroundColor: 'rgba(255,246,232,0.5)', transform: [{ rotate: '-45deg' }] },
  hint: { position: 'absolute', bottom: 40, left: 0, right: 0, textAlign: 'center', fontSize: 12, color: 'rgba(235,242,248,0.6)', zIndex: 10 },
  capturedMsg: { position: 'absolute', bottom: 40, left: 0, right: 0, textAlign: 'center', fontSize: 16, color: 'rgba(255,248,235,0.95)', zIndex: 10, fontWeight: '500' },
  ripple: {
    position: 'absolute',
    width: 60, height: 60, borderRadius: 30,
    borderWidth: 2, borderColor: 'rgba(255,210,120,0.8)',
    backgroundColor: 'rgba(255,200,100,0.08)',
  },
});
