// 流れの速さのバー（2026-10-11 ユーザー「今の川の流れが基準として、もう少し早めることができるバーがほしい」）。
// 左上の ♪ の下の川の印（3本の波線）を押すと、その右に出て、しばらくさわらないと消える。今の速さ（1倍）〜2倍。選んだ速さは端末に覚える
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, type SharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';

export const SPEED_MAX = 2;
const KEY = 'pukapuka.flowSpeed';
const TRACK = 150;
const KNOB = 18;
const HIDE_MS = 5000;

export default function SpeedControl({ speed, visible }: { speed: SharedValue<number>; visible: boolean }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(1);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 覚えている速さを読む
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        const n = v ? Math.min(SPEED_MAX, Math.max(1, Number(v))) : 1;
        if (Number.isFinite(n)) {
          setValue(n);
          speed.set(n);
        }
      })
      .catch(() => {});
  }, [speed]);

  const keepOpen = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setOpen(false), HIDE_MS);
  };
  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);
  useEffect(() => {
    if (!visible) setOpen(false);
  }, [visible]);

  const set = (x: number) => {
    const v = Math.round((1 + (Math.min(TRACK, Math.max(0, x)) / TRACK) * (SPEED_MAX - 1)) * 10) / 10;
    if (v !== value) Haptics.selectionAsync();
    setValue(v);
    speed.set(v);
    AsyncStorage.setItem(KEY, String(v)).catch(() => {});
    keepOpen();
  };
  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => runOnJS(set)(e.x))
    .onUpdate((e) => runOnJS(set)(e.x));

  if (!visible) return null;
  return (
    <>
      <Pressable
        style={styles.btn}
        hitSlop={12}
        onPress={() => {
          setOpen((o) => !o);
          keepOpen();
        }}
        accessibilityRole="button"
        accessibilityLabel="流れの速さ"
      >
        <View pointerEvents="none" style={styles.glow} />
        <Waves on={value > 1} />
      </Pressable>
      {open && (
        <View style={styles.panel}>
          <Text style={styles.label}>いつも</Text>
          <GestureDetector gesture={pan}>
            <View style={styles.trackBox}>
              <View style={styles.track} />
              <View style={[styles.fill, { width: ((value - 1) / (SPEED_MAX - 1)) * TRACK }]} />
              <View style={[styles.knob, { left: ((value - 1) / (SPEED_MAX - 1)) * TRACK - KNOB / 2 }]} />
            </View>
          </GestureDetector>
          <Text style={styles.label}>はやい</Text>
        </View>
      )}
    </>
  );
}

// 川の印：3本の波線（2026-10-11 ユーザー「川は３つの波線まーくがいいかも」）。1倍より速いときは明るく
const WAVE = 'c1.5-1.6 3-1.6 4.5 0s3 1.6 4.5 0 3-1.6 4.5 0 3 1.6 4.5 0';
function Waves({ on }: { on: boolean }) {
  // 目立つように、いつも明るく（速いときは、さらに金色）。2026-10-14、ユーザー「少し目立つようにして、光らせる」
  const color = on ? 'rgba(255,226,160,1)' : 'rgba(255,244,222,0.95)';
  return (
    <Svg width={24} height={18} viewBox="0 0 22 16">
      {[3, 8, 13].map((y) => (
        <Path key={y} d={`M2 ${y}${WAVE}`} stroke={color} strokeWidth={1.7} strokeLinecap="round" fill="none" />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  // 左上（♪の下。縦に並べる。ユーザー「左上のマークは縦でいい」）。泡が下を流れるので、下の端から上へ移した（決定 2026-10-14、ユーザー「川の速さや音楽は左上に移動する」）
  btn: { position: 'absolute', top: 90, left: 16, width: 28, height: 28, alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  panel: {
    position: 'absolute', top: 86, left: 54, zIndex: 21, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(20,40,60,0.45)',
  },
  glow: { position: 'absolute', width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,222,160,0.2)', boxShadow: '0 0 14px 4px rgba(255,214,150,0.45)' },
  label: { fontSize: 11, color: 'rgba(235,242,248,0.75)', letterSpacing: 1 },
  trackBox: { width: TRACK, height: 28, justifyContent: 'center' },
  track: { position: 'absolute', left: 0, right: 0, height: 2, borderRadius: 1, backgroundColor: 'rgba(235,242,248,0.3)' },
  fill: { position: 'absolute', left: 0, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,224,170,0.85)' },
  knob: { position: 'absolute', width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: 'rgba(255,246,232,0.95)', top: 5 },
});
