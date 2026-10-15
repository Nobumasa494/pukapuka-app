import { internalAction, internalMutation, internalQuery, query, env, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { BOXES } from "./boxes";

// 倉庫（設計書 第2部 A.「倉庫と箱」。決定 2026-10-14）。みんなで共有する言葉の置き場。
// 言葉1つずつに、箱の番号（1〜45）と意味の位置（Gemini の埋め込み）を付けてしまう。使っている間は AI を呼ばない
const MODEL = "gemini-3.1-flash-lite";
// 無料プランの1日の上限は、モデルごと。上限に当たったら、環境変数 WAREHOUSE_MODEL で別のモデルに切りかえる（2026-10-14）
const modelNow = () => (env as Record<string, string | undefined>).WAREHOUSE_MODEL ?? MODEL;
const EMBED_MODEL = "models/gemini-embedding-001";
const DIM = 768;
export const FIRST_COUNT = 60; // 最初に箱ごとに作る数（決定 2026-10-14：100 → 60。長さを7〜10文字に絞ったので、足りない箱だけ作り足す。庭師が200語まで育てる）
const MAX_TRIES = 12; // 1つの箱で AI に頼む回数の上限（100語に届かなくても、ほかの箱に進む）
const ASK = 40; // 1回に頼む数（無料プランは1分に1回なので、多めに頼む）
const MIN_BOX = 0.8; // どの箱とも、これより遠い言葉は入れない（目安。2026-10-14 の試しで、詩のような言葉が 0.805）
const SAME = 0.92; // 箱の中に、これより近い言葉があれば、ほぼ同じとして入れない（目安）
const STEP_MS = 65_000; // 30秒だと無料プランの1分あたりの上限に当たり続けた（2026-10-14）。1回に埋め込み40語＋書く1回なので、65秒おきで通る

// 長さの決まり（決定 2026-10-14、ユーザー「7〜10文字のみにしたい」）：行動の箱は7〜10文字、気持ち・そのほかの箱は2〜10文字
export const lengthOk = (t: string, box: number) => (box <= 34 ? t.length >= 7 && t.length <= 10 : t.length >= 2 && t.length <= 10);

const CATEGORY_OF = (box: number) => (box <= 34 ? "doing" : box <= 40 ? "emotion" : box === 45 ? "value" : "situation");

function textOf(j: any): string | null {
  const out = (j?.steps ?? [])
    .filter((s: any) => s?.type === "model_output")
    .flatMap((s: any) => s.content ?? [])
    .filter((c: any) => c?.type === "text")
    .map((c: any) => c.text);
  return out.length ? out.join("\n") : null;
}

class RateLimited extends Error {}

async function embed(texts: string[]): Promise<number[][]> {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY が Convex の環境変数にありません");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${EMBED_MODEL}:batchEmbedContents`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ requests: texts.map((text) => ({ model: EMBED_MODEL, content: { parts: [{ text }] }, outputDimensionality: DIM, taskType: "SEMANTIC_SIMILARITY" })) }),
  });
  if (res.status === 429) throw new RateLimited();
  const j: any = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`埋め込みが失敗 HTTP ${res.status}`);
  return (j.embeddings ?? []).map((e: any) => e.values as number[]);
}

const norm = (a: number[]) => Math.sqrt(a.reduce((s, x) => s + x * x, 0));
const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0) / (norm(a) * norm(b) || 1);

const prompt = (box: number, existing: string[]) => {
  const b = BOXES.find((x) => x.id === box)!;
  const what = `「${b.name}」${b.note ? `（${b.note}）` : ""}`;
  const rules =
    box <= 34
      ? `${what}に関わる、具体的な短い言葉を${ASK}個作ってください。
・「気になる」（まだしていないけれど気になる）・「したい」（してみたい）・「した」（した・している）の3つの形を混ぜる
・「何を・どうする」を残す（例：野原でフルートを吹く、古本屋をのぞく）。場面は短く。**1つ7〜10文字。11文字以上は書かない**
・${what}の中で、いろいろな種類を混ぜる（同じ種類ばかりにしない）
・好奇心やわくわくにつながるものにする（面倒な作業や汚れのような、楽しくないことは書かない）
・${what}そのものの言葉にする（買い物や移動など、別のことにしない）`
      : box === 45
        ? `「こうなりたい・こうしたい」という願いの短い言葉を${ASK}個作ってください（${b.note}）。
・本人が自分の気持ちとして言う言葉（〜したい・〜になりたい・本当は〜）。1つ4〜10文字（11文字以上は書かない）
・いろいろな願いを混ぜる`
        : box <= 40
          ? `${what}という気持ちを表す、短い言葉を${ASK}個作ってください。
・本人が自分の気持ちとして言う言葉。ひとこと（わくわく）から、少し場面のある言葉（胸が高鳴る朝）まで混ぜる。1つ2〜8文字（10文字以内）
・いろいろな言い方を混ぜる。つらい気持ちは、やわらかく、追いつめない言い方にする`
          : `${what}に関わる、短い言葉を${ASK}個作ってください。
・本人が自分のこととして言う言葉。ひとこと（会議）から、少し場面のある言葉まで混ぜる。1つ2〜8文字（10文字以内）
・いろいろな種類を混ぜる。追いつめる言い方はしない`;
  return `${rules}
・助言・命令・説明は書かない。句点（。）は付けない
${existing.length ? `・次の言葉は、もうあるので作らない：${existing.slice(-80).join("、")}\n` : ""}返事は次の形のJSONだけにしてください（前置き・説明・コードブロックの印は要りません）。
{"words":["…"]}`;
};

