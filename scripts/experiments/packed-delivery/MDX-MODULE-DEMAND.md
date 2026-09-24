# MDX interaction costs on the real docs

Later follow-up: [COMBINED-DEMAND.md](COMBINED-DEMAND.md) records a retained combination of module-promise reuse and deferred same-pack initialization. The standalone results below remain unchanged.

Workflow guidance: .ruler/skills/markless-implementation/implementation.md, .ruler/skills/markless-implementation/performance.md, .ruler/skills/markless-implementation/bundler.md.

Two small production candidates were tested and reverted. The earlier accepted native packing and runtime changes remain. Neither experiment establishes that first or later interactions execute the minimum possible code.

## Repeated component imports

The input-bounded CPU trace in INPUT-CPU.md identified repeated calls to Vite's CSS preload helper through generated MDX symbol loaders. The candidate shares a component-module import promise between scalar-plan and symbol lookup. It preserves lazy per-symbol initialization, separate component placement scopes and retries after rejected loads. No module is loaded merely by constructing the loader table, and no handler result or user state is cached.

Three emitted-loader tests failed before the change. With it, 241 router tests, root and docs Markless-aware typechecks, 64 docs tests and the docs doctor/build pass. Eighteen cold coverage visits and six navigation/delivery scenarios pass, including repeated and independent controls, keyboard input, scalar-to-full-runtime handoff, history, offline interaction, delayed delivery and observable failed delivery. The failure scenario intentionally reports its injected request error.

Source-hash-verified coverage establishes these Vite preload-helper invocation counts across three samples:

| Control | First, before → after | Second, before → after | Third, before → after |
| --- | ---: | ---: | ---: |
| Documentation menu | 36 → 19 | 19 → 4 | 16 → 2 |
| Accordion | 169 → 22 | 99 → 12 | 95 → 8 |

These are helper calls, not network requests, initialized modules or CPU time. Initializer counts remain 13 for the counter, 56 for the computed example, 72 for the menu and 117 for the accordion. Counter and accordion repeats add zero initializers; the menu's second activation adds one; the independent counter adds three. External framework coverage before input remains zero.

## Uninstrumented timing

Ten fresh Chrome 153.0.8010.53 visits per control, build and condition: 120 visits and 360 clicks total. HTTP cache is disabled and service workers blocked. Generated Nitro output is served through identical Brotli quality 5 compression for HTML and JS over local HTTP/1.1. The network-constrained condition uses 150 ms latency, 5 Mbps download and 4x CPU; CPU-only uses 4x CPU with no artificial network latency. Before runs precede after runs; no owned build, coverage or profiling work overlaps timing. Other desktop applications remain open. The metric is trusted click to expected DOM mutation, not paint.

| Control / condition | First median, ms | Second median, ms | Third median, ms |
| --- | ---: | ---: | ---: |
| Menu, normal | 40.35 → 40.30 | 16.60 → 16.15 | 16.50 → 16.00 |
| Menu, network + CPU | 145.95 → 119.05 | 16.35 → 15.60 | 17.00 → 15.55 |
| Menu, CPU-only | 92.40 → 90.15 | 15.35 → 15.05 | 13.95 → 14.15 |
| Accordion, normal | 59.05 → 56.60 | 21.70 → 20.10 | 21.75 → 20.40 |
| Accordion, network + CPU | 295.55 → 232.85 | 43.20 → 35.30 | 41.10 → 33.70 |
| Accordion, CPU-only | 184.25 → 170.15 | 40.30 → 33.75 | 39.20 → 31.55 |

The preset adoption threshold is the larger of 10 ms, 10% of the before median, and twice the larger median absolute deviation. No row clears it. In particular, the apparent large first-click network improvements have high variance; the CPU-only accordion first-click improvement is 14.10 ms against an 18.43 ms threshold. The candidate removes real repeated work but is rejected under this protocol. The patch and tests are retained as `mdx-module-promise-rejected.patch` and `mdx-module-demand.test.ts.txt`.

Each visit requests five framework JS files plus three site scripts. HTTP cache hits, failed requests and failed actions are zero. No action starts another script request. Already-pending scripts occur on 14 before and 10 after clicks in the normal/network runs; none remain at the measured CPU-only clicks. This is not a zero-wait guarantee. Encoded framework bytes decrease from 242,962 to 242,753 on the menu and 234,988 to 234,793 on the accordion.

## Early scalar eligibility

The scalar attempt reads state and view before learning that a handler needs full resume, which then deserializes the payload. A second candidate checks a supplied matched event record's compiler plan first and reuses that plan for eligible work. Three new regressions fail before the change; supported payload validation and existing propagation/priming/handoff tests remain green. With the candidate, 246 router tests, root/docs typechecks, 64 docs tests, doctor, 18 coverage visits and six navigation/delivery scenarios pass.

However, actual first-click coverage still shows two calls to the scalar payload reader on the computed, menu and accordion examples. Priming without a matched event record reaches payload decoding first. The proposed gate therefore fails its mechanism check on the real docs and is reverted without a redundant timing comparison. Source-identified reader bodies, hashes and counts are retained in MDX-MODULE-DEMAND.json. The exact source and test deltas are retained in `scalar-eligibility-source-rejected.patch` and `scalar-eligibility-test-rejected.patch`.

## Preview and remaining work

The reported `chunk-DOTqkIfD.js` URL returns 404, but fresh port-3000 HTML references different hashes. A cache-bypassed Chrome reload serves the five referenced framework scripts successfully; two subsequent counter activations update to 1 then 2 without console warnings/errors. This supports an old-page/build mismatch diagnosis. Existing preview servers were not replaced by these experiments.

Six earlier bundle size/negative-budget failures remain unresolved, and no size ceiling was raised. No commit, push or goal closure occurred. These experiments improve the evidence about interaction cost; they do not finish the broader packing/performance goal. The sampled widget-registration work and the priming/full-resume decoding overlap remain separate unresolved costs.

Detailed results, individual samples, MADs, thresholds, network checks and source-count receipts are in MDX-MODULE-DEMAND.json. Raw copies are under ignored `results/mdx-module-demand-2026-09-22/`. Reproduce timing with `probe.mjs` and `DOCS_COLD_CONDITIONS=normal,constrained` or `cpu-only`; compare saved results with `compare-cold.mjs`. Use `preload-helper-counts.mjs` and `scalar-payload-counts.mjs` for source-verified coverage counts.

Restoration passes root `pnpm run typecheck`, 238 router tests and docs doctor/build. Its 63 client JS files, totaling 19,292,124 bytes, match the accepted aLMMJZ build byte for byte. These are restoration checks, not a claim that the six existing bundle-size failures are fixed.
