# Redeploy measurement

What a returning visitor re-downloads after a deploy, per entrant and edit. Byte counts only; nothing is timed.

```sh
node run.mjs --out /tmp/redeploy --apps markless,qwik --labels base1,base2,e1,e2,e3,e4,e5,e6 [--keep 1]
node report.mjs /tmp/redeploy > report.md
```

`base1` and `base2` are two clean builds (determinism check); `e1`-`e6` are the edits in `edits.mjs`, applied one
at a time to each app's source and restored after the build. `--keep 1` also copies each build's static directory.
`website-capture.mjs` and `website-diff.mjs` do the same for the docs site. Results from 2026-09-25 live in
`../../results/redeploy-2026-09-25/`.
