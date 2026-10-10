import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// 日記。自分で書くだけ（拾った記録とはつなげない）。第1段はログインなし、端末ごとの仮の ID で分ける（captures.ts と同じ）
const TEXT_MAX = 4000;
const okId = (id: string) => id.length >= 16;
const okDay = (day: string) => /^\d{4}-\d{1,2}-\d{1,2}$/.test(day);

// その日の日記を残す。同じ日はおきかえ（1日1つ）。空にしたら消す
export const save = mutation({
  args: { deviceId: v.string(), day: v.string(), text: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!okId(args.deviceId) || !okDay(args.day)) return null;
    const text = args.text.trim().slice(0, TEXT_MAX);
    const old = await ctx.db
      .query("diaries")
      .withIndex("by_deviceId_and_day", (q) => q.eq("deviceId", args.deviceId).eq("day", args.day))
      .unique();
    if (!text) {
      if (old) await ctx.db.delete(old._id);
      return null;
    }
    const row = { deviceId: args.deviceId, day: args.day, text, savedAt: Date.now() };
    if (old) await ctx.db.replace(old._id, row);
    else await ctx.db.insert("diaries", row);
    return null;
  },
});

export const remove = mutation({
  args: { deviceId: v.string(), day: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!okId(args.deviceId)) return null;
    const old = await ctx.db
      .query("diaries")
      .withIndex("by_deviceId_and_day", (q) => q.eq("deviceId", args.deviceId).eq("day", args.day))
      .unique();
    if (old) await ctx.db.delete(old._id);
    return null;
  },
});

// 書いた日記のすべて（カレンダーに印を付け、振り返るため）
export const list = query({
  args: { deviceId: v.string() },
  returns: v.array(v.object({ day: v.string(), text: v.string(), savedAt: v.number() })),
  handler: async (ctx, args) => {
    if (!okId(args.deviceId)) return [];
    const rows = await ctx.db
      .query("diaries")
      .withIndex("by_deviceId_and_day", (q) => q.eq("deviceId", args.deviceId))
      .take(5000);
    return rows.map((r) => ({ day: r.day, text: r.text, savedAt: r.savedAt }));
  },
});
