# 島の景色（言葉ではない木・茂み・岩・池など）を置く。Blender の中で実行する（MCP の execute_blender_code に中身を渡す）。
# 前提: シーン IslandV4、テキスト island_terrain（地形の式）、コレクション PP_Library（L_名前 の素材。塗り直し済み）
# 何度実行しても同じ結果になる（V4Scenery を空にしてから置く。乱数の種は固定）
# 座標はアプリの (x, z)。Blender では (x, -z, 高さ)。カメラは最初 50° の向き（FRONT）にいる
import bpy, bmesh, math, mathutils, random

T = {}
exec(bpy.data.texts['island_terrain'].as_string(), T)
S = bpy.data.collections['V4Scenery']
for o in list(S.objects):
    me = o.data
    bpy.data.objects.remove(o, do_unlink=True)
    if me and me.users == 0:
        bpy.data.meshes.remove(me)

# 目標の大きさ（高さ。岩の平たいもの・蓮の葉は幅）
HEIGHT = {'tree_sola': 4.2, 'tree_sola2': 4.0, 'tree_jarlan': 3.6, 'tree_birch': 4.6, 'tree_poplar': 5.0, 'tree_fir': 4.6, 'tree_pine': 4.2,
          'tree_cherry': 3.6, 'tree_apple': 3.2, 'tree_young': 2.4, 'bush_q': 1.0, 'bush_berry': 1.0, 'bush_jarlan': 1.1, 'shrub': 1.2,
          'flower_plume': 0.7, 'flower_group': 0.5, 'flower_zoe': 0.6, 'flower_single': 0.6, 'fern': 0.7, 'tall_grass': 0.7, 'tuft': 0.5,
          'plant_big': 0.6, 'rock_q': 0.9, 'boulder': 1.4, 'rock_danni': 0.6, 'mush_kenney': 0.35, 'mush_white': 0.3, 'log_q': 0.5,
          'log_fungus': 0.5, 'stump': 0.6, 'cattail': 1.0}
WIDTH = {'rock_flat': 1.15, 'lily': 0.9}


def meshes(root):
    return [c for c in root.children_recursive if c.type == 'MESH']


def bbox(objs):
    pts = [o.matrix_world @ mathutils.Vector(c) for o in objs for c in o.bound_box]
    return (mathutils.Vector([min(p[i] for p in pts) for i in range(3)]),
            mathutils.Vector([max(p[i] for p in pts) for i in range(3)]))


# 素材ごとに「根もとを原点・目標の大きさ」にする行列（素材の親を単位行列にして測る）
NORM = {}
for name in list(HEIGHT) + list(WIDTH):
    root = bpy.data.objects['L_' + name]
    root.matrix_world = mathutils.Matrix.Identity(4)
    bpy.context.view_layer.update()
    mn, mx = bbox(meshes(root))
    s = WIDTH[name] / max(mx.x - mn.x, mx.y - mn.y) if name in WIDTH else HEIGHT[name] / max(1e-6, mx.z - mn.z)
    base = mathutils.Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    NORM[name] = (mathutils.Matrix.Scale(s, 4) @ mathutils.Matrix.Translation(-base),
                  {c.name: c.matrix_world.copy() for c in meshes(root)})


KS = T['R_ISLAND'] / 16.0  # v4（半径 16）の置き場所を、大きくした島に合わせる倍率


def P(deg, r):
    a = math.radians(deg)
    return (r * KS * math.cos(a), r * KS * math.sin(a))


rnd = random.Random(11)


def slope_at(x, z):
    h0 = T['height'](x, z)
    return max(abs(T['height'](x + dx, z + dz) - h0) for dx, dz in ((0.5, 0), (-0.5, 0), (0, 0.5), (0, -0.5)))


def blocked(x, z, pad=0.6):
    # 小川・池の上、崖の上・崖の外には置かない
    d, prog, k = T['stream_near'](x, z)
    if d < T['stream_w'](prog, k) + pad:
        return True
    if T['zone'](x, z) > 0.92:
        return True
    if T['pond_near'](x, z)[0] < 1.25:
        return True
    return slope_at(x, z) > 0.3


