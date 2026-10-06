# 島の地形の式（Blender のテキスト island_terrain と同じ）。座標はアプリの (x, z)。Blender では (x, -z, 高さ)。
# アプリの src/components/Island3D.tsx の groundY は、この meadow() と同じ式（言葉の植物は草地にしか植えないため）。
# v6（2026-10-05）: 島を大きく（半径 22）。奥（230°）が少し高く、水が奥の丘の湧き水から手前（50°）の池へ流れる。
# v7（2026-10-06）: 小川は「植物が小川のほとりに上流から下流へ並ぶ」形（SPEC 5.）。奥の湧き水からの本流と右奥からの支流が、
#   ワクワクの木（0, 0）の根もとの淵 POOL に集まり、淵から手前の池 POND へ1本で流れ出る。
#   島は手前（50°）に広げ、最初の向きで砂浜が画面の下の端に細く見えるだけにする（shore の FRONT_BULGE）。
#   height(x, z, carve=False) は小川を掘らない地面（最初のころ。小川はデータがたまってから出る）
import math
R_ISLAND = 19.0          # v7: 22 → 19（島が広いのに中身がまばらだった）
MEADOW_R = 10.3          # 言葉の植物が育つ草地（ここは景色を置かない）
AZ0 = 0.7
CAMD = (math.sin(AZ0), math.cos(AZ0))  # カメラのいる向き（50°）
TILT = 0.03              # 奥ほど高くする傾き（1m あたり）
LAND_MIN = 0.12          # 草地の高さの下限（なめらか）。海面 0 と海の波 0.035 より上
FRONT_BULGE = 0.12       # 手前（50°）に島を広げる量（0.24 では左手前に深い入り江ができた）


def P(deg, r):
    a = math.radians(deg)
    return (r * math.cos(a), r * math.sin(a))


POND = P(34, 11.6)       # 手前の池（流れが行き着く所。池は言葉ではなく、ほとりに言葉が咲く）
POND_R = 3.3             # 池のおおよその半径。縁は角度で変わる（pond_u）
SPRING = P(230, 11.8)    # 奥の丘の湧き水（本流が始まる所。言葉ではない）
SPRING2 = P(298, 11.2)   # 右奥の丘の湧き水（支流が始まる所）
POOL = P(50, 3.7)        # ワクワクの木の根もとの淵（木の葉の広がり 半径 約2.8 の外、カメラ側）
POOL_R = 1.2
BASIN, BASIN_R = 0.42, 3.6  # 淵のまわりのくぼ地の深さと広さ
# 小川の道すじ。0＝本流（湧き水 → 淵）、1＝支流（右奥 → 淵）、2＝淵 → 池。太さは下るほど太く
STREAMS = [
    [SPRING, P(225, 9.8), P(213, 7.6), P(196, 5.8), P(170, 4.6), P(132, 4.2), P(92, 4.3), POOL],
    [SPRING2, P(305, 9.2), P(318, 7.0), P(338, 5.4), P(8, 4.4), POOL],
    [POOL, P(45, 5.8), P(40, 7.2), POND],
    # v7: 池 → 浜 → 海（たまる一方にしない。拾った言葉は、やがて海へ帰る）。細く曲がりくねらせる（まっすぐ広い帯は不自然だった）
    [POND, P(33, 14.4), P(29, 16.3), P(33, 18.1), P(29, 19.9), P(31, 21.8), P(31, 23.5)],
]
STREAM = STREAMS[0]      # 前の版との互換
STREAM_WS = [(0.28, 0.5), (0.2, 0.38), (0.52, 0.68), (0.32, 0.5)]  # 道すじごとの、始まり・終わりの半分の幅
POND_LEVEL = 0.055       # 池の水面（海の波 0.035 より上）
WATER_PAD = 0.6          # 水の板を、小川の幅よりこれだけ広く作る（縁は岸の地面の下に隠れる）


