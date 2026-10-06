# 島の地面・景色・光をまとめて作り直す。Blender の中で実行する（MCP の execute_blender_code に中身を渡す）。
# Windows の一時フォルダ（%TEMP%）に、このフォルダの island_terrain.py・build_ground.py・place_scenery.py・light_faces.py を置いてから実行する
# （WSL から: cp scripts/island/blender/*.py /mnt/c/Users/nobu2/AppData/Local/Temp/）
import bpy, bmesh, os, tempfile, time

TMP = tempfile.gettempdir()


def load(name, txt):
    src = open(os.path.join(TMP, name), encoding='utf-8').read()
    t = bpy.data.texts.get(txt) or bpy.data.texts.new(txt)
    t.clear()
    t.write(src)
    return src


t0 = time.time()
load('island_terrain.py', 'island_terrain')
exec(load('build_ground.py', 'island_build_ground'), {'__name__': '__main__'})
S = bpy.data.collections['V4Scenery']
S.hide_viewport = False
exec(load('place_scenery.py', 'island_place'), {'__name__': '__main__'})

# 景色を1つにまとめる（平たい石と蓮の葉だけ、面を上向きにそろえる）
W = bpy.data.collections['V4World']
old = bpy.data.objects.get('v4__scenery')
if old:
    m = old.data
    bpy.data.objects.remove(old, do_unlink=True)
    bpy.data.meshes.remove(m)
copies = []
for o in S.objects:
    d = bpy.data.objects.new('tmp', o.data.copy())
    W.objects.link(d)
    d.matrix_world = o.matrix_world
    copies.append(d)
    if o.name.startswith('s_rock_flat') or o.name.startswith('s_lily'):
        me = d.data
        bm = bmesh.new()
        bm.from_mesh(me)
        R = d.matrix_world.to_3x3()
        for f in bm.faces:
            f.normal_update()
            if (R @ f.normal).z < 0:
                f.normal_flip()
        bm.to_mesh(me)
        bm.free()
for x in bpy.context.view_layer.objects:
    x.select_set(False)
for d in copies:
    d.select_set(True)
bpy.context.view_layer.objects.active = copies[0]
bpy.ops.object.join()
j = bpy.context.view_layer.objects.active
j.name = 'v4__scenery'
j.data.name = 'v4__scenery'
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
S.hide_viewport = True

# 光（三角形ごと）。地面と景色はいっしょに、言葉の植物は種類ごとに
ns = {}
exec(load('light_faces.py', 'island_light'), ns)
key = list(bpy.data.scenes['Scene']['island_key_dir'])
g = bpy.data.objects['v4__ground']
s = bpy.data.objects['v4__scenery']
ns['light_objects']([g, s], [g, s], key)
K = bpy.data.collections['V4Kit']
for kind in sorted({o.name.split('__')[0] for o in K.objects if not o.name.startswith('fx__')}):
    group = [o for o in K.objects if o.name.startswith(kind + '__')]
    ns['light_objects'](group, group, key)
print('rebuild_world', round(time.time() - t0, 1), 's')
