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
  // 日記（SPEC 第1部「日記」・第2部 G.）。自分で書くだけの場所。1日1つ。拾った記録とはつなげない
  diaries: defineTable({
    deviceId: v.string(),
    day: v.string(), // 端末の暦の日（src/period.ts の dayKey）
    text: v.string(),
    savedAt: v.number(),
  }).index("by_deviceId_and_day", ["deviceId", "day"]),
});
