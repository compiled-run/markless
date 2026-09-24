# Route module reuse

Workflow guidance: .ruler/skills/markless-implementation/implementation.md, .ruler/skills/markless-implementation/bundler.md, .ruler/skills/markless-implementation/performance.md

The retained change removes redundant dynamic imports at the router entry and generated MDX fallback. It materially improves repeat clicks on the actual docs without increasing startup module execution. First-click differences did not exceed the predefined noise threshold. Native modulepreload, five-request delivery, and lazy initialization are preserved. This changes import reuse, not semantic pack placement, and does not eliminate cold-network waits.

## Results, September 22

Chrome 153.0.8010.53. Medians in milliseconds, trusted click to expected DOM mutation. Ten independent visits per build/control/CPU condition; first click and two repeats:

| CPU | Control | First, before → after | Second, before → after | Third, before → after |
|---|---|---:|---:|---:|
| Normal | Sidebar | 39.95 → 34.05 | 14.40 → 0.70 | 13.60 → 0.60 |
| Normal | Counter | 29.80 → 29.65 | 13.00 → 0.20 | 13.30 → 0.15 |
| Normal | Accordion | 27.50 → 27.15 | 9.15 → 2.50 | 17.15 → 2.45 |
| 4× slowdown | Sidebar | 90.00 → 84.05 | 12.10 → 2.90 | 15.75 → 3.00 |
| 4× slowdown | Counter | 45.35 → 42.60 | 8.25 → 1.05 | 10.70 → 0.95 |
| 4× slowdown | Accordion | 112.75 → 110.60 | 18.85 → 11.40 | 27.00 → 11.00 |

Both normal sidebar/counter repeats and the third accordion click exceed the noise threshold. Under 4× CPU, the third sidebar and accordion clicks exceed it. Other positive deltas stay below the conservative 10 ms floor and are not claimed as established improvements.

Earliest painted/hittable input, five visits per build/control/condition:

| Condition | Control | First click, before → after |
|---|---|---:|
| Normal | Sidebar | 42.90 → 43.10 |
| Normal | Counter | 34.00 → 34.30 |
| Constrained network + CPU | Sidebar | 235.60 → 220.80 |
| Constrained network + CPU | Counter | 172.60 → 176.00 |

None of these first-click changes exceeds the noise threshold. Seventeen visits had a framework download pending at first input. These local compressed HTTP/1.1 results are a controlled comparison between these builds, not a comparison with the deployed Qwik site and not a guarantee of instant input.

Across 160 measured visits, 680 clicks passed, including ten-click counter bursts. No page errors or failed requests; five framework requests per visit, no new settled-click JS fetches. Brotli JS totals: state/sidebar 234,310 → 234,412 bytes; accordion 233,602 → 233,706 bytes. Growth is 102–104 bytes per route, below the 512-byte limit.

Separate precise-coverage visits confirm zero framework execution before input in both builds. The counter, independent watched-variable control, return to counter, and repeat watched control initialize 13, 3, 0, and 0 module bodies respectively in both builds. Accordion initializes 117 on first interaction and zero on either repeat in both builds. Coverage counts are not CPU time or proof of universally minimal execution.

## Verification and remaining scope

Root `pnpm run typecheck`, docs typecheck, 205 router tests, 64 docs tests, touched-file lint, and both actual docs production builds pass. The docs runner still reports its existing shutdown warning after its passing tests. Six browser scenarios pass: independent control handoff, closed-menu input, keyboard and queued clicks, navigation/history/offline controls, delayed pack delivery, and observable failed pack delivery. No hydration, eager runtime import, additional package, blocking script, or app-state cache was introduced.

Seven focused regressions failed before the fixes and pass after. The tests cover concurrent imports, independent roots, MDX and TSRX routes, navigation, failure retry, and preserving successful module loading after a handler error. The change retains promises only for loaded code; each event still uses its current root and state.

The six previously recorded whole-repository fixture byte-budget failures remain outside this change. This is local verification, not full-goal completion or a deployment. Semantic graph repartitioning remains separate work; this evidence does not justify claiming that packing now beats Qwik on first interaction.

Raw timing rows, build identities, coverage attribution, and navigation records: [ROUTE-MODULE-REUSE.json](./ROUTE-MODULE-REUSE.json). The retained candidate is `/private/tmp/markless-route-reuse-final/output`. Reproduce timing with `node scripts/experiments/packed-delivery/route-module-reuse.mjs <before-output> <after-output> <results.json>`.

## Recorded hypothesis and protocol

Scope: router resume entry, generated MDX fallback module loading, their focused tests, and this experiment's measurement files. Preserve native ESM packing, deferred initialization, route selection, and unrelated work.

Hypothesis, recorded before the paired measurement: repeat sidebar clicks spend approximately 16 ms awaiting the route entry's already-loaded dynamic import. Sharing the import promise by loader identity removes that scheduling wait without eagerly initializing modules or retaining application state. Reject if uninstrumented measurements do not improve beyond noise or first-use behavior regresses.

Protocol: generated docs builds from the same working tree, differing only in route module reuse. Fresh Chrome contexts, HTTP cache disabled, service workers blocked, 1440 × 1000 viewport. Alternate before/after order. One discarded warmup per build; ten visits per settled control/CPU condition, three trusted clicks per visit. Sidebar, counter, and accordion; normal and 4× CPU. Five visits per early-input control/network condition, sidebar and counter; normal and 4× CPU plus 150 ms latency, 5 Mbps download, 1 Mbps upload. Identical Brotli quality 5 JS and streamed HTML compression. No concurrent builds/tests or source instrumentation during measurement. Capture input before app listeners; measure click to expected DOM mutation, not paint or formal TTI.

Report median and MAD for first and repeat actions. Meaningful delta exceeds max(10 ms, 10% of the before median, twice the larger MAD). Correctness requires expected state changes, rapid counter clicks retained, no page errors or failed framework requests, five framework JS requests per route, no additional settled click-time JS fetches. Keep compressed JS growth below 512 bytes per tested route. Separately check startup execution with precise coverage, outside timed runs. Verification includes `pnpm run typecheck`, docs typecheck/tests/build, focused router tests, and docs navigation checks.

Baseline build: `/private/tmp/markless-route-reuse-before/output`; first candidate: `/private/tmp/markless-route-reuse-after/output`. Build receipts with output hashes live alongside each build.

The first candidate improved repeat counter clicks but left repeat sidebar clicks waiting at the next import boundary: generated MDX imports the full resume module again on each fallback event. The next candidate applies the same import-promise reuse there. It still obtains the runtime using the current root on each event and does not retain per-root state at module scope. Unit tests cover lazy scalar handling, independent roots, retry after import failure, and continued reuse after handler failure. The first timed run stopped at an accordion observation timeout; its completed counter/sidebar samples are diagnostic only. The corrected harness uses the established playground accordion selector and saves observed actions on failure. Repeat the complete protocol for the combined change.
