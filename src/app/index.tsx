import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, Pressable, Image, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle, useAnimatedProps, withTiming, withRepeat, withSequence, runOnJS, Easing,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useVideoPlayer, VideoView } from 'expo-video';

import { router } from 'expo-router';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { getRandomWords } from '../words';
import { WordsContext, RiverWord } from '../context/WordsContext';
import { buildRiverPath, bubbleSize, bubbleFontSize, PathPoint } from '../riverPath';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RIVER_VIDEO = require('../../assets/video/river_bg.mp4');
const RIVER_POSTER = require('../../assets/video/river_bg_poster.jpg');

// 流れの速さ（px/秒）。遠近は泡の大きさで出し、速さは奥でも手前の9割（奥で詰まらないように）
const SPEED_NEAR = 32;
const SPEED_FAR_RATIO = 0.9;
// 泡は奥〜中ほど（川筋の最初の250px）の水面から「ぷかっ」と浮かび上がる。奥の狭いS字だけから出すと一列に詰まり6個しか流れない
const SPAWN_S_MAX = 250;
const SPAWN_MARGIN = 1.25;
const SURFACE_SEC = 1.2;
const SPAWN_CHECK_MS = 250;
const TICK_MS = 50;
// 泡が横に並ぶ位置（川幅の半分に対する割合）。奥では川幅が狭いので自然に一列になる
const LANES = [-0.42, 0.42, 0, -0.22, 0.22];
// 画面下のヒント文の手前で泡を消す
const BOTTOM_UI = 60;

let nextId = Date.now();

type Placed = { w: RiverWord; p: PathPoint; x: number; y: number; size: number };

function place(w: RiverWord, at: (s: number) => PathPoint): Placed {
  const p = at(w.s);
  const size = bubbleSize(p, w.word.length);
  // 奥のS字は川がほぼ横向きで、横にずらすと岸に乗るので、奥ほど中心線に寄せる
  return { w, p, x: p.x + w.lane * p.halfw * (0.3 + 0.7 * p.t), y: p.y, size };
}

function clashes(a: Placed, b: Placed): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < ((a.size + b.size) / 2) * 1.04;
}

