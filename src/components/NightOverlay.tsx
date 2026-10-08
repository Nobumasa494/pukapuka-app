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
];

// 別のまとまりをつなぐ線は、うすい点線にする（太さ・濃さの倍率）
const CROSS_WIDTH = 0.7;
const CROSS_OPACITY = 0.6;
// 「見本」：星がまだ出ない間に見られる、ダミーの人の夜空（6週間ぶん。自分の記録ではない）
function sampleCaptures() {
  const days: DemoDay[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let d = NIGHT_DAYS - 1; d >= 0; d--) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - d);
    days.push({ start: day.getTime(), dow: day.getDay() });
  }
  return makeDemoCaptures(days, 5, Date.now());
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
function Constellation({ stars, lines, selected, onSelect, onClear, width, height, viewW, viewH }: {
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

  // なぞって動かす（キャンバスが画面より大きいときだけ）
  const minX = Math.min(0, viewW - width);
  const minY = Math.min(0, viewH - height);
  const pannable = minX < -1 || minY < -1;
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  useEffect(() => {
    tx.set(0);
    ty.set(0);
  }, [stars, tx, ty]);
  const pan = Gesture.Pan()
    .enabled(pannable)
    .minDistance(8)
    .onBegin(() => {
      startX.set(tx.get());
      startY.set(ty.get());
    })
    .onUpdate((e) => {
      tx.set(Math.min(0, Math.max(minX, startX.get() + e.translationX)));
      ty.set(Math.min(0, Math.max(minY, startY.get() + e.translationY)));
    });
  const canvasStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.get() }, { translateY: ty.get() }] }));

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
    <GestureDetector gesture={pan}>
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
    </Animated.View>
    {/* 画面より大きい夜空のときは、窓の上と下の端を暗くして、星が、固定のボタンや説明と重ならないようにする */}
    {pannable && (
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
  const { stars, lines, canvasW, canvasH } = useMemo(() => {
    const f = showSample ? undefined : focus;
    // 1画面に収まらないほど星があるときは、上限をゆるめて、画面より大きな夜空にする（なぞって動かす）
    let picked = selectConstellation(captures ?? [], f);
    if (picked.truncated) picked = selectConstellation(captures ?? [], f, WIDE_CAPS);
    const area = { x: 20, y: AREA_TOP, w: width - 40, h: height - AREA_TOP - AREA_BOTTOM };
    const sky = layoutSky(picked.stats, picked.lines, area, f);
    return { stars: sky.stars, lines: picked.lines, canvasW: Math.max(width, sky.extentW), canvasH: Math.max(height, sky.extentH) };
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
