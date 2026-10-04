"""pukapuka の音を作り直して assets/sounds に書き出す。

  pip install numpy scipy   （ffmpeg も必要）
  python3 scripts/music/build.py

1. compose.py で曲（river / cloud / night）と拾ったときの音（chime_0〜4）を wav で作る
2. ループの曲は長さを 1024 サンプルの倍数にそろえる（AAC は 1024 サンプルずつ書くので、
   半端な長さだと終わりに無音が足され、ループのつなぎ目で途切れる。FFT で周期として伸ばすので
   つなぎ目は保たれ、速さの差は 0.06% 以下で聞き分けられない）
3. 曲は3つとも -20 LUFS にそろえ（切り替えで音量が跳ねない）、AAC（m4a）にする
4. ループの曲は、前後に自分の終わり・頭を CONTEXT サンプルずつ足してから AAC にし、MP4 の編集リスト（elst）で
   「頭の CONTEXT と AAC の前置きを飛ばし、ちょうど n サンプル鳴らす」と書く。AAC は前の区切りと重ねて音を作るので、
   何もない所から始まる頭の 1024 サンプルが崩れる（夜の曲で誤差が真ん中の 8 倍）。前後に続きを置けば頭も終わりも正しく作られる。
   編集リストはサンプル単位で書けるよう、映像全体の時間の単位（movie timescale）を 44100 にする。
   iPhone（AVQueuePlayer で同じ曲を並べてループ）も Android（ExoPlayer）も編集リストを使って継ぎ目なく鳴らす
5. ユーザーが聴いて決めた音の「指紋」（approved.json）と比べ、変わっていたら知らせる。
   曲を変えてユーザーが聴いて OK したら `uv run build.py --approve` で指紋を書き直す
"""
import os
import re
import subprocess
import sys
import tempfile

import hashlib
import json
import struct

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


CONTEXT = 2048
APPROVED = os.path.join(HERE, 'approved.json')


def fingerprint(x):
    """合成した音（書き出す前）の指紋: ビットまで同じかを見るハッシュと、0.5秒ごとの音量（環境による小数のわずかな差を見分ける）"""
    q = (np.clip(x, -1, 1).T * 32767).astype(np.int16)
    w = compose.SR // 2
    m = q.shape[0] // w * w
    env = np.sqrt((q[:m].astype(float) / 32767) ** 2).reshape(-1, w, q.shape[1]).mean(axis=(1, 2))
    return {'sha256': hashlib.sha256(q.tobytes()).hexdigest(), 'samples': int(q.shape[0]), 'level': [round(float(v), 4) for v in env]}


def compare(name, fp, approved):
    """ユーザーが決めた音と比べる。同じ／環境の差くらい／違う"""
    ref = approved.get(name)
    if ref is None:
        return 'まだ決めていない音'
    if ref['sha256'] == fp['sha256']:
        return '決めた音とビットまで同じ'
    if ref['samples'] == fp['samples'] and np.abs(np.array(ref['level']) - np.array(fp['level'])).max() < 0.002:
        return '決めた音とほぼ同じ（計算環境による小数の差。聴いて分かる差ではない）'
    return '!! 決めた音と違う（曲を変えたなら、ユーザーに聴いてもらってから --approve）'


def boxes(buf, off, end):
    while off < end:
        size, typ = struct.unpack('>I4s', buf[off:off + 8])
        yield off, size, typ.decode('latin1')
        off += size


def find(buf, path, off=0, end=None):
    """moov/trak/edts/elst のような道で箱を探し、(位置, 大きさ) を返す"""
    end = len(buf) if end is None else end
    for o, size, typ in boxes(buf, off, end):
        if typ == path[0]:
            return (o, size) if len(path) == 1 else find(buf, path[1:], o + 8, o + size)
    raise ValueError(f'{path} が見つからない')


