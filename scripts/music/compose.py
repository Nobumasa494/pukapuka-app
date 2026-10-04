"""pukapuka の曲と効果音。楽譜をデータで書き、楽器の音をコードで合成し、残響を付けてループにする（書き出しは build.py）。

画面ごとに別の曲（調だけ D メジャー／B マイナーにそろえる。docs/SPEC.md の「音」）:
  version_river: ことばの川（夕方）。試作 B「空」: まばらなピアノ＋ハープのアルペジオ＋弦のパッド＋水のさざめき
  version_cloud: 拾ったことば（ブルーアワー）。3拍子: オルゴール＋ハープのワルツ＋風
  version_night: ふりかえり（夜）。フェルトピアノのノクターン＋星のベル
  chimes:        泡を拾ったときの音（ラ シ レ ミ ファ#）
version_a は試作 A「森」（使っていないが、version_river が同じ乱数の順で作るために呼ぶ）
"""
import sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import fftconvolve, butter, sosfilt

SR = 44100
rng = np.random.default_rng(7)


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tvec(sec):
    return np.arange(int(sec * SR)) / SR


def attack(t, a=0.004):
    return np.clip(t / a, 0, 1)


# ---- 楽器 ----
def piano(f, dur, vel):
    t = tvec(min(dur + 3.0, 6.0))
    out = np.zeros_like(t)
    for n in range(1, 11):
        fn = f * n * np.sqrt(1 + 0.0004 * n * n)
        if fn > 9000:
            break
        a = vel ** (1 + 0.15 * n) / n ** 1.15
        t60 = 4.5 / (1 + 0.45 * (n - 1)) * (440 / f) ** 0.35
        for det in (-0.6, 0.6):  # 2本の弦のうなり
            out += 0.5 * a * np.sin(2 * np.pi * fn * (1 + det / 1731) * t + rng.uniform(0, 6.28)) * np.exp(-6.9 * t / t60)
    damp = np.where(t > dur, np.exp(-(t - dur) / 0.35), 1.0)
    return out * attack(t, 0.003) * damp


def kalimba(f, vel):
    t = tvec(2.8)
    out = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.9)
    out += 0.08 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.35)
    out += 0.28 * vel * np.sin(2 * np.pi * 5.93 * f * t) * np.exp(-t / 0.05)
    click = rng.normal(0, 1, len(t)) * np.exp(-t / 0.002) * 0.04 * vel
    return vel * (out * attack(t, 0.002)) + click


def marimba(f, vel):
    t = tvec(2.0)
    out = np.zeros_like(t)
    for r, a, d in ((1, 1, 0.55), (4.0, 0.3, 0.1), (9.9, 0.06, 0.03)):
        out += a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / d)
    return vel * out * attack(t, 0.003)


def harp(f, vel):
    t = tvec(3.5)
    out = np.zeros_like(t)
    p = 0.18  # はじく位置
    for n in range(1, 13):
        if f * n > 8000:
            break
        a = abs(np.sin(n * np.pi * p)) / n ** 1.6
        t60 = 3.2 / (1 + 0.3 * (n - 1))
        out += a * np.sin(2 * np.pi * f * n * t) * np.exp(-6.9 * t / t60)
    return vel * out * attack(t, 0.006)


def bell(f, vel):
    t = tvec(4.0)
    out = np.zeros_like(t)
    for r, a, d in ((1, 1, 2.2), (2.0, 0.35, 1.1), (3.0, 0.2, 0.7), (4.16, 0.1, 0.35), (5.43, 0.07, 0.25)):
        out += a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / d)
    return vel * out * attack(t, 0.002)


def pad(notes, dur, vel, bright=6, vib=False, atk=1.4, rel=2.2):
    t = tvec(dur + rel)
    out = np.zeros_like(t)
    for m in notes:
        f = mtof(m)
        for det in (-6, 0, 6):  # 少しずつずらして重ね、柔らかく広げる
            fd = f * 2 ** (det / 1200)
            ph = 2 * np.pi * fd * t
            if vib:
                ph += 0.0025 * fd / 5.2 * np.sin(2 * np.pi * 5.2 * t) * np.clip((t - 0.8) / 1.0, 0, 1)
            for n in range(1, bright + 1):
                out += np.sin(n * ph + rng.uniform(0, 6.28)) / n ** 1.7
    env = np.clip(t / atk, 0, 1) ** 2
    env *= np.where(t > dur, np.clip(1 - (t - dur) / rel, 0, 1) ** 2, 1.0)
    env *= 1 + 0.12 * np.sin(2 * np.pi * 0.11 * t + rng.uniform(0, 6.28))
    return vel * out * env / (len(notes) * 3)