def place(name, xz, size=1.0, rot=None, sink=0.04, y=None, force=False):
    x, z = xz
    if not force and blocked(x, z):
        return
    if y is None:  # 斜面で浮かないよう、まわり4点の一番低い所に
        y = min(T['height'](x, z), *[T['height'](x + dx, z + dz) for dx, dz in [(0.3, 0), (-0.3, 0), (0, 0.3), (0, -0.3)]]) - sink
    rot = rnd.uniform(0, 2 * math.pi) if rot is None else rot
    M = mathutils.Matrix.LocRotScale(mathutils.Vector((x, -z, y)), mathutils.Euler((0, 0, rot)), mathutils.Vector((size, size, size)))
    Nm, mw = NORM[name]
    for cname, cmw in mw.items():
        c = bpy.data.objects[cname]
        d = bpy.data.objects.new('s_' + name, c.data.copy())
        S.objects.link(d)
        d.matrix_world = M @ Nm @ cmw


def grove(center_deg, r, items):
    cx, cz = P(center_deg, r)
    for name, size, (dx, dz) in items:
        place(name, (cx + dx, cz + dz), size)


# v10（2026-10-07、ユーザーの参考の絵「この写真をもとに最初から作り直してほしい」）
#   木は参考の絵と同じ、単純なローポリ（円すいを重ねた針葉樹・丸い玉の広葉樹・桃色の桜）を自分で作る（軽く、絵柄がそろう）。
#   左右と右手前に濃い林のかたまり、山のふもとの段に針葉樹、湖のまわりに桜、手前の段に花畑
TP = T['P']
rnd2 = random.Random(5)


def l2(h):
    h = h.lstrip('#')
    return [((int(h[i:i + 2], 16) / 255 + 0.055) / 1.055) ** 2.4 for i in (0, 2, 4)]


CON = [l2(c) for c in ('#4e8f45', '#5a9c4a', '#468540', '#64a650')]   # 針葉樹（濃すぎると黒い穴に見えた）
ROUND = [l2(c) for c in ('#6fa84a', '#7fb550', '#5f9a44', '#8cbf55')]  # 広葉樹
PINK = [l2(c) for c in ('#f2a7c3', '#ee98b8', '#f6bcd2')]
TRUNK = l2('#7a5236')
FLOWER = [l2(c) for c in ('#f6a2b8', '#f8d06a', '#9cc4ee', '#c4a6ef', '#f8b886')]
PROC = []  # (bmesh の作り方, 色) を1つのメッシュにまとめる


def ground_y(x, z):
    return min(T['height'](x, z), *[T['height'](x + dx, z + dz) for dx, dz in [(0.3, 0), (-0.3, 0), (0, 0.3), (0, -0.3)]]) - 0.05


class Builder:
    def __init__(self):
        self.bm = bmesh.new()
        self.cols = []

    def cone(self, x, y, z, r, h, n, col, rot=0.0):
        vs = [self.bm.verts.new((x + r * math.cos(rot + 2 * math.pi * i / n), -(z + r * math.sin(rot + 2 * math.pi * i / n)), y)) for i in range(n)]
        top = self.bm.verts.new((x, -z, y + h))
        for i in range(n):
            self.bm.faces.new((vs[i], vs[(i + 1) % n], top))
            self.cols.append(col)
        self.bm.faces.new(list(reversed(vs)))
        self.cols.append(col)

    def ball(self, x, y, z, r, col, sq=0.85, rot=0.0):
        g = bmesh.ops.create_icosphere(self.bm, subdivisions=1, radius=r)
        for v in g['verts']:
            vx, vy, vz = v.co
            v.co = (x + vx * math.cos(rot) - vy * math.sin(rot), -z + vx * math.sin(rot) + vy * math.cos(rot), y + vz * sq)
        for f in {f for v in g['verts'] for f in v.link_faces} - set(getattr(self, '_done', set())):
            pass
        n = len(self.bm.faces) - len(self.cols)
        k = 0.92
        for i in range(n):
            self.cols.append([c * (k + 0.16 * rnd2.random()) for c in col])

    def trunk(self, x, y, z, r, h):
        self.cone(x, y - 0.1, z, r, h, 5, TRUNK)


B = Builder()


def conifer(x, z, s=1.0):
    y = ground_y(x, z)
    col = CON[rnd2.randrange(len(CON))]
    B.trunk(x, y, z, 0.16 * s, 0.9 * s)
    for i, (r, hh, lift) in enumerate(((0.95, 1.5, 0.45), (0.75, 1.3, 1.15), (0.5, 1.1, 1.8))):
        B.cone(x, y + lift * s, z, r * s, hh * s, 7, [c * (1 + 0.06 * i) for c in col], rnd2.random())


