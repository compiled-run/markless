# CI failure history (2026-07-02 to 2026-09-25)

What went red in GitHub Actions over the last twelve weeks, why, and which local check would have caught it first. The process that follows from it is in [ci-process.md](./ci-process.md).

Source: `gh run list` for every workflow (limit 400, which covers the repository's whole Actions history), then `gh run view --json jobs` and `gh run view --log-failed` for all 187 failed runs. Failing tests were pulled from vitest `FAIL`/`×` lines, box `fail` lines, and `##[error]` annotations. Links go to `https://github.com/compiled-run/markless/actions/runs/<id>`.

## Headline numbers

| Measure                                            | Value                                |
| -------------------------------------------------- | ------------------------------------ |
| `CI` runs                                          | 261: 70 green, 169 red, 22 cancelled |
| `CI` on `main` pushes                              | 122 runs, 34 green (28%)             |
| `CI` on pull requests                              | 139 runs, 36 green (26%)             |
| Time `main` was red                                | **1,748 of 2,057 hours (85%)**       |
| `main` pushes that landed on an already-red `main` | **70 of 119** (59%)                  |
| Separate times a green `main` was broken           | 14                                   |
| `main` pushes that did not go through a PR         | 99 of 122                            |
| PR merges that were red after merging              | 14 of 23                             |
| `Screen reader` workflow                           | 12 runs, **0 green**                 |
| `Release` workflow                                 | 22 runs, 6 red                       |

The biggest single fact: `main` was red for three long stretches (2026-07-16 to 08-17, 32 days; 08-20 to 08-31, 10 days; 08-31 to now, 25 days and still open). During a red stretch every push is judged against a failure that is already there, so new breaks hide behind old ones. The later stretches contain several separate regressions stacked on each other.

## Failed runs by category

A run can have more than one cause, so the counts add up to more than 169. "Main" and "PR" count red runs.

| Category                               | Main | PR  | What it means here                                                                                                                                                                                |
| -------------------------------------- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real regression pushed untested        | 104  | 100 | A product or test change that fails on any machine: node lane, browser lane, boxes, JSFB fixture build, typecheck. Most were pushed straight to `main` without running the lane that caught them. |
| Budget or anchor drift                 | 29   | 25  | Byte walls (`fixture-builds` runtime gzip wall, music-player shipped-JS budget, box first-Play bytes) and benchmark-guard size checks going over by 1 to 1,400 bytes.                             |
| Flake, timing, or teardown             | 34   | 36  | Passes on rerun: `expect.poll` races in browser tests, 5 s test timeouts under load, 10 s server-close timeouts, vitest fork timeouts.                                                            |
| Linux-only (OS difference)             | 15   | 17  | Passes on the Mac, fails on the Ubuntu runner: HMR reload race, `yuku-tsrx` native binding, Chromium key handling in `context-gate`.                                                              |
| Workflow bug                           | 22   | 12  | Receipts upload missing hidden `.witness/` files (4 runs where it was the cause); in the rest the receipts upload or `receipts` job went red only because a box lane before it had.               |
| Missing browser install                | 5    | 2   | Tests launching Chromium or WebKit in a job that never installed it; JSFB pointing at `/snap/bin/chromium`.                                                                                       |
| Local tree differs from committed tree | 8    | 0   | Tests passing locally because of an untracked file (`scripts/state-ledger.mjs`) or local tool state (pnpm host `node_modules`).                                                                   |
| External drift                         | 2    | 0   | Unpinned `js-framework-benchmark` clone: `npm ci` resolution errors when upstream moved.                                                                                                          |
| GitHub infrastructure                  | 1    | 0   | 502 downloading `pnpm/action-setup`; the 2026-08-06 Actions outage (cancelled runs).                                                                                                              |

Everything in the first row and most of the rest would have been caught by running the CI job's own command on the pushed commit before pushing. The flake and Linux-only rows are the ones a local run on the Mac does not catch.

## Distinct incidents

"Caught by" names the cheapest local command that fails on the bad commit. `ci:local` refers to `pnpm ci:local` from [ci-process.md](./ci-process.md).

| Incident                                                                                          | Category            | Red runs (main / PR) | First to last         | Time `main` stayed red       | Caught by                                                      | Example                                                                          |
| ------------------------------------------------------------------------------------------------- | ------------------- | -------------------- | --------------------- | ---------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Release bump broke `publish-shape` version tests (`expected '0.1.1' to be '0.1.0'`)               | regression          | 3 / 1                | 07-09 to 07-10        | 61 h                         | `ci:local --fast` (unit)                                       | [29031275804](https://github.com/compiled-run/markless/actions/runs/29031275804) |
| Analyzer receipts upload found no files (hidden `.witness/` dir)                                  | workflow bug        | 4 / 0                | 07-12 to 07-13        | 6.7 h, fixed by `7c61da1f`   | nothing local; a workflow dry run on a PR                      | [29209100514](https://github.com/compiled-run/markless/actions/runs/29209100514) |
| Browser-lane import failures and fixture compile blocks after `chained-async` merges              | regression          | 13 / 6               | 07-27 to 08-06        | part of the 32-day stretch   | `ci:local --full` (browser)                                    | [30234930364](https://github.com/compiled-run/markless/actions/runs/30234930364) |
| `fixture-builds` runtime gzip wall over (`18525 > 18183`)                                         | budget              | 11 / 9               | 07-18 to 08-19        | part of the 32-day stretch   | `ci:local --fast` (unit)                                       | [30308224570](https://github.com/compiled-run/markless/actions/runs/30308224570) |
| music-player shipped-JS and box first-Play byte budgets over by 3 to 1,400 B                      | budget              | 9 / 6                | 07-12 to 08-30        | hours to days                | `ci:local --fast` / `--full` (boxes)                           | [31130380846](https://github.com/compiled-run/markless/actions/runs/31130380846) |
| HMR reload-signal race: null-byte virtual module re-read on Linux                                 | Linux-only          | 5 / 9                | 08-11 to 08-19        | pushed, reverted same day    | `ci:local --linux`                                             | [31531355030](https://github.com/compiled-run/markless/actions/runs/31531355030) |
| `yuku-tsrx` had no loadable Linux x64 binding                                                     | Linux-only          | 0 / 8                | 08-19                 | stayed on the PR             | `ci:local --linux`                                             | [32210787542](https://github.com/compiled-run/markless/actions/runs/32210787542) |
| `context-gate` Shift+F10 rows pass on Linux Chromium where the test expects failure               | Linux-only          | 10 / 0               | 08-30                 | about 5 h                    | `ci:local --linux`                                             | [33326831096](https://github.com/compiled-run/markless/actions/runs/33326831096) |
| vite-plus migration units pushed to `main` one at a time, each red in the `ui` project            | regression          | 8 / 0                | 08-30 to 09-06        | part of the 10-day stretch   | `ci:local --full` (browser)                                    | [33335892658](https://github.com/compiled-run/markless/actions/runs/33335892658) |
| Typecheck: `Cannot find module './scenarios/*.tsrx'`                                              | regression          | 2 / 0                | 08-25 to 08-30        | days                         | `ci:local --fast` (typecheck)                                  | [32794651404](https://github.com/compiled-run/markless/actions/runs/32794651404) |
| Tests call untracked `scripts/state-ledger.mjs`                                                   | tree drift          | 4 / 0                | 09-06                 | 19 days, gone in `1f6d2cd3`  | `ci:local --clean`                                             | [34012046201](https://github.com/compiled-run/markless/actions/runs/34012046201) |
| Site moved `docs/` to `website/`; completion matrix still requires `docs/tsconfig.json`           | regression          | 4 / 0                | 09-06                 | 19 days, gone in `1f6d2cd3`  | `ci:local --full` (completion-matrix)                          | [34012046201](https://github.com/compiled-run/markless/actions/runs/34012046201) |
| package-manager matrix: pnpm reinstalls the host workspace                                        | tree drift          | 4 / 0                | 09-06                 | 19 days, gone in `1f6d2cd3`  | `ci:local --full` in a clean worktree                          | [34058318621](https://github.com/compiled-run/markless/actions/runs/34058318621) |
| `select` multi-embed click times out (`locator.click: Timeout 14846ms`)                           | regression left red | 4 / 0                | 09-06 to 09-25        | still open                   | `ci:local --full` (browser)                                    | [36163421630](https://github.com/compiled-run/markless/actions/runs/36163421630) |
| Unit lane now launches Chromium and WebKit but the `unit` job installs no browsers (110 failures) | missing browser     | 1 / 0                | 09-25                 | open, owned by T194          | `ci:local --clean` on a machine without browsers; `--linux`    | [36163421630](https://github.com/compiled-run/markless/actions/runs/36163421630) |
| JSFB fixture build fails (`markless is not a function`, alias catch-all)                          | regression          | 10 / 25              | 07-02 to 08-21        | hours; fixed by `b52de79f`   | none: benchmark job is CI-only                                 | [28557271316](https://github.com/compiled-run/markless/actions/runs/28557271316) |
| music-player-ssr box: first Play cold-fetches a framework chunk                                   | regression          | 1 / 0                | 09-25                 | open                         | `ci:local --full` (boxes-music-player-ssr)                     | [36163421630](https://github.com/compiled-run/markless/actions/runs/36163421630) |
| JSFB `npm ci` fails against moving upstream (`ERESOLVE`, `EUSAGE`)                                | external drift      | 2 / 6                | 07-27, 09-06 to 09-25 | still open                   | none; pin the clone                                            | [30234930364](https://github.com/compiled-run/markless/actions/runs/30234930364) |
| JSFB runner cannot find Chrome (`/snap/bin/chromium`, WS endpoint timeout)                        | missing browser     | 2 / 1                | 07-10 to 08-06        | minutes, fixed by `8dc952f0` | none                                                           | [29294838113](https://github.com/compiled-run/markless/actions/runs/29294838113) |
| Screen-reader `nvda`/`voiceover` jobs: `guidepup/setup-action@v3` does not exist                  | workflow bug        | 12 / 0               | 08-25 to now          | never green                  | `--list` of the workflow plus an action-version check          | [32794651411](https://github.com/compiled-run/markless/actions/runs/32794651411) |
| Release: first publish of a new package 404s; retry after partial publish hits `TLOG 409`         | workflow/config     | 6 (release)          | 07-27 to 08-18        | per release                  | `pnpm release:check` + trusted-publisher setup per new package | [32095312084](https://github.com/compiled-run/markless/actions/runs/32095312084) |

## Recurring flakes

Tests that failed and then passed on a later run of equivalent code.

| Test                                                                                 | Red runs | Last seen | Mechanism                                          |
| ------------------------------------------------------------------------------------ | -------- | --------- | -------------------------------------------------- |
| `browser/capture-slot-binding.test.ts` "an imported child awaits its async callback" | 18       | 08-20     | `expect.poll` window too short under parallel load |
| `packages/typescript-plugin/test/language.test.ts` (5 s timeout)                     | 12       | 08-20     | cold TypeScript language service on a busy runner  |
| `browser/chained-async-broadcast-diamond.test.ts`                                    | 9        | 08-19     | timing-dependent settle order                      |
| Box and SSR server teardown `close timed out after 10000ms`                          | 8        | 09-06     | open connections kept alive at close               |
| `browser/arm-branch-flip.test.ts` ("west crews")                                     | 6        | 08-06     | real escalation gap, then flaky after partial fix  |
| completion-matrix `Timeout terminating forks worker`                                 | 5        | 08-20     | fork pool teardown under load                      |
| `benchmark-guard` timing rows (`07_create10k` etc.)                                  | several  | 09-06     | two-speed timing on runners, see note below        |

The benchmark guard failed 30 times. Most of those were size rows (real byte growth). The timing rows are the known two-speed runner behaviour: `07_create10k` lands at about 860 to 1,000 ms or about 1,390 to 1,430 ms on identical code.

## Fixed ports

These tests and scripts listen on a hard-coded port, so two runs on one machine, or a leftover server, collide:

- `packages/bundler/test/native-packing-fixtures.test.ts` (4346 to 4348), `packages/bundler/test/arm-flip-same-task.test.ts` (4218)
- router boxes on `127.0.0.1:3000`, music-player boxes on `127.0.0.1:4173`
- `scripts/benchmarks/perf-guards` (4221 to 4224, overridable with `MARKLESS_PERF_GUARD_PORTS`)
- `scripts/experiments/*` servers (4391, 4488, 4496) with `strictPort`

None of the red CI runs above was a port collision (each CI job has its own machine). They matter for local runs and for agents running several suites at once.

## The current red (`1f6d2cd3`, 2026-09-25)

Four separate causes on one push: the `unit` job's missing browsers (110 failures), the `select` multi-embed timeout left red since 09-06, the music-player-ssr first-Play cold fetch, and the JSFB `npm ci` failure. The `receipts` and `test` jobs are red only as a consequence. Locally on the Mac, `pnpm ci:local --fast` passes this commit in 64 s and `--job completion-matrix` in 6 s, which is exactly the gap described below: the Mac has browsers the runner's `unit` job does not.

## What local `pnpm test` misses

`pnpm test` is not the CI command set. It runs `perf:guard` and `bench:jsfb:guard`, which CI does not run, and it does not run the `ui` project, the package-manager matrix, the receipts pair, the agent-files check, or `vp check --no-fmt`. A green `pnpm test` therefore did not predict a green CI, which is why `ci:local` reads the commands out of `ci.yml` instead.
