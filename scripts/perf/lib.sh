#!/bin/bash
# スマホ（Galaxy S20・1080×2400）をこちらから操作する共通の道具。PHONE=IP:ポート を付けて使う
# 座標は S20 の画素。ほかのスマホでは撮って直す
A="$HOME/.local/android/platform-tools/adb -s ${PHONE:?PHONE=IP:ポート を指定}"
OUT=${OUT:-/tmp/pukapuka-perf}; mkdir -p "$OUT"
PKG=host.exp.exponent

# ユーザーが別のアプリを使っているときは、操作しない
need_expo() { $A shell dumpsys window | grep mCurrentFocus | grep -q $PKG || { echo "Expo Go が前面にないので止める"; exit 1; }; }
shot() { $A exec-out screencap -p > "$OUT/$1.png"; }
tap() { $A shell input tap "$1" "$2"; }

# 読み込み直し（R を2回）→ 水辺の空（上のほうの色）が出るまで待つ。上限60秒
reload() {
  need_expo
  $A shell input keyevent 46 46
  for i in $(seq 1 30); do
    sleep 2; shot _w
    c=$(ffmpeg -loglevel error -i "$OUT/_w.png" -vf "crop=1:1:540:400" -f rawvideo -pix_fmt rgb24 - | od -An -tu1 | tr -s ' ')
    set -- $c; [ "${3:-255}" -lt 250 ] && { sleep 3; return 0; }
  done
  echo "読み込みが60秒で終わらない"; return 1
}

# 画面の移り変わり（待ち時間は動画の長さ＋余裕）
moon()        { tap 990 250; sleep 1.2; }            # 水辺の右上の月と星（夕空・星空が出る）
river_cloud() { moon; tap 968 395; sleep 4; }        # 水辺 → 夕空（動画2秒）
river_night() { moon; tap 968 520; sleep 3; }        # 水辺 → 星空（ふわっと0.9秒）
cloud_river() { tap 130 280; sleep 4; }              # 夕空「← 水辺へ」（動画2秒）
cloud_night() { tap 930 280; sleep 5; }              # 夕空「星空へ →」（動画3秒）
night_cloud() { tap 130 280; sleep 5; }              # 星空「← 夕空へ」（動画3秒）
night_river() { tap 540 2208; sleep 3; }             # 星空「水辺へ戻る」（0.9秒）

# 今の画面で N 秒：遅れたコマの割合・CPU・温度・メモリ
measure() {
  local name=$1 secs=${2:-10}
  $A shell dumpsys gfxinfo $PKG reset >/dev/null
  # CPU は1回の top だとぶれが大きい（同じ画面で 137〜170%）。2秒ごとに取って平均する
  local samples=() n=$(( secs / 2 ))
  for i in $(seq 1 "$n"); do
    sleep 2
    samples+=("$($A shell top -b -n 1 -d 1 | grep $PKG | awk '{print $9}' | head -1)")
  done
  local g; g=$($A shell dumpsys gfxinfo $PKG)
  local total jank
  total=$(echo "$g" | grep -m1 'Total frames rendered' | awk '{print $NF}')
  jank=$(echo "$g" | grep -m1 'Janky frames' | sed 's/.*(\(.*\))/\1/')
  local cpu temp mem
  cpu=$(printf '%s\n' "${samples[@]}" | awk '{s+=$1; n++} END {if (n) printf "%.0f", s/n}')
  temp=$($A shell dumpsys battery | grep temperature | awk '{print $2/10}')
  mem=$($A shell dumpsys meminfo $PKG | grep -m1 'TOTAL PSS' | awk '{print int($3/1024)}')
  printf "%-14s コマ %5s  遅れ %6s  CPU %5s%%  温度 %4s℃  メモリ %4sMB\n" "$name" "$total" "$jank" "$cpu" "$temp" "$mem"
}
