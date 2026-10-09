#!/bin/bash
# 夜空で10秒：遅れたコマの割合・CPU・温度。そのあと星（散歩）を押して0.8秒後のヒントを撮る（$1=名前）
A="$HOME/.local/android/platform-tools/adb -s ${PHONE:?PHONE=IP:ポート を指定}"; D=${OUT:-/tmp/pukapuka-phone}; mkdir -p $D
$A shell dumpsys gfxinfo host.exp.exponent reset >/dev/null; sleep 10
echo "$1: $($A shell dumpsys gfxinfo host.exp.exponent | grep -E 'Total frames|Janky frames' | head -2 | tr -s ' ' | tr '\n' ' ')"
echo "  CPU: $($A shell top -b -n 1 | grep exponent | awk '{print $9}')%  温度: $($A shell dumpsys battery | grep temperature | awk '{print $2}')"
$A shell input tap 506 1074; sleep 0.8; $A exec-out screencap -p > $D/t.png
ffmpeg -loglevel error -y -i $D/t.png -vf "crop=1080:70:0:2075,scale=540:-1" $D/tap_$1.png
$A shell input tap 506 1074; sleep 0.5
