# 地面の光と影を絵（ライトマップ）に焼く（v7 の試し、2026-10-06）。Blender の中で rebuild_world.py・design_preview.py のあとに実行する。
# ユーザー「言葉を拾う画面と同じぐらいのクオリティにしたい」：三角形ごとの1色（light_faces.py）では、のっぺりして角ばる。
# Cycles で「光だけ」（色を掛ける前の明るさ。DIFFUSE の直接光＋間接光）を、上から見た絵に焼く。
# アプリは「元の色（Albedo、三角形ごと）× この絵」で描く（光は Blender、アプリは貼るだけ）。
# - 絵の向き：上から見て、x と Blender の y（＝アプリの −z）を −LM_S〜LM_S に。アプリも同じ式で位置から絵の場所を出す
# - 明るさは 1 を超えるので、半分にして 8bit に入れる（アプリで 2 倍に戻す）
# - 焼くとき隠す物：空・太陽の円盤（太陽の光をさえぎる）、海・遠景・水・言葉の植物（時期で変わる物の影を焼き込まない）
# 書き出し先: assets/island/lm_ground.png（小川を掘った地面）・lm_ground_early.png（最初のころの地面）
import bpy, bmesh, math, mathutils, os, time

LM_S = 29.0     # 絵が覆う範囲（中心から ±29m。地面の端まで入る）
RES = 1024   # 512（1ピクセル約11cm）では、小川の岸の影がにじんで黒いふちになった
SAMPLES = 64
LM_FLOOR = 0.32   # 日なた（約1.1）の約3割
OUT = r'\\wsl.localhost\Ubuntu\home\Nobumasa494\pukapuka-app\assets\island'
sc = bpy.data.scenes['IslandV4']
KEY = mathutils.Vector(bpy.data.scenes['Scene']['island_key_dir']).normalized()

# 太陽：光の向き（island_key_dir）から照らす。見える太陽（island__sun）とは別（逆光で暗くならないように。light_faces.py と同じ）
sun = bpy.data.objects['LibSun']
sun.rotation_euler = (-KEY).to_track_quat('-Z', 'Y').to_euler()
sun.data.energy = 3.6
sun.data.angle = math.radians(6)   # 影の縁を少しやわらかく
sun.data.color = (1.0, 0.94, 0.84)
sun.hide_render = False

saved = {}


def hide_for_bake(target):
    for o in sc.objects:
        if o.type != 'MESH':
            continue
        # 元の状態は最初の1回だけ覚える（2回目に覚え直すと、1回目で隠した状態を元として戻してしまった）
        saved.setdefault(o.name, o.hide_render)
        # 焼くときに出すのは、焼く地面と景色（林・岩。影を落とす）だけ。ほかは全部隠す（素材を並べた板 LibGround なども）
        o.hide_render = o.name not in (target, 'v4__scenery')


def planar_uv(o):
    me = o.data
    uv = me.uv_layers.get('LM') or me.uv_layers.new(name='LM')
    me.uv_layers.active = uv
    for l in me.loops:
        v = me.vertices[l.vertex_index].co
        uv.data[l.index].uv = ((v.x + LM_S) / (2 * LM_S), (v.y + LM_S) / (2 * LM_S))


def bake(obj_name, file_name):
    o = bpy.data.objects[obj_name]
    planar_uv(o)
    img = bpy.data.images.get(file_name) or bpy.data.images.new(file_name, RES, RES, float_buffer=True)
    if img.size[0] != RES:
        img.scale(RES, RES)
    mat = o.data.materials[0]
    nt = mat.node_tree
    node = nt.nodes.get('LM_TARGET') or nt.nodes.new('ShaderNodeTexImage')
    node.name = 'LM_TARGET'
    node.image = img
    for n in nt.nodes:
        n.select = False
    node.select = True
    nt.nodes.active = node
    hide_for_bake(obj_name)
    vp = o.hide_viewport
    o.hide_viewport = False  # 最初のころの地面は画面で隠しているので、焼く間だけ出す（隠したままだと選べず、焼けない）
    o.hide_set(False)
    vl = bpy.context.view_layer
    for x in vl.objects:
        x.select_set(False)
    o.select_set(True)
    vl.objects.active = o
    t0 = time.time()
    with bpy.context.temp_override(active_object=o, object=o, selected_objects=[o], selected_editable_objects=[o]):
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=4, use_clear=True)
    o.hide_viewport = vp
    # 明るさを半分にして 8bit で保存（アプリで 2 倍に戻す）
    px = list(img.pixels)
    for i in range(0, len(px), 4):
        # 影の明るさの下限（LM_FLOOR）。ガマ・岩のそばの影が真っ黒に焼け、池の縁に黒い塊が出た（木・植物の bake_faces.py の下限と同じ考え）
        px[i], px[i + 1], px[i + 2] = [max(v, LM_FLOOR) * 0.5 for v in px[i:i + 3]]
    out = bpy.data.images.new(file_name + '_8bit', RES, RES)
    out.pixels = px
    out.filepath_raw = os.path.join(OUT, file_name + '.png')
    out.file_format = 'PNG'
    out.save()
    bpy.data.images.remove(out)
    nt.nodes.remove(node)
    vals = px[0::4]
    print(file_name, round(time.time() - t0, 1), 's', 'mean', round(sum(vals) / len(vals) * 2, 3), 'max', round(max(vals) * 2, 3))


try:
    eng = sc.render.engine
    # 空の光は弱めに（空の色は少し青い。強いと草地が白っぽく青みがかり、緑が抜けた）
    bg = [n for n in sc.world.node_tree.nodes if n.type == 'BACKGROUND'][0]
    world_k = bg.inputs['Strength'].default_value
    bg.inputs['Strength'].default_value = 0.45
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = SAMPLES
    sc.cycles.device = 'CPU'
    sc.render.bake.use_selected_to_active = False
    # 焼き先は「絵」。前の作業の設定（頂点の色）のままだと、絵は真っ黒のまま、地面の色の属性 Baked を上書きしてしまった
    tgt = sc.render.bake.target
    sc.render.bake.target = 'IMAGE_TEXTURES'
    bpy.context.window.scene = sc
    bake('v4__ground', 'lm_ground')
    bake('design__ground_early', 'lm_ground_early')
finally:
    for n, h in saved.items():
        if n in bpy.data.objects:
            bpy.data.objects[n].hide_render = h
    sc.render.engine = eng
    bg.inputs['Strength'].default_value = world_k
    sc.render.bake.target = tgt