// ---- 読み書き（action からは ctx.db が使えないので、ここを通す）----
export const state = internalQuery({
  args: {},
  returns: v.object({
    counts: v.array(v.object({ box: v.number(), n: v.number(), tries: v.number() })),
    boxVecs: v.number(),
  }),
  handler: async (ctx) => {
    const counts = [];
    for (const b of BOXES) {
      const n = (await ctx.db.query("words").withIndex("by_box", (q) => q.eq("box", b.id)).collect()).filter((w) => w.source === "box").length;
      const t = await ctx.db.query("boxBuild").withIndex("by_box", (q) => q.eq("box", b.id)).unique();
      counts.push({ box: b.id, n, tries: t?.tries ?? 0 });
    }
    const boxVecs = (await ctx.db.query("boxVecs").collect()).length;
    return { counts, boxVecs };
  },
});

export const boxTexts = internalQuery({
  args: { box: v.number() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => (await ctx.db.query("words").withIndex("by_box", (q) => q.eq("box", args.box)).collect()).filter((w) => w.source === "box").map((w) => w.text),
});

export const allBoxVecs = internalQuery({
  args: {},
  returns: v.array(v.object({ box: v.number(), embedding: v.array(v.float64()) })),
  handler: async (ctx) => (await ctx.db.query("boxVecs").collect()).map((b) => ({ box: b.box, embedding: b.embedding })),
});

export const saveBoxVecs = internalMutation({
  args: { rows: v.array(v.object({ box: v.number(), embedding: v.array(v.float64()) })) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const r of args.rows) {
      const old = await ctx.db.query("boxVecs").withIndex("by_box", (q) => q.eq("box", r.box)).unique();
      if (old) await ctx.db.patch(old._id, { embedding: r.embedding });
      else await ctx.db.insert("boxVecs", r);
    }
    return null;
  },
});

export const textExists = internalQuery({
  args: { texts: v.array(v.string()) },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const out: string[] = [];
    for (const t of args.texts) {
      const row = await ctx.db.query("words").withIndex("by_text_and_owner", (q) => q.eq("text", t).eq("owner", undefined)).first();
      if (row) out.push(t);
    }
    return out;
  },
});

// 川に流す言葉の写し（schema.ts の boxLists）。箱の塊を直す
async function editList(ctx: MutationCtx, box: number, f: (texts: string[]) => string[]) {
  const row = await ctx.db.query("boxLists").withIndex("by_box", (q) => q.eq("box", box)).unique();
  if (row) await ctx.db.patch(row._id, { texts: f(row.texts) });
  else await ctx.db.insert("boxLists", { box, texts: f([]) });
}
const addText = (t: string) => (xs: string[]) => (xs.includes(t) ? xs : [...xs, t]);
const dropText = (t: string) => (xs: string[]) => xs.filter((x) => x !== t);
// 言葉の表から、写しを全部作り直す（読むのは言葉の表を1回だけ）
async function rebuild(ctx: MutationCtx) {
  const byBox = new Map<number, string[]>();
  for (const b of BOXES) byBox.set(b.id, []);
  for (const w of await ctx.db.query("words").withIndex("by_owner", (q) => q.eq("owner", undefined)).collect()) {
    if (w.source === "box" && w.box !== undefined) byBox.get(w.box)?.push(w.text);
  }
  const rows = new Map((await ctx.db.query("boxLists").collect()).map((r) => [r.box, r]));
  for (const [box, texts] of byBox) {
    const row = rows.get(box);
    if (row) await ctx.db.patch(row._id, { texts });
    else await ctx.db.insert("boxLists", { box, texts });
  }
}
// 使い方: npx convex run warehouse:rebuildLists
export const rebuildLists = internalMutation({ args: {}, returns: v.null(), handler: async (ctx) => { await rebuild(ctx); return null; } });
// 意味の位置を付け終えた言葉に、印（vec）を付ける（1回だけ。重い wordVecs を1回読む）。使い方: npx convex run warehouse:markVecs
export const markVecs = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    let n = 0;
    for await (const x of ctx.db.query("wordVecs")) {
      const w = await ctx.db.get(x.wordId);
      if (w && w.vec !== true) { await ctx.db.patch(w._id, { vec: true }); n++; }
    }
    return n;
  },
});

