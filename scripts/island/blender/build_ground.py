# 島の地面（v4__ground）を作り直す。Blender の中で実行する。前提: テキスト island_terrain、材質 PukaAlbedo、コレクション V4World
# 四角い格子（0.8 間隔、点を少しずらす。v8：三角形を少し大きく、ずらしを小さく＝ローポリでも落ち着いた面）。丸い格子だと真ん中に三角形が集まってうず巻きが出る。色は三角形ごと（色の属性 Albedo）
import bpy, bmesh, math, random

T = {}
exec(bpy.data.texts['island_terrain'].as_string(), T)
W = bpy.data.collections['V4World']
o = bpy.data.objects.get('v4__ground')
if o:
    me0 = o.data
    bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.meshes.remove(me0)
STEP = 0.55  # v10：段の崖が切り立つよう細かく
BAND = 0.3  # 岸の線から内外この幅の点を、岸の線に寄せる（格子 0.55 の半分より広く、どの列にも岸の点ができる）


def snap(x, z, carve):
    # v10（2026-10-07、ユーザー「川の岸がギザギザで、しかも川が地面から浮いている」）：
    # 格子の点を水の縁（小川の岸の線・池の岸の線）にぴったり寄せ、その高さを水面のすぐ下にする。
    # 前は、粗い格子の三角形が水の板を好きな所で横切り、その線がぎざぎざの岸になった。三角形の縁が水の縁と同じ線にあれば、岸はなめらか
    if T['zone'](x, z) > 0.95:
        return x, z, T['height'](x, z, carve)
    names = list(T['PONDS']) if carve else ['lake']
    pu, pn = T['pond_near'](x, z, names)
    (cx, cz) = T['PONDS'][pn][0]
    ks = None if carve else (T['RIVER'],)
    d, prog, k, qx, qz = T['stream_proj'](x, z, ks)
    w = T['stream_w'](prog, k)
    r_edge = math.hypot(x - cx, z - cz) / max(pu, 1e-6)  # この向きの池の岸までの距離
    if abs(pu - 1) * r_edge < BAND and d > w + BAND:
        nx, nz = cx + (x - cx) / pu, cz + (z - cz) / pu
        return nx, nz, T['POND_LEVELS'][pn] - 0.01
    if abs(d - w) < BAND and pu > 1.05:
        if d < 1e-6 or abs(T['height'](x, z, carve) - T['stream_level'](prog, k)) > 0.6:
            return x, z, T['height'](x, z, carve)  # 滝（段の崖）の所は寄せない（寄せると崖の面に歯のような三角形ができた）
        if False:
            return x, z, T['height'](x, z, carve)
        nx, nz = qx + (x - qx) * w / d, qz + (z - qz) * w / d
        return nx, nz, T['stream_level'](prog, k) - 0.01
    return x, z, T['height'](x, z, carve)


def build(name, carve):
    o = bpy.data.objects.get(name)
    if o:
        me0 = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.meshes.remove(me0)
    n = int(T['R_ISLAND'] * 1.18 * 1.3 / STEP)


    def h01(i, j):
        s = math.sin(i * 127.1 + j * 311.7) * 43758.5453
        return s - math.floor(s)


    bm = bmesh.new()
    vid = {}
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            x = i * STEP + (h01(i, j) - 0.5) * STEP * 0.3
            z = j * STEP + (h01(j, i) - 0.5) * STEP * 0.3
            if T['zone'](x, z) > 1.12:  # 海の底の遠くは要らない（三角形を減らす）
                continue
            x, z, y = snap(x, z, carve)
            vid[i, j] = bm.verts.new((x, -z, y))
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
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = False
    g = bpy.data.objects.new(name, me)
    W.objects.link(g)


    def l2(h):
        h = h.lstrip('#')
        return [((int(h[i:i + 2], 16) / 255 + 0.055) / 1.055) ** 2.4 for i in (0, 2, 4)]


    # v8 の色：明るく澄んだ朝の草。低い所はやわらかい黄緑、山の上ほど少し深く青みのある緑（奥ほど淡くかすむのは world_colors）
    SAND, SAND2, PEB = T['SAND'], T['SAND2'], T['PEB']  # 草と砂の色は island_terrain の ground_albedo（岸の帯と同じ色にする）
    LAG, DEEP = l2('#a8ddd0'), l2('#74c4cb')
    CLIFF_HI, CLIFF_LO = l2('#c49a72'), l2('#9c7656')


    def mix(a, b, t):
        return [a[k] * (1 - t) + b[k] * t for k in range(3)]


    alb = me.color_attributes.new('Albedo', 'FLOAT_COLOR', 'CORNER')
    rnd = random.Random(3)
    for p in me.polygons:
        c = p.center
        x, z = c.x, -c.y
        u = T['zone'](x, z)
        a = math.atan2(z, x)
        bu = T['beach_u'](a)
        h = c.z
        if u > 1.0:
            # 浅瀬の色は水の下（高さ 0 より下）だけ。水の上の砂に塗ると、砂浜に青い水たまりのような形が出た
            col = mix(mix(SAND, LAG, T['ss'](0.02, -0.12, h)), DEEP, T['ss'](-0.12, -0.6, h))
        elif u > bu:
            col = T['ground_albedo'](x, z, h)
        else:
            col = T['ground_albedo'](x, z, h)
        dw_, pw_, kw_ = T['stream_near'](x, z)
        near_water = dw_ < T['stream_w'](pw_, kw_) + 0.9 or T['pond_near'](x, z)[0] < 1.35
        if p.normal.z < 0.62 and h > -0.3 and T['mountain'](x, z) < 0.3 and not near_water:  # 水ぎわの急な面は岩にしない（淵の縁・滝の横に暗い茶色の歯が出た）
            # 段の崖と島のまわりの崖の岩肌（v10：参考の絵のあたたかい茶色の岩）。山の斜面は草のまま
            col = mix(CLIFF_HI, CLIFF_LO, T['ss'](0.62, 0.15, p.normal.z))
            # 小川・淵の岸：細く薄い濡れた土の色（最初のころの地面は、海へ出る川の岸だけ）
            d, prog, k = T['stream_near'](x, z) if carve else T['stream_near'](x, z, (T['RIVER'],))
            w = T['stream_w'](prog, k)
            if d < w + 0.3:
                col = mix(col, PEB, T['ss'](w + 0.3, w + 0.05, d) * 0.3)
            pu, pn = T['pond_near'](x, z, None if carve else ['lake'])
            if pu < 1.5:
                col = mix(col, PEB, T['ss'](1.5, 1.08, pu) * 0.3)  # 池の岸：細く薄い濡れた土の色
        j = 1 + (rnd.random() - 0.5) * 0.06  # 三角形の明るさのばらつきは小さく（大きいとざらついて見えた）
        col = [min(1, v * j) for v in col]
        for li in p.loop_indices:
            alb.data[li].color = (*col, 1)
    me.materials.append(bpy.data.materials['PukaAlbedo'])
    print(name, 'tris', len(me.polygons))
    return g


build('v4__ground', True)
build('design__ground_early', False)
