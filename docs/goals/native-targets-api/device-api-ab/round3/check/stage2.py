# usage: python3 check/stage2.py <prompt path> <raw path>...   stages a follow-up (turn 2) prompt; appends to check/followups.tsv
import secrets, shutil, sys
prompt, raws = sys.argv[1], sys.argv[2:]
with open('check/followups.tsv', 'a') as out:
    for raw in raws:
        t = secrets.token_hex(4)
        shutil.copy(prompt, f'/tmp/devab3/p/{t}.md')
        out.write(f'{raw}\t{prompt}\t{t}\n')
        print(raw, t)
