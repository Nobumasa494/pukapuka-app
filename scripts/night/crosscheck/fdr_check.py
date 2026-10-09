# アプリとは別に、教科書どおりに計算する：
#  p = 超幾何分布の上側確率（フィッシャーの正確確率検定・片側）
#  タロンの方法（Gilbert 2005 の FDR 版）：K(k) = {最小達成 p ≤ q/k の組}、|K(k)| ≤ k となる最小の k。その組だけで BH（m = k）
import json, sys, datetime, itertools
from math import comb
data = json.load(open(sys.argv[1]))
def upper(N, a, b, x):  # P(X >= x)
    tot = comb(N, b)
    return sum(comb(a, i) * comb(N - a, b - i) for i in range(x, min(a, b) + 1)) / tot
ok = True
for name, case in data.items():
    days = {}
    for c in case['caps']:
        d = datetime.datetime.fromtimestamp(c['t'] / 1000).strftime('%Y-%m-%d')
        days.setdefault(d, set()).add(c['w'])
    N = len(days)
    wdays = {}
    for d, ws in days.items():
        for w in ws: wdays.setdefault(w, set()).add(d)
    words = sorted(wdays)
    co = {}
    for d, ws in days.items():
        for a, b in itertools.combinations(sorted(ws), 2): co[(a, b)] = co.get((a, b), 0) + 1
    for q in ['0.1', '0.2', '0.3']:
        qq = float(q)
        def minp(a, b):
            m = min(len(wdays[a]), len(wdays[b]))
            return 1.0 if m < 2 else upper(N, len(wdays[a]), len(wdays[b]), m)
        allmin = sorted(minp(a, b) for a, b in itertools.combinations(words, 2))
        k = len(allmin)
        for kk in range(1, len(allmin) + 1):
            if sum(1 for p in allmin if p <= qq / kk) <= kk: k = kk; break
        tests = []
        for (a, b), n in co.items():
            if n >= 2 and minp(a, b) <= qq / k:
                tests.append((upper(N, len(wdays[a]), len(wdays[b]), n), f'{a}|{b}'))
        tests.sort()
        r = 0
        for i, (p, _) in enumerate(tests, 1):
            if p <= i / k * qq: r = i
        mine = sorted(x for _, x in tests[:r])
        app = case['app'][q]
        same = mine == app
        ok &= same
        print(f'{name:10s} q={q}: 教科書どおり {len(mine):3d}本 / アプリ {len(app):3d}本  {"一致" if same else "ちがう！"}')
print('全部一致' if ok else 'ちがうものがある')
