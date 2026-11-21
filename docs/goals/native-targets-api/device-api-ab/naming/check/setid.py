# usage: python3 check/setid.py <raw> <agent id> [<raw> <agent id>...]   (run from naming/)
import sys
a = sys.argv[1:]; ids = dict(zip(a[::2], a[1::2]))
rows = [l.rstrip('\n').split('\t') for l in open('check/map.tsv') if l.strip()]
for r in rows:
    if r[0] in ids: r[3] = ids.pop(r[0])
assert not ids, ids
open('check/map.tsv', 'w').write(''.join('\t'.join(r) + '\n' for r in rows))
