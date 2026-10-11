import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { findWordId, wordTexts } from "./words";
import { addToPrefs } from "./prefs";

// 流れた記録（SPEC 第2部 G.）。端末で数えた回数を、まとめて足す。1日1行
const count = v.object({ word: v.string(), frame: v.string(), n: v.number() });
const DAY_RE = /^\d{4}-\d{1,2}-\d{1,2}$/;

export const add = mutation({
  args: { deviceId: v.string(), day: v.string(), counts: v.array(count) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.deviceId.length < 16 || !DAY_RE.test(args.day) || args.counts.length === 0 || args.counts.length > 500) return null;
    const add = args.counts.filter((c) => c.word.length > 0 && c.word.length <= 40 && c.frame.length <= 20 && Number.isInteger(c.n) && c.n > 0 && c.n <= 10000);
    if (!add.length) return null;
    const row = await ctx.db
      .query("flows")
      .withIndex("by_deviceId_and_day", (q) => q.eq("deviceId", args.deviceId).eq("day", args.day))
      .unique();
    // 言葉は文字で受け取り、言葉の表の番号で残す。表にない言葉は数えない
    const merged = new Map<string, { wordId: Id<"words">; frame: string; n: number }>();
    const put = (wordId: Id<"words">, frame: string, n: number) => {
      const key = `${frame}\n${wordId}`;
      const cur = merged.get(key);
      if (cur) cur.n += n;
      else merged.set(key, { wordId, frame, n });
    };
    for (const c of row?.counts ?? []) put(c.wordId, c.frame, c.n);
    const toPrefs = [];
    for (const c of add) {
      const wordId = await findWordId(ctx, c.word, args.deviceId);
      if (!wordId) continue;
      put(wordId, c.frame, c.n);
      toPrefs.push({ wordId, text: c.word, shown: c.n, picked: 0 });
    }
    if (!merged.size) return null;
    const counts = [...merged.values()].slice(0, 2000);
    await addToPrefs(ctx, args.deviceId, toPrefs);
    if (row) await ctx.db.patch(row._id, { counts, updatedAt: Date.now() });
    else await ctx.db.insert("flows", { deviceId: args.deviceId, day: args.day, counts, updatedAt: Date.now() });
    return null;
  },
});

// 直近の流れた記録（日ごと）。夕空の割合・夜明けの確かめ直しで使う（まだ画面では使っていない）
export const listDays = query({
  args: { deviceId: v.string(), days: v.array(v.string()) },
  returns: v.array(v.object({ day: v.string(), counts: v.array(count) })), // 言葉は文字に戻して返す
  handler: async (ctx, args) => {
    if (args.deviceId.length < 16) return [];
    const out = [];
    for (const day of args.days.slice(0, 120)) {
      const row = await ctx.db
        .query("flows")
        .withIndex("by_deviceId_and_day", (q) => q.eq("deviceId", args.deviceId).eq("day", day))
        .unique();
      if (!row) continue;
      const text = wordTexts(ctx);
      const counts = [];
      for (const c of row.counts) {
        const word = await text(c.wordId);
        if (word) counts.push({ word, frame: c.frame, n: c.n });
      }
      out.push({ day: row.day, counts });
    }
    return out;
  },
});
