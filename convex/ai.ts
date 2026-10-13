import { internalAction, env } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { WORD_LIST, WORD_CATEGORY } from "../src/words";
import { BOXES } from "./boxes";
import { isHardFeeling } from "../src/flow";

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
    const parent: { _id: Id<"words">; category: string; hasChildren: boolean; hasBehind: boolean } | null = await ctx.runQuery(internal.aiWords.getWord, { text: args.word });
    if (!parent) throw new Error(`言葉の表に「${args.word}」はありません`);
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
      const row: { hasChildren: boolean } | null = await ctx.runQuery(internal.aiWords.getWord, { text: word });
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

// 裏側の言葉（2026-10-11、ユーザー「ネガティブな言葉ってヒントになるときあるから、それを生かしたい」）：
// つらい気持ちの裏にあるかもしれない気持ちを言葉にする（嫉妬 → あの人みたいになりたい）。アプリは「あなたは本当は〜」とは言わない。拾うかどうかは本人
const behindPrompt = (word: string) => `気持ちを記録するアプリの、川に流れる言葉を作ります。
「${word}」という気持ちの裏に、ときどき隠れていることがある気持ちや願いを、短い言葉で5つ作ってください。
例：嫉妬 → あの人みたいになりたい／悔しい → 本当はもっとできた／退屈 → 何か新しいことがしたい
・本人が自分の気持ちとして言う言葉にする（「〜したい」「〜ほしい」「本当は〜」など）
・助言（〜してもいい、〜してみよう）、なぐさめ、説明（〜なんだね、〜の証拠）は書かない
・句点（。）は付けない。1つ20文字まで
返事は次の形のJSONだけにしてください（前置き・説明・コードブロックの印は要りません）。
{"behind":["…"]}`;

// 使い方: npx convex run ai:generateBehindAll（つらい気持ちの言葉のうち、まだ作っていないものだけ）
export const generateBehindAll = internalAction({
  args: {},
  returns: v.object({ done: v.array(v.string()), failed: v.array(v.string()) }),
  handler: async (ctx) => {
    const key = env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY が Convex の環境変数にありません");
    const done: string[] = [];
    const failed: string[] = [];
    for (const word of WORD_LIST.filter(isHardFeeling)) {
      const parent: { _id: Id<"words">; category: string; hasBehind: boolean } | null = await ctx.runQuery(internal.aiWords.getWord, { text: word });
      if (!parent || parent.hasBehind) continue;
      try {
        const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
          method: "POST",
          headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({ model: MODEL, input: behindPrompt(word) }),
        });
        const raw = res.ok ? textOf(await res.json()) : null;
        if (!raw) throw new Error();
        const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
        const items = (Array.isArray(parsed.behind) ? parsed.behind : [])
          .map((t: unknown) => (typeof t === "string" ? t.trim().replace(/[。.]+$/, "") : ""))
          .filter((t: string) => t && t.length <= 20)
          .map((text: string) => ({ text, kind: "behind" as const }));
        if (!items.length) throw new Error();
        await ctx.runMutation(internal.aiWords.saveGenerated, { parent: parent._id, category: parent.category, items });
        done.push(word);
      } catch {
        failed.push(word);
      }
    }
    return { done, failed };
  },
});

// したいことの言葉（2026-10-13。ユーザー「流れてくる言葉が単調・具体的でない」「したいことを中心に」）：
// していること・好奇心の言葉から、場面まで入った「してみたい」言葉を作る。元の言葉の仲間なので、星空・夜明けでは元の言葉として数える
const wishPrompt = (word: string) => `「${word}」が好きな人が、これからしてみたいと思う具体的なことを、5つ作ってください。
・場面まで入れる（いつ・どこで・何を）。12〜16文字
・必ず「〜したい」か「〜てみたい」で終わる
・本人が自分で言う言葉にする。助言・命令・説明・なぐさめは書かない。句点（。）は付けない
・並べる順：1つ目は「${word}」にとても近く、あとになるほど少し広がる（ただし「${word}」の仲間のまま）
返事は次の形のJSONだけにしてください（前置き・説明・コードブロックの印は要りません）。
{"wish":["…"]}`;