export const saveWords = internalMutation({
  args: { box: v.number(), rows: v.array(v.object({ text: v.string(), box: v.number(), embedding: v.optional(v.array(v.float64())) })) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const r of args.rows) {
      const dup = await ctx.db.query("words").withIndex("by_text_and_owner", (q) => q.eq("text", r.text).eq("owner", undefined)).first();
      if (dup) continue;
      const wordId = await ctx.db.insert("words", { text: r.text, category: CATEGORY_OF(r.box), source: "box", box: r.box, vec: r.embedding ? true : undefined });
      if (r.embedding) await ctx.db.insert("wordVecs", { wordId, box: r.box, embedding: r.embedding });
      await editList(ctx, r.box, addText(r.text));
    }
    const t = await ctx.db.query("boxBuild").withIndex("by_box", (q) => q.eq("box", args.box)).unique();
    if (t) await ctx.db.patch(t._id, { tries: t.tries + 1 });
    else await ctx.db.insert("boxBuild", { box: args.box, tries: 1 });
    return null;
  },
});

// ---- 倉庫づくり ----
// 使い方: npx convex run warehouse:start（裏で1分ごとに1回ずつ進む。進み具合は warehouse:progress）
export const start = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.warehouse.step, {});
    return null;
  },
});

export const step = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // 止める：Convex の環境変数 WAREHOUSE_RUN が "1" のときだけ進む（2026-10-14、ユーザー「勝手にまだ始めないで」）
    if ((env as Record<string, string | undefined>).WAREHOUSE_RUN !== "1") {
      console.log("倉庫づくり：止めてある（WAREHOUSE_RUN が 1 ではない）");
      return null;
    }
    const key = env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY が Convex の環境変数にありません");
    const st: { counts: { box: number; n: number; tries: number }[]; boxVecs: number } = await ctx.runQuery(internal.warehouse.state, {});
    try {
      // 箱の意味の位置（はじめの1回だけ）
      if (st.boxVecs < BOXES.length) {
        const embs = await embed(BOXES.map((b) => `${b.name}${b.note ? `（${b.note}）` : ""}`));
        await ctx.runMutation(internal.warehouse.saveBoxVecs, { rows: BOXES.map((b, i) => ({ box: b.id, embedding: embs[i] })) });
        await ctx.scheduler.runAfter(STEP_MS, internal.warehouse.step, {});
        return null;
      }
      // ぐるぐる回す：言葉がいちばん少ない箱から作る（箱の番号順だと、前の箱だけ先に埋まって偏る。2026-10-14）
      const target = st.counts
        .filter((c) => c.n < FIRST_COUNT && c.tries < MAX_TRIES)
        .sort((a, b) => a.n - b.n || a.tries - b.tries || a.box - b.box)[0];
      if (!target) {
        console.log("倉庫づくり：終わり");
        return null;
      }
      const existing: string[] = await ctx.runQuery(internal.warehouse.boxTexts, { box: target.box });
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelNow(), input: prompt(target.box, existing) }),
      });
      if (res.status === 429) {
        console.log("倉庫づくり：書く AI の上限（429）", modelNow(), (await res.text()).slice(0, 200));
        throw new RateLimited();
      }
      const raw = res.ok ? textOf(await res.json()) : null;
      let words: string[] = [];
      try {
        const p = JSON.parse(raw!.slice(raw!.indexOf("{"), raw!.lastIndexOf("}") + 1));
        words = (Array.isArray(p.words) ? p.words : []).map((t: unknown) => (typeof t === "string" ? t.trim().replace(/[。.]+$/, "") : "")).filter((t: string) => lengthOk(t, target.box));
      } catch {}
      words = [...new Set(words)].filter((w) => !existing.includes(w));
      const already: string[] = words.length ? await ctx.runQuery(internal.warehouse.textExists, { texts: words }) : [];
      words = words.filter((w) => !already.includes(w));
      const rows: { text: string; box: number; embedding?: number[] }[] = [];
      let embs: number[][] | null = null;
      if (words.length) {
        try {
          embs = await embed(words);
        } catch (e) {
          if (!(e instanceof RateLimited)) throw e;
          // 埋め込みの無料の上限に当たったとき：頼んだ箱のまま、意味の位置なしで入れる。あとで fillVecs で位置を付けて、箱を確かめる（2026-10-14）
          console.log("倉庫づくり：埋め込みの上限。頼んだ箱のまま、意味の位置なしで入れる");
          for (const w of words) rows.push({ text: w, box: target.box });
        }
      }
      if (embs) {
        const boxVecs: { box: number; embedding: number[] }[] = await ctx.runQuery(internal.warehouse.allBoxVecs, {});
        for (let i = 0; i < words.length; i++) {
          const e = embs[i];
          // いちばん近い箱（頼んだ箱と違えば、近いほうの箱に入れる）
          let best = { box: 0, s: -1 };
          for (const b of boxVecs) {
            const s = cos(e, b.embedding);
            if (s > best.s) best = { box: b.box, s };
          }
          if (best.s < MIN_BOX) continue;
          // 箱の中に、ほぼ同じ言葉がないか
          const hits = await ctx.vectorSearch("wordVecs", "by_embedding", { vector: e, limit: 1, filter: (q) => q.eq("box", best.box) });
          if (hits[0] && hits[0]._score >= SAME) continue;
          if (rows.some((r) => r.embedding && cos(r.embedding, e) >= SAME)) continue;
          rows.push({ text: words[i], box: best.box, embedding: e });
        }
      }
      await ctx.runMutation(internal.warehouse.saveWords, { box: target.box, rows });
      console.log(`倉庫づくり：箱${target.box} 候補${words.length} 入れた${rows.length}（入る箱：${[...new Set(rows.map((r) => r.box))].join(",")}）`);
    } catch (e) {
      if (!(e instanceof RateLimited)) console.log("倉庫づくり：失敗", String(e));
      else console.log("倉庫づくり：上限に当たったので待つ");
    }
    await ctx.scheduler.runAfter(STEP_MS, internal.warehouse.step, {});
    return null;
  },
});

