# 空・海の色と、奥の景色のかすみ（v7、2026-10-06）。Blender の中で rebuild_world.py の最後に実行する。
# - 空 island__sky：澄んだ朝（上は淡い青、地平線は桃色からクリーム色、薄い雲の筋）。パノラマを撮らず、向きから直接色を決める
#   雲の筋が描けるよう、地平線から 30° までは高さ 1.5〜2° ごとに輪を入れる（前は 13°・17°・22°・30° と粗く、筋が出なかった）
# - 海 island__sea：空に合わせて落ち着いた青緑。島から離れるほど空の地平線の色へ（前は鮮やかすぎて空・草地から浮いた）
# - 奥の景色 v4__scenery：奥ほど地平線の色に少しかすませる（真ん中のワクワクの木を主役にする）
# 何度実行しても同じ結果になる
import bpy, bmesh, math, random, mathutils

T = {}
exec(bpy.data.texts['island_terrain'].as_string(), T)
W = bpy.data.collections['V4World']
SUN = mathutils.Vector(bpy.data.scenes['Scene']['island_sun_dir']).normalized()


def l2(h):
    h = h.lstrip('#')
    return [((int(h[i:i + 2], 16) / 255 + 0.055) / 1.055) ** 2.4 for i in (0, 2, 4)]


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return [a[k] * (1 - t) + b[k] * t for k in range(3)]


def ss(a, b, x):
    return T['ss'](a, b, x)


HORIZON = l2('#f6d8c8')   # 地平線のすぐ上（淡い桃色）
CREAM = l2('#fbeedd')     # その上のクリーム色
LOW_BLUE = l2('#cfe5f0')
MID_BLUE = l2('#acd4ec')
TOP_BLUE = l2('#93c5e6')
GLOW = l2('#fff1d2')      # 朝日のまわり
CLOUD = l2('#fffaf4')
CLOUD_SH = l2('#f3dfd6')  # 雲の下側（少し桃色）


def sky_color(d):
    e = math.degrees(math.asin(max(-1.0, min(1.0, d.z))))
    az = math.degrees(math.atan2(d.y, d.x))
    # 開いたときの画面の上の端は高さ約 10°（縦の画角 45°、見下ろす 0.3・上向き 0.09）。青はその中で出す
    c = mix(HORIZON, CREAM, ss(0.2, 1.8, e))
    c = mix(c, LOW_BLUE, ss(1.6, 5.0, e))
    c = mix(c, MID_BLUE, ss(4.5, 11.0, e))
    c = mix(c, TOP_BLUE, ss(11.0, 40.0, e))
    s = max(0.0, d.dot(SUN))
    c = mix(c, GLOW, 0.7 * s ** 60 + 0.22 * s ** 18)
    # 薄い雲の筋（開いたときの向き＝Blender の方位 130° のまわり）。青い所（高さ 6〜10°）に置き、下側に淡い桃色の影
    cl, sh = 0.0, 0.0
    for e0, a0, aw, th, k in [(7.0, 104, 15, 0.75, 1.0), (9.2, 140, 22, 0.9, 0.9), (6.2, 166, 12, 0.6, 0.8), (13.0, 120, 26, 1.3, 0.75)]:
        da = (az - a0 + 180) % 360 - 180
        wob = 0.7 + 0.3 * math.sin(math.radians(az) * 11 + e0)
        fa = math.exp(-(da / aw) ** 2) * wob * k
        cl += fa * math.exp(-((e - e0) / th) ** 2)
        sh += fa * math.exp(-((e - (e0 - th * 1.1)) / (th * 0.6)) ** 2)
    c = mix(c, CLOUD_SH, min(1.0, sh) * 0.45)
    return mix(c, l2('#ffffff'), min(1.0, cl) * 0.92)


