import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { findWordId, wordTexts } from "./words";
import { addToPrefs } from "./prefs";

// 第1段：ログインなし。端末ごとの仮の ID（アプリが最初に作って端末に覚える、推測しにくい長い文字列）で記録を分ける
const DAY = 24 * 60 * 60 * 1000;

export const add = mutation({
  args: {
    deviceId: v.string(),
    word: v.string(),
    strength: v.number(),
    frame: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.deviceId.length < 16 || args.word.length > 40) return null;
    // 言葉は文字で受け取り、言葉の表の番号で残す（SPEC 第2部 G.）。表にない言葉は残さない
    const wordId = await findWordId(ctx, args.word, args.deviceId);
    if (!wordId) return null;
    await ctx.db.insert("captures", {
      deviceId: args.deviceId,
      wordId,
      frame: args.frame ?? "even",
      strength: Math.max(0, Math.min(1, args.strength)),
      capturedAt: Date.now(),
    });
    await addToPrefs(ctx, args.deviceId, [{ wordId, text: args.word, shown: 0, picked: 1 }]);
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
    // 番号を文字に戻して返す（分析はこれまで通り言葉の文字で数える）
    const text = wordTexts(ctx);
    const out = [];
    for (const r of rows) {
      const word = await text(r.wordId);
      if (word) out.push({ word, strength: r.strength, capturedAt: r.capturedAt });
    }
    return out;
  },
});

// 開発用：まちがって入った1件を消す（アプリからは呼べない。`npx convex run captures:removeOne '{"id":"…"}'`）
export const removeOne = internalMutation({
  args: { id: v.id("captures") },
  returns: v.union(v.null(), v.object({ deviceId: v.optional(v.string()), capturedAt: v.number() })),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) return null;
    await ctx.db.delete(args.id);
    return { deviceId: row.deviceId, capturedAt: row.capturedAt };
  },
});
