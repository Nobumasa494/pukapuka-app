#!/usr/bin/env python3
# 画面の録画（指の印つき）から、ボタンを押したあと ①画面が変わったか ②変わるまでの時間 ③画面が止まった時間 を出す
# 使い方: latency.py 録画.mp4 押したx 押したy 変わる所x 変わる所y 幅 高さ
# 指の印（show_touches）が出たコマ＝押した時刻。印は出ないこともある（2026-10-14「星空へ」で一度も出なかった）。そのときは時間は出さない
# 録画は画面が変わったときだけコマができる。コマとコマの間があいた＝その間、画面が止まっていた
import subprocess, sys

def frames(video, x, y, w, h):
    """切り出した所の、各コマの時刻と画素（白黒・小さくしたもの）"""
    sw, sh = max(4, w // 4), max(4, h // 4)
    times = subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', video],
        capture_output=True, text=True).stdout.split()
    raw = subprocess.run(
        ['ffmpeg', '-loglevel', 'error', '-i', video, '-fps_mode', 'passthrough',
         '-vf', f'crop={w}:{h}:{x}:{y},scale={sw}:{sh},format=gray', '-f', 'rawvideo', '-'],
        capture_output=True).stdout
    n = sw * sh
    return [(float(t), raw[i * n:(i + 1) * n]) for i, t in enumerate(times) if (i + 1) * n <= len(raw)]

def diff(a, b):
    return sum(abs(x - y) for x, y in zip(a, b)) / len(a)

def main():
    video, tx, ty, cx, cy, cw, ch = sys.argv[1], *map(int, sys.argv[2:8])
    START = 1.0  # 録画を始めてから押すまで、少なくともこれだけ待っている（check.sh の sleep）
    cf = frames(video, cx, cy, cw, ch)
    base = max((f for f in cf if f[0] <= START), key=lambda f: f[0])[1]
    react = next((t for t, px in cf if t > START and diff(px, base) > 6), None)
    if react is None:
        print(f'✗ 押せない（{round(cf[-1][0] - START, 1)}秒のあいだ画面が変わらない）'); return
    # 指の印：前のコマから急に変わったコマ（ゆっくり光る言葉とまちがえないよう、前のコマと比べる）
    tf = frames(video, max(0, tx - 30), max(0, ty - 30), 60, 60)
    k = next((i for i in range(1, len(tf)) if tf[i][0] > START and diff(tf[i][1], tf[i - 1][1]) > 8), None)
    pressed = tf[k - 1][0] if k is not None and tf[k][0] <= react + 0.02 else None
    # 押した前後（印の0.1秒前〜変わり始めて0.5秒）で、いちばん長くコマがあいた時間
    t0 = (pressed if pressed is not None else react) - 0.1
    ts = [t for t, _ in cf if t0 <= t <= react + 0.5]
    stall = round(max((b - a for a, b in zip(ts, ts[1:])), default=0) * 1000)
    out = '○ 押せた'
    if pressed is not None:
        out += f'  変わるまで {round((react - pressed) * 1000)}ms 以内'
    out += f'  いちばん長く止まった {stall}ms'
    print(out)

main()
