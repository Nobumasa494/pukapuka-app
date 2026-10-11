import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";

// AI の言葉をしまう・読む（SPEC 第2部 A.・G.）。呼ぶ側は convex/ai.ts

export const getFixed = internalQuery({
  args: { text: v.string() },
  returns: v.union(v.null(), v.object({ _id: v.id("words"), category: v.string(), hasChildren: v.boolean() })),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("words").withIndex("by_text_and_owner", (q) => q.eq("text", args.text).eq("owner", undefined)).first();
    if (!row || row.source !== "fixed") return null;
    const children = await ctx.db.query("words").withIndex("by_parent", (q) => q.eq("parent", row._id)).take(1);
    return { _id: row._id, category: row.category, hasChildren: children.length > 0 };
  },
});

// 1つの元の言葉から作った言葉を、みんなの言葉としてしまう（同じ文字は二重に入れない）
export const saveGenerated = internalMutation({
  args: {
    parent: v.id("words"),
    category: v.string(),
    items: v.array(v.object({ text: v.string(), kind: v.union(v.literal("near"), v.literal("abstract")), theme: v.optional(v.string()) })),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    let added = 0;
    for (const it of args.items) {
      const dup = await ctx.db.query("words").withIndex("by_text_and_owner", (q) => q.eq("text", it.text).eq("owner", undefined)).first();
      if (dup) continue;
      await ctx.db.insert("words", { text: it.text, category: args.category, source: "ai", parent: args.parent, kind: it.kind, theme: it.theme });
      added++;
    }
    return added;
  },
});

// 作った言葉の一覧（見て確かめるため）。使い方: npx convex run aiWords:listGenerated
export const listGenerated = internalQuery({
  args: {},
  handler: async (ctx) => {
    const fixed = await ctx.db.query("words").withIndex("by_owner", (q) => q.eq("owner", undefined)).collect();
    const byId = new Map(fixed.map((w) => [w._id, w]));
    const groups = new Map<string, { category: string; near: string[]; abstract: { text: string; theme?: string }[] }>();
    for (const w of fixed) {
      if (w.source !== "ai" || !w.parent) continue;
      const p = byId.get(w.parent);
      if (!p) continue;
      const g = groups.get(p.text) ?? { category: p.category, near: [], abstract: [] };
      if (w.kind === "near") g.near.push(w.text);
      else g.abstract.push({ text: w.text, theme: w.theme });
      groups.set(p.text, g);
    }
    return [...groups.entries()].map(([word, g]) => ({ word, ...g }));
  },
});

// 川に流す AI の言葉（アプリが読み込んで、元の言葉から細かい言葉を選ぶ。SPEC 第2部 A.）。みんなの言葉なので誰でも読める
export const forRiver = query({
  args: {},
  returns: v.array(v.object({ text: v.string(), category: v.string(), parent: v.string(), kind: v.union(v.literal("near"), v.literal("abstract")) })),
  handler: async (ctx) => {
    const all = await ctx.db.query("words").withIndex("by_owner", (q) => q.eq("owner", undefined)).collect();
    const byId = new Map(all.map((w) => [w._id, w.text]));
    const out = [];
    for (const w of all) {
      if (w.source !== "ai" || !w.parent || !w.kind) continue;
      const parent = byId.get(w.parent);
      if (parent) out.push({ text: w.text, category: w.category, parent, kind: w.kind });
    }
    return out;
  },
});
