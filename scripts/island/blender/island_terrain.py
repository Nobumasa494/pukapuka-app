# 島の地形の式（Blender のテキスト island_terrain と同じ）。座標はアプリの (x, z)。Blender では (x, -z, 高さ)。
# v10（2026-10-07、ユーザーが Gemini で作った参考の絵「この写真をもとに最初から作り直してほしい。全くダメ。」）
#   参考の絵どおりに：中央奥にとがった山。山を囲む段々の台地（平らな段と岩の崖）。湧き水から小川が段を滝で落ち、
#   段の上の小さな池を通って、右寄りの大きな湖へ。湖から手前へ川が出て、橋をくぐり、崖の下の砂浜から海へ。
#   左の段からは崖を滝で海へ落ちる川。島のまわりは高い崖で、手前は崖の下に砂浜
#   （v8 の「段差を作らない」は、この絵を見たユーザーの指示で取りやめ。段は崖、水は滝で段を落ちる）
import math
R_ISLAND = 26.0
MEADOW_R = 10.3          # 言葉の植物が育つ草地（ワクワクの木のまわりの段。ここは景色を置かない）
AZ0 = 0.7
CAMD = (math.sin(AZ0), math.cos(AZ0))  # カメラのいる向き（50°）
FRONT_BULGE = 0.10
STEP = 1.4               # 段の高さ（0.8 では崖が細い線にしか見えなかった。参考の絵は高い岩の崖）
CLIFF = 0.1              # 段のうち崖になる割合（小さいほど崖が切り立つ）
LAND_MIN = 0.12


def P(deg, r):
    a = math.radians(deg)
    return (r * math.cos(a), r * math.sin(a))


def ss(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def _wrap(a):
    return (a + math.pi) % (2 * math.pi) - math.pi


def _front_d(a):
    return _wrap(a - math.radians(50))


MOUNTAIN = P(230, 16.5)  # 中央奥のとがった山
PEAK = 12.5

# 池（名前 → 中心, 流れの向きの長さ, 横の長さ, 向き°）。lake＝右寄りの大きな湖、pool＝ワクワクの木の根もとの淵
PONDS = {
    'lake': (P(343, 9.0), 4.8, 3.4, 15),
    'pool': (P(62, 3.9), 1.5, 1.1, 70),
    'tarnL': (P(196, 10.6), 1.4, 1.0, 120),   # 山の左のふもとの段の池
    'tarnR': (P(266, 11.0), 1.4, 1.0, 60),    # 山の右のふもとの段の池
    'tarnC': (P(240, 7.0), 1.3, 0.95, 150),   # 山の正面の下の段の池
    'pondW': (P(150, 17.0), 1.9, 1.3, 30),    # 左の段の池（ここから崖を滝で海へ）
    'pondE': (P(14, 19.5), 1.5, 1.1, 0),      # 右手前の林の中の池
}
SPRINGS = [P(214, 12.4), P(250, 12.6), P(232, 10.6), P(168, 18.0), P(2, 21.5)]
SPRING, SPRING2 = SPRINGS[0], SPRINGS[1]
# 小川（決めた点, 始まりの半分の幅, 終わりの半分の幅, 流れ込む先）。並び順＝水の流れる順。最後の1本が海へ出る川（RIVER）
STREAM_DEFS = [
    ([SPRINGS[0], P(205, 11.6), PONDS['tarnL'][0]], 0.16, 0.22, 'tarnL'),
    ([PONDS['tarnL'][0], P(184, 9.0), P(165, 7.4), P(135, 6.0), P(100, 4.8), PONDS['pool'][0]], 0.22, 0.36, 'pool'),
    ([SPRINGS[1], P(258, 11.8), PONDS['tarnR'][0]], 0.16, 0.22, 'tarnR'),
    ([PONDS['tarnR'][0], P(283, 10.0), P(302, 9.6), P(320, 9.6), PONDS['lake'][0]], 0.22, 0.36, 'lake'),
    ([SPRINGS[2], P(236, 8.8), PONDS['tarnC'][0]], 0.15, 0.2, 'tarnC'),
    ([PONDS['tarnC'][0], P(262, 5.6), P(292, 5.4), P(318, 6.6), PONDS['lake'][0]], 0.2, 0.32, 'lake'),
    ([PONDS['pool'][0], P(36, 4.9), P(12, 6.4), PONDS['lake'][0]], 0.3, 0.36, 'lake'),
    ([SPRINGS[3], P(160, 17.6), PONDS['pondW'][0]], 0.16, 0.22, 'pondW'),
    ([PONDS['pondW'][0], P(140, 19.6), P(132, 23.0), P(128, 28.0)], 0.24, 0.32, 'sea'),
    ([SPRINGS[4], P(8, 20.6), PONDS['pondE'][0]], 0.14, 0.2, 'pondE'),
    ([PONDS['lake'][0], P(10, 12.4), P(28, 14.8), P(40, 18.4), P(44, 22.4), P(46, 26.5), P(47, 32.0)], 0.42, 0.55, 'sea'),
]
RIVER = len(STREAM_DEFS) - 1
STREAM_WS = [(w0, w1) for _, w0, w1, _ in STREAM_DEFS]
POND = PONDS['lake'][0]
POND_R = 3.4
POOL = PONDS['pool'][0]
POOL_R = 1.3
WATER_PAD = 0.6
BRIDGE_PROG = 0.5        # 海へ出る川の、橋をかける所（進み具合）


def _spline(C, step=0.5):
    # 決めた点を通るなめらかな曲線（Catmull-Rom）を 0.5m ごとの点に（折れ線のままだと曲がり角が角ばって見えた）
    out = []
    for i in range(len(C) - 1):
        p0, p1, p2, p3 = C[max(0, i - 1)], C[i], C[i + 1], C[min(len(C) - 1, i + 2)]
        n = max(1, math.ceil(math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step))
        for k in range(n):
            t = k / n
            out.append(tuple(0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t
                                    + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t ** 3) for j in (0, 1)))
    out.append(C[-1])
    return out


