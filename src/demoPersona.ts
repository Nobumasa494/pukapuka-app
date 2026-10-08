// ダミーの人の記録を作る（開発用のダミーの人 convex/demo.ts と、夜空の「見本」で、同じものを使う）。RN にも Convex にも依存しない。
// ダミーの人：平日は仕事のしんどさ、週末はつくる・ほっとする・人とのつながり。拾う量は日によってばらばら。
// 意外なつながり（散歩の日にひらめいた、など）も、ときどき混ぜてある

const THEMES: Record<string, string[]> = {
  work: ['仕事', '疲れ', '眠い', '締め切り', '会議', '不安', 'プレッシャー', '肩が凝る', '目が疲れた', '帰り道'],
  make: ['絵を描く', '作る', 'ひらめいた', 'わくわく', '気になる', 'もっと知りたい', 'やってみたい', '試してみたい', '面白い', '書く'],
  rest: ['散歩', 'お風呂', '安心', 'ほっとした', '休みたい', '穏やか', '軽い', '音楽', 'カフェ'],
  people: ['友達', '家族', '感謝', 'うれしい', '人と話す', '一緒に食べる', '喜び'],
};
// ときどき、まったく関係のない言葉も拾う
const NOISE = ['怒り', '悲しみ', '退屈', '焦り', '将来', 'お金', '時間', '健康', '料理', '読書', '映画', '旅', '買い物', '勉強'];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

export type DemoDay = { start: number; dow: number }; // その日の0時（ミリ秒）と、曜日（0＝日曜）
export type DemoCapture = { word: string; strength: number; capturedAt: number };

// days は古い日から順に。各日の18〜22時ごろに拾ったことにする。now より後の記録は作らない
export function makeDemoCaptures(days: DemoDay[], seed = 5, now = Infinity): DemoCapture[] {
  const r = rng(seed);
  const pickFrom = (words: string[]) => {
    // 前のほうの言葉ほど、よく選ばれる
    const w = words.map((_, i) => 1 / (1 + i * 0.45));
    let x = r() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < words.length; i++) {
      x -= w[i];
      if (x <= 0) return words[i];
    }
    return words[0];
  };
  const out: DemoCapture[] = [];
  for (const { start, dow } of days) {
    const weekend = dow === 0 || dow === 6;
    const themes: string[] = [];
    if (!weekend) themes.push(r() < 0.8 ? 'work' : 'rest');
    else {
      const x = r();
      themes.push(x < 0.4 ? 'make' : x < 0.7 ? 'rest' : 'people');
    }
    if (r() < 0.3) themes.push(weekend ? 'make' : r() < 0.5 ? 'people' : 'rest');
    const burst = r() < 0.3;
    const words: string[] = [];
    for (const t of themes) {
      const n = burst ? 5 + Math.floor(r() * 5) : 2 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) words.push(pickFrom(THEMES[t]));
    }
    if (words.includes('散歩') && r() < 0.6) words.push('ひらめいた');
    if (words.includes('会議') && r() < 0.5) words.push('わくわく');
    if (words.includes('疲れ') && r() < 0.25) words.push('絵を描く');
    if (r() < 0.3) {
      const k = 1 + Math.floor(r() * 2);
      for (let i = 0; i < k; i++) words.push(NOISE[Math.floor(r() * NOISE.length)]);
    }
    for (const word of words) {
      const capturedAt = start + (18 + r() * 4) * 60 * 60 * 1000;
      if (capturedAt > now) continue;
      out.push({ word, strength: Math.min(1, r() * 0.9 + 0.05), capturedAt });
    }
  }
  return out;
}
