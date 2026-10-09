import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Line as SvgLine, RadialGradient, Stop } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { WIDE_CAPS, layoutSky, lineOpacity, lineWidth, relativeStrength, selectConstellation, starBox, type StarLink, type Star } from '../constellation';
import { useCaptures } from '../useCaptures';
import { makeDemoCaptures, type DemoDay } from '../demoPersona';

// ふりかえり（夜）。川の画面の上に重ねて出す。背景（夜の静止画）は川の画面が持つ。
// 拾った言葉を星、同じ日に一緒に拾った関係を細い金色の線で結ぶ（共起ネットワーク）。
// 星の大きさ＝拾った回数、線の太さ＝共起回数。配置は力指向で、共起が強い言葉ほど近くに寄る

const TWINKLE_MS = 3200;
const TWINKLE_GROUPS = 3;
// 星座の上と下に空ける高さ（上: タイトル、下: 期間・ヒント・川へ戻る）
// 星の見方（右上の「星の見方」を押したときだけ出す）
const INTRO_LINES: [string, string][] = [
  ['星', 'あなたが拾った言葉です。大きいほど、よく拾いました。'],
  ['線', 'いっしょによく拾った言葉を、つないでいます。太いほど、よくいっしょでした。'],
  ['星座', '線でつながった星の集まりです。いっしょに出やすい言葉たちです。'],
  ['点線', '星に触れると出る、小さなつながりです。'],
  ['動かす', '星が多いときは、なぞって動かせます。2本指で、拡大・縮小もできます。'],
];

