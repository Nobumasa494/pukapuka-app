import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, Pressable, Image, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { coverRect } from '../riverPath';
import { CATEGORY_COLOR, LEGEND, SAMPLE_STATS, SPARKLE_GROUPS, layoutWords, type Placed } from '../wordCloud';
import type { Category } from '../words';

// 川が流れ続ける4秒ループ（ブルーアワー＋地平線の残照）。最初のコマは川からの遷移動画の最後のコマと同じ絵
const CLOUD_VIDEO = require('../../assets/video/cloud_bg.mp4');
// 読み込み中・動画が再生できない環境での代わり（同じ1コマ目）
const CLOUD_BG = require('../../assets/video/cloud_bg.jpg');

const TWINKLE_MS = 2400;

// カテゴリの色を白へ寄せる（光っている瞬間の文字の色）
function lighten(c: Category, mix: number) {
  const [r, g, b] = CATEGORY_COLOR[c];
  const m = (v: number) => Math.round(v + (255 - v) * mix);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

const twinkle = (t: number) => {
  'worklet';
  const s = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
  return s * s;
};

// 文字の周りの光（広がり＝強さ）。文字のまたたきと同じ時計で、ゆっくり明るさが息づく
function HaloLayer({ group, clock, placed, width, height }: {
  group: number;
  clock: SharedValue<number>;
  placed: Placed[];
  width: number;
  height: number;
}) {
  const style = useAnimatedStyle(() => ({ opacity: 0.55 + 0.45 * twinkle(clock.get() + group / SPARKLE_GROUPS) }));
  const mine = placed.filter((p) => p.group === group && p.haloOpacity > 0);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          {mine.map((p) => {
            const [r, g, b] = CATEGORY_COLOR[p.category];
            return (
              <RadialGradient key={p.word} id={`halo-${group}-${p.word}`} cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={`rgb(${r},${g},${b})`} stopOpacity={p.haloOpacity} />
                <Stop offset="0.45" stopColor={`rgb(${r},${g},${b})`} stopOpacity={p.haloOpacity * 0.5} />
                <Stop offset="1" stopColor={`rgb(${r},${g},${b})`} stopOpacity={0} />
              </RadialGradient>
            );
          })}
        </Defs>
        {mine.map((p) => (
          <Circle key={p.word} cx={p.x + p.w / 2} cy={p.y + p.h / 2} r={p.haloR} fill={`url(#halo-${group}-${p.word})`} />
        ))}
      </Svg>
    </Animated.View>
  );
}

