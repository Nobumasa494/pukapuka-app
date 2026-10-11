import { query } from "./_generated/server";
import { v } from "convex/values";

// その人向けの川（SPEC 第2部 A.「その人向けの川」。決定 2026-10-11）
// 変える理由は「その言葉が好きか」（量）だけ：流れた回数のうち何回拾ったか。「何のあとに何」は使わない。
// 好みのメモ（convex/prefs.ts。1人1行）だけを読む。流れた記録を毎回読み返さない（効率の見直し 2026-10-11）
export const PRIOR_SHOWN = 10; // はじめは全部同じ点から（流れた10回・拾った1回とみなす。案）
export const BASE_RATE = 1 / PRIOR_SHOWN; // ふつうの拾いやすさ。これより拾う言葉ほど多めに流す
export const MAX_WEIGHT = 4; // 多めに流すのは4倍まで（案）

// 返すのは、ふつう（1倍）より多く流す言葉だけ。ほかは1倍（src/riverWords.ts）。メモがまだない人は空（均等に流す）
export const weights = query({
  args: { deviceId: v.string() },
  returns: v.union(v.null(), v.array(v.object({ word: v.string(), weight: v.number() }))),
  handler: async (ctx, args) => {
    if (args.deviceId.length < 16) return null;
    const row = await ctx.db.query("prefs").withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId)).unique();
    if (!row) return null;
    const out = [];
    for (const w of row.words) {
      // 送るのが1分ごとなので、拾った数が流れた数より先に増えることがある。流れた数は拾った数より少なくしない
      const rate = (w.picked + 1) / (Math.max(w.shown, w.picked) + PRIOR_SHOWN);
      const weight = Math.min(MAX_WEIGHT, rate / BASE_RATE);
      if (weight > 1) out.push({ word: w.text, weight: Math.round(weight * 100) / 100 });
    }
    return out;
  },
});
