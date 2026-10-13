import { internalMutation, internalQuery, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

// AI の言葉をしまう・読む（SPEC 第2部 A.・G.）。呼ぶ側は convex/ai.ts

// 言葉を作る元になる言葉（決まった言葉、または AI の言葉）
export const getWord = internalQuery({
  args: { text: v.string() },
  returns: v.union(v.null(), v.object({ _id: v.id("words"), category: v.string(), hasChildren: v.boolean(), hasBehind: v.boolean(), hasWish: v.boolean() })),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("words").withIndex("by_text_and_owner", (q) => q.eq("text", args.text).eq("owner", undefined)).first();
    if (!row || (row.source !== "fixed" && row.source !== "ai")) return null;
    const children = await ctx.db.query("words").withIndex("by_parent", (q) => q.eq("parent", row._id)).collect();
    return { _id: row._id, category: row.category, hasChildren: children.some((c) => c.source === "ai" && c.kind !== "behind"), hasBehind: children.some((c) => c.source === "ai" && c.kind === "behind"), hasWish: children.some((c) => c.source === "ai" && c.kind === "near" && /たい$/.test(c.text)) };
  },
});

// そのつど作る（SPEC 第2部 A.。2026-10-11、ユーザー「そのつどつくるしたいの」）：AI の言葉を、ある人が GROW_DAYS 日拾ったら、
// その言葉の先にまだ言葉がなければ、AI に作ってもらう。作った言葉はみんなで使い回す。AI に送るのはその言葉1つだけ（誰が拾ったかは送らない）
export const GROW_DAYS = 2; // 決定 2026-10-13（ユーザー「はい、2日で」。前は案の3日）
export const GROW_PER_DAY = 200; // 全員の合計で1日に頼む回数の上限（案。1回 約0.03円）
const DAY = 24 * 60 * 60 * 1000;
export async function maybeGrow(ctx: MutationCtx, deviceId: string, wordId: Id<"words">) {
  const w = await ctx.db.get(wordId);
  if (!w || w.source !== "ai" || w.owner || w.askedAt) return;
  // まず好みのメモ（1行）で、何回か拾っているかを見る。拾った記録を毎回読み返さないため
  const pref = await ctx.db.query("prefs").withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId)).unique();
  if ((pref?.words.find((x) => x.wordId === wordId)?.picked ?? 0) < GROW_DAYS - 0.5) return;
  const kid = await ctx.db.query("words").withIndex("by_parent", (q) => q.eq("parent", wordId)).first();
  if (kid) return;
  const now = Date.now();
  const days = new Set<number>();
  for await (const c of ctx.db.query("captures").withIndex("by_deviceId_and_capturedAt", (q) => q.eq("deviceId", deviceId).gt("capturedAt", now - 42 * DAY))) {
    if (c.wordId === wordId) days.add(Math.floor(c.capturedAt / DAY));
  }
  if (days.size < GROW_DAYS) return;
  const asked = await ctx.db.query("words").withIndex("by_askedAt", (q) => q.gt("askedAt", now - DAY)).take(GROW_PER_DAY);
  if (asked.length >= GROW_PER_DAY) return;
  await ctx.db.patch(wordId, { askedAt: now });
  await ctx.scheduler.runAfter(0, internal.ai.generateFor, { word: w.text });
}

// 1つの元の言葉から作った言葉を、みんなの言葉としてしまう（同じ文字は二重に入れない）
export const saveGenerated = internalMutation({
  args: {
    parent: v.id("words"),
    category: v.string(),
    items: v.array(v.object({ text: v.string(), kind: v.union(v.literal("near"), v.literal("abstract"), v.literal("behind")), theme: v.optional(v.string()) })),
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
    const groups = new Map<string, { category: string; near: string[]; abstract: { text: string; theme?: string }[]; behind: string[] }>();
    for (const w of fixed) {
      if (w.source !== "ai" || !w.parent) continue;
      const p = byId.get(w.parent);
      if (!p) continue;
      const g = groups.get(p.text) ?? { category: p.category, near: [], abstract: [], behind: [] };
      if (w.kind === "near") g.near.push(w.text);
      else if (w.kind === "behind") g.behind.push(w.text);
      else g.abstract.push({ text: w.text, theme: w.theme });
      groups.set(p.text, g);
    }
    return [...groups.entries()].map(([word, g]) => ({ word, ...g }));
  },
});

// 川に流す AI の言葉（アプリが読み込んで、元の言葉から細かい言葉を選ぶ。SPEC 第2部 A.）。みんなの言葉なので誰でも読める
export const forRiver = query({
  args: {},
  returns: v.array(v.object({ text: v.string(), category: v.string(), parent: v.string(), kind: v.union(v.literal("near"), v.literal("abstract"), v.literal("behind")) })),
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

// 作った言葉を流さない言葉にする（消すと、流れた記録・拾った記録から言葉が引けなくなるため）。使い方: npx convex run aiWords:retireKind '{"kind":"behind"}'
export const retireKind = internalMutation({
  args: { kind: v.union(v.literal("near"), v.literal("abstract"), v.literal("behind")) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("words").withIndex("by_owner", (q) => q.eq("owner", undefined)).collect();
    let n = 0;
    for (const w of rows) {
      if (w.source === "ai" && w.kind === args.kind) {
        await ctx.db.patch(w._id, { source: "old" });
        n++;
      }
    }
    return n;
  },
});
