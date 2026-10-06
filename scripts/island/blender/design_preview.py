# 配置図の静止画のための物を置く（v6、2026-10-05）。Blender の中で rebuild_world.py のあとに実行する。
# - 小川の水（island__stream）：湧き水 → 木のまわり → 池。下るほど太い。島の地形の STREAM と同じ道すじ
# - 最初のころの水たまり（design__puddles）：小川の道すじに小さな水たまりが3つ（ふだんは隠す）
# - 遠くの山あいと河口（island__far）：最初の向きの奥（230°）、水平線の山。真ん中の切れ目から川が海へ注ぐ
# - 言葉の植物の見本（コレクション V6Design）：真ん中のワクワクの木1本と、まわりの花・茂み・若木（アプリでは本物のデータで置く）
# 何度実行しても同じ結果になる
import bpy, bmesh, math, random, os, tempfile

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
for n in ('island__stream', 'island__pond', 'design__puddles', 'island__far'):
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

# ---- 小川の水 ----
pts = []
S = T['STREAM']
for i in range(len(S) - 1):
    (ax, az), (bx, bz) = S[i], S[i + 1]
    n = max(2, int(math.hypot(bx - ax, bz - az) / 0.4))
    for k in range(n):
        t = k / n
        pts.append((ax + (bx - ax) * t, az + (bz - az) * t))
pts.append(S[-1])
# 池の中には帯を入れない（池の縁で終える）
PX, PZ = T['POND']
pts = [q for q in pts if math.hypot(q[0] - PX, q[1] - PZ) > T['POND_R'] - 0.2]
# 角を丸める（3回ならす。端は動かさない）
for _ in range(3):
    pts = [pts[0]] + [((pts[i - 1][0] + 2 * pts[i][0] + pts[i + 1][0]) / 4, (pts[i - 1][1] + 2 * pts[i][1] + pts[i + 1][1]) / 4)
                      for i in range(1, len(pts) - 1)] + [pts[-1]]
bm = bmesh.new()
rows = []
N = len(pts)
for i, (x, z) in enumerate(pts):
    prog = i / (N - 1)
    j0, j1 = max(0, i - 1), min(N - 1, i + 1)
    tx, tz = pts[j1][0] - pts[j0][0], pts[j1][1] - pts[j0][1]
    L = math.hypot(tx, tz) or 1
    nx, nz = -tz / L, tx / L
    w = T['stream_w'](prog) * (1 + 0.12 * math.sin(i * 1.7))
    y = T['stream_level'](prog) + 0.03
    rows.append([bm.verts.new((x + nx * w * s, -(z + nz * w * s), y + 0.012 * rnd.uniform(-1, 1))) for s in (-1, 0, 1)])
for i in range(N - 1):
    a, b = rows[i], rows[i + 1]
    for k in range(2):
        bm.faces.new((a[k], a[k + 1], b[k + 1]))
        bm.faces.new((a[k], b[k + 1], b[k]))
W1, W2 = l2('#8fd4d2'), l2('#5fb7c4')
stream = finish('island__stream', bm, lambda p: [v * (1 + rnd.uniform(-0.05, 0.05)) for v in mix(W1, W2, rnd.random() * 0.6)], W)