def ss(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def shore(a):
    d = (a - math.radians(50) + math.pi) % (2 * math.pi) - math.pi  # 手前（50°）からの角度
    return (1 + 0.10 * math.sin(2 * a + 0.5) + 0.06 * math.sin(3 * a + 1) + 0.035 * math.sin(5 * a + 2)
            + FRONT_BULGE * math.exp(-(d / 1.15) ** 2))


def back(x, z):
    # 奥へ向かう距離（カメラの反対側が +）
    return -(x * CAMD[0] + z * CAMD[1])


def meadow(x, z):
    # 草地のゆるい起伏（±0.3 くらい）と、奥ほど少し高い傾き。v7: 淵のまわりはゆるいくぼ地（水が集まる所）
    dq2 = (x - POOL[0]) ** 2 + (z - POOL[1]) ** 2
    m = (0.6 + 0.2 * math.sin(0.33 * x + 1.3) * math.cos(0.29 * z - 0.4) + 0.1 * math.sin(0.71 * x - 0.47 * z + 2.0)
         + TILT * back(x, z) - BASIN * math.exp(-dq2 / BASIN_R ** 2))
    # 海面より少し上（LAND_MIN）より下がらない、なめらかな下限。島の手前は傾きで低く、海面より低いくぼみに海が見えて
    # 草地に青い穴・河口のまわりに大きな入り江ができた（2026-10-07）
    return 0.5 * (m + LAND_MIN + math.sqrt((m - LAND_MIN) ** 2 + 0.01))


def _seg(px, pz, ax, az, bx, bz):
    dx, dz = bx - ax, bz - az
    L2 = dx * dx + dz * dz
    t = max(0.0, min(1.0, ((px - ax) * dx + (pz - az) * dz) / L2))
    return math.hypot(px - (ax + t * dx), pz - (az + t * dz)), t


def pond_r(a):
    # 池の縁の半径（角度 a で変わる。真ん丸の池は人工的に見えた）
    return POND_R * (1 + 0.16 * math.sin(2 * a + 0.7) + 0.09 * math.sin(3 * a + 2.1) + 0.05 * math.sin(5 * a + 0.4))


def pond_u(x, z):
    # 池の中心からの距離 ÷ その向きの縁の半径（1＝縁）
    dx, dz = x - POND[0], z - POND[1]
    return math.hypot(dx, dz) / pond_r(math.atan2(dz, dx))


def stream_near(x, z, ks=None):
    # いちばん近い小川までの距離、道すじの上での進み具合（0＝始まり、1＝終わり）、何本目の道すじか（ks で道すじを絞れる）
    best, prog, kk = 1e9, 0.0, 0
    for k, S in enumerate(STREAMS):
        if ks is not None and k not in ks:
            continue
        n = len(S) - 1
        for i in range(n):
            d, t = _seg(x, z, *S[i], *S[i + 1])
            if d < best:
                best, prog, kk = d, (i + t) / n, k
    return best, prog, kk


def stream_w(prog, k=0):
    a, b = STREAM_WS[k]
    return a + (b - a) * prog


def base_height(x, z):
    # 小川と池を掘る前の高さ
    r = math.hypot(x, z)
    a = math.atan2(z, x)
    u = r / (R_ISLAND * shore(a))
    h = meadow(x, z)
    bk = back(x, z) / max(r, 1e-3)  # 1＝奥
    hm = ss(0.48, 0.66, u) * (1 - ss(0.70, 0.9, u)) * ss(-0.5, 0.7, bk)  # 丘は奥だけ。0.70 から下げ始める（崖にしない）。手前は池から浜へなだらかに（海へ出る川が谷にならない）
    h += (1.8 + 0.9 * math.sin(0.3 * x + 1.0) * math.cos(0.26 * z - 0.5) + 0.45 * math.sin(0.7 * x - 0.3 * z)) * hm
    return h


def _path_levels(S, start=None, n=240):
    # 道すじにそって水面の高さを決める。下るほど必ず低く（水が坂を上らない）
    segs = len(S) - 1
    out = []
    lv = 1e9 if start is None else start
    for k in range(n + 1):
        f = k / n * segs
        i = min(int(f), segs - 1)
        t = f - i
        (ax, az), (bx, bz) = S[i], S[i + 1]
        y = base_height(ax + (bx - ax) * t, az + (bz - az) * t) - 0.08
        lv = min(lv - 0.0006, y) if (k or start is not None) else y
        out.append(max(0.02, lv))
    return out


_L0 = _path_levels(STREAMS[0])
_L1 = _path_levels(STREAMS[1])
POOL_LEVEL = min(_L0[-1], _L1[-1], base_height(*POOL) - 0.12)  # 淵の水面（2本が集まる所）
LEVELS = [[max(v, POOL_LEVEL) for v in _L0], [max(v, POOL_LEVEL) for v in _L1], [max(v, POND_LEVEL) for v in _path_levels(STREAMS[2], POOL_LEVEL + 0.0006)],  # 池の水面より下げない
          _path_levels(STREAMS[3], POND_LEVEL + 0.0006)]


def stream_level(prog, k=0):
    L = LEVELS[k]
    f = prog * (len(L) - 1)
    i = min(int(f), len(L) - 2)
    t = f - i
    return L[i] * (1 - t) + L[i + 1] * t


def height(x, z, carve=True, river=True):
    # carve=False：小川と淵を掘らない（最初のころ）。river=False：池から海へ出る川も掘らない（溝を掘る前の地面の高さを知りたいとき）
    r = math.hypot(x, z)
    a = math.atan2(z, x)
    u = r / (R_ISLAND * shore(a))
    h = base_height(x, z)
    if carve or river:
        # 小川：水面より少し低く掘る。池から海へ出る川（3）は、最初のころの地面にも掘る（いつも流れている）
        d, prog, k = stream_near(x, z, None if carve else (3,)) if river else stream_near(x, z, (0, 1, 2))
        w = stream_w(prog, k)
        # 岸は狭く・溝は浅く（水面の 0.07 下まで）。水の板は溝より広く（WATER_PAD）して、岸の地面で縁を隠す
        # （溝を w+0.9 まで掘ると、水の板の外に斜面がむき出しになり、深い日陰が黒く焼けて、水が浮いた板に見えた）
        kk = ss(w + 0.55, w * 0.8, d)
        bed = stream_level(prog, k) - 0.07
        h = h * (1 - kk) + min(h, bed) * kk
    if carve:
        # 淵
        dq = math.hypot(x - POOL[0], z - POOL[1])
        kk = ss(POOL_R + 0.7, POOL_R * 0.6, dq)
        h = h * (1 - kk) + min(h, POOL_LEVEL - 0.18) * kk
    # 池（縁は角度で変わる。真ん丸にしない）
    pu = pond_u(x, z)
    k2 = ss(1.42, 0.82, pu)
    h = h * (1 - k2) + (-0.35) * k2
    if u > 0.86:
        t = ss(0.86, 1.0, u)
        h = h * (1 - t) + 0.06 * t
    if u > 1.0:
        h = 0.06 - 1.3 * ss(1.0, 1.25, u)
    return h


def water_y(x, z):
    # 小川の水面の高さ（いちばん近い道すじの所の高さ）
    d, prog, k = stream_near(x, z)
    return stream_level(prog, k)


def zone(x, z):
    r = math.hypot(x, z)
    a = math.atan2(z, x)
    return r / (R_ISLAND * shore(a))