def water(sec, level):
    """遠くの水のさざめき: 茶色がかったノイズを帯域で絞り、ゆっくり揺らす＋まばらな小さな水音"""
    n = int(sec * SR)
    x = np.cumsum(rng.normal(0, 1, n))
    x -= np.convolve(x, np.ones(2000) / 2000, mode='same')
    x = sosfilt(butter(2, [350, 2600], 'bandpass', fs=SR, output='sos'), x)
    x /= np.abs(x).max()
    t = np.arange(n) / SR
    lfo = 0.7 + 0.3 * np.sin(2 * np.pi * 0.07 * t) * np.sin(2 * np.pi * 0.23 * t + 1)
    out = x * lfo
    for _ in range(int(sec * 1.5)):
        s = rng.integers(0, n - SR)
        f0 = rng.uniform(900, 2200)
        tt = np.arange(int(0.05 * SR)) / SR
        drop = np.sin(2 * np.pi * (f0 * tt + f0 * 3 * tt * tt)) * np.exp(-tt / 0.012) * rng.uniform(0.1, 0.35)
        out[s:s + len(drop)] += drop
    return level * out


def seamless(x, n, fade=1.0):
    """ノイズ（風・水）を長さ n でつながるループにする。終わりの先の部分を頭に重ねてなめらかに入れ替える。
    ノイズは消えていかないので、音符のように「終わりの残響を頭へ回し込む」だけでは、つなぎ目で段差ができ、頭が二重になる"""
    k = int(fade * SR)
    out = x[:n].copy()
    r = np.linspace(0, 1, k)
    out[:k] = x[:k] * r + x[n:n + k] * (1 - r)
    return out


def reverb_ir(t60, t60_hi, predelay=0.025):
    """大きな部屋の響き（左右別のノイズを、高い音ほど早く消える形で減衰させる）"""
    t = tvec(t60 * 1.3)
    ir = []
    for _ in range(2):
        lo = sosfilt(butter(2, 2500, 'low', fs=SR, output='sos'), rng.normal(0, 1, len(t))) * np.exp(-6.9 * t / t60)
        hi = sosfilt(butter(2, 2500, 'high', fs=SR, output='sos'), rng.normal(0, 1, len(t))) * np.exp(-6.9 * t / t60_hi)
        r = np.concatenate([np.zeros(int(predelay * SR)), (lo + 0.5 * hi) * attack(t, 0.01)])
        ir.append(r / np.sqrt(np.sum(r ** 2)))
    return ir


# ---- 楽譜（D メジャー。王道進行から始まり、A7sus4 で頭に戻る）----
CHORDS = [  # (ベース, 和音の音)
    (43, [55, 59, 62, 66]),  # GM7
    (45, [57, 61, 64, 66]),  # A6
    (42, [54, 57, 61, 64]),  # F#m7
    (47, [59, 62, 66, 69]),  # Bm7
    (40, [55, 59, 62, 64]),  # Em7
    (42, [54, 57, 61, 64]),  # F#m7
    (43, [55, 59, 62, 66]),  # GM7
    (45, [55, 57, 62, 64]),  # A7sus4
]
# メロディ: D メジャーの五音音階（レ ミ ファ# ラ シ）。(小節, 拍, 音, 長さ)
MELODY = [
    (0, 0, 78, 1.5), (0, 1.5, 81, 0.5), (0, 2, 83, 2),
    (1, 0, 81, 1), (1, 1, 78, 1), (1, 2, 76, 2),
    (2, 0, 78, 1.5), (2, 1.5, 76, 0.5), (2, 2, 76, 1), (2, 3, 78, 1),
    (3, 0, 74, 3),
    (4, 0, 71, 1), (4, 1, 74, 1), (4, 2, 76, 1), (4, 3, 78, 1),
    (5, 0, 81, 2), (5, 2, 78, 1), (5, 3, 76, 1),
    (6, 0, 78, 1), (6, 1, 76, 1), (6, 2, 74, 2),
    (7, 0, 76, 3),
]


