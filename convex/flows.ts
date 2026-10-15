import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { findWordId, wordTexts } from "./words";
import { addShownToCards, addToPrefs } from "./prefs";

// 流れた記録（SPEC 第2部 G.）。端末で数えた回数を、まとめて足す。1人×1日×1語で1行（flowWords。2026-10-15 に1日1行から変えた）
const count = v.object({ word: v.string(), frame: v.string(), n: v.number() });
const DAY_RE = /^\d{4}-\d{1,2}-\d{1,2}$/;

export const add = mutation({
  // picked：この中で、この端末が拾ったことのある言葉（倉庫で動く新しい端末だけが送る。2026-10-16）。
  // あるときは、言葉の表を引かずに文字で数え、好みのカードは picked の言葉だけ直す（1回の読み込み 約60KB → 約10KB）
  args: { deviceId: v.string(), day: v.string(), counts: v.array(count), picked: v.optional(v.array(v.string())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.deviceId.length < 16 || !DAY_RE.test(args.day) || args.counts.length === 0 || args.counts.length > 500) return null;
    const add = args.counts.filter((c) => c.word.length > 0 && c.word.length <= 40 && c.frame.length <= 20 && Number.isInteger(c.n) && c.n > 0 && c.n <= 10000);
    if (!add.length) return null;
    if (args.picked) {
      const picked = new Set(args.picked.slice(0, 500));
      for (const c of add) {
        const row = await ctx.db
          .query("flowWords")
          .withIndex("by_deviceId_and_day_and_text_and_frame", (q) => q.eq("deviceId", args.deviceId).eq("day", args.day).eq("text", c.word).eq("frame", c.frame))
          .first();
        if (row) await ctx.db.patch(row._id, { n: row.n + c.n });
        else await ctx.db.insert("flowWords", { deviceId: args.deviceId, day: args.day, text: c.word, frame: c.frame, n: c.n });
      }
      await addShownToCards(ctx, args.deviceId, add.filter((c) => picked.has(c.word)).map((c) => ({ text: c.word, n: c.n })));
      return null;
    }
    // 古い端末：言葉は文字で受け取り、言葉の表の番号で残す。表にない言葉は数えない。流れた言葉の行だけ足す（2026-10-15）
    const toPrefs = [];
    for (const c of add) {
      const wordId = await findWordId(ctx, c.word, args.deviceId);
      if (!wordId) continue;
      const row = await ctx.db
        .query("flowWords")
        .withIndex("by_deviceId_and_day_and_text_and_frame", (q) => q.eq("deviceId", args.deviceId).eq("day", args.day).eq("text", c.word).eq("frame", c.frame))
        .first();
      if (row) await ctx.db.patch(row._id, { n: row.n + c.n });
      else await ctx.db.insert("flowWords", { deviceId: args.deviceId, day: args.day, wordId, text: c.word, frame: c.frame, n: c.n });
      toPrefs.push({ wordId, text: c.word, shown: c.n, picked: 0 });
    }
    await addToPrefs(ctx, args.deviceId, toPrefs);
    return null;
  },
});

// 直近の流れた記録（日ごと）。夕空の割合で使う。新しい行（flowWords）と、前の1日1件（flows）を合わせて返す
export const listDays = query({
  args: { deviceId: v.string(), days: v.array(v.string()) },
  returns: v.array(v.object({ day: v.string(), counts: v.array(count) })), // 言葉は文字に戻して返す
  handler: async (ctx, args) => {
    if (args.deviceId.length < 16) return [];
    const out = [];
    const text = wordTexts(ctx);
    for (const day of args.days.slice(0, 120)) {
      const counts: { word: string; frame: string; n: number }[] = [];
      for await (const r of ctx.db
        .query("flowWords")
        .withIndex("by_deviceId_and_day_and_text_and_frame", (q) => q.eq("deviceId", args.deviceId).eq("day", day))) {
        counts.push({ word: r.text, frame: r.frame, n: r.n });
      }
      const old = await ctx.db
        .query("flows")
        .withIndex("by_deviceId_and_day", (q) => q.eq("deviceId", args.deviceId).eq("day", day))
        .unique();
      for (const c of old?.counts ?? []) {
        const word = await text(c.wordId);
        if (word) counts.push({ word, frame: c.frame, n: c.n });
      }
      if (counts.length) out.push({ day, counts });
    }
    return out;
  },
});

// 1日1件の記録（flows）を、言葉ごとの行（flowWords）へ移す（2026-10-15）。数は消さずに移し、移し終えた1日1件は消す（二重に数えないため）。
// 使い方: npx convex run flows:moveDay '{"day":"2026-10-15"}'
export const moveDay = internalMutation({
  args: { day: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    let moved = 0;
    for (const f of await ctx.db.query("flows").collect()) {
      if (f.day !== args.day) continue;
      for (const c of f.counts) {
        const w = await ctx.db.get(c.wordId);
        if (!w) continue;
        const row = await ctx.db
          .query("flowWords")
          .withIndex("by_deviceId_and_day_and_text_and_frame", (q) => q.eq("deviceId", f.deviceId).eq("day", f.day).eq("text", w.text).eq("frame", c.frame))
          .first();
        if (row) await ctx.db.patch(row._id, { n: row.n + c.n });
        else await ctx.db.insert("flowWords", { deviceId: f.deviceId, day: f.day, wordId: c.wordId, text: w.text, frame: c.frame, n: c.n });
        moved++;
      }
      await ctx.db.delete(f._id);
    }
    return moved;
  },
});
