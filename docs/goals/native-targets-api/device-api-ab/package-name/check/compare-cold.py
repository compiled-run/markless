# usage: python3 check/compare-cold.py [tiebreak.json]   (run from package-name/) — compares scorers s1 and s2, applies a third scorer's marks where given, prints the decision table
import json, sys, collections
s1 = json.load(open('scores/cold-s1.json')); s2 = json.load(open('scores/cold-s2.json'))
tb = json.load(open(sys.argv[1])) if len(sys.argv) > 1 else {}
marks = ['a', 'b', 'c', 'q4', 'q5', 'q7', 'q7Clash']
agree = total = 0; dis = []
final = {}
for r in sorted(s1):
    f = {}
    for m in marks:
        total += 1
        if s1[r][m] == s2[r][m]: agree += 1; f[m] = s1[r][m]
        else:
            dis.append((r, m, s1[r][m], s2[r][m])); f[m] = tb.get(r, {}).get(m)
    w1 = bool(s1[r]['wrongMeanings']); w2 = bool(s2[r]['wrongMeanings'])
    total += 1
    if w1 == w2: agree += 1; f['wm'] = w1
    else: dis.append((r, 'wm', w1, w2)); f['wm'] = tb.get(r, {}).get('wm')
    final[r] = f
print(f'agreement {agree}/{total}')
for d in dis: print('disagree', *d)
pages = collections.defaultdict(list)
for r, f in final.items(): pages[r.rsplit('-', 2)[0]].append((r.rsplit('-', 2)[1], f))
for p, rs in sorted(pages.items()):
    full = {fr: sum(1 for x, f in rs if x == fr and f['a'] == f['b'] == f['c'] == 1) for fr in ('beginner', 'experienced')}
    cnt = lambda m: sum(1 for _, f in rs if f[m] == 1)
    print(f"{p}: full beginner {full['beginner']}/3 experienced {full['experienced']}/3 score {(full['beginner'] + full['experienced']) / 6:.2f} | a {cnt('a')} b {cnt('b')} c {cnt('c')} q4 {cnt('q4')} q5 {cnt('q5')} q7 {cnt('q7')} clash {cnt('q7Clash')} wrong {sum(1 for _, f in rs if f['wm'])}")
