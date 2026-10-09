#!/bin/bash
# 見本（多め）が開いているか（下のヒントが「星に触れて…」の短い文か）を、下の文の横幅で見分け、開いていなければ押す
A="$HOME/.local/android/platform-tools/adb -s ${PHONE:?PHONE=IP:ポート を指定}"; D=${OUT:-/tmp/pukapuka-phone}; mkdir -p $D
for i in 1 2 3 4; do
  $A exec-out screencap -p > $D/e.png
  # 見本のときは「← ことばへ」の文字が消える（明るい画素が0。ふだんは約700）
  n=$(ffmpeg -loglevel error -i $D/e.png -vf "crop=110:40:150:262,format=gray" -f rawvideo - | od -An -tu1 -v | tr -s ' ' '\n' | awk '$1>150' | wc -l)
  [ "$n" -lt 50 ] && { echo "見本 OK"; exit 0; }
  $A shell input tap 876 382; sleep 3
done
echo "見本が開かない"; exit 1
