import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useCaptures, useDeviceId } from '../useCaptures';
import { meCache } from '../meCache';
import SAMPLE from '../meSampleResult.json';
import HelpStar from './HelpStar';
import Svg, { Path } from 'react-native-svg';
import { SOURCE_DAYS, computeMe, examples, type Example, type MeResult, type SourceItem } from '../flow';

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
  ['いちばん上', '何をした日のあとに、どんな言葉を拾うことが多いか。いちばん確かなもの（または、新しく確かになったもの）を一つ。「たとえば」は、実際にそうなった日。'],
  ['01 そのあとに', 'ほかにも、その日から3日以内に、元気・好奇心の言葉を拾ったこと。'],
  ['02 行ったり来たり', '何日かのあいだに、交互に拾っている二つ。良い・悪いはありません。'],
  ['03 これまで', 'それぞれが、いつ見えはじめ（○）、いつ確かになったか（●）。'],
  ['04 うつりかわり', 'よく拾う元気・好奇心の言葉の、はじめのころと最近。'],
];
const HELP_COLOR = '#8f5f8a';


// 言い方の決まり（スキル /pukapuka-me の 3.）：「〜のあとに」と書く。「〜のせいで」「〜すると」とは書かない
function heroText(x: SourceItem): string {
  if (x.stage === 'sure') return `「${x.word}」の日のあとは、\n「${x.to}」を\n拾うことが多いみたい`;
  if (x.stage === 'tentative') return `「${x.word}」の日のあとは、\n「${x.to}」を\n拾うことが多いかも`;
  return `「${x.word}」の日のあとに、\n「${x.to}」を\n拾った日がありました`;
}
const STAGE_LABEL = { sure: '多いみたい', tentative: '多いかも', seen: 'あった日がある' } as const;

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
  const [state, setState] = useState<{ key: string; result: MeResult; numbers: Numbers | null; shiftDays: number; now: number } | null>(null);
  const running = useRef(0);
  useEffect(() => {
    if (!key) return;
    const run = ++running.current;
    const { caps, now, cacheId } = make();
    const show = (r: MeResult) => {
      if (run !== running.current) return;
      setState({ key, result: r, shiftDays: 0, now, numbers: !r.few && r.top ? examples(caps, now, r.top.word, r.top.to) : null });
    };
    computeMe(caps, now, meCache(cacheId), undefined, show).then(show, () => {});
    // make は key が変わったときだけ呼ぶ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const cur = state && state.key === key ? state : null;
  return { result: cur?.result ?? null, numbers: cur?.numbers ?? null, shiftDays: cur?.shiftDays ?? 0, now: cur?.now ?? 0, busy: !!key && !cur };
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
  const sample = { result: SAMPLE.result as MeResult, numbers: SAMPLE.examples as Numbers, shiftDays: sampleShift, now: SAMPLE.at, busy: false };
  const openSample = () => {
    const a = new Date(SAMPLE.at), t = new Date();
    setSampleShift(Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime() - new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()) / 86400000));
    setShowSample(true);
  };
  const { result, numbers, shiftDays, now } = showSample ? sample : real;
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
              {/* 確かさは、画面のどこでも同じ点で表す（言葉を増やさない） */}
              <View style={styles.heroMeter}>
                <Meter stage={top.stage} big />
              </View>
              <Text style={styles.hero}>{heroText(top)}</Text>
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
          // 下の部分（2026-10-10 作り直し。ユーザー「美しく、洗練されたデザインがいい」）：箱・枠・影をやめ、
          // 夜明けの空から1枚の紙がせり上がるように置く。区切りは細い線と余白、文字は明朝。確かさは点（●●●／●●○／●○○）だけ
          <View style={styles.sheet} onLayout={(e) => (sheetTop.current = e.nativeEvent.layout.y)}>
            {/* 01 そのあとに：言葉を細い線でつなぎ、線の真ん中に確かさの点 */}
            <Chapter no="01" title="そのあとに" note="3日以内に拾った、元気・好奇心の言葉">
              {(() => {
                const xs = result.list.filter((x) => x.word !== top?.word).slice(0, 5);
                return xs.length ? xs.map((x) => <Link key={x.word} a={x.word} b={x.to} stage={x.stage} />) : <Text style={styles.empty}>まだ、ほかには見えていません</Text>;
              })()}
            </Chapter>

            {/* 02 行ったり来たり：行きと帰りの2本の弧 */}
            <Chapter no="02" title="行ったり来たり" note="何日かのあいだに、交互に拾っている二つ">
              {result.loops.length ? (
                result.loops.map((x) => <Loop key={x.a + x.b} a={x.a} b={x.b} stage={x.stage} width={width} />)
              ) : (
                <Text style={styles.empty}>まだ見えていません</Text>
              )}
            </Chapter>

            {/* 03 これまで：12週の時間の軸に、見えはじめた日（○）と確かになった日（●） */}
            <Chapter no="03" title="これまで">
              {!result.story ? (
                <Text style={styles.empty}>さかのぼって調べています…</Text>
              ) : result.story.length ? (
                <Timeline rows={storyRows(result.story).slice(-5)} end={now} shiftDays={shiftDays} />
              ) : (
                <Text style={styles.empty}>まだ見えていません</Text>
              )}
            </Chapter>

            {/* 04 うつりかわり：よく拾う元気・好奇心の言葉の、はじめのころと最近 */}
            <Chapter no="04" title="うつりかわり" note="よく拾う、元気・好奇心の言葉" last>
              {result.shift ? (
                <View style={styles.shift}>
                  <View style={styles.shiftCol}>
                    <Text style={styles.shiftHead}>はじめのころ</Text>
                    {result.shift.before.map((w) => <Text key={w} style={styles.shiftWordOld}>{w}</Text>)}
                  </View>
                  <Text style={styles.shiftArrow}>⟶</Text>
                  <View style={styles.shiftCol}>
                    <Text style={styles.shiftHead}>最近</Text>
                    {result.shift.after.map((w) => <Text key={w} style={styles.shiftWord}>{w}</Text>)}
                  </View>
                </View>
              ) : (
                <Text style={styles.empty}>8週間たまると見えてきます</Text>
              )}
            </Chapter>
            <Legend />
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
            <Text style={styles.introSub}>確かさ</Text>
            <View style={styles.introBlock}>
              {(['sure', 'tentative', 'seen'] as const).map((st, i) => (
                <View key={st} style={[styles.introRow, i === 2 && { borderBottomWidth: 0 }]}>
                  <View style={styles.introMeter}>
                    <Meter stage={st} />
                    <Text style={styles.introMeterText}>{STAGE_LABEL[st]}</Text>
                  </View>
                  <Text style={styles.introBody}>
                    {st === 'sure' ? '何週も見て、たまたまではなさそうなもの。' : st === 'tentative' ? '確かめている途中。たまたまのこともあります。' : '起きたことを、そのまま書いています。'}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={styles.introNote}>拾う日が増えるほど、点が一つずつ増えて、確かになっていきます。{'\n'}「〜のあと」は順番のことで、「〜したから」という意味ではありません。</Text>
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

// 確かさ：●●●（多いみたい）／●●○（多いかも）／●○○（あった日がある）。画面のどこでも、確かさはこの点だけで表す
const SURE_DOTS = { sure: 3, tentative: 2, seen: 1 } as const;
function Meter({ stage, big }: { stage: 'sure' | 'tentative' | 'seen'; big?: boolean }) {
  const n = SURE_DOTS[stage];
  return (
    <View style={[styles.meter, big && { gap: 6 }]} accessibilityLabel={STAGE_LABEL[stage]}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.meterDot, big && styles.meterDotBig, i < n && styles.meterDotOn]} />
      ))}
    </View>
  );
}
function Legend() {
  return (
    <View style={styles.legend}>
      {(['sure', 'tentative', 'seen'] as const).map((st) => (
        <View key={st} style={styles.legendItem}>
          <Meter stage={st} />
          <Text style={styles.legendText}>{STAGE_LABEL[st]}</Text>
        </View>
      ))}
    </View>
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

// 歩みを組（言葉 → 行き先）ごとにまとめる：見えはじめた日（多いかも）と、確かになった日（多いみたい）。はじめて出た順
function storyRows(story: { at: number; word: string; to: string; stage: 'tentative' | 'sure' }[]) {
  const rows = new Map<string, { word: string; to: string; seen?: number; sure?: number; first: number }>();
  for (const e of story) {
    const r = rows.get(e.word) ?? { word: e.word, to: e.to, first: e.at };
    if (e.stage === 'tentative') r.seen ??= e.at;
    else r.sure ??= e.at;
    r.to = e.to;
    rows.set(e.word, r);
  }
  return [...rows.values()].sort((a, b) => a.first - b.first);
}

// 章：小さな番号と短い名前。説明は1行だけ（冗長にしない）
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

// 散歩 ———●●○——— わくわく
function Link({ a, b, stage }: { a: string; b: string; stage: 'sure' | 'tentative' | 'seen' }) {
  // 左右の言葉は同じ幅の箱に入れ、点がどの行でも真ん中にそろうようにする
  return (
    <View style={styles.link}>
      <View style={styles.linkSide}>
        <Text style={styles.linkText} numberOfLines={1}>
          {a}
        </Text>
      </View>
      <View style={styles.linkLine} />
      <Meter stage={stage} />
      <View style={styles.linkLine} />
      <View style={[styles.linkSide, { alignItems: 'flex-end' }]}>
        <Text style={styles.linkText} numberOfLines={1}>
          {b}
        </Text>
      </View>
    </View>
  );
}

// 行きと帰りの2本の弧で、2つの言葉をつなぐ
function Loop({ a, b, stage }: { a: string; b: string; stage: 'sure' | 'tentative' | 'seen'; width: number }) {
  const W = 78, H = 30;
  const c = 'rgba(125,88,120,0.55)';
  return (
    <View style={styles.loop}>
      <View style={styles.linkSide}>
        <Text style={styles.linkText} numberOfLines={1}>
          {a}
        </Text>
      </View>
      <View style={styles.loopMid}>
        <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          {/* 上の弧（行き）と下の弧（帰り）、それぞれ小さな矢じり */}
          <Path d={`M8 ${H / 2 - 3} Q ${W / 2} -4 ${W - 8} ${H / 2 - 3}`} stroke={c} strokeWidth={1} fill="none" />
          <Path d={`M${W - 14} ${H / 2 - 7} L ${W - 8} ${H / 2 - 3} L ${W - 15} ${H / 2 - 1}`} stroke={c} strokeWidth={1} fill="none" />
          <Path d={`M${W - 8} ${H / 2 + 3} Q ${W / 2} ${H + 4} 8 ${H / 2 + 3}`} stroke={c} strokeWidth={1} fill="none" />
          <Path d={`M14 ${H / 2 + 7} L 8 ${H / 2 + 3} L 15 ${H / 2 + 1}`} stroke={c} strokeWidth={1} fill="none" />
        </Svg>
        <View style={styles.loopMeter}>
          <Meter stage={stage} />
        </View>
      </View>
      <View style={[styles.linkSide, { alignItems: 'flex-end' }]}>
        <Text style={styles.linkText} numberOfLines={1}>
          {b}
        </Text>
      </View>
    </View>
  );
}

// 12週の時間の軸。組ごとに1本の細い線、見えはじめた日に ○、確かになった日に ●（その間を少し濃い線で）
const DAY = 86400000;
function Timeline({ rows, end, shiftDays }: { rows: { word: string; to: string; seen?: number; sure?: number }[]; end: number; shiftDays: number }) {
  const start = end - SOURCE_DAYS * DAY;
  const pos = (t: number) => `${Math.min(100, Math.max(0, ((t - start) / (end - start)) * 100))}%` as const;
  // 月のはじめに目盛り
  const ticks: number[] = [];
  const d = new Date(start);
  for (let m = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(); m < end; ) {
    if ((end - m) / (end - start) > 0.14) ticks.push(m); // 「いま」と重ならないよう、右の端の近くは出さない
    const x = new Date(m);
    m = new Date(x.getFullYear(), x.getMonth() + 1, 1).getTime();
  }
  return (
    <View>
      {rows.map((g) => {
        const from = g.seen ?? g.sure!;
        return (
          <View key={g.word + g.to} style={styles.tlRow}>
            <Text style={styles.tlLabel} numberOfLines={1}>
              {g.word}
              <Text style={styles.tlArrow}>{'  ⟶  '}</Text>
              {g.to}
            </Text>
            <View style={styles.track}>
              <View style={styles.trackBase} />
              {g.sure !== undefined && g.seen !== undefined && <View style={[styles.trackSpan, { left: pos(g.seen), right: `${100 - parseFloat(pos(g.sure))}%` }]} />}
              {g.sure !== undefined && <View style={[styles.trackSpanTail, { left: pos(g.sure) }]} />}
              <View style={[styles.tlMark, { left: pos(from) }, g.seen === undefined && styles.tlMarkOn]} />
              {g.sure !== undefined && g.seen !== undefined && <View style={[styles.tlMark, styles.tlMarkOn, { left: pos(g.sure) }]} />}
            </View>
          </View>
        );
      })}
      <View style={styles.axis}>
        {ticks.map((t) => (
          <Text key={t} style={[styles.axisTick, { left: pos(t) }]}>
            {new Date(t + shiftDays * DAY).getMonth() + 1}月
          </Text>
        ))}
        <Text style={[styles.axisTick, styles.axisNow]}>いま</Text>
      </View>
      <View style={styles.tlKey}>
        <View style={styles.tlKeyItem}>
          <View style={[styles.tlMark, styles.tlMarkStatic]} />
          <Text style={styles.legendText}>見えはじめた</Text>
        </View>
        <View style={styles.tlKeyItem}>
          <View style={[styles.tlMark, styles.tlMarkStatic, styles.tlMarkOn]} />
          <Text style={styles.legendText}>確かになった</Text>
        </View>
      </View>
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
  shift: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  shiftCol: { flex: 1, gap: 8 },
  shiftHead: { fontSize: 11, color: SUB, letterSpacing: 2, fontFamily: SERIF, marginBottom: 2 },
  shiftArrow: { fontSize: 14, color: 'rgba(43,38,64,0.45)', marginTop: 22 },
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
  shiftWordOld: { fontSize: 17, color: SUB, fontFamily: SERIF },
  shiftWord: { fontSize: 19, color: INK, fontFamily: SERIF },
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
