import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, Pressable, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle, useAnimatedProps, useFrameCallback, withTiming, withDelay, runOnJS, runOnUI, Easing,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';

import { useFocusEffect } from 'expo-router';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { getRandomWords } from '../words';
import WordCloudOverlay from '../components/WordCloudOverlay';
import NightOverlay from '../components/NightOverlay';
import { buildPathData, placeBubble, spawnBubble, stepBubbles, type PathData, type SimBubble } from '../riverFlow';
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
type Stage = Clip | 'night' | 'nightToRiver';
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
// いきなり変えると止まったように見えるので、FLOW_EASE_SEC 秒くらいかけてなめらかに落とす・戻す
const HOLD_FLOW_RATE = 0.3;
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
    const c = spawnBubble(P, bs, nextId++, word.length);
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
  const pressStart = useRef<number>(0);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const liftedRef = useRef(false);
  const [rippling, setRippling] = useState(false);
  // 長押しのリング（SVG）は押している間だけ描く
  const [charging, setCharging] = useState(false);

  // 位置・大きさ・透明度は UI スレッドで毎コマ、流れの計算結果（sim）から決める
  const posStyle = useAnimatedStyle(() => {
    const b = findBubble(sim.value, id);
    if (!b) return { opacity: 0 };
    const pl = placeBubble(P, b);
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
    pressStart.current = Date.now();
    if (touchX !== undefined) touchStartX.current = touchX;
    if (touchY !== undefined) touchStartY.current = touchY;
    dragX.set(0);
    dragY.set(0);
    liftedRef.current = false;
    chargeScale.set(0);
    chargeOpacity.set(withTiming(0.8, { duration: 200 }));
    chargeScale.set(withTiming(1, { duration: CHARGE_MAX }));
    setCharging(true);
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
    onPressEnd();
    const strength = elapsed < 200 ? 0.1 : Math.min(elapsed / CHARGE_MAX, 1);
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
    const s = b ? placeBubble(P, b).size / base : 1;
    return {
      transform: [
        { scale: scale.value },
        { translateX: dragX.value / s },
        // ぷかぷか上下 ±3px・周期2.8秒（全体共通の時計に泡ごとの位相）
        { translateY: (translateY.value + 3 * Math.sin((2 * Math.PI * time.value) / 2.8 + bob) + dragY.value) / s },
      ],
      opacity: opacity.value,
    };
  });
  // 文字は拡大・縮小を打ち消して、今までどおり泡の大きさに応じた 10〜15px にする
  const textStyle = useAnimatedStyle(() => {
    const b = findBubble(sim.value, id);
    if (!b) return {};
    const size = placeBubble(P, b).size;
    const font = Math.max(10, Math.min(15, (size * 0.8) / word.length));
    return { transform: [{ scale: font / TEXT_BASE / (size / base) }] };
  });
  // 奥の泡ほど夕日のもやがかかる
  const hazeStyle = useAnimatedStyle(() => {
    const b = findBubble(sim.value, id);
    return { opacity: b ? 1 - placeBubble(P, b).t : 0 };
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
      style={[styles.bubbleWrapper, { width: base, height: base }, posStyle]}
      onTouchStart={(e) => startPress(e.nativeEvent.touches[0]?.pageX, e.nativeEvent.touches[0]?.pageY)}
      onTouchMove={handleTouchMove}
      onTouchEnd={endPress}
      onTouchCancel={endPress}
    >
      {/* 水との接点: 淡い映り込みと2重の波紋 */}
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
        <BubbleFace size={base} />
        <Animated.View pointerEvents="none" style={[styles.haze, { borderRadius: base / 2 }, hazeStyle]} />
        <View pointerEvents="none" style={styles.textBox}>
          <Animated.Text style={[styles.bubbleText, { fontSize: TEXT_BASE }, textStyle]}>{word}</Animated.Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
});

