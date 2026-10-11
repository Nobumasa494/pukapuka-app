import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,
  // 拾った言葉。第1段はログインなしで、端末ごとの仮の ID（deviceId）で持つ（SPEC 8. の決定）。userId はログインを足したとき用
  captures: defineTable({
    deviceId: v.optional(v.string()),
    userId: v.optional(v.string()),
    capturedAt: v.number(),
    word: v.string(),
    strength: v.number(), // 0.0〜1.0
  })
    .index("by_user", ["userId", "capturedAt"])
    .index("by_deviceId_and_capturedAt", ["deviceId", "capturedAt"]),
  // 流れた記録（SPEC 第2部 G.「その人向けの川のための記録」。決定 2026-10-11）。1日1行。拾わなかった泡も数える
  // 「流れた回数のうち何回拾ったか」の分母。言葉の表ができるまでは言葉を文字で持つ（あとで番号に書きかえる）
  flows: defineTable({
    deviceId: v.string(),
    day: v.string(), // 端末の暦の日（src/period.ts の dayKey）
    counts: v.array(v.object({ word: v.string(), frame: v.string(), n: v.number() })), // frame：どの枠から流れたか（今は "even"＝均等だけ）
    updatedAt: v.number(),
  }).index("by_deviceId_and_day", ["deviceId", "day"]),
  // 日記（SPEC 第1部「日記」・第2部 G.）。自分で書くだけの場所。1日1つ。拾った記録とはつなげない
  diaries: defineTable({
    deviceId: v.string(),
    day: v.string(), // 端末の暦の日（src/period.ts の dayKey）
    text: v.string(),
    savedAt: v.number(),
  }).index("by_deviceId_and_day", ["deviceId", "day"]),
});
