# 島の地面（v4__ground）を作り直す。Blender の中で実行する。前提: テキスト island_terrain、材質 PukaAlbedo、コレクション V4World
# 四角い格子（0.62 間隔、点を少しずらす）。丸い格子だと真ん中に三角形が集まってうず巻きが出る。色は三角形ごと（色の属性 Albedo）
import bpy, bmesh, math, random

T = {}
exec(bpy.data.texts['island_terrain'].as_string(), T)
W = bpy.data.collections['V4World']
o = bpy.data.objects.get('v4__ground')
if o:
    me0 = o.data
    bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.meshes.remove(me0)
STEP = 0.7
n = int(T['R_ISLAND'] * 1.18 * 1.3 / STEP)


def h01(i, j):
    s = math.sin(i * 127.1 + j * 311.7) * 43758.5453
    return s - math.floor(s)


bm = bmesh.new()
vid = {}
for i in range(-n, n + 1):
    for j in range(-n, n + 1):
        x = i * STEP + (h01(i, j) - 0.5) * STEP * 0.45
        z = j * STEP + (h01(j, i) - 0.5) * STEP * 0.45
        if T['zone'](x, z) > 1.32:
            continue
        vid[i, j] = bm.verts.new((x, -z, T['height'](x, z)))
for i in range(-n, n):
    for j in range(-n, n):
        q = [vid.get(k) for k in [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]]
        if None in q:
            continue
        if (i + j) % 2:
            bm.faces.new((q[0], q[1], q[2]))
            bm.faces.new((q[0], q[2], q[3]))
        else:
            bm.faces.new((q[0], q[1], q[3]))
            bm.faces.new((q[1], q[2], q[3]))
for f in bm.faces:
    f.normal_update()
    if f.normal.z < 0:
        f.normal_flip()
me = bpy.data.meshes.new('v4__ground')
bm.to_mesh(me)
bm.free()
for p in me.polygons:
    p.use_smooth = False
g = bpy.data.objects.new('v4__ground', me)
W.objects.link(g)


def l2(h):
    h = h.lstrip('#')
    return [((int(h[i:i + 2], 16) / 255 + 0.055) / 1.055) ** 2.4 for i in (0, 2, 4)]


G_TOP, G1, G2, G3 = l2('#9ccb83'), l2('#8fc27a'), l2('#7db46a'), l2('#6ea25f')
SAND, SAND2, LAG, DEEP = l2('#f3e2b8'), l2('#e6d3a3'), l2('#a8ddd0'), l2('#74c4cb')
PEB = l2('#a9a38c')  # 小川の岸の小石


def mix(a, b, t):
    return [a[k] * (1 - t) + b[k] * t for k in range(3)]


alb = me.color_attributes.new('Albedo', 'FLOAT_COLOR', 'CORNER')
rnd = random.Random(3)
for p in me.polygons:
    c = p.center
    x, z = c.x, -c.y
    u = T['zone'](x, z)
    h = c.z
    dp = math.hypot(x - T['POND'][0], z - T['POND'][1])
    if u > 1.0:
        col = mix(mix(SAND, LAG, T['ss'](1.0, 1.08, u)), DEEP, T['ss'](1.08, 1.22, u))
    elif u > 0.86:
        col = mix(SAND2, SAND, T['ss'](0.86, 0.92, u))
    else:
        # 草地：高い所は明るく、くぼみは少し濃く（起伏が色でも見える）
        col = mix(G2, G_TOP, T['ss'](0.35, 0.8, h)) if h < 1.0 else G1
        col = mix(col, G2, T['ss'](1.0, 1.6, h))
        col = mix(col, G3, T['ss'](1.5, 2.4, h))
        col = mix(col, SAND2, T['ss'](0.80, 0.86, u))
        pr = T['POND_R']
        if dp < pr + 0.9:
            col = mix(col, SAND2, T['ss'](pr + 0.9, pr + 0.2, dp))
        # 小川の岸：小石まじりの少し濃い色
        d, prog = T['stream_near'](x, z)
        w = T['stream_w'](prog)
        if d < w + 0.45:
            col = mix(col, PEB, T['ss'](w + 0.45, w + 0.1, d) * 0.7)
    j = 1 + (rnd.random() - 0.5) * 0.12
    col = [min(1, v * j) for v in col]
    for li in p.loop_indices:
        alb.data[li].color = (*col, 1)
me.materials.append(bpy.data.materials['PukaAlbedo'])
print('ground tris', len(me.polygons))
