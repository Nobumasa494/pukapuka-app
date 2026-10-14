#!/bin/bash
# 夕空の健康診断（/pukapuka-yuzora の 2.）。PHONE=IP:ポート を付けて、夕空を開いた状態で動かす
#   ①ボタンが押せるか・押してから画面が変わるまで（ms）②なぞる・拡大してなぞるのカクつき ③じっとしているときの CPU ④注意・エラーの数
# 座標は Galaxy S20（1080×2400）。結果は1行ずつ出す。最後の「まとめ」をスキルの記録の表に写す
cd "$(dirname "$0")"
OUT=${OUT:-/tmp/pukapuka-yuzora}
source ../perf/lib.sh
need_expo
$A logcat -c
$A shell settings put system show_touches 1   # 録画に指の印を出す（押した時刻を知るため）。最後に戻す
trap '$A shell settings put system show_touches 0' EXIT

# 押して、録画から反応までの時間を出す。$1=名前 $2,$3=押す所 $4..$7=変わるはずの所(x y 幅 高さ) $8=待つ秒 $9=swipe なら下へ300なぞる
press() {
  $A shell "screenrecord --time-limit ${8:-5} --size 540x1200 /sdcard/yz.mp4" &
  sleep 1.2
  if [ "$9" = swipe ]; then $A shell input swipe "$2" "$3" "$2" $(( $3 + 300 )) 500; else $A shell input swipe "$2" "$3" "$2" "$3" "${HOLD:-120}"; fi; wait  # 本物の指のように、おいて離すまで HOLD ミリ秒（ふつう約120）
  $A pull -q /sdcard/yz.mp4 "$OUT/$1.mp4" >/dev/null
  # 録画は半分の大きさなので、座標も半分にする
  local r; r=$(python3 latency.py "$OUT/$1.mp4" $(( $2/2 )) $(( $3/2 )) $(( $4/2 )) $(( $5/2 )) $(( $6/2 )) $(( $7/2 )))
  printf "  %-12s %s\n" "$1" "$r"
}

# カクつき：gfxinfo をまっさらにして、なぞる。遅れたコマの割合と、遅いほうから10%のコマの時間
jank() {
  $A shell dumpsys gfxinfo $PKG reset >/dev/null
  for i in 1 2 3; do
    $A shell input swipe 540 900 760 1150 400; $A shell input swipe 760 1150 400 800 400
  done
  local g; g=$($A shell dumpsys gfxinfo $PKG)
  printf "  %-12s 遅れ %s  90%%のコマ %s\n" "$1" "$(echo "$g" | grep -m1 'Janky frames' | sed 's/.*(\(.*\))/\1/')" "$(echo "$g" | grep -m1 '90th percentile' | awk '{print $NF}')"
}

cpu_idle() {
  local s=0
  for i in 1 2 3 4 5; do sleep 2; s=$(( s + $($A shell top -b -n 1 -d 1 | grep $PKG | awk '{print int($9)}' | head -1) )); done
  printf "  %-12s CPU %s%%\n" "$1" $(( s / 5 ))
}

TITLE="300 220 480 120"     # 見出し（夕空 ⇄ 夕空（見本））
MID="100 1250 880 300"      # 画面のまん中（ほかの画面へ移ると変わる）

echo "① ボタン（押してから変わるまで）"
# QUICK=1：見本の出し入れだけを3回（直す前と後を、速く比べるとき。約1分）
if [ "$QUICK" = 1 ]; then
  for i in 1 2 3; do press 見本を見る 765 2226 $TITLE; sleep 1; press × 100 274 $TITLE; sleep 1; done
  exit 0
fi
press 見本を見る 765 2226 $TITLE; sleep 1
press 1倍なぞり始め 250 700 620 300 400 900 4 swipe; sleep 1   # 拡大していないとき（ゴムのように少し動いて戻る）
jank 見本なぞる
$A shell "input tap 540 1000; input tap 540 1000"; sleep 1.5   # ダブルタップで2倍
press 2倍なぞり始め 250 700 620 300 400 900 4 swipe; sleep 1   # 指をおいてから、言葉が動きはじめるまで（指から離れた右側の言葉を見る）
jank 見本2倍なぞる
cpu_idle 見本2倍じっと
$A shell "input tap 540 1000; input tap 540 1000"; sleep 1.5   # 戻す
cpu_idle 見本じっと
press × 100 274 $TITLE; sleep 1
cpu_idle 夕空じっと
jank 夕空なぞる
press 星空へ 930 280 $MID 6; sleep 2
night_cloud
press 水辺へ 130 280 $MID 6
river_cloud

echo "④ 注意・エラー"
$A logcat -d | grep -E ' [WE] ReactNativeJS' | sed 's/.*ReactNativeJS: //' | cut -c1-100 | sort | uniq -c | sort -rn | head -5
$A logcat -d | grep -cE ' [WE] ReactNativeJS' | sed 's/^/  合計 /'
