# アプリ開発画面
<img width="251" height="389" alt="image" src="https://github.com/user-attachments/assets/860c86b0-f667-4d84-ba82-22be21b67293" />

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
```

楽譜と楽器は `scripts/music/compose.py` にあります。作り方は `docs/SPEC.md` の「音」。
