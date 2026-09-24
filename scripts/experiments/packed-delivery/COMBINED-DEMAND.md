# Combined symbol-loading optimization

Workflow guidance: .ruler/skills/markless-implementation/implementation.md, .ruler/skills/markless-implementation/bundler.md, .ruler/skills/markless-implementation/performance.md.

The combined loader change is retained: it reduces first and repeat accordion latency on the real docs beyond the preset threshold. The broader goal remains incomplete. Six earlier bundle-size/negative-budget tests remain red, and this result does not prove that interactions execute the minimum possible code.

Subsequent [DEMAND-FOLLOWUP.md](DEMAND-FOLLOWUP.md) rules out empty-helper removal as a meaningful latency improvement and rejects a dispatch scope split that increases overall byte costs. The combined change measured here remains intact.

The measured build is available at http://localhost:3020/markless/ui/accordion. Previous previews remain unchanged. A direct Chrome check opened and closed “How do I return something?” successfully; five framework scripts and three site scripts returned 200, with no console errors or warnings. The original missing chunk URL belonged to an older document/build combination; the current preview references different hashes.

## What changed

Generated MDX loaders reuse their component-module import promise between scalar-plan and symbol lookups. Rejected loads release that promise for a later attempt. Symbols and component placement scopes retain their separate behavior; handler results and application state are not cached.

The pack transform replaces supported native imports back into the executing pack with deferred calls to the existing lazy initializer. Cross-pack imports and packs containing top-level await retain native imports. Loading a pack still does not initialize every contained module. This keeps native ESM and modulepreload, visible controls and per-module lazy initialization.

These changes remove successive layers of the same symbol-loading path. Each standalone experiment previously failed the timing criterion; those results remain recorded in MDX-MODULE-DEMAND.md and SAME-PACK-IMPORTS.md. This combined comparison is a separate result, with the same adoption threshold.

## Measured interaction times

Ten fresh Chrome 153.0.8010.53 visits per control, build and condition: four controls, three conditions and two builds yield 240 visits and 720 trusted clicks. Each visit has a first interaction and two repeats. HTTP cache is disabled and service workers blocked. Both generated Nitro builds use identical Brotli quality 5 HTML/JS compression over local HTTP/1.1.

The conditions are normal; 150 ms network latency, 5 Mbps download and 4× CPU; and 4× CPU without artificial network latency. Before runs precede after runs in separate groups. No owned build, profiling or coverage work overlaps timing; other desktop applications remain open. Measurements are captured click to expected DOM mutation, not paint. These are desktop Chrome throttling results, not physical-phone measurements.

Accordion medians:

| Condition | First, before → after | Second, before → after | Third, before → after |
| --- | ---: | ---: | ---: |
| Normal | 59.40 → 54.20 ms | 21.55 → 18.00 ms | 21.65 → 18.15 ms |
| Network + 4× CPU | 205.25 → 152.20 ms | 44.30 → 22.85 ms | 39.35 → 24.75 ms |
| 4× CPU only | 196.15 → 151.80 ms | 39.85 → 24.30 ms | 39.30 → 25.95 ms |

The fixed adoption threshold is max(10 ms, 10% of the before median, twice the larger median absolute deviation). Each throttled accordion row clears it. Normal accordion differences do not. No counter, computed-total or documentation-menu row shows an improvement or regression exceeding its threshold.

For the CPU-only first accordion click, MAD is 1.25 ms before and 2.60 ms after; the 44.35 ms reduction exceeds the 19.615 ms threshold. The corresponding p95 is 201.80 → 155.80 ms. With ten samples, nearest-rank p95 is the observed maximum, so it is not a robust estimate of population tail latency. Individual samples, medians, MADs, p95s and thresholds are retained in COMBINED-DEMAND.json.

Each visit makes five framework JS requests plus three site-script requests. HTTP cache hits, failed actions and failed requests are zero. No measured click starts a new script request. However, scripts were already pending on 33 before and 32 after clicks; the CPU-only clicks have none pending. This does not establish a zero-network-wait guarantee or measure clicks at the earliest instant a control becomes visible. Encoded framework bytes on the accordion fall slightly, 234,988 → 234,730.

## Execution and correctness evidence

Separate precise-coverage runs pass 18 visits, 57 actions and three additional static-header presses. Observed first-interaction initializer counts remain counter 13, computed-total 56, menu 72 and accordion 117. Counter and accordion repeats add zero initializers; the menu's second activation adds one; the independent counter adds three. External framework coverage before input remains zero. Initializer counts and covered source ranges are not CPU time or a complete dependency-minimality proof.

Six navigation/delivery scenarios pass, covering keyboard input, queued clicks, independent controls, scalar/full-runtime handoff, history, offline interaction, delayed packs with visible controls and observable failed delivery. The failure scenario intentionally injects a request error.

Source-identified Vite helper calls expose remaining waste. Accordion counts change from 169/99/95 to 646/57/61 for first/second/third actions. The combined output retains empty helper wrappers around some deferred local initializer calls, using an undefined dependency argument. The inspected cleanup handles different emitted shapes. Many additional first-click helper calls use the empty-dependency fast path; helper counts are not request counts or elapsed time. No helper-cleanup change is included in this candidate. This remains a bounded follow-up opportunity, alongside the separately observed widget registration and payload decoding costs.

A literal-text scan finds 2,343 matching self-import expressions before and zero after. This is explicitly a pattern scan, not an exhaustive reference graph. Focused artifact tests establish the supported same-pack behavior and retained top-level-await/cross-pack behavior for their fixtures.

## Verification and remaining gates

Four focused regressions fail before implementation. Final focused checks pass 23 tests across four files. Root `pnpm run typecheck`, 709 web tests, the docs Markless-aware typecheck, 64 docs tests and docs doctor/production build pass. The docs tests retain their existing successful-test shutdown warning.

The broad bundler/router run has 860 passes and eight failures. Two were stale emitted-output expectations, updated and included in the passing focused rerun. Six existing size/negative-budget failures remain: largest runtime chunk 5,676 gzip bytes against limits 5,403 and 5,435; CSR download 140,854 against 140,187 and startup 14,927 against 14,696; SSR download 84,855 against 84,771 and navigation 25,702 against 25,502. The negative-budget failures arise alongside those overruns. No ceiling was raised. This is not a passing overall test suite or a completed write task.

The current website output matches the measured immutable preview's 63 client JS filenames and SHA-256 hashes, totaling 19,274,342 bytes. Production/test source snapshots, raw comparison/coverage/navigation results and verification logs are copied under ignored `results/combined-demand-2026-09-22/`; COMBINED-DEMAND.json records their paths and hashes. The coverage result also retains its original source/trace paths under `/private/tmp/markless-docs-execution-XtoI80/`.

No new commit, push or goal closure occurred. The combined optimization is retained for its measured improvement; remaining execution waste and failing size gates must still be addressed.
