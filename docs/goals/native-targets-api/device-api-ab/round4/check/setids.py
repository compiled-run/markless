# usage: python3 check/setids.py <agent id>...   fills the first PENDING rows of check/map.tsv in launch order.
import sys
rows = [l.rstrip('\n').split('\t') for l in open('check/map.tsv')]
ids = sys.argv[1:]
for r in rows:
    if ids and r[3] == 'PENDING': r[3] = ids.pop(0); print(r[0], r[3])
open('check/map.tsv', 'w').write(''.join('\t'.join(r) + '\n' for r in rows))
