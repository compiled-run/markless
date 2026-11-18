# Non-blank lines inside fenced code blocks per answer, averaged per label. usage: python3 check/lines.py <raw dir>
import glob, re, sys, collections
per = collections.defaultdict(list)
for f in sorted(glob.glob(sys.argv[1] + '/*.md')):
    lab = f.split('/')[-1].split('-')[0]
    n, inside = 0, False
    for line in open(f):
        if re.match(r'^\s*```', line): inside = not inside; continue
        if inside and line.strip() and not line.strip().startswith('// file:'): n += 1
    per[lab].append(n)
print({k: round(sum(v) / len(v)) for k, v in per.items()})
