# usage: python3 check/tally-blind.py   (run from package-name/)
import collections, glob, re
for part in 'AB':
    any_, first = collections.Counter(), collections.Counter()
    by = collections.defaultdict(collections.Counter)
    for f in sorted(glob.glob('blind/raw/*.md')):
        fr = f.split('/')[-1].split('-')[0]
        names = re.findall(rf'^{part}(\d)\.\s*`([a-z]+)`', open(f).read(), re.M)
        assert len(names) == 3, f
        for n, x in names:
            any_[x] += 1; by[x][fr] += 1
            if n == '1': first[x] += 1
    print(part, 'package' if part == 'A' else 'inner namespace')
    for x, c in any_.most_common(): print(f'  {x}: {c} writers ({first[x]} first) {dict(by[x])}')
