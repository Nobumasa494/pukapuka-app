import { internalAction, env } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { WORD_LIST } from "../src/words";

// Gemini で、決まった言葉1つから細かい言葉を作ってしまう（SPEC 第2部 A.。2026-10-11 仮決定：Gemini 3.1 Flash-Lite）
// 送るのは決まった言葉1つだけ。記録・日記・名前は送らない。鍵は Convex の環境変数 GEMINI_API_KEY（コードや git には書かない）
const MODEL = "gemini-3.1-flash-lite";

const prompt = (word: string, gentle: boolean) => `気持ちを記録するアプリの、川に流れる言葉を作ります。
「${word}」という言葉から、次の2つを作ってください。
・near：近い言葉を5つ（例：夜の${word}）
・abstract：少し離れているけれど、通じる所がある言葉を5つ。通じる所（共通点）も一言で添える
日本語で、やさしい言い方にしてください。${gentle ? "つらい気持ちの言葉なので、やわらかい言い方だけにして、追いつめる言葉は使わないでください。" : ""}
返事は次の形のJSONだけにしてください（前置き・説明・コードブロックの印は要りません）。
{"near":["…"],"abstract":[{"text":"…","theme":"…"}]}`;

function textOf(j: any): string | null {
  const out = (j?.steps ?? [])
    .filter((s: any) => s?.type === "model_output")
    .flatMap((s: any) => s.content ?? [])
    .filter((c: any) => c?.type === "text")
    .map((c: any) => c.text);
  return out.length ? out.join("\n") : null;
}

// 使い方: npx convex run ai:generateFor '{"word":"散歩"}'（作った言葉は川にはまだ流れない）
export const generateFor = internalAction({
  args: { word: v.string(), force: v.optional(v.boolean()) },
  returns: v.object({ added: v.number(), words: v.array(v.string()) }),
  handler: async (ctx, args) => {
    const key = env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY が Convex の環境変数にありません");
    const parent: { _id: Id<"words">; category: string; hasChildren: boolean } | null = await ctx.runQuery(internal.aiWords.getFixed, { text: args.word });
    if (!parent) throw new Error(`決まった言葉に「${args.word}」はありません`);
    if (parent.hasChildren && !args.force) return { added: 0, words: [] };

    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, input: prompt(args.word, parent.category === "emotion") }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`Gemini が失敗 HTTP ${res.status}`);
    const raw = textOf(j);
    if (!raw) throw new Error("Gemini の返事が読めませんでした");

    const body = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    let parsed: any;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error("Gemini の返事がJSONになっていません: " + raw.slice(0, 200));
    }
    const clean = (s: unknown) => (typeof s === "string" ? s.trim() : "");
    const items: { text: string; kind: "near" | "abstract"; theme?: string }[] = [];
    for (const t of Array.isArray(parsed.near) ? parsed.near : []) {
      const text = clean(t);
      if (text && text.length <= 20) items.push({ text, kind: "near" });
    }
    for (const a of Array.isArray(parsed.abstract) ? parsed.abstract : []) {
      const text = clean(a?.text);
      if (text && text.length <= 20) items.push({ text, kind: "abstract", theme: clean(a?.theme).slice(0, 60) || undefined });
    }
    if (items.length === 0) throw new Error("使える言葉がありませんでした");

    const added: number = await ctx.runMutation(internal.aiWords.saveGenerated, { parent: parent._id, category: parent.category, items });
    return { added, words: items.map((i) => i.text) };
  },
});

// まだ作っていない決まった言葉を、limit 語ぶん順に作る（action は10分までなので区切る）。使い方: npx convex run ai:generateMissing '{"limit":40}'
export const generateMissing = internalAction({
  args: { limit: v.number() },
  returns: v.object({ done: v.array(v.string()), failed: v.array(v.string()), left: v.number() }),
  handler: async (ctx, args) => {
    const done: string[] = [];
    const failed: string[] = [];
    let left = 0;
    for (const word of WORD_LIST) {
      const row: { hasChildren: boolean } | null = await ctx.runQuery(internal.aiWords.getFixed, { text: word });
      if (!row || row.hasChildren) continue;
      if (done.length + failed.length >= args.limit) {
        left++;
        continue;
      }
      try {
        await ctx.runAction(internal.ai.generateFor, { word });
        done.push(word);
      } catch {
        failed.push(word);
      }
    }
    return { done, failed, left };
  },
});
