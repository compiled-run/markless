# Over-preload coverage report

Measures how much of what each entrant downloads is actually executed, using V8 precise block coverage (CDP `Profiler.takePreciseCoverage`) plus CDP network timing. Chromium only. Serves each entrant from `apps/<name>` on its own port behind `../proxy.mjs` (HTTP/2, brotli 5, and the constrained shaped listener), exactly as `run.mjs` does.

```sh
node demos/interaction-benchmark/runner/preload-audit/overpreload.mjs \
  --targets markless,qwik,qwik-tuned,solidstart,sveltekit,react-router --out /tmp/overpreload
node demos/interaction-benchmark/runner/preload-audit/report.mjs /tmp/overpreload   # writes summary.md
node demos/interaction-benchmark/runner/preload-audit/selftest.mjs                   # coverage math, no browser
```

A scratch build of an app can be measured as `<base>-<variant>` with `--app-dir <base>-<variant>=<dir containing .output or dist>`. Ports: app servers from `--port-base` (default 4241) upward, proxies at +1000, hint filters after the app servers. `--lock <dir>` holds a mkdir lock during the timed M2 visits.

## Measures

- **M1 startup over-preload** (normal profile, cache disabled). Per route: load, wait for 1 s of network idle, snapshot coverage (boot). Then one fresh visit per control (every CONTRACT case on the route whose steps are not Back or a nav click, plus one click per nav link), snapshot again after the response and 750 ms of idle. Each startup JS file's bytes are split by the share of its characters that ran at boot, ran only in some control session, or never ran. Sizes: `wire` (brotli body through the proxy), `gzip` (gzip -6 of the body), `decoded`. Also the file-level view (startup files none of whose code ever ran) and JS fetched only after the first input. If a file has a `//# sourceMappingURL`, the split is attributed to original sources (`wasteBySource`).
- **M2 early click** (constrained profile: 150 ms RTT, 5/1 Mbps via the proxy link, 4x CPU). The CONTRACT early case, timed with the runner's page agent. From the network log: when the last byte of every JS file the control needs (boot + control closure from M1) arrived, when all startup JS finished, and how many bytes of other JS finished before the control's code. Lost inputs (no response in 10 s) keep their network timeline. With `--perfect <targets>` the same visits also run with HTML preload hints stripped to the control's file closure (`lib/hint-filter.mjs`), an upper bound for perfect file-level prediction; hints added by runtime JS are not affected.
- **M3 navigation** from `/`: hover the nav link 300 ms, click, wait for the destination and 1 s of idle. Bytes fetched at startup, during hover and after the click, and how much of each ran by the end of the navigation.

## Limits

- Coverage is binary per range and reset per snapshot; sessions are unioned by URL path. Characters are UTF-16 offsets, converted to bytes by share, so the split is proportional, not exact per byte.
- "Controls" are the CONTRACT cases and nav links, not every element on the page; code for other features counts as never run.
- Chromium only, one machine; M2 medians need several visits per cell (`--visits`).
