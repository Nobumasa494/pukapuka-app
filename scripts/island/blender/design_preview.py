# 配置図の静止画のための物を置く（v6 2026-10-05、v7 2026-10-06）。Blender の中で rebuild_world.py のあとに実行する。
# v7: 小川は3本（本流・支流が木の根もとの淵に集まり、淵から池へ）。淵と湧き水にも水の面。言葉の花は寄り添う花畑のまとまりで。
#     「していること」の新しい植物 fruitbush（実のなる低木）を V4Kit に作る。ワクワクの木は一回り大きく。最初のころの若木 design__sapling
# - 小川の水（island__stream）：湧き水 → 木のまわり → 池。下るほど太い。島の地形の STREAM と同じ道すじ
# - 最初のころの水たまり（design__puddles）：小川の道すじに小さな水たまりが3つ（ふだんは隠す）
# - 遠くの山あいと河口（island__far）：最初の向きの奥（230°）、水平線の山。真ん中の切れ目から川が海へ注ぐ
# - 言葉の植物の見本（コレクション V6Design）：真ん中のワクワクの木1本と、まわりの花・茂み・若木（アプリでは本物のデータで置く）
# 何度実行しても同じ結果になる
import bpy, bmesh, math, random, os, tempfile, mathutils

T = {}
exec(bpy.data.texts['island_terrain'].as_string(), T)
ns = {}
exec(bpy.data.texts['island_light'].as_string(), ns)
KEY = list(bpy.data.scenes['Scene']['island_key_dir'])
W = bpy.data.collections['V4World']
D = bpy.data.collections.get('V6Design')
if D is None:
    D = bpy.data.collections.new('V6Design')
    bpy.data.scenes['IslandV4'].collection.children.link(D)
for o in list(D.objects):
    me = o.data
    bpy.data.objects.remove(o, do_unlink=True)
    if me and me.users == 0:
        bpy.data.meshes.remove(me)
for n in ('island__stream', 'island__river', 'island__pond', 'island__pool', 'island__spring', 'island__spring2', 'design__puddles', 'island__far'):
    o = bpy.data.objects.get(n)
    if o:
        me = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.meshes.remove(me)


def l2(h):
    h = h.lstrip('#')
    return [((int(h[i:i + 2], 16) / 255 + 0.055) / 1.055) ** 2.4 for i in (0, 2, 4)]


def mix(a, b, t):
    return [a[k] * (1 - t) + b[k] * t for k in range(3)]


def finish(name, bm, colfn, coll, lit=False):
    # 面を上向きに、フラット。色は三角形ごと（Albedo）。lit=False なら Baked にそのまま（水・遠景は光を焼かない）
    for f in bm.faces:
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    alb = me.color_attributes.new('Albedo', 'FLOAT_COLOR', 'CORNER')
    bk = me.color_attributes.new('Baked', 'FLOAT_COLOR', 'CORNER')
    for p in me.polygons:
        p.use_smooth = False
        c = colfn(p)
        for li in p.loop_indices:
            alb.data[li].color = (*c, 1)
            bk.data[li].color = (*c, 1)
    me.materials.append(bpy.data.materials['PukaAlbedo'])
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    return o


rnd = random.Random(7)

