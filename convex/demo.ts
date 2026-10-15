import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { ensureFixed, findWordId } from "./words";
import { makeDemoCaptures, type DemoDay } from "../src/demoPersona";

// 開発用：ダミーの人の記録を入れる（アプリからは呼べない。`npx convex run demo:seedDemo` で実行）。
// 夜空を、使い続けた後の様子で、すぐ確かめるため。端末の目印は専用で、本物の記録とは混ざらない。
// アプリは、web で ?demo=1 をつけて開くと、この目印で動く（src/useCaptures.ts）
export const DEMO_DEVICE_ID = "demo-persona-0000000000000001";
const DAY = 24 * 60 * 60 * 1000;
const JST = 9 * 60 * 60 * 1000;

// ダミーの人の記録の作り方は src/demoPersona.ts（夜空の「見本」と共通）
export const seedDemo = internalMutation({
  args: { days: v.optional(v.number()), seed: v.optional(v.number()), heavy: v.optional(v.boolean()) },
  returns: v.object({ deleted: v.number(), inserted: v.number() }),
  handler: async (ctx, args) => {
    await ensureFixed(ctx);
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
    // heavy：たくさん記録する人（記録が2倍）。夜空が1画面に収まらないときの見え方を確かめるため
    const seed = args.seed ?? 5;
    const made = args.heavy ? [...makeDemoCaptures(list, seed, now), ...makeDemoCaptures(list, seed + 6, now)] : makeDemoCaptures(list, seed, now);
    for (const c of made) {
      const wordId = await findWordId(ctx, c.word);
      if (!wordId) continue;
      await ctx.db.insert("captures", { deviceId: DEMO_DEVICE_ID, wordId, frame: "even", strength: c.strength, capturedAt: c.capturedAt });
      inserted++;
    }
    return { deleted: old.length, inserted };
  },
});

// 今日1日の拾い方のダミー（2026-10-13。星空の「今日の流れ」と、1日の中での変わり方を撮るため）。
// who: "day1"＝使いはじめ1日目の人（今日の分だけ。前の記録は消す）、"demo"＝?demo=1 の人（今日の分を入れかえる）
// 使い方: npx convex run demo:seedToday '{"who":"day1"}'
const DAY1_DEVICE_ID = "demo-day1-00000000000000000001";
const TODAY: { hour: number; word: string }[] = [
  { hour: 7.5, word: "眠い" },
  { hour: 7.8, word: "朝" },
  { hour: 8.1, word: "散歩" },
  { hour: 8.2, word: "朝の公園で深呼吸をしてみたい" },
  { hour: 12.3, word: "仕事" },
  { hour: 12.5, word: "疲れ" },
  { hour: 12.7, word: "カフェ" },
  { hour: 12.9, word: "行きつけのカフェで読書したい" },
  { hour: 18.6, word: "帰り道" },
  { hour: 18.8, word: "音楽" },
  { hour: 19.0, word: "楽器店で初めてのギターを買いたい" },
  { hour: 19.2, word: "うれしい" },
];
export const seedToday = internalMutation({
  args: { who: v.union(v.literal("day1"), v.literal("demo")) },
  returns: v.object({ inserted: v.number(), missing: v.array(v.string()) }),
  handler: async (ctx, args) => {
    await ensureFixed(ctx);
    const deviceId = args.who === "day1" ? DAY1_DEVICE_ID : DEMO_DEVICE_ID;
    const now = Date.now();
    const todayStart = Math.floor((now + JST) / DAY) * DAY - JST;
    const from = args.who === "day1" ? 0 : todayStart;
    const old = await ctx.db
      .query("captures")
      .withIndex("by_deviceId_and_capturedAt", (q) => q.eq("deviceId", deviceId).gte("capturedAt", from))
      .collect();
    for (const row of old) await ctx.db.delete(row._id);
    let inserted = 0;
    const missing: string[] = [];
    for (const t of TODAY) {
      const wordId = await findWordId(ctx, t.word);
      if (!wordId) {
        missing.push(t.word);
        continue;
      }
      await ctx.db.insert("captures", { deviceId, wordId, frame: "even", strength: 0.5, capturedAt: todayStart + t.hour * 60 * 60 * 1000 });
      inserted++;
    }
    return { inserted, missing };
  },
});

// 倉庫の言葉で、ダミーの人の記録を作る（2026-10-14。web で ?demo=1&warehouse=1 を見るため）。
// 好きな行動の箱が3つ（毎日のように）・ほかはたまに・気持ちの箱は毎日いくつか。前のダミーの記録は消す
// 使い方: npx convex run demo:seedBoxDemo '{"days":28}'
export const seedBoxDemo = internalMutation({
  args: { days: v.optional(v.number()) },
  returns: v.object({ deleted: v.number(), inserted: v.number() }),
  handler: async (ctx, args) => {
    const days = args.days ?? 28;
    const old = await ctx.db.query("captures").withIndex("by_deviceId_and_capturedAt", (q) => q.eq("deviceId", DEMO_DEVICE_ID)).collect();
    for (const row of old) await ctx.db.delete(row._id);
    const byBox = new Map<number, Id<"words">[]>();
    for (let b = 1; b <= 45; b++) {
      const rows = (await ctx.db.query("words").withIndex("by_box", (q) => q.eq("box", b)).collect()).filter((w) => w.source === "box");
      if (rows.length) byBox.set(b, rows.map((r) => r._id));
    }
    const boxes = [...byBox.keys()];
    const act = boxes.filter((b) => b <= 34), feel = boxes.filter((b) => b >= 35);
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
    const fav = [pick(act), pick(act), pick(act)];
    const now = Date.now();
    const todayStart = Math.floor((now + JST) / DAY) * DAY - JST;
    let inserted = 0;
    for (let d = days - 1; d >= 0; d--) {
      const day = todayStart - d * DAY;
      const today: number[] = [];
      for (const f of fav) if (rnd() < 0.55) today.push(f);
      for (const b of act) if (rnd() < 0.06) today.push(b);
      for (let k = 0; k < 2 + Math.floor(rnd() * 3); k++) today.push(pick(feel));
      for (const b of today) {
        const ids = byBox.get(b)!;
        for (let k = 0; k < 1 + (rnd() < 0.3 ? 1 : 0); k++) {
          await ctx.db.insert("captures", { deviceId: DEMO_DEVICE_ID, wordId: pick(ids), frame: "like", strength: 0.3 + rnd() * 0.6, capturedAt: day + (8 + rnd() * 13) * 3600000 });
          inserted++;
        }
      }
    }
    return { deleted: old.length, inserted };
  },
});
