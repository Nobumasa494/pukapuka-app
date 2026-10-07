# 島をアプリ用に書き出す（v7、2026-10-06）。Blender の中で、rebuild_world.py → design_preview.py のあとに実行する。
# 書き出し先: アプリの assets/island/kit.glb（WSL のパスを Windows から書く）。そのあと WSL で node scripts/island/glb-to-ts.mjs
#
# 決まり（スキル pukapuka-island の「地面・海・空を Blender にしたときの問題」）
# - 元の物体の属性は消さない。写し（名前の最後に .x）を作り、Baked 以外の色の属性を消し、変形を適用して書き出し、すぐ消す
# - 言葉の植物の部品（V4Kit）は、光の底上げ（葉・幹 58%、実・花びら 55%）を写しにだけ入れる（葉の玉の奥が黒くなるため）
# 何度実行しても同じ結果になる
import bpy, os

OUT = r'\\wsl.localhost\Ubuntu\home\Nobumasa494\pukapuka-app\assets\island\kit.glb'
# Blender の名前 → アプリの部品の名前
WORLD = {
    # 地面は、光を焼く前の元の色（下の island__ground_albedo）と光の絵（bake_lightmap.py）で描くので、光を焼いた地面は書き出さない
    'v4__scenery': 'island__scenery',
    'island__sea': 'island__sea',
    'island__sky': 'island__sky',
    'island__sun': 'island__sun',
    'island__far': 'island__far',
    # 小川・池から海へ出る川は、下の「流れる水のコマ」だけを書き出す（元の水面はコマの元）
    'island__pool': 'island__pool',
    'island__pond': 'island__pond',
    'island__spring': 'island__spring',
    'design__puddles': 'island__puddles',          # 最初のころの水たまり（1か月）
}
KIT = bpy.data.collections['V4Kit']
tmp = bpy.data.collections.get('ExportTmp') or bpy.data.collections.new('ExportTmp')
if tmp.name not in bpy.context.scene.collection.children:
    bpy.context.scene.collection.children.link(tmp)
for o in list(tmp.objects):
    bpy.data.objects.remove(o, do_unlink=True)

copies = []


def make_copy(src, name, floor=None, attr='Baked'):
    me = src.data.copy()
    for a in [a.name for a in me.color_attributes if a.name != attr]:
        me.color_attributes.remove(me.color_attributes[a])
    me.materials.clear()
    me.transform(src.matrix_world)
    if floor is not None:
        # 光の底上げ（Albedo は消したので、元の物体の Albedo を読む）
        alb = src.data.color_attributes['Albedo']
        bk = me.color_attributes[attr]
        for i in range(len(bk.data)):
            a = alb.data[i].color
            b = bk.data[i].color
            bk.data[i].color = (*[max(b[k], a[k] * floor) for k in range(3)], b[3])
    # 書き出しは「表示に使う色（render）」を見る。属性を消すと、その指定が消えた属性を指したままになり、色が書き出されなかった
    ci = list(me.color_attributes).index(me.color_attributes[attr])
    me.color_attributes.active_color_index = ci
    me.color_attributes.render_color_index = ci
    o = bpy.data.objects.new(name + '.x', me)
    tmp.objects.link(o)
    copies.append(o)


for src_name, name in WORLD.items():
    make_copy(bpy.data.objects[src_name], name)
# 試し（2026-10-06）：光を絵に焼いた地面（bake_lightmap.py）用に、光を焼く前の元の色（Albedo）の地面。アプリで「元の色 × 光の絵」
make_copy(bpy.data.objects['v4__ground'], 'island__ground_albedo', attr='Albedo')
make_copy(bpy.data.objects['design__ground_early'], 'island__ground_early_albedo', attr='Albedo')
# 試し：水面のきらめきの絵（water_glint.py）を重ねる、元の水面
make_copy(bpy.data.objects['island__stream'], 'island__stream')
make_copy(bpy.data.objects['island__river'], 'island__river')
# 流れる水のコマ（water_frames.py）は Blender で再生して見るためのもの。アプリはきらめきの絵をずらすので書き出さない（データが 0.27MB 減る）
for o in KIT.objects:
    if o.name.startswith('fx__'):
        make_copy(o, o.name)
    else:
        make_copy(o, o.name, 0.55 if o.name.endswith('__accent') else 0.58)

try:
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in copies:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = copies[0]
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
                              export_materials='NONE', export_normals=False, export_texcoords=False,
                              export_vertex_color='ACTIVE', export_all_vertex_colors=False,
                              use_active_scene=True)  # シーンが2つあり、両方が書き出されて部品が2重になった
    print('exported', len(copies), 'parts', os.path.getsize(OUT) // 1024, 'KB')
finally:
    for o in copies:
        me = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.meshes.remove(me)
