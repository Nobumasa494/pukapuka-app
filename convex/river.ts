import { query } from "./_generated/server";
import { v } from "convex/values";

// その人向けの川（SPEC 第2部 A.「その人向けの川」。決定 2026-10-11）
// 変える理由は「その言葉が好きか」（量）だけ：流れた回数のうち何回拾ったか。「何のあとに何」は使わない
const DAY = 24 * 60 * 60 * 1000;
export const LOOK_DAYS = 42; // 直近6週（星空と同じ。案）
export const PRIOR_SHOWN = 10; // はじめは全部同じ点から（流れた10回・拾った1回とみなす。案）
export const BASE_RATE = 1 / PRIOR_SHOWN; // ふつうの拾いやすさ。これより拾う言葉ほど多めに流す
export const MAX_WEIGHT = 4; // 多めに流すのは4倍まで（案）

export const weights = query({
  args: { deviceId: v.string() },
  returns: v.array(v.object({ word: v.string(), weight: v.number() })),
  handler: async (ctx, args) => {
    if (args.deviceId.length < 16) return [];
    const flows = await ctx.db.query("flows").withIndex("by_deviceId_and_day", (q) => q.eq("deviceId", args.deviceId)).take(400);
    // 流れた記録をとりはじめる前は、何回流れたか分からないので使わない（2026-10-11 より前の記録）
    if (!flows.length) return [];
    const since = Math.max(Date.now() - LOOK_DAYS * DAY, Math.min(...flows.map((f) => f._creationTime)));
    const shown = new Map<string, number>(), picked = new Map<string, number>();
    const caps = await ctx.db
      .query("captures")
      .withIndex("by_deviceId_and_capturedAt", (q) => q.eq("deviceId", args.deviceId).gt("capturedAt", since))
      .take(5000);
    for (const c of caps) picked.set(c.wordId, (picked.get(c.wordId) ?? 0) + 1);
    for (const f of flows) if (f.updatedAt > since) for (const c of f.counts) shown.set(c.wordId, (shown.get(c.wordId) ?? 0) + c.n);
    const fixed = await ctx.db.query("words").withIndex("by_owner", (q) => q.eq("owner", undefined)).take(2000);
    const out = [];
    for (const w of fixed) {
      if (w.owner !== undefined || w.source !== "fixed") continue;
      // 送るのが1分ごとなので、拾った数が流れた数より先に増えることがある。流れた数は拾った数より少なくしない
      const p = picked.get(w._id) ?? 0;
      const s = Math.max(shown.get(w._id) ?? 0, p);
      const rate = (p + 1) / (s + PRIOR_SHOWN);
      out.push({ word: w.text, weight: Math.min(MAX_WEIGHT, Math.max(1, rate / BASE_RATE)) });
    }
    return out;
  },
});
