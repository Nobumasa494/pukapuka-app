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
    wordId: v.id("words"), // 言葉の表の番号（2026-10-11 に文字から書きかえた）
    frame: v.string(), // どの枠から流れてきた泡か（今は "even"＝均等）
    strength: v.number(), // 0.0〜1.0
  })
    .index("by_user", ["userId", "capturedAt"])
    .index("by_deviceId_and_capturedAt", ["deviceId", "capturedAt"]),
  // 言葉の表（SPEC 第2部 G.。決定 2026-10-11）。決まった言葉も、AI の言葉・自分の言葉も、ここに1つずつ。記録は番号（_id）で指す
  words: defineTable({
    text: v.string(),
    category: v.string(), // 6つの種類（src/words.ts の Category）
    source: v.union(v.literal("fixed"), v.literal("ai"), v.literal("own"), v.literal("season"), v.literal("old")), // old：今の一覧から外れた言葉（川には流さない）
    owner: v.optional(v.string()), // その人だけの言葉なら deviceId。決まった言葉はなし（みんな）
    parent: v.optional(v.id("words")), // 生まれ（名札）。変えない
    kind: v.optional(v.union(v.literal("near"), v.literal("abstract"), v.literal("behind"))), // 近い言葉／抽象的に近い言葉／裏側の言葉（つらい気持ちの裏にあるかもしれない気持ち）
    theme: v.optional(v.string()), // 共通点（AI の解釈。画面にも分析にも使わない）
    askedAt: v.optional(v.number()), // そのつど作る：この言葉から作るよう AI に頼んだ時刻（1つの言葉につき1回だけ・1日の上限を数える）
  })
    .index("by_text_and_owner", ["text", "owner"])
    .index("by_owner", ["owner"])
    .index("by_parent", ["parent"])
    .index("by_askedAt", ["askedAt"]),
  // 流れた記録（SPEC 第2部 G.「その人向けの川のための記録」。決定 2026-10-11）。1日1行。拾わなかった泡も数える
  // 「流れた回数のうち何回拾ったか」の分母
  flows: defineTable({
    deviceId: v.string(),
    day: v.string(), // 端末の暦の日（src/period.ts の dayKey）
    counts: v.array(v.object({ wordId: v.id("words"), frame: v.string(), n: v.number() })), // frame：どの枠から流れたか（今は "even"＝均等だけ）
    updatedAt: v.number(),
  }).index("by_deviceId_and_day", ["deviceId", "day"]),
  // 好みのメモ（SPEC 第2部 A.「効率の見直し」。2026-10-11）。1人1行。言葉ごとの流れた回数・拾った回数を、拾ったとき・流れた記録を送るときに足す。
  // 好みの量（convex/river.ts）はこの1行だけを読む（流れた記録を毎回読み返さない）。古い回数は少しずつ軽くする（HALF_LIFE_DAYS で半分）
  prefs: defineTable({
    deviceId: v.string(),
    words: v.array(v.object({ wordId: v.id("words"), text: v.string(), shown: v.number(), picked: v.number() })),
    decayedAt: v.number(), // 最後に軽くした時刻
  }).index("by_deviceId", ["deviceId"]),
  // 日記（SPEC 第1部「日記」・第2部 G.）。自分で書くだけの場所。1日1つ。拾った記録とはつなげない
  diaries: defineTable({
    deviceId: v.string(),
    day: v.string(), // 端末の暦の日（src/period.ts の dayKey）
    text: v.string(),
    savedAt: v.number(),
  }).index("by_deviceId_and_day", ["deviceId", "day"]),
});