# ---- 小川の水（3本） ----
PX, PZ = T['POND']
QX, QZ = T['POOL']
W1, W2 = l2('#8fd4d2'), l2('#5fb7c4')
# 小川（0〜2：言葉の流れ。データがたまってから出る）と、池から海へ出る川（3：いつも流れている）は別の部品にする
bms = {'island__stream': bmesh.new(), 'island__river': bmesh.new()}
for si, S in enumerate(T['STREAMS']):
    bm = bms['island__river' if si == 3 else 'island__stream']
    pts = []
    for i in range(len(S) - 1):
        (ax, az), (bx, bz) = S[i], S[i + 1]
        n = max(2, int(math.hypot(bx - ax, bz - az) / 0.18))  # 流れる波の筋（water_frames.py）が出るよう細かく
        for k in range(n):
            t = k / n
            pts.append((ax + (bx - ax) * t, az + (bz - az) * t))
    pts.append(S[-1])
    # 池と淵の中には帯を入れない（縁で終える）
    pts = [q for q in pts if T['pond_u'](*q) > 0.95 and math.hypot(q[0] - QX, q[1] - QZ) > T['POOL_R'] - 0.25]
    if si == 3:
        # 海へ出る川の水の帯は、浜の手前で終える。そこから先は溝が海面より下なので、海の水そのものが入り込む（本物の河口と同じ）
        pts = [q for q in pts if T['height'](q[0], q[1], False, False) > 0.12]  # 溝を掘る前の地面の高さで見る
    for _ in range(8):  # 細かくしたので、ならす回数も増やす（角を丸める）
        pts = [pts[0]] + [((pts[i - 1][0] + 2 * pts[i][0] + pts[i + 1][0]) / 4, (pts[i - 1][1] + 2 * pts[i][1] + pts[i + 1][1]) / 4)
                          for i in range(1, len(pts) - 1)] + [pts[-1]]
    rows = []
    N = len(pts)
    for i, (x, z) in enumerate(pts):
        _, prog, _k = T['stream_near'](x, z)
        j0, j1 = max(0, i - 1), min(N - 1, i + 1)
        tx, tz = pts[j1][0] - pts[j0][0], pts[j1][1] - pts[j0][1]
        L = math.hypot(tx, tz) or 1
        nx, nz = -tz / L, tx / L
        pr = i / (N - 1)
        w = T['stream_w'](pr, si) * (1 + 0.12 * math.sin(i * 0.75)) + T['WATER_PAD']  # 溝より広く。縁は岸の地面の下に隠れる
        y = T['stream_level'](pr, si) + 0.03
        row = []
        for s_ in (-1, 0, 1):
            ex, ez = x + nx * w * s_, z + nz * w * s_
            # 縁は、その場所の地面より少し下に（斜面を横切る所で、低い側の縁が宙に浮かないように）。真ん中は水面の高さ
            yy = y if s_ == 0 else min(y, T['height'](ex, ez) - 0.02)
            row.append(bm.verts.new((ex, -ez, yy + 0.012 * rnd.uniform(-1, 1))))
        rows.append(row)
    for i in range(N - 1):
        a_, b_ = rows[i], rows[i + 1]
        for k in range(2):
            bm.faces.new((a_[k], a_[k + 1], b_[k + 1]))
            bm.faces.new((a_[k], b_[k + 1], b_[k]))
stream = finish('island__stream', bms['island__stream'], lambda p: [v * (1 + rnd.uniform(-0.05, 0.05)) for v in mix(W1, W2, rnd.random() * 0.6)], W)
SEA_NEAR = l2('#5aaebb')  # 海の浅い所の色（world_colors.py の NEAR に近い）


def river_col(p):
    # 海へ出る川は、下流ほど海の浅い所の色へ（白っぽい小川の先に急に濃い海が入り、つながって見えなかった）
    c = p.center
    _, prog, _k = T['stream_near'](c.x, -c.y, (3,))
    base = mix(W1, W2, rnd.random() * 0.6)
    return [v * (1 + rnd.uniform(-0.05, 0.05)) for v in mix(base, SEA_NEAR, T['ss'](0.25, 0.9, prog))]


finish('island__river', bms['island__river'], river_col, W)


def disc(name, cx, cz, rad, y, deep, mid, nseg=24, coll=W):
    bm = bmesh.new()
    c0 = bm.verts.new((cx, -cz, y))
    rings = []
    for ri, f in enumerate((0.45, 0.8, 1.0)):
        rings.append([bm.verts.new((cx + rad * f * (1 + 0.05 * math.sin(3 * a + ri)) * math.cos(a), -(cz + rad * f * math.sin(a)), y))
                      for a in [k * 2 * math.pi / nseg for k in range(nseg)]])
    for k in range(nseg):
        bm.faces.new((c0, rings[0][k], rings[0][(k + 1) % nseg]))
        for ri in range(2):
            a_, b_ = rings[ri], rings[ri + 1]
            bm.faces.new((a_[k], b_[k], b_[(k + 1) % nseg]))
            bm.faces.new((a_[k], b_[(k + 1) % nseg], a_[(k + 1) % nseg]))

    def col(p):
        c = p.center
        t = min(1.0, math.hypot(c.x - cx, -c.y - cz) / rad)
        return [v * (1 + rnd.uniform(-0.04, 0.04)) for v in mix(deep, mix(mid, W1, 0.5), t ** 1.5)]
    return finish(name, bm, col, coll)


