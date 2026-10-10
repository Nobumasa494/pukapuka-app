#!/bin/bash
# 読み込み直し（R を2回）→ 川が出るのを待つ → 夜空 →（$1=sample で「見本を見る」）
A="$HOME/.local/android/platform-tools/adb -s ${PHONE:?PHONE=IP:ポート を指定}"; D=${OUT:-/tmp/pukapuka-phone}; mkdir -p $D
# ユーザーが別のアプリを使っているときは、操作しない
if ! $A shell dumpsys window | grep mCurrentFocus | grep -q host.exp.exponent; then echo "スマホで Expo Go が開いていないので、操作しない"; exit 1; fi
$A shell input keyevent 46 46
# 読み込み中は白い画面。川の空（上のほうの色）が出たら進む。上限60秒
for i in $(seq 1 30); do
  sleep 2
  $A exec-out screencap -p > $D/w.png
  c=$(ffmpeg -loglevel error -i $D/w.png -vf "crop=1:1:540:400" -f rawvideo -pix_fmt rgb24 - | od -An -tu1 | tr -s ' ')
  set -- $c; [ "${3:-255}" -lt 250 ] && break
done
sleep 3
$A shell input tap 938 276; sleep 11
$A shell input tap 936 278; sleep 12
[ "$1" = "sample" ] && { $A shell input tap 540 1360; sleep 3; }   # 見本を見る（星が出ないときだけある）
echo "ready（$((i*2))秒で読み込み）"
