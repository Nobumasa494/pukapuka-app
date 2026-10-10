#!/bin/bash
# 画面ごとの重さを測る：水辺・夕空・星空に、それぞれ N 秒いて、遅れたコマ・CPU・温度・メモリを出す
# 使い方: PHONE=IP:ポート scripts/perf/measure.sh [秒数=10]
. "$(dirname "$0")/lib.sh"
S=${1:-10}
reload || exit 1
measure 水辺 "$S"
river_cloud; measure 夕空 "$S"
cloud_night; measure 星空 "$S"
night_river; measure 水辺（戻り） "$S"
