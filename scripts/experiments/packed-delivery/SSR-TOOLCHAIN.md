# Production SSR compiler repair

The generated scalar-interaction application previously built successfully but returned HTTP 500 from Nitro: `Export 'ssr_exports' is not defined in module`. Its intermediate Vite SSR entry worked. A plugin-free rebundle of that same entry fails with Vite Plus 0.3.0's bundled Rolldown 1.2.5 and loads successfully with 1.2.7. The workspace's separately installed Rolldown 1.2.7 did not control Vite Plus's build engine.

[Rolldown's upstream fix](https://github.com/rolldown/rolldown/pull/10743) records the missing facade-to-host dependency that can emit an undeclared namespace export. [Vite Plus 0.3.1](https://github.com/voidzero-dev/vite-plus/releases/tag/v0.3.1) includes Rolldown 1.2.7 while retaining Vite 8.2.2. The retained `ssr-rebundle-probe.mjs` reproduces the old failure and verifies the fixed engine without Markless or Vite plugins.

The workspace now uses Vite Plus 0.3.1, its required bundled Vite alias, and a shared Vitest version. The workspace override avoids separate Vite runtime/type copies. Fixture scripts use `vp` because the aliased package does not provide the standalone `vite` binary. CLI templates carry the alias for apps created outside this workspace. The native packing Vite adapter explicitly marks its shared Rolldown hooks as Vite plugins; no handler-delivery behavior changed in that adapter.

The normal Nitro-hosted scalar probe now passes five routes and 15 trusted Chrome clicks: differently shaped bubbling parents, a stopped child, a complex ancestor, and a stopped complex child. Each route requests five scripts, with no page errors or HTTP cache hits. The direct-SSR test-host workaround is unnecessary for these results.

## Docs verification

The real docs doctor and production build, 64 docs tests, docs typecheck and root `pnpm run typecheck` pass. The shared framework/CLI run has 1,014 passing tests, 20 skipped tests and one existing inline-size failure. The initial sandboxed browser-test attempt failed to open local ports; the unsandboxed run resolved those infrastructure failures.

Eighteen fresh Chrome coverage visits pass 57 control actions plus three unrelated header presses. Framework pack execution before input and on the unrelated header remains zero. Initializer counts are unchanged: counter 15, independent second scalar control three additional, computed total 56, mode selector 72 and accordion 117. Counter repeats initialize zero new modules. These counts do not prove the complex controls execute their minimum possible code. Coverage source-range bytes, including large export declarations, are not CPU timing.

Six docs scenarios pass: unrelated header followed by menu use; scalar-to-full-runtime state handoff; keyboard and queued scalar clicks; navigation/history/offline controls; delayed packs retaining input; and observable pack failure.

The local preview now serves immutable `/private/tmp/markless-docs-toolchain-ht3oM4/.output`, session 46304. Fresh isolated Chrome page 15 at http://localhost:3000/markless/concepts/state received five framework and three site scripts, each HTTP 200. Two direct trusted counter clicks produced count 2 without starting the full runtime. No error/warning console messages or service worker controller were present. Existing tabs referencing the old `chunk-DOTqkIfD.js` need a reload after a build replacement.

## Cold timing comparison

Forty visits / 120 clicks: ten fresh contexts per build and condition, previous build followed by candidate. HTTP cache disabled, service workers blocked, real Nitro SSR with HTML/JS streamed through Brotli quality 5 over local HTTP/1.1. Constrained visits use 150 ms latency, 5 Mbps download and 4× CPU slowdown. Chrome 153.0.8010.53 on the developer laptop. No owned builds, tests or profilers overlapped timing; other applications remained open. Timing ends at the expected DOM mutation, not compositor paint.

| Condition | First click, previous → candidate | Second | Third |
| --- | ---: | ---: | ---: |
| Normal | 32.60 → 32.35 ms | 15.15 → 14.60 ms | 15.10 → 15.10 ms |
| Constrained | 74.75 → 73.75 ms | 10.05 → 10.70 ms | 10.85 → 11.10 ms |

No difference clears the predeclared threshold: max(10 ms, 10% previous median, twice the larger MAD). Five framework requests and zero HTTP cache hits per visit; no failed actions or page errors. Encoded framework transfer is 235,009 → 235,035 bytes, including response overhead. Nine of ten constrained first clicks in each build still encounter a pending script. This correctness repair does not establish an interaction speedup or eliminate the early network race.

## Open gates

Limits were not raised. Current music-player stages exceed these gzip budgets: CSR download 140,900 > 140,187; CSR startup 14,930 > 14,696; SSR download 84,822 > 84,771; SSR navigation 25,711 > 25,502. SSR startup now passes at 4,319 ≤ 4,327. The largest runtime chunk in the CSR and Vite Plus fixtures is 5,714 bytes against limits of 5,403 and 5,435. The application-budget negative tests also fail because the measured input already exceeds another stage.

The event-only inline resumer is 1,117 gzip bytes against its 1,090-byte ceiling. A controlled comparison of its current source through both old and new engines produces exactly 1,117 bytes; this is not an upgrade regression. The preceding propagation handoff added bytes that its earlier shared-suite receipt did not catch.

The root package build also fails in router declaration generation with 19 missing-export errors. Running the previous Vite Plus pack implementation against the current router source reproduces those errors. This gate remains unresolved; passing the consuming docs build is not a passing package release build.

The overall goal remains active. Byte budgets, the declaration build, complex-control minimum execution and exact execution accounting still need work. No new commit, push or goal closure occurred. [SSR-TOOLCHAIN.json](./SSR-TOOLCHAIN.json) records measurements and raw paths; copies live under ignored `results/ssr-toolchain-2026-09-22/`.
