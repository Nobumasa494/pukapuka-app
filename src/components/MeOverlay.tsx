import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useCaptures, useDeviceId } from '../useCaptures';
import { meCache } from '../meCache';
import SAMPLE from '../meSampleResult.json';
import HelpStar from './HelpStar';
import { CATEGORY_COLOR } from '../wordCloud';
import { WORD_CATEGORY } from '../words';
import { SOURCE_DAYS, computeMe, examples, type Example, type MeResult, type SourceItem } from '../flow';

// わたしのこと（夜明け）。川の画面の上に重ねて出す（SPEC 第2部 C3.）。
// 開くと、いちばん上に元気・好奇心の源が1つだけ大きく出る。下へスクロールすると、数字・いろいろな源・めぐり・育っていること。
// 計算は重いので（並べかえ検定）、週の終わりの結果は端末にとっておき、毎回は「今」だけ計算する（src/meCache.ts）

// 読む期間：源は直近12週。歩み（見つかってきたこと）のために、その倍まで読む
const READ_DAYS = SOURCE_DAYS * 2;

// 夜明けの空（上→下）。星空より明るく、文字が読みやすい。動かさない（毎コマの描き直しをしない）
const DAWN = ['#8fa3cf', '#b6b4d8', '#dcc3d6', '#efc9cf', '#f8d6c4', '#fde8cc'] as const;
const INK = '#2f2a48';
const SUB = '#5d5674';
const MUTE = '#6a6383';

// 見方（右上の印を押したときだけ出す。星空の「星の見方」と同じ形）
const INTRO_LINES: [string, string][] = [
  ['いちばん上', '何をした日のあとに、どんな言葉を拾うことが多いか。いちばん確かなもの（または、新しく確かになったもの）を1つ'],
  ['たとえば', 'あなたの記録の中で、実際にそうなった日'],
  ['来やすいこと', 'ほかにも、あとで元気・好奇心の言葉が来やすいこと。「あと」は、その日から3日以内のことです'],
  ['交互に', '交互に拾うことが多い2つの言葉。良い・悪いはありません'],
  ['見えてきたこと', 'これまでに見えてきたことと、よく拾う元気・好奇心の言葉の変わり方（はじめのころと最近）'],
];
const HELP_COLOR = '#8f5f8a';


// 言い方の決まり（スキル /pukapuka-me の 3.）：「〜のあとに」と書く。「〜のせいで」「〜すると」とは書かない
function heroText(x: SourceItem): string {
  if (x.stage === 'sure') return `「${x.word}」の日のあとは、\n「${x.to}」を\n拾うことが多いみたい`;
  if (x.stage === 'tentative') return `「${x.word}」の日のあとは、\n「${x.to}」を\n拾うことが多いかも`;
  return `「${x.word}」の日のあとに、\n「${x.to}」を\n拾った日がありました`;
}
const STAGE_LABEL = { sure: '多いみたい', tentative: '多いかも', seen: 'あった日がある' } as const;
const CHIP = { tentative: '確かめ中', seen: '見えはじめ' } as const;

const mdDay = (day: number, shiftDays = 0) => {
  const d = new Date((day + shiftDays) * 86400000); // dayNumber は UTC の日で数えている
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
};
const md = (t: number, shiftDays = 0) => {
  const d = new Date(t);
  d.setDate(d.getDate() + shiftDays);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};

type Caps = { word: string; capturedAt: number }[];
type Numbers = Example[];

