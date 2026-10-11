import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { WORD_CATEGORY } from "../src/words";

// 言葉の表（SPEC 第2部 G.）。アプリは今まで通り言葉を文字で送り、ここで番号に置きかえる

// 文字 → 番号。決まった言葉（みんな）を先に、なければその人だけの言葉を探す
export async function findWordId(ctx: QueryCtx, text: string, deviceId?: string): Promise<Id<"words"> | null> {
  const fixed = await ctx.db.query("words").withIndex("by_text_and_owner", (q) => q.eq("text", text).eq("owner", undefined)).first();
  if (fixed) return fixed._id;
  if (!deviceId) return null;
  const own = await ctx.db.query("words").withIndex("by_text_and_owner", (q) => q.eq("text", text).eq("owner", deviceId)).first();
  return own?._id ?? null;
}

// 番号 → 文字（何度も同じ言葉を読まないよう、呼ぶ側で使い回す）
export function wordTexts(ctx: QueryCtx) {
  const cache = new Map<Id<"words">, string | null>();
  return async (id: Id<"words">) => {
    if (!cache.has(id)) cache.set(id, (await ctx.db.get(id))?.text ?? null);
    return cache.get(id)!;
  };
}

// 決まった言葉を表に入れる（何度呼んでも同じ。src/words.ts を変えたら呼び直す）。一覧から外れた言葉は消さない
export async function ensureFixed(ctx: MutationCtx) {
  let added = 0;
  for (const [text, category] of Object.entries(WORD_CATEGORY)) {
    const row = await ctx.db.query("words").withIndex("by_text_and_owner", (q) => q.eq("text", text).eq("owner", undefined)).first();
    if (!row) {
      await ctx.db.insert("words", { text, category, source: "fixed" });
      added++;
    } else if (row.category !== category || row.source !== "fixed") await ctx.db.patch(row._id, { category, source: "fixed" });
  }
  return added;
}

export const seedFixed = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => ensureFixed(ctx),
});

// 2026-10-11 に、拾った記録・流れた記録の文字を番号に書きかえた（1回だけの backfill・dropText。写しは ~/pukapuka-backups/before-words-2026-10-11.zip）
