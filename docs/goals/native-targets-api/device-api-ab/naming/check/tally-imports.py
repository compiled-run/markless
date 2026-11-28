# usage: python3 check/tally-imports.py <s1.json> <s2.json>   (run from naming/) — per name and package counts, and scorer disagreements
import collections, json, sys
a, b = (json.load(open(p)) for p in sys.argv[1:3])
d = 0
for k in sorted(a):
    for f in ['contains', 'whoDraws', 'misfit']:
        if a[k][f] != b[k][f]: d += 1; print('DIFF', k, f, a[k][f], b[k][f])
print(f'agree {3 * len(a) - d} of {3 * len(a)}')
for s in (a, b):
    c = collections.defaultdict(collections.Counter)
    for k, v in s.items():
        g = k.rsplit('-', 2)[0]; c[g][v['contains']] += 1; c[g]['misfit'] += v['misfit']; c[g]['draws:' + v['whoDraws']] += 1
    [print(' ', g, dict(c[g])) for g in sorted(c)]
