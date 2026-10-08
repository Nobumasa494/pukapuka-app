import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { makeDemoCaptures, type DemoDay } from "../src/demoPersona";

// 開発用：ダミーの人の記録を入れる（アプリからは呼べない。`npx convex run demo:seedDemo` で実行）。
// 夜空を、使い続けた後の様子で、すぐ確かめるため。端末の目印は専用で、本物の記録とは混ざらない。
// アプリは、web で ?demo=1 をつけて開くと、この目印で動く（src/useCaptures.ts）
export const DEMO_DEVICE_ID = "demo-persona-0000000000000001";
const DAY = 24 * 60 * 60 * 1000;
const JST = 9 * 60 * 60 * 1000;

// ダミーの人の記録の作り方は src/demoPersona.ts（夜空の「見本」と共通）
export const seedDemo = internalMutation({
  args: { days: v.optional(v.number()), seed: v.optional(v.number()) },
  returns: v.object({ deleted: v.number(), inserted: v.number() }),
  handler: async (ctx, args) => {
    const days = Math.min(120, Math.max(7, args.days ?? 60));
    const old = await ctx.db
      .query("captures")
      .withIndex("by_deviceId_and_capturedAt", (q) => q.eq("deviceId", DEMO_DEVICE_ID))
      .collect();
    for (const row of old) await ctx.db.delete(row._id);

    const now = Date.now();
    const todayStart = Math.floor((now + JST) / DAY) * DAY - JST; // 日本の今日の0時
    const list: DemoDay[] = [];
    for (let d = days - 1; d >= 0; d--) {
      const start = todayStart - d * DAY;
      list.push({ start, dow: new Date(start + JST).getUTCDay() });
    }
    let inserted = 0;
    for (const c of makeDemoCaptures(list, args.seed ?? 5, now)) {
      await ctx.db.insert("captures", { deviceId: DEMO_DEVICE_ID, word: c.word, strength: c.strength, capturedAt: c.capturedAt });
      inserted++;
    }
    return { deleted: old.length, inserted };
  },
});