class Mix:
    def __init__(self, sec):
        self.dry = np.zeros((2, int(sec * SR)))
        self.wet = np.zeros_like(self.dry)

    def add(self, sig, at, pan=0.0, gain=1.0, send=1.0):
        i = int(at * SR)
        j = min(i + len(sig), self.dry.shape[1])
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        for ch, g in ((0, l), (1, r)):
            self.dry[ch, i:j] += gain * g * sig[: j - i]
            self.wet[ch, i:j] += send * gain * g * sig[: j - i]

    def render(self, loop_sec, wet, t60, t60_hi):
        ir = reverb_ir(t60, t60_hi)
        out = np.stack([self.dry[c] + wet * fftconvolve(self.wet[c], ir[c])[: self.dry.shape[1]] for c in range(2)])
        n = int(loop_sec * SR)
        loop = out[:, :n].copy()
        tail = out[:, n:]
        loop[:, : tail.shape[1]] += tail  # 終わりの残響を頭へ回し込み、継ぎ目をなくす
        return loop / np.abs(loop).max() * 0.89


def version_a():
    bpm = 72
    beat = 60 / bpm
    bar = 4 * beat
    loop = 8 * bar
    m = Mix(loop + 6)
    for b, (bass, notes) in enumerate(CHORDS):
        t0 = b * bar
        m.add(pad(notes, bar, 0.5, bright=4), t0, gain=0.22, send=0.6)
        m.add(marimba(mtof(bass + 12), 0.7), t0, pan=-0.2, gain=0.5)
        m.add(marimba(mtof(bass + 19), 0.45), t0 + 2 * beat, pan=-0.2, gain=0.5)
        for k, beat_i in enumerate((1, 3)):
            for nn in notes[1 + k: 3 + k]:
                m.add(kalimba(mtof(nn + 12), 0.35), t0 + beat_i * beat, pan=-0.45, gain=0.35)
    for b, bt, note, dur in MELODY:
        m.add(kalimba(mtof(note), 0.9), b * bar + bt * beat, pan=0.3, gain=0.6)
        m.add(kalimba(mtof(note + 12), 0.25), b * bar + bt * beat + 0.012, pan=0.35, gain=0.25)  # オルゴールのような上の重ね
    return m.render(loop, wet=0.3, t60=2.2, t60_hi=1.1)


def version_river():
    """ことばの川（夕方）。聴いて決めた試作 B。試作のときは A の後に同じ乱数の続きで作ったので、同じ順で作って同じ音にする"""
    global rng
    rng = np.random.default_rng(7)
    version_a()
    return version_b()


def version_b():
    bpm = 58
    beat = 60 / bpm
    bar = 4 * beat
    loop = 8 * bar
    m = Mix(loop + 8)
    for b, (bass, notes) in enumerate(CHORDS):
        t0 = b * bar
        m.add(pad(notes, bar, 0.55, bright=5, vib=True), t0, gain=0.32, send=0.9)
        m.add(pad([bass], bar, 0.6, bright=3), t0, gain=0.2, send=0.5)
        arp = [bass + 12, notes[0], notes[1], notes[2], notes[3], notes[1] + 12, notes[2] + 12, notes[3]]
        for k, nn in enumerate(arp):
            m.add(harp(mtof(nn), 0.5 if k else 0.65), t0 + k * beat / 2, pan=-0.6 + 1.2 * k / 7, gain=0.32)
    # ピアノはまばらに（ところどころ休む）
    for b, bt, note, dur in MELODY:
        if b in (2, 3) and bt > 0:
            continue
        m.add(piano(mtof(note), dur * beat, 0.75), b * bar + bt * beat, pan=0.1, gain=0.55)
    # 星のような高いベルを少しだけ
    for b, note in ((1, 90), (3, 93), (5, 88), (7, 86)):
        m.add(bell(mtof(note), 0.35), b * bar + 3 * beat, pan=0.5, gain=0.18, send=1.5)
    w = water(loop + 8, 0.06)
    m.add(w, 0, pan=-0.1, send=0.3)
    m.add(w[::-1].copy(), 0, pan=0.5, gain=0.7, send=0.3)
    return m.render(loop, wet=0.5, t60=4.8, t60_hi=2.0)


def wind(sec, level):
    """ブルーアワーの風: 低めのノイズがゆっくりふくらんでしぼむ"""
    n = int(sec * SR)
    x = sosfilt(butter(2, [150, 900], 'bandpass', fs=SR, output='sos'), rng.normal(0, 1, n))
    x /= np.abs(x).max()
    t = np.arange(n) / SR
    swell = 0.35 + 0.65 * (0.5 + 0.5 * np.sin(2 * np.pi * t / 9.3)) * (0.6 + 0.4 * np.sin(2 * np.pi * t / 4.1 + 2))
    return level * x * swell


