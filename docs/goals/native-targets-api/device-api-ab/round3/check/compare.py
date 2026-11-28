# Compares the two scorers per part, field by field, and lists disagreements. usage: python3 check/compare.py (from round3/)
import json, os, sys
S = '/tmp/devab3/score'
def load(d, n):
    p = f'{S}/{d}/out/s{n}.json'
    return json.load(open(p)) if os.path.exists(p) else None
def leaves(o, prefix=''):
    if isinstance(o, dict):
        for k, v in o.items():
            if k in ('zeros', 'notes', 'why', 'web', 'flagged', 'alternatives', 'prefers', 'confusions', 'mistakable', 'clearer', 'inPage', 'system', 'library', 'form', 'extraWebCode'): continue
            yield from leaves(v, f'{prefix}/{k}')
    elif isinstance(o, list):
        yield prefix, len(o)
    else:
        yield prefix, o
for d in ['q1r', 'q1w', 'q3', 'q24']:
    a, b = load(d, 1), load(d, 2)
    if not a or not b: print(d, 'missing', bool(a), bool(b)); continue
    la, lb = dict(leaves(a)), dict(leaves(b))
    diff = [(k, la.get(k), lb.get(k)) for k in sorted(set(la) | set(lb)) if la.get(k) != lb.get(k)]
    print(d, 'fields', len(la), 'disagree', len(diff))
    for k, x, y in diff: print('  ', k, x, '|', y)
