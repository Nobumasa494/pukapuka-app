#!/usr/bin/env bash
# Blender の作業ファイル（最新だけ）を、非公開リポジトリ Nobumasa494/pukapuka-blender に上げる。
# 古い版は残さない（毎回1つのコミットで上書き）。大きさが増え続けないように。
# 前提: .blend は Poly Pizza の鍵を空にして保存してある（scripts/island/blender/check_no_key.py で確かめる）
# 最新のファイルが変わったら、下の FILES を書き換える。
set -euo pipefail

SRC=/mnt/c/Users/nobu2/Documents/pukapuka_blender
WORK="$HOME/pukapuka-blender-backup"
REMOTE=https://github.com/Nobumasa494/pukapuka-blender.git
FILES=(
  pk_island_v6.blend              # 島（v6 の配置図。素材・空・海・言葉の植物の部品もこの中）
  pk_island_parts_v3.blend        # 島の部品の前の版（川の部品から作った植物）
  pk_river_v21b_far_ridges.blend  # 川
  pk_pool_v1.blend                # 拾ったことばの空
  pk_night_v1.blend               # 夜空
  river_path.json                 # 川の中心線（泡の流れ）
)

rm -rf "$WORK"
mkdir -p "$WORK"
cd "$WORK"
git init -q -b main
for f in "${FILES[@]}"; do
  cp "$SRC/$f" .
done
cat > README.md <<EOF
# pukapuka の Blender 作業ファイル

アプリ（Nobumasa494/pukapuka-app）の背景・島を作った Blender のファイルの、**最新だけ**の写し。
古い版は残さない（上げるたびに上書き）。元の置き場所はパソコンの \`C:\\Users\\nobu2\\Documents\\pukapuka_blender\`。
作り方の手順は、アプリのリポジトリの \`scripts/island/blender/\` とスキル（\`/pukapuka-island\`・\`/pukapuka-blender\`）。

上げた日: $(date '+%Y-%m-%d %H:%M')

| ファイル | 中身 |
|---|---|
$(for f in "${FILES[@]}"; do printf '| %s | %s KB |\n' "$f" "$(( $(stat -c %s "$f") / 1024 ))"; done)
EOF
git add -A
git -c user.name="$(git -C /home/Nobumasa494/pukapuka-app config user.name)" \
    -c user.email="$(git -C /home/Nobumasa494/pukapuka-app config user.email)" \
    commit -q -m "Latest Blender files ($(date '+%Y-%m-%d'))"
git push -q --force "$REMOTE" main
echo "backup done: $(du -sh . | cut -f1)"
