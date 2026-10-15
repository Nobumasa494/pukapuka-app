import { memo, useEffect, useMemo, useState } from 'react';
import { WORD_LIST } from '../words';
import { useAiWords } from '../aiWords';
import { Image, StyleSheet, Text, View, Pressable } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { colorOf, isGrouped, legend, MAX_WORDS, SPARKLE_GROUPS, aggregate, layoutWords, selectWords, withRates, type Placed, type WordStat } from '../wordCloud';
import { useCaptures, useShownCounts } from '../useCaptures';
import { splitBubble } from '../bubbleText';
import { boxCaptures, boxShown, boxWords, warehouseReady } from '../warehouse';
import { BOXES } from '../../convex/boxes';
import type { Cat } from '../wordCloud';

// 拾ったことば（ワードクラウド）。川の画面の上に重ねて出す。背景（空のループ動画）は川の画面の1本のプレーヤーが流す

const TWINKLE_MS = 2400;
const HALO_IMAGE = require('../../assets/glow/halo.png');
const DEBUG_ZOOM = 1; // 試験用。スマホで、つまめなくても、拡大したときの重さ・なぞりを確かめるときだけ 2 にする（2026-10-14 に 2 で確かめた：コマ落ち 1.3%・CPU 53%）

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
  // 光は、白い丸いぼかしの画像1枚に色をつけて置く（前は SVG のぼかしを言葉ごとに作っていて、見本の出し入れで画面が約0.1秒止まった。
  // 画像にして約0.04秒。形は同じ：中心 → 45% で半分 → 端で0。2026-10-14、/pukapuka-yuzora）
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width, height }, style]} pointerEvents="none">
      {mine.map((p) => {
        const [r, g, b] = colorOf(p.category);
        return (
          <Image
            key={p.word}
            source={HALO_IMAGE}
            style={{ tintColor: `rgb(${r},${g},${b})`, position: 'absolute', left: p.x + p.w / 2 - p.haloR, top: p.y + p.h / 2 - p.haloR, width: p.haloR * 2, height: p.haloR * 2, opacity: p.haloOpacity }}
          />
        );
      })}
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

// 言葉と光の1面（夕空・見本で1つずつ）。memo なので、ボタンを押したり、拡大の印が変わったりしても作り直さない
const Sky = memo(function Sky({ placed, clock, width, height }: { placed: Placed[]; clock: SharedValue<number>; width: number; height: number }) {
  return (
    <>
      {/* 光は文字の後ろ */}
      {Array.from({ length: SPARKLE_GROUPS }, (_, g) => (
        <HaloLayer key={g} group={g} clock={clock} placed={placed} width={width} height={height} />
      ))}
      {placed.map((p) => {
        const [r, g, b] = colorOf(p.category);
        return (
          // 言葉を押しても、星空へは行かない（決定 2026-10-14、ユーザー「夕空の画面を押したら、星空に行く流れはなくしてほしい」）。星空へは、右上の「星空へ →」から
          <View key={p.word} style={{ position: 'absolute', left: p.x, top: p.y }}>
            <Text style={[styles.word, { fontSize: p.size, lineHeight: p.size * 1.4, color: `rgba(${r},${g},${b},${p.textOpacity})` }]}>
              {splitBubble(p.word)}
            </Text>
          </View>
        );
      })}
      {/* 光る写しは文字の上に重ねる */}
      {Array.from({ length: SPARKLE_GROUPS }, (_, g) => (
        <GlowLayer key={g} group={g} clock={clock} placed={placed} />
      ))}
    </>
  );
});

type Props = {
  width: number;
  height: number;
  onBack: () => void;
  onOpenArchive: (word?: string) => void;
};

const FIXED_WORDS: ReadonlySet<string> = new Set(WORD_LIST);

