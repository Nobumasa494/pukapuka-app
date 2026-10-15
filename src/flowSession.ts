// アプリを開いてから流れた回数（言葉 → 回数。送ったかどうかに関係なく足すだけ）。夕空の割合で、今日の分をサーバーから読み直さずに足すため（2026-10-15）
// useFlows（数える）と useCaptures（夕空の割合）の両方から使う。2つが互いを読み込む輪にならないよう、別のファイルにした
const sessionShown = new Map<string, number>();
const sessionListeners = new Set<() => void>();
export const getSessionShown = () => sessionShown;
export function onSessionShown(fn: () => void) {
  sessionListeners.add(fn);
  return () => {
    sessionListeners.delete(fn);
  };
}

export function addSessionShown(word: string) {
  sessionShown.set(word, (sessionShown.get(word) ?? 0) + 1);
}
export function notifySessionShown() {
  sessionListeners.forEach((fn) => fn());
}
