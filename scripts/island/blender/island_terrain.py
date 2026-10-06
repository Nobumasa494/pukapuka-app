# 島の地形の式（Blender のテキスト island_terrain と同じ）。座標はアプリの (x, z)。Blender では (x, -z, 高さ)。
# アプリの src/components/Island3D.tsx の groundY は、この meadow() と同じ式（言葉の植物は草地にしか植えないため）。
# v6（2026-10-05）: 島を大きく（半径 22）。奥（230°）が少し高く、水が奥の丘の湧き水から手前（50°）の池へ流れる。
# ワクワクの木は草地の真ん中（0, 0）。小川の道すじ STREAM は、地面を少し掘る（水が坂を上らない）
import math
R_ISLAND = 22.0
MEADOW_R = 10.3          # 言葉の植物が育つ草地（ここは景色を置かない）
AZ0 = 0.7
CAMD = (math.sin(AZ0), math.cos(AZ0))  # カメラのいる向き（50°）
TILT = 0.03              # 奥ほど高くする傾き（1m あたり）


def P(deg, r):
    a = math.radians(deg)
    return (r * math.cos(a), r * math.sin(a))


POND = P(34, 12.2)       # 手前の池（小川が行き着く所）
POND_R = 3.6
SPRING = P(230, 13.6)    # 奥の丘の湧き水（小川が始まる所）
# 小川の道すじ（湧き水 → 木の左を回って根もとに寄る → 手前の池）。太さは下るほど太く
STREAM = [SPRING, P(226, 11.0), P(214, 8.0), P(196, 5.2), P(168, 3.3), P(128, 2.9), P(88, 4.0), P(62, 6.4), P(44, 9.0), POND]
STREAM_W = (0.28, 0.62)  # 湧き水の所・池の所の半分の幅


def ss(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def shore(a):
    return 1 + 0.10 * math.sin(2 * a + 0.5) + 0.06 * math.sin(3 * a + 1) + 0.035 * math.sin(5 * a + 2)


def back(x, z):
    # 奥へ向かう距離（カメラの反対側が +）
    return -(x * CAMD[0] + z * CAMD[1])


def meadow(x, z):
    # 草地のゆるい起伏（±0.3 くらい）と、奥ほど少し高い傾き
    return (0.6 + 0.2 * math.sin(0.33 * x + 1.3) * math.cos(0.29 * z - 0.4) + 0.1 * math.sin(0.71 * x - 0.47 * z + 2.0)
            + TILT * back(x, z))


def _seg(px, pz, ax, az, bx, bz):
    dx, dz = bx - ax, bz - az
    L2 = dx * dx + dz * dz
    t = max(0.0, min(1.0, ((px - ax) * dx + (pz - az) * dz) / L2))
    return math.hypot(px - (ax + t * dx), pz - (az + t * dz)), t


def stream_near(x, z):
    # 小川の道すじまでの距離と、道すじの上での進み具合（0＝湧き水、1＝池）
    best, prog = 1e9, 0.0
    n = len(STREAM) - 1
    for i in range(n):
        d, t = _seg(x, z, *STREAM[i], *STREAM[i + 1])
        if d < best:
            best, prog = d, (i + t) / n
    return best, prog


def stream_w(prog):
    return STREAM_W[0] + (STREAM_W[1] - STREAM_W[0]) * prog


def base_height(x, z):
    # 小川と池を掘る前の高さ
    r = math.hypot(x, z)
    a = math.atan2(z, x)
    u = r / (R_ISLAND * shore(a))
    h = meadow(x, z)
    bk = back(x, z) / max(r, 1e-3)  # 1＝奥
    hm = ss(0.48, 0.66, u) * (1 - ss(0.80, 0.90, u)) * (0.3 + 0.7 * ss(-0.3, 0.7, bk))
    h += (1.8 + 0.9 * math.sin(0.3 * x + 1.0) * math.cos(0.26 * z - 0.5) + 0.45 * math.sin(0.7 * x - 0.3 * z)) * hm
    return h


def _path_levels(n=240):
    # 道すじにそって水面の高さを決める。下るほど必ず低く（水が坂を上らない）
    segs = len(STREAM) - 1
    out = []
    lv = 1e9
    for k in range(n + 1):
        f = k / n * segs
        i = min(int(f), segs - 1)
        t = f - i
        (ax, az), (bx, bz) = STREAM[i], STREAM[i + 1]
        y = base_height(ax + (bx - ax) * t, az + (bz - az) * t) - 0.08
        lv = min(lv - 0.004, y) if k else y
        out.append(max(0.02, lv))
    return out


LEVELS = _path_levels()


def stream_level(prog):
    f = prog * (len(LEVELS) - 1)
    i = min(int(f), len(LEVELS) - 2)
    t = f - i
    return LEVELS[i] * (1 - t) + LEVELS[i + 1] * t


def height(x, z):
    r = math.hypot(x, z)
    a = math.atan2(z, x)
    u = r / (R_ISLAND * shore(a))
    h = base_height(x, z)
    # 小川：水面より少し低く掘る。岸はなだらかに
    d, prog = stream_near(x, z)
    w = stream_w(prog)
    k = ss(w + 0.9, w * 0.7, d)
    bed = stream_level(prog) - 0.1
    h = h * (1 - k) + min(h, bed) * k
    # 池
    dp = math.hypot(x - POND[0], z - POND[1])
    k = ss(POND_R + 1.4, POND_R - 0.6, dp)
    h = h * (1 - k) + (-0.35) * k
    if u > 0.86:
        t = ss(0.86, 1.0, u)
        h = h * (1 - t) + 0.06 * t
    if u > 1.0:
        h = 0.06 - 1.3 * ss(1.0, 1.25, u)
    return h


def water_y(x, z):
    # 小川の水面の高さ（いちばん近い道すじの所の高さ）
    return stream_level(stream_near(x, z)[1])


def zone(x, z):
    r = math.hypot(x, z)
    a = math.atan2(z, x)
    return r / (R_ISLAND * shore(a))
