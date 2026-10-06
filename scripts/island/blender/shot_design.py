# 島の配置図の静止画を撮る（v6、2026-10-05）。Blender の中で design_preview.py のあとに実行する。
# アプリと同じ見え方にするため、材質を一時的に ShowBaked（色の属性 Baked をそのまま出す）に替え、撮ったら戻す。
# 空と太陽はカメラについて動かす（アプリと同じ）。書き出しは %TEMP%\pk_v6_<名前>.png（WSL: /mnt/c/Users/nobu2/AppData/Local/Temp/）
import bpy, math, mathutils, os, tempfile

T = {}
exec(bpy.data.texts['island_terrain'].as_string(), T)
sc = bpy.data.scenes['IslandV4']
cam = bpy.data.objects['V4Cam']
sky, sun = bpy.data.objects['island__sky'], bpy.data.objects['island__sun']
TMP = tempfile.gettempdir()
SHOW = bpy.data.materials['ShowBaked']
D = bpy.data.collections['V6Design']
pud = bpy.data.objects['design__puddles']
stream = bpy.data.objects['island__stream']

objs = [o for o in sc.objects if o.type == 'MESH' and not o.hide_render and o.data.color_attributes.get('Baked')]
objs += [pud]
saved = {o.name: [s.material for s in o.material_slots] for o in objs}


def shot(name, az, el, dist, target, res=50):
    tx, tz = target
    ty = T['height'](tx, tz) + 0.6
    d = mathutils.Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    tgt = mathutils.Vector((tx, -tz, ty))
    cam.location = tgt + d * dist
    q = (-d).to_track_quat('-Z', 'Y')
    cam.rotation_euler = (q.to_matrix().to_4x4() @ mathutils.Matrix.Rotation(0.09, 4, 'X')).to_euler()
    sky.location = cam.location
    sun.location = cam.location
    sc.render.resolution_percentage = res
    sc.render.filepath = os.path.join(TMP, 'pk_v6_' + name + '.png')
    bpy.ops.render.render(write_still=True, scene=sc.name)


try:
    for o in objs:
        for s in o.material_slots:
            s.material = SHOW
    sc.camera = cam
    AZ = T['AZ0']
    shot('1_open', AZ, 0.3, 50, (0, 0))
    shot('2_above', AZ + 0.35, 0.95, 62, (0, 0))
    shot('3_walk', AZ - 0.5, 0.22, 17, (-1.0, 2.0))
    # 最初のころ：言葉の植物は芽だけ、小川はまだなく水たまり
    for o in D.objects:
        o.hide_render = not o.name.startswith('d_sprout')
    stream.hide_render = True
    pud.hide_render = False
    shot('4_early', AZ, 0.3, 50, (0, 0))
finally:
    for o in D.objects:
        o.hide_render = False
    stream.hide_render = False
    pud.hide_render = True
    for o in objs:
        for s, m in zip(o.material_slots, saved[o.name]):
            s.material = m
    sky.location = sun.location = (0, 0, 0)
print('done')
