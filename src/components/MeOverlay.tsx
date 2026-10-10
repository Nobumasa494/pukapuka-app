import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useCaptures, useDeviceId } from '../useCaptures';
import { meCache } from '../meCache';
import SAMPLE from '../meSampleResult.json';
import HelpStar from './HelpStar';
import { SOURCE_DAYS, computeMe, dayNumber, countsFor, examples, type Counts, type Example, type MeResult, type SourceItem } from '../flow';

// わたしのこと（夜明け）。川の画面の上に重ねて出す（SPEC 第2部 C3.）。
// 開くと、いちばん上に元気・好奇心の源が1つだけ大きく出る。下へスクロールすると、数字・いろいろな源・めぐり・育っていること。
// 計算は重いので（並べかえ検定）、週の終わりの結果は端末にとっておき、毎回は「今」だけ計算する（src/meCache.ts）

// 読む期間：源は直近12週。歩み（見つかってきたこと）のために、その倍まで読む
const READ_DAYS = SOURCE_DAYS * 2;

// 夜明けの空（上→下）。星空より明るく、文字が読みやすい。動かさない（毎コマの描き直しをしない）
const DAWN = ['#8fa3cf', '#b6b4d8', '#dcc3d6', '#efc9cf', '#f8d6c4', '#fde8cc'] as const;
const INK = '#2b2640';
const SUB = '#5f5876';
const PLUM = '#7d5878';
const LINE = 'rgba(43,38,64,0.14)';
const SHEET = 'rgb(253,249,246)';
const HEADER_H = 96;
// 明朝体（デザインの決まり：日本語は明朝の細い字）。アプリに字の部品を入れると数MB〜十数MB重くなるので、端末にある明朝体を使う
const SERIF = Platform.select({ ios: 'Hiragino Mincho ProN', android: 'serif', default: '"Noto Serif JP","Hiragino Mincho ProN","Yu Mincho","YuMincho",serif' });

// 見方（右上の印を押したときだけ出す。星空の「星の見方」と同じ形）
const INTRO_LINES: [string, string][] = [
  ['いちばん上', '何をした日のあとに、どんな言葉を拾うことが多いか。新しく見つかったものがあれば、それを上に出します。「たとえば」は、実際にそうなった日。'],
  ['01 そのあとに', '左の言葉を拾った日の、次の日から3日のうちに、右の言葉（元気・好奇心の言葉）を拾った回数。この12週で数えています。'],
  ['02 行ったり来たり', '行きも帰りも、よく起きている二つ。数字は、左の言葉の日の、次の日から3日のうちに右の言葉を拾った回数。良い・悪いはありません。'],
  ['03 よく拾う言葉の変化', '元気・好奇心の言葉を拾った日の数を、前の期間と最近の期間とで並べたもの。期間は、上の日付のとおりです。'],
];
const HELP_COLOR = '#8f5f8a';


