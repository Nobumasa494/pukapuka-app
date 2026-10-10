#!/bin/bash
# 読み込み直しをせずに、画面を何周も行き来して、メモリが増え続けるかを見る（片づけ忘れ探し）
# 使い方: PHONE=IP:ポート scripts/perf/memgrow.sh [周数=10]
# 先に Expo Go を開き直しておく（開発用の読み込み直しでたまったメモリを、アプリのせいと取り違えないため）
. "$(dirname "$0")/lib.sh"
N=${1:-10}
mem() { $A shell dumpsys meminfo $PKG | grep -m1 'TOTAL PSS' | awk '{print int($3/1024)}'; }
need_expo
echo "はじめ $(mem)MB"
for r in $(seq 1 "$N"); do
  need_expo
  river_cloud; cloud_night; night_cloud; cloud_river; river_night; night_river
  echo "周 $r: $(mem)MB  温度 $($A shell dumpsys battery | grep temperature | awk '{print $2/10}')℃"
done
$A logcat -d -b crash | grep -c "Abort message" | sed 's/^/落ちた記録（今日ぜんぶ）: /'