def music_box(f, vel):
    """オルゴール: 澄んだ芯に、すぐ消える高い金属の響き"""
    t = tvec(3.0)
    out = np.zeros_like(t)
    for r, a, d in ((1, 1, 1.5), (2.0, 0.12, 0.6), (5.27, 0.18, 0.08), (8.9, 0.05, 0.03)):
        out += a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / d)
    return vel * out * attack(t, 0.0015)


def felt_piano(f, dur, vel):
    """フェルトピアノ: ハンマーに布をはさんだ、こもった柔らかいピアノ（倍音を少なく、立ち上がりをゆるく）"""
    t = tvec(min(dur + 2.5, 6.0))
    out = np.zeros_like(t)
    for n in range(1, 7):
        fn = f * n * np.sqrt(1 + 0.0003 * n * n)
        a = 0.55 ** (n - 1) / n
        t60 = 5.0 / (1 + 0.6 * (n - 1)) * (330 / f) ** 0.3
        for det in (-0.8, 0.8):
            out += 0.5 * a * np.sin(2 * np.pi * fn * (1 + det / 1731) * t + rng.uniform(0, 6.28)) * np.exp(-6.9 * t / t60)
    thump = sosfilt(butter(2, 300, 'low', fs=SR, output='sos'), rng.normal(0, 1, len(t))) * np.exp(-t / 0.015) * 0.15
    damp = np.where(t > dur, np.exp(-(t - dur) / 0.5), 1.0)
    return vel * (out + thump) * attack(t, 0.012) * damp


def pizz(f, vel):
    """ピチカート（弦を指ではじく）: 短く消える。ベースに使う"""
    t = tvec(1.2)
    out = np.zeros_like(t)
    for n in range(1, 9):
        out += np.sin(2 * np.pi * f * n * t) / n ** 1.3 * np.exp(-t / (0.28 / (1 + 0.25 * (n - 1)) * (220 / f) ** 0.2))
    return vel * out * attack(t, 0.002)


def celesta(f, vel):
    """チェレスタ: 鍵盤で金属の板をたたく。オルゴールより丸く、ベルより短い"""
    t = tvec(2.5)
    out = np.zeros_like(t)
    for r, a, d in ((1, 1, 1.1), (2, 0.25, 0.5), (3, 0.08, 0.25), (4.0, 0.05, 0.12)):
        out += a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / d)
    click = sosfilt(butter(2, 3000, 'high', fs=SR, output='sos'), rng.normal(0, 1, len(t))) * np.exp(-t / 0.003) * 0.03
    return vel * (out * attack(t, 0.001) + click)


def shaker(vel):
    """シェイカー: 高いノイズの短い粒"""
    t = tvec(0.15)
    x = sosfilt(butter(2, [5000, 12000], 'bandpass', fs=SR, output='sos'), rng.normal(0, 1, len(t)))
    return vel * x * np.clip(t / 0.008, 0, 1) * np.exp(-t / 0.04)


def bowed(f, dur, vel):
    """弓で弾く弦: のこぎり波に近い倍音を、ゆっくり立ち上げて伸ばす。後半にゆらぎ"""
    t = tvec(dur + 1.5)
    vib = 0.004 * f / 5.0 * np.sin(2 * np.pi * 5.0 * t) * np.clip((t - 0.6) / 0.8, 0, 1)
    ph = 2 * np.pi * f * t + vib
    out = np.zeros_like(t)
    for n in range(1, 11):
        out += np.sin(n * ph) / n * np.exp(-n / 4)
    env = np.clip(t / 0.9, 0, 1) ** 2 * np.where(t > dur, np.clip(1 - (t - dur) / 1.5, 0, 1), 1.0)
    return vel * out * env


def glass(f, vel):
    """ガラスの音: ほぼ純音に、ほんの少し整数倍でない響き。立ち上がりをゆるくして、こすったグラスのように"""
    t = tvec(5.0)
    out = np.sin(2 * np.pi * f * t) + 0.06 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.8)
    return vel * out * np.clip(t / 0.04, 0, 1) * np.exp(-t / 1.8)