// 意味の位置がない言葉に、位置を付ける（上限が戻ってから）。頼んだ箱と、いちばん近い箱が違えば、近い箱に入れかえる。どの箱からも遠ければ休ませる（source を old に）
// 使い方: npx convex run warehouse:fillVecs（1回に最大120語。何回か呼ぶ）
export const noVec = internalQuery({
  args: {},
  returns: v.array(v.object({ id: v.id("words"), text: v.string(), box: v.number() })),
  handler: async (ctx) => {
    const out: { id: Id<"words">; text: string; box: number }[] = [];
    for await (const w of ctx.db.query("words")) {
      if (w.source !== "box" || w.box === undefined || w.askedAt === 1 || w.vec === true) continue;
      out.push({ id: w._id, text: w.text, box: w.box });
      if (out.length >= 120) break;
    }
    return out;
  },
});
export const applyVecs = internalMutation({
  args: { rows: v.array(v.object({ id: v.id("words"), box: v.number(), keep: v.boolean(), embedding: v.array(v.float64()) })) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const r of args.rows) {
      const w = await ctx.db.get(r.id);
      if (!w) continue;
      if (w.box !== undefined) await editList(ctx, w.box, dropText(w.text));
      if (!r.keep) {
        await ctx.db.patch(r.id, { source: "old", vec: true });
        continue;
      }
      await ctx.db.patch(r.id, { box: r.box, vec: true });
      await ctx.db.insert("wordVecs", { wordId: r.id, box: r.box, embedding: r.embedding });
      await editList(ctx, r.box, addText(w.text));
    }
    return null;
  },
});
export const fillVecs = internalAction({
  args: {},
  returns: v.object({ done: v.number(), moved: v.number(), dropped: v.number(), left: v.number() }),
  handler: async (ctx) => {
    const todo: { id: Id<"words">; text: string; box: number }[] = await ctx.runQuery(internal.warehouse.noVec, {});
    const boxVecs: { box: number; embedding: number[] }[] = await ctx.runQuery(internal.warehouse.allBoxVecs, {});
    let done = 0, moved = 0, dropped = 0;
    for (let i = 0; i < todo.length; i += 40) {
      const chunk = todo.slice(i, i + 40);
      const embs = await embed(chunk.map((t) => t.text));
      const rows = chunk.map((t, k) => {
        let best = { box: 0, s: -1 };
        for (const b of boxVecs) {
          const s = cos(embs[k], b.embedding);
          if (s > best.s) best = { box: b.box, s };
        }
        if (best.box !== t.box) moved++;
        if (best.s < MIN_BOX) dropped++;
        return { id: t.id, box: best.box, keep: best.s >= MIN_BOX, embedding: embs[k] };
      });
      await ctx.runMutation(internal.warehouse.applyVecs, { rows });
      done += chunk.length;
    }
    return { done, moved, dropped, left: Math.max(0, todo.length === 120 ? 1 : 0) };
  },
});

