import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

// 開発用：ダミーの人の記録を入れる（アプリからは呼べない。`npx convex run demo:seedDemo` で実行）。
// 夜空を、使い続けた後の様子で、すぐ確かめるため。端末の目印は専用で、本物の記録とは混ざらない。
// アプリは、web で ?demo=1 をつけて開くと、この目印で動く（src/useCaptures.ts）
export const DEMO_DEVICE_ID = "demo-persona-0000000000000001";
const DAY = 24 * 60 * 60 * 1000;
const JST = 9 * 60 * 60 * 1000;

// ダミーの人：平日は仕事のしんどさ、週末はつくる・ほっとする・人とのつながり。拾う量は日によってばらばら
const THEMES: Record<string, string[]> = {
  work: ["仕事", "疲れ", "眠い", "締め切り", "会議", "不安", "プレッシャー", "肩が凝る", "目が疲れた", "帰り道"],
  make: ["絵を描く", "作る", "ひらめいた", "わくわく", "気になる", "もっと知りたい", "やってみたい", "試してみたい", "面白い", "書く"],
  rest: ["散歩", "お風呂", "安心", "ほっとした", "休みたい", "穏やか", "軽い", "音楽", "カフェ"],
  people: ["友達", "家族", "感謝", "うれしい", "人と話す", "一緒に食べる", "喜び"],
};
// ときどき、まったく関係のない言葉も拾う
const NOISE = ["怒り", "悲しみ", "退屈", "焦り", "将来", "お金", "時間", "健康", "料理", "読書", "映画", "旅", "買い物", "勉強"];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

export const seedDemo = internalMutation({
  args: { days: v.optional(v.number()), seed: v.optional(v.number()) },
  returns: v.object({ deleted: v.number(), inserted: v.number() }),
  handler: async (ctx, args) => {
    const days = Math.min(120, Math.max(7, args.days ?? 60));
    const r = rng(args.seed ?? 5);
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

    const old = await ctx.db
      .query("captures")
      .withIndex("by_deviceId_and_capturedAt", (q) => q.eq("deviceId", DEMO_DEVICE_ID))
      .collect();
    for (const row of old) await ctx.db.delete(row._id);

    const now = Date.now();
    const todayStart = Math.floor((now + JST) / DAY) * DAY - JST; // 日本の今日の0時
    let inserted = 0;
    for (let d = days - 1; d >= 0; d--) {
      const dayStart = todayStart - d * DAY;
      const dow = new Date(dayStart + JST).getUTCDay();
      const weekend = dow === 0 || dow === 6;
      const themes: string[] = [];
      if (!weekend) themes.push(r() < 0.8 ? "work" : "rest");
      else {
        const x = r();
        themes.push(x < 0.4 ? "make" : x < 0.7 ? "rest" : "people");
      }
      if (r() < 0.3) themes.push(weekend ? "make" : r() < 0.5 ? "people" : "rest");
      const burst = r() < 0.3;
      const words: string[] = [];
      for (const t of themes) {
        const n = burst ? 5 + Math.floor(r() * 5) : 2 + Math.floor(r() * 3);
        for (let i = 0; i < n; i++) words.push(pickFrom(THEMES[t]));
      }
      // 意外なつながり：散歩の日はひらめいた、会議の日はわくわく、疲れた日は絵を描く、が、ときどき一緒に出る
      if (words.includes("散歩") && r() < 0.6) words.push("ひらめいた");
      if (words.includes("会議") && r() < 0.5) words.push("わくわく");
      if (words.includes("疲れ") && r() < 0.25) words.push("絵を描く");
      if (r() < 0.3) {
        const k = 1 + Math.floor(r() * 2);
        for (let i = 0; i < k; i++) words.push(NOISE[Math.floor(r() * NOISE.length)]);
      }
      for (const word of words) {
        // 日本時間の18〜22時ごろ
        const capturedAt = dayStart + (18 + r() * 4) * 60 * 60 * 1000;
        if (capturedAt > now) continue;
        await ctx.db.insert("captures", {
          deviceId: DEMO_DEVICE_ID,
          word,
          strength: Math.min(1, r() * 0.9 + 0.05),
          capturedAt,
        });
        inserted++;
      }
    }
    return { deleted: old.length, inserted };
  },
});
