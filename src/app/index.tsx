import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, Pressable, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence, runOnJS, Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { router } from 'expo-router';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { getRandomWords } from '../words';

const RIVER_ROWS = 7;
const SPEED = 45;
const WORD_INTERVAL = 1400;

type RiverWord = {
  id: number;
  word: string;
  row: number;
  x: number;
  bobOffset: number;
};

let nextId = Date.now();

// さざ波ライン1本
function WaveLine({ y, opacity: op, delay }: { y: number; opacity: number; delay: number }) {
  const tx = useSharedValue(0);

  useEffect(() => {
    tx.value = -60;
    tx.value = withRepeat(
      withTiming(0, { duration: 3000 + delay * 500 }),
      -1,
      false,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
  }));

  return (
    <Animated.View style={[styles.waveLine, { top: y, opacity: op }, style]} />
  );
}

// 水面の光の反射
function WaterSheen({ width, height }: { width: number; height: number }) {
  const sheens = [
    { top: height * 0.22, left: width * 0.1, w: width * 0.3, rot: '-8deg', op: 0.04 },
    { top: height * 0.38, left: width * 0.5, w: width * 0.2, rot: '5deg', op: 0.03 },
    { top: height * 0.55, left: width * 0.2, w: width * 0.25, rot: '-4deg', op: 0.035 },
    { top: height * 0.7, left: width * 0.6, w: width * 0.28, rot: '10deg', op: 0.025 },
  ];
  return (
    <>
      {sheens.map((s, i) => (
        <View
          key={`sheen-${i}`}
          style={{
            position: 'absolute',
            top: s.top, left: s.left,
            width: s.w, height: 2,
            backgroundColor: `rgba(180,230,255,${s.op * 10})`,
            borderRadius: 1,
            transform: [{ rotate: s.rot }],
            opacity: s.op * 10,
          }}
        />
      ))}
    </>
  );
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
  bobOffset,
  onCapture,
  onRemove,
}: {
  word: string;
  x: number;
  y: number;
  bobOffset: number;
  onCapture: (word: string, strength: number) => void;
  onRemove: () => void;
}) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const translateY = useSharedValue(0);
  const chargeScale = useSharedValue(0);
  const chargeOpacity = useSharedValue(0);
  const pressStart = useRef<number>(0);
  const [rippling, setRippling] = useState(false);

  // ゆらゆらボブ（位相をbobOffsetでずらす）
  const bobY = useSharedValue(0);
  useEffect(() => {
    const amp = 5;
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

  const startPress = () => {
    pressStart.current = Date.now();
    chargeScale.value = 0;
    chargeOpacity.value = withTiming(0.8, { duration: 200 });
    chargeScale.value = withTiming(1, { duration: CHARGE_MAX });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const endPress = () => {
    const elapsed = Date.now() - pressStart.current;
    const strength = elapsed < 200 ? 0.1 : Math.min(elapsed / CHARGE_MAX, 1);
    chargeOpacity.value = withTiming(0, { duration: 300 });
    setRippling(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    scale.value = withTiming(1.1, { duration: 1200 });
    translateY.value = withTiming(-120, { duration: 1200, easing: Easing.in(Easing.quad) });
    opacity.value = withTiming(0, { duration: 1200, easing: Easing.in(Easing.quad) }, () => {
      runOnJS(onRemove)();
    });
    runOnJS(onCapture)(word, strength);
  };

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateY: translateY.value + bobY.value },
    ],
    opacity: opacity.value,
  }));

  const chargeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.8 + chargeScale.value * 1.4 }],
    opacity: chargeOpacity.value,
    borderColor: `rgba(255,${Math.round(200 - chargeScale.value * 80)},${Math.round(120 - chargeScale.value * 80)},0.9)`,
  }));

  return (
    <Pressable
      style={[styles.bubbleWrapper, { left: x, top: y - 20 }]}
      onPressIn={startPress}
      onPressOut={endPress}
    >
      <Animated.View style={animStyle}>
        <View style={styles.bubble}>
          <Text style={styles.bubbleText} numberOfLines={1}>{word}</Text>
          <Animated.View style={[styles.chargeRing, chargeStyle]} />
          {rippling && <Ripple />}
        </View>
      </Animated.View>
    </Pressable>
  );
}

