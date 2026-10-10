# アプリとは別に、教科書どおりに計算する（NetworkX を使う。確かめにだけ使い、アプリでは使わない）：
#  矢印：暦の日 d の言葉 → d+1・d+2・d+3 の言葉（重さ 1・0.5・0.25）、同じ言葉どうしは引かない
#  源＝元気・好奇心の言葉への入る重さの合計、PageRank＝nx.pagerank、めぐり＝nx.strongly_connected_components
#  育ち＝週（月曜はじまり）・月ごとの、日ごとの言葉のうち元気・好奇心の割合
import json, sys, datetime, re
import networkx as nx
src = open('src/words.ts', encoding='utf-8').read()
cur = re.search(r'curiosity: \[(.*?)\]', src, re.S).group(1)
GENKI = set('わくわく ときめき 喜び うれしい 高揚感 満足 穏やか ほっとした 解放感 スッキリ 軽い'.split()) | set(re.findall(r'"(.*?)"', cur))
data = json.load(open(sys.argv[1]))
ok = True
def report(name, case, good, detail=''):
    global ok
    if not good: ok = False
    print('✅' if good else '❌', case, name, '' if good else detail)
for case, c in data.items():
    days = {}
    for x in c['caps']:
        d = datetime.datetime.fromtimestamp(x['t'] / 1000).date()
        days.setdefault(d, set()).add(x['w'])
    W = {}
    for d, ws in days.items():
        for k, wt in ((1, 1.0), (2, 0.5), (3, 0.25)):
            for a in ws:
                for b in days.get(d + datetime.timedelta(days=k), ()):
                    if a != b: W[(a, b)] = W.get((a, b), 0) + wt
    app = c['app']
    A = {(a, b): w for a, b, w in app['arrows']}
    report('矢印', case, A == W, f'{len(A)} 本と {len(W)} 本')
    S = {}
    for (a, b), w in W.items():
        if b in GENKI: S[a] = S.get(a, 0) + w
    report('源', case, dict((w, s) for w, s in app['sources']) == S)
    srt = [w for w, _ in app['sources']]
    report('源の並び（重い順）', case, all(S[srt[i]] >= S[srt[i + 1]] for i in range(len(srt) - 1)))
    G = nx.DiGraph()
    for (a, b), w in W.items(): G.add_edge(a, b, weight=w)
    if len(G):
        pr = nx.pagerank(G, alpha=0.85, weight='weight', tol=1e-12, max_iter=1000)
        diff = max(abs(pr[k] - app['pagerank'][k]) for k in pr)
        report('PageRank', case, diff < 1e-6 and len(pr) == len(app['pagerank']), f'差 {diff}')
    scc = sorted(sorted(s) for s in nx.strongly_connected_components(G) if len(s) >= 2)
    report('めぐり', case, scc == sorted(app['cycles']), f'{scc} / {app["cycles"]}')
    for unit in ('week', 'month'):
        B = {}
        for d, ws in days.items():
            s = d - datetime.timedelta(days=d.weekday()) if unit == 'week' else d.replace(day=1)
            g, t = B.get(s, (0, 0)); B[s] = (g + sum(w in GENKI for w in ws), t + len(ws))
        mine = [(int(datetime.datetime(s.year, s.month, s.day).timestamp() * 1000), t, g / t) for s, (g, t) in sorted(B.items())]
        got = [tuple(x) for x in app[unit]]
        report('育ち（' + unit + '）', case, len(mine) == len(got) and all(m[0] == g[0] and m[1] == g[1] and abs(m[2] - g[2]) < 1e-12 for m, g in zip(mine, got)))
print('すべて一致' if ok else '一致しないものがある')
sys.exit(0 if ok else 1)
