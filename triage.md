# PR #31 CodeRabbit triage

Eight comments, no skips: seven fixed in this branch, one answered with evidence and a named
repository setting. Verified with `node scripts/ci/check-workflow.mjs`, 17 mutation cases,
`pnpm exec vp lint --deny-warnings` and `pnpm exec tsc --noEmit -p tsconfig.json`.

| id | path | verdict | reason |
| --- | --- | --- | --- |
| 3817073530 | .github/workflows/ci.yml:333 | answered | The serial `test` job never ran the benchmark guard either, so this predates the PR; `benchmark-guard` blocks as its own required check, and folding a 30-minute bimodal benchmark into the gate would make every non-docs merge wait on it. |
| 3817073534 | .github/workflows/ci.yml:307 | fixed | Added top-level `permissions: contents: read` and `persist-credentials: false` on all 16 checkouts, with a checker invariant so a future checkout cannot quietly keep the token. |
| 3817073548 | scripts/ci/check-workflow.mjs:13 | fixed | The `typecheck` job now runs the checker, and the checker fails if the workflow ever stops running it. Per owner directive it now parses with the `yaml` package instead of shelling out to python3, with no regex fallback. |
| 3817073551 | scripts/ci/check-workflow.mjs:116 | fixed | The fallback scanner that mangled block-sequence `needs:` is gone; a block-sequence gate is now a passing mutation case against the real parser. |
| 3817073554 | scripts/ci/check-workflow.mjs:194 | fixed | The `continue-on-error` ban drops comment lines first and matches the key with a truthy value, so the rule can document itself and `continue-on-error: false` no longer fails. |
| 3817073560 | scripts/ci/check-workflow.mjs:211 | fixed | There is one parse mode now, and the gate check reads the parsed job-level `if:`, so `${{ always() }}` and bare `always()` both pass. |
| 3817148799 | .github/workflows/ci.yml:144 | fixed | Correct, and the hole was wider: package manifests and package tsconfigs went into the shared base key, and the unit key gained fixtures, CLI templates, `demos/**`, this workflow file and `scripts/ci/**`. |
| 3817148808 | scripts/ci/check-workflow.mjs:158 | fixed | Job-level `if:` is read as a parsed value rather than job text, and cache steps are checked for `fail-on-cache-miss: true` and `lookup-only: true` as values, not as text that appears somewhere. |

## 3817073530 — benchmark guard in the `test` gate (answered)

The premise is the root `test` npm script, which chains `pnpm bench:jsfb:guard`. The CI job named
`test` never ran that script. On `origin/main` the serial `test` job's steps are the completion
matrix, `vp test`, `receipts:generate`, the four box suites and `receipts:check` — no benchmark
step. `benchmark-guard` has been a separate job with `needs: [changes, benchmark]` since before this
PR, and this PR did not touch it. So there is nothing here that the sharding or the content-hash
lanes weakened.

Two reasons not to fold it in:

- It is 30 minutes of benchmarking on top of a gate whose whole purpose in this PR is to stop making
  every merge wait. `package-manager-matrix` sits outside the gate for the same reason and is
  blocking on its own.
- The guard is known to be bimodal on hosted runners (`07_create10k`), so gate membership would
  convert runner noise into a merge block.

Deferred to repository settings, not workflow text: branch protection on `main` must list
`test`, `package-manager-matrix`, `benchmark-guard` and `agent-files` as required status checks. If
it lists only `test`, the guard is advisory in practice and that is the thing to fix — in settings.
The rationale is now recorded next to `NON_TEST_JOBS` in the checker so the exclusion is a stated
decision rather than an oversight.

## 3817148799 — lane hash inputs (fixed, and wider than reported)

The finding is right that the unit key omits package manifests. Checking what the node project
actually reads turned up more inputs that the key could not see. Each one is a path where editing a
file changes what the lane would assert, the key does not move, the lane skips, and the gate reads
`skipped` as success:

- `packages/*/package.json` and `packages/*/*/package.json` — exports maps and local wiring. The
  lockfile pins versions but never sees a changed `exports` field. These went into the **base** key,
  because every lane imports through them, not just unit.
- `packages/*/tsconfig*.json` — also base, same reason.
- `packages/*/fixtures/**` — `packages/bundler/test/fixture-builds.test.ts`,
  `packages/router/test/analyzer-gate.test.ts` and `packages/vitest-browser/test/ssr-plugin.test.ts`
  build these.
- `packages/cli/templates/**` — `packages/cli/test/create.test.ts` scaffolds from them.
- `demos/**` — `packages/bundler/test/music-player-ssr-budget.test.ts`,
  `packages/bundler/test/music-player-prerender-boot.test.ts` and
  `packages/web/test/ssr-data/demo-shadow.test.ts` read demo sources directly.
- `.github/workflows/ci.yml` and `scripts/ci/**` — `scripts/benchmarks/ci-workflow.test.ts` runs in
  the node project and asserts on this workflow file. Excluding CI files from the base key is still
  right for the other lanes, but the unit lane has a test that reads them, so it hashes them.

The cost is cache hits: a demo edit or a CI edit now re-runs the three unit shards. That is the
trade the packet asks for — a lane that can skip while its inputs changed is a stale green.

Not changed, and why: the browser key already covers its project (`packages/vitest-browser/browser`
and `packages/headless/components/test` are inside `packages/vitest-browser/**` and
`packages/headless/**`), and the only `demos/` string under those trees is a comment. The
completion-matrix, box and receipts keys each cover their own package or demo tree, and all of them
now inherit the manifests through the base key.

## Cache scope (asked in passing, no finding attached)

No ref qualifier is needed in the lane keys. GitHub scopes every cache entry to the branch that
created it: a run can read entries from its own ref, from the base branch of its pull request and
from the default branch, and a pull request cannot write into `main`'s scope. So a pull request can
reuse a green marker that `main` produced, which is the intended hit, but no pull request can plant
a marker that a later `main` run would accept.

## Checker changes

Parsing (owner directive): the python3 subprocess and the line-scan fallback are both gone. The
checker resolves `yaml` from the repo root, then from `packages/cli`, which is where pnpm's isolated
layout puts it, and exits with "run `pnpm install`" if neither base resolves rather than degrading to
pattern matching. The CI step therefore runs after the install.

New invariants: top-level `permissions:` present; every `actions/checkout` sets
`persist-credentials: false`; every lane key layers on `ci-base-key.txt`; the workflow runs this
checker.

Tightened: gate `if:` and lane `if:` are read as job-level values, cache restore steps are checked by
value, and the `continue-on-error` ban ignores comments.

Mutation cases run against the real workflow, all behaving: wrapped `always()` passes, block-sequence
`needs:` passes, `continue-on-error` in a comment and `: false` pass, and each of `continue-on-error:
true`, a dropped `fail-on-cache-miss`, `fail-on-cache-miss: false`, `lookup-only: false`, a removed
`permissions:` block, a checkout without `persist-credentials: false`, a removed checker step, a lane
key without the base hash, a lane dropped from the gate, a lane `if:` moved off the job, a gate
without `always()`, and broken YAML all fail.
