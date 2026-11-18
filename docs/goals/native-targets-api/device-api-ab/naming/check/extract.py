# usage: python3 check/extract.py [map.tsv]   (run from naming/)
# map rows: <raw path without .md> <saved prompt> <prompt token or -> <agent id>
# Writes each agent's final answer per turn to <raw>.md (turn 2 to <raw>-2.md), and checks the agent got the saved prompt:
# token rows must make exactly one tool call, a Read of /tmp/nsname/p/<token>.md; '-' rows must make none.
# Rows in check/followups.tsv got a second turn and must make a second Read, of their follow-up file.
import json, os, sys
TASKS = '/private/tmp/claude-501/-Users-jackshelton-wt-markless-namespace-name/a1662b84-4d9c-4898-b28a-7ac2b3681692/tasks'
rows = [l.rstrip('\n').split('\t') for l in open(sys.argv[1] if len(sys.argv) > 1 else 'check/map.tsv') if l.strip()]
follow = {r[0]: (r[1], r[2]) for r in (l.rstrip('\n').split('\t') for l in open('check/followups.tsv') if l.strip())} if os.path.exists('check/followups.tsv') else {}
bad = []
for raw, prompt_path, token, agent in rows:
    src = os.path.join(TASKS, agent + '.output')
    if not os.path.exists(src):
        print('pending', raw); continue
    saved = open(prompt_path).read().strip()
    turns, cur, tools, reads, first_prompt = [], None, 0, [], None
    for line in open(src):
        o = json.loads(line)
        m = o.get('message') or {}
        c = m.get('content')
        if o.get('type') == 'user' and isinstance(c, str):
            if first_prompt is None: first_prompt = c
            cur = {'final': None}; turns.append(cur)
        if o.get('type') == 'user' and isinstance(c, list) and cur is None:
            t = ''.join(x.get('text', '') for x in c if x.get('type') == 'text')
            if t:
                first_prompt = first_prompt or t; cur = {'final': None}; turns.append(cur)
        if o.get('type') == 'assistant' and isinstance(c, list):
            for x in c:
                if x.get('type') == 'tool_use':
                    tools += 1; reads.append(json.dumps(x.get('input')))
                if x.get('type') == 'text' and x.get('text', '').strip() and cur is not None:
                    cur['final'] = x['text']
    for i, t in enumerate(turns):
        dest = raw + ('.md' if i == 0 else f'-{i+1}.md')
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        open(dest, 'w').write((t['final'] or '').rstrip() + '\n')
    if token == '-':
        ok = (first_prompt or '').strip() == saved and tools == 0
    else:
        same = open(f'/tmp/nsname/p/{token}.md').read().strip() == saved
        ok = same and f'/tmp/nsname/p/{token}.md' in reads[0]
        if raw in follow:
            fp, ft = follow[raw]
            ok = ok and tools == 2 and len(turns) == 2 and f'/tmp/nsname/p/{ft}.md' in reads[1] and open(f'/tmp/nsname/p/{ft}.md').read().strip() == open(fp).read().strip()
        else:
            ok = ok and tools == 1
    if not ok: bad.append(raw)
    print(raw, 'turns', len(turns), 'tools', tools, 'ok' if ok else f'CHECK {reads}')
print('problems:', bad)
