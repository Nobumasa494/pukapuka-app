import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import Island3D, { EL_MAX, EL_MIN, distLimits, makeRig } from '../components/Island3D';
import { STAGES, capturesUntil, layoutIsland, makeIslandSample } from '../islandLayout';

// 島（朝）の3D試作（2026-10-05）。仮のデータで、使い始めてからの4つの時期の島を見比べる。
// 指1本で回る、2本指でつまんで寄る・離れる、地面に触れるとそこへ歩いて近づく、植物に触れると言葉が出る。2回触れると全体に戻る

const SAMPLE = makeIslandSample(Date.now());
const LABEL_W = 160;

export default function IslandScreen() {
  const { width, height } = useWindowDimensions();
  const [stage, setStage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  // 操作の説明は、一度でも触ったら消す（景色の上に文字を出しっぱなしにしない）
  const [touched, setTouched] = useState(false);
  const touchedRef = useRef(false);
  const layout = useMemo(() => layoutIsland(capturesUntil(SAMPLE, STAGES[stage].days)), [stage]);
  const rig = useRef(makeRig()).current;
  const labelX = useSharedValue(0);
  const labelY = useSharedValue(0);
  const labelOn = useSharedValue(0);

  const gesture = useMemo(() => {
    const touch = () => {
      if (!touchedRef.current) {
        touchedRef.current = true;
        setTouched(true);
      }
    };
    const pan = Gesture.Pan()
      .runOnJS(true)
      .maxPointers(1)
      .onChange((e) => {
        rig.az -= e.changeX * 0.008;
        rig.el = Math.min(EL_MAX, Math.max(EL_MIN, rig.el + e.changeY * 0.005));
        rig.invalidate?.();
        touch();
      });
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onChange((e) => {
        const [lo, hi] = distLimits(rig);
        rig.goalDist = Math.min(hi, Math.max(lo, rig.goalDist / e.scaleChange));
        rig.dist = rig.goalDist;
        rig.invalidate?.();
        touch();
      });
    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((e) => {
        rig.tap = { x: e.x, y: e.y };
        rig.invalidate?.();
        touch();
      });
    const doubleTap = Gesture.Tap()
      .runOnJS(true)
      .numberOfTaps(2)
      .onEnd(() => {
        rig.reset = true;
        setSelected(null);
        rig.invalidate?.();
      });
    return Gesture.Race(Gesture.Simultaneous(pan, pinch), Gesture.Exclusive(doubleTap, tap));
  }, [rig]);

  // 言葉は植物の上に出す。画面の端で切れないよう、内側に収める
  const labelStyle = useAnimatedStyle(() => ({
    opacity: labelOn.value,
    transform: [
      { translateX: Math.min(width - LABEL_W - 8, Math.max(8, labelX.value - LABEL_W / 2)) },
      { translateY: Math.min(height - 200, Math.max(96, labelY.value - 34)) },
    ],
  }));

  return (
    <View style={styles.container}>
      {/* 朝の明るい空なので、時計・電池の文字は黒（アプリ全体は白） */}
      <StatusBar style="dark" />
      <Island3D
        width={width}
        height={height}
        layout={layout}
        rig={rig}
        selected={selected}
        onPick={setSelected}
        labelX={labelX}
        labelY={labelY}
        labelOn={labelOn}
      />
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill} />
      </GestureDetector>

      {/* 文字が景色の上でも読めるよう、上に淡い光の帯、下に薄い影の帯 */}
      <LinearGradient colors={['rgba(255,238,226,0.8)', 'rgba(255,238,226,0)']} style={styles.topScrim} pointerEvents="none" />
      <LinearGradient colors={['rgba(24,70,84,0)', 'rgba(24,70,84,0.32)']} style={styles.bottomScrim} pointerEvents="none" />

      <Animated.View style={[styles.label, labelStyle]} pointerEvents="none">
        <Text style={styles.labelText}>{selected ?? ''}</Text>
      </Animated.View>

      <View style={styles.top} pointerEvents="box-none">
        <Pressable hitSlop={14} onPress={() => router.back()}>
          <Text style={styles.back}>‹ 川へ</Text>
        </Pressable>
        <Text style={styles.proto}>島の試作（仮のデータ）</Text>
      </View>

      <View style={styles.stages} pointerEvents="box-none">
        {STAGES.map((s, i) => (
          <Pressable
            key={s.key}
            hitSlop={6}
            onPress={() => {
              setSelected(null);
              setStage(i);
            }}
            style={[styles.stageBtn, i === stage && styles.stageOn]}
          >
            <Text style={[styles.stageText, i === stage && styles.stageTextOn]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>
      {!touched && (
        <Text style={styles.hint} pointerEvents="none">
          なぞると回る・つまむと寄る・触れると近づく
        </Text>
      )}
    </View>
  );
}

const INK = '#4a3b42';
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffdcc6' },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 120 },
  bottomScrim: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 170 },
  top: { position: 'absolute', top: 52, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { fontSize: 15, color: INK, textShadowColor: 'rgba(255,248,240,0.9)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 0 } },
  proto: { fontSize: 11, color: 'rgba(74,59,66,0.7)', textShadowColor: 'rgba(255,248,240,0.9)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 0 } },
  stages: { position: 'absolute', bottom: 58, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  stageBtn: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.5)' },
  stageOn: { backgroundColor: 'rgba(255,255,255,0.94)' },
  stageText: { fontSize: 13, color: 'rgba(60,50,58,0.75)' },
  stageTextOn: { color: '#3c323a', fontWeight: '600' },
  hint: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 12,
    color: 'rgba(255,255,255,0.92)',
    textShadowColor: 'rgba(20,50,60,0.5)',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 0 },
  },
  label: { position: 'absolute', left: 0, top: 0, width: LABEL_W, alignItems: 'center' },
  labelText: {
    fontSize: 16,
    color: INK,
    backgroundColor: 'rgba(255,250,242,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
});
