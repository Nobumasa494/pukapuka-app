"""pukapuka の音を作り直して assets/sounds に書き出す。

  pip install numpy scipy   （ffmpeg も必要）
  python3 scripts/music/build.py

1. compose.py で曲（river / cloud / night）と拾ったときの音（chime_0〜4）を wav で作る
2. ループの曲は長さを 1024 サンプルの倍数にそろえる（AAC は 1024 サンプルずつ書くので、
   半端な長さだと終わりに無音が足され、ループのつなぎ目で途切れる。FFT で周期として伸ばすので
   つなぎ目は保たれ、速さの差は 0.06% 以下で聞き分けられない）
3. 曲は3つとも -20 LUFS にそろえ（切り替えで音量が跳ねない）、AAC（m4a）にする
"""
import os
import re
import subprocess
import sys
import tempfile

import numpy as np
from scipy.io import wavfile
from scipy.signal import resample

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'assets', 'sounds')
sys.path.insert(0, HERE)
import compose  # noqa: E402


def loudness(path):
    log = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    return float(re.findall(r'I:\s+(-?[0-9.]+) LUFS', log)[-1])


def main():
    with tempfile.TemporaryDirectory() as tmp:
        for name, fn in (('river', compose.version_river), ('cloud', compose.version_cloud), ('night', compose.version_night)):
            x = fn()
            n = int(np.ceil(x.shape[1] / 1024) * 1024)
            y = resample(x, n, axis=1)
            wav = os.path.join(tmp, f'{name}.wav')
            wavfile.write(wav, compose.SR, (np.clip(y, -1, 1).T * 32767).astype(np.int16))
            gain = -20 - loudness(wav)
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-af', f'volume={gain:.2f}dB',
                            '-c:a', 'aac', '-b:a', '112k', os.path.join(OUT, f'bgm_{name}.m4a')], check=True)
            print(f'bgm_{name}.m4a  {n / compose.SR:.1f}s  gain {gain:+.1f}dB')
        compose.chimes(tmp)
        for i in range(5):
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', os.path.join(tmp, f'chime_{i}.wav'),
                            '-c:a', 'aac', '-b:a', '96k', os.path.join(OUT, f'chime_{i}.m4a')], check=True)
        print('chime_0..4.m4a')


if __name__ == '__main__':
    main()
