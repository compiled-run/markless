# usage: python3 check/tally-writers.py <g1.json> <g2.json>   (run from naming/) — per-candidate writer counts from both graders, and every disagreement
import collections, json, sys
g = [json.load(open(p)) for p in sys.argv[1:3]]
flags = ['wrongKind', 'webGuard', 'styledFrame']
dis = 0; n = 0
for k in sorted(g[0]):
    for t in ['orders', 'whatsnew', 'scan', 'invoice']:
        for f in flags + ['webSays']:
            n += 1; a, b = g[0][k]['tasks'][t][f], g[1][k]['tasks'][t][f]
            if a != b: dis += 1; print('DIFF', k, t, f, a, b)
        a, b = len(g[0][k]['tasks'][t]['inventedMembers']), len(g[1][k]['tasks'][t]['inventedMembers'])
        n += 1
        if a != b: dis += 1; print('DIFF', k, t, 'invented', g[0][k]['tasks'][t]['inventedMembers'], g[1][k]['tasks'][t]['inventedMembers'])
    n += 1
    if g[0][k]['wrongImport'] != g[1][k]['wrongImport']: dis += 1; print('DIFF', k, 'wrongImport')
print(f'agree {n - dis} of {n}')
for i, gr in enumerate(g):
    c = collections.defaultdict(collections.Counter)
    for k, v in gr.items():
        x = k.rsplit('-', 1)[0]
        for t, tv in v['tasks'].items():
            for f in flags: c[x][f] += tv[f]
            c[x]['invented'] += len(tv['inventedMembers']); c[x]['guard:' + t] += tv['webGuard']
        c[x]['wrongImport'] += v['wrongImport']
        c[x]['writersGuarding'] += any(tv['webGuard'] for tv in v['tasks'].values())
    print('grader', i + 1); [print(' ', x, dict(c[x])) for x in sorted(c)]
