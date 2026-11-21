# usage: python3 check/tally-blind.py   (run from naming/) — counts each writer's three proposals by framing and rank
import collections, glob, re
t = collections.defaultdict(lambda: collections.Counter())
for f in sorted(glob.glob('blind/raw/*.md')):
    fr = f.split('/')[-1].split('-')[0]
    names = re.findall(r'^([123])\. `([^`]+)`', open(f).read(), re.M)
    assert len(names) == 3, f
    for rank, n in names: t[n][f'{fr}#{rank}'] += 1; t[n]['any'] += 1
for n, c in sorted(t.items(), key=lambda kv: -kv[1]['any']):
    print(n, 'writers', c['any'], 'first', sum(v for k, v in c.items() if k.endswith('#1')), dict(sorted((k, v) for k, v in c.items() if k != 'any')))
