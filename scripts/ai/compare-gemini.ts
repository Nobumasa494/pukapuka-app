/// <reference types="node" />
// AI の会社を決めるための試し（2026-10-11）：無料チャットで気に入った Gemini を、API でも同じ質か確かめる。
// 使い方: GEMINI_API_KEY=… npx tsx scripts/ai/compare-gemini.ts
// - 送るのは「散歩」「不安」という決まった言葉だけ（個人の内容は送らない）。試しは無料プランの鍵でよい。アプリで使うときは有料プランにする
//   （無料プランは、送った内容が Google の改善に使われ、人が読むこともある。2026-10-11 に公式の利用規約で確かめた）
// - 呼び方は公式のクイックスタート（Interactions API）に合わせた。形が変わっていたら、生の返事を出すので、それを見て直す
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  console.error('GEMINI_API_KEY を環境変数に入れてください（鍵は https://aistudio.google.com/apikey で作る。コードや git には書かない）');
  process.exit(1);
}
const MODELS = (process.env.MODELS ?? 'gemini-3.1-flash-lite,gemini-3.5-flash-lite,gemini-3.8-flash').split(',');
const WORDS = (process.env.WORDS ?? '散歩,不安').split(',');
const ask = (word: string) =>
  `気持ちを記録するアプリの、川に流れる言葉を作ります。
「${word}」という言葉から、次の2つを作ってください。
・近い言葉を5つ（例：夜の${word}）
・少し離れているけれど、通じる所がある言葉を5つ。通じる所も一言で添えてください
日本語で、やさしい言い方にしてください。説明や前置きは要りません。`;

type Json = any; // 返事の形は公式のページに合わせて読む。読めなければ生の返事を出す
function textOf(j: Json): string | null {
  const steps: Json[] = j?.steps ?? [];
  const out = steps
    .filter((s) => s?.type === 'model_output')
    .flatMap((s) => s.content ?? [])
    .filter((c: Json) => c?.type === 'text')
    .map((c: Json) => c.text);
  return out.length ? out.join('\n') : null;
}

for (const word of WORDS) {
  console.log(`\n==================== 「${word}」 ====================`);
  for (const model of MODELS) {
    const t0 = Date.now();
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: ask(word) }),
    });
    const j: Json = await res.json().catch(() => null);
    console.log(`\n--- ${model}（${((Date.now() - t0) / 1000).toFixed(1)}秒、HTTP ${res.status}）---`);
    const text = res.ok ? textOf(j) : null;
    if (text) console.log(text.trim());
    else console.log('読めなかった。生の返事：', JSON.stringify(j)?.slice(0, 1500));
    if (j?.usage) console.log('使った量（トークン）：', JSON.stringify(j.usage));
  }
}
