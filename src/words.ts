export type Category = 'emotion' | 'body' | 'situation' | 'value' | 'curiosity';

export const CATEGORY_LABEL: Record<Category, string> = {
  emotion: '感情',
  body: '身体感覚',
  situation: '状況・場面',
  value: '価値観・欲求',
  curiosity: '好奇心',
};

const WORDS_BY_CATEGORY: Record<Category, readonly string[]> = {
  emotion: [
    "不安", "わくわく", "怒り", "悲しみ", "恥", "嫉妬", "安心",
    "焦り", "孤独", "喜び", "苦しい", "ときめき", "虚しい", "穏やか",
    "緊張", "解放感", "悔しい", "満足", "退屈", "切ない",
    "うれしい", "怖い", "むかつく", "ほっとした", "寂しい",
    "恐れ", "後悔", "感謝", "戸惑い", "高揚感",
  ],
  body: [
    "疲れ", "眠い", "胸が痛い", "軽い", "重い", "ざわざわ",
    "頭が痛い", "体が重い", "スッキリ", "どきどき", "ぼーっとする",
    "息苦しい", "肩が凝る", "お腹が空く", "むずむず", "しびれる",
    "力が抜ける", "のどが渇く", "目が疲れた",
  ],
  situation: [
    "仕事", "人間関係", "将来", "お金", "家族", "恋愛",
    "友達", "時間", "自分", "変化", "失敗", "評価",
    "健康", "趣味", "勉強", "SNS", "比較", "プレッシャー",
    "責任", "期待", "締め切り", "会議", "帰り道", "朝",
  ],
  value: [
    "自由になりたい", "認められたい", "逃げたい", "成長したい",
    "休みたい", "つながりたい", "一人になりたい", "変わりたい",
    "楽しみたい", "正直でいたい", "大切にされたい", "役に立ちたい",
    "もっと自分らしく", "安心したい", "信頼したい", "本音を言いたい",
  ],
  curiosity: [
    "面白い", "気になる", "もっと知りたい", "なんで？",
    "やってみたい", "不思議", "ひらめいた",
    "試してみたい", "調べたい", "どうなるんだろう", "深掘りしたい",
    "ワクワクする", "意外だった", "もしかして",
  ],
};

export const WORD_LIST: readonly string[] = Object.values(WORDS_BY_CATEGORY).flat();

export const WORD_CATEGORY: Record<string, Category> = Object.fromEntries(
  (Object.entries(WORDS_BY_CATEGORY) as [Category, readonly string[]][]).flatMap(([cat, words]) =>
    words.map((w) => [w, cat] as const),
  ),
);

export function getRandomWords(count: number): string[] {
  const shuffled = [...WORD_LIST].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
