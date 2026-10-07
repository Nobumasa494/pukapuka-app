import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// 第1段：ログインなし。端末ごとの仮の ID（アプリが最初に作って端末に覚える、推測しにくい長い文字列）で記録を分ける
const DAY = 24 * 60 * 60 * 1000;

export const add = mutation({
  args: {
    deviceId: v.string(),
    word: v.string(),
    strength: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.deviceId.length < 16 || args.word.length > 40) return null;
    await ctx.db.insert("captures", {
      deviceId: args.deviceId,
      word: args.word,
      strength: Math.max(0, Math.min(1, args.strength)),
      capturedAt: Date.now(),
    });
    return null;
  },
});

// 直近 days 日の記録（島は12か月、夜空はひと月、拾ったことばは最近）。新しい順
export const listRecent = query({
  args: { deviceId: v.string(), days: v.number() },
  returns: v.array(v.object({ word: v.string(), strength: v.number(), capturedAt: v.number() })),
  handler: async (ctx, args) => {
    if (args.deviceId.length < 16) return [];
    const since = Date.now() - Math.min(400, Math.max(1, args.days)) * DAY;
    const rows = await ctx.db
      .query("captures")
      .withIndex("by_deviceId_and_capturedAt", (q) => q.eq("deviceId", args.deviceId).gt("capturedAt", since))
      .order("desc")
      .take(5000);
    return rows.map((r) => ({ word: r.word, strength: r.strength, capturedAt: r.capturedAt }));
  },
});
