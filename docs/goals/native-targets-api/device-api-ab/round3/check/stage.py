# usage: python3 check/stage.py <prompt path> <raw path>...   (run from round3/)
# Copies the prompt to /tmp/devab3/p/<random token>.md per raw path and appends "<raw> <prompt> <token> PENDING" to check/map.tsv.
import os, secrets, shutil, sys
prompt, raws = sys.argv[1], sys.argv[2:]
with open('check/map.tsv', 'a') as out:
    for raw in raws:
        t = secrets.token_hex(4)
        shutil.copy(prompt, f'/tmp/devab3/p/{t}.md')
        out.write(f'{raw}\t{prompt}\t{t}\tPENDING\n')
        print(raw, t)
