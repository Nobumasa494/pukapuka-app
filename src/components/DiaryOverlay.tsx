import { useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { useDiaries, useDiaryActions, type DiaryEntry } from '../useDiary';
import { DOW, dayLabel, monthCells, parseDay } from '../diary';
import { dayKey } from '../period';
import { diarySample } from '../diarySample';
import HelpStar from './HelpStar';

// 日記（5つ目の画面。SPEC 第1部「気づきの日記」、作り方はスキル /pukapuka-diary）。
// 自分で書くだけの場所。拾った言葉・分析とはつなげず、アプリは何もコメントしない（2026-10-11 ユーザー「普通に日記だけのスペースにしよう」）。
// 昼の空（水辺の夕方 → 夕空 → 星空 → 夜明け → 日記の昼 で1日がひと回り）。上：カレンダー（書いた日に小さな日の印）、
// まん中：選んだ日の1枚、下：その月の日記（振り返り）。動かない画面（毎コマの描き直しをしない）

// 昼の空（上→下）。澄んだ青から、下は紙のような白へ。背景は固定（スクロールしない）
const SKY = ['#8fb9df', '#b3d0ea', '#d7e6f3', '#eef4f8', '#f9f8f5'] as const;
const SKY_AT = [0, 0.2, 0.42, 0.62, 0.85] as const;
const INK = '#1e3048'; // 文字（深い藍）
const SUB = '#6c7f94'; // 小さな文字
const FAINT = 'rgba(30,48,72,0.28)'; // 先の日
const SUN = '#e3a75c'; // 書いた日の印（日ざしの色）
const NAVY = '#2c4a6e'; // 押せるもの
const HAIR = 'rgba(30,48,72,0.12)';
const TEXT_MAX = 4000; // convex/diary.ts と同じ
const SERIF = Platform.select({ ios: 'Hiragino Mincho ProN', android: 'serif', default: '"Noto Serif JP","Hiragino Mincho ProN","Yu Mincho","YuMincho",serif' });

// 使い方（右上の印を押したときだけ出す。1項目1行）
const INTRO_LINES: [string, string][] = [
  ['日記', '自分のための、書くだけの場所です'],
  ['カレンダー', '書いた日に、小さな印が付きます'],
  ['日を押す', 'その日の日記を読んだり、書いたりできます'],
  ['書き足す・直す', 'あとから、いつでも'],
  ['下の一覧', 'その月に書いた日記が並びます'],
];

// 空のうすい雲（止まった絵。ぼかした白い楕円を2つ）
function Clouds({ width }: { width: number }) {
  return (
    <Svg width={width} height={260} style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
      <Defs>
        <RadialGradient id="c" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Ellipse cx={width * 0.18} cy={150} rx={width * 0.42} ry={46} fill="url(#c)" />
      <Ellipse cx={width * 0.86} cy={92} rx={width * 0.34} ry={34} fill="url(#c)" />
    </Svg>
  );
}

export default function DiaryOverlay({ width, height, onBack }: { width: number; height: number; onBack: () => void }) {
  const diaries = useDiaries();
  const { save, remove } = useDiaryActions();
  // 開いたときの時刻（開いている間はこの日を「今日」とする）
  const [now] = useState(() => Date.now());
  const today = dayKey(now);

  // 見本（星空・夜明けと同じ：何もないときと、使い方の中から見られる）。保存しない
  const [sample, setSample] = useState<DiaryEntry[] | null>(null);
  const [introOpen, setIntroOpen] = useState(false);
  const entries = sample ?? diaries;
  const byDay = useMemo(() => new Map((entries ?? []).map((e) => [e.day, e])), [entries]);

  const [month, setMonth] = useState(() => {
    const d = new Date(now);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [selected, setSelected] = useState(today);
  const [editing, setEditing] = useState(false);
  const [askErase, setAskErase] = useState(false); // 「けす」は、もう一度たずねてから（書いた日記は戻せない）
  const [text, setText] = useState('');
  const scroll = useRef<ScrollView>(null);

  const cells = useMemo(() => monthCells(month.y, month.m), [month]);
  const nowDate = new Date(now);
  const isThisMonth = month.y === nowDate.getFullYear() && month.m === nowDate.getMonth();
  const monthList = useMemo(
    () =>
      (entries ?? [])
        .filter((e) => {
          const d = parseDay(e.day);
          return d.getFullYear() === month.y && d.getMonth() === month.m;
        })
        .sort((a, b) => parseDay(b.day).getTime() - parseDay(a.day).getTime()),
    [entries, month],
  );
  const cur = byDay.get(selected);
  const todayTime = parseDay(today).getTime();
  const isFuture = (day: string) => parseDay(day).getTime() > todayTime;

  const pick = (day: string) => {
    if (isFuture(day)) return;
    Haptics.selectionAsync();
    setSelected(day);
    setEditing(false);
    setAskErase(false);
  };
  const shiftMonth = (k: number) => {
    if (k > 0 && isThisMonth) return;
    setMonth(({ y, m }) => {
      const d = new Date(y, m + k, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
    setEditing(false);
  };
  const startEdit = () => {
    setText(cur?.text ?? '');
    setEditing(true);
  };
  const keep = () => {
    const t = text.trim();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (sample) {
      const rest = sample.filter((e) => e.day !== selected);
      setSample(t ? [...rest, { day: selected, text: t, savedAt: now }] : rest);
    } else save(selected, t);
    setEditing(false);
  };
  const erase = () => {
    setAskErase(false);
    if (sample) setSample(sample.filter((e) => e.day !== selected));
    else remove(selected);
    setEditing(false);
  };
  const openSample = () => {
    setSample(diarySample(now));
    setIntroOpen(false);
    setSelected(today);
    setEditing(false);
  };
  const closeSample = () => {
    setSample(null);
    setEditing(false);
  };
  const cell = Math.floor((width - 48) / 7);
  const rowH = Math.min(cell, 44); // 横に広い画面でも、カレンダーが縦に伸びすぎないように
  const ring = Math.min(cell, rowH) - 10;
  const nothing = !sample && diaries !== undefined && diaries.length === 0;
  const sel = parseDay(selected);

  return (
    <View style={[StyleSheet.absoluteFill, { width, height }]}>
      <LinearGradient colors={SKY} locations={SKY_AT} style={StyleSheet.absoluteFill} />
      <Clouds width={width} />
      <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* 月：年は小さく、月は大きく */}
        <View style={styles.monthRow}>
          <Pressable hitSlop={16} onPress={() => shiftMonth(-1)} accessibilityLabel="前の月" style={styles.arrowBox}>
            <Text style={styles.monthArrow}>‹</Text>
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.year}>{month.y}</Text>
            <Text style={styles.monthTitle}>{month.m + 1}月</Text>
          </View>
          <Pressable hitSlop={16} onPress={() => shiftMonth(1)} disabled={isThisMonth} accessibilityLabel="次の月" style={styles.arrowBox}>
            <Text style={[styles.monthArrow, isThisMonth && { opacity: 0.18 }]}>›</Text>
          </Pressable>
        </View>
        <View style={styles.grid}>
          {DOW.map((d) => (
            <Text key={d} style={[styles.dow, { width: cell }]}>
              {d}
            </Text>
          ))}
          {cells.map((day, i) =>
            day ? (
              <Pressable
                key={day}
                style={[styles.cell, { width: cell, height: rowH }]}
                onPress={() => pick(day)}
                disabled={isFuture(day)}
                accessibilityLabel={dayLabel(day) + (byDay.has(day) ? ' 日記あり' : '')}
              >
                <View style={[styles.ring, { width: ring, height: ring, borderRadius: ring / 2 }, day === selected && styles.ringOn]}>
                  <Text style={[styles.dayNum, day === today && styles.todayNum, isFuture(day) && { color: FAINT }, day === selected && { color: '#fff' }]}>
                    {parseDay(day).getDate()}
                  </Text>
                </View>
                {/* 書いた日：数字の下に小さな日の印 */}
                <View style={[styles.mark, !byDay.has(day) && { opacity: 0 }]} />
              </Pressable>
            ) : (
              <View key={'e' + i} style={{ width: cell, height: rowH }} />
            ),
          )}
        </View>

        {/* 選んだ日の1枚 */}
        <View style={styles.page}>
          <View style={styles.pageHead}>
            <Text style={styles.pageDate}>
              {sel.getMonth() + 1}.{sel.getDate()}
            </Text>
            <Text style={styles.pageDow}>
              {DOW[sel.getDay()]}曜日{selected === today ? '　今日' : ''}
            </Text>
          </View>
          <View style={styles.rule} />
          {editing ? (
            <>
              <TextInput
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder="自由に書けます"
                placeholderTextColor="rgba(30,48,72,0.32)"
                maxLength={TEXT_MAX}
                multiline
                autoFocus
                textAlignVertical="top"
              />
              <View style={styles.actions}>
                <Pressable onPress={() => setEditing(false)} hitSlop={10} accessibilityRole="button">
                  <Text style={styles.quiet}>やめる</Text>
                </Pressable>
                <Pressable style={({ pressed }) => [styles.keep, pressed && { opacity: 0.8 }]} onPress={keep} accessibilityRole="button">
                  <Text style={styles.keepText}>のこす</Text>
                </Pressable>
              </View>
            </>
          ) : cur ? (
            <>
              <Text style={styles.text}>{cur.text}</Text>
              <View style={styles.actions}>
                {askErase ? (
                  <>
                    <Pressable hitSlop={10} onPress={() => setAskErase(false)} accessibilityRole="button">
                      <Text style={styles.quiet}>やめる</Text>
                    </Pressable>
                    <Pressable hitSlop={10} onPress={erase} accessibilityRole="button">
                      <Text style={styles.erase}>この日記をけす</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable hitSlop={10} onPress={() => setAskErase(true)} accessibilityRole="button">
                      <Text style={styles.quiet}>けす</Text>
                    </Pressable>
                    <Pressable hitSlop={10} onPress={startEdit} accessibilityRole="button">
                      <Text style={styles.link}>書き足す・直す</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </>
          ) : (
            <Pressable hitSlop={8} onPress={startEdit} accessibilityRole="button" style={styles.write}>
              <Text style={styles.writeText}>{selected === today ? '今日' : 'この日'}の日記を書く</Text>
            </Pressable>
          )}
        </View>

        {nothing && (
          <Pressable hitSlop={12} onPress={openSample} style={styles.sampleBtn} accessibilityRole="button">
            <Text style={styles.sampleBtnText}>見本を見る</Text>
          </Pressable>
        )}

        {/* その月の日記（振り返り） */}
        {monthList.length > 0 && (
          <View style={styles.list}>
            <Text style={styles.listTitle}>{month.m + 1}月の日記</Text>
            {monthList.map((e) => {
              const d = parseDay(e.day);
              return (
                <Pressable
                  key={e.day}
                  style={({ pressed }) => [styles.entry, pressed && { opacity: 0.6 }]}
                  onPress={() => {
                    pick(e.day);
                    scroll.current?.scrollTo({ y: 0, animated: true });
                  }}
                >
                  <View style={styles.entryDate}>
                    <Text style={styles.entryDay}>{d.getDate()}</Text>
                    <Text style={styles.entryDow}>{DOW[d.getDay()]}</Text>
                  </View>
                  <Text style={styles.entryText} numberOfLines={3}>
                    {e.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* 見出しの帯：空の色から透明へ（スクロールした文字が見出しと重ならないように。境目を出さない） */}
      <LinearGradient colors={[SKY[0], SKY[0], 'rgba(143,185,223,0)']} locations={[0, 0.65, 1]} style={[styles.header, { pointerEvents: 'none' }]} />
      <Text style={[styles.title, { pointerEvents: 'none' }]}>{sample ? '日記（見本）' : '日記'}</Text>
      {/* 左上：ふだんは「← 水辺へ」。見本のときは、見本をとじる「×」（星空・夜明けと同じ） */}
      {introOpen ? null : sample ? (
        <Pressable style={[styles.closeBtn, styles.closeLeft]} hitSlop={14} onPress={closeSample} accessibilityLabel="見本をとじる">
          <Text style={styles.closeBtnText}>×</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.back} hitSlop={10} onPress={onBack} accessibilityRole="button">
          <Text style={styles.backText}>← 水辺へ</Text>
        </Pressable>
      )}
      {/* 右上：使い方の印（星空・夜明けと同じ星。昼の空では白く） */}
      {!introOpen && (
        <Pressable
          style={({ pressed }) => [styles.help, pressed && { transform: [{ scale: 0.88 }] }]}
          hitSlop={16}
          onPressIn={() => Haptics.selectionAsync()}
          onPress={() => setIntroOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="日記の使い方"
        >
          <HelpStar color="#ffffff" glint="#fff8e6" />
        </Pressable>
      )}
      {introOpen && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 4 }]}>
          <LinearGradient colors={['#e4eef7', '#f6f7f6']} style={StyleSheet.absoluteFill} />
          <ScrollView contentContainerStyle={styles.introScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.introTitle}>日記の使い方</Text>
            <View style={styles.introBlock}>
              {INTRO_LINES.map(([label, body], i) => (
                <View key={label} style={[styles.introRow, i === INTRO_LINES.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={styles.introLabel}>{label}</Text>
                  <Text style={styles.introBody}>{body}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.introNote}>書かない日があっても大丈夫です。{'\n'}日記は、川や星空とはつながっていません。</Text>
            {!sample && (
              <Pressable hitSlop={12} onPress={openSample} style={styles.sampleBtn} accessibilityRole="button">
                <Text style={styles.sampleBtnText}>見本を見る</Text>
              </Pressable>
            )}
          </ScrollView>
          <Pressable style={[styles.closeBtn, styles.closeRight]} hitSlop={14} onPress={() => setIntroOpen(false)} accessibilityLabel="使い方をとじる">
            <Text style={styles.closeBtnText}>×</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 24, paddingTop: 96, paddingBottom: 90 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, height: 96 },
  title: { position: 'absolute', top: 48, left: 0, right: 0, textAlign: 'center', fontSize: 15, letterSpacing: 6, color: INK, fontFamily: SERIF },
  back: { position: 'absolute', top: 50, left: 16, zIndex: 2 },
  backText: { fontSize: 13, color: INK, fontFamily: SERIF, letterSpacing: 1, opacity: 0.8 },
  // カレンダー
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  arrowBox: { width: 44, alignItems: 'center' },
  monthArrow: { fontSize: 28, lineHeight: 30, color: INK, opacity: 0.55, fontWeight: '200' },
  year: { fontSize: 11, color: SUB, letterSpacing: 4, fontFamily: SERIF },
  monthTitle: { fontSize: 30, color: INK, letterSpacing: 2, fontFamily: SERIF, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dow: { textAlign: 'center', fontSize: 10.5, color: SUB, letterSpacing: 1, paddingBottom: 10, fontFamily: SERIF },
  cell: { alignItems: 'center', justifyContent: 'center' },
  ring: { alignItems: 'center', justifyContent: 'center' },
  ringOn: { backgroundColor: NAVY },
  dayNum: { fontSize: 15, color: INK, fontFamily: SERIF },
  todayNum: { fontWeight: '700' },
  mark: { width: 4, height: 4, borderRadius: 2, backgroundColor: SUN, marginTop: 2 },
  // 選んだ日の1枚（すりガラスのような白。BlurView は Android で不安定なので使わない）
  page: {
    marginTop: 26,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 18,
    shadowColor: '#1e3048',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  pageHead: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  pageDate: { fontSize: 26, color: INK, fontFamily: SERIF, letterSpacing: 1 },
  pageDow: { fontSize: 12, color: SUB, letterSpacing: 2, fontFamily: SERIF },
  rule: { height: StyleSheet.hairlineWidth * 2, backgroundColor: HAIR, marginTop: 12, marginBottom: 14 },
  text: { fontSize: 15, lineHeight: 28, color: INK, fontFamily: SERIF, letterSpacing: 0.3 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 24, marginTop: 16 },
  link: { fontSize: 13, color: NAVY, letterSpacing: 1, fontFamily: SERIF },
  quiet: { fontSize: 13, color: SUB, letterSpacing: 1, fontFamily: SERIF },
  erase: { fontSize: 13, color: '#b0563a', letterSpacing: 1, fontFamily: SERIF },
  write: { paddingVertical: 8 },
  writeText: { fontSize: 14, color: NAVY, letterSpacing: 2, fontFamily: SERIF },
  input: {
    minHeight: 150,
    fontSize: 15,
    lineHeight: 28,
    color: INK,
    fontFamily: SERIF,
    padding: 0,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  keep: { backgroundColor: NAVY, borderRadius: 999, paddingHorizontal: 26, paddingVertical: 9 },
  keepText: { color: '#fff', fontSize: 13, letterSpacing: 3, fontFamily: SERIF },
  // その月の一覧
  list: { marginTop: 40 },
  listTitle: { fontSize: 12, color: SUB, letterSpacing: 4, marginBottom: 6, fontFamily: SERIF },
  entry: { flexDirection: 'row', gap: 18, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: HAIR },
  entryDate: { width: 30, alignItems: 'center' },
  entryDay: { fontSize: 20, color: INK, fontFamily: SERIF },
  entryDow: { fontSize: 10, color: SUB, marginTop: 1, fontFamily: SERIF },
  entryText: { flex: 1, fontSize: 14, lineHeight: 24, color: INK, fontFamily: SERIF, opacity: 0.9 },
  // 見本・使い方（星空・夜明けと同じ形）
  help: { position: 'absolute', top: 44, right: 16, zIndex: 3 },
  closeBtn: { position: 'absolute', top: 46, width: 28, height: 28, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: 'rgba(30,48,72,0.35)', alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  closeBtnText: { fontSize: 16, lineHeight: 18, color: 'rgba(30,48,72,0.75)' },
  closeLeft: { left: 16 },
  closeRight: { right: 16 },
  sampleBtn: { marginTop: 30, alignSelf: 'center', paddingHorizontal: 26, paddingVertical: 9, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: 'rgba(44,74,110,0.5)' },
  sampleBtnText: { fontSize: 13, color: NAVY, letterSpacing: 3, fontFamily: SERIF },
  introScroll: { paddingTop: 104, paddingBottom: 70, paddingHorizontal: 30 },
  introTitle: { fontSize: 20, color: INK, letterSpacing: 4, textAlign: 'center', fontFamily: SERIF, marginBottom: 26 },
  introBlock: { marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: HAIR },
  introRow: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: HAIR, gap: 6 },
  introLabel: { fontSize: 14, color: INK, fontFamily: SERIF, letterSpacing: 1 },
  introBody: { fontSize: 13, lineHeight: 22, color: SUB, fontFamily: SERIF },
  introNote: { fontSize: 12.5, lineHeight: 22, color: SUB, marginTop: 22, fontFamily: SERIF },
});