# ---- 空：半球を細かい輪で作り直す ----
R = 140.0
ELS = [-20, -6, -2, 0, 0.6, 1.2, 1.8, 2.4, 3, 3.6, 4.2, 4.8, 5.4, 6, 6.6, 7.2, 7.8, 8.4, 9, 9.6, 10.2, 11, 12, 13.5, 15, 17, 20, 24, 30, 38, 50, 66]
NA = 120
o = bpy.data.objects.get('island__sky')
if o:
    me0 = o.data
    bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.meshes.remove(me0)
bm = bmesh.new()
rings = []
for e in ELS:
    er = math.radians(e)
    rings.append([bm.verts.new((R * math.cos(er) * math.cos(2 * math.pi * k / NA), R * math.cos(er) * math.sin(2 * math.pi * k / NA), R * math.sin(er)))
                  for k in range(NA)])
top = bm.verts.new((0, 0, R))
for i in range(len(rings) - 1):
    a, b = rings[i], rings[i + 1]
    for k in range(NA):
        k2 = (k + 1) % NA
        bm.faces.new((a[k], b[k2], b[k]))
        bm.faces.new((a[k], a[k2], b[k2]))
for k in range(NA):
    bm.faces.new((rings[-1][k], top, rings[-1][(k + 1) % NA]))
for f in bm.faces:  # 内側（真ん中）を向ける。カメラは空の中にいる
    f.normal_update()
    if f.normal.dot(f.calc_center_median()) > 0:
        f.normal_flip()
me = bpy.data.meshes.new('island__sky')
bm.to_mesh(me)
bm.free()
bk = me.color_attributes.new('Baked', 'FLOAT_COLOR', 'CORNER')
vcol = [sky_color(v.co.normalized()) for v in me.vertices]
for l in me.loops:
    bk.data[l.index].color = (*vcol[l.vertex_index], 1)
sky = bpy.data.objects.new('island__sky', me)
W.objects.link(sky)

# ---- 太陽：芯は暖かい白、外へ淡い金、いちばん外は新しい空の色になじませる ----
sun = bpy.data.objects['island__sun']
CORE, RIM = l2('#fffaea'), l2('#ffe6b0')
sbk = sun.data.color_attributes['Baked']
for l in sun.data.loops:
    v = sun.data.vertices[l.vertex_index].co
    d = v.normalized()
    ang = math.degrees(math.acos(max(-1.0, min(1.0, d.dot(SUN)))))
    if ang < 1.6:
        col = CORE
    elif ang < 2.7:
        col = mix(CORE, RIM, ss(1.6, 2.7, ang))
    else:
        col = mix(mix(RIM, sky_color(d), 0.55), sky_color(d), ss(2.7, 7.0, ang))
    sbk.data[l.index].color = (*col, 1)

# ---- 海：島から離れるほど地平線の色へ ----
NEAR, MID, FAR_, HZ = l2('#62b6c0'), l2('#86c6ca'), l2('#c9ddd9'), l2('#f2ddcf')
sea = bpy.data.objects['island__sea']
sm = sea.data
fa = sm.color_attributes.get('Facet')
sb = sm.color_attributes['Baked']
for p in sm.polygons:
    c = p.center
    r = math.hypot(c.x, c.y)
    col = mix(NEAR, MID, ss(24, 40, r))
    col = mix(col, FAR_, ss(40, 85, r))
    col = mix(col, HZ, ss(85, 140, r))
    for li in p.loop_indices:
        f = fa.data[li].color[0] if fa else 1.0
        sb.data[li].color = (*[v * f for v in col], 1)

# ---- 奥の景色を少しかすませる ----
sc = bpy.data.objects['v4__scenery']
alb = sc.data.color_attributes['Baked']
HAZE = l2('#e9e4da')
for p in sc.data.polygons:
    c = p.center
    x, z = c.x, -c.y
    t = 0.26 * ss(6.0, 16.0, T['back'](x, z))
    if t <= 0:
        continue
    for li in p.loop_indices:
        cc = alb.data[li].color
        alb.data[li].color = (*mix(list(cc)[:3], HAZE, t), 1)
print('sky tris', len(me.polygons), 'sea', len(sm.polygons))
