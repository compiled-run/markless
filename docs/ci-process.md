# Keeping CI green

How to stop pushing red to `main` without weakening any check. The evidence behind each rule is in [ci-failure-history.md](./ci-failure-history.md): over twelve weeks `main` was red 85% of the time, and 59% of pushes to `main` landed on a `main` that was already red.

Three causes account for almost all of it:

1. **The CI command was never run before the push.** Most red runs are ordinary test, typecheck, box, or byte-budget failures that fail the same way on a Mac. 99 of 122 pushes to `main` skipped a PR, so CI saw them first.
2. **Red was left red.** Once `main` is red, the next push cannot tell whether it broke something, so breaks pile up (the 32-day and 25-day stretches each hold several separate regressions).
3. **A local run is not a CI run.** `pnpm test` runs a different command set from `ci.yml`; the Mac has browsers, tools, and untracked files the runner does not; some failures only happen on Linux.

The process below answers each one.

## 1. `pnpm ci:local`: run exactly what CI runs

`scripts/ci/local.mjs` reads `.github/workflows/ci.yml` at run time and runs each job's `run:` steps. Nothing is copied from the YAML by hand, so a step added to the workflow is picked up automatically. The only thing the script owns is a small table saying, for each job with checks, whether it belongs to the fast set, the full set, or runs only in CI. A new job without an entry makes the script exit with an error that names it, so the table cannot fall behind silently.

```sh
pnpm ci:local --list      # every job and step in ci.yml, and what runs locally
pnpm ci:local             # fast mode (same as --fast)
pnpm ci:local --full      # every job this machine can run
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
| `--fast`  | `agent-files` (2 s), `typecheck` (workflow check, `pnpm typecheck`, `vp check --no-fmt`: 9 s), `unit` (`vp test --project node`: 52 s)             | **64 s**                                                                                                                                                                      |
| `--full`  | fast, plus `browser` (browser + `ui` projects), `completion-matrix` (measured alone: 6 s), the four box jobs, `receipts`, `package-manager-matrix` | not timed end to end in this task: the box jobs bind fixed ports that another worker on this machine was using; expect roughly the sum of the CI lane times, 20 to 40 minutes |
| `--clean` | any mode, in a fresh worktree of `HEAD`                                                                                                            | adds about 5 s (worktree + offline `pnpm install`)                                                                                                                            |

`--fast` on `1f6d2cd3` passed locally, while the same commit's `unit` job failed on CI with 110 failures. The failures were `browserType.launch: Executable doesn't exist`: node-project tests launch Chromium and WebKit, and the `unit` job installs no browsers. The Mac has both browsers cached, so a plain local run cannot see this. `--linux` can, because each job gets its own container with only the setup steps that job declares.

### Jobs that do not run locally

| Job                                                                   | Why                                                                                                                                                         | What to do instead                                                                                                                                    |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `benchmark`, `benchmark-guard`                                        | Clones `js-framework-benchmark`, builds a baseline worktree, and runs 30 minutes of interleaved Chrome pairs; the guard only compares that job's artifacts. | When a diff can reach the benchmark bundles, open a PR and let CI run it. Rerun a timing-only red once before treating it as real (see flake policy). |
| `lanes`, `prepare-playwright`, `save-lane-markers`, `test`, `changes` | Content-hash lane skipping and the gate. No checks of their own.                                                                                            | Nothing: locally every lane runs.                                                                                                                     |
| screen-reader `nvda`                                                  | Needs Windows with NVDA.                                                                                                                                    | CI only.                                                                                                                                              |
| screen-reader `voiceover`                                             | Needs a macOS runner with VoiceOver automation granted.                                                                                                     | `pnpm test:sr-real` by hand on a prepared Mac.                                                                                                        |

`package-manager-matrix` runs when `bun`, `deno` and `corepack` are on `PATH` (they are on this Mac) and is skipped with a message otherwise. Browser jobs are skipped with a message when Playwright's Chromium is not installed; `--install` fixes that.

Side effect to know about: the `agent-files` job runs `pnpm dlx @intellectronica/ruler apply`, which rewrites generated agent files and currently also creates an untracked `.agents/` directory. That is what CI does on its throwaway checkout; locally, delete `.agents/` afterwards or run with `--clean`.

## 2. Linux parity

Some failures only happen on the Ubuntu runner: the HMR reload race (null-byte module re-read), the `yuku-tsrx` Linux binding, Chromium's Shift+F10 handling in `context-gate`, and every "job forgot to install a browser" failure.