// 見るだけ（保存しない）。使い方: npx convex run ai:previewWishes '{"words":["散歩","料理"]}'
export const previewWishes = internalAction({
  args: { words: v.array(v.string()) },
  returns: v.array(v.object({ word: v.string(), wish: v.array(v.string()) })),
  handler: async (_ctx, args) => {
    const key = env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY が Convex の環境変数にありません");
    const out: { word: string; wish: string[] }[] = [];
    for (const word of args.words) {
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, input: wishPrompt(word) }),
      });
      const raw = res.ok ? textOf(await res.json()) : null;
      let wish: string[] = [];
      try {
        const parsed = JSON.parse(raw!.slice(raw!.indexOf("{"), raw!.lastIndexOf("}") + 1));
        wish = (Array.isArray(parsed.wish) ? parsed.wish : []).map((t: unknown) => (typeof t === "string" ? t.trim().replace(/[。.]+$/, "") : "")).filter((t: string) => t && t.length <= 20);
      } catch {}
      out.push({ word, wish });
    }
    return out;
  },
});

// したいことの言葉を作って、みんなの言葉としてしまう（近い言葉として。元の言葉の仲間なので、星空・夜明けでは元の言葉として数える）。
// 使い方: npx convex run ai:generateWishes '{"limit":30}'（まだ作っていない「していること」の言葉だけ。action は10分までなので区切る）
export const generateWishes = internalAction({
  args: { limit: v.number() },
  returns: v.object({ done: v.array(v.string()), failed: v.array(v.string()), left: v.number() }),
  handler: async (ctx, args) => {
    const key = env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY が Convex の環境変数にありません");
    const done: string[] = [];
    const failed: string[] = [];
    let left = 0;
    for (const word of WORD_LIST.filter((w) => WORD_CATEGORY[w] === "doing")) {
      const parent: { _id: Id<"words">; category: string; hasWish: boolean } | null = await ctx.runQuery(internal.aiWords.getWord, { text: word });
      if (!parent || parent.hasWish) continue;
      if (done.length + failed.length >= args.limit) {
        left++;
        continue;
      }
      try {
        const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
          method: "POST",
          headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({ model: MODEL, input: wishPrompt(word) }),
        });
        const raw = res.ok ? textOf(await res.json()) : null;
        if (!raw) throw new Error();
        const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
        const items = (Array.isArray(parsed.wish) ? parsed.wish : [])
          .map((t: unknown) => (typeof t === "string" ? t.trim().replace(/[。.]+$/, "") : ""))
          .filter((t: string) => t && t.length <= 20 && /(したい|てみたい|たい)$/.test(t))
          .map((text: string) => ({ text, kind: "near" as const }));
        if (!items.length) throw new Error();
        await ctx.runMutation(internal.aiWords.saveGenerated, { parent: parent._id, category: parent.category, items });
        done.push(word);
      } catch {
        failed.push(word);
      }
    }
    return { done, failed, left };
  },
});

// 言葉に箱（ラベル）を付ける（試し。2026-10-13）。保存しない。使い方: npx convex run ai:previewBoxes '{"words":["散歩","不安"]}'
const boxPrompt = (words: string[]) => `次の言葉それぞれが、下の箱のどれにいちばん近いかを、箱の番号で答えてください。
どの箱にも合わない言葉は 0 にしてください（無理に入れない）。
箱：
${BOXES.map((b) => `${b.id} ${b.name}${b.note ? `（${b.note}）` : ""}`).join("\n")}

言葉：
${words.map((w, i) => `${i + 1}. ${w}`).join("\n")}

返事は次の形のJSONだけにしてください（前置き・説明・コードブロックの印は要りません）。
{"result":[{"word":"…","box":番号}]}`;