// 別のまとまりをつなぐ線は、うすい点線にする（太さ・濃さの倍率）
const CROSS_WIDTH = 0.7;
const CROSS_OPACITY = 0.6;
// 「見本」：星がまだ出ない間に見られる、ダミーの人の夜空（6週間ぶん。自分の記録ではない）。
// 毎日同じ形にする：決まった日（SAMPLE_ANCHOR）までの6週間を決まった種（SAMPLE_SEED）で作り、今日までずらす。
// 種は、300通りから星座がはっきり分かれるものを選んだ（17番：星22・5つの星座・2つ組なし。ユーザー「見本がさみしい」→ 案A「はい」2026-10-10）
const SAMPLE_SEED = 17;
const SAMPLE_ANCHOR = new Date(2026, 9, 9);
function sampleCaptures() {
  const days: DemoDay[] = [];
  for (let d = NIGHT_DAYS - 1; d >= 0; d--) {
    const day = new Date(SAMPLE_ANCHOR.getFullYear(), SAMPLE_ANCHOR.getMonth(), SAMPLE_ANCHOR.getDate() - d);
    days.push({ start: day.getTime(), dow: day.getDay() });
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const shift = Math.round((today.getTime() - SAMPLE_ANCHOR.getTime()) / 86400000);
  return makeDemoCaptures(days, SAMPLE_SEED).map((c) => {
    const t = new Date(c.capturedAt);
    t.setDate(t.getDate() + shift);
    return { ...c, capturedAt: t.getTime() };
  });
}

// 夜空で使う記録の期間（6週間。週ごとの偏りが出ない、7の倍数）
const NIGHT_DAYS = 42;
// 窓の端の色は、夜の背景の、その場所の色に合わせる（なじませるため。背景の絵を変えたら、合わせ直す）
const SKY_TOP_COLOR = 'rgb(7,19,36)';
const SKY_TOP_CLEAR = 'rgba(7,19,36,0)';
const SKY_BOTTOM_COLOR = 'rgb(24,38,64)';
const SKY_BOTTOM_CLEAR = 'rgba(24,38,64,0)';
const SKY_WINDOW_TOP = 90; // 星の層の窓の上（見出しの下）
const SKY_WINDOW_BOTTOM = 130;
const AREA_TOP = 100;
const AREA_BOTTOM = 150;
// 選んだ星とつながらない星・線の濃さ
const DIM = 0.3;

const STAR_CORE = 'rgb(255,250,230)';
const STAR_GLOW = 'rgb(255,232,155)';
const LINE_COLOR = 'rgb(255,215,140)';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

const groupOf = (word: string) => Math.floor(hash(word + '*') * TWINKLE_GROUPS);

const twinkle = (t: number) => {
  'worklet';
  const s = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
  return s * s;
};

// 星の周りの光。星ごとに、星のまわりだけの小さな絵にして、時間をずらした数グループでまたたかせる。
// 前は、夜空と同じ大きさの層を数枚またたかせていたが、毎コマ大きな絵を描き直し、スマホ（Android）で
// 記録4倍の見本（星46）のとき CPU 160〜180%・コマ落ち100%・押しても反応しない、になった（2026-10-09 実機で測った）
function GlowStar({ star, index, group, clock, dim }: { star: Star; index: number; group: number; clock: SharedValue<number>; dim: boolean }) {
  const style = useAnimatedStyle(() => ({ opacity: 0.55 + 0.45 * twinkle(clock.get() + group / TWINKLE_GROUPS) }));
  const R = star.r * 4.5;
  return (
    <View style={{ position: 'absolute', left: star.x - R, top: star.y - R, width: R * 2, height: R * 2, opacity: dim ? DIM : 1 }} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, style]}>
        <Svg width={R * 2} height={R * 2}>
          <Defs>
            <RadialGradient id={`star-glow-${index}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={STAR_GLOW} stopOpacity={0.32} />
              <Stop offset="0.4" stopColor={STAR_GLOW} stopOpacity={0.12} />
              <Stop offset="1" stopColor={STAR_GLOW} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={R} cy={R} r={R} fill={`url(#star-glow-${index})`} />
        </Svg>
      </Animated.View>
    </View>
  );
}

// 星座。期間を変えたら作り直し、星が浮かんでから線が引かれる
function Constellation({ stars, lines, selected, onSelect, onClear, width, height, viewW, viewH, home }: {
  stars: Star[];
  lines: StarLink[];
  selected: string | null;
  onSelect: (word: string) => void;
  // 空いているところを押したとき（選んだ星を外す）
  onClear: () => void;
  // 夜空（キャンバス）の大きさ。画面（viewW・viewH）より大きいときは、なぞって動かせる
  width: number;
  height: number;
  viewW: number;
  viewH: number;
  // 開いたときに、画面の真ん中に見せる、夜空の点（大きな夜空のとき）
  home?: { x: number; y: number };
}) {
  const clock = useSharedValue(0);
  const starsIn = useSharedValue(0);
  const linesIn = useSharedValue(0);
  useEffect(() => {
    clock.set(withRepeat(withTiming(1, { duration: TWINKLE_MS, easing: Easing.linear }), -1, false));
    starsIn.set(withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }));
    linesIn.set(withDelay(600, withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) })));
    return () => {
      cancelAnimation(clock);
      cancelAnimation(starsIn);
      cancelAnimation(linesIn);
    };
  }, [clock, starsIn, linesIn]);
  const starsStyle = useAnimatedStyle(() => ({ opacity: starsIn.get() }));
  const linesStyle = useAnimatedStyle(() => ({ opacity: linesIn.get() }));

  // つまんで拡大・縮小、なぞって動かす（試作 2026-10-09）。キャンバスの左上を基準に、位置(tx,ty)と倍率(sc)で動かす
  const winH = viewH - SKY_WINDOW_TOP - SKY_WINDOW_BOTTOM; // 星の窓の高さ
  const wide = width > viewW + 1 || height > viewH - SKY_WINDOW_BOTTOM + 1; // 画面より大きな夜空か
  // 夜空を見せる範囲（画面の座標）。大きな夜空は窓の中。収まる夜空は、これまでどおり画面の上から
  const topEdge = wide ? SKY_WINDOW_TOP : 0;
  const bottomEdge = SKY_WINDOW_TOP + winH;
  // いちばん引いたとき：大きな夜空は、全体が窓に入る倍率まで。収まる夜空は、いまの大きさより小さくしない
  const minScale = wide ? Math.min(1, viewW / width, (bottomEdge - topEdge) / height) : 1;
  const MAX_SCALE = 2.5;
  const sc = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const s0 = useSharedValue(1);
  const x0 = useSharedValue(0);
  const y0 = useSharedValue(0);
  const cx0 = useSharedValue(0);
  const cy0 = useSharedValue(0);

  // 倍率 k のときに、位置を置ける範囲。夜空が窓より小さい向きは、真ん中に置く
  const lowX = (k: number) => {
    'worklet';
    const room = viewW - width * k;
    return room >= 0 ? room / 2 : room;
  };
  const highX = (k: number) => {
    'worklet';
    const room = viewW - width * k;
    return room >= 0 ? room / 2 : 0;
  };
  const lowY = (k: number) => {
    'worklet';
    const room = bottomEdge - topEdge - height * k;
    return room >= 0 ? topEdge + room / 2 : topEdge + room;
  };
  const highY = (k: number) => {
    'worklet';
    const room = bottomEdge - topEdge - height * k;
    return room >= 0 ? topEdge + room / 2 : topEdge;
  };
  const clamp = (v: number, lo: number, hi: number) => {
    'worklet';
    return Math.min(hi, Math.max(lo, v));
  };
  useEffect(() => {
    cancelAnimation(sc);
    cancelAnimation(tx);
    cancelAnimation(ty);
    sc.set(1);
    // 開いたときは、home を窓の真ん中に。home がないときは、これまでどおり（夜空の上の余白は、見出しの裏に隠れる）
    tx.set(home ? clamp(viewW / 2 - home.x, lowX(1), highX(1)) : 0);
    ty.set(home ? clamp((topEdge + bottomEdge) / 2 - home.y, lowY(1), highY(1)) : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stars, sc, tx, ty]);
  // 指で動かしている間は、端を越えても、少しだけ（重く）ついてくる。離すと戻る
  const rubber = (v: number, lo: number, hi: number) => {
    'worklet';
    if (v < lo) return lo - (lo - v) * 0.3;
    if (v > hi) return hi + (v - hi) * 0.3;
    return v;
  };
  const rubberScale = (k: number) => {
    'worklet';
    if (k < minScale) return minScale * Math.pow(k / minScale, 0.3);
    if (k > MAX_SCALE) return MAX_SCALE * Math.pow(k / MAX_SCALE, 0.3);
    return k;
  };
  const SETTLE = { duration: 260, easing: Easing.out(Easing.cubic) };

  // なぞる：始めの位置からの動きで決める。離したあとは、勢いで少し滑って止まる
  const pan = Gesture.Pan()
    .minDistance(8)
    .maxPointers(1)
    .onStart(() => {
      cancelAnimation(tx);
      cancelAnimation(ty);
      x0.set(tx.get());
      y0.set(ty.get());
    })
    .onUpdate((e) => {
      const k = sc.get();
      tx.set(rubber(x0.get() + e.translationX, lowX(k), highX(k)));
      ty.set(rubber(y0.get() + e.translationY, lowY(k), highY(k)));
    })
    .onEnd((e, success) => {
      if (!success) return;
      const k = sc.get();
      const settle = (v: SharedValue<number>, lo: number, hi: number, velocity: number) => {
        const now = v.get();
        if (now < lo || now > hi) v.set(withTiming(clamp(now, lo, hi), SETTLE));
        else v.set(withDecay({ velocity, deceleration: 0.996, clamp: [lo, hi] }));
      };
      settle(tx, lowX(k), highX(k), e.velocityX);
      settle(ty, lowY(k), highY(k), e.velocityY);
    });
  // つまむ：つまみ始めの倍率と、指の中心の下にある夜空の点を覚えて、毎回そこから計算する（誤差がたまらない）
  // 指の中心が動けば、夜空もいっしょに動く。端や倍率の限界は、離したときに、なめらかに戻す
  const pinch = Gesture.Pinch()
    .onStart((e) => {
      cancelAnimation(sc);
      cancelAnimation(tx);
      cancelAnimation(ty);
      // つまみが始まったと分かるのは、指が少し開いてから。その分は倍率に入れない
      s0.set(sc.get() / e.scale);
      cx0.set((e.focalX - tx.get()) / sc.get());
      cy0.set((e.focalY - ty.get()) / sc.get());
      x0.set(e.focalX);
      y0.set(e.focalY);
    })
    .onUpdate((e) => {
      const k = rubberScale(s0.get() * e.scale);
      sc.set(k);
      tx.set(e.focalX - cx0.get() * k);
      ty.set(e.focalY - cy0.get() * k);
      x0.set(e.focalX);
      y0.set(e.focalY);
    })
    .onEnd(() => {
      // 倍率を限界の中に戻すときも、最後に指があった点を、なるべくその場に残す
      const k = clamp(sc.get(), minScale, MAX_SCALE);
      const nx = clamp(x0.get() - cx0.get() * k, lowX(k), highX(k));
      const ny = clamp(y0.get() - cy0.get() * k, lowY(k), highY(k));
      sc.set(withTiming(k, SETTLE));
      tx.set(withTiming(nx, SETTLE));
      ty.set(withTiming(ny, SETTLE));
    });
  const gesture = Gesture.Simultaneous(pan, pinch);
  // 続きがある向きに、しるしを出す（残りの距離が 24px 以上あるとき。近づくと、ふわっと消える）
  const more = (gap: number) => {
    'worklet';
    return Math.min(0.75, Math.max(0, gap / 60));
  };
  const edgeLeftStyle = useAnimatedStyle(() => ({ opacity: more(highX(sc.get()) - tx.get() - 24) }));
  const edgeRightStyle = useAnimatedStyle(() => ({ opacity: more(tx.get() - lowX(sc.get()) - 24) }));
  const edgeUpStyle = useAnimatedStyle(() => ({ opacity: more(highY(sc.get()) - ty.get() - 24) }));
  const edgeDownStyle = useAnimatedStyle(() => ({ opacity: more(ty.get() - lowY(sc.get()) - 24) }));
  // 拡大は、夜空の真ん中を中心にかかる（左上を中心にする指定は、スマホで効かないことがある）。
  // その分を位置でずらして、夜空の点 p が、画面の (tx + k·p) に来るようにする
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

  const at = useMemo(() => new Map(stars.map((s) => [s.word, s])), [stars]);
  // 太さの基準は、ふだん出ている線（星座の中の線）だけで決める。点線は、触れたときに出るだけなので、基準に入れない（触れたとき、ほかの線の太さが変わらないように）
  const rel = useMemo(() => relativeStrength(lines.filter((l) => !l.cross)), [lines]);
  const neighbors = useMemo(() => {
    const set = new Set<string>();
    if (!selected) return set;
    set.add(selected);
    for (const l of lines) {
      if (l.a === selected) set.add(l.b);
      if (l.b === selected) set.add(l.a);
    }
    return set;
  }, [lines, selected]);
  const lit = (word: string) => !selected || neighbors.has(word);

  return (
    <GestureDetector gesture={gesture}>
    <View style={StyleSheet.absoluteFill}>
    {/* 画面いっぱいを、なぞる操作の受け皿にする。空いているところを押すと、選んだ星を外す */}
    <Pressable style={StyleSheet.absoluteFill} onPress={onClear} />
    {/* 星の層は、木や山（下の背景）の上までの窓で切る。下の背景は、そのまま見せる */}
    <View style={styles.skyWindow} pointerEvents="box-none">
    <Animated.View style={[{ position: 'absolute', left: 0, top: -SKY_WINDOW_TOP, width, height }, canvasStyle]} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, linesStyle]} pointerEvents="none">
        <Svg width={width} height={height}>
          {lines.filter((l) => !l.cross || l.a === selected || l.b === selected).map((l) => {
            const a = at.get(l.a)!;
            const b = at.get(l.b)!;
            const on = !selected || l.a === selected || l.b === selected;
            return (
              <SvgLine
                key={`${l.a}-${l.b}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={LINE_COLOR}
                strokeWidth={lineWidth(rel(l.strength)) * (l.cross ? CROSS_WIDTH : 1)}
                strokeOpacity={lineOpacity(rel(l.strength)) * (l.cross ? CROSS_OPACITY : 1) * (on ? (selected ? 1.5 : 1) : DIM)}
                strokeLinecap="round"
                strokeDasharray={l.cross ? '3 4' : undefined}
              />
            );
          })}
        </Svg>
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, starsStyle]} pointerEvents="box-none">
        {stars.map((s, i) => (
          <GlowStar key={s.word} star={s} index={i} group={groupOf(s.word)} clock={clock} dim={!lit(s.word)} />
        ))}
        <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
          {stars.map((s) => (
            <Circle key={s.word} cx={s.x} cy={s.y} r={s.r} fill={STAR_CORE} opacity={lit(s.word) ? 1 : DIM} />
          ))}
        </Svg>
        {stars.map((s) => {
          const box = starBox(s, 4);
          const on = lit(s.word);
          return (
            <Pressable
              key={s.word}
              style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, alignItems: 'center' }}
              onPress={() => onSelect(s.word)}
            >
              <Text
                style={[
                  styles.label,
                  {
                    marginTop: 4 + s.r * 2 + 3,
                    fontSize: s.labelSize,
                    lineHeight: s.labelH,
                    color: s.word === selected ? 'rgba(255,232,170,1)' : `rgba(255,246,232,${on ? 0.85 : 0.3})`,
                  },
                ]}
              >
                {s.word}
              </Text>
            </Pressable>
          );
        })}
      </Animated.View>
    </Animated.View>
    {/* 画面の外に続きがあるとき、その端に、小さなしるしを出す */}
    {wide && (
      <>
        <Animated.Text style={[styles.edgeMark, styles.edgeLeft, edgeLeftStyle]} pointerEvents="none">‹</Animated.Text>
        <Animated.Text style={[styles.edgeMark, styles.edgeRight, edgeRightStyle]} pointerEvents="none">›</Animated.Text>
        <Animated.Text style={[styles.edgeMark, styles.edgeUp, edgeUpStyle]} pointerEvents="none">⌃</Animated.Text>
        <Animated.Text style={[styles.edgeMark, styles.edgeDown, edgeDownStyle]} pointerEvents="none">⌄</Animated.Text>
      </>
    )}
    {/* 画面より大きい夜空のときは、窓の上と下の端を暗くして、星が、固定のボタンや説明と重ならないようにする */}
    {wide && (
      <>
        <LinearGradient colors={[SKY_TOP_COLOR, SKY_TOP_CLEAR]} style={styles.fadeTop} pointerEvents="none" />
        <LinearGradient colors={[SKY_BOTTOM_CLEAR, SKY_BOTTOM_COLOR]} style={styles.fadeBottom} pointerEvents="none" />
      </>
    )}
    </View>
    </View>
    </GestureDetector>
  );
}

type Props = {
  width: number;
  height: number;
  // 拾ったことばでタップした言葉。中心に置いて選んだ状態で開く
  focus?: string;
  // 1つ前（拾ったことば）へ
  onBack: () => void;
  onRiver: () => void;
};

export default function NightOverlay({ width, height, focus, onBack, onRiver }: Props) {
  const [selected, setSelected] = useState<string | null>(focus ?? null);
  const [showSample, setShowSample] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const closeIntro = () => setIntroOpen(false);

  // 夜空は直近6週間の本物の記録（決定 2026-10-09）。読み込み中は何も置かない
  const real = useCaptures(NIGHT_DAYS);
  const sample = useMemo(() => (showSample ? sampleCaptures() : null), [showSample]);
  const captures = showSample ? sample : real;
  const { stars, lines, canvasW, canvasH, home } = useMemo(() => {
    const f = showSample ? undefined : focus;
    // 1画面に収まらないほど星があるときは、上限をゆるめて、画面より大きな夜空にする（なぞって動かす）
    let picked = selectConstellation(captures ?? [], f);
    if (picked.truncated) picked = selectConstellation(captures ?? [], f, WIDE_CAPS);
    const area = { x: 20, y: AREA_TOP, w: width - 40, h: height - AREA_TOP - AREA_BOTTOM };
    const sky = layoutSky(picked.stats, picked.lines, area, f);
    return { stars: sky.stars, lines: picked.lines, canvasW: Math.max(width, sky.extentW), canvasH: Math.max(height - SKY_WINDOW_BOTTOM, sky.extentH), home: sky.home };
  }, [captures, focus, showSample, width, height]);

  const current = selected ? stars.find((s) => s.word === selected) : undefined;
  const degree = current ? lines.filter((l) => l.a === current.word || l.b === current.word).length : 0;
  // 画面に数字を出さない（分析されている感じを出さない。docs/SPEC.md「大事にすること」2026-10-05 決定）
  // 点線でつながる言葉（強い順に2つまで）
  const crossPartners = current
    ? lines
        .filter((l) => l.cross && (l.a === current.word || l.b === current.word))
        .sort((p, q) => q.strength - p.strength)
        .slice(0, 2)
        .map((l) => (l.a === current.word ? l.b : l.a))
    : [];
  const hint = current
    ? degree > 0
      ? `「${current.word}」とよく一緒の星が、光っています${
          crossPartners.length > 0 ? `\n「${current.word}」は、${crossPartners.map((w) => `「${w}」`).join('')}とも、小さくつながっています` : ''
        }`
      : `「${current.word}」のまわりは、もう少し拾うと見えてきます`
    : showSample
      ? '星に触れてみてください'
      : '大きな星＝よく拾った言葉　太い線＝よく一緒に拾った言葉';
  // 読み込みが終わって、星が1つも出ないとき（使い始め）
  const isEmpty = !showSample && real !== undefined && lines.length === 0;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Constellation
        stars={stars}
        lines={lines}
        selected={current ? current.word : null}
        onSelect={(w) => setSelected((prev) => (prev === w ? null : w))}
        onClear={() => setSelected(null)}
        width={canvasW}
        height={canvasH}
        viewW={width}
        viewH={height}
        home={home}
      />

      {isEmpty && (
        <View style={[styles.emptyRow, { top: AREA_TOP + (height - AREA_TOP - AREA_BOTTOM) / 2 + 24 }]} pointerEvents="box-none">
          <Text style={styles.empty}>もう少し拾うと見えてきます</Text>
          <Pressable hitSlop={12} onPress={() => setShowSample(true)} style={styles.sampleBtn}>
            <Text style={styles.sampleBtnText}>見本を見る</Text>
          </Pressable>
        </View>
      )}
      {/* 横幅いっぱいのタイトルはボタンより先に置き、タップを受けない（後に置くとスマホでボタンの上に重なって押せない） */}
      <View style={styles.titleRow} pointerEvents="none">
        <Text style={styles.title}>夜空</Text>
      </View>

      {/* 左上：ふだんは「← ことばへ」。見本を見ているときは、見本をとじる「×」になる */}
      {introOpen ? null : showSample ? (
        <Pressable style={[styles.closeBtn, styles.closeLeft]} hitSlop={14} onPress={() => { setShowSample(false); setSelected(null); }} accessibilityLabel="とじる">
          <Text style={styles.closeBtnText}>×</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.back} hitSlop={16} onPress={onBack}>
          <Text style={styles.backText}>← ことばへ</Text>
        </Pressable>
      )}


      {!introOpen && (
        <Pressable style={styles.help} hitSlop={12} onPress={() => setIntroOpen(true)}>
          <Text style={styles.helpText}>星の見方</Text>
        </Pressable>
      )}

      {introOpen && (
        <Pressable style={styles.intro} onPress={closeIntro}>
          <View style={styles.introCard}>
            <Text style={styles.introTitle}>星の見方</Text>
            {INTRO_LINES.map(([label, body]) => (
              <View key={label} style={styles.introRow}>
                <Text style={styles.introLabel}>{label}</Text>
                <Text style={styles.introBody}>{body}</Text>
              </View>
            ))}
            <Text style={styles.introEnd}>どんな言葉が、いっしょに出てくるか、ながめてみてください。</Text>
          </View>
          <View style={[styles.closeBtn, styles.closeRight]}>
            <Text style={styles.closeBtnText}>×</Text>
          </View>
        </Pressable>
      )}

      <Text style={styles.hint} pointerEvents="none">
        {hint}
      </Text>

      <Pressable style={styles.river} hitSlop={16} onPress={onRiver}>
        <Text style={styles.riverText}>川へ戻る</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // 星の層の窓。上は見出しの下から、下は、説明・ボタン・木や山が見える所（下から130px）を空ける。窓の外は切る（画面を、なぞって動かすため）
  skyWindow: { position: 'absolute', left: 0, right: 0, top: SKY_WINDOW_TOP, bottom: SKY_WINDOW_BOTTOM, overflow: 'hidden' },
  edgeMark: { position: 'absolute', fontSize: 26, lineHeight: 30, color: 'rgba(255,232,170,0.9)', textAlign: 'center', width: 30 },
  edgeLeft: { left: 4, top: '45%' },
  edgeRight: { right: 4, top: '45%' },
  edgeUp: { top: 30, alignSelf: 'center', left: '50%', marginLeft: -15 },
  edgeDown: { bottom: 30, left: '50%', marginLeft: -15 },
  fadeTop: { position: 'absolute', left: 0, right: 0, top: 0, height: 64 },
  fadeBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 64 },
  back: { position: 'absolute', top: 56, left: 20, zIndex: 10 },
  backText: { fontSize: 14, color: 'rgba(255,246,232,0.7)' },
  titleRow: { position: 'absolute', top: 54, left: 0, right: 0, alignItems: 'center' },
  title: { fontSize: 16, color: 'rgba(255,246,232,0.9)', letterSpacing: 2 },
  label: {
    fontWeight: '300',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(6,16,30,0.8)',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 0 },
  },
  emptyRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  empty: { fontSize: 13, color: 'rgba(255,246,232,0.7)', letterSpacing: 1 },
  sampleBtn: { marginTop: 14, paddingHorizontal: 18, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,215,140,0.55)' },
  sampleBtnText: { fontSize: 13, color: 'rgba(255,232,170,0.95)', letterSpacing: 1 },
  help: { position: 'absolute', top: 54, right: 20, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,246,232,0.4)', zIndex: 10 },
  helpText: { fontSize: 12, color: 'rgba(255,246,232,0.8)', letterSpacing: 1 },
  intro: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(6,12,28,0.82)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, zIndex: 30 },
  introCard: { width: '100%', maxWidth: 360 },
  introTitle: { fontSize: 17, color: 'rgba(255,246,232,0.95)', letterSpacing: 2, textAlign: 'center', marginBottom: 22 },
  introRow: { flexDirection: 'row', marginBottom: 14 },
  introLabel: { width: 48, fontSize: 14, color: 'rgba(255,215,140,0.95)' },
  introBody: { flex: 1, fontSize: 14, lineHeight: 22, color: 'rgba(255,246,232,0.85)' },
  introEnd: { marginTop: 10, fontSize: 13, lineHeight: 21, color: 'rgba(255,246,232,0.7)', textAlign: 'center' },
  closeBtn: { position: 'absolute', top: 52, width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,246,232,0.4)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  closeBtnText: { fontSize: 18, lineHeight: 20, color: 'rgba(255,246,232,0.85)' },
  closeLeft: { left: 20 },
  closeRight: { right: 20 },
  hint: { position: 'absolute', bottom: 76, left: 0, right: 0, paddingHorizontal: 12, textAlign: 'center', fontSize: 11, color: 'rgba(255,246,232,0.6)', letterSpacing: 1 },
  river: { position: 'absolute', bottom: 40, alignSelf: 'center', zIndex: 10 },
  riverText: { fontSize: 13, color: 'rgba(255,246,232,0.75)' },
});