# ---- 池の水の面（真ん中は少し深い青緑、縁ほど明るい浅瀬の色） ----
bm = bmesh.new()
PR = T['POND_R'] + 0.6
PY = 0.055  # 海（小さな波 0.035）より上、蓮の葉（0.075）より下
c0 = bm.verts.new((PX, -PZ, PY))
rings = []
for ri, f in enumerate((0.45, 0.8, 1.0)):
    rings.append([bm.verts.new((PX + PR * f * (1 + 0.05 * math.sin(3 * a + ri)) * math.cos(a), -(PZ + PR * f * math.sin(a)), PY))
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
for prog, rr in [(0.03, 0.9), (0.3, 0.8), (0.55, 0.85), (0.8, 0.9)]:
    f = prog * (len(S) - 1)
    i = min(int(f), len(S) - 2)
    t = f - i
    cx, cz = S[i][0] + (S[i + 1][0] - S[i][0]) * t, S[i][1] + (S[i + 1][1] - S[i][1]) * t
    y = T['height'](cx, cz) + 0.06
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
pud.hide_viewport = True

# ---- 遠くの山あいと河口（最初の向きの奥 230°） ----
FAR = 76.0  # 空の半球（半径 140）はカメラについて動く。カメラ（島から約 50 手前）から 140 より内側に
bm = bmesh.new()
A0, A1, GAP = 196.0, 264.0, 230.0
cols = []
NA = 46
top_prev = None
for layer, (dist, hmax, seed) in enumerate([(FAR + 8, 9.5, 2.1), (FAR, 6.0, 5.3)]):
    bot, top = [], []
    for k in range(NA + 1):
        a = A0 + (A1 - A0) * k / NA
        ar = math.radians(a)
        x, z = dist * math.cos(ar), dist * math.sin(ar)
        g = min(1.0, abs(a - GAP) / 7.0)  # 切れ目（河口）では低く
        edge = math.sin(math.pi * (a - A0) / (A1 - A0)) ** 0.6
        hh = hmax * edge * (0.55 + 0.45 * abs(math.sin(a * 0.21 + seed)) + 0.25 * math.sin(a * 0.57 + seed * 2)) * (0.12 + 0.88 * g ** 1.5)
        bot.append(bm.verts.new((x, -z, -0.2)))
        top.append(bm.verts.new((x, -z, max(0.3, hh))))
    for k in range(NA):
        bm.faces.new((bot[k], bot[k + 1], top[k + 1]))
        bm.faces.new((bot[k], top[k + 1], top[k]))
# 河口：切れ目から海へ注ぐ川（細い帯が手前に広がる）
for k in range(8):
    t0, t1 = k / 8, (k + 1) / 8
    def edge_pt(t, s):
        d = FAR + 1 - 7 * t
        a = math.radians(GAP + s * (0.6 + 2.6 * t))
        return bm.verts.new((d * math.cos(a), -d * math.sin(a), 0.05 + 0.5 * (1 - t)))
    q = [edge_pt(t0, -1), edge_pt(t0, 1), edge_pt(t1, 1), edge_pt(t1, -1)]
    bm.faces.new(q)
M_LO, M_HI, HAZE, RIV = l2('#9fb3c4'), l2('#b8c4d0'), l2('#efd3c8'), l2('#cfe3e6')


def far_col(p):
    c = p.center
    if c.z < 0.8 and p.normal.z > 0.5:
        return RIV
    t = max(0.0, min(1.0, c.z / 10))
    base = mix(M_LO, M_HI, t)
    base = mix(base, HAZE, 0.35 * (1 - t))  # ふもとは地平線の桃色にかすむ
    return [v * (1 + rnd.uniform(-0.04, 0.04)) for v in base]


far = finish('island__far', bm, far_col, W)

# ---- 言葉の植物の見本（真ん中のワクワクの木1本と、まわりの植物） ----
K = bpy.data.collections['V4Kit']
CAT = {'emotion': '#f6b2c2', 'body': '#f8c896', 'situation': '#aaccee', 'value': '#f2de96', 'curiosity': '#b2e8d0'}
GOLD = l2('#ffc65c')


def plant(kind, x, z, size, color=None, rot=None):
    y = T['height'](x, z) - 0.03
    rot = rnd.uniform(0, 2 * math.pi) if rot is None else rot
    out = []
    for o in K.objects:
        if not o.name.startswith(kind + '__'):
            continue
        d = bpy.data.objects.new('d_' + o.name, o.data.copy())
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
                c.color = (*mix(list(c.color)[:3], color, 0.28), 1)
        out.append(d)
    return out


objs = plant('tree_big', 0.0, 0.0, 2.1, GOLD, rot=0.4)
# 木のそばにいつも咲く花（気持ち・したいこと）と、まわりのまとまり
for ang, r, kind, cat, s in [(20, 2.0, 'flower', 'emotion', 1.5), (60, 2.4, 'flower', 'value', 1.4), (100, 1.9, 'flower', 'emotion', 1.3),
                             (300, 2.2, 'flower', 'value', 1.4), (335, 2.6, 'flower', 'emotion', 1.2), (250, 2.3, 'sprout', 'curiosity', 1.2)]:
    a = math.radians(ang)
    objs += plant(kind, r * math.cos(a), r * math.sin(a), s, l2(CAT[cat]))
groups = [((5.6, -2.0), [('bush', 'situation', 1.2), ('bush', 'situation', 1.0), ('flower', 'emotion', 1.4), ('grass', 'body', 1.0)]),
          ((-2.5, -6.0), [('tree_small', 'value', 1.0), ('tree_small', 'value', 0.85), ('flower', 'value', 1.4), ('sprout', 'value', 1.1)]),
          ((6.2, 3.4), [('grass', 'body', 1.1), ('grass', 'body', 0.9), ('flower', 'body', 1.3), ('bush', 'situation', 1.0)]),
          ((-6.6, 4.4), [('flower', 'emotion', 1.4), ('flower', 'emotion', 1.2), ('bush', 'situation', 1.1), ('sprout', 'emotion', 1.1)]),
          ((1.2, -7.6), [('flower', 'curiosity', 1.3), ('sprout', 'curiosity', 1.1), ('grass', 'body', 1.0)])]
for (gx, gz), items in groups:
    for k, (kind, cat, s) in enumerate(items):
        a = k * 2.4
        x, z = gx + 1.1 * math.cos(a) * (0.6 + 0.3 * k), gz + 1.1 * math.sin(a) * (0.6 + 0.3 * k)
        d, prog = T['stream_near'](x, z)
        if d < T['stream_w'](prog) + 0.5:
            continue
        objs += plant(kind, x, z, s, l2(CAT[cat]))
bpy.context.view_layer.update()
for o in objs:
    o.data.transform(o.matrix_world)
    o.matrix_world = o.matrix_world.Identity(4)
g = bpy.data.objects['v4__ground']
ns['light_objects'](objs, objs + [g], KEY)
print('stream tris', len(stream.data.polygons), 'far tris', len(far.data.polygons), 'design objs', len(D.objects))
