# Keeping CI green

How to stop pushing red to `main` without weakening any check. The evidence behind each rule is in [ci-failure-history.md](./ci-failure-history.md): over twelve weeks `main` was red 85% of the time, and 59% of pushes to `main` landed on a `main` that was already red.

Three causes account for almost all of it:

1. **The CI command was never run before the push.** Most red runs are ordinary test, typecheck, box, or byte-budget failures that fail the same way on a Mac. 99 of 122 pushes to `main` skipped a PR, so CI saw them first.
2. **Red was left red.** Once `main` is red, the next push cannot tell whether it broke something, so breaks pile up (the 32-day and 25-day stretches each hold several separate regressions).
3. **A local run is not a CI run.** `pnpm test` runs a different command set from `ci.yml`; the Mac has browsers, tools, and untracked files the runner does not; some failures only happen on Linux.

The process below answers each one.

## 1. `pnpm ci:local`: run exactly what CI runs

For a write task only `--fast` runs locally; heavier jobs run on the pull request (section 3).

`scripts/ci/local.mjs` reads `.github/workflows/ci.yml` at run time and runs each job's `run:` steps. Nothing is copied from the YAML by hand, so a step added to the workflow is picked up automatically. The only thing the script owns is a small table saying, for each job with checks, whether it belongs to the fast set, the full set, or runs only in CI. A new job without an entry makes the script exit with an error that names it, so the table cannot fall behind silently.

```sh
pnpm ci:local --list      # every job and step in ci.yml, and what runs locally
pnpm ci:local             # fast mode (same as --fast)
pnpm ci:local --full      # every job this machine can run (debugging only: the PR's CI run is the receipt)
pnpm ci:local --job browser --job boxes-router   # just these jobs
pnpm ci:local --clean     # same, in a throwaway worktree of HEAD
pnpm ci:local --linux     # each job in its own Linux container (needs docker)
pnpm ci:local --install   # also run the jobs' setup steps (pnpm install, Playwright)
pnpm ci:local --workflow .github/workflows/screen-reader.yml --list
```

How steps are sorted:

- **check**: a `run:` step that tests something. These run.
- **setup**: `pnpm install`, `corepack enable`, `playwright install`. Run only with `--install`.
- **skipped**: `uses:` actions, lane cache markers, and steps whose `if:` or command reads GitHub context (`needs.`, `steps.`, `github.`). These are CI plumbing: locally every lane runs, so there is no cache hit to test for.

Sharded jobs (`--shard=${{ matrix.shard }}`) run once, unsharded. Other matrices (the screen-reader families) expand, and a command repeated across matrix entries runs once. Every command runs with `CI=true`, the job's `env:`, and `bash -eo pipefail`, as on the runner.

### Modes and what they cost on this Mac

Measured on `origin/main` at `1f6d2cd3` (Apple Silicon, warm pnpm store):

| Mode      | Jobs                                                                                                                                               | Time                                                                                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--fast`  | `agent-files` (2 s), `typecheck` (workflow check, `pnpm typecheck`, `vp check --no-fmt`: 9 s), `typecheck-ts7` (`pnpm typecheck:ts7`, TypeScript 7.1 over the root and `website/`: about 3 s, added later), `unit` (`vp test --project node`: 52 s)             | **64 s**                                                                                                                                                                      |
| `--full`  | fast, plus `browser` (browser + `ui` projects, `api:check`), `completion-matrix` (measured alone: 6 s), the four box jobs, `receipts`, `website-boxes`, `perf-guards`, `demo-boxes`, `package-manager-matrix` | not timed end to end in this task: the box jobs bind fixed ports that another worker on this machine was using; expect roughly the sum of the CI lane times, 20 to 40 minutes |
| `--clean` | any mode, in a fresh worktree of `HEAD`                                                                                                            | adds about 5 s (worktree + offline `pnpm install`)                                                                                                                            |

`--fast` on `1f6d2cd3` passed locally, while the same commit's `unit` job failed on CI with 110 failures. The failures were `browserType.launch: Executable doesn't exist`: node-project tests launch Chromium and WebKit, and the `unit` job installs no browsers. The Mac has both browsers cached, so a plain local run cannot see this. `--linux` can, because each job gets its own container with only the setup steps that job declares.

### Jobs that do not run locally

| Job                                                                   | Why                                                                                                                                                         | What to do instead                                                                                                                                    |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `benchmark`, `benchmark-guard`                                        | Clones `js-framework-benchmark`, builds a baseline worktree, and runs 30 minutes of interleaved Chrome pairs; the guard only compares that job's artifacts. | When a diff can reach the benchmark bundles, open a PR and let CI run it. Rerun a timing-only red once before treating it as real (see flake policy). |
| `lanes`, `prepare-playwright`, `save-lane-markers`, `test`, `changes` | Content-hash lane skipping and the gate. No checks of their own.                                                                                            | Nothing: locally every lane runs.                                                                                                                     |
| screen-reader `nvda`                                                  | Needs Windows with NVDA.                                                                                                                                    | CI only.                                                                                                                                              |
| screen-reader `voiceover`                                             | Needs a macOS runner with VoiceOver automation granted.                                                                                                     | `pnpm test:sr-real` by hand on a prepared Mac.                                                                                                        |

`package-manager-matrix` runs when `bun` and `corepack` are on `PATH` (they are on this Mac) and is skipped with a message otherwise. Browser jobs are skipped with a message when Playwright's Chromium is not installed; `--install` fixes that.