# ---- 拾ったことば（ブルーアワー）: 明るく弾む。96 BPM・軽いスウィング、D メジャー、16小節 ----
# I - vi - IV - V を中心にした明るい進行（川の曲の「IV から始まる切なさ」と変える）
CLOUD_CHORDS = [  # (ピチカートのベース, マリンバの和音)
    (50, [62, 66, 69]),  # D
    (47, [62, 66, 71]),  # Bm
    (43, [62, 67, 71]),  # G
    (45, [61, 64, 69]),  # A
    (50, [62, 66, 69]),  # D
    (47, [62, 66, 71]),  # Bm
    (52, [64, 67, 71]),  # Em
    (45, [61, 64, 69]),  # A
    (43, [62, 67, 71]),  # G
    (45, [61, 64, 69]),  # A
    (54, [61, 66, 69]),  # F#m
    (47, [62, 66, 71]),  # Bm
    (43, [62, 67, 71]),  # G
    (45, [61, 64, 69]),  # A
    (50, [62, 66, 69]),  # D
    (45, [62, 64, 69]),  # Asus4
]
# メロディ（チェレスタ）: 8分音符で弾む。レ ミ ファ# ラ シ だけ
CLOUD_MELODY = [
    (0, 0, 78, .5), (0, .5, 81, .5), (0, 1, 83, 1), (0, 2, 81, .5), (0, 2.5, 78, .5), (0, 3, 76, 1),
    (1, 0, 74, .5), (1, .5, 76, .5), (1, 1, 78, 1.5), (1, 3, 71, 1),
    (2, 0, 74, .5), (2, .5, 76, .5), (2, 1, 83, 1), (2, 2, 81, 1), (2, 3, 78, 1),
    (3, 0, 76, 2.5), (3, 3, 69, 1),
    (4, 0, 78, .5), (4, .5, 81, .5), (4, 1, 83, 1), (4, 2, 81, .5), (4, 2.5, 78, .5), (4, 3, 76, 1),
    (5, 0, 86, 1), (5, 1, 83, .5), (5, 1.5, 81, .5), (5, 2, 78, 2),
    (6, 0, 76, .5), (6, .5, 78, .5), (6, 1, 81, 1), (6, 2, 83, .5), (6, 2.5, 81, .5), (6, 3, 78, 1),
    (7, 0, 76, 3),
    (8, 0, 83, 1.5), (8, 1.5, 81, .5), (8, 2, 83, 1), (8, 3, 86, 1),
    (9, 0, 88, 2), (9, 2, 86, 1), (9, 3, 83, 1),
    (10, 0, 81, 1.5), (10, 1.5, 78, .5), (10, 2, 76, 2),
    (11, 0, 78, 1), (11, 1, 74, 1), (11, 2, 71, 2),
    (12, 0, 74, .5), (12, .5, 76, .5), (12, 1, 78, .5), (12, 1.5, 81, .5), (12, 2, 83, 1), (12, 3, 81, 1),
    (13, 0, 76, 1), (13, 1, 78, 1), (13, 2, 81, 2),
    (14, 0, 78, 1), (14, 1, 76, .5), (14, 1.5, 74, .5), (14, 2, 74, 2),
    (15, 2, 76, .5), (15, 2.5, 78, .5), (15, 3, 76, 1),
]


def version_cloud():
    """拾ったことば（ブルーアワー）: チェレスタのメロディ、ピチカートのベース、マリンバの裏拍、シェイカー。残響は短く乾いた音"""
    global rng
    rng = np.random.default_rng(11)
    bpm = 96
    beat = 60 / bpm
    bar = 4 * beat
    swing = 0.58  # 裏の8分を少し遅らせて弾ませる
    loop = len(CLOUD_CHORDS) * bar
    m = Mix(loop + 4)
    at = lambda b, bt: b * bar + (int(bt) + (swing if bt % 1 else 0)) * beat
    for b, (bass, notes) in enumerate(CLOUD_CHORDS):
        # ベース: 1拍目に根音、3拍目に5度、4拍目の裏にオクターブ
        m.add(pizz(mtof(bass), 0.9), at(b, 0), pan=-0.1, gain=0.55)
        m.add(pizz(mtof(bass + 7), 0.7), at(b, 2), pan=-0.1, gain=0.5)
        m.add(pizz(mtof(bass + 12), 0.5), at(b, 3.5), pan=-0.1, gain=0.4)
        # マリンバ: 2拍目と4拍目に和音を短く（ズン・チャッのチャッ）
        for bt in (1, 3):
            for k, nn in enumerate(notes):
                m.add(marimba(mtof(nn), 0.5), at(b, bt) + 0.006 * k, pan=-0.4, gain=0.2)
        # シェイカー: 8分で、表を少し強く
        for i in range(8):
            m.add(shaker(0.9 if i % 2 == 0 else 0.6), at(b, i / 2), pan=0.55, gain=0.16, send=0.3)
    for b, bt, note, dur in CLOUD_MELODY:
        m.add(celesta(mtof(note + 12), 0.85), at(b, bt), pan=0.2, gain=0.5)  # 本物のチェレスタと同じく、書いた音の1オクターブ上で鳴らす
    return m.render(loop, wet=0.2, t60=1.5, t60_hi=0.8)


