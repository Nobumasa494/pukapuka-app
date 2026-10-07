# 景色（林・岩）と言葉の植物の光を Cycles で焼き、三角形ごとの色に入れる（v7、2026-10-07）。
# Blender の中で rebuild_world.py・design_preview.py のあとに実行する（地面の光の絵 bake_lightmap.py と同じ光・同じ明るさ）。
# ユーザー「この方向でよければ、景色の木・岩と言葉の植物にも同じ作り方（Blender で光を絵に焼く）を広げて」
# - 物ごとに、光を焼くための絵の場所（UV「LMF」、ライトマップ用に詰めて並べる）を作り、Cycles で「光だけ」を絵に焼く
# - 三角形の真ん中の場所の明るさを読み、「元の色（Albedo）× 明るさ × EXPOSURE」を色の属性 Baked に書く
#   （地面はアプリで「元の色 × 光の絵 × 1.15」。同じ EXPOSURE にして、景色・植物・地面の明るさをそろえる）
# - 絵を貼る場所の情報をアプリに送らずに済む（ローポリは三角形ごとに1色なので、見た目の作りは前と同じ。光の計算だけ Cycles になる）
# - 言葉の植物（V4Kit）は、種類ごとに、草地の板1枚の上に置いて焼く（場所は時期で変わるので、ほかの物の影は焼き込まない）
# 何度実行しても同じ結果になる
import bpy, bmesh, math, mathutils, time

EXPOSURE = 1.15
SAMPLES = 64
sc = bpy.data.scenes['IslandV4']
T = {}
exec(bpy.data.texts['island_terrain'].as_string(), T)
KEY = mathutils.Vector(bpy.data.scenes['Scene']['island_key_dir']).normalized()
sun = bpy.data.objects['LibSun']
sun.rotation_euler = (-KEY).to_track_quat('-Z', 'Y').to_euler()
sun.data.energy = 3.6
sun.data.angle = math.radians(6)
sun.data.color = (1.0, 0.88, 0.72)  # v9：あたたかい金色


def l2(h):
    h = h.lstrip('#')
    return [((int(h[i:i + 2], 16) / 255 + 0.055) / 1.055) ** 2.4 for i in (0, 2, 4)]


saved = {}


def show_only(names):
    for o in sc.objects:
        if o.type != 'MESH':
            continue
        saved.setdefault(o.name, o.hide_render)
        o.hide_render = o.name not in names


def lightmap_uv(o):
    me = o.data
    uv = me.uv_layers.get('LMF') or me.uv_layers.new(name='LMF')
    me.uv_layers.active = uv
    vl = bpy.context.view_layer
    for x in vl.objects:
        x.select_set(False)
    vp = o.hide_viewport
    o.hide_viewport = False
    o.hide_set(False)
    o.select_set(True)
    vl.objects.active = o
    with bpy.context.temp_override(active_object=o, object=o, selected_objects=[o], selected_editable_objects=[o]):
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.lightmap_pack(PREF_CONTEXT='ALL_FACES', PREF_PACK_IN_ONE=True, PREF_NEW_UVLAYER=False, PREF_MARGIN_DIV=0.3)
        bpy.ops.object.mode_set(mode='OBJECT')
    o.hide_viewport = vp
    return uv


def bake_irradiance(o, res):
    # 光だけ（DIFFUSE の直接光＋間接光）を、o の UV「LMF」の絵に焼いて、三角形ごとの明るさを返す
    uv = lightmap_uv(o)
    img = bpy.data.images.new('_lmf', res, res, float_buffer=True)
    mats = [m for m in o.data.materials if m]
    nodes = []
    for m in mats:
        nt = m.node_tree
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = img
        for x in nt.nodes:
            x.select = False
        n.select = True
        nt.nodes.active = n
        nodes.append((nt, n))
    vl = bpy.context.view_layer
    for x in vl.objects:
        x.select_set(False)
    vp = o.hide_viewport
    o.hide_viewport = False
    o.select_set(True)
    vl.objects.active = o
    with bpy.context.temp_override(active_object=o, object=o, selected_objects=[o], selected_editable_objects=[o]):
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=2, use_clear=True, uv_layer='LMF')
    o.hide_viewport = vp
    px = img.pixels[:]
    uv = o.data.uv_layers['LMF']  # エディットモードを出入りすると前の参照は使えない（中身が空になる）。取り直す
    out = []
    for p in o.data.polygons:
        u = sum(uv.data[li].uv.x for li in p.loop_indices) / p.loop_total
        v = sum(uv.data[li].uv.y for li in p.loop_indices) / p.loop_total
        x = min(res - 1, max(0, int(u * res)))
        y = min(res - 1, max(0, int(v * res)))
        i = (y * res + x) * 4
        out.append((px[i], px[i + 1], px[i + 2]))
    for nt, n in nodes:
        nt.nodes.remove(n)
    bpy.data.images.remove(img)
    return out


