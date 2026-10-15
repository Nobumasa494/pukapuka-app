#!/bin/bash
# 移り変わりを録画して、0.25秒ごとのコマを並べた絵にする（/pukapuka-yuzora の 2.。数字の道具より先にこれで流れを見る）
# 使い方: PHONE=IP:ポート scripts/yuzora/frames.sh 名前 秒 '押す操作（lib.sh の関数）'
#   例: scripts/yuzora/frames.sh toCloud 7 'moon; tap 968 395'
cd "$(dirname "$0")"; OUT=${OUT:-/tmp/pukapuka-yuzora}; source ../perf/lib.sh
$A shell "screenrecord --time-limit ${2:-7} --size 540x1200 /sdcard/f.mp4" & sleep 1
eval "$3"; wait
$A pull -q /sdcard/f.mp4 "$OUT/$1.mp4"; rm -rf "$OUT/f_$1"; mkdir -p "$OUT/f_$1"
ffmpeg -loglevel error -i "$OUT/$1.mp4" -vf "fps=4,scale=90:-1" "$OUT/f_$1/%03d.png"
ffmpeg -loglevel error -y -pattern_type glob -i "$OUT/f_$1/*.png" -vf tile=14x2 "$OUT/$1.png"
echo "$OUT/$1.png（左上から0.25秒ずつ）"
