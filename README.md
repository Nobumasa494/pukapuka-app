# pukapuka

**疲れている社会人が、30秒で言葉を拾うだけで、自分の好奇心の源に気づき、それが育っていくのが見えるアプリ。**

- 川を流れてくる言葉の泡を、ピンときたら拾うだけ。文字は打たなくていい
- 画面ごとに1つの問い・1つの分析。数字とグラフを出すのは「わたしのこと」だけ
- 育てる行動はアプリの外で、本人が選ぶ。アプリは気づきと育ちを映す鏡

## 画面（方針。2026-10-07）

見本の絵と例の言葉は仮のものです。詳しくは [docs/SPEC.md](docs/SPEC.md) の「MVP」と「気づきの日記」。

| 画面 | 問い | 分析 | いつ作るか |
|---|---|---|---|
| ことばの川 | 今、どんな言葉がピンとくる？ | （言葉を集める入口） | MVP |
| 拾ったことば | このごろ、何を拾ってる？ | 集計（回数・強さ） | MVP |
| 夜空 | 何と何が、いつも一緒？ | 無向ネットワーク・コミュニティ検出 | MVP |
| わたしのこと | 何のあとに元気・好奇心が来る？ それは育ってる？ | 有向ネットワーク（入次数・PageRank・強連結成分分解）＋時間の変化 | MVP |
| 気づきの日記 | 気づいたあと、自分で試したことを残す | （分析なし。川とは独立） | MVP のあと |

![ことばの川](docs/screens/1_river.png)
![拾ったことば](docs/screens/2_words.png)
![夜空](docs/screens/3_sky.png)
![わたしのこと](docs/screens/4_me.png)
![気づきの日記](docs/screens/5_diary.png)

画像を直すときは `docs/screens/screens.html` を直して `node docs/screens/render.mjs` で作り直す。

## 試作の画面（開発中のスクリーンショット）
<img width="251" height="389" alt="image" src="https://github.com/user-attachments/assets/860c86b0-f667-4d84-ba82-22be21b67293" />

<img width="213" height="383" alt="image" src="https://github.com/user-attachments/assets/20201881-6012-4627-8d58-59a6bf0a5592" />

<img width="220" height="382" alt="image" src="https://github.com/user-attachments/assets/f5de6c16-4928-4f0e-8207-a0c7ede90c3f" />
<img width="703" height="374" alt="image" src="https://github.com/user-attachments/assets/0b4fd77a-20ec-4bb7-99d5-017be191479d" />


## 開発に必要なもの

| 道具 | バージョン | 使うところ |
|---|---|---|
| Node.js | 24（`.nvmrc`。fnm なら `fnm use`） | アプリ本体（Expo） |
| uv | 最新 | 曲と効果音を作る Python の管理（Python 3.13 と numpy・scipy を `scripts/music/uv.lock` のとおりに自動で入れる） |
| ffmpeg | 6 以上 | 曲と効果音を m4a に書き出す |
| Blender | 5.2 | 背景の動画を作る |
| Expo Go | スマホに入れる | 実機での確認 |

### アプリを動かす（WSL）

```bash
npm ci
npx expo start --tunnel --clear   # スマホの Expo Go で QR を読む
```

`.env.local` に `EXPO_PUBLIC_CONVEX_URL` が必要です。

### 曲と効果音を作り直す

```bash
cd scripts/music
uv run build.py   # assets/sounds/ の bgm_*.m4a と chime_*.m4a を書き直す
uv run check.py   # 音割れ・音量・帯域・ループのつなぎ目を数値で確かめる
```

楽譜と楽器は `scripts/music/compose.py` にあります。作り方は `docs/SPEC.md` の「音」。
