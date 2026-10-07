# 島の地形を、アプリ用のデータ src/islandTerrainData.ts に書き出す（v10、2026-10-07）。WSL で python3 scripts/island/export_terrain.py
# v10 から地形は段・崖・池7つ・小川11本になり、式をアプリへ写すと食い違いやすい。式は Blender の island_terrain.py だけに置き、
# アプリは「高さの格子」と「小川・池の形」を数で受け取る（植物を地面に置く・植えない所を決める・水を流す、に使う）
import math, os, json

HERE = os.path.dirname(os.path.abspath(__file__))
T = {}
exec(open(os.path.join(HERE, 'blender', 'island_terrain.py'), encoding='utf-8').read(), T)
G0, GS, GN = -30.0, 0.5, 121  # 格子：-30〜30m、0.5m ごと
grid = [round(T['height'](G0 + i * GS, G0 + j * GS), 3) for j in range(GN) for i in range(GN)]
r3 = lambda v: round(v, 3)
data = {
    'G0': G0, 'GS': GS, 'GN': GN,
    'MEADOW_R': T['MEADOW_R'],
    'RIVER': T['RIVER'],
    'STREAMS': [[[r3(x), r3(z)] for x, z in S] for S in T['STREAMS']],
    'STREAM_WS': [list(w) for w in T['STREAM_WS']],
    'STREAM_LEVELS': [[r3(T['stream_level'](p / 40, k)) for p in range(41)] for k in range(len(T['STREAMS']))],
    'PONDS': [[n, r3(c[0]), r3(c[1]), A, B, d, r3(T['POND_LEVELS'][n])] for n, (c, A, B, d) in T['PONDS'].items()],
    'SPRINGS': [[r3(x), r3(z)] for x, z in T['SPRINGS']],
}
out = os.path.join(HERE, '..', '..', 'src', 'islandTerrainData.ts')
with open(out, 'w', encoding='utf-8') as f:
    f.write('// 自動生成（scripts/island/export_terrain.py）。手で直さない。島の地形は scripts/island/blender/island_terrain.py で決める\n')
    for k, v in data.items():
        if k == 'G0':
            continue
        f.write(f'export const {k} = {json.dumps(v, separators=(",", ":"))};\n')
    f.write(f'export const G0 = {G0};\n')
    f.write(f'export const GRID = new Float32Array({json.dumps(grid, separators=(",", ":"))});\n')
print('wrote', out, os.path.getsize(out) // 1024, 'KB')