function Ripple() {
  const scale = useSharedValue(0.3);
  const opacity = useSharedValue(0.9);

  useEffect(() => {
    scale.value = withTiming(3, { duration: 600 });
    opacity.value = withTiming(0, { duration: 600 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return <Animated.View style={[styles.ripple, style]} />;
}

function Bubble({
  word,
  x,
  y,
  size,
  depth,
  opacity: baseOpacity,
  onCapture,
  onRemove,
  onPressStart,
  onPressEnd,
}: {
  word: string;
  x: number;
  y: number;
  size: number;
  depth: number; // 0=奥 1=手前
  opacity: number;
  onCapture: (word: string, strength: number) => void;
  onRemove: () => void;
  onPressStart: () => void;
  onPressEnd: () => void;
}) {
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
  const [rippling, setRippling] = useState(false);

  // ぷかぷか上下
  const bobY = useSharedValue(0);
  useEffect(() => {
    const amp = 3;
    const period = 2800;
    bobY.value = withRepeat(
      withSequence(
        withTiming(amp, { duration: period / 2, easing: Easing.inOut(Easing.sin) }),
        withTiming(-amp, { duration: period / 2, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const CHARGE_MAX = 2000;

  const startPress = (touchX?: number, touchY?: number) => {
    pressStart.current = Date.now();
    if (touchX !== undefined) touchStartX.current = touchX;
    if (touchY !== undefined) touchStartY.current = touchY;
    dragX.value = 0;
    dragY.value = 0;
    chargeScale.value = 0;
    chargeOpacity.value = withTiming(0.8, { duration: 200 });
    chargeScale.value = withTiming(1, { duration: CHARGE_MAX });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPressStart();
  };

  const endPress = () => {
    if (pressStart.current === 0) return;
    const elapsed = Date.now() - pressStart.current;
    pressStart.current = 0;
    const strength = elapsed < 200 ? 0.1 : Math.min(elapsed / CHARGE_MAX, 1);
    onPressEnd();
    chargeOpacity.value = withTiming(0, { duration: 300 });
    setRippling(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    scale.value = withTiming(1.1, { duration: 1400 });
    translateY.value = withTiming(-180, { duration: 1400, easing: Easing.in(Easing.quad) });
    opacity.value = withTiming(0, { duration: 1400, easing: Easing.in(Easing.quad) }, () => {
      runOnJS(onRemove)();
    });
    runOnJS(onCapture)(word, strength);
  };

  const handleTouchMove = (event: any) => {
    if (pressStart.current === 0) return;
    const touch = event.nativeEvent.touches[0];
    if (touch) {
      dragX.value = touch.pageX - touchStartX.current;
      dragY.value = touch.pageY - touchStartY.current;
    }
  };

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: dragX.value },
      { translateY: translateY.value + bobY.value + dragY.value },
    ],
    opacity: opacity.value,
  }));
  // 水面の波紋と映り込みは水に残る（上下しない）
  const waterStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const RING_PADDING = 11;
  const ringSize = size + RING_PADDING * 2;
  const ringRadius = ringSize / 2 - 3;
  const circumference = 2 * Math.PI * ringRadius;

  const svgContainerStyle = useAnimatedStyle(() => ({
    opacity: chargeOpacity.value,
  }));

  const animatedCircleProps = useAnimatedProps(() => {
    const progress = chargeScale.value;
    const offset = circumference * (1 - progress);
    const g = Math.round(200 - progress * 80);
    const b = Math.round(100 - progress * 60);
    const a = 0.7 + progress * 0.2;
    return {
      strokeDashoffset: offset,
      stroke: `rgba(255,${g},${b},${a})`,
    };
  });

  const fontSize = bubbleFontSize(size, word.length);
  const haze = 0.12 * (1 - depth);

  return (
    <View
      style={[styles.bubbleWrapper, { left: x - size / 2, top: y - size / 2, width: size, height: size, opacity: baseOpacity }]}
      onTouchStart={(e) => startPress(e.nativeEvent.touches[0]?.pageX, e.nativeEvent.touches[0]?.pageY)}
      onTouchMove={handleTouchMove}
      onTouchEnd={endPress}
      onTouchCancel={endPress}
    >
      {/* 水との接点: 淡い映り込みと2重の波紋 */}
      <Animated.View pointerEvents="none" style={[waterStyle, StyleSheet.absoluteFill]}>
        <View style={[styles.reflection, { width: size, height: size * 0.5, left: 0, top: size * 0.8, borderRadius: size }]} />
        <View style={[styles.ringOuter, { width: size * 1.6, height: size * 0.4, left: -size * 0.3, top: size * 0.76, borderRadius: size }]} />
        <View style={[styles.ringInner, { width: size * 1.25, height: size * 0.3, left: -size * 0.125, top: size * 0.8, borderRadius: size }]} />
      </Animated.View>

      <Animated.View style={[bodyStyle, { width: size, height: size }]}>
        {/* 長押しのチャージリング */}
        <Animated.View style={[svgContainerStyle, {
          position: 'absolute',
          top: -RING_PADDING,
          left: -RING_PADDING,
          width: ringSize,
          height: ringSize,
        }]}>
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
        {rippling && <Ripple />}
        <View style={[styles.bubble, { width: size, height: size, borderRadius: size / 2 }]}>
          <LinearGradient
            colors={['rgba(150,190,220,0.22)', 'rgba(40,95,135,0.36)']}
            style={StyleSheet.absoluteFill}
          />
          {haze > 0.005 && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(250,200,175,${haze.toFixed(3)})` }]} />
          )}
          {/* 夕日側の暖かい縁 */}
          <View style={[styles.warmRim, { borderRadius: size / 2 }]} />
          {/* 小さな光点1つだけ（大きなハイライトはNG） */}
          <View style={[styles.glint, { left: size * 0.24, top: size * 0.17, width: size * 0.07, height: size * 0.07, borderRadius: size }]} />
          <Text style={[styles.bubbleText, { fontSize }]}>{word}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

export default function Home() {
  const { width, height } = useWindowDimensions();
  const { words, setWords } = useContext(WordsContext);
  const [captured, setCaptured] = useState<string | null>(null);
  const captureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usedWordsRef = useRef<string[]>([]);
  const wordsRef = useRef<RiverWord[]>([]);
  const addCapture = useMutation(api.captures.add);

  const path = useMemo(() => buildRiverPath(width, height), [width, height]);
  // 手前（画面の高さ85%付近）の川幅を速さの基準にする
  const refHalfw = useMemo(() => {
    let best = path.at(0);
    for (let s = 0; s <= path.length; s += 4) {
      const p = path.at(s);
      if (Math.abs(p.y - height * 0.85) < Math.abs(best.y - height * 0.85)) best = p;
    }
    return best.halfw;
  }, [path, height]);

  const player = useVideoPlayer(RIVER_VIDEO, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  useEffect(() => {
    wordsRef.current = words;
  }, [words]);

  // 奥（川の曲がり角）から泡を出す。重ならない場所が空いたときだけ
  const trySpawn = useCallback((ws: RiverWord[]): RiverWord[] | null => {
    let word = getRandomWords(1)[0];
    let tries = 0;
    while ((usedWordsRef.current.includes(word) || ws.some((w) => w.word === word)) && tries < 10) {
      word = getRandomWords(1)[0];
      tries++;
    }
    const placed = ws.map((w) => place(w, path.at));
    const lanes = [...LANES].sort(() => Math.random() - 0.5);
    for (const lane of lanes) {
      const cand: RiverWord = { id: nextId++, word, s: Math.random() * SPAWN_S_MAX, lane, age: 0, bobOffset: Math.random() * Math.PI * 2 };
      const c = place(cand, path.at);
      if (!placed.some((o) => Math.hypot(o.x - c.x, o.y - c.y) < ((o.size + c.size) / 2) * SPAWN_MARGIN)) {
        usedWordsRef.current = [...usedWordsRef.current.slice(-4), word];
        return [...ws, cand];
      }
    }
    return null;
  }, [path]);

  // 川筋に沿って流す。速さは川幅に比例（奥ほどゆっくり＝遠近）。前の泡にぶつかる所へは進まない
  const advance = useCallback((ws: RiverWord[], dt: number): RiverWord[] => {
    const ordered = [...ws].sort((a, b) => b.s - a.s); // 前（手前）の泡から動かす
    const done: Placed[] = [];
    const out: RiverWord[] = [];
    for (const w of ordered) {
      let next = { ...w, age: w.age + dt };
      if (!w.isPressed) {
        const p = path.at(w.s);
        const v = SPEED_NEAR * Math.min(1.15, Math.max(SPEED_FAR_RATIO, p.halfw / refHalfw));
        const moved = { ...next, s: w.s + v * dt };
        const mp = place(moved, path.at);
        if (!done.some((o) => clashes(o, mp))) next = moved;
      }
      const np = place(next, path.at);
      if (next.s >= path.length || np.y - np.size / 2 >= height) continue;
      done.push(np);
      out.push(next);
    }
    return out;
  }, [path, refHalfw, height]);

  // 起動時は約30秒流した状態を先に計算して、開いた瞬間から川全体に泡があるようにする
  useEffect(() => {
    if (wordsRef.current.length > 0) return;
    let ws: RiverWord[] = [];
    const dt = TICK_MS / 1000;
    const spawnEvery = Math.round(SPAWN_CHECK_MS / TICK_MS);
    for (let i = 0; i < 600; i++) {
      if (i % spawnEvery === 0) ws = trySpawn(ws) ?? ws;
      ws = advance(ws, dt);
    }
    wordsRef.current = ws;
    setWords(ws);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    const timer = setInterval(() => {
      setWords((prev) => {
        const next = trySpawn(prev);
        if (!next) return prev;
        wordsRef.current = next;
        return next;
      });
    }, SPAWN_CHECK_MS);
    return () => clearInterval(timer);
  }, [trySpawn, setWords]);

  useEffect(() => {
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const dt = Math.min(0.2, (now - last) / 1000);
      last = now;
      setWords((prev) => {
        const updated = advance(prev, dt);
        wordsRef.current = updated;
        return updated;
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [advance, setWords]);

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
    [addCapture]
  );

  const { rect } = path;

  return (
    <View style={styles.container}>
      {/* 背景: Blender で作った4秒ループの川（読み込み中は1コマ目の静止画） */}
      <Image source={RIVER_POSTER} style={{ position: 'absolute', left: rect.left, top: rect.top, width: rect.width, height: rect.height }} />
      <VideoView
        player={player}
        style={{ position: 'absolute', left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        contentFit="cover"
        nativeControls={false}
        pointerEvents="none"
      />
      {/* 画面下の文字が読めるよう、下端だけ少し暗く */}
      <LinearGradient
        colors={['rgba(14,30,48,0)', 'rgba(14,30,48,0.45)']}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 110, pointerEvents: 'none' }}
      />

      <Text style={styles.wordmark}>pukapuka</Text>
      <Pressable style={styles.archiveBtn} onPress={() => router.push('/archive' as never)}>
        <Text style={styles.archiveBtnText}>振り返る</Text>
      </Pressable>

      <View style={styles.bubbleClip}>
        {words
          .map((w) => place(w, path.at))
          .sort((a, b) => a.y - b.y) // 奥の泡を先に描き、手前の泡を上に重ねる
          .map(({ w, p, x, y, size }) => {
            const fadeIn = Math.min(1, w.age / SURFACE_SEC);
            // 泡の下の方がヒント文に近づいたら消える（中心で判定すると大きな泡が文字に重なる）
            const fadeOut = Math.min(1, Math.max(0, (height - BOTTOM_UI - (y + size * 0.35)) / 60));
            const depthOpacity = 0.8 + 0.2 * p.t;
            return (
              <Bubble
                key={w.id}
                word={w.word}
                x={x}
                y={y}
                size={size}
                depth={p.t}
                opacity={depthOpacity * Math.min(fadeIn, fadeOut)}
                onCapture={handleCapture}
                onRemove={() => setWords((prev) => prev.filter((q) => q.id !== w.id))}
                onPressStart={() => setWords((prev) => prev.map((q) => q.id === w.id ? { ...q, isPressed: true } : q))}
                onPressEnd={() => setWords((prev) => prev.map((q) => q.id === w.id ? { ...q, isPressed: false } : q))}
              />
            );
          })}
      </View>

      {captured ? (
        <Text style={styles.capturedMsg}>「{captured}」を拾った</Text>
      ) : (
        <Text style={styles.hint}>気になる言葉をタップしてみてください</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', backgroundColor: '#1e4a60' },
  bubbleClip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  bubbleWrapper: { position: 'absolute' },
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
  reflection: { position: 'absolute', backgroundColor: 'rgba(255,226,196,0.05)' },
  ringInner: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,236,214,0.38)' },
  ringOuter: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,236,214,0.16)' },
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
