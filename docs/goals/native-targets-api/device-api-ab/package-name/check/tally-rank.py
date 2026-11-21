# usage: python3 check/tally-rank.py   (run from package-name/) — maps version numbers back to names via check/rank-orders.txt; turn 1 is the open guess (<raw>.md), turn 2 the ranking (<raw>-2.md)
import collections, re
orders = dict(l.rstrip('\n').split('\t') for l in open('check/rank-orders.txt') if l.strip())
names = ['ui', 'headless', 'base', 'primitives', 'unstyled', 'components', 'kit', 'parts', 'elements']
pos = collections.defaultdict(list); first = collections.Counter(); last = collections.Counter(); install = collections.Counter(); open1 = collections.Counter(); openany = collections.Counter()
for raw, order in orders.items():
    order = order.split()
    g = re.findall(r'^\d\.\s*`([a-z]+)`', open(raw + '.md').read(), re.M)
    open1[g[0]] += 1
    for x in g: openany[x] += 1
    t = open(raw + '-2.md').read()
    ranks = [int(n) for n in re.search(r'Ranking:\s*([\d,\s]+)', t).group(1).replace(',', ' ').split()]
    assert sorted(ranks) == list(range(1, 10)), raw
    seq = [order[n - 1] for n in ranks]
    for i, x in enumerate(seq): pos[x].append(i + 1)
    first[seq[0]] += 1; last[seq[-1]] += 1
    c = re.search(r'^C:(.*)$', t, re.M).group(1)
    w = re.search(r'`(?:@markless/)?([a-z]+)`', c)
    install[w.group(1) if w else '?'] += 1
    print(raw, 'open', g, '| rank', ' > '.join(seq), '| install', w.group(1) if w else '?')
for x in sorted(names, key=lambda x: sum(pos[x]) / len(pos[x])): print(f'{x}: mean {sum(pos[x]) / len(pos[x]):.2f} first {first[x]} last {last[x]} install-first {install[x]} open-first {open1[x]} open-any {openany[x]}')
print('open guesses (any of 3):', dict(openany))