def roundtree(x, z, s=1.0, cols=ROUND):
    y = ground_y(x, z)
    B.trunk(x, y, z, 0.18 * s, 1.3 * s)
    col = cols[rnd2.randrange(len(cols))]
    B.ball(x, y + 1.55 * s, z, 0.95 * s, col, 0.85, rnd2.random())
    if rnd2.random() < 0.6:
        B.ball(x + 0.45 * s, y + 1.25 * s, z + 0.3 * s, 0.6 * s, col, 0.85, rnd2.random())


def bush(x, z, s=1.0):
    y = ground_y(x, z)
    B.ball(x, y + 0.25 * s, z, 0.5 * s, ROUND[rnd2.randrange(len(ROUND))], 0.7, rnd2.random())


def flower(x, z):
    y = T['height'](x, z)
    col = FLOWER[rnd2.randrange(len(FLOWER))]
    B.cone(x, y, z, 0.05, 0.28, 3, l2('#5c8f3c'))
    B.ball(x, y + 0.3, z, 0.09, col, 0.7)


def scatter(deg0, deg1, r0, r1, spacing, fn, tries=900, extra=None):
    pts = []
    for _ in range(tries):
        a = math.radians(rnd2.uniform(deg0, deg1))
        r = math.sqrt(rnd2.uniform(r0 * r0, r1 * r1))
        x, z = r * math.cos(a), r * math.sin(a)
        if math.hypot(x, z) < T['MEADOW_R'] + 0.5 or blocked(x, z, 0.5):
            continue
        if extra and not extra(x, z):
            continue
        if any((x - px) ** 2 + (z - pz) ** 2 < spacing * spacing for px, pz in pts):
            continue
        pts.append((x, z))
        fn(x, z)
    return pts


def mixed(p_con):
    return lambda x, z: conifer(x, z, rnd2.uniform(0.85, 1.25)) if rnd2.random() < p_con else roundtree(x, z, rnd2.uniform(0.85, 1.2))


# 左の林・右の林・右手前の林（濃いかたまり。参考の絵の左右）
scatter(150, 205, 13, 23.5, 1.8, mixed(0.6))
scatter(285, 335, 13, 23.5, 1.8, mixed(0.5))
scatter(355, 25, 16, 23.5, 2.6, mixed(0.45), extra=lambda x, z: T['pond_near'](x, z)[0] > 1.6)  # 手前の林は薄く（開いたときに島の手前をふさいだ）
# 山のふもとの段の針葉樹（点々と）
scatter(195, 275, 11, 22, 2.2, lambda x, z: conifer(x, z, rnd2.uniform(0.8, 1.1)), tries=400)
# 左手前の林の縁と、左の段の木
scatter(110, 150, 16, 23, 2.4, mixed(0.4), tries=300)
# 湖のまわりの桜
(px, pz), LA, LB, LD = T['PONDS']['lake']


def lake_edge(deg, out):
    a = math.radians(deg)
    r = 1 / T['pond_shape']('lake', px + math.cos(a), pz + math.sin(a)) + out
    return (px + r * math.cos(a), pz + r * math.sin(a))


for deg, out, s_ in [(290, 1.3, 1.35), (320, 1.5, 1.2), (350, 1.4, 1.1), (205, 1.4, 1.25), (95, 1.4, 1.1), (240, 1.6, 1.15), (130, 1.5, 1.0)]:
    x, z = lake_edge(deg, out)
    if not blocked(x, z, 0.3):
        roundtree(x, z, s_, PINK)  # 湖のまわりの大きな桜（参考の絵）
# 手前の段の花畑（参考の絵の色とりどりの花）
# 花は同じ色どうしのかたまりで（ばらばらの白い点は、ざらついたノイズに見えた）
for deg, rr, ci in [(70, 14, 0), (88, 17, 1), (104, 15, 2), (60, 19, 3), (96, 21, 4), (30, 14, 0), (118, 19, 1)]:
    cx, cz = TP(deg, rr)
    col_ = FLOWER[ci]
    for k in range(26):
        a = k * 2.39996
        r = 0.32 * math.sqrt(k + 0.5)
        x, z = cx + r * math.cos(a), cz + r * math.sin(a)
        if not blocked(x, z, 0.3):
            y = T['height'](x, z)
            B.cone(x, y, z, 0.05, 0.3, 3, l2('#5c8f3c'))
            B.ball(x, y + 0.32, z, 0.12, col_, 0.7)
# 茂み
scatter(0, 360, 11, 22, 3.0, lambda x, z: bush(x, z, rnd2.uniform(0.8, 1.2)), tries=300)