STREAMS = [_spline(C) for C, _, _, _ in STREAM_DEFS]
STREAM = STREAMS[0]


def shore(a):
    # 岸の出入りは小さく。手前は少し広げる
    return 1 + 0.05 * math.sin(2 * a + 0.5) + 0.035 * math.sin(3 * a + 1) + 0.02 * math.sin(5 * a + 2) + FRONT_BULGE * math.exp(-(_front_d(a) / 1.1) ** 2)


def beachy(a):
    # 崖の下の砂浜の幅（0〜1）。手前と左手前に広く、奥にはない（参考の絵）
    return ss(1.6, 0.9, abs(_wrap(a - math.radians(70))))


def beach_u(a):
    return 0.955


def back(x, z):
    return -(x * CAMD[0] + z * CAMD[1])


def zone(x, z):
    return math.hypot(x, z) / (R_ISLAND * shore(math.atan2(z, x)))


def pond_shape(name, x, z):
    (cx, cz), A, B, deg = PONDS[name]
    dx, dz = x - cx, z - cz
    a = math.atan2(dz, dx)
    ph = a - math.radians(deg)
    r = 1 / math.sqrt((math.cos(ph) / A) ** 2 + (math.sin(ph) / B) ** 2)
    r *= 1 + 0.06 * math.sin(3 * a + 1.1 + len(name)) + 0.04 * math.sin(5 * a + 0.3)
    return math.hypot(dx, dz) / r


def pond_near(x, z, names=None):
    return min((pond_shape(n, x, z), n) for n in (names or PONDS))


def pond_r(a):
    (cx, cz), A, B, deg = PONDS['lake']
    return 1 / pond_shape('lake', cx + math.cos(a), cz + math.sin(a))


def pond_u(x, z):
    return pond_shape('lake', x, z)


