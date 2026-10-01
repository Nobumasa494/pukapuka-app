import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,
  captures: defineTable({
    userId: v.string(),
    capturedAt: v.number(),
    word: v.string(),
    strength: v.number(), // 0.0〜1.0
  }).index("by_user", ["userId", "capturedAt"]),
});