# ---- 木の根もとの淵と、湧き水の小さな泉 ----
disc('island__pool', QX, QZ, T['POOL_R'] + 0.15, T['POOL_LEVEL'] + 0.035, l2('#58aebb'), l2('#86cdcd'), 20)
SX, SZ = T['SPRING']
disc('island__spring', SX, SZ, 0.75, T['stream_level'](0.0, 0) + 0.04, l2('#6bbcc4'), l2('#9ad8d3'), 14)
S2X, S2Z = T['SPRING2']
disc('island__spring2', S2X, S2Z, 0.65, T['stream_level'](0.0, 1) + 0.04, l2('#6bbcc4'), l2('#9ad8d3'), 14)

# ---- 池の水の面（真ん中は少し深い青緑、縁ほど明るい浅瀬の色） ----
bm = bmesh.new()
PX, PZ = T['POND']
PR = T['POND_R'] + 0.6  # 色の段の目安
PY = T['POND_LEVEL']  # 海（小さな波 0.035）より上、蓮の葉（0.075）より下
c0 = bm.verts.new((PX, -PZ, PY))
rings = []
for ri, f in enumerate((0.45, 0.8, 1.0)):
    rings.append([bm.verts.new((PX + (T['pond_r'](a) + 0.55) * f * math.cos(a), -(PZ + (T['pond_r'](a) + 0.55) * f * math.sin(a)), PY))
                  for a in [k * 2 * math.pi / 28 for k in range(28)]])
for k in range(28):
    bm.faces.new((c0, rings[0][k], rings[0][(k + 1) % 28]))
    for ri in range(2):
        a, b = rings[ri], rings[ri + 1]
        bm.faces.new((a[k], b[k], b[(k + 1) % 28]))
        bm.faces.new((a[k], b[(k + 1) % 28], a[(k + 1) % 28]))
P_DEEP, P_MID = l2('#4fa6b4'), l2('#7cc6c8')


def pond_col(p):
    c = p.center
    t = min(1.0, math.hypot(c.x - PX, -c.y - PZ) / PR)
    return [v * (1 + rnd.uniform(-0.04, 0.04)) for v in mix(P_DEEP, mix(P_MID, W1, 0.5), t ** 1.5)]


finish('island__pond', bm, pond_col, W)

# ---- 最初のころの水たまり（ふだんは隠す）。縁に濃い土の輪 ----
MUD = l2('#8d8a6a')
bm = bmesh.new()
for si, prog, rr in [(0, 0.02, 0.9), (0, 0.45, 0.8), (1, 0.5, 0.8), (2, 0.0, 0.95)]:
    S = T['STREAMS'][si]
    f = prog * (len(S) - 1)
    i = min(int(f), len(S) - 2)
    t = f - i
    cx, cz = S[i][0] + (S[i + 1][0] - S[i][0]) * t, S[i][1] + (S[i + 1][1] - S[i][1]) * t
    y = max(T['height'](cx + dx, cz + dz, False) for dx, dz in [(0, 0), (rr, 0), (-rr, 0), (0, rr), (0, -rr)]) + 0.05
    c = bm.verts.new((cx, -cz, y))
    ring = [bm.verts.new((cx + rr * (1 + 0.15 * math.sin(3 * a)) * math.cos(a), -(cz + rr * 0.8 * math.sin(a)), y))
            for a in [k * 2 * math.pi / 10 for k in range(10)]]
    rim = [bm.verts.new((cx + (rr + 0.28) * (1 + 0.15 * math.sin(3 * a)) * math.cos(a), -(cz + (rr + 0.28) * 0.8 * math.sin(a)), y - 0.015))
           for a in [k * 2 * math.pi / 10 for k in range(10)]]
    for k in range(10):
        bm.faces.new((c, ring[k], ring[(k + 1) % 10]))
        bm.faces.new((ring[k], rim[k], rim[(k + 1) % 10]))
        bm.faces.new((ring[k], rim[(k + 1) % 10], ring[(k + 1) % 10]))