def plateau(x, z):
    # 段にする前のなめらかな高さ：山から離れるほど同じ割合で低く（段が手前まで5つほど並ぶ）。段の縁がうねるよう少しゆらす。
    # ワクワクの木のまわり（半径 5）は1つの広い段に（言葉の植物が育つ平らな所。ユーザー「平地や池も忘れずにね」）
    def raw(x, z):
        dM = math.hypot(x - MOUNTAIN[0], z - MOUNTAIN[1])
        return 1.2 + 0.17 * (38 - dM) + 3.0 * math.exp(-dM / 6.0) + 0.3 * math.sin(0.23 * x + 1.0) * math.cos(0.19 * z - 0.4) + 0.18 * math.sin(0.41 * x - 0.33 * z + 2.0)
    k = math.exp(-(x * x + z * z) / 48.0)  # 広く（狭いと淵のすぐ横に段の崖が来て、淵の縁に暗い細い三角形が出た）
    return raw(x, z) * (1 - k) + (STEP * (math.floor(raw(0, 0) / STEP) + 0.5)) * k


def terrace(h):
    # 平らな段と、切り立った崖（段の高さ STEP、崖は段の CLIFF の割合）
    t = h / STEP
    i = math.floor(t)
    return STEP * (i + ss(1 - CLIFF, 1.0, t - i))


def mountain(x, z):
    # とがった山（段の上にのる）。尾根が5本あるように半径を向きで変える
    dx, dz = x - MOUNTAIN[0], z - MOUNTAIN[1]
    a = math.atan2(dz, dx)
    d = math.hypot(dx, dz) / (1 + 0.16 * math.sin(5 * a + 0.7) + 0.06 * math.sin(9 * a))
    return PEAK * max(0.0, 1 - d / 8.5) ** 1.3


def meadow(x, z):
    # 池・小川・崖の縁を掘る前の地面
    return max(0.3, terrace(plateau(x, z))) + mountain(x, z)  # いちばん手前の低い所も海の波（0.035）より上に


base_height = meadow


def _seg(px, pz, ax, az, bx, bz):
    dx, dz = bx - ax, bz - az
    L2 = dx * dx + dz * dz
    t = max(0.0, min(1.0, ((px - ax) * dx + (pz - az) * dz) / L2))
    return math.hypot(px - (ax + t * dx), pz - (az + t * dz)), t


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


def stream_proj(x, z, ks=None):
    # いちばん近い小川の上の点：(距離, 進み具合, 何本目, その点の x, z)
    best = (1e9, 0.0, 0, x, z)
    for k, S in enumerate(STREAMS):
        if ks is not None and k not in ks:
            continue
        n = len(S) - 1
        for i in range(n):
            (ax, az), (bx, bz) = S[i], S[i + 1]
            dx, dz = bx - ax, bz - az
            t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
            qx, qz = ax + t * dx, az + t * dz
            d = math.hypot(x - qx, z - qz)
            if d < best[0]:
                best = (d, (i + t) / n, k, qx, qz)
    return best


def stream_w(prog, k=0):
    a, b = STREAM_WS[k]
    return a + (b - a) * prog


# ---- 水面の高さ（池 → 小川の順に、上流から決める。水は必ず下る） ----
def _rim_level(name):
    # 池の水面の目安：縁のすぐ外の地面の、低い方から 35% の高さ。斜面の池は、低い側を土手で持ち上げ（pre_height）、
    # 高い側をゆるく削る（いちばん低い所に合わせると、高い側が深い穴になり、上から来る小川が宙に浮いた）
    (cx, cz), A, B, deg = PONDS[name]
    hs = []
    for k in range(48):
        a = 2 * math.pi * k / 48
        r1 = 1 / pond_shape(name, cx + math.cos(a), cz + math.sin(a))
        hs.append(meadow(cx + 1.15 * r1 * math.cos(a), cz + 1.15 * r1 * math.sin(a)))
    return sorted(hs)[int(len(hs) * 0.35)] - 0.1


def pre_height(x, z, names=None):
    # 小川を掘る前の地面：草地 ＋ 池のまわり（高い側はゆるく削り、低い側は土手で持ち上げる）
    h = meadow(x, z)
    pu, pn = pond_near(x, z, names)
    lv = POND_LEVELS[pn]
    if h > lv + 0.12:
        h -= (h - lv - 0.12) * ss(1.9, 1.0, pu)
    else:
        h += (lv + 0.12 - h) * ss(1.7, 1.05, pu)
    return h


