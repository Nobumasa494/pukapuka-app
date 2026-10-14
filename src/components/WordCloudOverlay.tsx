import { useEffect, useMemo } from 'react';
import { WORD_LIST } from '../words';
import { useAiWords } from '../aiWords';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { colorOf, isGrouped, legend, MAX_WORDS, SPARKLE_GROUPS, aggregate, layoutWords, selectWords, withRates, type Placed } from '../wordCloud';
import { useCaptures, useShownCounts } from '../useCaptures';
import { splitBubble } from '../bubbleText';
import { boxCaptures, boxShown, warehouseReady } from '../warehouse';
import type { Cat } from '../wordCloud';

// 拾ったことば（ワードクラウド）。川の画面の上に重ねて出す。背景（空のループ動画）は川の画面の1本のプレーヤーが流す

const TWINKLE_MS = 2400;

// カテゴリの色を白へ寄せる（光っている瞬間の文字の色）
function lighten(c: Cat, mix: number) {
  const [r, g, b] = colorOf(c);
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
            const [r, g, b] = colorOf(p.category);
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
          const [r, g, b] = colorOf(p.category);
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
                  lineHeight: p.size * 1.4,
                  color: lighten(p.category, 0.6),
                  opacity: 0.35 + 0.65 * p.sparkle,
                  textShadowColor: `rgba(${r},${g},${b},0.95)`,
                  textShadowRadius: 3 + 13 * p.sparkle,
                },
              ]}
            >
              {splitBubble(p.word)}
            </Text>
          );
        })}
    </Animated.View>
  );
}

type Props = {
  width: number;
  height: number;
  onBack: () => void;
  onOpenArchive: (word?: string) => void;
};

const FIXED_WORDS: ReadonlySet<string> = new Set(WORD_LIST);

