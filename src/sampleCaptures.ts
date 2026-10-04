import { WORD_CATEGORY } from './words';

// 見た目確認用の仮の記録（本物の記録につなぐまで）。拾ったことばとふりかえりで同じものを使う。
// 回数と強さの平均はワードクラウドの見本（習慣と本音の対比）と同じになるようにし、
// 拾った日は「いつも一緒に拾う組」が出るように決める。どれも今日から数えた日で作るので、期間フィルターで絞れる

export type Capture = { word: string; strength: number; capturedAt: number };

// 一緒に拾われやすい組。days は今日から何日前の日を使うか、hours は拾う時間帯
type Cluster = 'work' | 'worry' | 'curious' | 'escape' | 'calm';

const DAYS = 28;

const CLUSTERS: Record<Cluster, { pick: (dow: number, ago: number) => boolean; hours: [number, number] }> = {
  // 平日の帰り（口ぐせのような言葉。いつも軽く拾う）
  work: { pick: (dow) => dow >= 1 && dow <= 5, hours: [18, 22] },
  // 日曜と月曜の夜、それに週の半ばに少し
  worry: { pick: (dow, ago) => dow === 0 || dow === 1 || ago % 9 === 4, hours: [22, 24] },
  // 週末の昼と水曜
  curious: { pick: (dow) => dow === 0 || dow === 6 || dow === 3, hours: [11, 17] },
  // ある週の4日続けて（「逃げたい」と「自由になりたい」が何日も一緒に出る）
  escape: { pick: (_dow, ago) => ago >= 9 && ago <= 12, hours: [21, 24] },
  // 週末の朝
  calm: { pick: (dow) => dow === 0 || dow === 6, hours: [8, 11] },
};

const SAMPLE: [word: string, count: number, avgStrength: number, cluster: Cluster][] = [
  ['疲れ', 20, 0.2, 'work'],
  ['不安', 10, 0.9, 'worry'],
  ['仕事', 5, 0.3, 'work'],
  ['逃げたい', 2, 1.0, 'escape'],
  ['面白い', 1, 1.0, 'curious'],
  ['将来', 9, 0.55, 'worry'],
  ['胸が痛い', 3, 0.95, 'worry'],
  ['眠い', 8, 0.15, 'work'],
  ['成長したい', 6, 0.7, 'curious'],
  ['気になる', 7, 0.5, 'curious'],
  ['人間関係', 4, 0.6, 'worry'],
  ['安心', 3, 0.35, 'calm'],
  ['わくわく', 5, 0.8, 'curious'],
  ['認められたい', 2, 0.85, 'escape'],
  ['お金', 4, 0.25, 'worry'],
  ['もっと知りたい', 3, 0.65, 'curious'],
  ['孤独', 2, 0.9, 'worry'],
  ['軽い', 2, 0.2, 'calm'],
  ['怒り', 1, 0.75, 'escape'],
  ['休みたい', 6, 0.3, 'work'],
  ['どきどき', 1, 0.4, 'curious'],
  ['家族', 3, 0.45, 'calm'],
  ['なんで？', 2, 0.6, 'curious'],
  ['帰り道', 1, 0.2, 'work'],
  ['自由になりたい', 2, 0.95, 'escape'],
  ['感謝', 1, 0.5, 'calm'],
];

// 毎回同じ結果になる乱数（言葉ごとに種を変える）
function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

// 強さは平均が変わらないよう、2回ずつ +d / −d に振る
function strengths(n: number, avg: number): number[] {
  const d = Math.max(0, Math.min(0.08, avg - 0.1, 1 - avg));
  return Array.from({ length: n }, (_, i) => (i === n - 1 && n % 2 === 1 ? avg : i % 2 === 0 ? avg + d : avg - d));
}

export function makeSampleCaptures(now: number): Capture[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  // 組ごとに、使える日を同じ順番（その組で共通の並び）で持つ。言葉はこの順に8割の確率で拾うので、同じ組の言葉は同じ日に集まりやすい
  const order: Record<Cluster, number[]> = { work: [], worry: [], curious: [], escape: [], calm: [] };
  for (const c of Object.keys(CLUSTERS) as Cluster[]) {
    const r = rng(c);
    const days: number[] = [];
    for (let ago = 0; ago < DAYS; ago++) {
      const d = new Date(today);
      d.setDate(d.getDate() - ago);
      if (CLUSTERS[c].pick(d.getDay(), ago)) days.push(ago);
    }
    order[c] = days.map((ago) => ({ ago, k: r() })).sort((a, b) => a.k - b.k).map((x) => x.ago);
  }

  const out: Capture[] = [];
  for (const [word, count, avg, cluster] of SAMPLE) {
    if (!WORD_CATEGORY[word]) continue;
    const r = rng(word);
    const pool = order[cluster];
    const days: number[] = [];
    for (let i = 0; days.length < count; i++) {
      const ago = pool[i % pool.length];
      // 一巡しても足りなければ同じ日に2回目を拾う
      if (i >= pool.length || r() < 0.8) days.push(ago);
    }
    const [h0, h1] = CLUSTERS[cluster].hours;
    strengths(count, avg).forEach((strength, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - days[i]);
      d.setMinutes(Math.floor((h0 + r() * (h1 - h0)) * 60) - 1);
      // 今日の分はまだ来ていない時刻にしない
      out.push({ word, strength, capturedAt: Math.min(d.getTime(), now) });
    });
  }
  return out.sort((a, b) => a.capturedAt - b.capturedAt);
}

// 画面で使う仮の記録（アプリを開いた時点を「今」とする）
export const SAMPLE_NOW = Date.now();
export const SAMPLE_CAPTURES = makeSampleCaptures(SAMPLE_NOW);