# ---- ふりかえり（夜）: B マイナー、拍のない自由な時間。低い持続音と、ずっと高いガラスの音。真ん中は空ける ----
NIGHT_SECTIONS = [  # (秒, 持続音の低い音（スマホのスピーカーで鳴る 80Hz より上に）, 和音, 弓の弦の音[(秒, 音, 長さ)])
    (10.5, [47, 54], [59, 62, 66, 73], [(0.5, 59, 5.0), (5.8, 57, 4.2)]),  # Bm9
    (10.5, [43, 50], [59, 62, 66, 69], [(0.5, 55, 4.5), (5.5, 54, 4.5)]),  # GM9
    (10.5, [40, 52], [59, 62, 66, 67], [(0.5, 52, 5.0), (5.8, 55, 4.2)]),  # Em9
    (10.5, [42, 54], [57, 61, 66, 71], [(0.5, 54, 4.0), (5.0, 49, 5.0)]),  # F#sus4 → F#m（C# で頭の B へ戻る）
]


def version_night():
    """ふりかえり（夜）: 低い持続音＋弓で弾く低い弦の長い音＋ずっと高いガラスの音。拍がなく、残響がとても深い"""
    global rng
    rng = np.random.default_rng(23)
    loop = sum(sec for sec, *_ in NIGHT_SECTIONS)
    m = Mix(loop + 10)
    t0 = 0.0
    for sec, drone, chord, line in NIGHT_SECTIONS:
        m.add(pad(drone, sec, 0.7, bright=2, atk=3.0, rel=4.0), t0, gain=0.45, send=0.8)
        m.add(pad(chord, sec, 0.35, bright=2, vib=True, atk=4.0, rel=4.0), t0, gain=0.16, send=1.0)
        for at, note, dur in line:
            m.add(bowed(mtof(note), dur, 0.5), t0 + at, pan=-0.15, gain=0.22, send=0.9)
        t0 += sec
    # 星: B マイナーの五音音階（シ レ ミ ファ# ラ）の高い音が、まばらに鳴る
    stars = [83, 86, 88, 90, 93, 95]
    t = 1.7
    while t < loop - 2:
        m.add(glass(mtof(int(rng.choice(stars))), float(rng.uniform(0.25, 0.5))), t,
              pan=float(rng.uniform(-0.8, 0.8)), gain=0.13, send=2.0)
        t += float(rng.uniform(2.8, 6.0))
    return m.render(loop, wet=0.65, t60=7.0, t60_hi=2.8)


def chimes(out):
    """泡を拾ったときの音（ハープとベルを重ねた1音）。押した強さで高い音にする: ラ シ レ ミ ファ#"""
    global rng
    for i, note in enumerate((81, 83, 86, 88, 90)):
        rng = np.random.default_rng(100 + i)
        m = Mix(5.0)
        m.add(harp(mtof(note), 0.8), 0.0, gain=0.6)
        m.add(bell(mtof(note), 0.5), 0.0, gain=0.35, send=1.4)
        m.add(bell(mtof(note + 12), 0.25), 0.03, gain=0.12, send=1.6)
        ir = reverb_ir(3.2, 1.5)
        x = np.stack([m.dry[c] + 0.4 * fftconvolve(m.wet[c], ir[c])[: m.dry.shape[1]] for c in range(2)])
        x *= np.clip((5.0 - np.arange(x.shape[1]) / SR) / 0.8, 0, 1)  # 最後はなめらかに消す
        x = x / np.abs(x).max() * 0.5
        wavfile.write(f'{out}/chime_{i}.wav', SR, (x.T * 32767).astype(np.int16))


if __name__ == '__main__':
    out = sys.argv[1]
    for name, fn in (('river', version_river), ('cloud', version_cloud), ('night', version_night)):
        x = fn()
        wavfile.write(f'{out}/{name}.wav', SR, (x.T * 32767).astype(np.int16))
        print(name, f'{x.shape[1] / SR:.1f}s')
    chimes(out)