// 倉庫づくりのやり直し：作った言葉（source "box"・見本以外）と、意味の位置・頼んだ回数を消す。使い方: npx convex run warehouse:reset
// 見本の言葉（demo:seedShortSample。askedAt が 1）は残す
export const reset = internalMutation({
  args: {},
  returns: v.object({ words: v.number(), vecs: v.number() }),
  handler: async (ctx) => {
    let words = 0, vecs = 0;
    for (const w of await ctx.db.query("words").withIndex("by_owner", (q) => q.eq("owner", undefined)).collect()) {
      if (w.source !== "box" || w.askedAt === 1) continue;
      const vs = await ctx.db.query("wordVecs").withIndex("by_wordId", (q) => q.eq("wordId", w._id)).collect();
      for (const x of vs) { await ctx.db.delete(x._id); vecs++; }
      await ctx.db.delete(w._id);
      words++;
    }
    for (const t of await ctx.db.query("boxBuild").collect()) await ctx.db.delete(t._id);
    await rebuild(ctx);
    return { words, vecs };
  },
});

// 長さの決まりに合わない言葉を休ませる（source を old に。消さない）。頼んだ回数も0に戻して、足りない箱を作り足せるようにする
// 使い方: npx convex run warehouse:retireLong
export const retireLong = internalMutation({
  args: {},
  returns: v.object({ retired: v.number(), kept: v.number() }),
  handler: async (ctx) => {
    let retired = 0, kept = 0;
    for (const w of await ctx.db.query("words").withIndex("by_owner", (q) => q.eq("owner", undefined)).collect()) {
      if (w.source !== "box" || w.box === undefined) continue;
      if (lengthOk(w.text, w.box)) kept++;
      else {
        await ctx.db.patch(w._id, { source: "old" });
        const vs = await ctx.db.query("wordVecs").withIndex("by_wordId", (q) => q.eq("wordId", w._id)).collect();
        for (const x of vs) await ctx.db.delete(x._id);
        retired++;
      }
    }
    for (const t of await ctx.db.query("boxBuild").collect()) await ctx.db.patch(t._id, { tries: 0 });
    await rebuild(ctx);
    return { retired, kept };
  },
});

// 進み具合。使い方: npx convex run warehouse:progress
export const progress = internalQuery({
  args: {},
  returns: v.object({ total: v.number(), done: v.number(), boxes: v.array(v.string()) }),
  handler: async (ctx) => {
    const out: string[] = [];
    let total = 0, done = 0;
    for (const b of BOXES) {
      const n = (await ctx.db.query("words").withIndex("by_box", (q) => q.eq("box", b.id)).collect()).filter((w) => w.source === "box").length;
      const t = await ctx.db.query("boxBuild").withIndex("by_box", (q) => q.eq("box", b.id)).unique();
      total += n;
      if (n >= FIRST_COUNT || (t?.tries ?? 0) >= MAX_TRIES) done++;
      out.push(`${b.id} ${b.name}：${n}語（頼んだ${t?.tries ?? 0}回）`);
    }
    return { total, done, boxes: out };
  },
});

// 川に流す倉庫の言葉（みんなの言葉なので誰でも読める）。意味の位置は送らない（重いため）
export const forRiver = query({
  args: {},
  returns: v.array(v.object({ text: v.string(), box: v.number() })),
  handler: async (ctx) => {
    // 箱ごとの塊（45件）を読むだけ。言葉の表を7千語ぶん読むと、アプリを開くたびに約2.5MB読み、Convex の無料の枠（1GB/月）を使い切った（2026-10-15）
    const out: { text: string; box: number }[] = [];
    for (const row of await ctx.db.query("boxLists").collect()) for (const text of row.texts) out.push({ text, box: row.box });
    return out;
  },
});

export type _Unused = Id<"words">;
