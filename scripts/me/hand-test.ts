/// <reference types="node" />
// わたしのことの計算を、手で計算した小さな例と比べる。使い方: npx tsx scripts/me/hand-test.ts
// 例（2026-10-05 月 〜 10-09 金。1日目 散歩・疲れ／2日目 わくわく／3日目 疲れ／4日目 不安／5日目 疲れ）
// 手で数えた矢印（次の日 1・2日後 0.5・3日後 0.25、同じ言葉どうしは引かない）：
//   散歩→わくわく 1、疲れ→わくわく 1、散歩→疲れ 0.5、散歩→不安 0.25、疲れ→不安 0.25+1、わくわく→疲れ 1+0.25、わくわく→不安 0.5、不安→疲れ 1
// 源：散歩 1・疲れ 1。めぐり：{わくわく・不安・疲れ}（散歩には戻る矢印がない）。
// 育ち（週）：月〜金は同じ週。言葉は 2+1+1+1+1 = 6、元気はわくわくの1 → 1/6
import { arrows, genkiSources, cycles, growth, pageRank } from '../../src/flow';
const at = (day: number) => new Date(2026, 9, day, 20).getTime();
const caps = [
  ['散歩', 5], ['疲れ', 5], ['疲れ', 5], ['わくわく', 6], ['疲れ', 7], ['不安', 8], ['疲れ', 9],
].map(([word, d]) => ({ word: word as string, capturedAt: at(d as number) }));
const expected: Record<string, number> = {
  '散歩>わくわく': 1, '疲れ>わくわく': 1, '散歩>疲れ': 0.5, '散歩>不安': 0.25, '疲れ>不安': 1.25,
  'わくわく>疲れ': 1.25, 'わくわく>不安': 0.5, '不安>疲れ': 1,
};
let ok = true;
const check = (name: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  console.log(g === w ? '✅' : '❌', name, g === w ? '' : `\n   出た: ${g}\n   正解: ${w}`);
  if (g !== w) ok = false;
};
const list = arrows(caps);
check('矢印', Object.fromEntries(list.map((a) => [`${a.from}>${a.to}`, a.weight]).sort()), Object.fromEntries(Object.entries(expected).sort()));
check('源', genkiSources(list).map((s) => [s.word, s.weight]).sort(), [['散歩', 1], ['疲れ', 1]].sort());
check('めぐり', cycles(list), [['わくわく', '不安', '疲れ'].sort()]);
check('育ち（週）', growth(caps, 'week').map((g) => [new Date(g.start).getDate(), g.total, +g.ratio.toFixed(4)]), [[5, 6, +(1 / 6).toFixed(4)]]);
const pr = pageRank(list);
check('PageRank の合計は1', +[...pr.values()].reduce((a, b) => a + b, 0).toFixed(9), 1);
check('PageRank：戻る矢印のない散歩がいちばん小さい', [...pr].sort((a, b) => a[1] - b[1])[0][0], '散歩');
// 記録が1日だけ・空のとき
check('1日だけなら矢印なし', arrows(caps.slice(0, 2)), []);
check('空', [arrows([]), cycles([]), growth([], 'month'), [...pageRank([])]], [[], [], [], []]);
// 開かなかった日は詰めない：4日あいたら矢印なし
check('4日あくと矢印なし', arrows([{ word: '散歩', capturedAt: at(1) }, { word: 'わくわく', capturedAt: at(5) }]), []);
// 月をまたぐ（9/30 → 10/1 は次の日）
check('月をまたいでも次の日', arrows([{ word: '散歩', capturedAt: new Date(2026, 8, 30, 23).getTime() }, { word: 'わくわく', capturedAt: new Date(2026, 9, 1, 1).getTime() }]), [{ from: '散歩', to: 'わくわく', weight: 1 }]);
process.exit(ok ? 0 : 1);