# 面は「水の扇・土の輪・土の輪」の順に作ったので、番号で分ける
pud = finish('design__puddles', bm, lambda p: mix(W1, W2, rnd.random() * 0.5) if p.index % 3 == 0 else MUD, D)
pud.hide_render = True
pud.hide_viewport = True  # 最初のころの物は、撮るときだけ出す

# ---- 遠くの山あいと河口（最初の向きの奥 230°） ----
# v7: 山は手前と奥に斜面のある尾根（前は1枚の壁で、斜めから見ると紙のように薄かった）。河口は淡い青の川
FAR = 76.0  # 空の半球（半径 140）はカメラについて動く。カメラ（島から約 50 手前）から 140 より内側に
bm = bmesh.new()
A0, A1, GAP = 196.0, 264.0, 230.0
NA = 46
DEPTH = 7.0
KEYV = mathutils.Vector(KEY).normalized()
for layer, (dist, hmax, seed) in enumerate([(FAR + 9, 9.5, 2.1), (FAR, 6.0, 5.3)]):
    front, ridge, back_ = [], [], []
    for k in range(NA + 1):
        a = A0 + (A1 - A0) * k / NA
        ar = math.radians(a)
        g = min(1.0, abs(a - GAP) / 9.0)  # 切れ目（河口）では低く
        edge = math.sin(math.pi * (a - A0) / (A1 - A0)) ** 0.6
        hh = hmax * edge * (0.55 + 0.45 * abs(math.sin(a * 0.21 + seed)) + 0.25 * math.sin(a * 0.57 + seed * 2)) * (0.12 + 0.88 * g ** 1.5)
        hh = max(0.3, hh)
        dr = DEPTH * (0.4 + 0.6 * hh / hmax)  # 高い所ほど裾が広い
        off = 1.2 * math.sin(a * 0.9 + seed)   # 尾根を少し前後に揺らす
        c, sn = math.cos(ar), math.sin(ar)
        front.append(bm.verts.new(((dist - dr) * c, -(dist - dr) * sn, -0.2)))
        ridge.append(bm.verts.new(((dist + off) * c, -(dist + off) * sn, hh)))
        back_.append(bm.verts.new(((dist + dr) * c, -(dist + dr) * sn, -0.2)))
    for k in range(NA):
        for r0, r1 in ((front, ridge), (ridge, back_)):
            bm.faces.new((r0[k], r0[k + 1], r1[k + 1]))
            bm.faces.new((r0[k], r1[k + 1], r1[k]))
# 河口：切れ目から海へ注ぐ川。手前へ広がる淡い青の帯
N_MOUNT = len(bm.faces)  # ここまでが山の面。あとは河口（色を、作った順番で分ける）
NR = 10
for k in range(NR):
    t0, t1 = k / NR, (k + 1) / NR

    def pt(t, w):
        d = FAR + 4 - 13 * t
        a = math.radians(GAP + w * (0.7 + 3.2 * t))
        return bm.verts.new((d * math.cos(a), -d * math.sin(a), 0.06 + 0.25 * (1 - t)))
    for w0, w1 in ((-1.0, 1.0),):  # 両側の砂の岸は、遠くで浮いた板に見えたのでやめた
        bm.faces.new((pt(t0, w0), pt(t0, w1), pt(t1, w1), pt(t1, w0)))
M_LO, M_HI, HAZE = l2('#8fb0b8'), l2('#b3c6cf'), l2('#efd8cc')
RIV, BANK = l2('#a9dad9'), l2('#ead8b4')


def far_col(p):
    c = p.center
    if p.index >= N_MOUNT:
        # 河口の帯（前は「低くて上向きの面」で見分け、低い山の面まで砂の色に塗って、浮いた板に見えた）
        return RIV
    t = max(0.0, min(1.0, c.z / 10))
    base = mix(M_LO, M_HI, t)
    base = mix(base, HAZE, 0.35 * (1 - t))  # ふもとは地平線の桃色にかすむ
    lit = 0.88 + 0.22 * max(0.0, p.normal.dot(KEYV))  # 日の当たる斜面を少し明るく（奥行きが見える）
    return [v * lit * (1 + rnd.uniform(-0.03, 0.03)) for v in base]


far = finish('island__far', bm, far_col, W)

