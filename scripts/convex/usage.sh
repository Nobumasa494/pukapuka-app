#!/bin/bash
# Convex の関数ごとの読み書きの量（/pukapuka-convex の 2.）。開発用（dev）の最近の記録から集計する
# 使い方: scripts/convex/usage.sh [直近の分数（ふつう60）] [記録の数（ふつう1000）]
cd "$(dirname "$0")/../.."
MIN=${1:-60}; N=${2:-1000}
F=$(mktemp)
# convex logs は終わらずに待ち続けるので、時間で切る
timeout 30 npx convex logs --history "$N" --success --jsonl > "$F" 2>/dev/null
python3 - "$F" "$MIN" <<'PY'
import json, sys, time, collections
f, mins = sys.argv[1], float(sys.argv[2])
since = time.time() - mins * 60
agg = collections.defaultdict(lambda: [0, 0, 0])
first = None
for l in open(f):
    try: d = json.loads(l)
    except Exception: continue
    if d.get('kind') != 'Completion' or d['timestamp'] < since: continue
    first = min(first or d['timestamp'], d['timestamp'])
    u = d.get('usageStats') or {}
    a = agg[d['identifier']]; a[0] += 1; a[1] += u.get('databaseIoReadBytes', 0); a[2] += u.get('databaseIoWriteBytes', 0)
if not agg:
    print('記録なし'); sys.exit()
span = (time.time() - first) / 60
R = sum(a[1] for a in agg.values()); W = sum(a[2] for a in agg.values())
print(f'直近 約{span:.0f}分：読み {R/1e6:.1f}MB・書き {W/1e6:.1f}MB（このペースだと1日 {(R+W)/1e6/span*60*24:.0f}MB。無料枠は月1GB＝1日 約33MB）')
print(f'{"関数":26s} {"回数":>4s} {"1回の読み":>9s} {"1回の書き":>9s} {"読み合計":>8s}')
for k, (n, r, w) in sorted(agg.items(), key=lambda x: -(x[1][1] + x[1][2])):
    print(f'{k:26s} {n:4d} {r/n/1e3:8.1f}KB {w/n/1e3:8.1f}KB {r/1e6:7.1f}MB')
PY
rm -f "$F"
