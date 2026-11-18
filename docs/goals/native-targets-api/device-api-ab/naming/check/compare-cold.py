# usage: python3 check/compare-cold.py <s1.json> <s2.json>   (run from naming/) — lists every mark the two scorers disagree on
import json, sys
a, b = (json.load(open(p)) for p in sys.argv[1:3])
assert a.keys() == b.keys(), (a.keys() ^ b.keys())
n = d = 0
for k in sorted(a):
    for m in ['q1', 'a', 'b', 'bLenient', 'c', 'button']:
        n += 1
        if a[k][m] != b[k][m]: d += 1; print('DIFF', k, m, a[k][m], b[k][m])
    for t in ['sheet', 'camera', 'pdf']:
        n += 1
        if a[k]['bTags'][t] != b[k]['bTags'][t]: d += 1; print('DIFF', k, 'bTags.' + t, a[k]['bTags'][t], b[k]['bTags'][t])
    wa, wb = bool(a[k]['wrongMeanings']), bool(b[k]['wrongMeanings'])
    n += 1
    if wa != wb: d += 1; print('DIFF', k, 'wrongMeaning', a[k]['wrongMeanings'], b[k]['wrongMeanings'])
print(f'agree {n - d} of {n}')