// 記録から、わたしのことの結果を計算する（とっておいた結果を使い、いちばん上を先に出す）。key が変わったときだけ計算し直す。
// make は計算を始めるときに呼ぶ（今の時刻を読むため、描くたびには呼ばない）
type Input = { caps: Caps; now: number; cacheId: string };
function useMe(key: string | null, make: () => Input) {
  const [state, setState] = useState<{ key: string; result: MeResult; numbers: Numbers | null; shiftDays: number } | null>(null);
  const running = useRef(0);
  useEffect(() => {
    if (!key) return;
    const run = ++running.current;
    const { caps, now, cacheId } = make();
    const show = (r: MeResult) => {
      if (run !== running.current) return;
      setState({ key, result: r, shiftDays: 0, numbers: !r.few && r.top ? examples(caps, now, r.top.word, r.top.to) : null });
    };
    computeMe(caps, now, meCache(cacheId), undefined, show).then(show, () => {});
    // make は key が変わったときだけ呼ぶ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const cur = state && state.key === key ? state : null;
  return { result: cur?.result ?? null, numbers: cur?.numbers ?? null, shiftDays: cur?.shiftDays ?? 0, busy: !!key && !cur };
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
  const sample = { result: SAMPLE.result as MeResult, numbers: SAMPLE.examples as Numbers, shiftDays: sampleShift, busy: false };
  const openSample = () => {
    const a = new Date(SAMPLE.at), t = new Date();
    setSampleShift(Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime() - new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()) / 86400000));
    setShowSample(true);
  };
  const { result, numbers, shiftDays } = showSample ? sample : real;
  const progress = showSample ? sample.busy : real.busy;
  // 何も出ない（①文だけ、または源が1つもない）とき、真ん中に「見本を見る」を出す
  const nothing = !showSample && real.result !== null && (real.result.few || !real.result.top);

  const top = result && !result.few ? result.top : null;
  const faint = top && top.stage !== 'sure';

  return (
    <View style={[StyleSheet.absoluteFill, { width, height }]}>
      <LinearGradient colors={DAWN} style={StyleSheet.absoluteFill} />
      <ScrollView style={StyleSheet.absoluteFill} contentContainerStyle={{ paddingBottom: 80, paddingTop: 0 }} showsVerticalScrollIndicator={false}>
        {/* 開いたときの1画面：いちばん上の源を1つだけ大きく。疲れている日はここだけ読めばよい */}
        <View style={{ height, justifyContent: 'center', paddingHorizontal: 28 }}>
          {!result ? (
            <Text style={styles.wait}>{progress ? (showSample ? '見本を用意しています…' : '夜が明けるのを待っています…') : ''}</Text>
          ) : result.few ? (
            <Text style={styles.heroFew}>元気な日が、あと少し集まると{'\n'}見えてきます</Text>
          ) : top ? (
            <View style={{ alignItems: 'center' }}>
              {top.stage !== 'sure' && <Text style={styles.chip}>{CHIP[top.stage]}</Text>}
              <Text style={[styles.hero, faint && styles.heroFaint]}>{heroText(top)}</Text>
              {/* たとえば：実際にそうなった日（割合の数字より分かりやすい） */}
              {numbers && numbers.length > 0 && (
                <View style={styles.exBox}>
                  <Text style={styles.exHead}>たとえば</Text>
                  {numbers.map((e) => (
                    <View key={e.from} style={styles.exRow}>
                      <Text style={styles.exDate}>{mdDay(e.from, shiftDays)}</Text>
                      <Pill word={top.word} small />
                      <Text style={styles.arrowSmall}>→</Text>
                      <Text style={styles.exDate}>{mdDay(e.to, shiftDays)}</Text>
                      <Pill word={top.to} small />
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <Text style={styles.heroFew}>まだ、はっきりした流れは{'\n'}見えていません</Text>
          )}
          {nothing && (
            <Pressable hitSlop={12} onPress={openSample} style={styles.sampleBtn} accessibilityRole="button">
              <Text style={styles.sampleBtnText}>見本を見る</Text>
            </Pressable>
          )}
          {result && !result.few && <Text style={styles.more}>▼ ほかのこと</Text>}
        </View>

        {result && !result.few && (
          <View style={styles.lower}>
            {/* 下の部分のデザイン（2026-10-10 作り直し。ユーザー「ほかのことが見にくいし、デザインも悪い」）：
                言葉は種類の色の札（夕空と同じ色）。確かさは字のうすさではなく、点（●●●／●●○／●○○）で表す。字はいつも読める濃さ */}
            <Section title={top ? 'ほかにも、あとで来やすいこと' : 'あとで来やすいこと'} sub="その日から3日以内に、元気・好奇心の言葉を拾ったこと">
              {(() => {
                const xs = result.list.filter((x) => x.word !== top?.word).slice(0, 5);
                return xs.length ? (
                  xs.map((x, i) => (
                    <View key={x.word} style={[styles.row, i === xs.length - 1 && styles.rowLast]}>
                      <View style={styles.pair}>
                        <Pill word={x.word} />
                        <Text style={styles.arrowSmall}>→</Text>
                        <Pill word={x.to} />
                      </View>
                      <Sureness stage={x.stage} />
                    </View>
                  ))
                ) : (
                  <Text style={styles.empty}>まだ、ほかには見えていません</Text>
                );
              })()}
              <Legend />
            </Section>

            <Section title="交互に来やすい言葉" sub="何日かのあいだに、行ったり来たりして拾っている2つ">
              {result.loops.length ? (
                result.loops.map((x, i) => (
                  <View key={x.a + x.b} style={[styles.row, i === result.loops.length - 1 && styles.rowLast]}>
                    <View style={styles.pair}>
                      <Pill word={x.a} />
                      <Text style={styles.arrowSmall}>⇄</Text>
                      <Pill word={x.b} />
                    </View>
                    <Sureness stage={x.stage} />
                  </View>
                ))
              ) : (
                <Text style={styles.empty}>まだ、はっきりしたものは見えていません</Text>
              )}
            </Section>

            <Section title="これまでに見えてきたこと">
              {!result.story ? (
                <Text style={styles.empty}>さかのぼって調べています…</Text>
              ) : result.story.length ? (
                <View style={styles.timeline}>
                  <View style={styles.timelineLine} />
                  {/* 組ごとに1行。見えてきた日 → はっきりしてきた日 と、進み具合を並べる */}
                  {storyRows(result.story).slice(-5).map((g) => (
                    <View key={g.word + g.to} style={styles.tlRow}>
                      <View style={[styles.tlDot, g.sure !== undefined && styles.tlDotSure]} />
                      <View style={styles.tlBody}>
                        <View style={styles.pair}>
                          <Pill word={g.word} small />
                          <Text style={styles.arrowSmall}>→</Text>
                          <Pill word={g.to} small />
                        </View>
                        <Text style={styles.tlState}>
                          {g.seen !== undefined && `${md(g.seen, shiftDays)} 見えてきた`}
                          {g.seen !== undefined && g.sure !== undefined && '　→　'}
                          {g.sure !== undefined && <Text style={styles.tlStateSure}>{md(g.sure, shiftDays)} はっきりしてきた</Text>}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.empty}>まだ、はっきり見えてきたことはありません</Text>
              )}
            </Section>

            <Section title="よく拾う元気・好奇心の言葉">
              {result.shift ? (
                <View>
                  <View style={styles.shiftRow}>
                    <Text style={styles.shiftHead}>はじめのころ</Text>
                    <View style={styles.pills}>{result.shift.before.map((w) => <Pill key={w} word={w} />)}</View>
                  </View>
                  <Text style={styles.shiftArrow}>↓</Text>
                  <View style={styles.shiftRow}>
                    <Text style={styles.shiftHead}>最近</Text>
                    <View style={styles.pills}>{result.shift.after.map((w) => <Pill key={w} word={w} />)}</View>
                  </View>
                </View>
              ) : (
                <Text style={styles.empty}>8週間たまると見えてきます</Text>
              )}
            </Section>
          </View>
        )}
      </ScrollView>

      {/* 上の見出しの下に、夜明けの空の色の帯（スクロールした文字が見出しと重ならないように） */}
      <LinearGradient colors={[DAWN[0], DAWN[0], 'rgba(143,163,207,0)']} locations={[0, 0.7, 1]} style={[styles.headerFade, { pointerEvents: 'none' }]} />
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
        <Pressable style={styles.intro} onPress={() => setIntroOpen(false)}>
          <ScrollView contentContainerStyle={styles.introScroll} showsVerticalScrollIndicator={false}>
            <Pressable style={styles.introCard} onPress={() => setIntroOpen(false)}>
              <Text style={styles.introTitle}>わたしのことの見方</Text>
              <Text style={styles.introLead}>水辺で拾った言葉の、日をまたいだ順番を見ています。何をした日のあとに、どんな元気・好奇心の言葉を拾うことが多いかが分かります。</Text>
              {INTRO_LINES.map(([label, body]) => (
                <View key={label} style={styles.introRow}>
                  <Text style={styles.introLabel}>{label}</Text>
                  <Text style={styles.introBody}>{body}</Text>
                </View>
              ))}
              <View style={styles.introRow}>
                <Text style={styles.introLabel}>確かさ</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.introBody, { color: INK }]}>多いみたい：何週も見て、たまたまではなさそうなもの</Text>
                  <Text style={[styles.introBody, { color: 'rgba(47,42,72,0.6)' }]}>多いかも：確かめている途中。たまたまのこともあります</Text>
                  <Text style={[styles.introBody, { color: 'rgba(47,42,72,0.42)' }]}>拾った日がありました：起きたことを、そのまま書いています</Text>
                  <Text style={styles.introNote}>拾う日が増えるほど、うすい字から濃い字へ、だんだん確かになっていきます。</Text>
                </View>
              </View>
              <Text style={styles.introEnd}>「〜のあと」は順番のことで、「〜したから」という意味ではありません。</Text>
              {/* 見本は、見方の中からいつでも見られる（星空と同じ） */}
              {!showSample && (
                <Pressable
                  hitSlop={12}
                  onPress={() => {
                    setIntroOpen(false);
                    openSample();
                  }}
                  style={[styles.sampleBtn, { alignSelf: 'center' }]}
                  accessibilityRole="button"
                >
                  <Text style={styles.sampleBtnText}>見本を見る</Text>
                </Pressable>
              )}
            </Pressable>
          </ScrollView>
          <View style={[styles.closeBtn, styles.closeRight]}>
            <Text style={styles.closeBtnText}>×</Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}

// 言葉の札：種類の色（夕空と同じ CATEGORY_COLOR）をうすく敷き、字は濃いまま
function Pill({ word, small }: { word: string; small?: boolean }) {
  const [r, g, b] = CATEGORY_COLOR[WORD_CATEGORY[word] ?? 'emotion'];
  return (
    <View style={[styles.pill, small && styles.pillSmall, { backgroundColor: `rgba(${r},${g},${b},0.55)`, borderColor: `rgba(${Math.round(r * 0.7)},${Math.round(g * 0.7)},${Math.round(b * 0.7)},0.45)` }]}>
      <Text style={[styles.pillText, small && styles.pillTextSmall]} numberOfLines={1}>
        {word}
      </Text>
    </View>
  );
}

// 確かさ：●●●（多いみたい）／●●○（多いかも）／●○○（あった日がある）
const SURE_DOTS = { sure: 3, tentative: 2, seen: 1 } as const;
function Sureness({ stage }: { stage: 'sure' | 'tentative' | 'seen' }) {
  const n = SURE_DOTS[stage];
  return (
    <View style={styles.dots} accessibilityLabel={STAGE_LABEL[stage]}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.dot, i < n && styles.dotOn]} />
      ))}
    </View>
  );
}
function Legend() {
  return (
    <View style={styles.legend}>
      {(['sure', 'tentative', 'seen'] as const).map((st) => (
        <View key={st} style={styles.legendItem}>
          <Sureness stage={st} />
          <Text style={styles.legendText}>{STAGE_LABEL[st]}</Text>
        </View>
      ))}
    </View>
  );
}

// 歩みを組（言葉 → 行き先）ごとにまとめる：見えてきた日（かも）と、はっきりしてきた日（多いみたい）。はじめて出た順
function storyRows(story: { at: number; word: string; to: string; stage: 'tentative' | 'sure' }[]) {
  const rows = new Map<string, { word: string; to: string; seen?: number; sure?: number; first: number }>();
  for (const e of story) {
    const k = e.word;
    const r = rows.get(k) ?? { word: e.word, to: e.to, first: e.at };
    if (e.stage === 'tentative') r.seen ??= e.at;
    else r.sure ??= e.at;
    r.to = e.to;
    rows.set(k, r);
  }
  return [...rows.values()].sort((a, b) => a.first - b.first);
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.secTitle}>{title}</Text>
      {sub && <Text style={styles.secSub}>{sub}</Text>}
      <View style={{ marginTop: 10 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  lower: { paddingHorizontal: 16, paddingTop: 8, gap: 14 },
  section: { backgroundColor: 'rgba(255,255,255,0.62)', borderRadius: 18, paddingVertical: 16, paddingHorizontal: 16, boxShadow: '0px 2px 10px rgba(80,60,110,0.08)' },
  secTitle: { fontSize: 16, color: INK, fontWeight: '600', letterSpacing: 0.5 },
  secSub: { fontSize: 12, color: SUB, marginTop: 4, lineHeight: 17 },
  empty: { fontSize: 13, color: SUB },
  rowLast: { borderBottomWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(47,42,72,0.12)' },
  pair: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, flexWrap: 'wrap', gap: 6 },
  pills: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4, borderWidth: 1 },
  pillSmall: { paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 14, color: INK },
  pillTextSmall: { fontSize: 12.5 },
  arrowSmall: { fontSize: 14, color: '#8f5f8a' },
  dots: { flexDirection: 'row', gap: 4, marginLeft: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: '#8f5f8a' },
  dotOn: { backgroundColor: '#8f5f8a' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendText: { fontSize: 11.5, color: SUB },
  timeline: { position: 'relative', paddingLeft: 2 },
  timelineLine: { position: 'absolute', left: 5, top: 10, bottom: 10, width: 2, backgroundColor: 'rgba(143,95,138,0.25)', borderRadius: 1 },
  tlRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7, gap: 12 },
  tlDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4, borderWidth: 2, borderColor: '#b98fb2', backgroundColor: '#fbf2f2' },
  tlDotSure: { backgroundColor: '#8f5f8a', borderColor: '#8f5f8a' },
  tlDate: { width: 62, marginLeft: 10, fontSize: 12, color: SUB, marginTop: 2 },
  tlBody: { flex: 1, gap: 4 },
  tlState: { fontSize: 12, color: SUB, lineHeight: 18 },
  tlStateSure: { color: '#8f5f8a', fontWeight: '600' },
  shiftRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  shiftArrow: { fontSize: 16, color: '#8f5f8a', marginVertical: 4, marginLeft: 30 },
  sampleBtn: { marginTop: 22, alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(143,95,138,0.55)' },
  sampleBtnText: { fontSize: 13, color: '#6b4a72', letterSpacing: 1 },
  help: { position: 'absolute', top: 44, right: 16, zIndex: 3 },
  closeBtn: { position: 'absolute', top: 46, width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(47,42,72,0.35)', alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  closeBtnText: { fontSize: 18, lineHeight: 20, color: 'rgba(47,42,72,0.75)' },
  closeLeft: { left: 16 },
  closeRight: { right: 16 },
  intro: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(250,238,232,0.99)', zIndex: 4 },
  introScroll: { paddingTop: 96, paddingBottom: 60, paddingHorizontal: 26, alignItems: 'center' },
  introCard: { width: '100%', maxWidth: 380 },
  introTitle: { fontSize: 17, color: INK, letterSpacing: 2, textAlign: 'center', marginBottom: 14 },
  introLead: { fontSize: 13, lineHeight: 21, color: SUB, marginBottom: 18 },
  introRow: { flexDirection: 'row', marginBottom: 12 },
  introLabel: { width: 98, fontSize: 13, color: '#8f5f8a', paddingTop: 1 },
  introBody: { flex: 1, fontSize: 13, lineHeight: 21, color: SUB },
  introNote: { fontSize: 12, lineHeight: 19, color: MUTE, marginTop: 4 },
  introEnd: { marginTop: 8, fontSize: 12, lineHeight: 19, color: MUTE, textAlign: 'center' },
  headerFade: { position: 'absolute', top: 0, left: 0, right: 0, height: 96 },
  back: { position: 'absolute', top: 50, left: 16, zIndex: 2 },
  backText: { fontSize: 14, color: '#4a4566' },
  title: { position: 'absolute', top: 48, left: 0, right: 0, textAlign: 'center', fontSize: 16, letterSpacing: 1.6, color: '#3a3450' },
  wait: { textAlign: 'center', fontSize: 13, color: MUTE },
  hero: { textAlign: 'center', fontSize: 25, lineHeight: 40, color: INK },
  heroFaint: { color: 'rgba(47,42,72,0.55)' },
  heroFew: { textAlign: 'center', fontSize: 19, lineHeight: 32, color: SUB },
  exBox: { marginTop: 26, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 16, boxShadow: '0px 2px 10px rgba(80,60,110,0.08)' },
  exHead: { fontSize: 12, color: SUB, marginBottom: 4 },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 4 },
  exDate: { fontSize: 12, color: SUB, minWidth: 44 },
  chip: {
    marginBottom: 14, fontSize: 11, color: 'rgba(47,42,72,0.6)', paddingHorizontal: 10, paddingVertical: 2,
    borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(47,42,72,0.4)', borderRadius: 999, overflow: 'hidden',
  },
  more: { position: 'absolute', bottom: 40, left: 0, right: 0, textAlign: 'center', fontSize: 12, color: MUTE },
  card: { backgroundColor: 'rgba(255,255,255,0.45)', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, marginTop: 12 },
  h: { fontSize: 12, color: MUTE, marginBottom: 6 },
  note: { fontSize: 11, color: MUTE, marginTop: 4, lineHeight: 16 },
  level: { fontSize: 11, color: MUTE, marginTop: 6, marginBottom: 2 },
  item: { fontSize: 15, color: INK, marginLeft: 8, marginVertical: 2, lineHeight: 21 },
  itemMaybe: { color: 'rgba(47,42,72,0.6)' },
  itemSeen: { color: 'rgba(47,42,72,0.4)', fontSize: 14 },
  sub: { fontSize: 11, color: '#8f5f8a', marginTop: 10, marginBottom: 4, paddingBottom: 2, borderBottomWidth: 1, borderBottomColor: 'rgba(143,95,138,0.25)' },
  ev: { flexDirection: 'row', marginVertical: 3 },
  evDate: { width: 64, fontSize: 11, color: MUTE, paddingTop: 2 },
  evText: { flex: 1, fontSize: 13, color: INK, lineHeight: 19 },
  shift: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  shiftCol: { flex: 1, alignItems: 'center' },
  shiftHead: { width: 78, fontSize: 12, color: SUB, paddingTop: 7 },
  shiftWords: { fontSize: 15, color: INK, textAlign: 'center', marginTop: 2 },
  arrow: { fontSize: 18, color: '#8f5f8a', marginHorizontal: 6 },
});