# ---- 「していること」の植物 fruitbush（実のなる低木）を V4Kit に作る（なければ） ----
K = bpy.data.collections['V4Kit']
if not bpy.data.objects.get('fruitbush__base'):
    src = bpy.data.objects['bush__base']
    me = src.data.copy()
    me.name = 'fruitbush__base'
    me.transform(mathutils.Matrix.Scale(1.15, 4))
    alb = me.color_attributes['Albedo']
    G = l2('#6fae5e')
    for c in alb.data:
        c.color = (*mix(list(c.color)[:3], G, 0.35), 1)
    fb = bpy.data.objects.new('fruitbush__base', me)
    K.objects.link(fb)
    # 実：低木の上の面に小さな角のある玉（アプリで種類の色を掛けるので白）
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromObject(fb, bpy.context.evaluated_depsgraph_get())
    bm = bmesh.new()
    rr = random.Random(4)
    placed = 0
    dims = fb.dimensions
    for _ in range(200):
        if placed >= 9:
            break
        x, y = rr.uniform(-0.45, 0.45) * dims.x, rr.uniform(-0.45, 0.45) * dims.y
        hit = tree.ray_cast(mathutils.Vector((x, y, 3)), mathutils.Vector((0, 0, -1)))
        if hit[0] is None or hit[0].z < dims.z * 0.45:
            continue
        g = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.075)
        bmesh.ops.translate(bm, verts=g['verts'], vec=hit[0] + hit[1] * 0.04)
        placed += 1
    me2 = bpy.data.meshes.new('fruitbush__accent')
    bm.to_mesh(me2)
    bm.free()
    a2 = me2.color_attributes.new('Albedo', 'FLOAT_COLOR', 'CORNER')
    for c in a2.data:
        c.color = (1, 1, 1, 1)
    for p in me2.polygons:
        p.use_smooth = False
    fa = bpy.data.objects.new('fruitbush__accent', me2)
    K.objects.link(fa)
    print('fruitbush fruits', placed)

# ---- 言葉の植物の見本（真ん中のワクワクの木1本と、花畑のまとまり） ----
CAT = {'emotion': '#f6b2c2', 'body': '#f8c896', 'situation': '#aaccee', 'value': '#f2de96', 'curiosity': '#b2e8d0', 'doing': '#c9b6ef'}
GOLD = l2('#ffc65c')


def plant(kind, x, z, size, color=None, rot=None, prefix='d_'):
    y = T['height'](x, z) - 0.03
    rot = rnd.uniform(0, 2 * math.pi) if rot is None else rot
    out = []
    for o in K.objects:
        if not o.name.startswith(kind + '__'):
            continue
        d = bpy.data.objects.new(prefix + o.name, o.data.copy())
        D.objects.link(d)
        d.location = (x, -z, y)
        d.rotation_euler = (0, 0, rot)
        d.scale = (size, size, size)
        if color and o.name.endswith('__accent'):
            alb = d.data.color_attributes['Albedo']
            for c in alb.data:
                c.color = (*color, 1)
        elif color and kind in ('bush', 'tree_small', 'grass'):
            alb = d.data.color_attributes['Albedo']
            for c in alb.data:
                c.color = (*mix(list(c.color)[:3], color, 0.13), 1)
        out.append(d)
    return out


def ok(x, z, pad=0.35):
    d, prog, k = T['stream_near'](x, z)
    if d < T['stream_w'](prog, k) + pad:
        return False
    if math.hypot(x - QX, z - QZ) < T['POOL_R'] + pad:
        return False
    return T['pond_u'](x, z) > 1 + pad / T['POND_R']


def patch(cx, cz, items, spread=0.55):
    # 寄り添う花畑のまとまり：らせんに詰めて置く（同じ日によく拾う言葉）
    out = []
    for k, (kind, cat, s_) in enumerate(items):
        a = k * 2.39996
        r = spread * math.sqrt(k + 0.6)
        x, z = cx + r * math.cos(a), cz + r * math.sin(a)
        if ok(x, z):
            out += plant(kind, x, z, s_ * rnd.uniform(0.9, 1.08), l2(CAT[cat]))
    return out


