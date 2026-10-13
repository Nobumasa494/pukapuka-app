// 箱（ラベル）の一覧（案 2026-10-13。docs/talk/box-table.md）。行動の箱34・気持ちの箱6・そのほか4・願い1（2026-10-13 にユーザーが足した）
// 夕空のグループ（決定 2026-10-14。設計書 A.「倉庫と箱」）。行動はホランドの興味の6タイプを土台に調整、気持ちは円環モデル、場面は社会生活基本調査
export type Group = 'body' | 'make' | 'see' | 'think' | 'people' | 'feel' | 'scene';
export const GROUP_LABEL: Record<Group, string> = {
  body: '体を動かす・自然',
  make: '作る・表す',
  see: '見る・味わう',
  think: '考える・遊ぶ',
  people: '人と・出かける',
  feel: '気持ち・願い',
  scene: '場面・休む',
};
// 元気の箱（決定 2026-10-14）：この3つの箱の言葉は、夜明けで「元気」として数える
export const GENKI_BOXES = new Set([35, 36, 37]);
// 行動の箱（夜明けの「〜を拾った日」に使う）
export const isActionBox = (id: number) => id <= 34;

export const BOXES: { id: number; name: string; note: string; group: Group }[] = [
  { id: 1, name: "音楽を聴く", note: "クラシック・ポピュラー・ライブ・イヤホン", group: "see" },
  { id: 2, name: "楽器を弾く", note: "楽器の演奏・邦楽", group: "make" },
  { id: 3, name: "歌う", note: "カラオケ・コーラス", group: "make" },
  { id: 4, name: "踊る", note: "ダンス・おどり", group: "make" },
  { id: 5, name: "映画・ドラマを見る", note: "映画館・家で", group: "see" },
  { id: 6, name: "美術を見る", note: "美術館・展覧会", group: "see" },
  { id: 7, name: "舞台・お笑いを見る", note: "演劇・演芸・舞踊", group: "see" },
  { id: 8, name: "試合を見る", note: "スポーツ観戦", group: "see" },
  { id: 9, name: "本を読む", note: "読書", group: "see" },
  { id: 10, name: "マンガを読む", note: "", group: "see" },
  { id: 11, name: "ゲームをする", note: "", group: "think" },
  { id: 12, name: "囲碁・将棋", note: "", group: "think" },
  { id: 13, name: "絵や彫刻を作る", note: "絵を描く・彫刻", group: "make" },
  { id: 14, name: "陶芸・工芸", note: "", group: "make" },
  { id: 15, name: "縫う・編む", note: "裁縫・編み物・手芸", group: "make" },
  { id: 16, name: "書く", note: "詩・俳句・小説・日記などの創作", group: "make" },
  { id: 17, name: "書道・茶道・華道", note: "", group: "make" },
  { id: 18, name: "写真を撮る", note: "", group: "make" },
  { id: 19, name: "料理・お菓子を作る", note: "", group: "make" },
  { id: 20, name: "植物を育てる", note: "園芸・ガーデニング", group: "body" },
  { id: 21, name: "手作りする", note: "日曜大工・DIY", group: "make" },
  { id: 22, name: "歩く", note: "散歩・ウォーキング", group: "body" },
  { id: 23, name: "走る・泳ぐ", note: "ジョギング・水泳", group: "body" },
  { id: 24, name: "球技・格闘技など", note: "チームや相手のいるスポーツ", group: "body" },
  { id: 25, name: "山・自然に出る", note: "登山・ハイキング・キャンプ", group: "body" },
  { id: 26, name: "自転車で遠くへ", note: "サイクリング", group: "body" },
  { id: 27, name: "体を整える", note: "ヨガ・ストレッチ・筋トレ", group: "body" },
  { id: 28, name: "調べる・学ぶ", note: "勉強・語学・資格・調べもの", group: "think" },
  { id: 29, name: "動物・水族館・遊園地", note: "", group: "body" },
  { id: 30, name: "旅に出る・知らない場所", note: "旅行・知らない町", group: "people" },
  { id: 31, name: "温泉・日帰りの遠出", note: "行楽", group: "people" },
  { id: 32, name: "人と会う・ごはん", note: "友だち・家族と過ごす・交際", group: "people" },
  { id: 33, name: "人の役に立つ", note: "ボランティア・手伝い", group: "people" },
  { id: 34, name: "地域・仲間の活動", note: "社会参加", group: "people" },
  { id: 35, name: "わくわく・気になる", note: "気持ち：快・高ぶり。好奇心", group: "feel" },
  { id: 36, name: "うれしい・楽しい", note: "気持ち：快", group: "feel" },
  { id: 37, name: "おだやか・ほっと", note: "気持ち：快・落ち着き。安心・満足", group: "feel" },
  { id: 38, name: "もやもや・ざわざわ", note: "気持ち：不快・高ぶり。不安・焦り・怒り・緊張", group: "feel" },
  { id: 39, name: "しんどい・沈む", note: "気持ち：不快・落ち着き。悲しみ・寂しい・虚しい", group: "feel" },
  { id: 40, name: "だるい・眠い", note: "体の感じ。疲れ・眠さ・体の重さ", group: "feel" },
  { id: 41, name: "休む・くつろぐ", note: "", group: "scene" },
  { id: 42, name: "家のこと・身の回り", note: "片づけ・お風呂・掃除", group: "scene" },
  { id: 43, name: "仕事・勉強の場面", note: "仕事・会議・締め切り・試験", group: "scene" },
  { id: 44, name: "人・お金・将来の悩み", note: "人間関係・お金・将来・家族の悩み", group: "scene" },
  { id: 45, name: "願い", note: "こうなりたい・こうしたいという気持ち。成長したい・認められたい・自由になりたい・自分らしく", group: "feel" },
];