export const previewBoxes = internalAction({
  args: { words: v.array(v.string()) },
  returns: v.array(v.object({ word: v.string(), box: v.number() })),
  handler: async (_ctx, args) => {
    const key = env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY が Convex の環境変数にありません");
    const out: { word: string; box: number }[] = [];
    for (let i = 0; i < args.words.length; i += 25) {
      const chunk = args.words.slice(i, i + 25);
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, input: boxPrompt(chunk) }),
      });
      const raw = res.ok ? textOf(await res.json()) : null;
      try {
        const parsed = JSON.parse(raw!.slice(raw!.indexOf("{"), raw!.lastIndexOf("}") + 1));
        const got = new Map<string, number>((Array.isArray(parsed.result) ? parsed.result : []).map((r: any) => [String(r.word), Number(r.box)]));
        for (const w of chunk) out.push({ word: w, box: got.get(w) ?? -1 });
      } catch {
        for (const w of chunk) out.push({ word: w, box: -1 });
      }
    }
    return out;
  },
});

// 箱ごとに、段階（気になる・したい・した）の言葉を作る（試し。保存しない。2026-10-13）
// 使い方: npx convex run ai:previewBoxWords '{"ids":[2,3]}'
const boxWordsPrompt = (name: string, note: string) => `「${name}」${note ? `（${note}）` : ""}に関わる、具体的な短い言葉を作ってください。
次の3つの形で、5つずつ、合わせて15。
・kininaru：まだしていないけれど気になっている（〜が気になる、〜ってどうなんだろう）
・shitai：してみたい（〜してみたい、〜したい）
・shita：した・している（〜した、〜している）
決まり：
・場面まで入れる（いつ・どこで・何を）。1つ10〜16文字
・本人が自分で言う言葉にする。助言・命令・説明は書かない。句点（。）は付けない
・ふつうの人の毎日にありそうなこと（大げさにしない）
・「${name}」の中で、いろいろな種類を混ぜる（同じ種類ばかりにしない。例：楽器ならギター・ピアノ・ウクレレ・太鼓など）
・好奇心やわくわくにつながるものにする（掃除の汚れや面倒な作業のような、楽しくないことは書かない）
・「${name}」そのものの言葉にする（買い物や移動など、別のことにしない）
返事は次の形のJSONだけにしてください（前置き・説明・コードブロックの印は要りません）。
{"kininaru":["…"],"shitai":["…"],"shita":["…"]}`;

export const previewBoxWords = internalAction({
  args: { ids: v.array(v.number()) },
  returns: v.array(v.object({ id: v.number(), name: v.string(), kininaru: v.array(v.string()), shitai: v.array(v.string()), shita: v.array(v.string()) })),
  handler: async (_ctx, args) => {
    const key = env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY が Convex の環境変数にありません");
    const out = [];
    for (const id of args.ids) {
      const box = BOXES.find((b) => b.id === id);
      if (!box) continue;
      const clean = (a: unknown) => (Array.isArray(a) ? a : []).map((t) => (typeof t === "string" ? t.trim().replace(/[。.]+$/, "") : "")).filter((t) => t && t.length <= 16);
      let got = { kininaru: [] as string[], shitai: [] as string[], shita: [] as string[] };
      for (let tryNo = 0; tryNo < 2 && !got.shita.length; tryNo++) {
        const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
          method: "POST",
          headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({ model: MODEL, input: boxWordsPrompt(box.name, box.note) }),
        });
        const raw = res.ok ? textOf(await res.json()) : null;
        try {
          const p = JSON.parse(raw!.slice(raw!.indexOf("{"), raw!.lastIndexOf("}") + 1));
          got = { kininaru: clean(p.kininaru), shitai: clean(p.shitai), shita: clean(p.shita) };
        } catch {}
      }
      out.push({ id, name: box.name, ...got });
    }
    return out;
  },
});
