import { useState } from 'react';
import { StyleSheet, Text, View, Pressable, useWindowDimensions, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

type WordCount = { word: string; count: number; strength: number };
type StarPos = { word: string; x: number; y: number; count: number; strength: number };

function buildWordCloud(captureList: { word: string; strength: number }[]): WordCount[] {
  if (!captureList || captureList.length === 0) return [];

  const map = new Map<string, { count: number; totalStrength: number }>();
  for (const c of captureList) {
    if (!c.word) continue;
    const existing = map.get(c.word) ?? { count: 0, totalStrength: 0 };
    map.set(c.word, {
      count: existing.count + 1,
      totalStrength: existing.totalStrength + c.strength,
    });
  }
  return Array.from(map.entries())
    .map(([word, { count, totalStrength }]) => ({
      word,
      count,
      strength: totalStrength / count,
    }))
    .sort((a, b) => b.count - a.count);
}

function generateBackgroundStars(width: number, height: number, seed: number) {
  const stars = [];
  for (let i = 0; i < 220; i++) {
    const x = ((i * 73 + seed * 13) % width);
    const y = ((i * 137 + seed * 47) % height);
    const opacity = Math.random() * 0.55 + 0.35;
    stars.push({ x, y, opacity, r: Math.random() * 0.8 + 0.4 });
  }
  return stars;
}

function distributeStars(words: WordCount[], width: number, height: number): StarPos[] {
  const stars: StarPos[] = [];
  if (words.length === 0) return stars;

  const centerX = width / 2;
  const centerY = height / 2.5;
  const maxRadius = Math.min(width, height) * 0.25;
  const displayWords = words.slice(0, 12);
  const count = displayWords.length;

  displayWords.forEach((w, i) => {
    const angle = (i / count) * Math.PI * 2;
    const radius = (w.count / (words[0]?.count || 1)) * maxRadius;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    stars.push({ word: w.word, x, y, count: w.count, strength: w.strength });
  });

  return stars;
}

const MOCK_CAPTURES = [
  { word: '不安', strength: 0.8, capturedAt: Date.now() - 1000 * 60 * 60 * 2 },
  { word: 'わくわく', strength: 0.9, capturedAt: Date.now() - 1000 * 60 * 60 * 5 },
  { word: '疲れた', strength: 0.7, capturedAt: Date.now() - 1000 * 60 * 60 * 12 },
  { word: '認められたい', strength: 0.6, capturedAt: Date.now() - 1000 * 60 * 60 * 24 },
  { word: '自由になりたい', strength: 0.85, capturedAt: Date.now() - 1000 * 60 * 60 * 36 },
  { word: '面白い', strength: 0.5, capturedAt: Date.now() - 1000 * 60 * 60 * 48 },
  { word: '胸が痛い', strength: 0.7, capturedAt: Date.now() - 1000 * 60 * 60 * 60 },
  { word: 'わくわく', strength: 0.6, capturedAt: Date.now() - 1000 * 60 * 60 * 72 },
  { word: '不安', strength: 0.5, capturedAt: Date.now() - 1000 * 60 * 60 * 84 },
];

export default function Archive() {
  const { width, height } = useWindowDimensions();
  const allCaptures = MOCK_CAPTURES; // useQuery(api.captures.listByUser) ?? [];
  const [filter, setFilter] = useState<'week' | 'month' | 'year' | 'all'>('week');

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const filteredCaptures = allCaptures.filter((c) => {
    const age = now - c.capturedAt;
    if (filter === 'week') return age < 7 * dayMs;
    if (filter === 'month') return age < 30 * dayMs;
    if (filter === 'year') return age < 365 * dayMs;
    return true;
  });

  const wordCloud = buildWordCloud(filteredCaptures);
  const stars = distributeStars(wordCloud, width, height);
  const backgroundStars = generateBackgroundStars(width, height, 42);

  const maxCount = wordCloud[0]?.count ?? 1;
  const topWord = wordCloud[0];

  return (
    <LinearGradient
      colors={['#06101e', '#0a1830', '#0e2240', '#122848', '#162c42', '#142438', '#0c1a28', '#081018']}
      style={styles.container}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.push('/')}>
          <Text style={styles.back}>← 戻る</Text>
        </Pressable>
        <Text style={styles.title}>ふりかえり</Text>
      </View>

      {filteredCaptures.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>まだ記録がありません</Text>
          <Text style={styles.emptySubtext}>気になる言葉を拾ってみてください</Text>
        </View>
      ) : (
        <>
          <View style={styles.constellationContainer}>
            <Text style={styles.constellationPlaceholder}>✨ 星座を配置中...</Text>
            <ScrollView style={styles.wordList} contentContainerStyle={styles.wordListContent}>
              {wordCloud.map(({ word, count }, i) => (
                <View key={`${word}-${i}`} style={styles.wordItem}>
                  <Text style={styles.wordItemText}>{word}</Text>
                  <Text style={styles.wordItemCount}>{count}回</Text>
                </View>
              ))}
            </ScrollView>
          </View>

          {topWord && (
            <View style={styles.topWordContainer}>
              <Text style={styles.topWordLabel}>今週の言葉</Text>
              <Text style={styles.topWord}>{topWord.word}</Text>
              <Text style={styles.topWordCount}>{topWord.count}回</Text>
            </View>
          )}

          <View style={styles.filterContainer}>
            {(['week', 'month', 'year', 'all'] as const).map((f) => (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[styles.filterButton, filter === f && styles.filterButtonActive]}
              >
                <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                  {f === 'week' && '今週'}
                  {f === 'month' && '今月'}
                  {f === 'year' && '今年'}
                  {f === 'all' && 'すべて'}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
    gap: 16,
    zIndex: 10,
  },
  back: {
    color: 'rgba(242,237,226,0.6)',
    fontSize: 14,
  },
  title: {
    color: '#f2ede2',
    fontSize: 18,
    fontWeight: '600',
  },
  constellationContainer: {
    flex: 1,
    overflow: 'hidden',
    padding: 20,
  },
  constellationPlaceholder: {
    color: 'rgba(242,237,226,0.5)',
    fontSize: 12,
    marginBottom: 16,
    textAlign: 'center',
  },
  wordList: {
    flex: 1,
  },
  wordListContent: {
    gap: 8,
  },
  wordItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255,215,140,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,140,0.15)',
  },
  wordItemText: {
    color: '#fffaf6',
    fontSize: 14,
    fontWeight: '500',
  },
  wordItemCount: {
    color: 'rgba(242,237,226,0.6)',
    fontSize: 12,
  },
  topWordContainer: {
    alignItems: 'center',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,215,140,0.2)',
  },
  topWordLabel: {
    color: 'rgba(242,237,226,0.5)',
    fontSize: 12,
    marginBottom: 4,
  },
  topWord: {
    color: '#fffaf6',
    fontSize: 24,
    fontWeight: '300',
    marginBottom: 4,
  },
  topWordCount: {
    color: 'rgba(242,237,226,0.6)',
    fontSize: 13,
  },
  filterContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,215,140,0.3)',
  },
  filterButtonActive: {
    backgroundColor: 'rgba(255,215,140,0.15)',
    borderColor: 'rgba(255,215,140,0.6)',
  },
  filterText: {
    color: 'rgba(242,237,226,0.7)',
    fontSize: 12,
  },
  filterTextActive: {
    color: '#fffaf6',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    color: '#f2ede2',
    fontSize: 16,
  },
  emptySubtext: {
    color: 'rgba(242,237,226,0.5)',
    fontSize: 13,
  },
});