// 見た目の部品は大きさ・言葉が変わったときだけ描き直す
//
// 水面の波紋は円に近づける。横長の楕円（幅:高さ = 4:1 程度）にすると「泡の下の筋」のように見え、
// さらに泡より外にはみ出すので「ここで泡が止まる場所」= 障害物の境目に見える。
// 直径を泡の 1.1 倍以内に収めて、泡の足元だけ見せる
const WaterMarks = memo(function WaterMarks({ size }: { size: number }) {
  return (
    <>
      <View style={[styles.reflection, { width: size * 0.72, height: size * 0.5, left: size * 0.14, top: size * 0.8, borderRadius: size }]} />
      <View style={[styles.ringOuter, { width: size * 1.1, height: size * 0.98, left: -size * 0.05, top: size * 0.35, borderRadius: size }]} />
      <View style={[styles.ringInner, { width: size * 0.84, height: size * 0.74, left: size * 0.08, top: size * 0.49, borderRadius: size }]} />
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

export default function Home() {
  const { width, height } = useWindowDimensions();
  const [captured, setCaptured] = useState<string | null>(null);
  const captureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addCapture = useMutation(api.captures.add);

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
  const [list, setList] = useState<ListItem[]>(initial.items);
  const listRef = useRef<ListItem[]>(initial.items);
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
        const c = spawnBubble(pathData, sim.get(), bid, w.length);
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

  const handleCapture = useCallback(
    async (word: string, strength: number) => {
      setCaptured(word);
      if (captureTimer.current) clearTimeout(captureTimer.current);
      captureTimer.current = setTimeout(() => setCaptured(null), 1800);
      try {
        await addCapture({ word, strength });
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

  // 拾ったことばの画面（つながりを見る）から戻ってきた: 裏に回っている間に動画の描画面が捨てられているので、もう一度流し直す
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
    coverCloud.set(withTiming(1, { duration: COVER_IN_MS }));
    later(() => {
      if (stageRef.current === 'toRiver') playClip('toRiver');
    }, COVER_IN_MS + 20);
  };

  // 拾ったことば → ふりかえり（夜）。画面は切り替えず、同じプレーヤーで夜への遷移を流す
  // TODO(星座): タップした言葉（word）を、ふりかえりの中心の星にする
  const goNight = () => {
    if (stageRef.current !== 'cloud') return;
    goStage('toNight');
    cloudUi.set(withTiming(0, { duration: UI_FADE_MS }));
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

  const coverRiverStyle = useAnimatedStyle(() => ({ opacity: coverRiver.value }));
  const coverCloudStyle = useAnimatedStyle(() => ({ opacity: coverCloud.value }));
  const coverNightStyle = useAnimatedStyle(() => ({ opacity: coverNight.value }));
  const nightUiStyle = useAnimatedStyle(() => ({ opacity: nightUi.value }));
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

      <Animated.View style={[styles.uiLayer, uiStyle]} pointerEvents={atRiver ? 'box-none' : 'none'}>
        <Text style={styles.wordmark}>pukapuka</Text>
        <Pressable style={styles.archiveBtn} hitSlop={16} onPress={startTransition}>
          <Text style={styles.archiveBtnText}>振り返る</Text>
        </Pressable>
      </Animated.View>

      <Animated.View style={[styles.bubbleClip, riseStyle]} pointerEvents={atRiver ? 'auto' : 'none'}>
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
            onCapture={handleCapture}
            onRemove={onRemove}
            onPressStart={onPressStart}
            onPressEnd={onPressEnd}
            onLift={onLift}
          />
        ))}
      </Animated.View>

      <Animated.View style={[styles.uiLayer, uiStyle]} pointerEvents="none">
        {captured ? (
          <Text style={styles.capturedMsg}>「{captured}」を拾った</Text>
        ) : (
          <Text style={styles.hint}>気になる言葉をタップしてみてください</Text>
        )}
      </Animated.View>

      {/* 拾ったことば。空のループの上に重ねる（画面は切り替えない） */}
      {(stage === 'cloud' || stage === 'toRiver' || stage === 'toNight') && (
        <Animated.View style={[StyleSheet.absoluteFill, cloudUiStyle]} pointerEvents={stage === 'cloud' ? 'box-none' : 'none'}>
          <WordCloudOverlay width={width} height={height} onBack={backToRiver} onOpenArchive={goNight} />
        </Animated.View>
      )}

      {/* ふりかえり（夜）。夜の静止画の上に重ねる */}
      {(stage === 'night' || stage === 'nightToRiver' || stage === 'nightToCloud') && (
        <Animated.View style={[StyleSheet.absoluteFill, nightUiStyle]} pointerEvents={stage === 'night' ? 'box-none' : 'none'}>
          <NightOverlay onBack={nightToCloud} onRiver={nightToRiver} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', backgroundColor: '#1e4a60' },
  bubbleClip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  uiLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 },
  bubbleWrapper: { position: 'absolute', left: 0, top: 0 },
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
  reflection: { position: 'absolute', backgroundColor: 'rgba(255,226,196,0.05)' },
  ringInner: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,236,214,0.30)' },
  ringOuter: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,236,214,0.14)' },
  bubbleText: {
    color: '#fffaf0',
    textShadowColor: 'rgba(8,28,48,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  wordmark: { position: 'absolute', top: 56, left: 20, fontSize: 20, fontStyle: 'italic', color: 'rgba(255,246,232,0.85)', textShadowColor: 'rgba(120,60,40,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4, zIndex: 10 },
  archiveBtn: { position: 'absolute', top: 56, right: 20, zIndex: 10 },
  archiveBtnText: { fontSize: 14, color: 'rgba(255,246,232,0.7)', textShadowColor: 'rgba(120,60,40,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  hint: { position: 'absolute', bottom: 40, left: 0, right: 0, textAlign: 'center', fontSize: 12, color: 'rgba(235,242,248,0.6)', zIndex: 10 },
  capturedMsg: { position: 'absolute', bottom: 40, left: 0, right: 0, textAlign: 'center', fontSize: 16, color: 'rgba(255,248,235,0.95)', zIndex: 10, fontWeight: '500' },
  ripple: {
    position: 'absolute',
    width: 60, height: 60, borderRadius: 30,
    borderWidth: 2, borderColor: 'rgba(255,210,120,0.8)',
    backgroundColor: 'rgba(255,200,100,0.08)',
  },
});
