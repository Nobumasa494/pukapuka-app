import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useCaptures, useDeviceId } from '../useCaptures';
import { meCache } from '../meCache';
import SAMPLE from '../meSampleResult.json';
import HelpStar from './HelpStar';
import { GENKI_WORDS, SOURCE_DAYS, computeMe, nextDayRate, type LoopItem, type MeResult, type SourceItem } from '../flow';

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
  ['いちばん上', '何をしたあとに、元気・好奇心の言葉がよく来るか。いちばん確かなもの（または、新しく確かになったもの）を1つ'],
  ['数字', 'その言葉を拾った次の日と、ふだんの次の日で、元気・好奇心の言葉を拾った日の割合'],
  ['来やすいこと', 'いちばん上のほかにも、元気・好奇心が来やすいことを、確かな順に並べています'],
  ['めぐり', 'お互いのあとに来やすい2つの言葉。良い・悪いはありません'],
  ['育っていること', 'これまでに見つかってきたことと、元気の中身（はじめのころと最近）'],
];
const HELP_COLOR = '#8f5f8a';

const kindOf = (w: string) => (GENKI_WORDS.has(w) ? '元気な言葉' : '好奇心の言葉');

// 言い方の決まり（スキル /pukapuka-me の 3.）：「〜のあとに」と書く。「〜のせいで」「〜すると」とは書かない
function heroText(x: SourceItem): string {
  const k = kindOf(x.to);
  if (x.stage === 'sure') return `「${x.word}」のあとに、\n${k}が\nよく来ます`;
  if (x.stage === 'tentative') return `「${x.word}」のあとに、\n${k}が\n来ているかも`;
  return `「${x.word}」のあとに、\n${k}が来た日が\nありました`;
}
const STAGE_LABEL = { sure: 'よく来る', tentative: '来ているかも', seen: '見えはじめ' } as const;
const CHIP = { tentative: '確かめ中', seen: '見えはじめ' } as const;

function loopText(x: LoopItem) {
  return `「${x.a}」と「${x.b}」は、お互いのあとに${x.stage === 'sure' ? 'よく来ます' : '来ているかも'}`;
}
const md = (t: number, shiftDays = 0) => {
  const d = new Date(t);
  d.setDate(d.getDate() + shiftDays);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};

