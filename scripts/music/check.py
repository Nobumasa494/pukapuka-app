"""assets/sounds の曲と効果音を数値で確かめる（Claude は音を聴けないので、聴く前に必ずこれを通す）。

  cd scripts/music && uv run check.py            # assets/sounds をすべて
  cd scripts/music && uv run check.py a.wav b.m4a  # 指定したファイルだけ

見るもの:
  peak       音割れしないか（0.99 以上は NG）
  LUFS       曲は -20 にそろえる（切り替えで音量が跳ねない）
  1秒ごと    途中で音が消えたり急に大きくなったりしないか（最小と最大の dB）
  帯域       <100Hz / 100-400 / 400-1.5k / >1.5k の割合。低音が多すぎる＝こもる、少なすぎる＝薄い
  1024倍数   ループの曲は長さが 1024 サンプルの倍数か（AAC で終わりに無音が足されない）
  つなぎ目   最後→最初の段差を、普段の段差（99パーセンタイル）と比べる。大きければ、
             音の鳴り始め（ほかの小節の頭と同じくらいか）か、ノイズの層がループになっていないか
  雰囲気     明るさ（音の重心の高さ）・拍の速さ・拍のはっきりさ。3曲がこの3つで十分に離れているか
             （2026-10-04、3曲とも 700〜860Hz・44〜63 BPM で「同じ曲に聞こえる」と言われた）
"""
import glob
import os
import re
import subprocess
import sys
import tempfile

import numpy as np
from scipy.io import wavfile
from scipy.signal import stft

SOUNDS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'sounds')


def decode(path, tmp):
    out = os.path.join(tmp, os.path.basename(path) + '.wav')
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', path, '-ar', '44100', out], check=True)
    sr, x = wavfile.read(out)
    x = x.astype(float) / 32768
    return sr, x if x.ndim == 2 else x[:, None]


def lufs(path):
    log = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    found = re.findall(r'I:\s+(-?[0-9.]+) LUFS', log)
    return float(found[-1]) if found else float('nan')


def mood(x, sr):
    """明るさ（Hz）・拍の速さ（BPM）・拍のはっきりさ（0〜1）"""
    f, _, z = stft(x.mean(axis=1), sr, nperseg=2048, noverlap=1536)
    s = np.abs(z)
    brightness = np.median((f[:, None] * s).sum(0) / (s.sum(0) + 1e-12))
    flux = np.maximum(0, np.diff(s[f > 150], axis=1)).sum(0)
    flux = flux - flux.mean()
    ac = np.correlate(flux, flux, 'full')[len(flux) - 1:]
    lags = np.arange(len(ac)) * 512 / sr
    ok = (lags > 60 / 180) & (lags < 60 / 40)
    return brightness, 60 / lags[ok][np.argmax(ac[ok])], ac[ok].max() / ac[0]


def check(path, tmp):
    sr, x = decode(path, tmp)
    name = os.path.basename(path)
    peak = np.abs(x).max()
    n = len(x) // sr * sr
    sec = np.sqrt((x[:n].reshape(-1, sr, x.shape[1]) ** 2).mean(axis=(1, 2))) if n else np.array([np.nan])
    spec = np.abs(np.fft.rfft(x.mean(axis=1))) ** 2
    f = np.fft.rfftfreq(len(x), 1 / sr)
    band = lambda lo, hi: 100 * spec[(f >= lo) & (f < hi)].sum() / spec.sum()
    line = (f'{name:18s} {len(x) / sr:5.1f}s  peak {peak:.2f}{" ←音割れ" if peak >= 0.99 else ""}  '
            f'{lufs(path):6.1f} LUFS  1秒ごと {20 * np.log10(sec.min() + 1e-12):6.1f}/{20 * np.log10(sec.max() + 1e-12):6.1f}dB  '
            f'帯域 <100 {band(0, 100):3.0f}% / 100-400 {band(100, 400):3.0f}% / 400-1.5k {band(400, 1500):3.0f}% / >1.5k {band(1500, sr / 2):4.1f}%')
    if name.startswith('bgm_'):
        step = np.abs(x[0] - x[-1]).max()
        typ = np.percentile(np.abs(np.diff(x, axis=0)).max(axis=1), 99)
        b, bpm, beat = mood(x, sr)
        line += (f'\n{"":18s} 1024倍数 {"OK" if len(x) % 1024 == 0 else "NG"}  '
                 f'つなぎ目の段差 {step:.4f}（普段 {typ:.4f}{" ←大きい" if step > typ else ""}）  '
                 f'雰囲気: 明るさ {b:.0f}Hz・拍 {bpm:.0f} BPM・拍のはっきりさ {beat:.2f}')
    print(line)


def main():
    files = sys.argv[1:] or sorted(glob.glob(os.path.join(SOUNDS, '*.m4a')))
    with tempfile.TemporaryDirectory() as tmp:
        for p in files:
            check(p, tmp)


if __name__ == '__main__':
    main()
