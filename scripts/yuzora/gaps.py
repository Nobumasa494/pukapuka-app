#!/usr/bin/env python3
# 録画のコマの間隔から、カクつき（コマが飛んだ回数）を数える。使い方: gaps.py 録画.mp4 [始め秒] [終わり秒]
# 録画は画面が変わったときだけコマができる。なぞって画面が動いている間に 33ms 以上あいた＝1コマ以上飛んだ（カクッと見える）
import subprocess, sys
v = sys.argv[1]; a = float(sys.argv[2]) if len(sys.argv) > 2 else 0; b = float(sys.argv[3]) if len(sys.argv) > 3 else 1e9
ts = [float(t) for t in subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', v], capture_output=True, text=True).stdout.split()]
ts = [t for t in ts if a <= t <= b]
g = [round((y - x) * 1000) for x, y in zip(ts, ts[1:])]
big = [x for x in g if x >= 33]
print(f'コマ {len(ts)}  飛んだ(33ms以上) {len(big)}回  いちばん長い {max(g) if g else 0}ms  1秒あたり {round(len(ts) / max(0.01, ts[-1] - ts[0])) if len(ts) > 1 else 0}コマ')