// 言い方の決まり（スキル /pukapuka-me の 3.）：「〜のあとに」と書く。「〜のせいで」「〜すると」とは書かない
function heroText(x: SourceItem, n: number): string {
  if (x.stage === 'sure') return `「${x.word}」の日のあとは、\n「${x.to}」を\n拾うことが多いみたい`;
  // 確かめ中・見えはじめ：確かさは言わず、数えた事実だけ（2026-10-10 ユーザー「多いかもは曖昧で混乱する」）
  return `「${x.word}」の日のあとに、\n「${x.to}」を\n拾った日は、\nいま${n}回です`;
}
// 比べる期間を、実際の日付で書く（「4週どうし」は何のことか伝わらなかった。2026-10-11 ユーザー）。dayNumber は UTC の日の番号
const dayText = (day: number, shiftDays = 0) => {
  const d = new Date((day + shiftDays) * 86400000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};
const rangeText = (from: number, span: number, shiftDays = 0) => `${dayText(from, shiftDays)}〜${dayText(from + span - 1, shiftDays)}`;
const mdDay = (day: number, shiftDays = 0) => {
  const d = new Date((day + shiftDays) * 86400000); // dayNumber は UTC の日で数えている
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
};

type Caps = { word: string; capturedAt: number }[];
type Numbers = Example[];

// 記録から、わたしのことの結果を計算する（とっておいた結果を使い、いちばん上を先に出す）。key が変わったときだけ計算し直す。
// make は計算を始めるときに呼ぶ（今の時刻を読むため、描くたびには呼ばない）
type Input = { caps: Caps; now: number; cacheId: string };
function useMe(key: string | null, make: () => Input) {
  const [state, setState] = useState<{ key: string; result: MeResult; numbers: Numbers | null; counts: Counts; shiftDays: number; now: number; first: number } | null>(null);
  const running = useRef(0);
  useEffect(() => {
    if (!key) return;
    const run = ++running.current;
    const { caps, now, cacheId } = make();
    const show = (r: MeResult) => {
      if (run !== running.current) return;
      setState({ key, result: r, shiftDays: 0, now, first: caps.length ? Math.min(...caps.map((c) => c.capturedAt)) : now, counts: countsFor(caps, now, r), numbers: !r.few && r.top ? examples(caps, now, r.top.word, r.top.to) : null });
    };
    computeMe(caps, now, meCache(cacheId), undefined, show).then(show, () => {});
    // make は key が変わったときだけ呼ぶ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const cur = state && state.key === key ? state : null;
  return { result: cur?.result ?? null, numbers: cur?.numbers ?? null, counts: cur?.counts ?? {}, shiftDays: cur?.shiftDays ?? 0, now: cur?.now ?? 0, first: cur?.first ?? 0, busy: !!key && !cur };
}

export default function MeOverlay({ width, height, onBack }: { width: number; height: number; onBack: () => void }) {
  const captures = useCaptures(READ_DAYS);
  const deviceId = useDeviceId();
  const [showSample, setShowSample] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  // 記録が変わったときだけ計算し直す（拾った数と、いちばん新しい時刻で見分ける）
  const sig = captures ? `${captures.length}:${captures.reduce((m, c) => Math.max(m, c.capturedAt), 0)}` : null;
  const real = useMe(captures && deviceId ? `${deviceId}:${sig}` : null, () => ({
    caps: (captures ?? []).map((c) => ({ word: c.word, capturedAt: c.capturedAt })),
    now: Date.now(),
    cacheId: deviceId ?? '',
  }));
  // 見本（星空と同じ：何も出ないときと、見方の中から見られる。決定 2026-10-10 ユーザー「星空と同じように何も表示されないときは見本を出してほしい」）。
  // 見本はいつも同じ人・同じ日なので、前もって計算した結果を使う（scripts/me/make-sample.ts。スマホで計算すると3〜6秒かかった）。
  // 日付だけ、見本の日から今日までずらして見せる
  const [sampleShift, setSampleShift] = useState(0);
  const sample = { result: SAMPLE.result as MeResult, numbers: SAMPLE.examples as Numbers, counts: SAMPLE.counts as Counts, shiftDays: sampleShift, now: SAMPLE.at, first: SAMPLE.first, busy: false };
  const openSample = () => {
    const a = new Date(SAMPLE.at), t = new Date();
    setSampleShift(Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime() - new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()) / 86400000));
    setShowSample(true);
  };
  const { result, numbers, counts, shiftDays, now, first } = showSample ? sample : real;
  // 数える期間：今日から12週前まで。使い始めて12週たっていなければ、使い始めから今日まで（2026-10-11）
  const periodStart = first ? Math.max(dayNumber(first), dayNumber(now) - SOURCE_DAYS + 1) : 0;
  const period = first ? `${dayText(periodStart, shiftDays)}〜${dayText(dayNumber(now), shiftDays)}` : '';
  const progress = showSample ? sample.busy : real.busy;
  // 何も出ない（①文だけ、または源が1つもない）とき、真ん中に「見本を見る」を出す
  const nothing = !showSample && real.result !== null && (real.result.few || !real.result.top);

  const top = result && !result.few ? result.top : null;
  // 下の紙が見出しの下まで来たら、見出しの帯を紙の色にする（夜明けの青い帯が白い紙の上に重なって見えないように）
  const [onSheet, setOnSheet] = useState(false);
  const sheetTop = useRef(0);

  return (
    <View style={[StyleSheet.absoluteFill, { width, height }]}>
      <LinearGradient colors={DAWN} style={StyleSheet.absoluteFill} />
      <ScrollView
        style={StyleSheet.absoluteFill}
        contentContainerStyle={{ paddingBottom: 0 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={(e) => {
          const on = sheetTop.current > 0 && e.nativeEvent.contentOffset.y > sheetTop.current - HEADER_H;
          if (on !== onSheet) setOnSheet(on);
        }}
      >
        {/* 開いたときの1画面：いちばん上の源を1つだけ大きく。疲れている日はここだけ読めばよい */}
        <View style={[styles.first, { minHeight: height }]}>
          {!result ? (
            <Text style={styles.wait}>{progress ? (showSample ? '見本を用意しています…' : '夜が明けるのを待っています…') : ''}</Text>
          ) : result.few ? (
            <Text style={styles.heroQuiet}>元気な日が、あと少し集まると{'\n'}見えてきます</Text>
          ) : top ? (
            <View style={{ alignItems: 'center' }}>
              {/* 新しく確かになったものが上にあるとき、なぜ上にあるかを添える（一覧の先頭と違うことがあるため。2026-10-10 ユーザー「はい」） */}
              {result.topIsNew && <Text style={styles.heroNew}>新しく見つかりました</Text>}
              <Text style={styles.hero}>{heroText(top, counts[`${top.word}→${top.to}`] ?? 0)}</Text>
              {top.stage === 'sure' && <Text style={styles.heroCount}>この12週で {counts[`${top.word}→${top.to}`] ?? 0}回</Text>}
              {top.stage !== 'sure' && <Text style={styles.heroCount}>あと数回増えると、{'\n'}はっきりしてくるかもしれません</Text>}
              {/* たとえば：実際にそうなった日（割合の数字より分かりやすい） */}
              {numbers && numbers.length > 0 && (
                <View style={styles.ex}>
                  <Rule label="たとえば" />
                  {numbers.map((e) => (
                    <View key={e.from} style={styles.exRow}>
                      <Text style={styles.exDate}>{mdDay(e.from, shiftDays)}</Text>
                      <Word word={top.word} />
                      <Text style={styles.arrow}>⟶</Text>
                      <Text style={styles.exDate}>{mdDay(e.to, shiftDays)}</Text>
                      <Word word={top.to} />
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <Text style={styles.heroQuiet}>まだ、はっきりした流れは{'\n'}見えていません</Text>
          )}
          {nothing && (
            <Pressable hitSlop={12} onPress={openSample} style={styles.sampleBtn} accessibilityRole="button">
              <Text style={styles.sampleBtnText}>見本を見る</Text>
            </Pressable>
          )}
          {result && !result.few && <Text style={styles.more}>ほかのこと　︾</Text>}
        </View>

        {result && !result.few && (
          // 下の部分：章ごとに分け、夜明けの空からせり上がる紙に、細い線と余白、明朝で置く。
          // 確かさは記号ではなく、短い言葉の札（多いみたい／多いかも／あった日がある）で各行に書く。
          // 点（●●○）や時間の軸の絵は、意味を読み解く必要があり分かりにくかった（2026-10-10 ユーザー「記号の意味も分かりづらい」）
          <View style={styles.sheet} onLayout={(e) => (sheetTop.current = e.nativeEvent.layout.y)}>
            {/* 確かなもの（偶然ではないと確かめられたもの）だけを並べ、回数だけを書く。確かさは見せない（2026-10-10 ユーザー「それがいいね」） */}
            <Chapter no="01" title="そのあとに" note={`左の言葉を拾った日の、次の日から3日のうちに、右の言葉を拾った回数\n（${period} のあいだ）`}>
              {(() => {
                const xs = result.list.filter((x) => x.stage === 'sure').slice(0, 5);
                return xs.length ? (
                  xs.map((x) => <Row key={x.word} a={x.word} b={x.to} mark="⟶" n={counts[`${x.word}→${x.to}`] ?? 0} />)
                ) : (
                  <Text style={styles.empty}>拾う日が増えると、ここに並んでいきます</Text>
                );
              })()}
            </Chapter>

            <Chapter no="02" title="行ったり来たり" note={`行きも帰りも、よく起きている二つ\n（${period} のあいだ）`}>
              {result.loops.some((x) => x.stage === 'sure') ? (
                result.loops
                  .filter((x) => x.stage === 'sure')
                  .map((x) => (
                    <View key={x.a + x.b} style={styles.loopBlock}>
                      <Text style={styles.loopTitle}>
                        {x.a}
                        <Text style={styles.mark}>{'  ⇄  '}</Text>
                        {x.b}
                      </Text>
                      <Row a={x.a} b={x.b} mark="⟶" n={counts[`${x.a}→${x.b}`] ?? 0} small />
                      <Row a={x.b} b={x.a} mark="⟶" n={counts[`${x.b}→${x.a}`] ?? 0} small />
                    </View>
                  ))
              ) : (
                <Text style={styles.empty}>拾う日が増えると、ここに並んでいきます</Text>
              )}
            </Chapter>

            {/* よく拾う言葉の変化：時期と日数で、前と最近を並べる（増えた順） */}
            <Chapter no="03" title="よく拾う言葉の変化" note="元気・好奇心の言葉を拾った日の数" last>
              {result.shift ? (
                <View>
                  {result.shift.span < 42 && <Text style={styles.shiftNote}>まだ記録が少ないので、短い期間で並べています。記録がたまると、期間が長くなります。</Text>}
                  <View style={styles.shiftHeadRow}>
                    <Text style={styles.shiftWordCol} />
                    <Text style={styles.shiftHead}>{rangeText(result.shift.beforeFrom, result.shift.span, shiftDays)}</Text>
                    <Text style={styles.shiftHeadArrow} />
                    <Text style={styles.shiftHead}>{rangeText(result.shift.afterFrom, result.shift.span, shiftDays)}</Text>
                  </View>
                  {result.shift.rows.map((x) => (
                    <View key={x.word} style={styles.shiftRow}>
                      <Text style={[styles.rowWords, styles.shiftWordCol]}>{x.word}</Text>
                      <Text style={styles.shiftNum}>
                        {x.before}
                        <Text style={styles.countUnit}>日</Text>
                      </Text>
                      <Text style={styles.shiftHeadArrow}>⟶</Text>
                      <Text style={[styles.shiftNum, x.after > x.before && styles.shiftUp]}>
                        {x.after}
                        <Text style={styles.countUnit}>日</Text>
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.empty}>あと少し記録がたまると見えてきます</Text>
              )}
            </Chapter>
          </View>
        )}
      </ScrollView>

      {/* 上の見出しの下に、夜明けの空の色の帯（スクロールした文字が見出しと重ならないように） */}
      <LinearGradient
        colors={onSheet ? [SHEET, SHEET, 'rgba(253,249,246,0)'] : [DAWN[0], DAWN[0], 'rgba(143,163,207,0)']}
        locations={[0, 0.7, 1]}
        style={[styles.headerFade, { pointerEvents: 'none' }]}
      />
      <Text style={[styles.title, { pointerEvents: 'none' }]}>{showSample ? 'わたしのこと（見本）' : 'わたしのこと'}</Text>
      {/* 左上：ふだんは「← 水辺へ」。見本を見ているときは、見本をとじる「×」（星空と同じ） */}
      {introOpen ? null : showSample ? (
        <Pressable style={[styles.closeBtn, styles.closeLeft]} hitSlop={14} onPress={() => setShowSample(false)} accessibilityLabel="見本をとじる">
          <Text style={styles.closeBtnText}>×</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.back} hitSlop={10} onPress={onBack} accessibilityRole="button">
          <Text style={styles.backText}>← 水辺へ</Text>
        </Pressable>
      )}
      {/* 右上：見方の印（星空の「星の見方」と同じ星。夜明けの色で） */}
      {!introOpen && (
        <Pressable
          style={({ pressed }) => [styles.help, pressed && { transform: [{ scale: 0.88 }] }]}
          hitSlop={16}
          onPressIn={() => Haptics.selectionAsync()}
          onPress={() => setIntroOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="わたしのことの見方"
        >
          <HelpStar color={HELP_COLOR} glint="#fffaf2" />
        </Pressable>
      )}
      {introOpen && (
        <View style={styles.intro}>
          <LinearGradient colors={['#f6eef2', '#fbf3ec']} style={StyleSheet.absoluteFill} />
          <ScrollView contentContainerStyle={styles.introScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.introTitle}>わたしのことの見方</Text>
            <Text style={styles.introLead}>水辺で拾った言葉の、日をまたいだ順番を見ています。何をした日のあとに、どんな元気・好奇心の言葉を拾うことが多いかが分かります。</Text>
            <View style={styles.introBlock}>
              {INTRO_LINES.map(([label, body], i) => (
                <View key={label} style={[styles.introRow, i === INTRO_LINES.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={styles.introLabel}>{label}</Text>
                  <Text style={styles.introBody}>{body}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.introNote}>ここに並ぶのは、たまたまではないと確かめられたものだけです。拾う日が増えると、少しずつ増えていきます。{'\n'}「〜のあと」は順番のことで、「〜したから」という意味ではありません。</Text>
            {/* 見本は、見方の中からいつでも見られる（星空と同じ） */}
            {!showSample && (
              <Pressable
                hitSlop={12}
                onPress={() => {
                  setIntroOpen(false);
                  openSample();
                }}
                style={styles.sampleBtn}
                accessibilityRole="button"
              >
                <Text style={styles.sampleBtnText}>見本を見る</Text>
              </Pressable>
            )}
          </ScrollView>
          <Pressable style={[styles.closeBtn, styles.closeRight]} hitSlop={14} onPress={() => setIntroOpen(false)} accessibilityLabel="見方をとじる">
            <Text style={styles.closeBtnText}>×</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// 言葉：明朝の字だけ（種類の色の丸はやめた。意味がどこにも書いていなかった。矢印の左はいつも「していること」、右は元気・好奇心の言葉で、置き場所で分かる。2026-10-10 ユーザー「A」）
function Word({ word }: { word: string }) {
  return (
    <Text style={styles.wordText} numberOfLines={1}>
      {word}
    </Text>
  );
}

// 細い線のあいだに小さな見出し（「たとえば」）
function Rule({ label }: { label: string }) {
  return (
    <View style={styles.rule}>
      <View style={styles.ruleLine} />
      <Text style={styles.ruleText}>{label}</Text>
      <View style={styles.ruleLine} />
    </View>
  );
}

// 章：小さな番号と短い名前。説明は1行だけ（冗長にしない）
// 1行：散歩 ⟶ わくわく ……… 9回
function Row({ a, b, mark, n, small }: { a: string; b: string; mark: string; n: number; small?: boolean }) {
  return (
    <View style={[styles.row, small && styles.rowSmall]}>
      {/* 言葉は途中で切らない：入りきらないときは、言葉ごと次の行へ */}
      <View style={styles.rowWordsBox}>
        <Text style={styles.rowWords}>{a}</Text>
        <Text style={styles.mark}>{mark}</Text>
        <Text style={styles.rowWords}>{b}</Text>
      </View>
      <Text style={styles.count}>
        {n}
        <Text style={styles.countUnit}>回</Text>
      </Text>
    </View>
  );
}

function Chapter({ no, title, note, last, children }: { no: string; title: string; note?: string; last?: boolean; children: React.ReactNode }) {
  return (
    <View style={[styles.chapter, last && { borderBottomWidth: 0 }]}>
      <View style={styles.chHead}>
        <Text style={styles.chNo}>{no}</Text>
        <Text style={styles.chTitle}>{title}</Text>
      </View>
      {note && <Text style={styles.chNote}>{note}</Text>}
      <View style={{ marginTop: 18 }}>{children}</View>
    </View>
  );
}




const styles = StyleSheet.create({
  first: { justifyContent: 'center', paddingHorizontal: 28, paddingTop: 90, paddingBottom: 90 },
  wait: { textAlign: 'center', fontSize: 13, color: SUB, fontFamily: SERIF },
  heroMeter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 22 },
  heroMeterText: { fontSize: 12, color: PLUM, letterSpacing: 2, fontFamily: SERIF },
  hero: { textAlign: 'center', fontSize: 25, lineHeight: 44, color: INK, fontFamily: SERIF, letterSpacing: 1 },
  heroQuiet: { textAlign: 'center', fontSize: 18, lineHeight: 34, color: SUB, fontFamily: SERIF, letterSpacing: 1 },
  ex: { marginTop: 34, alignSelf: 'stretch', paddingHorizontal: 6 },
  exRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 },
  exDate: { fontSize: 12, color: SUB, fontFamily: SERIF, minWidth: 46, textAlign: 'right' },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ruleLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(43,38,64,0.25)' },
  ruleText: { fontSize: 12, color: PLUM, letterSpacing: 3, fontFamily: SERIF },
  sampleBtn: { marginTop: 30, alignSelf: 'center', paddingHorizontal: 26, paddingVertical: 9, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: 'rgba(125,88,120,0.6)' },
  sampleBtnText: { fontSize: 13, color: PLUM, letterSpacing: 3, fontFamily: SERIF },
  more: { position: 'absolute', bottom: 34, left: 0, right: 0, textAlign: 'center', fontSize: 11, color: SUB, letterSpacing: 3, fontFamily: SERIF },
  // 下の部分：夜明けの空から1枚の紙がせり上がる
  sheet: { backgroundColor: SHEET, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 26, paddingTop: 10, paddingBottom: 90 },
  section: { paddingVertical: 26, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: LINE },
  secTitle: { fontSize: 13, color: PLUM, letterSpacing: 3, fontFamily: SERIF },
  secSub: { fontSize: 12, color: SUB, marginTop: 6, lineHeight: 19, fontFamily: SERIF },
  empty: { fontSize: 13, color: SUB, fontFamily: SERIF },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  pair: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, flexWrap: 'wrap', gap: 10 },
  wordText: { fontSize: 16, color: INK, fontFamily: SERIF },
  arrow: { fontSize: 13, color: 'rgba(43,38,64,0.45)' },
  meter: { flexDirection: 'row', gap: 4 },
  meterDot: { width: 6, height: 6, borderRadius: 3, borderWidth: 1, borderColor: PLUM },
  meterDotOn: { backgroundColor: PLUM },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 16, rowGap: 6, marginTop: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontSize: 11, color: SUB, fontFamily: SERIF },
  tl: { paddingVertical: 10, gap: 8 },
  steps: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepDate: { fontSize: 12, color: SUB, fontFamily: SERIF },
  stepArrow: { fontSize: 14, color: 'rgba(43,38,64,0.4)' },
  // 1行と、確かさの札
  rowWordsBox: { flexShrink: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 2 },
  rowWords: { fontSize: 15.5, color: INK, fontFamily: SERIF },
  mark: { fontSize: 13, color: 'rgba(43,38,64,0.42)' },
  tag: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, borderWidth: StyleSheet.hairlineWidth * 2 },
  tagSure: { backgroundColor: PLUM, borderColor: PLUM },
  tagMaybe: { borderColor: 'rgba(125,88,120,0.7)' },
  tagSeen: { borderColor: 'rgba(43,38,64,0.18)' },
  tagText: { fontSize: 11.5, color: PLUM, fontFamily: SERIF, letterSpacing: 0.5 },
  tagTextSure: { color: '#fffaf6' },
  tagTextSeen: { color: SUB },
  count: { fontSize: 18, color: INK, fontFamily: SERIF },
  countUnit: { fontSize: 11, color: SUB },
  heroNew: { marginBottom: 18, fontSize: 12, color: PLUM, letterSpacing: 3, fontFamily: SERIF },
  heroCount: { marginTop: 14, fontSize: 13, color: SUB, fontFamily: SERIF, letterSpacing: 1, textAlign: 'center', lineHeight: 21 },
  // わかってきた順
  hist: { paddingVertical: 12, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(43,38,64,0.08)' },
  histWords: { fontSize: 16, color: INK, fontFamily: SERIF },
  histSteps: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  histStep: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  histDate: { fontSize: 12, color: SUB, fontFamily: SERIF },
  histArrow: { fontSize: 12, color: 'rgba(43,38,64,0.4)' },
  shiftNote: { fontSize: 11.5, color: SUB, lineHeight: 18, marginBottom: 10, fontFamily: SERIF },
  shiftHeadRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: 6 },
  shiftRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(43,38,64,0.08)' },
  shiftWordCol: { flex: 1 },
  shiftHead: { width: 84, textAlign: 'right', fontSize: 11, color: SUB, fontFamily: SERIF },
  shiftHeadArrow: { width: 24, textAlign: 'center', fontSize: 12, color: 'rgba(43,38,64,0.4)' },
  shiftNum: { width: 84, textAlign: 'right', fontSize: 17, color: SUB, fontFamily: SERIF },
  shiftUp: { color: INK },
  loopBlock: { paddingTop: 4 },
  loopTitle: { fontSize: 16, color: INK, fontFamily: SERIF, letterSpacing: 1 },
  rowSmall: { paddingVertical: 8, paddingLeft: 12, borderBottomWidth: 0 },
  // 章
  chapter: { paddingVertical: 34, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: LINE },
  chHead: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  chNo: { fontSize: 12, color: PLUM, letterSpacing: 2, fontFamily: SERIF, opacity: 0.8 },
  chTitle: { fontSize: 19, color: INK, letterSpacing: 3, fontFamily: SERIF },
  chNote: { fontSize: 12, color: SUB, marginTop: 8, fontFamily: SERIF, letterSpacing: 0.5 },
  // そのあとに
  link: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11 },
  linkSide: { width: '35%' },
  linkText: { fontSize: 15, color: INK, fontFamily: SERIF },
  linkLine: { flex: 1, minWidth: 6, marginHorizontal: 6, height: StyleSheet.hairlineWidth * 2, backgroundColor: 'rgba(125,88,120,0.3)' },
  // 行ったり来たり
  loop: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  loopMid: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loopMeter: { position: 'absolute' },
  // これまで
  tlRow: { paddingVertical: 9 },
  tlLabel: { fontSize: 14, color: INK, fontFamily: SERIF, marginBottom: 8 },
  tlArrow: { color: 'rgba(43,38,64,0.4)', fontSize: 12 },
  track: { height: 10, justifyContent: 'center' },
  trackBase: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth * 2, backgroundColor: LINE },
  trackSpan: { position: 'absolute', height: 2, backgroundColor: 'rgba(125,88,120,0.45)' },
  trackSpanTail: { position: 'absolute', right: 0, height: 2, backgroundColor: PLUM },
  tlMark: { position: 'absolute', width: 9, height: 9, marginLeft: -4.5, borderRadius: 4.5, borderWidth: 1.2, borderColor: PLUM, backgroundColor: SHEET },
  tlMarkOn: { backgroundColor: PLUM },
  tlMarkStatic: { position: 'relative', marginLeft: 0 },
  axis: { height: 18, marginTop: 10 },
  axisTick: { position: 'absolute', fontSize: 10.5, color: SUB, fontFamily: SERIF, marginLeft: -8 },
  axisNow: { right: 0, marginLeft: 0 },
  tlKey: { flexDirection: 'row', gap: 18, marginTop: 10 },
  tlKeyItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // うつりかわり
  meterDotBig: { width: 8, height: 8, borderRadius: 4 },
  // 上の見出し・ボタン
  headerFade: { position: 'absolute', top: 0, left: 0, right: 0, height: HEADER_H },
  back: { position: 'absolute', top: 50, left: 16, zIndex: 2 },
  backText: { fontSize: 13, color: '#4a4566', fontFamily: SERIF, letterSpacing: 1 },
  title: { position: 'absolute', top: 48, left: 0, right: 0, textAlign: 'center', fontSize: 15, letterSpacing: 4, color: '#3a3450', fontFamily: SERIF },
  help: { position: 'absolute', top: 44, right: 16, zIndex: 3 },
  closeBtn: { position: 'absolute', top: 46, width: 28, height: 28, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: 'rgba(43,38,64,0.35)', alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  closeBtnText: { fontSize: 16, lineHeight: 18, color: 'rgba(43,38,64,0.75)' },
  closeLeft: { left: 16 },
  closeRight: { right: 16 },
  // 見方
  intro: { ...StyleSheet.absoluteFill, zIndex: 4 },
  introScroll: { paddingTop: 104, paddingBottom: 70, paddingHorizontal: 30 },
  introTitle: { fontSize: 20, color: INK, letterSpacing: 4, textAlign: 'center', fontFamily: SERIF },
  introLead: { fontSize: 13.5, lineHeight: 24, color: SUB, marginTop: 20, fontFamily: SERIF },
  introSub: { fontSize: 13, color: PLUM, letterSpacing: 3, marginTop: 30, fontFamily: SERIF },
  introBlock: { marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: LINE },
  introRow: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: LINE, gap: 6 },
  introLabel: { fontSize: 14, color: INK, fontFamily: SERIF, letterSpacing: 1 },
  introBody: { fontSize: 13, lineHeight: 22, color: SUB, fontFamily: SERIF },
  introMeter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  introMeterText: { fontSize: 14, color: INK, fontFamily: SERIF },
  introNote: { fontSize: 12.5, lineHeight: 22, color: SUB, marginTop: 22, fontFamily: SERIF },
});