type Caps = { word: string; capturedAt: number }[];
type Numbers = ReturnType<typeof nextDayRate>;

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
      setState({ key, result: r, shiftDays: 0, numbers: !r.few && r.top && r.top.stage !== 'seen' ? nextDayRate(caps, now, r.top.word) : null });
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
  const sample = { result: SAMPLE.result as MeResult, numbers: SAMPLE.numbers as Numbers | null, shiftDays: sampleShift, busy: false };
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
              {top.stage === 'sure' && <Text style={styles.heroSub}>次の日に「{top.to}」が来ることが多い</Text>}
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
          <View style={{ paddingHorizontal: 14 }}>
            {top && numbers && numbers.days > 0 && (
              <View style={styles.card}>
                <Text style={styles.h}>「{top.word}」の日と、ふだんの日</Text>
                <Bar label={`${top.word}の次の日`} value={numbers.rate} strong />
                <Bar label="ふだんの次の日" value={numbers.base} />
                <Text style={styles.note}>
                  元気・好奇心の言葉を拾った日の割合（この3か月。{top.word}は{numbers.days}日のうち{numbers.hits}日）
                </Text>
              </View>
            )}

            <View style={styles.card}>
              <Text style={styles.h}>元気・好奇心が来やすいこと</Text>
              {(['sure', 'tentative', 'seen'] as const).map((st) => {
                const xs = result.list.filter((x) => x.stage === st);
                if (!xs.length) return null;
                return (
                  <View key={st}>
                    <Text style={styles.level}>{STAGE_LABEL[st]}</Text>
                    {xs.map((x) => (
                      <Text key={x.word} style={[styles.item, st === 'tentative' && styles.itemMaybe, st === 'seen' && styles.itemSeen]}>
                        {x.word} → {x.to}
                      </Text>
                    ))}
                  </View>
                );
              })}
            </View>

            <View style={styles.card}>
              <Text style={styles.h}>くり返すめぐり</Text>
              {result.loops.length ? (
                result.loops.map((x) => (
                  <Text key={x.a + x.b} style={[styles.item, x.stage === 'tentative' && styles.itemMaybe]}>
                    {loopText(x)}
                  </Text>
                ))
              ) : (
                <Text style={styles.note}>まだ、くり返すめぐりは見えていません</Text>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.h}>育っていること</Text>
              <Text style={styles.sub}>見つかってきたこと</Text>
              {!result.story ? (
                <Text style={styles.note}>見つかってきたことを、さかのぼって調べています…</Text>
              ) : result.story.length ? (
                result.story.slice(-8).map((e) => (
                  <View key={`${e.at}${e.word}${e.stage}`} style={styles.ev}>
                    <Text style={styles.evDate}>{md(e.at, shiftDays)}</Text>
                    <Text style={styles.evText}>
                      「{e.word}」のあとに「{e.to}」が{e.stage === 'sure' ? 'よく来るように ◎' : '来ているかも'}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.note}>まだ、はっきり見つかったことはありません</Text>
              )}
              <Text style={styles.sub}>元気の中身</Text>
              {result.shift ? (
                <View style={styles.shift}>
                  <View style={styles.shiftCol}>
                    <Text style={styles.shiftHead}>はじめのころ</Text>
                    <Text style={styles.shiftWords}>{result.shift.before.join('・') || 'ー'}</Text>
                  </View>
                  <Text style={styles.arrow}>→</Text>
                  <View style={styles.shiftCol}>
                    <Text style={styles.shiftHead}>最近</Text>
                    <Text style={[styles.shiftWords, { fontWeight: '600' }]}>{result.shift.after.join('・') || 'ー'}</Text>
                  </View>
                </View>
              ) : (
                <Text style={styles.note}>8週間たまると見えてきます</Text>
              )}
            </View>
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
              <Text style={styles.introLead}>水辺で拾った言葉の、日をまたいだ順番を見ています。何をしたあとに、元気な言葉や好奇心の言葉がよく来るかが分かります。</Text>
              {INTRO_LINES.map(([label, body]) => (
                <View key={label} style={styles.introRow}>
                  <Text style={styles.introLabel}>{label}</Text>
                  <Text style={styles.introBody}>{body}</Text>
                </View>
              ))}
              <View style={styles.introRow}>
                <Text style={styles.introLabel}>確かさ</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.introBody, { color: INK }]}>よく来ます：何週も見て、たまたまではなさそうなもの</Text>
                  <Text style={[styles.introBody, { color: 'rgba(47,42,72,0.6)' }]}>来ているかも：確かめている途中。たまたまのこともあります</Text>
                  <Text style={[styles.introBody, { color: 'rgba(47,42,72,0.42)' }]}>来た日がありました：起きたことを、そのまま書いています</Text>
                  <Text style={styles.introNote}>拾う日が増えるほど、うすい字から濃い字へ、だんだん確かになっていきます。</Text>
                </View>
              </View>
              <Text style={styles.introEnd}>「〜のあとに」は順番のことで、「〜したから」という意味ではありません。</Text>
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

function Bar({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.barTrack}>
        <View style={[styles.bar, { width: `${Math.round(value * 100)}%`, backgroundColor: strong ? '#c99ab0' : '#cfc8dc' }]} />
      </View>
      <Text style={styles.barValue}>{Math.round(value * 100)}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
  heroSub: { marginTop: 16, textAlign: 'center', fontSize: 13, color: SUB },
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
  shiftHead: { fontSize: 10, color: MUTE },
  shiftWords: { fontSize: 15, color: INK, textAlign: 'center', marginTop: 2 },
  arrow: { fontSize: 18, color: '#8f5f8a', marginHorizontal: 6 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 4 },
  barLabel: { width: 96, fontSize: 12, color: INK },
  barTrack: { flex: 1, height: 9, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.5)', overflow: 'hidden' },
  bar: { height: 9, borderRadius: 5 },
  barValue: { width: 40, textAlign: 'right', fontSize: 12, color: INK },
});
