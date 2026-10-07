# 島の作り直しを1回で（2026-10-07。時間を短くするため）。Blender の中で実行する。
# 使い方: Blender で MODE = 'fast'（または 'full'）; exec(open(SRC + r'\pipeline.py', encoding='utf-8').read())
#   SRC は WSL のこのフォルダ（Windows から \\wsl.localhost\Ubuntu\... で直接読める）。最初にここの *.py を %TEMP% へ写す
#   （2026-10-07：前は WSL で cp してから動かす決まりで、写し忘れて古いスクリプトのまま撮ることが何度もあった）
# - fast（約10〜20秒）：地形・景色・水・見本の植物・静止画。光は前の焼き方のまま。形や水を直している間はこちら
# - full（約3分）：fast ＋ 地面の光の絵・木と植物の光（Cycles）＋ 保存 ＋ アプリ用の書き出し。形が決まってから最後に1回
# 長い記録は出さず、結果の1行ずつだけを出す（トークンを使いすぎないため）
import bpy, os, tempfile, time, io, contextlib

MODE = globals().get('MODE', 'fast')
TMP = tempfile.gettempdir()
STEPS = {
    'fast': ['rebuild_world.py', 'design_preview.py', 'water_frames.py', 'shot_design.py'],
    'full': ['rebuild_world.py', 'design_preview.py', 'water_frames.py', 'bake_lightmap.py', 'bake_faces.py', 'shot_design.py'],
}
KEEP = ('rebuild_world', 'stream tris', 'lm_ground', 'scenery', 'bake_faces', 'exported', 'done')

SRC = r'\\wsl.localhost\Ubuntu\home\Nobumasa494\pukapuka-app\scripts\island\blender'
if os.path.isdir(SRC):
    import shutil
    for f in os.listdir(SRC):
        if f.endswith('.py'):
            shutil.copy(os.path.join(SRC, f), os.path.join(TMP, f))
t0 = time.time()
lines = []
for f in STEPS[MODE]:
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        exec(open(os.path.join(TMP, f), encoding='utf-8').read(), {'__name__': '__main__'})
    lines += [l for l in buf.getvalue().splitlines() if l.startswith(KEEP)]

sc = bpy.data.scenes['IslandV4']
sc.frame_set(1)
for o in sc.objects:
    if o.type == 'MESH' and o.data.color_attributes.get('Baked'):
        o.data.color_attributes.active_color = o.data.color_attributes['Baked']
bad = [o.name for o in sc.objects if o.type == 'MESH' and o.visible_get() and o.hide_render]
if MODE == 'full':
    bpy.ops.wm.save_mainfile()
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        exec(open(os.path.join(TMP, 'export_kit.py'), encoding='utf-8').read(), {'__name__': '__main__'})
    lines += [l for l in buf.getvalue().splitlines() if l.startswith('exported')]
print(MODE, round(time.time() - t0, 1), 's |', ' | '.join(lines), '| 画面だけに見える物:', bad or 'なし')