def _path_ground(S, n=240, k=0):
    # 道すじにそった地面の高さ。真ん中と両岸の外（幅＋0.9）のいちばん低い所（片側の低い岸より水面が高いと、水が宙に浮いて見えた）
    segs = len(S) - 1
    out = []
    for j in range(n + 1):
        f = j / n * segs
        i = min(int(f), segs - 1)
        t = f - i
        (ax, az), (bx, bz) = S[i], S[i + 1]
        x, z = ax + (bx - ax) * t, az + (bz - az) * t
        L = math.hypot(bx - ax, bz - az) or 1
        nx, nz = -(bz - az) / L, (bx - ax) / L
        o = stream_w(j / n, k) + 0.9
        out.append(min(pre_height(x, z), pre_height(x + nx * o, z + nz * o), pre_height(x - nx * o, z - nz * o)))
    return out


def _smooth(L, win=10):
    # 水面をならす（急に下がる所をなくす）。ならしても地面より上にしない・必ず下る
    n = len(L)
    out = [sum(L[max(0, i - win):min(n, i + win + 1)]) / (min(n, i + win + 1) - max(0, i - win)) for i in range(n)]
    out = [min(o, l) for o, l in zip(out, L)]
    for i in range(1, n):
        out[i] = min(out[i], out[i - 1] - 0.0006)
    return out


def _ease_to(L, end):
    # 終わりの2割で、受ける側（池・海）の水面へなめらかに下りる（段差でぷつっと切れて見えた）
    n = len(L) - 1
    return [v + (end - v) * ss(0.8, 1.0, i / n) for i, v in enumerate(L)]


POND_LEVELS = {}
LEVELS = [None] * len(STREAMS)
_upper = {}  # 池 → その池へ流れ込む前の、いちばん低い上流の水面（池はそれより下）
for _n in PONDS:
    POND_LEVELS[_n] = max(0.06, _rim_level(_n))  # 海の波（0.035）より上
for _k, (_C, _w0, _w1, _dst) in enumerate(STREAM_DEFS):
    _src = next((n for n, p in PONDS.items() if p[0] == _C[0]), None)
    _g = [v - 0.08 for v in _path_ground(STREAMS[_k], 240, _k)]
    _start = POND_LEVELS[_src] if _src else _g[0]
    _end = 0.02 if _dst == 'sea' else POND_LEVELS[_dst]
    _end = min(_end, _start - 0.05) if _dst == 'sea' or _start - 0.05 > 0.06 else _end
    if _dst != 'sea':
        POND_LEVELS[_dst] = _end  # 受ける池は、流れ込む水面より下（同じ池へ流れ込む次の小川も、この高さへ）
    _L = [min(_start, v) for v in _g]
    for _i in range(1, len(_L)):
        _L[_i] = min(_L[_i], _L[_i - 1] - 0.0006)
    LEVELS[_k] = _ease_to(_smooth([max(v, _end) for v in _L], 1), _end)  # 滝は切り立ったまま（広くならすと段の上で水が斜めに浮いた）
# 同じ池へ流れ込む小川が複数あるとき、先に決めた小川の終わりを、最後に決まった池の水面に合わせ直す
for _k, (_C, _w0, _w1, _dst) in enumerate(STREAM_DEFS):
    if _dst != 'sea' and abs(LEVELS[_k][-1] - POND_LEVELS[_dst]) > 1e-6:
        LEVELS[_k] = _ease_to([max(v, POND_LEVELS[_dst]) for v in LEVELS[_k]], POND_LEVELS[_dst])
POND_LEVEL = POND_LEVELS['lake']
POOL_LEVEL = POND_LEVELS['pool']


def stream_level(prog, k=0):
    L = LEVELS[k]
    f = prog * (len(L) - 1)
    i = min(int(f), len(L) - 2)
    t = f - i
    return L[i] * (1 - t) + L[i + 1] * t



