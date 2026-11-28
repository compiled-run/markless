# Tallies the q4 second-turn rankings (q4/raw/readers/<label>-<n>-2.md): mean rank and first places per version, and B (best name).
import glob, re, collections
ranks = collections.defaultdict(list); firsts = collections.Counter(); best = collections.Counter(); lasts = collections.Counter()
names = ['native', 'platform', 'system', 'base', 'ios', 'bare']
for f in sorted(glob.glob('q4/raw/readers/*-?-2.md')):
    t = open(f).read()
    order = re.findall(r'^\s*(\d)\.\s*\**([A-Z]{2})\b', t, re.M)
    for pos, lab in order[:6]: ranks[lab].append(int(pos))
    if order: firsts[order[0][1]] += 1; lasts[order[min(5, len(order) - 1)][1]] += 1
    b = re.search(r'^B:\s*(.*)', t, re.M)
    if b:
        head = b.group(1)[:80].lower().replace('`', '')
        pick = next((n for n in ['system', 'native', 'platform', 'base'] if head.startswith(n) or head.startswith('`' + n)), None)
        if pick is None:
            pick = min(((head.find(n), n) for n in ['system', 'native', 'platform', 'base'] if head.find(n) >= 0), default=(0, '?'))[1]
        best[pick] += 1
    print(f.split('/')[-1], [l for _, l in order[:6]], 'B=', pick if b else None)
print('mean rank', {k: round(sum(v) / len(v), 2) for k, v in sorted(ranks.items(), key=lambda kv: sum(kv[1]) / len(kv[1]))})
print('first', dict(firsts), 'last', dict(lasts), 'best name', dict(best))
