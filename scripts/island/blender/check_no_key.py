# .blend に Poly Pizza の鍵が残っていないか確かめる。Blender の中で実行する（今のセッションに入っている鍵と照らし合わせる。鍵は表に出さない）。
# .blend は zstd で縮めて保存されているので、ほどいてから探す。scripts/backup-blend.sh で上げる前に必ず実行する
import bpy, os, zstandard

DIR = r"C:\Users\nobu2\Documents\pukapuka_blender"
FILES = ['pk_island_v7.blend', 'pk_island_parts_v3.blend', 'pk_river_v21b_far_ridges.blend', 'pk_pool_v1.blend', 'pk_night_v1.blend']
keys = {getattr(s, 'blendermcp_polypizza_api_key', '') for s in bpy.data.scenes} - {''}
if not keys:
    print('このセッションに鍵がない。鍵を入れたファイルを開いてから実行する')
dctx = zstandard.ZstdDecompressor()
bad = []
for f in FILES:
    raw = open(os.path.join(DIR, f), 'rb').read()
    if raw[:7] != b'BLENDER':
        with dctx.stream_reader(raw) as r:
            raw = r.read()
    if any(k.encode() in raw for k in keys):
        bad.append(f)
print('KEY FOUND: ' + ', '.join(bad) if bad else 'ok: 鍵は入っていない')
