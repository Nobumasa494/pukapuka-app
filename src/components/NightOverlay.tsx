import { StyleSheet, Text, View, Pressable } from 'react-native';

// ふりかえり（夜）。川の画面の上に重ねて出す。背景（夜の静止画）は川の画面が持つ。
// 星座（共起ネットワーク）はこの上に足していく

type Props = {
  // 1つ前（拾ったことば）へ
  onBack: () => void;
  onRiver: () => void;
};

export default function NightOverlay({ onBack, onRiver }: Props) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* 横幅いっぱいのタイトルはボタンより先に置き、タップを受けない（後に置くとスマホでボタンの上に重なって押せない） */}
      <View style={styles.titleRow} pointerEvents="none">
        <Text style={styles.title}>ふりかえり</Text>
      </View>

      <Pressable style={styles.back} hitSlop={16} onPress={onBack}>
        <Text style={styles.backText}>← ことばへ</Text>
      </Pressable>

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
  river: { position: 'absolute', bottom: 40, alignSelf: 'center', zIndex: 10 },
  riverText: { fontSize: 13, color: 'rgba(255,246,232,0.75)' },
});
