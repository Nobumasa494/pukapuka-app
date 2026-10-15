#!/usr/bin/env python3
# 録画の全部のコマから、緑っぽいコマ（動画の絵がまだない画面。Android）を探す。使い方: green.py 録画.mp4
import subprocess, sys
v = sys.argv[1]
times = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', v], capture_output=True, text=True).stdout.split()
raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', v, '-fps_mode', 'passthrough', '-vf', 'scale=27:60', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
n = 27 * 60 * 3
bad = []
for i, t in enumerate(times):
    px = raw[i * n:(i + 1) * n]
    if len(px) < n: break
    r = sum(px[0::3]) / (n / 3); g = sum(px[1::3]) / (n / 3); b = sum(px[2::3]) / (n / 3)
    if g - (r + b) / 2 > 25: bad.append((round(float(t), 2), round(r), round(g), round(b)))
print(f'緑っぽいコマ {len(bad)} / {len(times)}', bad[:8])
