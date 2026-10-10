#!/bin/bash
# 画面の移り変わりを何周も自動でくり返し、止まる・黒くなる・アプリが落ちる・エラーが出る、を探す
# 使い方: PHONE=IP:ポート scripts/perf/transitions.sh [周数=5]
# 1周：水辺 → 夕空 → 星空 → 夕空 → 水辺 → 星空 → 水辺。各画面で撮り、真っ黒・真っ白なら知らせる
. "$(dirname "$0")/lib.sh"
N=${1:-5}
reload || exit 1
$A logcat -c
check() {
  need_expo
  shot "t_$1"
  local m; m=$(ffmpeg -loglevel error -i "$OUT/t_$1.png" -vf "scale=1:1" -f rawvideo -pix_fmt gray - | od -An -tu1 | tr -d ' ')
  if [ "$m" -lt 8 ] || [ "$m" -gt 245 ]; then echo "  ⚠ $1：画面が真っ黒か真っ白（明るさ $m）"; fi
}
start=$(date +%s)
for r in $(seq 1 "$N"); do
  river_cloud; check "${r}_cloud"
  cloud_night; check "${r}_night"
  night_cloud; check "${r}_cloud2"
  cloud_river; check "${r}_river"
  river_night; check "${r}_night2"
  night_river; check "${r}_river2"
  echo "周 $r おわり（$(( $(date +%s) - start ))秒）"
done
echo "--- エラーの記録 ---"
$A logcat -d | grep -iE "ReactNativeJS.*(error|warn)|FATAL|ANR" | tail -20
measure 最後の水辺 10
