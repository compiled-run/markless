# Computed refresh demand on the real docs

Workflow guidance: .ruler/skills/markless-implementation/implementation.md, .ruler/skills/markless-implementation/performance.md.

The tested subscription change is rejected and reverted. It removes three computed refreshes per accordion interaction, but no timing difference clears the predeclared threshold. The trace, rejected patch and regression reproduction remain here; production sources and the working previews retain their preceding behavior.

## What the trace establishes

`symbol-demand-probe.mjs` intercepts actual docs JavaScript in fresh Chrome contexts and instruments AST-identified member calls to `loadSymbol`. It records symbol identity, computed record and stack separately for first and repeated trusted clicks, asserts the expected visible result, and rejects syntax/rewrite errors. This is a diagnostic of inspected member calls, not an exhaustive call graph or a latency measurement.

The accordion makes 82 computed refresh requests on its first click and 63 on each repeat. Some identical computed nodes refresh two or three times. The inspected demand wiring registers each dependency with a separate subscription identity; the runtime scheduler already coalesces identical identities within each pending-write batch. The candidate uses target graph node plus derive symbol as the identity instead. Four regressions fail before the change and pass afterward, covering alternate two-/three-field dependencies, distinct targets, later-batch writes and disposal.

On the real docs, only the three `isHeldOpen` nodes lose a refresh: three calls become two for each. First/repeat computed refresh counts become 79/60/60; observed member load calls become 714/416/416 from 729/431/431. The menu stays at five computed refreshes per interaction. Repeated work in separate update batches remains. The controlled accordion playground also writes its parent value, which other controls read; their presence in a trace alone does not establish unrelated work.

## Cold timing

Ten fresh visits per build/condition, 40 visits and 120 clicks total. Chrome 153.0.8010.53, HTTP cache disabled, service workers blocked, identical Brotli quality 5 HTML/JS proxy over localhost HTTP/1.1. Constrained visits use 150 ms latency, 5 Mbps and 4x CPU. Before visits precede after visits, without owned build/test/profiling work overlapping timing; other desktop applications remain open. Timing measures trusted click to expected DOM mutation, not paint.

| Condition | Action | Before median | Candidate median |
| --- | --- | ---: | ---: |
| Normal | First | 59.70 ms | 58.65 ms |
| Normal | Second | 21.50 ms | 21.25 ms |
| Normal | Third | 21.75 ms | 21.35 ms |
| Constrained | First | 248.10 ms | 286.55 ms |
| Constrained | Second | 44.85 ms | 41.80 ms |
| Constrained | Third | 41.10 ms | 38.85 ms |

The threshold is max(10 ms, 10% of the before median, twice the larger MAD). It is 10 ms for the normal and repeat measurements. The constrained first-click threshold is 100.40 ms because its before distribution has a 50.20 ms MAD. That noisy sample establishes neither improvement nor regression. No row meets the adoption threshold.

Both builds make five framework requests plus three site-script requests, with zero HTTP cache hits, failed actions, failed requests or page errors. No action starts another script request. A script remains pending at five before and six candidate first clicks out of twenty visits per build. Framework encoded response bytes change from 234,988 to 234,775. These results do not establish zero network wait.

## Correctness, restoration and remaining work

The candidate passes 23 focused tests, 802 web/runtime tests, root and docs typechecks, 64 docs tests and docs doctor/build. Eighteen coverage visits pass first, repeat and independent actions. Six navigation/delivery scenarios pass, including keyboard input, state handoff, history, offline controls, delayed packs and deliberately failed packs. The failure scenario intentionally produces three module-fetch errors; ordinary scenarios do not. First-action initializer counts stay 13 for the counter, 56 for computed state, 72 for the menu and 117 for the accordion. Counter repeats add zero; an independent control adds three. Counts and source coverage are not CPU time.

Six existing size/negative-budget tests remain red; no limits changed. Candidate gzip measurements: largest runtime fixture chunk 5,676 above 5,403/5,435; CSR download/startup 140,841/14,928 above 140,187/14,696; SSR download/navigation 84,843/25,701 above 84,771/25,502. SSR startup is 4,319 under 4,327. These gates still prevent whole-goal completion.

Restoration passes root typecheck, 19 focused tests and docs doctor/build. Its 63 client JavaScript files match the preceding verified build in filename, bytes and SHA-256: 19,292,124 bytes. Direct Chrome clicks on the unchanged port-3019 accordion open and close the return section, with five framework requests returning 200/304 and no console warnings/errors. The previews were not replaced. The earlier obsolete `chunk-DOTqkIfD.js` diagnosis remains an old-document/build mismatch; this experiment does not change that conclusion.

The evidence rules out within-batch subscription identity as the main docs interaction cost. A subsequent investigation should attribute actual CPU time or isolate the remaining cross-batch state feedback before changing more wiring. Minimum necessary execution has not been proved. No new commit, push or goal closure occurred.

See [COMPUTED-DEMAND.json](./COMPUTED-DEMAND.json), [the rejected patch](./computed-demand-dedup.patch), and [the failing-before test](./computed-demand-dedup-test.ts.txt). Raw copies are under ignored `results/computed-demand-2026-09-22/`.