// 夕空の見本（2026-10-14、ユーザー「最大の文字が夕空になったとき、どうやって移動できるのかを確かめたい」）：
// 言葉が上限（30語）まで出て、7グループがそろい、いちばん長い言葉（9〜10文字）も入った夕空。拾った記録ではない。倉庫で動いているときだけ（グループが要るため）
function makeSample(): WordStat[] {
  const byGroup = new Map<string, number[]>();
  for (const b of BOXES) byGroup.set(b.group, [...(byGroup.get(b.group) ?? []), b.id]);
  const picks: { word: string; group: string }[] = [];
  let round = 0;
  while (picks.length < MAX_WORDS && round < 20) {
    for (const [g, ids] of byGroup) {
      if (picks.length >= MAX_WORDS) break;
      const box = ids[round % ids.length];
      const ws = boxWords(box).filter((w) => w.length >= 8 && w.length <= 10);
      const w = ws[(round * 7 + box) % Math.max(1, ws.length)] ?? boxWords(box)[0];
      if (w && !picks.some((p) => p.word === w)) picks.push({ word: w, group: g });
    }
    round++;
  }
  return picks.map((p, i) => ({ word: p.word, category: p.group as Cat, count: Math.max(1, 14 - i), avgStrength: 0.2 + ((i * 37) % 80) / 100, rate: Math.max(0.03, 0.5 - i * 0.015) }));
}