def height(x, z, carve=True, river=True):
    # carve=False：小川と小さな池を掘らない（最初のころ。湖と海へ出る川だけある）。river=False：海へ出る川も掘らない
    r = math.hypot(x, z)
    a = math.atan2(z, x)
    u = r / (R_ISLAND * shore(a))
    names = list(PONDS) if carve else ['lake']
    h = pre_height(x, z, names)
    pu, pn = pond_near(x, z, names)
    lv = POND_LEVELS[pn]
    # 池：岸の線（pu=1）の外はゆるい坂で上がる（水面＋0.03 から 1m あたり 0.35）。内側は底へ。
    # 前は岸の外まで水面より下げていて、岸の外に溝ができ、水の縁が浮いて見えた
    r_edge = math.hypot(x - PONDS[pn][0][0], z - PONDS[pn][0][1]) / max(pu, 1e-6)
    if pu >= 1:
        out_d = (pu - 1) * r_edge
        kp = ss(1.2, 0.5, out_d)  # 岸から 1m より外は削らない（坂が島じゅう・池へ下りる山の斜面を削っていた）
        h = h * (1 - kp) + min(h, lv + 0.03 + 1.0 * out_d) * kp  # 坂は急め（ゆるいと、池へ下りてくる山の斜面を削り、小川が宙に浮いた）
    else:
        h = min(h, lv + 0.03 - (lv + 0.48 - 0.03) * ss(1.0, 0.75, pu))
    # 島のまわりの崖：台地の縁（0.93）から一気に、崖の下の砂浜（0.08）か海の底へ
    by = beachy(a)
    low = 0.08 if by > 0.05 else -0.6
    if u > 0.93:
        t = ss(0.93, 0.95 - 0.005 * by, u)
        h = h * (1 - t) + low * t
    if u > 0.95 + 0.05 * by:
        h = low - 1.3 * ss(0.95 + 0.05 * by, 1.15, u)
    if carve or river:
        ks = None if carve else [k for k, d in enumerate(STREAM_DEFS) if k == RIVER or d[3] == 'sea' and False]
        d, prog, k = stream_near(x, z, ks if ks else (None if carve else (RIVER,))) if river else stream_near(x, z, [i for i in range(len(STREAMS)) if i != RIVER])
        w = stream_w(prog, k)
        lvl = stream_level(prog, k)
        # 岸の線（d=w）の外はゆるい坂（水面＋0.03 から 1m あたり 0.35）、内側は底（水面の 0.12 下）。
        # 前は岸の外まで水面より下げていて、岸の外に溝ができ、水の縁が浮いて見えた
        target = lvl + 0.03 + 0.6 * (d - w) if d >= w else lvl - 0.12 * ss(w, w * 0.4, d) - 0.01
        kc = ss(w + 2.2, w + 1.2, d)  # 岸から 2m より外は削らない
        h = h * (1 - kc) + min(h, target) * kc
    return h


def water_y(x, z):
    d, prog, k = stream_near(x, z)
    return stream_level(prog, k)


# ---- 地面の色（Blender だけ。アプリには要らない）。地面（build_ground.py）と岸の帯（design_preview.py）で同じ色にする ----
# 岸の帯の外側の縁は地面に少し沈めるので、地面と同じ色なら、ぶつかる線（地面の三角形でぎざぎざ）が見えない
def _l2(hx):
    return [((int(hx[i:i + 2], 16) / 255 + 0.055) / 1.055) ** 2.4 for i in (1, 3, 5)]


G_LOW, G_MID, G_HI, G_TOP = _l2('#a9d264'), _l2('#97c459'), _l2('#86b44f'), _l2('#76a347')  # v10：参考の絵の、あたたかく鮮やかな黄緑。山の上ほど深い緑
SAND, SAND2 = _l2('#f0c98e'), _l2('#e3b679')  # 崖の下のあたたかい砂浜
PEB = _l2('#9aa184')  # 小川の岸の濡れた土


def _mix(a, b, t):
    return [a[k] * (1 - t) + b[k] * t for k in range(3)]


def ground_albedo(x, z, h):
    # 草地と砂浜（海の中は build_ground.py）。高さでゆるく色を変える（起伏が色でも見える）。境目を作らない
    u = zone(x, z)
    bu = beach_u(math.atan2(z, x))
    if u > 0.94 and h < 0.5:
        return _mix(SAND2, SAND, ss(0.94, 0.99, u))
    col = _mix(G_LOW, G_MID, ss(1.5, 3.5, h))
    col = _mix(col, G_HI, ss(3.5, 6.0, h))
    return _mix(col, G_TOP, ss(6.0, 12.0, h))