def write_baked(o, irr, floor):
    me = o.data
    alb = me.color_attributes['Albedo']
    bk = me.color_attributes.get('Baked') or me.color_attributes.new('Baked', 'FLOAT_COLOR', 'CORNER')
    for p, e in zip(me.polygons, irr):
        a = alb.data[p.loop_indices[0]].color
        col = [max(a[k] * floor, a[k] * e[k] * EXPOSURE) for k in range(3)]
        for li in p.loop_indices:
            bk.data[li].color = (*col, 1)


t0 = time.time()
try:
    eng = sc.render.engine
    tgt = sc.render.bake.target
    bg = [n for n in sc.world.node_tree.nodes if n.type == 'BACKGROUND'][0]
    world_k = bg.inputs['Strength'].default_value
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = SAMPLES
    sc.cycles.device = 'CPU'
    sc.render.bake.target = 'IMAGE_TEXTURES'
    sc.render.bake.use_selected_to_active = False
    # 木・岩・植物は日の当たらない側の面が多い。朝の空の光（青み・弱め 0.45）だと日陰がほぼ真っ暗になった（三角形の半分以上が明るさの下限に張り付いた）。
    # 焼く間だけ、青みのないやわらかい白い空の光（強さ 0.8）にする（光は Blender の Cycles のまま）
    world0 = sc.world
    fill = bpy.data.worlds.get('_BakeFill') or bpy.data.worlds.new('_BakeFill')
    fill.use_nodes = True
    fb = [n for n in fill.node_tree.nodes if n.type == 'BACKGROUND'][0]
    fb.inputs['Color'].default_value = (0.93, 0.91, 0.86, 1)
    fb.inputs['Strength'].default_value = 0.8
    sc.world = fill
    bpy.context.window.scene = sc

    # ---- 景色（林・岩）：地面と一緒に（地面の照り返しと、林どうしの影が入る） ----
    scn = bpy.data.objects['v4__scenery']
    show_only({'v4__scenery', 'v4__ground'})
    irr = bake_irradiance(scn, 4096)  # 2.5万三角形。1024 では 2.4万が1.5ピクセル未満で、焼けていない所を読んだ
    write_baked(scn, irr, 0.35)
    # 奥の景色を少しかすませる（world_colors.py と同じ。Baked を書き直したので、もう一度）
    HAZE = l2('#e9e4da')
    bk = scn.data.color_attributes['Baked']
    for p in scn.data.polygons:
        c = p.center
        t = 0.12 * T['ss'](10.0, 22.0, T['back'](c.x, -c.y))
        if t > 0:
            for li in p.loop_indices:
                cc = bk.data[li].color
                bk.data[li].color = (*[cc[k] * (1 - t) + HAZE[k] * t for k in range(3)], 1)
    print('scenery', len(scn.data.polygons), 'faces', round(time.time() - t0, 1), 's')

    # ---- 言葉の植物（V4Kit）：種類ごとに、草地の板1枚の上で ----
    for n in ('_bake_floor',):  # 前に途中で止まったときの残り
        if bpy.data.objects.get(n):
            bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
        if bpy.data.meshes.get(n):
            bpy.data.meshes.remove(bpy.data.meshes[n])
    me = bpy.data.meshes.new('_bake_floor')
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=6)
    bm.to_mesh(me)
    bm.free()
    alb = me.color_attributes.new('Albedo', 'FLOAT_COLOR', 'CORNER')
    for c in alb.data:
        c.color = (*l2('#8fc27a'), 1)
    me.materials.append(bpy.data.materials['PukaAlbedo'])
    floor = bpy.data.objects.new('_bake_floor', me)
    bpy.data.collections['V4World'].objects.link(floor)
    K = bpy.data.collections['V4Kit']
    k_hide = K.hide_render
    K.hide_render = False  # 言葉の植物の部品の入れ物は、ふだん撮る絵から外してある。焼く間だけ出す
    kinds = sorted({o.name.split('__')[0] for o in K.objects if not o.name.startswith('fx__')})
    for kind in kinds:
        group = [o for o in K.objects if o.name.startswith(kind + '__')]
        show_only({o.name for o in group} | {'_bake_floor'})
        for o in group:
            irr = bake_irradiance(o, 512)
            write_baked(o, irr, 0.55 if o.name.endswith('__accent') else 0.45)
        print(kind, round(time.time() - t0, 1), 's')
    K.hide_render = k_hide
    bpy.data.objects.remove(floor, do_unlink=True)
    bpy.data.meshes.remove(me)
finally:
    for n, h in saved.items():
        if n in bpy.data.objects:
            bpy.data.objects[n].hide_render = h
    sc.render.engine = eng
    sc.render.bake.target = tgt
    bg.inputs['Strength'].default_value = world_k
    sc.world = world0
print('bake_faces', round(time.time() - t0, 1), 's')