**Feasibility on this Mac, measured:** `docker`, `act`, `colima`, `podman` and OrbStack are not installed (`command -v` finds none, no app in `/Applications`, nothing in `brew list`). So Linux parity cannot run here today. `pnpm ci:local --linux` exits with code 2 and says so. The code path is written but has not been run.

What `--linux` does once a container runtime exists:

1. `git archive HEAD` streams the committed tree (not the working copy) into a `node:24-bookworm` container (`--platform linux/amd64`, the runner's architecture).
2. One container per job. Inside: `git init` so `agent-files` can diff, pnpm 10.33.2 via corepack, `pnpm install --frozen-lockfile`, then `local.mjs --install --job <id>`, which runs **only that job's own setup steps** before its checks. As root on Linux, `playwright install-deps` runs too.

To enable it (owner decision, it installs software): `brew install colima docker && colima start --cpu 6 --memory 12 --arch x86_64`. x86 emulation on Apple Silicon is slow; `--arch aarch64` is faster but no longer matches the runner's CPU, which matters for native bindings like `yuku-tsrx`.

Why not `act`: it replays the whole workflow including `actions/cache`, artifacts, and the lane gate, needs a 12 to 20 GB runner image to match `ubuntu-latest`, and still emulates x86 on this Mac. `--linux` runs the same commands with only the container part added. `act` stays useful for debugging the workflow file itself (a new `if:`, a new artifact path); `act -n` (dry run) is cheap for that.

When to use it: before pushing anything that touches the HMR/dev server, native dependencies, keyboard or focus handling in browser tests, or the workflow's install steps. Otherwise, a PR run is the Linux check.

## 3. Before pushing to `main` (agents and PM)

A push to `main` needs all of these, run on the exact commit being pushed:

1. `pnpm ci:local --fast --clean` is green. `--clean` makes it the committed tree, so an untracked helper file or a leftover build cannot make it pass. This is 70 seconds.
2. `pnpm ci:local --full` is green for every job whose inputs the change touches, and always when the change touches `packages/bundler`, `packages/router`, `packages/web`, `packages/runtime`, the demos, or anything a box reads. When in doubt, run `--full`.
3. If the change is Linux-sensitive (list above) and `--linux` is not available, push to a branch and open a PR. Wait for its CI instead of pushing to `main` directly.
4. The receipt says which `ci:local` mode ran, on which commit, and the result line it printed. "Green on N runs" in prose is not a receipt.

Multi-commit series (for example a migration done unit by unit) go on a branch with a PR. `main` gets the series after the PR is green, not one red commit at a time. The vite-plus migration put 21 consecutive red commits on `main` this way.

A release commit runs `pnpm release:check` and `--fast`; a new package additionally needs its npm trusted-publisher entry before the first publish (two release runs failed with `E404` on a package's first publish).

## 4. Flake policy

A flake is a test that fails and passes on the same code. Rules:

- **No silent retries.** Do not add `retry:` to vitest projects, `--retries` to Playwright, or rerun loops in the workflow. A rerun of a red CI run is allowed once, by a person, with a note in the PR or ledger saying which test and why it is believed to be noise.
- **Quarantine is explicit and expires.** A flaky test may be moved to a quarantine list (for example `test.skip` behind a `QUARANTINED` marker naming the owner and an expiry date, at most two weeks out) in the same commit that files the fix task. An expired entry fails CI, so quarantine cannot become permanent. The quarantine list is small and visible, never a pattern in a config.
- **Fix the mechanism, not the timeout.** Raising a timeout is acceptable only with a measured reason (the test's real work takes longer on the runner). The recurring flakes all have concrete mechanisms:
    - `expect.poll` windows too short under load (`capture-slot-binding`, `broadcast-diamond`): wait on the event the test is about (a settle promise, a DOM mutation) instead of a fixed poll window.
    - 5-second timeouts on a cold TypeScript language service (`language.test.ts`, `create.test.ts`): warm the service once in `beforeAll`, or give the known-slow test its own measured timeout.
    - Server `close timed out after 10000ms` in boxes: close idle keep-alive connections before `close()`.
    - Fixed ports: bundler tests on 4218 and 4346 to 4348, router boxes on 3000, music-player boxes on 4173, perf guards on 4221 to 4224. Listen on port `0` and read the assigned port back, as the other tests already do. Where a fixed port is unavoidable, make it overridable (as `MARKLESS_PERF_GUARD_PORTS` does) and fail fast with "port in use" rather than timing out.
- **Timing benchmarks are not correctness checks.** `benchmark-guard` timing rows are known to be two-speed on runners (`07_create10k`). A timing-only red on a diff that cannot reach the benchmark bundles gets one rerun, recorded; size rows are deterministic and are never rerun away.

## 5. Keeping `main` green

- **A red `main` blocks every push except the fix.** When `main` goes red, the next push to `main` must be the fix or a revert of the breaking commit. Everything else waits on a branch. This is the rule that would have prevented the 70 pushes onto an already-red `main`.
- **Revert first when the fix is not quick.** If the cause is not fixed within a working session (a few hours), revert the breaking commit and fix forward on a branch, as was done for the HMR barrier change (`a26de5e5` reverted by `dc6e20f1`).
- **Whoever pushed the break owns the fix.** For agent work, the PM assigns the fix task before dispatching anything else that pushes.
- **A pre-existing red is a task, not background.** If a check is red on `main` when a goal starts, the first task is to fix it or quarantine it under the flake policy. Do not work around it and do not describe new failures as "the same red".
- **Branch protection (owner action).** `main` has no branch protection today. Requiring the `test` gate, `typecheck`, and `agent-files` status checks would turn this rule from a habit into a mechanism. `package-manager-matrix` and `benchmark-guard` are already designed to block as separate checks once required.

## 6. Budgets and anchors

Byte walls and budgets failed 54 runs, usually by a few bytes to a few hundred. The existing performance-guard model is the rule for all of them:

- Changing a budget or anchor requires a one-line reason in the same commit (`pnpm perf:guard:accept <guard> "<subject>" --reason "<one line>"` for the perf guards; the same shape for `fixture-builds` walls, the music-player budgets, and box byte walls).
- Re-anchoring is a decision, not a fix: the reason says what the extra bytes buy, or which win the lower anchor records.
- A big win re-anchors in the same change set, so the anchor stays close to reality.
- Byte walls must be measured the way CI measures them (`NODE_ENV=test` from vitest, a clean tree). `ci:local --clean` does that; a hand-run demo build does not.

The `fixture-builds` walls have been seen to differ between worktrees on the same Mac. Until that is explained, a wall that passes in one checkout and fails in another is treated as an environment bug to fix, not as slack to spend.

## 7. Workflow changes

Changes to `.github/workflows/*.yml` go through a PR, never straight to `main`. Before opening it:

- `node scripts/ci/check-workflow.mjs .github/workflows/ci.yml` (runs in `typecheck`).
- `pnpm ci:local --list` still exits 0 (a new job needs a local policy entry).
- Every `uses:` action version exists. The screen-reader workflow has never been green because `guidepup/setup-action@v3` does not exist; a PR run of that workflow would have shown it on day one.
- A job that runs tests which launch browsers installs them. The current red `unit` job is this mistake.
- External clones used by CI (`js-framework-benchmark`) are pinned to a commit, so upstream changes cannot turn CI red overnight.

## Should we adopt `async/pipeline`?

[`async/pipeline`](https://github.com/async/pipeline) writes the task graph once in a `pipeline.ts`, runs it locally, and generates a thin GitHub Actions workflow that calls the same graph. That is the right idea: one source for local and CI commands. The recommendation is **not now**:

- **It does not address the main causes.** The history is dominated by commands that were never run before pushing, by red left red, and by Linux-only differences. A shared task graph run on the Mac still runs on macOS with the Mac's browsers and untracked files. The rules above and `ci:local --clean`/`--linux` target those causes directly.
- **The single-source goal is already met without a migration.** `ci:local` derives its commands from `ci.yml` in one 480-line script with no new dependency. Adopting `async/pipeline` means rewriting a 1,261-line workflow, including content-hash lane skipping, sharding, artifact hand-off between box lanes and `receipts`, Playwright caching, and the benchmark baseline worktree. Each of those is a place to introduce a new failure.
- **Maturity.** Created 2026-06-04, 3 stars, last push 2026-07-08, requires Deno 2 alongside Node 24. The repository already uses `@async/witness` from the same organisation, so the maintainers are reachable, which lowers the risk, but a 0.9 tool on the merge gate is still a dependency on its release cadence.

Revisit if the workflow grows another layer of CI-only logic that `ci:local` cannot read from the YAML (for example, job graphs whose commands are computed at run time), or if `async/pipeline` gains a container runner that would replace `--linux`.
