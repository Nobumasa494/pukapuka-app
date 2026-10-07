# 流れる水のコマ（v7、2026-10-06）。Blender の中で design_preview.py のあとに実行する。
# ユーザー「完全にblenderで作ってほしい」：水面の明るい波の筋を、少しずつ下流へずらした N コマとして焼く。
# アプリはコマを順番に切り替えるだけ（模様を作らない・足さない）。
# - 元の水面 island__stream（小川）・island__river（池 → 海）の写しを N 個作り、Baked に波の筋を足す
#   名前は island__stream__f00 … island__river__f15
# - Blender でも再生すると動く（ユーザー「ここでアニメーションぽっく動かないけど」）：各コマに、タイムラインの位置から
#   「今はこのコマ」を決める式（ドライバー）を付ける。画面にも撮る絵にも同じコマが出る。速さはアプリと同じ 1秒に FPS コマ
#   小川を出さないとき（最初のころの絵）は、シーンの値 island_stream_off を 1 にする（shot_design.py）
# - 元の水面 island__stream・island__river は、コマの元として残し、画面でも撮る絵でも隠す（アプリにも書き出さない）
# - 筋の位相 ＝ 道すじの始まりからの長さ × K − 2π × コマ ÷ N。コマが進むと筋は下流へ進む。N コマでちょうど1めぐり（つなぎ目なし）
#   アプリは 1秒に FPS コマ。1めぐり N/FPS 秒で、筋は波長 2π/K 進む（速さ ＝ 波長 × FPS ÷ N）
# 何度実行しても同じ結果になる
import bpy, math

T = {}
exec(bpy.data.texts['island_terrain'].as_string(), T)
W = bpy.data.collections['V4World']
N = 16          # コマの数
FPS = 10        # アプリで切り替える速さ（1秒あたりのコマ）。アプリの WATER_FPS と同じにする
K = 2 * math.pi / 1.1   # 波長 1.1m → 速さ 1.1 × 10 ÷ 16 ≈ 0.69m/秒
GLINT = (0.95, 1.0, 1.0)


def flow_along(x, z, ks):
    # いちばん近い道すじの上での、始まりからの長さ（m）
    best, along = 1e9, 0.0
    for k in ks:
        S = T['STREAMS'][k]
        acc = 0.0
        for i in range(len(S) - 1):
            (ax, az), (bx, bz) = S[i], S[i + 1]
            dx, dz = bx - ax, bz - az
            L = math.hypot(dx, dz)
            t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / (L * L)))
            d = math.hypot(x - (ax + t * dx), z - (az + t * dz))
            if d < best:
                best, along = d, acc + t * L
            acc += L
    return along


def ss(a, b, x):
    return T['ss'](a, b, x)


for o in [o for o in W.objects if '__f' in o.name and (o.name.startswith('island__stream__') or o.name.startswith('island__river__'))]:
    me = o.data
    bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.meshes.remove(me)

SC = bpy.data.scenes['IslandV4']
SC['island_stream_off'] = 0


def add_drivers(o, f, can_hide):
    # 隠す（True）＝ 今のコマが f でない。小川は island_stream_off が 1 のときも隠す
    for prop in ('hide_viewport', 'hide_render'):
        o.driver_remove(prop)
        d = o.driver_add(prop).driver
        d.type = 'SCRIPTED'
        v = d.variables.new()
        v.name = 'fr'
        v.type = 'SINGLE_PROP'
        v.targets[0].id_type = 'SCENE'
        v.targets[0].id = SC
        v.targets[0].data_path = 'frame_current'
        # 「単純な式」だけで書く（% や or を使うと Python が要り、Blender の自動実行を切っていると、開き直したとき動かない）
        q = f'floor((fr - 1) * {FPS} / SC_FPS)'
        expr = f'({q} - {N} * floor({q} / {N}) != {f})'
        if can_hide:
            w = d.variables.new()
            w.name = 'off'
            w.type = 'SINGLE_PROP'
            w.targets[0].id_type = 'SCENE'
            w.targets[0].id = SC
            w.targets[0].data_path = '["island_stream_off"]'
            expr = f'{expr} + off > 0.5'
        d.expression = expr.replace('SC_FPS', str(SC.render.fps / SC.render.fps_base))


made = 0
RIVER = T['RIVER']
for base, ks in (('island__stream', tuple(k for k in range(len(T['STREAMS'])) if k != RIVER)), ('island__river', (RIVER,))):
    src = bpy.data.objects[base]
    flows = [flow_along(p.center.x, -p.center.y, ks) for p in src.data.polygons]
    bk0 = src.data.color_attributes['Baked']
    base_col = [tuple(bk0.data[p.loop_indices[0]].color) for p in src.data.polygons]
    for f in range(N):
        me = src.data.copy()
        me.name = f'{base}__f{f:02d}'
        bk = me.color_attributes['Baked']
        ph = 2 * math.pi * f / N
        for p, fl, c in zip(me.polygons, flows, base_col):
            w1 = math.sin(fl * K - ph)
            w2 = math.sin(fl * K * 2 - ph * 2 + 1.3)
            b = ss(0.55, 1.0, w1) * 0.05 + ss(0.8, 1.0, w2) * 0.03  # 弱く（0.16＋0.12 では横縞が板を並べたように見えた。アプリはこのコマを使わず光の網目の絵で流す）
            col = (min(1.0, c[0] + GLINT[0] * b), min(1.0, c[1] + GLINT[1] * b), min(1.0, c[2] + GLINT[2] * b), 1.0)
            for li in p.loop_indices:
                bk.data[li].color = col
        o = bpy.data.objects.new(me.name, me)
        W.objects.link(o)
        add_drivers(o, f, base == 'island__stream')
        made += 1
    src.hide_render = True
    src.hide_viewport = True
bpy.data.scenes['Scene']['island_water_frames'] = N
bpy.data.scenes['Scene']['island_water_fps'] = FPS
bad = [o.name for o in W.objects if '__f' in o.name and o.animation_data and any(not dr.driver.is_valid for dr in o.animation_data.drivers)]
simple = all(  # True でないと、自動実行を切った Blender では動かない
    dr.driver.is_simple_expression for o in W.objects if '__f' in o.name and o.animation_data for dr in o.animation_data.drivers)
print('water frames', made, 'drivers bad', bad, 'simple', simple, 'stream tris', len(bpy.data.objects['island__stream'].data.polygons), 'river tris', len(bpy.data.objects['island__river'].data.polygons))
