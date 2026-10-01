import { StyleSheet, Text, View, ScrollView, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

type WordCount = { word: string; count: number; strength: number };

function buildWordCloud(captures: { word: string; strength: number }[]): WordCount[] {
  const map = new Map<string, { count: number; totalStrength: number }>();
  for (const c of captures) {
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

export default function Archive() {
  const captures = useQuery(api.captures.listByUser) ?? [];
  const wordCloud = buildWordCloud(captures);
  const maxCount = wordCloud[0]?.count ?? 1;

  return (
    <LinearGradient colors={['#0b1f22', '#141b30', '#24304f']} style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>← 戻る</Text>
        </Pressable>
        <Text style={styles.title}>振り返り</Text>
      </View>

      {captures.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>まだ記録がありません</Text>
          <Text style={styles.emptySubtext}>気になる言葉を飛ばしてみてください</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.cloud}>
          {wordCloud.map(({ word, count, strength }) => {
            const ratio = count / maxCount;
            const fontSize = 14 + ratio * 28;
            const opacity = 0.4 + strength * 0.6;
            return (
              <View key={word} style={styles.wordWrap}>
                <Text style={[styles.word, { fontSize, opacity }]}>{word}</Text>
                <Text style={styles.count}>{count}</Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 56,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 24,
    gap: 16,
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
  cloud: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 24,
    gap: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 48,
  },
  wordWrap: {
    alignItems: 'center',
  },
  word: {
    color: '#f2ede2',
    fontWeight: '500',
  },
  count: {
    color: 'rgba(242,237,226,0.3)',
    fontSize: 10,
  },
});
