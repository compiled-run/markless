# Tallies the name-reading phase (q5): cold question 2 letter and question 3 answer per name, then the comparison turn.
import glob, re, collections
cold2 = collections.defaultdict(collections.Counter); cold3 = collections.defaultdict(collections.Counter)
first = collections.Counter(); ranks = collections.defaultdict(list)
for f in sorted(glob.glob('q5/raw/readers/??-?.md')):
    lab = f.split('/')[-1][:2]; t = open(f).read()
    m = re.search(r'^2:\s*\(?([a-e])\)?', t, re.M); cold2[lab][m.group(1) if m else '?'] += 1
    m = re.search(r'^3:\s*\**(yes|no|somewhat)', t, re.M | re.I); cold3[lab][m.group(1).lower() if m else '?'] += 1
for f in sorted(glob.glob('q5/raw/readers/??-?-2.md')):
    t = open(f).read(); order = re.findall(r'^\s*(\d)\.\s*\**(SY|NT|OS)\b', t, re.M)
    for pos, lab in order[:3]: ranks[lab].append(int(pos))
    if order: first[order[0][1]] += 1
    print(f.split('/')[-1], [l for _, l in order[:3]])
print('cold q2 letter by name', {k: dict(v) for k, v in cold2.items()})
print('cold q3 design-system by name', {k: dict(v) for k, v in cold3.items()})
print('mean rank', {k: round(sum(v) / len(v), 2) for k, v in ranks.items()}, 'first', dict(first))

# Comparison-turn per-name answers: B (exists on the website), C (design system), D (native = browser, phone or both).
def classify(seg):
    s = seg.lower()
    hits = [(s.find(w), w) for w in ["can't tell", 'somewhat', 'yes', 'no'] if s.find(w) >= 0]
    return min(hits)[1] if hits else '?'
B = collections.defaultdict(collections.Counter); C = collections.defaultdict(collections.Counter); D = collections.Counter()
names = {'SY': 'system', 'NT': 'native', 'OS': 'os'}
for f in sorted(glob.glob('q5/raw/readers/??-?-2.md')):
    t = open(f).read()
    for key, store in (('B', B), ('C', C)):
        m = re.search(rf'^{key}:(.*?)(?=^\w:|\Z)', t, re.M | re.S)
        if not m: continue
        body = m.group(1)
        for lab, word in names.items():
            mm = re.search(rf'(?:\b{lab}\b|`?{word}`?)\s*[:—-]?\s*(.{{0,60}})', body, re.I)
            store[lab][classify(mm.group(1)) if mm else '?'] += 1
    m = re.search(r'^D:\s*(.{0,80})', t, re.M)
    d = m.group(1).lower() if m else ''
    D['both' if d.startswith('both') else 'phone' if ('phone' in d[:60] or 'mostly' in d[:20] or 'mainly' in d[:20]) else '?'] += 1
print('B exists on web', {k: dict(v) for k, v in B.items()})
print('C design system', {k: dict(v) for k, v in C.items()})
print('D native means', dict(D))
