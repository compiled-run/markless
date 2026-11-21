# usage: python3 check/setids.py <agent id>...   fills the PENDING rows of check/map.tsv in order
import sys
ids = list(sys.argv[1:]); rows = open('check/map.tsv').read().splitlines()
for i, r in enumerate(rows):
    if r.endswith('\tPENDING') and ids: rows[i] = r[:-len('PENDING')] + ids.pop(0)
open('check/map.tsv', 'w').write('\n'.join(rows) + '\n'); print('left over:', ids)