Side effect to know about: the `agent-files` job runs `pnpm dlx @intellectronica/ruler@0.3.44 apply`, which rewrites the generated agent files, including the committed `.agents/` directory. That is what CI does on its throwaway checkout; locally, a change it leaves in `.agents/` means a generated file is stale and belongs in the commit (do not delete `.agents/`, it is tracked), or run with `--clean`.

### Perf guards

`pnpm perf:guard` used to run only at the end of `pnpm test`, which CI does not run, so its failures were invisible. From 2026-10-06 to 2026-10-21 the guard measured the docs site's 404 page three times: the docs moved to the site root, while `SITES` in `scripts/benchmarks/perf-guards/config.mjs` still listed `/markless/*`. The guard now reads the base from `website/site-base.ts` and stops when a guarded route does not answer 200. The `perf-guards` lane runs the full set on every PR whose inputs changed: 5 min 51 s on the runner, 5 min 16 s of it the guards, shorter than the slowest `unit` shard at 7 min 18 s, so a per-PR subset would not shorten a PR's wait.

On the real docs pages G2 (no JS fetched by a control's first use) first failed 17 times on this Mac and 22 on the runner. The 17 were the `<Code>` playground, whose boot loads its session, editor, compile worker and result frame. A block now downloads all of it when it scrolls into view or the page goes idle (`components/docs/code/prefetch.ts`, listed per block in `_code-prefetch.json` by `tooling/code-prefetch.ts`). It downloads without running anything: `modulepreload` for the page's modules, `prefetch` into the HTTP cache for the worker and frame. The other five were the router's idle link preload landing after the guard's first click on the slower runner. The guard now waits until an idle period passes with no new request before the first input, and counts a request only when it reaches the network: a file the HTTP cache answers transfers nothing and costs no round trip.

### Suites no CI job runs

Each of these was checked on 2026-10-21. `demos/live-feed` and `demos/same-module-branch` boxes now run in `demo-boxes`, the `@markless/ui` `api:check` in `browser`, and the `demos/executed-at-load` fixture tests in `demo-boxes`. `pnpm docs:errors:check` ran a retired generator that wrote `docs/pages/errors/`; it now runs `website/tooling/errors.ts --check`, the same drift check `website/tooling/errors.test.ts` makes in `website-boxes`. The rest stay outside CI:

| Suite | Why it is not in CI |
| --- | --- |
| `demos/live-feed-ssr` boxes | Red on the Linux runner, green on macOS, the same on two runs: the settled SSR page runs 174.8 KB at load (1,101 app bytes) where macOS resumes with none. A pre-existing failure to fix before the suite joins `demo-boxes`. |
| `demos/executed-at-load` `gate` | Five demo builds plus navigation caps in milliseconds (`STATIC_ROUTER_NAVIGATION_MS_CAP`); a wall-clock cap is not a merge gate (flake policy). Its music-player byte budgets are covered by `packages/bundler/test/music-player-*-budget.test.ts`. |
| `website` `witness` | Writes screenshots to a developer-machine path and carries its own known-failing list; the website boxes are the CI form. |
| `website` `typecheck` | The Markless-plugin checker over `website/`; CI checks `website/` with TypeScript 7 in `typecheck-ts7` only. |
| `demos/benchmarks`, `demos/chained-async-comparison` `test` | Benchmark harness self-tests, several of which launch browsers and build three frameworks. |
| `demos/interaction-benchmark/apps/*` `typecheck`, `sync:check` | Comparison apps in other frameworks; `apps/markless` `sync:check` runs inside its build, which only the perf guards run. |
| `poc/*` | Evidence, not the framework. |

## 2. Linux parity

Some failures only happen on the Ubuntu runner: the HMR reload race (null-byte module re-read), the `yuku-tsrx` Linux binding, Chromium's Shift+F10 handling in `context-gate`, and every "job forgot to install a browser" failure.

**Feasibility on this Mac, measured:** `docker`, `act`, `colima`, `podman` and OrbStack are not installed (`command -v` finds none, no app in `/Applications`, nothing in `brew list`). So Linux parity cannot run here today. `pnpm ci:local --linux` exits with code 2 and says so. The code path is written but has not been run.

What `--linux` does once a container runtime exists:

1. `git archive HEAD` streams the committed tree (not the working copy) into a `node:24-bookworm` container (`--platform linux/amd64`, the runner's architecture).
2. One container per job. Inside: `git init` so `agent-files` can diff, pnpm 10.33.2 via corepack, `pnpm install --frozen-lockfile`, then `local.mjs --install --job <id>`, which runs **only that job's own setup steps** before its checks. As root on Linux, `playwright install-deps` runs too.

To enable it (owner decision, it installs software): `brew install colima docker && colima start --cpu 6 --memory 12 --arch x86_64`. x86 emulation on Apple Silicon is slow; `--arch aarch64` is faster but no longer matches the runner's CPU, which matters for native bindings like `yuku-tsrx`.

Why not `act`: it replays the whole workflow including `actions/cache`, artifacts, and the lane gate, needs a 12 to 20 GB runner image to match `ubuntu-latest`, and still emulates x86 on this Mac. `--linux` runs the same commands with only the container part added. `act` stays useful for debugging the workflow file itself (a new `if:`, a new artifact path); `act -n` (dry run) is cheap for that.

When to use it: before pushing anything that touches the HMR/dev server, native dependencies, keyboard or focus handling in browser tests, or the workflow's install steps. Otherwise, a PR run is the Linux check.

## 3. What runs where (agents and PM)

Heavy verification runs on GitHub Actions, not on this Mac. The org's plan runs 60 jobs at once; this Mac runs about three heavy commands before everything on it slows down, and the load itself made tests flaky.

1. **Locally, every write task:** `pnpm run typecheck` and `pnpm ci:local --fast` (agent files, typecheck, unit). The pre-commit hook runs the fast jobs on every commit too.
2. **On GitHub, through the pull request:** everything heavier. That means browser, the `boxes-*` lanes, build-scale, perf-guards, the benchmark, demo and website boxes, and the migrate checks. Push the branch, open the PR, and let CI run.
3. **The receipt is the PR's green CI run** on the exact commit: its run URL, or the commit's check summary. No task is reported done before that run is green. "Green on N local runs" in prose is not a receipt.
4. **Local heavy runs are for debugging one specific failure:** `pnpm ci:local --job <id>`, or the single test file. They do not replace the PR run.
5. **A/B build timings** go through the `Build timing` workflow (`gh workflow run build-timing.yml -f base=<ref> -f head=<ref> -f app=<dir> -f rounds=<n>`), which interleaves both refs on one runner. No scratch branches.

Multi-commit series (for example a migration done unit by unit) go on a branch with a PR. `main` gets the series after the PR is green, not one red commit at a time. The vite-plus migration put 21 consecutive red commits on `main` this way.

A release commit runs `pnpm release:check` and `--fast`; a new package additionally needs its npm trusted-publisher entry before the first publish (two release runs failed with `E404` on a package's first publish).

## 4. Flake policy

A flake is a test that fails and passes on the same code. Rules:

- **No silent retries.** Do not add `retry:` to vitest projects, `--retries` to Playwright, or rerun loops in the workflow. A rerun of a red CI run is allowed once, by a person, with a note in the PR or ledger saying which test and why it is believed to be noise.
- **Quarantine is explicit and expires.** A flaky test may be moved to a quarantine list (for example `test.skip` behind a `QUARANTINED` marker naming the owner and an expiry date, at most two weeks out) in the same commit that files the fix task. An expired entry fails CI, so quarantine cannot become permanent. The quarantine list is small and visible, never a pattern in a config.
- **Fix the mechanism, not the timeout.** Raising a timeout is acceptable only with a measured reason (the test's real work takes longer on the runner). The recurring flakes all have concrete mechanisms:
    - `expect.poll` windows too short under load (`capture-slot-binding`, `broadcast-diamond`): wait on the event the test is about (a settle promise, a DOM mutation) instead of a fixed poll window.
    - 5-second timeouts on a cold TypeScript language service (`language.test.ts`, `create.test.ts`): warm the service once in `beforeAll`, or give the known-slow test its own measured timeout.
    - `server.watcher.unwatch(root)` right after `createServer` (`ssr-browser-hmr`): chokidar ignores the root's children only once its asynchronous first scan has registered the root, so on linux the test's own file writes still arrive as watcher events. A test that emits its own watcher events creates the server with `server.watch: null`.
    - Server `close timed out after 10000ms` in boxes: close idle keep-alive connections before `close()`.
    - A test that times out keeps running while `afterEach` runs (`ssr-browser-hmr`: "Failed to load url ... Does the file exist?" in the next test). `afterEach` closes every server a test started before it removes the test's temp root.
    - A child process's log line or a Playwright `response` handler's body read can arrive after the response the test awaited (`stream-settle-failure`, `lookup-table-imports`). Await the line (`BuiltServer.waitForOutput`) or the handler's own promise; do not read the value synchronously.
    - A whole Vite build, dev server start or child `npm` process under the 5 s default (`rolldown`, `ssr-browser-hmr`, `create`): measured at 2 to 7 s at load average 80 to 110 on the 18-core Mac, so these tests carry a stated 30 s timeout. The same holds for tests that spawn `markless-tsc`, TypeScript 7.1 or tsserver, or compile or type-check a large input (`markless-tsc`, `language`, `template-dynamic-import`, `doctrine-guard`, `node-in-browser-fixture`, `static-arm-literal-text`, `storage-types`): 2.3 to 4.2 s alone at load average 54, so they carry 30 s. `router/test/package-build` packs and type-checks the router in 22.8 s alone at that load and carries 120 s.
    - Fixed ports: bundler tests on 4218 and 4346 to 4348, router boxes on 3000, music-player boxes on 4173, perf guards on 4221 to 4224. Listen on port `0` and read the assigned port back, as the other tests already do. Where a fixed port is unavoidable, make it overridable (as `MARKLESS_PERF_GUARD_PORTS` does) and fail fast with "port in use" rather than timing out.
- **Timing benchmarks are not correctness checks.** `benchmark-guard` timing rows are known to be two-speed on runners (`07_create10k`). A timing-only red on a diff that cannot reach the benchmark bundles gets one rerun, recorded; size rows are deterministic and are never rerun away. Each benchmark shard now builds the benchmark app from the baseline checkout and from the current one before timing anything (`scripts/benchmarks/jsfb-bundle-digest.mjs`). When every file in both `dist` folders is byte-identical, after the checkout's own path is written out of them, nothing a benchmark loads changed: the shard skips the timing and the guard passes. If the shards disagree, the build is not deterministic and the guard fails. From 2026-10-21 21:49 to 2026-10-22 07:53, 8 of 69 guard runs went red, and in every one the two builds emitted the same content-hashed chunks (read from the shard logs), so those 8 were noise (11.6% of runs). The one run in that window whose builds differed was timed and passed. With the identity check, all 8 would have passed without timing. Timing still runs, with the same noise, whenever the built app differs.

### Quarantined tests

| Test | Expires | Owner | Why |
| --- | --- | --- | --- |
| `packages/vitest-browser/browser/row-branch-handlers/row-branch-shapes.test.ts`, "SSR: the edit-row demo edits and saves rows that are each an @if" | 2026-11-10 | thejackshelton | Failed the pull request run of #318 and the merge group for #310 on 2026-10-27, each `expected '0' to be '1'` on the request count, which dropped #310 from the merge queue. On this Mac it failed 5 of 6 cold runs on main. One timer writes the rows and the count together, but the row update commits at once while the `{requests}` text update first loads its code (`packages/web/src/fns/update-text.ts`), so the count lands about 50 ms later (measured: 52 ms, two polls). A runtime defect, not a test race: the runtime must load every update one turn needs before committing any of them. That fix is assigned to the first-click and preload work. On the expiry date the test runs again and a guard test in the same file fails. |

## 5. Keeping `main` green

- **A red `main` blocks every push except the fix.** When `main` goes red, the next push to `main` must be the fix or a revert of the breaking commit. Everything else waits on a branch. This is the rule that would have prevented the 70 pushes onto an already-red `main`.
- **Revert first when the fix is not quick.** If the cause is not fixed within a working session (a few hours), revert the breaking commit and fix forward on a branch, as was done for the HMR barrier change (`a26de5e5` reverted by `dc6e20f1`).
- **Whoever pushed the break owns the fix.** For agent work, the PM assigns the fix task before dispatching anything else that pushes.
- **A pre-existing red is a task, not background.** If a check is red on `main` when a goal starts, the first task is to fix it or quarantine it under the flake policy. Do not work around it and do not describe new failures as "the same red".
- **Branch protection (owner action).** `main` has no branch protection today. Requiring the `test` gate, `typecheck`, and `agent-files` status checks would turn this rule from a habit into a mechanism. `package-manager-matrix` and `benchmark-guard` are already designed to block as separate checks once required.

## 6. Budgets and anchors

Byte walls and budgets failed 54 runs, usually by a few bytes to a few hundred. The existing performance-guard model is the rule for all of them:

- Changing a budget or anchor requires a one-line reason in the same commit (`pnpm perf:guard:accept <guard> "<subject>" --reason "<one line>"` for the perf guards; the same shape for `fixture-builds` walls, the music-player budgets, box byte walls, and the `reason` beside each budget in `scripts/benchmarks/build-scale/budgets.json`).
- Re-anchoring is a decision, not a fix: the reason says what the extra bytes buy, or which win the lower anchor records.
- A big win re-anchors in the same change set, so the anchor stays close to reality.
- Byte walls must be measured the way CI measures them (`NODE_ENV=test` from vitest, a clean tree). `ci:local --clean` does that; a hand-run demo build does not.

The `fixture-builds` walls have been seen to differ between worktrees on the same Mac. Until that is explained, a wall that passes in one checkout and fails in another is treated as an environment bug to fix, not as slack to spend.

### Build warnings

The `build-warnings` job (`pnpm build-warnings:guard`, `scripts/ci/build-warnings.mjs`) builds the docs site and the demo apps and fails on any line a build prints to stderr; `packages/cli/test/starter-build.test.ts` holds every starter's `vp build` to the same rule. Bundler, Vite, Nitro and Node warnings all go to stderr. Rolldown's `[PLUGIN_TIMINGS]` report is the one block it skips: it reports how long plugin callbacks took, not a defect. Each `ALLOWED_WARNINGS` entry names one build and the one-line reason its warning stays. There is no entry today: the docs site's chunk-size warning is gone because the bundler cuts a navigation or deferred pack at Vite's `chunkSizeWarningLimit`, and a constant slice bigger than that loads as its parts. Fix a warning where it starts; do not silence it with `/* @vite-ignore */`, a raised `chunkSizeWarningLimit` or a disabled Rolldown check unless that line can be written.

The same job then reads every JavaScript file and inline script each build wrote for the browser (`scripts/ci/browser-output-scan.mjs`; `.output/public`, or `dist` without `dist/server`) and fails on Node-only code: an import of a Node built-in, a use of `process`, `Buffer`, `global`, `__dirname`, `__filename` or `require` outside a `typeof` check, or Rolldown's stand-in for a `require()` it could not bundle. The starter build test runs the same scan. It is a second check behind the bundler's own `MARKLESS_NODE_IN_BROWSER` build error, so it has no allow list: fix a finding by moving the shared value into a module that imports nothing from Node.

## 7. Workflow changes

Changes to `.github/workflows/*.yml` go through a PR, never straight to `main`. Before opening it:

- `node scripts/ci/check-workflow.mjs .github/workflows/ci.yml` (runs in `typecheck`).
- `pnpm ci:local --list` still exits 0 (a new job needs a local policy entry).
- Every `uses:` action version exists. The screen-reader workflow has never been green because `guidepup/setup-action@v3` does not exist; a PR run of that workflow would have shown it on day one.
- A job that runs tests which launch browsers installs them. The current red `unit` job is this mistake.
- External clones used by CI (`js-framework-benchmark`) are pinned to a commit, so upstream changes cannot turn CI red overnight.

### The Actions cache is a budget

Restoring a cache counts against the repository's cache egress limit. On 2026-10-23 it ran out: restores failed with `Egress is over the account limit`, and pnpm restores in unrelated jobs stalled until the job was cancelled. Most of the traffic was restores, not saves:

| Restore | Size | Jobs per run | Per run |
| --- | --- | --- | --- |
| pnpm store, screen-reader family jobs | about 215 MB | 102 | about 22 GB |
| pnpm store, CI jobs | 219 MB | about 25 | about 5.5 GB |
| Playwright Chromium and WebKit | 394 MB | 14 | about 5.5 GB |
| Playwright system packages | 119 MB | 13 | about 1.5 GB |

What changed, and the rule going forward:

- The screen-reader family jobs install from the npm registry with no pnpm store cache. Their virtual lane reads with the runner's Chrome and downloads no browser.
- Box lanes whose boxes only use witness's browser (router, both music players) restore no Playwright browser or system packages: witness drives the runner image's Google Chrome. `boxes-bundler` (its analyzer measurement), `website-boxes` (the mug studio box), `demo-boxes`, `perf-guards`, `unit` and `browser` launch Playwright's Chromium and keep the restore.
- `prepare-playwright` looks the browser cache up instead of restoring it, and skips the pnpm store cache.
- `cache-cleanup.yml` deletes a pull request's caches when it closes, and a daily sweep deletes caches of closed pull requests and deleted branches and every main tool cache but the newest per key. Dry run against 2026-10-23: 232 of 722 entries, 6.6 of 10.6 GB.
- A new cache step needs a reason it pays for itself: what one restore costs, how many jobs restore it per run, and what it saves over downloading. A cache restored by a large matrix is the first suspect.

### Screen readers

`screen-reader.yml` has three lanes. Pull requests that can change what is heard run only the virtual reader (`virtual`, Linux, about a minute a family). NVDA (Windows) and VoiceOver (macOS) read `main` every night and on dispatch, and the release cut refuses unless the newest nightly run it contains passed (section 8, step 1). On 2026-10-26 the two real readers ran 2,644 jobs on pull requests in one day, about 37,000 Windows and macOS runner-minutes, over 40% of everything the org ran, and every other workflow's jobs queued behind them. To hear a branch with the real readers before it merges, run `gh workflow run screen-reader.yml --ref <branch>`.

### The VoiceOver lane (parked)

`voiceover` in `screen-reader.yml` is advisory (`continue-on-error`). Since #150 it reads 12 or 13 of 29 families green on the `macos-latest` (macOS 26) image, up from 2 to 4. A redesign of the real-reader driver is parked; this records where the rest fail and the options, so the next attempt starts from evidence. The traces are in the logs of runs 39890507893, 39892233837, 39896946755 and 39904970834, which log every phrase.

The rest fail in four ways:

1. **Runner setup.** `guidepup/setup-action` sometimes fails with "Unable to write to the user TCC.db - SIP might not be disabled" or "Failed to enable Do not disturb mode": 1 to 3 families a run, a different set each time. This is the runner image, not the families.
2. **Speech after a focus move is not captured** (menu, modal, drawer, select, menubar). After Enter opens a surface and the family moves focus, `lastSpokenPhrase()` returns `""`: guidepup records only speech that follows one of its own commands, and VoiceOver's focus-following announcement is not one.
3. **Keys go to the page's focus, not VoiceOver's cursor** (buttongroup, colorpicker, crop, rating). The transcript walks the cursor with `next()` and then presses a key; on this runner keyboard focus does not follow VoiceOver's cursor, so the key reaches whatever was focused before.
4. **Containers VoiceOver steps over** (toolbar; tabs, editable and tour time out or miss a phrase for the same kind of reason). VoiceOver treats a toolbar as one item and needs its interact command to enter it.

Options, cheapest first:

- **A. Leave it advisory and stop here.** NVDA and the virtual reader already gate the same transcripts. Cost: the VoiceOver job stays mostly red and stops being read.
- **B. Give `RealDriverSpec` VoiceOver-only hooks and keep the shared transcripts.** `focusCursor` would run "move keyboard focus to VoiceOver cursor" before a key, only after a walk (fixes 3). `speakFocus` would run "move VoiceOver cursor to keyboard focus" with capture, only after a family moved focus itself (fixes 2). `enter` would run `interact()` on a container (fixes 4). A first version of `focusCursor` and `speakFocus` was tried in #150 and reverted: it broke the slider transcript (ArrowRight left the thumb at 50 where 41 was expected), and the cause was not established. Start by reproducing that on one family. Cost: a driver change plus one VoiceOver CI run per family to check it.
- **C. Separate VoiceOver transcripts** for the families whose interaction model differs (menu-like surfaces, toolbar, composite widgets), and keep the shared one elsewhere. Cost: two expectations to maintain per such family.
- **D. Move the lane to a self-hosted Mac** where TCC and Do Not Disturb are set once by hand. This only removes failure 1.

Recommendation: B, then C only for whatever B leaves red, with A as the state until someone owns it.

## 8. Cutting a release

Markless releases **minor versions only**: 0.6.0, 0.7.0, and so on. There are no patch releases. A fix ships in the next minor, so the way to ship a fix sooner is to cut the next minor sooner. No script or workflow accepts a release type; the next version is always the current one with the middle number raised by one.

### One click

Run `gh workflow run release.yml --ref main -f mode=cut` (or in GitHub: **Actions → Release → Run workflow** on `main`, mode `cut`). Nothing else is needed: no version, no confirmation phrase, no local step. The cut lives in `release.yml` itself because npm's trusted publishing checks the filename of the workflow that was dispatched; a separate workflow calling `release.yml` would be checked as itself and refused. The run:

1. Refuses to start unless it was dispatched on `main` and the checkout is clean. It then walks `main`'s first-parent history back from the head, no further than the current release, and picks the newest commit whose push CI run finished green with every check `main`'s ruleset requires coming out of that run. That commit is what gets released, and the log says which one it is and why each newer commit was passed over (still running, replaced by a newer push, or red). It refuses only when no commit since the last release is green. A burst of merges, or a red head, no longer blocks a release.
   Before anything is pushed, `scripts/release/reader-gate.mjs` finds the newest nightly or dispatched `screen-reader.yml` run on `main` whose commit the release contains, and refuses unless it passed and is under 72 hours old. NVDA and VoiceOver read `main` nightly instead of every pull request (see "Screen readers" in section 7), so this is where their verdict blocks. A refusal names the command that starts a fresh run.
2. Bumps the root `package.json` to the next minor with `bumpp`, then `scripts/release/sync-version.mjs` moves every published package to the same version. Packages marked `"private": true` are skipped.
3. Writes the new section at the top of `CHANGELOG.md` with `pnpm release:notes --changelog`: the `feat`, `fix` and `perf` commits since the last tag, grouped by the package their scope names, with internal ids removed and a link to every commit since the last release.
4. Commits `chore(release): vX.Y.0` as `github-actions[bot]` on top of that green commit. The commit runs the normal pre-commit hook (lint and CI's fast jobs), so the release commit passes the same checks as any other commit. Then it creates the tag `vX.Y.0`.
5. Moves `main` to the release commit only after that exact commit is verified. `main` is protected by a repository ruleset named `main` that requires the `test`, `typecheck` and `agent-files` checks from GitHub Actions. The cut pushes the commit to a temporary `release/vX.Y.0` branch (unprotected) and starts ecosystem CI (section 9) on it without waiting. Then `scripts/release/inherit-ci.mjs` diffs the release commit's tree against the green commit's tree. When the only differences are the top-level `"version"` of `package.json` files (each manifest is parsed and compared field by field with `version` removed) and `CHANGELOG.md`, with no file added, deleted or changing mode, and that commit's push CI run is still a green `ci.yml` run on `main` with every required check in it, running `ci.yml` again would test a tree CI already passed. So the cut posts each required check on the release commit as a commit status, `success`, linking that run and naming it in the description (`Inherited from CI run <id> on <commit>: same tree but versions and CHANGELOG`). Otherwise it posts nothing, and the cut runs CI as before: it opens a pull request from the branch into `main`, approves exactly that pull request's waiting `pull_request` CI run (it checks the run's event, commit and branch first), waits for the full `ci.yml` to finish, and `scripts/release/required-checks.mjs` confirms each required check passed on that commit in a `pull_request` run. As with any merge into `main`, only the required checks decide: on 0.9.0 the non-required `package-manager-matrix` job timed out on an npm install in the release pull request's run, which failed the whole cut. Then, if `main` is still the commit the release was cut from, the cut fast-forwards it (`git push origin <sha>:refs/heads/main`). If `main` has moved on, it merges the release pull request with a merge commit, never moving `main` backwards and never using a force push or `--admin`; the ruleset reads the required checks on the release commit, the pull request's head, and does not require the branch to be up to date. If that merge conflicts (a change to a `package.json` or `CHANGELOG.md` landed after the green commit), nothing is released and the next run starts again. Then it pushes the tag `vX.Y.0` and deletes the temporary branch. Before any of this, `required-checks.mjs --names` (also run in `cut-dry-run`) confirms every required check name is a job in `ci.yml`, so a renamed job fails the cut at the start instead of at the end.
6. The `release` job, the same job that has always published, checks out the tag and publishes it: it builds, checks the tarballs, publishes with npm trusted publishing and provenance, and waits up to 20 minutes for npm to show every package with its provenance attestation (npm answers a large upload with "Your package is being processed" and took 13 to 14 minutes to show `@markless/core@0.6.0` and `@markless/compiler@0.7.0`). A rerun does not publish a package npm already took but is still processing: npm answers that with `E409 Cannot publish over previously staged version`, and `publish-workspace.mjs` then waits, up to 20 minutes, for npm to show it. A publish the registry answers with something that says nothing about the package is retried within the run, up to 4 attempts per package, 15, 30 and then 60 seconds apart. That covers `E401` and `E404` on the upload (npm's answers to an OIDC exchange it did not accept), and `E429`, `E502`, `E503` and `E504`. Each npm run trades a new OIDC token, and before each retry the package is looked up in case the failed upload landed anyway. On 0.6.0 one package got `E401 token is invalid` between packages that published with the same trusted publisher. 0.9.0 needed three publish runs: `E503` on `@markless/typescript-plugin`, then `E401` on `@markless/vitest-browser` and `E404` on `@markless/web`. Any other failure, or the fourth failed attempt, stops the run. It is the only job with `id-token: write`; steps 1 to 5 run in the `cut` job, which cannot publish.
7. The `announce` job creates the GitHub Release `vX.Y.0` from the new changelog section and marks it latest. It also runs after a successful manual `publish`, taking the notes from the tag's own `CHANGELOG.md` section (`scripts/release/changelog-section.mjs`), so a release finished by a publish-mode rerun gets its GitHub Release too. It marks that Release latest unless the publish used a dist-tag other than `latest`.

Expect about 20 to 25 minutes on GitHub's runners when the release commit inherits its CI run: about 2 minutes of setup, 8 to 12 for the pre-commit hook in step 4 running CI's fast jobs on one runner (measured on the 0.8.0, 0.9.0 and two failed cuts), seconds for step 5, and 7 to 20 for the build, publish and the wait for npm to show every package in step 6 (0.8.0 took 7). A release commit that cannot inherit adds the full CI run back: 17 to 25 minutes measured on the 0.8.0 and two failed cuts. The commit hook is never skipped.

The manual `dry-run` and `publish` modes still work as before for a version that is already committed, except that a publish now runs only on the commit tagged `v<version>`.

If the run stops after step 5, run it again. The tag then exists without a GitHub Release, so the cut finishes that release (publishing whatever is missing, then creating the Release) instead of cutting the next one; it accepts the release commit when either its own latest CI run is green or the inherited statuses cover every required check. If it stopped after `main` moved but before the tag was pushed, the rerun finds the `chore(release): vX.Y.0` commit on `main`, tags it, and finishes the same way. If it stops before `main` moves, nothing is released: the temporary branch is deleted (which closes the pull request) and the next run starts the same version again.

### Pushes to `main`

CI on `main` runs one run at a time. A running run is never cancelled; while it runs, a newer push waits, and an even newer push replaces the waiting one (GitHub keeps one waiting run per concurrency group). The replacing run tests the whole tree, so no change goes untested: every lane is content-hashed, and the benchmarks compare against the last `main` commit whose CI passed, not against the previous push, so commits whose own run was replaced are still benchmarked. Running every push separately would give each commit its own result, but on 2026-10-22 a code run took about 56 runner-minutes and individual jobs already waited up to 24 minutes for a runner, so six merges in a burst would queue about 340 runner-minutes ahead of pull requests and the next release; the cut no longer needs the head's run, so that cost buys nothing a release needs.

### Rehearsing

Dispatch with `-f mode=cut-dry-run`, or run `pnpm release:cut --dry-run` locally. Both do steps 1 to 4 for real, including the commit and its hooks, in a throwaway copy of the checkout, then run the checks the `release` job runs before publishing (`pnpm build`, the publish-readiness sweep, the tarball checks and `pnpm publish --dry-run` for every package). They do not create the tag, push, publish, or create a GitHub Release. The drafted changelog section is printed (and shown in the run summary on GitHub). Locally, a dry run on a branch other than `main` finishes all the steps and then exits with code 1, listing what the real cut would refuse.

### One-time setup

The `main` ruleset (Settings, Rules, Rulesets, `main`) replaced classic branch protection with the same rules: it targets the default branch, blocks deletion and force pushes, requires the three checks from GitHub Actions without requiring the branch to be up to date, and lets repository admins bypass (classic protection did not enforce admins). `required-checks.mjs` reads the required checks from the ruleset and from any classic protection. No job in `release.yml` reads a secret.

Why the CI run comes from a pull request: the ruleset does not count required checks from a `workflow_dispatch` CI run. The 0.6.0 and 0.7.0 cuts dispatched `ci.yml` on the release branch, all three checks passed on the release commit, and GitHub still refused both the workflow token's push (`GH013 ... 3 of 3 required status checks are expected`) and the pull request merge (`the base branch policy prohibits the merge`); the pull request's check list did not show the dispatched run's checks at all. A test on scratch branches, under a temporary ruleset with the same three required checks, reproduced both refusals, and then, with the checks coming from an approved `pull_request` run instead, the workflow token's merge and its fast-forward push were both accepted. GitHub refuses the GitHub Actions app as a ruleset bypass actor, so nothing bypasses the ruleset.

Why inherited commit statuses count: on 2026-10-22 a workflow on a scratch branch, under a temporary ruleset requiring one context from GitHub Actions (app 15368), checked this with the workflow token ([run 39735539121](https://github.com/compiled-run/markless/actions/runs/39735539121)). A fast-forward push with no status was refused (`GH013 ... Required status check "inherit-probe" is expected`) and accepted once the token posted a `success` status with that context; a pull request merge with a merge commit onto a branch that had moved on was refused, then accepted once the pull request's head had the status. The ruleset and the scratch branches were deleted afterwards.

The cut needs "Allow GitHub Actions to create and approve pull requests" turned on in the `compiled-run` organization's and this repository's Settings, Actions, General, Workflow permissions (both are on). The ruleset requires no reviews, so the approval half of that setting is unused. No job in `release.yml` reads a secret, and no deploy key is used (deploy keys are disabled for the organization).

### Keep `main` releasable

Because a release is one click from whatever `main` is, `main` must always be releasable. Merge each fix as soon as its own checks pass, rather than batching fixes into one large push. A red `main` blocks the release cut as well as other pushes (see section 5).

### Bringing back the held packages

`@markless/ui`, `@markless/icons` and `@markless/ui-tools` are marked `"private": true`, so releases skip them. `@markless/icons` and `@markless/ui-tools` have never been published, and npm only lets a workflow publish a name that already exists. To bring them back (needs the owner's npm login and two-factor device, once):

1. Remove `"private": true` from `packages/headless/icons/package.json`, `packages/headless/tools/package.json` and `packages/headless/components/package.json`. Do this first: `pnpm release:trust --only` refuses a package that is still private. Their `publishConfig` already exists, so `verify-packed-manifests.mjs` has been checking their tarballs on every release.
2. Claim the two new names with a placeholder: a bare `package.json` at version 0.0.1 for each, published by hand (`npm publish --access public` in `/tmp/ml-bootstrap/icons` and `/tmp/ml-bootstrap/ui-tools`).
3. Attach the trusted publisher to all three: `pnpm release:trust --only @markless/icons`, `pnpm release:trust --only @markless/ui-tools`, then `pnpm release:trust --check`.
4. Merge the change from step 1 and cut the next release as usual. The cut moves the three packages to the release version with everything else. Packages publish in folder order, so `@markless/ui` goes out a moment before its two dependencies; if the run stops between them, run the cut again and it publishes the rest.

## 9. Ecosystem CI: the migrated sites

Markless's own suite passing does not show that real apps still work. The chunked page swap in 0.8 broke the page scripts of the shadcn-admin port, and an idle handler started 1.5 MB of JavaScript at load on its `/settings/account`; both were found by the port after the release. [compiled-run/markless-ecosystem-ci](https://github.com/compiled-run/markless-ecosystem-ci) turns the sites ported by markless-migrate into a regression suite, as vite-ecosystem-ci does for Vite: each suite builds one site against Markless packed from a commit, runs its build, and runs `markless-migrate check` on a sample of its routes against a capture of the old site, with no live network. The result is compared with main's last nightly result failure by failure, so a red that main already has (a known red, listed with its owner) is not counted; a new failure, a failed build, a route that could not be checked, or more JavaScript at load (over 2 KB and 5%) is.

**It never blocks anything.** No ruleset requires it, and the release cut does not wait for it. It notifies instead, every time a run on `main` or on a release commit finds a regression:

1. It comments on each merged pull request that landed between the commit main's baseline was recorded on and the commit it checked (found through the commits API), with the failing suites, routes and a link to the run.
2. It opens one issue labelled `ecosystem-ci` that mentions @thejackshelton, or adds a comment to the one already open.
3. It closes that issue, with a comment, on the next clean run on `main`.

- **Every push to `main`:** the per-PR sample runs on the pushed commit; a newer push cancels the run of an older one.
- **On a pull request:** a maintainer comments `/ecosystem-ci run`, or `/ecosystem-ci run shadcn-admin realworld` for some suites. `.github/workflows/ecosystem-ci.yml` builds the pull request's commit, runs each suite in its own job, posts the results table on the pull request and sets an `ecosystem-ci` commit status, which no ruleset requires. Run it on any change that can reach what a site ships: the bundler, the router, the runtime, `web` or the compiler.
- **Dispatch:** `gh workflow run ecosystem-ci.yml -f ref=<commit> [-f pr=<number>] [-f suites='a b'] [-f lane=full]`.
- **Release:** the release cut dispatches it on the release commit right after pushing the release branch and goes on without waiting. The GitHub Release notes link the run and say what it found (or that it was still running); a regression notifies as above.
- **Nightly:** the ecosystem repository runs every route of every site on `main` each night, opens an issue labelled `ecosystem-regression` there on new reds, and stores the night's results as the baseline pull requests compare with.
- **Locally:** `node scripts/ci/ecosystem-ci.mjs run shadcn-admin` fetches the ecosystem repository into `.ecosystem-ci/` and runs one suite against this checkout (`--route /users` for one route).

A sampled run builds Markless once and checks 22 routes of 8 sites in 18 parallel jobs: 20 to 25 minutes to the table, about 150 runner minutes (measured 2026-10-21; per-suite times are in the ecosystem repository's README). htmx-org and the migrate demo are not run until their ports move to Markless 0.8, whose TSRX changes they do not build with.

No secret, GitHub App or personal token is involved. The ecosystem repository is public, so the workflows check it out without a token; the jobs that build pull request code get a read-only token; only the jobs that run no pull request code may comment. The release cut's own token may dispatch a workflow in this repository (GitHub lets a `GITHUB_TOKEN` start `workflow_dispatch` runs), which is how it starts the release run. Comments, the status and the issue are written with the run's own `GITHUB_TOKEN`.

## Should we adopt `async/pipeline`?

[`async/pipeline`](https://github.com/async/pipeline) writes the task graph once in a `pipeline.ts`, runs it locally, and generates a thin GitHub Actions workflow that calls the same graph. That is the right idea: one source for local and CI commands. The recommendation is **not now**:

- **It does not address the main causes.** The history is dominated by commands that were never run before pushing, by red left red, and by Linux-only differences. A shared task graph run on the Mac still runs on macOS with the Mac's browsers and untracked files. The rules above and `ci:local --clean`/`--linux` target those causes directly.
- **The single-source goal is already met without a migration.** `ci:local` derives its commands from `ci.yml` in one 480-line script with no new dependency. Adopting `async/pipeline` means rewriting a 1,261-line workflow, including content-hash lane skipping, sharding, artifact hand-off between box lanes and `receipts`, Playwright caching, and the benchmark baseline worktree. Each of those is a place to introduce a new failure.
- **Maturity.** Created 2026-06-04, 3 stars, last push 2026-07-08, requires Deno 2 alongside Node 24. The repository already uses `@async/witness` from the same organisation, so the maintainers are reachable, which lowers the risk, but a 0.9 tool on the merge gate is still a dependency on its release cadence.

Revisit if the workflow grows another layer of CI-only logic that `ci:local` cannot read from the YAML (for example, job graphs whose commands are computed at run time), or if `async/pipeline` gains a container runner that would replace `--linux`.
