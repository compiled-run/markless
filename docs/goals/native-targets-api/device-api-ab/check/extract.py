# usage: python3 extract.py <transcript.output> <raw-dest.md> [expected-prompt.md]
# Writes the agent's final answer, and reports tool calls and whether the prompt it got matches the saved prompt.
import json, sys
src, dest = sys.argv[1], sys.argv[2]
expected = open(sys.argv[3]).read() if len(sys.argv) > 3 else None
prompt, final, tools = None, None, 0
for line in open(src):
    o = json.loads(line)
    m = o.get('message') or {}
    c = m.get('content')
    if o.get('type') == 'user' and isinstance(c, str) and prompt is None:
        prompt = c
    if o.get('type') == 'assistant' and isinstance(c, list):
        for x in c:
            if x.get('type') == 'tool_use':
                tools += 1
            if x.get('type') == 'text' and x.get('text', '').strip():
                final = x['text']
open(dest, 'w').write(final or '')
match = None if expected is None else (prompt or '').strip() == expected.strip()
print(json.dumps({'dest': dest, 'toolCalls': tools, 'promptMatchesSaved': match, 'chars': len(final or '')}))
