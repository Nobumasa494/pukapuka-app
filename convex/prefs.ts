import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

// 好みのメモ（1人1行）。拾ったとき・流れた記録を送るときに足す。読むのは convex/river.ts の weights だけ
const DAY = 24 * 60 * 60 * 1000;
export const HALF_LIFE_DAYS = 21; // 古い回数は3週間で半分の重さに（案。前は「直近6週」で数えていた）

type Add = { wordId: Id<"words">; text: string; shown: number; picked: number };

// 近い言葉（夜の散歩）は、元の言葉（散歩）にも、流れた回数・拾った回数の両方を足す（2026-10-11。数えるのは名札）。離れた言葉は足さない
async function withParents(ctx: MutationCtx, adds: Add[]): Promise<Add[]> {
  const out = [...adds];
  const parents = new Map<Id<"words">, { id: Id<"words">; text: string } | null>();
  for (const a of adds) {
    if (!parents.has(a.wordId)) {
      // 近い言葉の近い言葉（そのつど作った言葉）は、いちばん元までさかのぼる
      let w = await ctx.db.get(a.wordId);
      let p = null;
      for (let i = 0; i < 5 && w?.source === "ai" && w.kind === "near" && w.parent; i++) {
        p = await ctx.db.get(w.parent);
        w = p;
      }
      parents.set(a.wordId, p ? { id: p._id, text: p.text } : null);
    }
    const p = parents.get(a.wordId);
    if (p) out.push({ wordId: p.id, text: p.text, shown: a.shown, picked: a.picked });
  }
  return out;
}

// 時間がたった回数を軽くする（HALF_LIFE_DAYS で半分）
export const decay = (at: number, now: number) => Math.pow(0.5, Math.max(0, now - at) / (HALF_LIFE_DAYS * DAY));

export async function addToPrefs(ctx: MutationCtx, deviceId: string, given: Add[]) {
  if (!given.length) return;
  const adds = await withParents(ctx, given);
  const now = Date.now();
  // 同じ言葉はまとめてから、その言葉のカードだけ直す（2026-10-15。前は1人1行のメモを丸ごと書き直していた）
  const merged = new Map<string, Add>();
  for (const a of adds) {
    const cur = merged.get(a.wordId);
    if (cur) {
      cur.shown += a.shown;
      cur.picked += a.picked;
    } else merged.set(a.wordId, { ...a });
  }
  for (const a of merged.values()) {
    const row = await ctx.db
      .query("prefWords")
      .withIndex("by_deviceId_and_wordId", (q) => q.eq("deviceId", deviceId).eq("wordId", a.wordId))
      .unique();
    if (row) {
      const k = decay(row.at, now);
      await ctx.db.patch(row._id, { shown: round(row.shown * k + a.shown), picked: round(row.picked * k + a.picked), at: now });
    } else {
      await ctx.db.insert("prefWords", { deviceId, wordId: a.wordId, text: a.text, shown: round(a.shown), picked: round(a.picked), at: now });
    }
  }
}
const round = (x: number) => Math.round(x * 1000) / 1000;

// 1回だけ（2026-10-15）：1人1行のメモ（prefs）を、言葉ごとのカード（prefWords）に写す。メモは消さない。
// 使い方: npx convex run prefs:toCards（何度呼んでも、カードがある人は飛ばす）
export const toCards = internalMutation({
  args: {},
  returns: v.array(v.object({ deviceId: v.string(), words: v.number() })),
  handler: async (ctx) => {
    const out = [];
    for (const p of await ctx.db.query("prefs").collect()) {
      const has = await ctx.db.query("prefWords").withIndex("by_deviceId_and_wordId", (q) => q.eq("deviceId", p.deviceId)).first();
      if (has) continue;
      for (const w of p.words) {
        await ctx.db.insert("prefWords", { deviceId: p.deviceId, wordId: w.wordId, text: w.text, shown: w.shown, picked: w.picked, at: p.decayedAt });
      }
      out.push({ deviceId: p.deviceId, words: p.words.length });
    }
    return out;
  },
});

// 1回だけ（2026-10-11）：今ある流れた記録と、それ以降に拾った記録から、メモを作り直す
export const rebuild = internalMutation({
  args: {},
  returns: v.array(v.object({ deviceId: v.string(), words: v.number() })),
  handler: async (ctx) => {
    const out = [];
    const flows = await ctx.db.query("flows").take(5000);
    const devices = [...new Set(flows.map((f) => f.deviceId))];
    for (const deviceId of devices) {
      const mine = flows.filter((f) => f.deviceId === deviceId);
      const since = Math.min(...mine.map((f) => f._creationTime));
      const text = new Map<string, string>();
      const getText = async (id: Id<"words">) => {
        if (!text.has(id)) text.set(id, (await ctx.db.get(id))?.text ?? "");
        return text.get(id)!;
      };
      const adds: Add[] = [];
      for (const f of mine) for (const c of f.counts) adds.push({ wordId: c.wordId, text: await getText(c.wordId), shown: c.n, picked: 0 });
      const caps = await ctx.db
        .query("captures")
        .withIndex("by_deviceId_and_capturedAt", (q) => q.eq("deviceId", deviceId).gt("capturedAt", since))
        .take(5000);
      for (const c of caps) adds.push({ wordId: c.wordId, text: await getText(c.wordId), shown: 0, picked: 1 });
      const old = await ctx.db.query("prefs").withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId)).unique();
      if (old) await ctx.db.delete(old._id);
      await addToPrefs(ctx, deviceId, adds);
      out.push({ deviceId, words: new Set(adds.map((a) => a.wordId)).size });
    }
    return out;
  },
});
