# Tallies the rankings readers gave in their second turn (<raw>-2.md): mean rank and first places per label.
# usage: python3 check/rankings.py   (run from round3/)
import glob, re, json, collections
out = {}
for q, labels in [('q1', ['HN','QT','VR','LX','GP']), ('q2', ['JE','UF','XB','DL']), ('q3', ['FD','TJ','NB','RZ','WK'])]:
    ranks = collections.defaultdict(list); firsts = collections.Counter(); lasts = collections.Counter(); per = {}
    for f in sorted(glob.glob(f'{q}/raw/readers/??-?-2.md')):
        text = open(f).read()
        order = re.findall(r'^\s*(\d)\.\s*\**\s*([A-Z]{2})\b', text, re.M)
        order = [l for _, l in sorted(order, key=lambda x: int(x[0])) if l in labels]
        per[f.split('/')[-1][:-5]] = order
        for i, l in enumerate(order): ranks[l].append(i + 1)
        if order: firsts[order[0]] += 1; lasts[order[-1]] += 1
    extra = {}
    if q == 'q3':
        best = collections.Counter()
        for f in sorted(glob.glob('q3/raw/readers/??-?-2.md')):
            m = re.search(r'^B:\s*(.*)$', open(f).read(), re.M)
            name = re.search(r'`?(cameraApp|systemCamera|cameraScreen)`?', m.group(1)) if m else None
            best[name.group(1) if name else '?'] += 1
        extra['bestName'] = dict(best)
    out[q] = {'meanRank': {l: round(sum(ranks[l]) / len(ranks[l]), 2) for l in labels if ranks[l]}, 'first': dict(firsts), 'last': dict(lasts), 'n': len(per), 'orders': per, **extra}
json.dump(out, open('check/rankings.json', 'w'), indent=1)
for q, o in out.items(): print(q, 'n', o['n'], 'mean', o['meanRank'], 'first', o['first'], 'last', o['last'], o.get('bestName', ''))