export default function WordCloudOverlay({ width, height, onBack, onOpenArchive }: Props) {
  const clock = useSharedValue(0);
  useEffect(() => {
    clock.set(withRepeat(withTiming(1, { duration: TWINKLE_MS, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(clock);
  }, [clock]);

  // 最近（今日〜今週）の本物の記録。読み込み中は何も置かない
  const aiVersion = useAiWords(); // 読み込めたら再描画（AI の言葉の種類が分かる）
  const captures = useCaptures(7);
  const shown = useShownCounts(7);

  // 空（画面の上62%。これより下は木にかかる）に置く。位置に意味は持たせず、文字の大きさ＝割合（流れた回数のうち何回拾ったか）・キラキラと周りの光＝強さ・色＝カテゴリ。
  // 2026-10-10：70%に広げたら、下の段の言葉が木に重なって読みにくかったので、木のてっぺん（約63%）の手前まで。
  // 小さい画面（高さ750未満）は、言葉を20語までにする（それでも文字が10pxを下回るため）
  const { placed } = useMemo(
    () => {
      // 流れた記録をとりはじめる前の分は除く（何回流れたか分からないため）。流れた記録がない人（見本・使いはじめ）は回数のまま
      const raw = shown ? (captures ?? []).filter((c) => shown.since === null || c.capturedAt >= shown.since) : [];
      // 倉庫で動くときは箱で数える（箱の名前＝その箱でいちばん多く拾った言葉）。流れた回数も箱ごとに足す（決定 2026-10-14）
      const boxed = warehouseReady();
      const caps = boxed ? boxCaptures(raw) : raw;
      const stats = aggregate(caps);
      const shownMap = shown && boxed ? boxShown(shown.shown, stats.map((s) => s.word)) : shown?.shown;
      return layoutWords(selectWords(shown?.since != null && shownMap ? withRates(stats, shownMap, boxed ? new Set(stats.map((s) => s.word)) : FIXED_WORDS) : stats, height < 750 ? 20 : MAX_WORDS), { x: 20, y: 96, w: width - 40, h: Math.round(height * 0.62) - 96 });
    },
    [captures, shown, width, height, aiVersion],
  );

  // つまんで拡大・縮小、なぞって動かす（2026-10-14、ユーザー「夕空文字が小さいのがあるから、ズームできたり、上下左右に移動できたりしたい。星空みたいに」）。
  // 言葉と光は、1枚の大きな面にのせて、その面を拡大・移動する。見える範囲は、見出しの下から、木のてっぺんの手前まで（窓）。
  // 面の点 p は、画面の (tx + k·p) に来る。窓の外には出さない（k が 1 のときは動かない）。計算は星空（NightOverlay）と同じ考え方
  const WIN_TOP = 84;
  const WIN_BOTTOM = Math.round(height * 0.62);
  const MAX_SCALE = 2.6;
  const sc = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const s0 = useSharedValue(1);
  const x0 = useSharedValue(0);
  const y0 = useSharedValue(0);
  const cx0 = useSharedValue(0);
  const cy0 = useSharedValue(0);
  const loX = (k: number) => { 'worklet'; return width * (1 - k); };
  const hiX = () => { 'worklet'; return 0; };
  const loY = (k: number) => { 'worklet'; return WIN_BOTTOM * (1 - k); };
  const hiY = (k: number) => { 'worklet'; return WIN_TOP * (1 - k); };
  const clampV = (v: number, lo: number, hi: number) => { 'worklet'; return Math.min(hi, Math.max(lo, v)); };
  const rubber = (v: number, lo: number, hi: number) => {
    'worklet';
    if (v < lo) return lo - (lo - v) * 0.3;
    if (v > hi) return hi + (v - hi) * 0.3;
    return v;
  };
  const rubberScale = (k: number) => {
    'worklet';
    if (k < 1) return Math.pow(k, 0.3);
    if (k > MAX_SCALE) return MAX_SCALE * Math.pow(k / MAX_SCALE, 0.3);
    return k;
  };
  const SETTLE = { duration: 260, easing: Easing.out(Easing.cubic) };
  // 言葉が入れかわったら、拡大をもとに戻す
  useEffect(() => {
    cancelAnimation(sc); cancelAnimation(tx); cancelAnimation(ty);
    sc.set(1); tx.set(0); ty.set(0);
  }, [placed, sc, tx, ty]);
  const pan = Gesture.Pan()
    .minDistance(8)
    .maxPointers(1)
    .onStart(() => {
      cancelAnimation(tx); cancelAnimation(ty);
      x0.set(tx.get()); y0.set(ty.get());
    })
    .onUpdate((e) => {
      const k = sc.get();
      tx.set(rubber(x0.get() + e.translationX, loX(k), hiX()));
      ty.set(rubber(y0.get() + e.translationY, loY(k), hiY(k)));
    })
    .onEnd((e, success) => {
      if (!success) return;
      const k = sc.get();
      const settle = (v: SharedValue<number>, lo: number, hi: number, velocity: number) => {
        const now = v.get();
        if (now < lo || now > hi) v.set(withTiming(clampV(now, lo, hi), SETTLE));
        else v.set(withDecay({ velocity, deceleration: 0.996, clamp: [lo, hi] }));
      };
      settle(tx, loX(k), hiX(), e.velocityX);
      settle(ty, loY(k), hiY(k), e.velocityY);
    });
  const pinch = Gesture.Pinch()
    .onStart((e) => {
      cancelAnimation(sc); cancelAnimation(tx); cancelAnimation(ty);
      s0.set(sc.get() / e.scale);
      cx0.set((e.focalX - tx.get()) / sc.get());
      cy0.set((e.focalY - ty.get()) / sc.get());
      x0.set(e.focalX); y0.set(e.focalY);
    })
    .onUpdate((e) => {
      const k = rubberScale(s0.get() * e.scale);
      sc.set(k);
      tx.set(e.focalX - cx0.get() * k);
      ty.set(e.focalY - cy0.get() * k);
      x0.set(e.focalX); y0.set(e.focalY);
    })
    .onEnd(() => {
      const k = clampV(sc.get(), 1, MAX_SCALE);
      sc.set(withTiming(k, SETTLE));
      tx.set(withTiming(clampV(x0.get() - cx0.get() * k, loX(k), hiX()), SETTLE));
      ty.set(withTiming(clampV(y0.get() - cy0.get() * k, loY(k), hiY(k)), SETTLE));
    });
  const gesture = Gesture.Simultaneous(pan, pinch);
  const canvasStyle = useAnimatedStyle(() => {
    const k = sc.get();
    return {
      transform: [
        { translateX: tx.get() - (width / 2) * (1 - k) },
        { translateY: ty.get() - (height / 2) * (1 - k) },
        { scale: k },
      ],
    };
  });

  return (
    <GestureDetector gesture={gesture}>
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* 横幅いっぱいのタイトルはボタンより先に置き、タップを受けない（後に置くとスマホでボタンの上に重なって押せない） */}
      <View style={styles.titleRow} pointerEvents="none">
        <Text style={styles.title}>夕空</Text>
      </View>

      {/* 言葉と光を、拡大・移動できる1枚の面にのせる。窓（見出しの下〜木のてっぺんの手前）で切る */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: WIN_TOP, height: WIN_BOTTOM - WIN_TOP, overflow: 'hidden' }} pointerEvents="box-none">
        <Animated.View style={[{ position: 'absolute', left: 0, top: -WIN_TOP, width, height }, canvasStyle]} pointerEvents="box-none">
      {/* 光は文字の後ろ */}
      {Array.from({ length: SPARKLE_GROUPS }, (_, g) => (
        <HaloLayer key={g} group={g} clock={clock} placed={placed} width={width} height={height} />
      ))}

      {placed.map((p) => {
        const [r, g, b] = colorOf(p.category);
        return (
          <Pressable key={p.word} style={{ position: 'absolute', left: p.x, top: p.y }} hitSlop={4} onPress={() => onOpenArchive(p.word)}>
            <Text style={[styles.word, { fontSize: p.size, lineHeight: p.size * 1.4, color: `rgba(${r},${g},${b},${p.textOpacity})` }]}>
              {splitBubble(p.word)}
            </Text>
          </Pressable>
        );
      })}

      {/* 光る写しは文字の上に重ねる（タップは下の言葉に通す） */}
      {Array.from({ length: SPARKLE_GROUPS }, (_, g) => (
        <GlowLayer key={g} group={g} clock={clock} placed={placed} />
      ))}

        </Animated.View>
      </View>

      <View style={styles.legend} pointerEvents="none">
        {legend(isGrouped()).map(({ category, label, color: [r, g, b] }) => (
          <View key={category} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: `rgb(${r},${g},${b})` }]} />
            <Text style={styles.legendText}>{label}</Text>
          </View>
        ))}
      </View>

      {captures?.length === 0 && (
        <Text style={styles.empty} pointerEvents="none">
          まだ言葉がありません。川で拾ってみましょう
        </Text>
      )}

      <Text style={styles.hint} pointerEvents="none">
        文字の大きさ＝流れてきたとき拾う割合　キラキラ・光＝気持ちの強さ
      </Text>

      <Pressable style={styles.back} hitSlop={16} onPress={onBack}>
        <Text style={styles.backText}>← 水辺へ</Text>
      </Pressable>

      <Pressable style={styles.next} hitSlop={16} onPress={() => onOpenArchive()}>
        <Text style={styles.nextText}>星空へ →</Text>
      </Pressable>
    </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  back: { position: 'absolute', top: 56, left: 20, zIndex: 10 },
  backText: { fontSize: 14, color: 'rgba(255,246,232,0.7)' },
  titleRow: { position: 'absolute', top: 54, left: 0, right: 0, alignItems: 'center' },
  title: { fontSize: 16, color: 'rgba(255,246,232,0.9)', letterSpacing: 2 },
  word: {
    textAlign: 'center',
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
  empty: { position: 'absolute', top: '30%', left: 0, right: 0, textAlign: 'center', fontSize: 14, color: 'rgba(255,246,232,0.8)', letterSpacing: 1 },
  // 右上：左上の「← 水辺へ」と対になる、次の画面（星空）への入口
  next: { position: 'absolute', top: 56, right: 20, zIndex: 10 },
  nextText: { fontSize: 14, color: 'rgba(255,246,232,0.7)' },
});