objs = plant('tree_big', 0.0, 0.0, 2.9, GOLD, rot=0.4)
F = 'flower'
# 木のそばにいつも咲く花（わくわくした日に一緒に拾う言葉）：淵の両側の岸に
FS = 2.6  # 花畑の花の大きさ（全体の絵で色の塊に見えるように）
objs += patch(*T['P'](74, 5.6), [(F, 'emotion', FS)] * 6 + [(F, 'value', FS)] * 3, 0.42)
objs += patch(*T['P'](24, 5.4), [(F, 'value', FS)] * 5 + [(F, 'emotion', FS)] * 2, 0.42)
# 本流の上流のほとり：「していること」（計画を立てる など）。木へ流れ込む小川の上に、いつも咲く
objs += patch(*T['P'](196, 6.8), [('fruitbush', 'doing', 1.3)] * 3 + [(F, 'doing', FS)] * 6, 0.5)
# 支流の上流のほとり：好奇心の芽と花
objs += patch(*T['P'](318, 7.0), [(F, 'curiosity', FS)] * 6 + [('sprout', 'curiosity', 1.5)] * 2, 0.45)
# 池のほとり：流れをたどると行き着きやすい言葉（例：ほっとした）
px_, pz_ = T['POND']
objs += patch(px_ - 1.2, pz_ + 4.3, [(F, 'emotion', FS)] * 7, 0.42)
# 草地のほかのまとまり（場面の茂み、体の感じの草、したいことの若木）
objs += patch(6.6, -2.4, [('bush', 'situation', 1.3), ('bush', 'situation', 1.1)] + [(F, 'situation', FS)] * 5, 0.5)
objs += patch(-3.0, -7.0, [('tree_small', 'value', 1.0), ('tree_small', 'value', 0.85)] + [(F, 'value', FS)] * 4, 0.55)
objs += patch(-7.4, 3.0, [('grass', 'body', 1.2), ('grass', 'body', 1.0)] + [(F, 'body', FS)] * 6, 0.45)
objs += patch(3.0, 7.4, [(F, 'emotion', FS)] * 5 + [('bush', 'situation', 1.1)], 0.45)

# 最初のころ：ワクワクの若木（1日目から立っている）と芽が少し（ふだんは隠す）
early = plant('tree_big', 0.0, 0.0, 1.3, GOLD, rot=0.4, prefix='e_')
early = [o for o in early if not o.name.endswith('__accent')] + [o for o in early if o.name.endswith('__accent')][:0]
for o in list(D.objects):
    if o.name.startswith('e_tree_big__accent'):
        bpy.data.objects.remove(o, do_unlink=True)
for x, z, cat in [(2.6, 1.4, 'emotion'), (-1.8, 2.8, 'curiosity'), (3.6, -1.6, 'doing'), (-3.0, -1.4, 'value')]:
    early += plant('sprout', x, z, 1.8, l2(CAT[cat]), prefix='e_')
bpy.context.view_layer.update()
for o in objs + early:
    o.data.transform(o.matrix_world)
    o.matrix_world = o.matrix_world.Identity(4)
g = bpy.data.objects['v4__ground']
ge = bpy.data.objects['design__ground_early']
# 実（accent）は影を落とす物に入れない（葉の玉の、実の裏の面が真っ黒になった）
ns['light_objects'](objs, [o for o in objs if not o.name.endswith('__accent')] + [g], KEY)
ns['light_objects'](early, early + [ge], KEY)
# 光の底上げ：実・花びら（accent）は元の色の 55%、葉・幹（base）は 58% より暗くしない
# （葉の玉の奥の面は光が届かず 0.03 まで黒くなり、実のまわりが黒い穴に見えた。40% でも金の実の横ではほぼ黒）
for o in objs + early:
    k_ = 0.55 if o.name.endswith('__accent') else 0.58
    a_, b_ = o.data.color_attributes['Albedo'], o.data.color_attributes['Baked']
    for i in range(len(b_.data)):
        al = a_.data[i].color
        bc = b_.data[i].color
        b_.data[i].color = (*[max(bc[k], al[k] * k_) for k in range(3)], 1)
for o in early:
    o.hide_render = True
    o.hide_viewport = True
print('stream tris', len(stream.data.polygons), 'far tris', len(far.data.polygons), 'design objs', len(D.objects))
