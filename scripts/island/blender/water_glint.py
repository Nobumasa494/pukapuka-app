# 水面の光のゆらぎの絵（v7、2026-10-07 作り直し）。Blender の中で実行する。
# 前の版（白い細長い筋）は、同じ模様が同じ速さでまっすぐ動き、ベルトコンベアのように見えた（ユーザー「違和感ありすぎ」）。
# 今の版：水底に映る光の網目のような、やわらかい明るい線（コースティクス）。流れの向き（絵の横 u）に少し長い。
# 上下左右につなぎ目なく繰り返せる（どの波も 1 の中で整数回まわる）。
# アプリは、この絵を大きさと速さを変えて2枚重ね、下流へずらす。重なりが時間とともに変わり、ゆらいで見える
# （絵は Blender、ずらす動きはアプリ）。書き出し先: assets/island/water_glint.png（256×256、黒地＝何も足さない）
import bpy, math, os

RES = 256
OUT = r'\\wsl.localhost\Ubuntu\home\Nobumasa494\pukapuka-app\assets\island\water_glint.png'
TAU = 2 * math.pi
# (u の回数, v の回数, ずれ, ゆがみの u, ゆがみの v, ゆがみの強さ, 重み)。v の回数を多めにして、流れの向きに長い網目にする
WAVES = [(1, 3, 0.10, 2, 1, 0.22, 1.0), (2, -3, 0.47, 1, 2, 0.18, 0.9), (1, 5, 0.73, 3, 1, 0.15, 0.7), (3, 2, 0.31, 1, 3, 0.20, 0.6)]

buf = []
for y in range(RES):
    v = y / RES
    for x in range(RES):
        u = x / RES
        s = 0.0
        for a, b, ph, wa, wb, wk, w in WAVES:
            warp = wk * math.sin(TAU * (wa * u + wb * v + ph * 3))
            t = TAU * (a * u + b * v + ph) + warp * TAU / 2
            s += w * (1 - abs(math.sin(t))) ** 7   # 波の山の細い線だけ明るく
        buf.append(s)
mx = max(buf)
buf = [min(1.0, (v / mx) ** 1.4) for v in buf]

img = bpy.data.images.get('water_glint') or bpy.data.images.new('water_glint', RES, RES)
if img.size[0] != RES:
    img.scale(RES, RES)
px = []
for v in buf:
    px += [v, v, v, 1.0]
img.pixels = px
img.filepath_raw = OUT
img.file_format = 'PNG'
img.save()
print('water_glint saved', os.path.getsize(OUT), 'bytes', 'mean', round(sum(buf) / len(buf), 3))