export default function Home() {
  const { width, height } = useWindowDimensions();
  const [words, setWords] = useState<RiverWord[]>([]);
  const [captured, setCaptured] = useState<string | null>(null);
  const captureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usedRowsRef = useRef<number[]>([]);
  const usedWordsRef = useRef<string[]>([]);
  const addCapture = useMutation(api.captures.add);

  // さざ波ラインのY位置（画面を均等に分割）
  const waveLines = Array.from({ length: 6 }, (_, i) => ({
    y: height * (0.2 + i * 0.12),
    opacity: 0.06 - i * 0.005,
    delay: i,
  }));

  const rowY = useCallback(
    (row: number) => {
      const topPad = height * 0.18;
      const bottomPad = height * 0.15;
      const usable = height - topPad - bottomPad;
      return topPad + (row / (RIVER_ROWS - 1)) * usable;
    },
    [height]
  );

  const rowSpeed = useCallback((row: number) => {
    const center = (RIVER_ROWS - 1) / 2;
    const dist = Math.abs(row - center) / center;
    return SPEED * (1 - dist * 0.35);
  }, []);

  useEffect(() => {
    const spawn = () => {
      let word = getRandomWords(1)[0];
      let tries = 0;
      while (usedWordsRef.current.includes(word) && tries < 10) {
        word = getRandomWords(1)[0];
        tries++;
      }
      usedWordsRef.current = [...usedWordsRef.current.slice(-3), word];
      const available = Array.from({ length: RIVER_ROWS }, (_, i) => i).filter(
        (r) => !usedRowsRef.current.includes(r)
      );
      const row = available[Math.floor(Math.random() * available.length)] ?? 0;
      usedRowsRef.current = [...usedRowsRef.current.slice(-2), row];
      setWords((prev) => [
        ...prev,
        { id: nextId++, word, row, x: width + 180, bobOffset: Math.random() * Math.PI * 2 },
      ]);
    };
    spawn();
    const timer = setInterval(spawn, WORD_INTERVAL);
    return () => clearInterval(timer);
  }, [width]);

  useEffect(() => {
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const dt = (now - last) / 1000;
      last = now;
      setWords((prev) =>
        prev.map((w) => ({ ...w, x: w.x - rowSpeed(w.row) * dt })).filter((w) => w.x > -200)
      );
    }, 60);
    return () => clearInterval(timer);
  }, [rowSpeed]);

  const handleCapture = useCallback(
    async (word: string, strength: number) => {
      setCaptured(word);
      if (captureTimer.current) clearTimeout(captureTimer.current);
      captureTimer.current = setTimeout(() => setCaptured(null), 1800);
      try {
        await addCapture({ word, strength });
      } catch {
        // 未ログイン時は継続
      }
    },
    [addCapture]
  );

  return (
    // 川底の深さ感: 上が暗い深層、下に向かって少し明るい浅瀬
    <LinearGradient
      colors={['#020d14', '#041824', '#062230', '#082c3c', '#0a3346']}
      locations={[0, 0.2, 0.5, 0.75, 1]}
      style={styles.container}
    >
      {/* 水面の光の反射 */}
      <WaterSheen width={width} height={height} />

      {/* さざ波ライン */}
      {waveLines.map((line, i) => (
        <WaveLine key={`wave-${i}`} y={line.y} opacity={line.opacity} delay={line.delay} />
      ))}

      <Text style={styles.wordmark}>pukapuka</Text>
      <Pressable style={styles.archiveBtn} onPress={() => router.push('/archive' as never)}>
        <Text style={styles.archiveBtnText}>振り返る</Text>
      </Pressable>

      {words.map((w) => (
        <Bubble
          key={w.id}
          word={w.word}
          x={w.x}
          y={rowY(w.row)}
          bobOffset={w.bobOffset}
          onCapture={handleCapture}
          onRemove={() => setWords((prev) => prev.filter((p) => p.id !== w.id))}
        />
      ))}

      {captured ? (
        <Text style={styles.capturedMsg}>「{captured}」を拾った</Text>
      ) : (
        <Text style={styles.hint}>気になる言葉をタップしてみてください</Text>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  waveLine: {
    position: 'absolute',
    left: -60,
    right: -60,
    height: 1,
    backgroundColor: 'rgba(140,210,240,1)',
    borderRadius: 1,
  },
  bubbleWrapper: { position: 'absolute' },
  bubble: {
    backgroundColor: 'rgba(80,170,210,0.10)',
    borderRadius: 24, borderWidth: 1, borderColor: 'rgba(140,210,240,0.25)',
    paddingHorizontal: 16, paddingVertical: 10, maxWidth: 160,
    overflow: 'visible', alignItems: 'center', justifyContent: 'center',
  },
  bubbleText: { color: '#c8e8f5', fontSize: 15 },
  wordmark: { position: 'absolute', top: 56, left: 20, fontSize: 20, fontStyle: 'italic', color: 'rgba(180,225,245,0.7)', zIndex: 10 },
  archiveBtn: { position: 'absolute', top: 56, right: 20, zIndex: 10 },
  archiveBtnText: { fontSize: 14, color: 'rgba(180,225,245,0.4)' },
  hint: { position: 'absolute', bottom: 48, left: 0, right: 0, textAlign: 'center', fontSize: 12, color: 'rgba(140,200,225,0.35)', zIndex: 10 },
  capturedMsg: { position: 'absolute', bottom: 48, left: 0, right: 0, textAlign: 'center', fontSize: 16, color: 'rgba(200,240,255,0.9)', zIndex: 10, fontWeight: '500' },
  chargeRing: {
    position: 'absolute',
    width: 70, height: 70, borderRadius: 35,
    borderWidth: 2, borderColor: 'rgba(255,200,120,0.9)',
    backgroundColor: 'transparent',
  },
  ripple: {
    position: 'absolute',
    width: 60, height: 60, borderRadius: 30,
    borderWidth: 2, borderColor: 'rgba(255,210,120,0.8)',
    backgroundColor: 'rgba(255,200,100,0.08)',
  },
});
