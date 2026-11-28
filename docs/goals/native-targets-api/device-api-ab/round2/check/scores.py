# usage (from round2/): python3 check/scores.py
# Builds scores.csv (one row per writer answer and task), scores-reading.csv (one row per reader, design, question)
# and prints the per-design summary used in report.md.
import csv, json, re, statistics as st

LABELS = ['WZ', 'JR', 'ZK', 'DU', 'KJ']
GOOD = {'B1': False, 'B2': True, 'B3': True, 'B4': True, 'B5': True}


def task_blocks(path):
    lines, task, fence, out, conf = open(path).read().split('\n'), None, False, {}, {}
    for line in lines:
        m = re.match(r'^#+ .*?Task (\d)\b', line)
        if m and not fence:
            task = m.group(1)
        if re.match(r'^```', line):
            fence = not fence
            continue
        if fence and task and line.strip():
            out[task] = out.get(task, 0) + 1
        c = re.match(r'^Confidence:\s*(\d)', line)
        if c and task and not fence:
            conf[task] = int(c.group(1))
    return out, conf


grades = {L: {g: json.load(open(f'raw/grades/{L}-{g}.json'))['answers'] for g in ('g1', 'g2')} for L in LABELS}
b5 = {g: json.load(open(f'raw/grades/b5-{g}.json'))['answers'] for g in ('g1', 'g2')}

rows, summary = [], {}
for L in LABELS:
    s = summary[L] = {'lines': [], 'conf': [], 'mistakes': [0, 0], 'missing': [0, 0], 'avoided': {b: [0, 0] for b in GOOD}}
    for i in range(1, 6):
        a = f'A{i}'
        lines, conf = task_blocks(f'raw/writers/{L}-{i}.md')
        s['lines'].append(sum(lines.values()))
        s['conf'].extend(conf.values())
        for gi, g in enumerate(('g1', 'g2')):
            ans = grades[L][g][a]
            for t, r in ans['tasks'].items():
                s['mistakes'][gi] += r['offSheet'] + r['misuse']
                # returns-centred was judged under the incomplete B5 fact; the B5 re-grade replaces it.
                s['missing'][gi] += len([x for x in r['missing'] if x != 'returns-centred'])
            if not b5[g][L][a]['value']:
                s['missing'][gi] += 1
            for b in GOOD:
                if b == 'B5':
                    ok = b5[g][L][a]['value']
                elif b == 'B2' and L == 'KJ' and g == 'g2':
                    # g2's reason matches g1's ("removed from the markup ... releases it"); its boolean was inverted.
                    ok = True
                else:
                    ok = ans['bugs'][b]['value'] == GOOD[b]
                s['avoided'][b][gi] += int(ok)
        for t in sorted(set(lines) | set(conf)):
            g1, g2 = grades[L]['g1'][a]['tasks'].get(t, {}), grades[L]['g2'][a]['tasks'].get(t, {})
            rows.append({
                'design': L, 'writer': i, 'task': t, 'lines': lines.get(t, 0), 'confidence': conf.get(t, ''),
                'g1_offSheet': g1.get('offSheet', ''), 'g1_misuse': g1.get('misuse', ''), 'g1_missing': ' '.join(g1.get('missing', [])),
                'g2_offSheet': g2.get('offSheet', ''), 'g2_misuse': g2.get('misuse', ''), 'g2_missing': ' '.join(g2.get('missing', [])),
            })

with open('scores.csv', 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0]))
    w.writeheader()
    w.writerows(rows)

scorers = {k: json.load(open(f'raw/scores/scorer{k}.json'))['scores'] for k in ('1', '2')}
reading, ranks, confused = {L: [] for L in LABELS}, {L: [] for L in LABELS}, 0
rrows = []
for r in scorers['1']:
    for L in LABELS:
        for q in [f'Q{n}' for n in range(1, 9)]:
            a, b = scorers['1'][r][L][q], scorers['2'][r][L][q]
            reading[L].append((a + b) / 2)
            rrows.append({'reader': r, 'design': L, 'question': q, 'scorer1': a, 'scorer2': b})
    for pos, L in enumerate(scorers['1'][r]['ranking']):
        ranks[L].append(pos + 1)
    confused += int(scorers['1'][r]['recorderConfused']['value'])
with open('scores-reading.csv', 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(rrows[0]))
    w.writeheader()
    w.writerows(rrows)

n_readers = len(scorers['1'])
for L in LABELS:
    s = summary[L]
    print(L,
          'mistakes/40', [m / 40 for m in s['mistakes']],
          'missing/40', s['missing'],
          'avoided', {b: v for b, v in s['avoided'].items()},
          'lines', round(st.mean(s['lines'])), (min(s['lines']), max(s['lines'])),
          'conf', round(st.mean(s['conf']), 2),
          'reading', f"{sum(reading[L]) / len(reading[L]):.0%}",
          'rank', round(st.mean(ranks[L]), 2), sorted(ranks[L]))
print('recorder confused (scorer 1):', confused, 'of', n_readers)