// 文字そのものをきらめかせる: 同じ文字の「光る写し」を上に重ね、その明るさをまたたかせる。
// 写しの明るさと光の広がりが強さで決まる。言葉ごとにアニメーションを持たせると重いので、
// 時間をずらした数枚の層ごとにまとめて動かす
function GlowLayer({ group, clock, placed }: { group: number; clock: SharedValue<number>; placed: Placed[] }) {
  const style = useAnimatedStyle(() => ({ opacity: 0.15 + 0.85 * twinkle(clock.get() + group / SPARKLE_GROUPS) }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      {placed
        .filter((p) => p.group === group && p.sparkle > 0)
        .map((p) => {
          const [r, g, b] = CATEGORY_COLOR[p.category];
          return (
            <Text
              key={p.word}
              style={[
                styles.word,
                {
                  position: 'absolute',
                  left: p.x,
                  top: p.y,
                  fontSize: p.size,
                  lineHeight: p.h,
                  color: lighten(p.category, 0.6),
                  opacity: 0.35 + 0.65 * p.sparkle,
                  textShadowColor: `rgba(${r},${g},${b},0.95)`,
                  textShadowRadius: 3 + 13 * p.sparkle,
                },
              ]}
            >
              {p.word}
            </Text>
          );
        })}
    </Animated.View>
  );
}

export default function Words() {
  const { width, height } = useWindowDimensions();
  const rect = coverRect(width, height);
  const fill = { position: 'absolute' as const, left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  const player = useVideoPlayer(CLOUD_VIDEO, (p) => {
    p.loop = true;
    p.muted = true;
  });
  // 再生は画面に出てから（作ったときに play しても Web では動画の要素がまだ無く、止まったままだった）
  useEffect(() => {
    player.play();
  }, [player]);

  const clock = useSharedValue(0);
  useEffect(() => {
    clock.set(withRepeat(withTiming(1, { duration: TWINKLE_MS, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(clock);
  }, [clock]);

  // 空（画面の上約6割。これより下は木にかかる）に置く。位置に意味は持たせず、文字の大きさ＝回数・キラキラと周りの光＝強さ・色＝カテゴリ
  const { placed } = useMemo(
    () => layoutWords(SAMPLE_STATS, { x: 20, y: 96, w: width - 40, h: Math.round(height * 0.6) - 96 }),
    [width, height],
  );

  return (
    <View style={styles.container}>
      <Image source={CLOUD_BG} style={fill} />
      {/* Android で重なり順を効かせるため textureView（川の画面と同じ） */}
      <VideoView player={player} style={fill} contentFit="cover" nativeControls={false} pointerEvents="none" surfaceType="textureView" />

      {/* 横幅いっぱいのタイトルはボタンより先に置き、タップを受けない（後に置くとスマホでボタンの上に重なって押せない） */}
      <View style={styles.titleRow} pointerEvents="none">
        <Text style={styles.title}>拾ったことば</Text>
      </View>

      {/* 光は文字の後ろ */}
      {Array.from({ length: SPARKLE_GROUPS }, (_, g) => (
        <HaloLayer key={g} group={g} clock={clock} placed={placed} width={width} height={height} />
      ))}

      {placed.map((p) => {
        const [r, g, b] = CATEGORY_COLOR[p.category];
        return (
          <Pressable
            key={p.word}
            style={{ position: 'absolute', left: p.x, top: p.y }}
            hitSlop={4}
            onPress={() => router.push({ pathname: '/archive', params: { word: p.word } } as never)}
          >
            <Text style={[styles.word, { fontSize: p.size, lineHeight: p.h, color: `rgba(${r},${g},${b},${p.textOpacity})` }]}>
              {p.word}
            </Text>
          </Pressable>
        );
      })}

      {/* 光る写しは文字の上に重ねる（タップは下の言葉に通す） */}
      {Array.from({ length: SPARKLE_GROUPS }, (_, g) => (
        <GlowLayer key={g} group={g} clock={clock} placed={placed} />
      ))}

      <View style={styles.legend} pointerEvents="none">
        {LEGEND.map(({ category, label, color: [r, g, b] }) => (
          <View key={category} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: `rgb(${r},${g},${b})` }]} />
            <Text style={styles.legendText}>{label}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.hint} pointerEvents="none">
        文字の大きさ＝拾った回数　キラキラ・光＝気持ちの強さ
      </Text>

      <Pressable
        style={styles.back}
        hitSlop={16}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/' as never))}
      >
        <Text style={styles.backText}>← 川へ</Text>
      </Pressable>

      <Pressable style={styles.next} hitSlop={16} onPress={() => router.push('/archive' as never)}>
        <Text style={styles.nextText}>つながりを見る</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', backgroundColor: '#1a1c45' },
  back: { position: 'absolute', top: 56, left: 20, zIndex: 10 },
  backText: { fontSize: 14, color: 'rgba(255,246,232,0.7)' },
  titleRow: { position: 'absolute', top: 54, left: 0, right: 0, alignItems: 'center' },
  title: { fontSize: 16, color: 'rgba(255,246,232,0.9)', letterSpacing: 2 },
  word: {
    fontWeight: '300',
    textShadowColor: 'rgba(10,14,40,0.5)',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 0 },
  },
  legend: { position: 'absolute', bottom: 100, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', columnGap: 12, rowGap: 4, paddingHorizontal: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', columnGap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { fontSize: 10, color: 'rgba(255,246,232,0.65)' },
  hint: { position: 'absolute', bottom: 76, left: 0, right: 0, textAlign: 'center', fontSize: 11, color: 'rgba(255,246,232,0.6)', letterSpacing: 1 },
  next: { position: 'absolute', bottom: 40, alignSelf: 'center', zIndex: 10 },
  nextText: { fontSize: 13, color: 'rgba(255,246,232,0.75)' },
});
