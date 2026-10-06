# 島の景色（言葉ではない木・茂み・岩・池など）を置く。Blender の中で実行する（MCP の execute_blender_code に中身を渡す）。
# 前提: シーン IslandV4、テキスト island_terrain（地形の式）、コレクション PP_Library（L_名前 の素材。塗り直し済み）
# 何度実行しても同じ結果になる（V4Scenery を空にしてから置く。乱数の種は固定）
# 座標はアプリの (x, z)。Blender では (x, -z, 高さ)。カメラは最初 50° の向き（FRONT）にいる
import bpy, math, mathutils, random

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


def blocked(x, z, pad=0.6):
    # 小川・淵・池の上には置かない
    d, prog, k = T['stream_near'](x, z)
    if d < T['stream_w'](prog, k) + pad:
        return True
    if math.hypot(x - T['POOL'][0], z - T['POOL'][1]) < T['POOL_R'] + pad:
        return True
    return T['pond_u'](x, z) < 1 + pad / T['POND_R']


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


# 草地（言葉の植物が育つ所）は半径 MEADOW_R まで空けておく。奥（230°）の湧き水の左右（205°・258°）に林、右奥（300°）に小さな林
grove(205, 11.4, [('tree_sola', 1.0, (0, 0)), ('tree_birch', 0.95, (-1.6, 1.3)), ('tree_jarlan', 0.9, (1.5, 1.4)), ('tree_fir', 1.0, (-0.4, 2.6)),
                  ('bush_q', 1.0, (1.2, -1.1)), ('bush_berry', 0.9, (-1.4, -0.6)), ('shrub', 0.9, (2.6, 0.2)),
                  ('fern', 1.0, (0.6, -0.6)), ('fern', 0.8, (-0.8, 0.5)), ('fern', 0.9, (2.0, 1.9)),
                  ('mush_kenney', 1.0, (0.2, -1.3)), ('mush_kenney', 0.8, (0.5, -1.5)), ('log_fungus', 1.0, (-2.4, 1.0))])
grove(258, 11.6, [('tree_pine', 1.0, (0, 0)), ('tree_fir', 1.1, (1.7, 1.0)), ('tree_poplar', 1.0, (-1.5, 1.2)), ('tree_poplar', 0.85, (-2.6, -0.2)),
                  ('tree_jarlan', 0.95, (1.0, -1.6)), ('bush_jarlan', 1.0, (-0.6, -1.4)), ('bush_q', 0.85, (2.4, -0.6)),
                  ('fern', 0.9, (0.4, -0.9)), ('fern', 0.8, (-1.2, -0.3)), ('stump', 1.0, (2.2, 1.9)),
                  ('mush_white', 1.0, (0.9, -0.4)), ('mush_white', 0.8, (1.1, -0.2))])
grove(305, 11.2, [('tree_birch', 0.9, (0, 0)), ('tree_sola', 0.85, (1.4, 0.9)), ('bush_berry', 0.9, (-1.0, 0.8)),
                  ('fern', 0.9, (0.5, -0.9)), ('flower_plume', 0.9, (-0.6, -1.1))])
# 湧き水（小川が始まる所）：まわりに小さな岩とシダ。その奥の丘に大きな木を1本
# v7: 支流の始まり SPRING2 にも湧き水（小川は必ず湧き水から始まる）
for (sx, sz) in (T['SPRING'], T['SPRING2']):
    for ang, dd, name, sz_ in [(0, 1.0, 'rock_q', 0.45), (110, 0.95, 'rock_danni', 0.6), (200, 1.05, 'rock_q', 0.5), (290, 1.05, 'rock_danni', 0.45)]:
        a = math.radians(ang)
        place(name, (sx + dd * math.cos(a), sz + dd * math.sin(a)), sz_, sink=0.1, force=True)
    for ang in (60, 200):  # シダは2本ずつ（v7 の軽量化）
        a = math.radians(ang)
        place('fern', (sx + 1.6 * math.cos(a), sz + 1.6 * math.sin(a)), 0.8, force=True)
place('tree_sola2', P(236, 12.8), 1.35)
# 飾りの花は置かない（v7 の軽量化。言葉の花と見分けにくく、触っても何も出ない）
# 左：桜と花
place('tree_cherry', P(150, 8.9), 1.0)
place('rock_danni', P(154, 9.9), 1.0)
# 右手前：池（小川が行き着く所。ガマと蓮の葉）
px, pz = T['POND']
pr = T['POND_R']
for ang, dd, sz_ in [(200, 1.05, 1.0)]:  # ガマは1本（1本 約1100 三角形と重い）
    a = math.radians(ang)
    rr_ = T['pond_r'](a) * dd
    place('cattail', (px + rr_ * math.cos(a), pz + rr_ * math.sin(a)), sz_, sink=0.0, force=True)
for dx, dz in [(0.5, 0.3), (-0.9, -0.5), (1.0, -1.0), (-0.3, 1.2), (-1.4, 0.6), (1.6, 0.9)]:
    place('lily', (px + dx, pz + dz), 1.0, y=0.075, force=True)
place('rock_q', (px + T['pond_r'](-0.4) + 0.6, pz - 1.4), 0.8, force=True)
place('flower_zoe', (px - T['pond_r'](math.pi) - 0.6, pz + 1.2), 0.9, force=True)
place('flower_zoe', (px - T['pond_r'](math.pi) - 0.3, pz + 1.9), 0.7, force=True)
# 手前の野の花のまとまりはやめた（v7 の軽量化。景色の三角形の約4割が飾りの花だった）
# 岸の岩
for deg, rr, name, sz_ in [(112, 14.8, 'boulder', 1.0), (116, 15.2, 'rock_q', 0.7), (108, 15.4, 'rock_danni', 1.2),
                           (8, 15.2, 'boulder', 0.8), (14, 15.6, 'rock_danni', 1.0), (300, 15.0, 'rock_q', 0.9), (205, 15.0, 'boulder', 1.1),
                           (170, 15.1, 'boulder', 0.9), (330, 15.3, 'rock_danni', 0.9)]:
    place(name, P(deg, rr), sz_, sink=0.12)
# まばらな草
for deg, rr in [(95, 10.5), (70, 12.0), (30, 11.0), (330, 9.8), (250, 8.8), (170, 10.2), (125, 12.6), (345, 12.8), (190, 12.8), (280, 9.6)]:
    place('tall_grass' if int(deg) % 2 else 'tuft', P(deg, rr), 1.0)
print(len(S.objects), 'objects', sum(len(p.vertices) - 2 for o in S.objects for p in o.data.polygons), 'tris')
