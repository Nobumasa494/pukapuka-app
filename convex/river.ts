import { query } from "./_generated/server";
import { v } from "convex/values";
import { decay } from "./prefs";

// その人向けの川（SPEC 第2部 A.「その人向けの川」。決定 2026-10-11）
// 変える理由は「その言葉が好きか」（量）だけ：流れた回数のうち何回拾ったか。「何のあとに何」は使わない。
// 好みのカード（convex/prefs.ts。1人×1語で1行。2026-10-15 に1人1行から変えた）の、拾った言葉だけを読む。流れた記録を毎回読み返さない（効率の見直し 2026-10-11）
export const PRIOR_SHOWN = 10; // はじめは全部同じ点から（流れた10回・拾った1回とみなす。案）
export const BASE_RATE = 1 / PRIOR_SHOWN; // ふつうの拾いやすさ。これより拾う言葉ほど多めに流す
export const MAX_WEIGHT = 4; // 多めに流すのは4倍まで（案）

// 返すのは、ふつう（1倍）より多く流す言葉だけ。ほかは1倍（src/riverWords.ts）。メモがまだない人は空（均等に流す）
export const weights = query({
  args: { deviceId: v.string() },
  returns: v.union(v.null(), v.array(v.object({ word: v.string(), weight: v.number() }))),
  handler: async (ctx, args) => {
    if (args.deviceId.length < 16) return null;
    // 1回以上拾った言葉のカードだけ読む（拾っていない言葉は、重みが1倍を超えないため。2026-10-15）
    const rows = await ctx.db
      .query("prefWords")
      .withIndex("by_deviceId_and_picked", (q) => q.eq("deviceId", args.deviceId).gt("picked", 0))
      .take(2000);
    if (!rows.length) return null;
    const now = Date.now();
    const out = [];
    for (const w of rows) {
      const k = decay(w.at, now);
      const shown = w.shown * k;
      const picked = w.picked * k;
      // 送るのが1分ごとなので、拾った数が流れた数より先に増えることがある。流れた数は拾った数より少なくしない
      const rate = (picked + 1) / (Math.max(shown, picked) + PRIOR_SHOWN);
      const weight = Math.min(MAX_WEIGHT, rate / BASE_RATE);
      if (weight > 1) out.push({ word: w.text, weight: Math.round(weight * 100) / 100 });
    }
    return out;
  },
});
