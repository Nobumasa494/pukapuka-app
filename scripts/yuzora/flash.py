#!/usr/bin/env python3
# 録画から「一瞬だけ違う絵」が出たコマを探す（前後のコマとは似ているのに、そのコマだけ大きく違う）。使い方: flash.py 録画.mp4 [出力フォルダ]
import subprocess, sys, os
v = sys.argv[1]; out = sys.argv[2] if len(sys.argv) > 2 else None
W, H = 27, 60
times = [float(t) for t in subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', v], capture_output=True, text=True).stdout.split()]
raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', v, '-fps_mode', 'passthrough', '-vf', f'scale={W}:{H}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
n = W * H * 3
fr = [raw[i * n:(i + 1) * n] for i in range(len(times)) if (i + 1) * n <= len(raw)]
d = lambda a, b: sum(abs(x - y) for x, y in zip(a, b)) / n
hits = []
for i in range(1, len(fr) - 1):
    # 前後はほぼ同じ（動画が少し進んだだけ）なのに、そのコマだけ大きく違う＝一瞬の別の絵
    w = 1
    while i + w < len(fr) and w <= 6 and d(fr[i + w], fr[i - 1]) > 12: w += 1
    if i + w < len(fr) and d(fr[i], fr[i - 1]) > 18 and d(fr[i + w], fr[i - 1]) < 8 and times[i + w] - times[i] < 0.2:
        hits.append((round(times[i], 2), round(d(fr[i], fr[i - 1]), 1), w))
print('一瞬の別の絵:', len(hits), hits[:10])
if out and hits:
    os.makedirs(out, exist_ok=True)
    for t, _, _ in hits[:4]:
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', str(max(0, t - 0.05)), '-i', v, '-frames:v', '3', '-vf', 'scale=160:-1,tile=3x1', f'{out}/flash_{t}.png'])