def set_loop_edit(path, n, skip):
    """編集リストを「頭から skip サンプル飛ばして n サンプル鳴らす」に書き換える（時間の単位はどちらも 44100）"""
    buf = bytearray(open(path, 'rb').read())
    o, _ = find(buf, ['moov', 'mvhd'])
    assert buf[o + 8] == 0 and struct.unpack('>I', buf[o + 20:o + 24])[0] == compose.SR, 'mvhd の単位が 44100 でない'
    struct.pack_into('>I', buf, o + 24, n)
    o, _ = find(buf, ['moov', 'trak', 'tkhd'])
    assert buf[o + 8] == 0
    struct.pack_into('>I', buf, o + 28, n)
    o, _ = find(buf, ['moov', 'trak', 'edts', 'elst'])
    assert buf[o + 8] == 0 and struct.unpack('>I', buf[o + 12:o + 16])[0] == 1, '編集リストが1件でない'
    priming = struct.unpack('>i', buf[o + 20:o + 24])[0]
    struct.pack_into('>Ii', buf, o + 16, n, priming + skip)
    open(path, 'wb').write(buf)


def encode_loop(y, out, gain, tmp):
    """ループの曲を、頭も終わりも崩れない m4a にする。y はループ1回分（チャンネル×サンプル）"""
    n = y.shape[1]
    padded = np.concatenate([y[:, -CONTEXT:], y, y[:, :CONTEXT]], axis=1) * 10 ** (gain / 20)
    wav = os.path.join(tmp, 'padded.wav')
    wavfile.write(wav, compose.SR, (np.clip(padded, -1, 1).T * 32767).astype(np.int16))
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-c:a', 'aac', '-b:a', '112k',
                    '-movie_timescale', str(compose.SR), out], check=True)
    set_loop_edit(out, n, CONTEXT)
    # 確かめる: デコードした長さがちょうど n で、頭と終わりの誤差が真ん中と同じくらいか
    dec = os.path.join(tmp, 'dec.wav')
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', out, dec], check=True)
    d = wavfile.read(dec)[1].astype(float) / 32768
    ref = (y * 10 ** (gain / 20)).T
    assert len(d) == n, f'デコードした長さ {len(d)} が {n} でない'
    err = np.abs(d - ref).max(axis=1)
    head, tail, mid = err[:2048].max(), err[-2048:].max(), np.percentile(err, 99.9)
    assert head < 2 * mid and tail < 2 * mid, f'頭 {head:.4f}・終わり {tail:.4f} の誤差が真ん中 {mid:.4f} より大きい'
    return head, tail, mid


def main():
    approve = '--approve' in sys.argv
    approved = json.load(open(APPROVED, encoding='utf-8')) if os.path.exists(APPROVED) else {}
    prints = {}
    with tempfile.TemporaryDirectory() as tmp:
        for name, fn in (('river', compose.version_river), ('cloud', compose.version_cloud), ('night', compose.version_night)):
            x = fn()
            prints[name] = fingerprint(x)
            n = int(np.ceil(x.shape[1] / 1024) * 1024)
            y = resample(x, n, axis=1)
            wav = os.path.join(tmp, f'{name}.wav')
            wavfile.write(wav, compose.SR, (np.clip(y, -1, 1).T * 32767).astype(np.int16))
            gain = -20 - loudness(wav)
            head, tail, mid = encode_loop(y, os.path.join(OUT, f'bgm_{name}.m4a'), gain, tmp)
            print(f'bgm_{name}.m4a  {n / compose.SR:.1f}s  gain {gain:+.1f}dB  AAC の誤差 頭 {head:.4f} / 終わり {tail:.4f} / 真ん中 {mid:.4f}'
                  f'  {compare(name, prints[name], approved)}')
        compose.chimes(tmp)
        for i in range(5):
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', os.path.join(tmp, f'chime_{i}.wav'),
                            '-c:a', 'aac', '-b:a', '96k', os.path.join(OUT, f'chime_{i}.m4a')], check=True)
        for i in range(5):
            x = wavfile.read(os.path.join(tmp, f'chime_{i}.wav'))[1].T.astype(float) / 32767
            prints[f'chime_{i}'] = fingerprint(x)
        results = {compare(f'chime_{i}', prints[f'chime_{i}'], approved) for i in range(5)}
        print('chime_0..4.m4a  ' + ' / '.join(sorted(results)))
    if approve:
        json.dump(prints, open(APPROVED, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print('approved.json を今の音で書き直した（ユーザーが聴いて決めた音として記録）')


if __name__ == '__main__':
    main()