me = bpy.data.meshes.new('s_proc')
B.bm.to_mesh(me)
B.bm.free()
alb = me.color_attributes.new('Albedo', 'FLOAT_COLOR', 'CORNER')
for p, c in zip(me.polygons, B.cols):
    p.use_smooth = False
    for li in p.loop_indices:
        alb.data[li].color = (*c, 1)
me.materials.append(bpy.data.materials['PukaAlbedo'])
S.objects.link(bpy.data.objects.new('s_proc', me))

# 湧き水：まわりに小さな岩
for (sx, sz) in T['SPRINGS']:
    for ang, dd, name, sz_ in [(30, 0.9, 'rock_q', 0.5), (190, 0.9, 'rock_danni', 0.55)]:
        a = math.radians(ang)
        place(name, (sx + dd * math.cos(a), sz + dd * math.sin(a)), sz_, sink=0.1, force=True)
# 段の池のまわりの岩（参考の絵：池のふちに岩）
for nm in ('tarnL', 'tarnR', 'tarnC', 'pondW', 'pondE'):
    (cx, cz), A, Bb, dg = T['PONDS'][nm]
    for off, name, sz_ in ((100, 'rock_danni', 0.8), (190, 'rock_q', 0.6), (280, 'boulder', 0.55)):
        a = math.radians(dg + off)
        place(name, (cx + (Bb + 0.5) * math.cos(a), cz + (Bb + 0.5) * math.sin(a)), sz_, sink=0.1, force=True)
# 湖：ガマと蓮の葉
place('cattail', lake_edge(170, 0.2), 1.0, sink=0.0, force=True)
for dx, dz in [(0.8, -0.6), (-1.3, -1.0), (1.8, 0.8), (-0.5, 0.9), (-2.4, 0.2), (2.6, -0.4), (0.2, -1.8)]:
    place('lily', (px + dx, pz + dz), 1.0, y=T['POND_LEVEL'] + 0.05, force=True)
# 橋：海へ出る川にかかる石の橋（参考の絵）
S_R = T['STREAMS'][T['RIVER']]
f = T['BRIDGE_PROG'] * (len(S_R) - 1)
i = int(f)
bx, bz = S_R[i]
tx, tz = S_R[i + 1][0] - S_R[i - 1][0], S_R[i + 1][1] - S_R[i - 1][1]
L = math.hypot(tx, tz)
tx, tz = tx / L, tz / L
nx, nz = -tz, tx
w = T['stream_w'](T['BRIDGE_PROG'], T['RIVER']) + 1.2
lv = T['stream_level'](T['BRIDGE_PROG'], T['RIVER'])
bank = max(T['height'](bx + nx * w, bz + nz * w), T['height'](bx - nx * w, bz - nz * w))
bm = bmesh.new()
STONE = l2('#c9b9a2')
NS = 10
for k in range(NS):
    for side in (0,):
        t0, t1 = k / NS, (k + 1) / NS
        def pt(t, sgn, up):
            s_ = -w + 2 * w * t
            y = bank + 0.15 + 0.55 * math.sin(math.pi * t) + up
            return bm.verts.new((bx + nx * s_ + tx * 0.6 * sgn, -(bz + nz * s_ + tz * 0.6 * sgn), y))
        a0, a1, b0, b1 = pt(t0, -1, 0), pt(t1, -1, 0), pt(t0, 1, 0), pt(t1, 1, 0)
        c0, c1, d0, d1 = pt(t0, -1, -0.3), pt(t1, -1, -0.3), pt(t0, 1, -0.3), pt(t1, 1, -0.3)
        bm.faces.new((a0, a1, b1, b0))
        bm.faces.new((c0, c1, a1, a0))
        bm.faces.new((b0, b1, d1, d0))
me = bpy.data.meshes.new('s_bridge')
bm.to_mesh(me)
bm.free()
alb = me.color_attributes.new('Albedo', 'FLOAT_COLOR', 'CORNER')
for p in me.polygons:
    p.use_smooth = False
    for li in p.loop_indices:
        alb.data[li].color = (*[c * (0.92 + 0.12 * rnd2.random()) for c in STONE], 1)
me.materials.append(bpy.data.materials['PukaAlbedo'])
S.objects.link(bpy.data.objects.new('s_bridge', me))
print(len(S.objects), 'objects', sum(len(p.vertices) - 2 for o in S.objects for p in o.data.polygons), 'tris')
