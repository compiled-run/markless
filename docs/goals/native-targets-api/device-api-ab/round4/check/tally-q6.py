# Tallies the dialog-versus-sheet readers (q6) by framing: cold iPhone predictions, then expected rule (A) and wanted rule (B).
import glob, re, collections
def look(seg):
    s = seg.lower()
    hits = [(s.find(w), k) for w, k in [('bottom sheet', 'sheet'), ('sheet', 'sheet'), ('centered box', 'centered'), ('centred', 'centered'), ('centered', 'centered'), ('inline', 'inline'), ('in the page', 'inline'), ('something else', 'other'), ('plain box', 'inline'), ('box', 'box')] if s.find(w) >= 0]
    return min(hits)[1] if hits else '?'
cold = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
A = collections.defaultdict(collections.Counter); B = collections.defaultdict(collections.Counter)
for f in sorted(glob.glob('q6/raw/readers/[a-z][a-z][a-z]-[0-9].md')):
    fr = f.split('/')[-1].split('-')[0]; t = open(f).read()
    one = re.search(r'^1:(.*?)^2:', t, re.M | re.S).group(1)
    for piece in ['Share', 'Edit name', 'Comments']:
        m = re.search(rf'{piece}:\s*(.{{0,160}})', one)
        cold[fr][piece][look(m.group(1)) if m else '?'] += 1
for f in sorted(glob.glob('q6/raw/readers/[a-z][a-z][a-z]-[0-9]-2.md')):
    fr = f.split('/')[-1].split('-')[0]; t = open(f).read()
    a = re.search(r'^A:\s*(.{0,40})', t, re.M).group(1); b = re.search(r'^B:\s*(.{0,20})', t, re.M).group(1)
    ra = re.search(r'Rule (\d)', a); A[fr]['none' if a.lower().startswith('none') else ('rule ' + ra.group(1)) if ra else '?'] += 1
    rb = re.search(r'(\d)', b); B[fr]['rule ' + rb.group(1) if rb else '?'] += 1
for fr in cold: print(fr, {p: dict(c) for p, c in cold[fr].items()})
print('expected (A)', {k: dict(v) for k, v in A.items()}); print('wanted (B)', {k: dict(v) for k, v in B.items()})
