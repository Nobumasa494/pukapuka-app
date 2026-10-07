# 島の配置図の静止画を撮る（v6 2026-10-05、v7 2026-10-06）。Blender の中で design_preview.py のあとに実行する。
# アプリと同じ見え方にするため、材質を一時的に ShowBaked（色の属性 Baked をそのまま出す）に替え、撮ったら戻す。
# 空と太陽はカメラについて動かす（アプリと同じ）。書き出しは %TEMP%\pk_v7_<名前>.png（WSL: /mnt/c/Users/nobu2/AppData/Local/Temp/）
import bpy, math, mathutils, os, tempfile

T = {}
exec(bpy.data.texts['island_terrain'].as_string(), T)
sc = bpy.data.scenes['IslandV4']
cam = bpy.data.objects['V4Cam']
sky, sun = bpy.data.objects['island__sky'], bpy.data.objects['island__sun']
TMP = tempfile.gettempdir()
SHOW = bpy.data.materials.get('ShowBaked')
if SHOW is None:  # 色の属性 Baked をそのまま出す材質（ファイルに無ければ作る）
    SHOW = bpy.data.materials.new('ShowBaked')
    SHOW.use_nodes = True
    nt = SHOW.node_tree
    nt.nodes.clear()
    attr = nt.nodes.new('ShaderNodeAttribute')
    attr.attribute_name = 'Baked'
    em = nt.nodes.new('ShaderNodeEmission')
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(attr.outputs['Color'], em.inputs['Color'])
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
D = bpy.data.collections['V6Design']
pud = bpy.data.objects['design__puddles']
SCN = bpy.data.scenes['IslandV4']  # 小川のコマは、シーンの値 island_stream_off で隠す（water_frames.py のドライバー）

objs = [o for o in sc.objects if o.type == 'MESH' and o.data.color_attributes.get('Baked')]
ground, early_ground = bpy.data.objects['v4__ground'], bpy.data.objects['design__ground_early']
pool = bpy.data.objects['island__pool']
saved = {o.name: [s.material for s in o.material_slots] for o in objs}


def shot(name, az, el, dist, target, res=50, tilt=0.09):
    tx, tz = target
    ty = T['height'](tx, tz) + 0.6
    d = mathutils.Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    tgt = mathutils.Vector((tx, -tz, ty))
    cam.location = tgt + d * dist
    q = (-d).to_track_quat('-Z', 'Y')
    cam.rotation_euler = (q.to_matrix().to_4x4() @ mathutils.Matrix.Rotation(tilt, 4, 'X')).to_euler()
    sky.location = cam.location
    sun.location = cam.location
    sc.render.resolution_percentage = res
    sc.render.filepath = os.path.join(TMP, 'pk_v7_' + name + '.png')
    bpy.ops.render.render(write_still=True, scene=sc.name)


try:
    for o in objs:
        if not o.material_slots:
            o.data.materials.append(SHOW)
        for s in o.material_slots:
            s.material = SHOW
    sc.camera = cam
    AZ = T['AZ0']
    OPEN = 46  # 開いたときの距離（島 半径 19 に合わせる。50 では砂浜と海が広く写った）
    # 空の半球（半径 140）はカメラについて動くので、遠くから撮ると、その向こうの海・遠くの山が隠れる。この1枚だけ空と太陽を3倍に
    sky.scale = sun.scale = (3, 3, 3)
    shot('0_ref', AZ, 0.62, 74, (3.0, 4.0), tilt=0.16)
    sky.scale = sun.scale = (1, 1, 1)  # 参考の絵と同じ、高い所から島全体と空（上を向けて空と雲も入れる）  # 参考の絵と同じ、高い所から島全体（v10）
    shot('1_open', AZ, 0.3, OPEN, (0, 0))
    shot('2_above', AZ + 0.35, 0.95, 88, (0, 0))
    shot('3_walk', AZ - 0.5, 0.22, 17, (-1.0, 2.0))
    shot('5_overview', AZ + 0.55, 0.62, 82, (0, 0))  # 斜め上から島全体（島の形・岸・遠くの山の奥行きを見る）。島 半径 23 に合わせて 68
    # 近くからの組（2026-10-07。水の縁・つなぎ目・河口を見る。遠くの1枚だけでは、浮き・ギザギザ・ぷつっと切れるのを見落とした）
    for nm, tgt, dist, el, daz in [('c1_pool', T['POOL'], 10, 0.95, 0.0), ('c2_pond', T['POND'], 16, 0.5, 0.0),
                                  ('c3_mouth', T['P'](44, 24.0), 14, 0.5, 0.0), ('c4_falls', T['PONDS']['tarnL'][0], 13, 0.4, 0.3),
                                  ('c5_west', T['PONDS']['pondW'][0], 14, 0.45, 0.6), ('c6_tarnR', T['PONDS']['tarnR'][0], 13, 0.45, -0.4)]:  # 湧き水・小川は横から（正面からだと木の中に入った）
        shot(nm, AZ + daz, el, dist, tgt)
    # 最初のころ：ワクワクの若木と芽が少し。小川はまだなく（溝もない地面）、水たまりと湧き水だけ
    for o in D.objects:
        o.hide_render = not o.name.startswith('e_')
    SCN['island_stream_off'] = 1
    for o in (pool, ground):
        o.hide_render = True
    pud.hide_render = False
    early_ground.hide_render = False
    shot('4_early', AZ, 0.3, OPEN, (0, 0))
finally:
    for o in D.objects:
        o.hide_render = o.name.startswith('e_')
    SCN['island_stream_off'] = 0
    for o in (pool, ground):
        o.hide_render = False
    pud.hide_render = True
    early_ground.hide_render = True
    for o in objs:
        for s, m in zip(o.material_slots, saved[o.name]):
            s.material = m
    sky.location = sun.location = (0, 0, 0)
print('done')
