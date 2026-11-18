# usage: python3 check/tally-rank.py   (run from naming/) — maps each ranker's version numbers back to names via check/rank-orders.txt
import collections, re
orders = dict(l.rstrip('\n').split('\t') for l in open('check/rank-orders.txt') if l.strip())
pos = collections.defaultdict(list); first = collections.Counter(); last = collections.Counter(); write = collections.Counter()
names = ['system', 'native', 'os', 'pair', 'builtin', 'host']
for raw, order in orders.items():
    order = order.split(); t = open(raw + '.md').read()
    ranks = [int(n) for n in re.search(r'Ranking:\s*([\d,\s]+)', t).group(1).replace(',', ' ').split()]
    assert sorted(ranks) == list(range(1, 7)), raw
    seq = [order[n - 1] for n in ranks]
    for i, x in enumerate(seq): pos[x].append(i + 1)
    first[seq[0]] += 1; last[seq[-1]] += 1
    c = re.search(r'^C:(.*)$', t, re.M).group(1)
    w = [x for x in names if x != 'pair' and re.search(r'`' + x + r'`', c)]
    write[w[0] if w else '?'] += 1
    print(raw, ' > '.join(seq), '| C:', w)
for x in names: print(x, 'mean', round(sum(pos[x]) / len(pos[x]), 2), 'first', first[x], 'last', last[x])
print('rather write', dict(write))
