# Holdout lane

Measures realistic Markless apps that nobody tuned the delivery work against, so a gain on the interaction benchmark can be checked for being framework-wide. The harness never edits an app: it builds each one with its own `vite.config.ts`, once as-is (`default`) and once with `markless()` options forced from outside (`packed` = `{ experimentalNativePacking: true }`).

| App (`lanes.mjs`) | Source                            | What it covers                                                                                                                         |
| ----------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `sr-app`          | `packages/headless/sr-app`        | Client-only render, every shipped `@markless/ui` family on one page                                                                    |
| `live-feed-ssr`   | `demos/live-feed-ssr`             | SSR + router, async computed behind `@try`/`@pending`, keyed list                                                                      |
| `router-app`      | `packages/router/fixtures/router` | SSR + router across three routes: TSRX pages, an MDX page with an interactive component, a streamed `@pending` page, `Link` navigation |

## Running

```sh
# Baseline or final audit (writes demos/interaction-benchmark/results/holdout-<date>[-<label>]/)
node demos/interaction-benchmark/runner/holdout/run.mjs --label baseline
node demos/interaction-benchmark/runner/holdout/run.mjs --label final

# Subsets
node demos/interaction-benchmark/runner/holdout/run.mjs --lanes sr-app --variants packed --browsers chromium --profiles constrained

node demos/interaction-benchmark/runner/holdout/selftest.mjs
node demos/interaction-benchmark/runner/holdout/report.mjs <result dir>   # rebuild summary.md from records.jsonl
```

Flags: `--lanes`, `--variants default,packed` (`unpacked` forces `experimentalNativePacking: false`, for when packing is the default), `--browsers chromium,webkit`, `--profiles normal,constrained`, `--load-visits N` (3), `--max-controls N` (12, evenly spaced over the discovered controls), `--max-links N` (4), `--out <dir>`, `--label <suffix>`, `--no-build` (serve the last build), `--no-coverage`, `--lock <dir>` / `--no-lock`, `--repo <checkout>` (measure the apps of another checkout, e.g. an older revision, with this harness).

Each app variant's build, serve and timed visits run holding `/private/tmp/mlbench-timing.lock` (see the goal's `notes/machine-lock.md`); under contention a wait-until-free loop before the build never found a gap, so the build sits inside the lock too.

## How it works

- **Build and serve.** `lib/build-app.mjs` runs Vite's `createBuilder().buildApp()` and `preview()` in a child process started with `node --import lib/markless-options-hook.mjs`. With `HOLDOUT_MARKLESS_OPTIONS` set, the hook serves `packages/bundler/src/vite/index.ts` through a wrapper whose `markless()` merges those options over the app's own. Builds write the app's normal output directories (`dist/`, `.output/`, all gitignored), so variants build and measure one after another.
- **Transport.** Each served variant sits behind `../proxy.mjs` (HTTP/2, brotli 5). The constrained profile uses the proxy's shaped listener in both browsers; the 4x CPU slowdown is applied only in Chromium (CDP), as in the main runner.
- **Per route and cell** (browser x profile), fresh browser context per visit, Chromium HTTP cache disabled:
    - _Load_ (`--load-visits` visits): open at `commit`, wait for `load` plus 500 ms without requests. Requests, wire bytes by kind, serial request rounds, JS files fetched and how many had a preload hint, first contentful paint. One extra Chromium visit per profile takes V8 precise coverage: characters and functions executed at load, and preloaded JS files that never executed.
    - _Controls_: discovered in the settled page (`button, summary, select, textarea, input, [role=button|tab|checkbox|switch|menuitem|option|slider|radio|combobox|spinbutton|textbox|...]`, contenteditable; links excluded), deduplicated by role + label with digits folded.
    - _First click_ (settled): state signature, then a trusted click (plus one typed character for text fields, another option for selects). Input-to-response is the page's input event timestamp to two frames after the first DOM mutation; JS requests started after the input are the click-time fetch.
    - _Early click_: a fresh visit clicks the same control as soon as the runner's paint gate (`../lib/page-agent.mjs` `actionable`) passes, then settles. Verdict against the settled visit: `survived` (same end state as a settled click), `lost` (end state equals the idle page), `diverged` (neither), `no-observable-response` (the settled click changes nothing the signature sees, so not counted), `indeterminate` (reference missing, or the idle page itself differs between visits). The signature hashes body text, form values, and state attributes (`aria-checked|pressed|selected|expanded|valuenow|...`, `data-state`, `open`, `hidden`); focus and layout are not part of it.
    - _Navigation_: each internal link (distinct pathname, up to `--max-links`) is clicked on a settled page. Latency is input to the URL matching (page agent, across documents). Serial request rounds come from the destination document's Resource Timing (both browsers); requests and bytes cover everything started after the click began.
- **Host pinning.** `lib/host-pin.mjs` sits between the proxy and the app server and restores the app's own `Host`, so SSR code that fetches its own origin (live-feed-ssr) does not call the proxy's TLS port over plain HTTP.
- **Outputs**: `records.jsonl` (one record per visit), `summary.json` (medians per lane / variant / browser / profile), `summary.md`, `run.json` (revision, versions, options, build info).

## Limits

- Controls are sampled, not exhaustive; the same sample is used for every variant because discovery is deterministic for an unchanged app.
- WebKit has no coverage and no CPU throttling; its constrained cells are network-only.
- Single machine, few visits: treat differences under about 10% on timings as noise; request and byte counts are exact.
