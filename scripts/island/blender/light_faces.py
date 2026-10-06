# 三角形ごとに光を計算して、色の属性 Baked（FLOAT_COLOR・CORNER）に書く。Blender の中で実行する。
# Blender の「頂点の色へ焼く」は面の角（頂点）で光を測るので、ローポリの角が隣の面にふさがれて真っ黒になった（飛び石・葉の玉の間）。
# ここでは三角形の真ん中で測る。ローポリは三角形ごとに1色なので、見え方にも合う。
#
# 使い方: ns = {}; exec(src, ns); ns['light_objects'](objs, occluders, sun_dir)
#   objs      … 色を書く物体（色の属性 Albedo＝塗り直した元の色 が要る）
#   occluders … 影や空の光をさえぎる物体（objs も含める）
#   sun_dir   … 光の来る向き（Blender の座標。上が +Z）
import bpy, bmesh, math, mathutils, random
from mathutils.bvhtree import BVHTree

SUN_COLOR = (1.0, 0.93, 0.82)   # 朝の光（少し暖かい）
SUN_K = 1.1                     # 日なたの強さ
SKY_COLOR = (0.78, 0.86, 0.95)  # 空からの光（少し青い）
GROUND_COLOR = (0.62, 0.66, 0.50)  # 下からの照り返し（草の色）
AMB_K = 0.52                    # 空からの光の強さ
AO_RAYS = 10                    # まわりの開け具合を測る光線の数
AO_DIST = 2.2                   # この距離までの物で、空の光がさえぎられる
SHADOW_KEEP = 0.4               # 影の中でも日なたの光を少し残す（v7。木の影が地面に硬い暗い三角になった）


def build_bvh(objs):
    bm = bmesh.new()
    for o in objs:
        tmp = bmesh.new()
        tmp.from_mesh(o.data)
        tmp.transform(o.matrix_world)
        m = bpy.data.meshes.new('_tmp_occ')
        tmp.to_mesh(m)
        tmp.free()
        bm.from_mesh(m)
        bpy.data.meshes.remove(m)
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    return tree


def hemisphere(n, k, rnd):
    # n のまわりの半球に、だいたい均等に光線を向ける（毎回同じになる乱数）
    out = []
    t = n.orthogonal().normalized()
    b = n.cross(t)
    for i in range(k):
        u = (i + rnd.random()) / k
        phi = 2 * math.pi * ((i * 0.618034) % 1.0)
        r = math.sqrt(u)
        z = math.sqrt(max(0.0, 1 - u))
        out.append((t * (r * math.cos(phi)) + b * (r * math.sin(phi)) + n * z).normalized())
    return out


def light_objects(objs, occluders, sun_dir):
    L = mathutils.Vector(sun_dir).normalized()
    tree = build_bvh(occluders)
    rnd = random.Random(5)
    for o in objs:
        me = o.data
        alb = me.color_attributes['Albedo']
        out = me.color_attributes.get('Baked') or me.color_attributes.new('Baked', 'FLOAT_COLOR', 'CORNER')
        M = o.matrix_world
        R = M.to_3x3()
        for p in me.polygons:
            c = M @ p.center
            n = (R @ p.normal).normalized()
            eps = 0.004
            # 面の表が何かに埋まっているとき（裏返った面）は、裏を表として扱う
            hit = tree.ray_cast(c + n * eps, n, 0.03)
            if hit[0] is not None:
                back = tree.ray_cast(c - n * eps, -n, 0.03)
                if back[0] is None:
                    n = -n
            # 日なた
            ndl = n.dot(L)
            sun = 0.0
            if ndl > 0:
                sh = tree.ray_cast(c + n * eps, L, 80.0)
                sun = ndl if sh[0] is None else ndl * SHADOW_KEEP
            # 空の光（まわりの開け具合）
            open_ = 0
            dirs = hemisphere(n, AO_RAYS, rnd)
            for d in dirs:
                if tree.ray_cast(c + n * eps, d, AO_DIST)[0] is None:
                    open_ += 1
            ao = open_ / AO_RAYS
            up = 0.5 + 0.5 * n.z
            amb = [GROUND_COLOR[k] * (1 - up) + SKY_COLOR[k] * up for k in range(3)]
            a = alb.data[p.loop_indices[0]].color
            col = [a[k] * (amb[k] * AMB_K * (0.5 + 0.5 * ao) + SUN_COLOR[k] * SUN_K * sun) for k in range(3)]
            for li in p.loop_indices:
                out.data[li].color = (*col, 1.0)
