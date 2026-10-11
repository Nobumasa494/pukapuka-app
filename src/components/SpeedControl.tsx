// 流れの速さのバー（2026-10-11 ユーザー「今の川の流れが基準として、もう少し早めることができるバーがほしい」）。
// 右下の ♪ の上の波の印を押すと、その左に出て、しばらくさわらないと消える。今の速さ（1倍）〜2倍。選んだ速さは端末に覚える
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, type SharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

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
        <Text style={[styles.icon, value > 1 && styles.iconOn]}>〜</Text>
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

const styles = StyleSheet.create({
  btn: { position: 'absolute', bottom: 70, right: 18, width: 28, height: 28, alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  icon: { fontSize: 18, color: 'rgba(255,246,232,0.55)', textShadowColor: 'rgba(10,20,40,0.5)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 0 } },
  iconOn: { color: 'rgba(255,236,200,0.9)' },
  panel: {
    position: 'absolute', bottom: 66, right: 52, zIndex: 21, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(20,40,60,0.45)',
  },
  label: { fontSize: 11, color: 'rgba(235,242,248,0.75)', letterSpacing: 1 },
  trackBox: { width: TRACK, height: 28, justifyContent: 'center' },
  track: { position: 'absolute', left: 0, right: 0, height: 2, borderRadius: 1, backgroundColor: 'rgba(235,242,248,0.3)' },
  fill: { position: 'absolute', left: 0, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,224,170,0.85)' },
  knob: { position: 'absolute', width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: 'rgba(255,246,232,0.95)', top: 5 },
});
