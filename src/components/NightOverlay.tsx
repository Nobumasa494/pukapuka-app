import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Line as SvgLine, RadialGradient, Stop } from 'react-native-svg';
import { layoutConstellation, lineOpacity, lineWidth, selectConstellation, starBox, type Line, type Star } from '../constellation';
import { useCaptures } from '../useCaptures';

// ふりかえり（夜）。川の画面の上に重ねて出す。背景（夜の静止画）は川の画面が持つ。
// 拾った言葉を星、同じ日に一緒に拾った関係を細い金色の線で結ぶ（共起ネットワーク）。
// 星の大きさ＝拾った回数、線の太さ＝共起回数。配置は力指向で、共起が強い言葉ほど近くに寄る

const TWINKLE_MS = 3200;
const TWINKLE_GROUPS = 3;
// 星座の上と下に空ける高さ（上: タイトル、下: 期間・ヒント・川へ戻る）
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

// 星の周りの光。言葉ごとにアニメーションを持たせず、時間をずらした数枚の層ごとにまたたかせる
function GlowLayer({ group, clock, stars, lit, width, height }: {
  group: number;
  clock: SharedValue<number>;
  stars: Star[];
  lit: (word: string) => boolean;
  width: number;
  height: number;
}) {
  const style = useAnimatedStyle(() => ({ opacity: 0.55 + 0.45 * twinkle(clock.get() + group / TWINKLE_GROUPS) }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id={`star-glow-${group}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={STAR_GLOW} stopOpacity={0.32} />
            <Stop offset="0.4" stopColor={STAR_GLOW} stopOpacity={0.12} />
            <Stop offset="1" stopColor={STAR_GLOW} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {stars
          .filter((s) => groupOf(s.word) === group)
          .map((s) => (
            <Circle
              key={s.word}
              cx={s.x}
              cy={s.y}
              r={s.r * 4.5}
              fill={`url(#star-glow-${group})`}
              opacity={lit(s.word) ? 1 : DIM}
            />
          ))}
      </Svg>
    </Animated.View>
  );
}

// 星座。期間を変えたら作り直し、星が浮かんでから線が引かれる
function Constellation({ stars, lines, selected, onSelect, width, height }: {
  stars: Star[];
  lines: Line[];
  selected: string | null;
  onSelect: (word: string) => void;
  width: number;
  height: number;
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

  const at = useMemo(() => new Map(stars.map((s) => [s.word, s])), [stars]);
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
    <>
      <Animated.View style={[StyleSheet.absoluteFill, linesStyle]} pointerEvents="none">
        <Svg width={width} height={height}>
          {lines.map((l) => {
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
                strokeWidth={lineWidth(l.count)}
                strokeOpacity={lineOpacity(l.count) * (on ? (selected ? 1.5 : 1) : DIM)}
                strokeLinecap="round"
              />
            );
          })}
        </Svg>
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, starsStyle]} pointerEvents="box-none">
        {Array.from({ length: TWINKLE_GROUPS }, (_, g) => (
          <GlowLayer key={g} group={g} clock={clock} stars={stars} lit={lit} width={width} height={height} />
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
    </>
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

  // 夜空は直近ひと月の本物の記録（決定 2026-10-06）。読み込み中は何も置かない
  const captures = useCaptures(30);
  const { stars, lines } = useMemo(() => {
    const picked = selectConstellation(captures ?? [], focus);
    const area = { x: 20, y: AREA_TOP, w: width - 40, h: height - AREA_TOP - AREA_BOTTOM };
    return { stars: layoutConstellation(picked.stats, picked.lines, area, focus), lines: picked.lines };
  }, [captures, focus, width, height]);

  const current = selected ? stars.find((s) => s.word === selected) : undefined;
  const degree = current ? lines.filter((l) => l.a === current.word || l.b === current.word).length : 0;
  // 画面に数字を出さない（分析されている感じを出さない。docs/SPEC.md「大事にすること」2026-10-05 決定）
  const hint = current
    ? degree > 0
      ? `「${current.word}」とよく一緒の星が、光っています`
      : `「${current.word}」のまわりは、もう少し拾うと見えてきます`
    : '大きな星ほど、よく拾った言葉　線は、よく一緒に拾った言葉';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* 空いているところを押すと、選んだ星を外す */}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelected(null)} />

      <Constellation
        stars={stars}
        lines={lines}
        selected={current ? current.word : null}
        onSelect={(w) => setSelected((prev) => (prev === w ? null : w))}
        width={width}
        height={height}
      />

      {lines.length === 0 && (
        <View style={[styles.emptyRow, { top: AREA_TOP + (height - AREA_TOP - AREA_BOTTOM) / 2 + 24 }]} pointerEvents="none">
          <Text style={styles.empty}>もう少し拾うと見えてきます</Text>
        </View>
      )}

      {/* 横幅いっぱいのタイトルはボタンより先に置き、タップを受けない（後に置くとスマホでボタンの上に重なって押せない） */}
      <View style={styles.titleRow} pointerEvents="none">
        <Text style={styles.title}>夜空</Text>
      </View>

      <Pressable style={styles.back} hitSlop={16} onPress={onBack}>
        <Text style={styles.backText}>← ことばへ</Text>
      </Pressable>

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
  hint: { position: 'absolute', bottom: 76, left: 0, right: 0, textAlign: 'center', fontSize: 11, color: 'rgba(255,246,232,0.6)', letterSpacing: 1 },
  river: { position: 'absolute', bottom: 40, alignSelf: 'center', zIndex: 10 },
  riverText: { fontSize: 13, color: 'rgba(255,246,232,0.75)' },
});
