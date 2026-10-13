// 長い言葉は泡の中で2行にする（SPEC 第2部 A.「川の中身を『したいこと』に寄せる」。2026-10-13、ユーザー「B」）。
// 泡の大きさ・文字の大きさは、長いほうの行の文字数で決める。UI スレッドからも呼ぶので worklet
export const ONE_LINE_MAX = 8; // 9文字の1行は泡からはみ出した（2026-10-13 見本で確かめた）
const AFTER = 'をにでとがはのへもや'; // この文字の後ろで折ると読みやすい

export function splitBubble(word: string): string {
  'worklet';
  const n = word.length;
  if (n <= ONE_LINE_MAX) return word;
  let best = Math.ceil(n / 2);
  let bestScore = Infinity;
  for (let i = 3; i <= n - 3; i++) {
    const after = AFTER.indexOf(word[i - 1]) >= 0 || word[i - 1] === 'て';
    // 漢字のすぐ後ろのひらがな（朝焼｜け）で折ると読みにくい
    const kanjiThenKana = /[\u4e00-\u9fff]/.test(word[i - 1]) && /[\u3040-\u309f]/.test(word[i]);
    // カタカナ・漢字のかたまりの途中（カ｜フェ、日本画｜展）で折らない（2026-10-13 見本で見つけた）
    const inKatakana = /[\u30a0-\u30ff]/.test(word[i - 1]) && /[\u30a0-\u30ff]/.test(word[i]);
    const inKanji = /[\u4e00-\u9fff]/.test(word[i - 1]) && /[\u4e00-\u9fff]/.test(word[i]);
    const score = Math.max(i, n - i) - (after ? 1.5 : 0) + (kanjiThenKana ? 1.5 : 0) + (inKatakana ? 3 : 0) + (inKanji ? 2 : 0) + (Math.max(i, n - i) > ONE_LINE_MAX ? 10 : 0); // 1行が長すぎると泡からはみ出す
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return `${word.slice(0, best)}\n${word.slice(best)}`;
}

// 長いほうの行の文字数（泡の大きさ・文字の大きさの計算に使う）
export function bubbleLen(word: string): number {
  'worklet';
  const lines = splitBubble(word).split('\n');
  return Math.max(lines[0].length, lines.length > 1 ? lines[1].length : 0);
}
