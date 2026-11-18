# usage: python3 check/setid.py <raw path> <agent id> ...   sets the agent id on named rows of check/map.tsv.
import sys
pairs = dict(zip(sys.argv[1::2], sys.argv[2::2]))
rows = [l.rstrip('\n').split('\t') for l in open('check/map.tsv')]
for r in rows:
    if r[0] in pairs: r[3] = pairs.pop(r[0])
assert not pairs, pairs
open('check/map.tsv', 'w').write(''.join('\t'.join(r) + '\n' for r in rows))