export default function WordCloudOverlay({ width, height, onBack, onOpenArchive }: Props) {
  const clock = useSharedValue(0);
  useEffect(() => {
    clock.set(withRepeat(withTiming(1, { duration: TWINKLE_MS, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(clock);
  }, [clock]);

  // 最近（今日〜今週）の本物の記録。読み込み中は何も置かない
  const [showSample, setShowSample] = useState(false);
  const aiVersion = useAiWords(); // 読み込めたら再描画（AI の言葉の種類が分かる）
  const captures = useCaptures(7);
  const shown = useShownCounts(7);

  // 空（画面の上62%。これより下は木にかかる）に置く。位置に意味は持たせず、文字の大きさ＝割合（流れた回数のうち何回拾ったか）・キラキラと周りの光＝強さ・色＝カテゴリ。
  // 2026-10-10：70%に広げたら、下の段の言葉が木に重なって読みにくかったので、木のてっぺん（約63%）の手前まで。
  // 小さい画面（高さ750未満）は、言葉を20語までにする（それでも文字が10pxを下回るため）
  // 見本は、1回目に開いたときに作って、とっておく。夕空と見本は両方とも作ったままにして、見せるほうだけ切りかえる
  // （前は押すたびに言葉30個と光を作り直し、見本を見る・× の反応が遅かった。2026-10-15）
  const [sampleMade, setSampleMade] = useState(false);
  useEffect(() => { if (showSample) setSampleMade(true); }, [showSample]);
  const samplePlaced = useMemo(
    () => (sampleMade || showSample ? layoutWords(makeSample(), { x: 20, y: 96, w: width - 40, h: Math.round(height * 0.62) - 96 }).placed : null),
    [sampleMade || showSample, width, height, aiVersion],
  );
  const { placed: realPlaced } = useMemo(
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
  const placed = showSample && samplePlaced ? samplePlaced : realPlaced;

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
  const touching = useSharedValue(0); // 指で触っている間は 1（pan・pinch の中で使うので、これらより前に作る）
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
    sc.set(DEBUG_ZOOM); tx.set(DEBUG_ZOOM > 1 ? width * (1 - DEBUG_ZOOM) / 2 : 0); ty.set(DEBUG_ZOOM > 1 ? ((WIN_TOP + WIN_BOTTOM) / 2) * (1 - DEBUG_ZOOM) : 0);
  }, [placed, sc, tx, ty]);
  const pan = Gesture.Pan()
    .minDistance(8)
    .maxPointers(1)
    .onStart(() => {
      touching.set(1);
      cancelAnimation(tx); cancelAnimation(ty);
      x0.set(tx.get()); y0.set(ty.get());
    })
    .onUpdate((e) => {
      const k = sc.get();
      tx.set(rubber(x0.get() + e.translationX, loX(k), hiX()));
      ty.set(rubber(y0.get() + e.translationY, loY(k), hiY(k)));
    })
    .onFinalize(() => {
      touching.set(0);
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
      touching.set(1);
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
    .onFinalize(() => {
      touching.set(0);
    })
    .onEnd(() => {
      const k = clampV(sc.get(), 1, MAX_SCALE);
      sc.set(withTiming(k, SETTLE));
      tx.set(withTiming(clampV(x0.get() - cx0.get() * k, loX(k), hiX()), SETTLE));
      ty.set(withTiming(clampV(y0.get() - cy0.get() * k, loY(k), hiY(k)), SETTLE));
    });
  // 拡大している間・指で動かしている間は、光のまたたきを止める（毎コマ、大きな層を描き直して重くなったため。2026-10-14、ユーザー「重い」）。
  // 止めている間は、層を画像として覚えて、動かすだけにする（zoomed のとき renderToHardwareTexture）
  const [zoomed, setZoomed] = useState(false);
  useAnimatedReaction(
    () => sc.get() > 1.02 || touching.get() > 0,
    (still, prev) => {
      if (still === prev) return;
      if (still) cancelAnimation(clock);
      else clock.set(withRepeat(withTiming(1, { duration: TWINKLE_MS, easing: Easing.linear }), -1, false));
      runOnJS(setZoomed)(still);
    },
  );
  // ダブルタップ：その点を中心に2倍。もう一度で、もとに戻す（つまめない人・指1本のとき用）
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .maxDistance(12) // 指が12px動いたら、ダブルタップではない（すぐあきらめて、なぞる・つまむの邪魔をしない）
    .onEnd((e) => {
      cancelAnimation(sc); cancelAnimation(tx); cancelAnimation(ty);
      if (sc.get() > 1.2) {
        sc.set(withTiming(1, SETTLE));
        tx.set(withTiming(0, SETTLE));
        ty.set(withTiming(0, SETTLE));
        return;
      }
      const k = 2;
      const px = (e.x - tx.get()) / sc.get();
      const py = (e.y - ty.get()) / sc.get();
      sc.set(withTiming(k, SETTLE));
      tx.set(withTiming(clampV(e.x - px * k, loX(k), hiX()), SETTLE));
      ty.set(withTiming(clampV(e.y - py * k, loY(k), hiY(k)), SETTLE));
    });
  // なぞる・つまむは、ダブルタップかどうかを待たずに、すぐ動かす（前は Exclusive で、ダブルタップでないと決まるまで、なぞり始めを待たせていた。
  // 本物の指はゆっくり動き始めるので、拡大してからのなぞりに「引っかかる」違和感があった。2026-10-15、ユーザー「ズームしてからのタッチ操作に違和感・かくつき」）
  const gesture = Gesture.Simultaneous(pan, pinch, doubleTap);
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
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* つまむ・なぞるの受け皿は、言葉の面だけを包む。ボタンまで包むと、スマホでなぞったときにボタンの押しが途中で取り消され、
          「Ended a touch event which was not counted in trackedTouchCount」の注意が出ていた（2026-10-14） */}
      <GestureDetector gesture={gesture}>
      {/* 画面いっぱいを、つまむ・なぞる操作の受け皿にする（これがないと、言葉のない所でつまめなかった。2026-10-14） */}
      <View style={StyleSheet.absoluteFill}>
      {/* 横幅いっぱいのタイトルはボタンより先に置き、タップを受けない（後に置くとスマホでボタンの上に重なって押せない） */}
      <View style={styles.titleRow} pointerEvents="none">
        <Text style={styles.title}>{showSample ? '夕空（見本）' : '夕空'}</Text>
      </View>

      {/* 言葉と光を、拡大・移動できる1枚の面にのせる。窓（見出しの下〜木のてっぺんの手前）で切る */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: WIN_TOP, height: WIN_BOTTOM - WIN_TOP, overflow: 'hidden' }} pointerEvents="box-none">
        <Animated.View renderToHardwareTextureAndroid={zoomed} style={[{ position: 'absolute', left: 0, top: -WIN_TOP, width, height }, canvasStyle]} pointerEvents="box-none">
      {/* 夕空と見本。見せないほうは display: none で、作ったまま隠す */}
      <View style={[StyleSheet.absoluteFill, showSample && samplePlaced ? styles.hidden : null]} pointerEvents="none">
        <Sky placed={realPlaced} clock={clock} width={width} height={height} />
      </View>
      {samplePlaced && (
        <View style={[StyleSheet.absoluteFill, showSample ? null : styles.hidden]} pointerEvents="none">
          <Sky placed={samplePlaced} clock={clock} width={width} height={height} />
        </View>
      )}

        </Animated.View>
      </View>
      </View>
      </GestureDetector>

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

      {showSample ? (
        <Pressable style={({ pressed }) => [styles.sampleClose, pressed && styles.pressed]} hitSlop={14} onPress={() => setShowSample(false)} accessibilityLabel="見本をとじる">
          <Text style={styles.sampleCloseText}>×</Text>
        </Pressable>
      ) : (
        <Pressable style={({ pressed }) => [styles.back, pressed && styles.pressed]} hitSlop={16} onPress={onBack}>
          <Text style={styles.backText}>← 水辺へ</Text>
        </Pressable>
      )}

      {!showSample && (
        <Pressable style={({ pressed }) => [styles.next, pressed && styles.pressed]} hitSlop={16} onPress={() => onOpenArchive()}>
          <Text style={styles.nextText}>星空へ →</Text>
        </Pressable>
      )}
      {/* 見本：言葉が最大（30語）の夕空で、つまむ・なぞるを試せる（倉庫で動いているときだけ） */}
      {!showSample && isGrouped() && (
        <Pressable style={({ pressed }) => [styles.sampleBtn, pressed && styles.pressed]} hitSlop={12} onPress={() => setShowSample(true)}>
          <Text style={styles.sampleBtnText}>見本を見る</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // 触れた瞬間に、ぎゅっと沈んで暗くなる（離したときに動くので、押した感じを先に返す。2026-10-14、ユーザー「反応が遅い」）
  hidden: { display: 'none' },
  pressed: { opacity: 0.5, transform: [{ scale: 0.92 }] },
  sampleBtn: { position: 'absolute', bottom: 28, right: 58, backgroundColor: 'rgba(14,18,48,0.5)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,215,140,0.5)', zIndex: 10 },
  sampleBtnText: { fontSize: 13, color: 'rgba(255,232,170,1)', letterSpacing: 1 },
  sampleClose: { position: 'absolute', top: 52, left: 20, width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,246,232,0.4)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  sampleCloseText: { fontSize: 18, lineHeight: 20, color: 'rgba(255,246,232,0.85)' },
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
  // 凡例：木や川の上でも読めるよう、暗い下地の丸い札に、大きめの文字（2026-10-14、ユーザー「判例は見にくいので、見やすくしてほしい」）
  legend: { position: 'absolute', bottom: 104, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', columnGap: 5, rowGap: 5, paddingHorizontal: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', columnGap: 4, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(14,18,48,0.55)' },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: 'rgba(255,248,235,0.97)' },
  hint: { position: 'absolute', bottom: 74, left: 0, right: 0, textAlign: 'center', fontSize: 11, color: 'rgba(255,248,235,0.92)', letterSpacing: 0, textShadowColor: 'rgba(10,14,40,0.9)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 0 } },
  empty: { position: 'absolute', top: '30%', left: 0, right: 0, textAlign: 'center', fontSize: 14, color: 'rgba(255,246,232,0.8)', letterSpacing: 1 },
  // 右上：左上の「← 水辺へ」と対になる、次の画面（星空）への入口
  next: { position: 'absolute', top: 56, right: 20, zIndex: 10 },
  nextText: { fontSize: 14, color: 'rgba(255,246,232,0.7)' },
});
