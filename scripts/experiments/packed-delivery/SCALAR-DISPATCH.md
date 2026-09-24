# Compiler-proven scalar dispatch on the docs site

Status: measured candidate, not a completed goal. The docs counter now initializes 15 modules on its first interaction instead of 48. A repeat initializes no new module; the independent watched-variable control initializes three more. Complex controls still use the general runtime. Fixture byte-budget gates remain red.

Review preview: http://localhost:3000/markless/concepts/state

This is the original scalar-dispatch measurement. The current preview and subsequent metadata-delivery change are documented in [SCALAR-METADATA.md](./SCALAR-METADATA.md).

This measurement used immutable output `/private/tmp/markless-docs-scalar-verified-Ybhwa3/.output`. After validation on port 3017, the same build replaced the older localhost:3000 preview. Direct Chrome clicks in a fresh isolated context on port 3000 reached “Clicked 2 times” and incremented the independent watched variable once, with two live cells, `__asyncResumeRuntimeStarted` still false, five framework script requests returning 200, and no error-console messages. Three additional site scripts are separate from that count. The tested markup did not reference `chunk-DOTqkIfD`; an already-open page needs reloading after a build switch.

## Mechanism

The compiler's `runtime-demand-map` pass already produces plain-SSR scalar action plans. It consumes the symbol resolver, capture analysis, symbol modules, public render module, protocol view and protocol state. Its text plan now preserves trailing text, such as “ times”; the focused compiler fixtures cover two different element/state arrangements. The prerender classifier remains unchanged.

The bundler exposes those plans through the existing lazy symbol routes. Metadata lookup preserves nested instance scopes and does not invoke a handler. Leaves with no scalar plan or child route omit the export. The normal ESM/modulepreload delivery remains in place.

MDX dispatch validates the plan against the served event, state cell, text updates and locators. Unsupported dependencies, storage references, computed readers, extra updates, missing targets, shown overlays and streamed patches retain full resume. The eligible path invokes the actual handler against its single cell, commits the resulting value, and updates the proven text targets. It does not construct the page graph. The existing full-resume constructor adopts those live values when a later action needs the general runtime.

The MDX entry now uses the existing serialized dispatch wrapper. Pointer/focus priming carries its element. Unmatched focus and native Enter/Space activation on an eligible button prepare the small path; authored matching event records still require their own dispatch. This fixes the observed docs sequence where a pointer hover prepared the scalar plan but a subsequent unmatched focus event started the full runtime.

## Timing

Ten fresh Chrome visits per build and condition, three clicks per visit: 40 visits / 120 actions. HTTP cache disabled with CDP; service workers blocked. The same local HTTP/1.1 proxy compresses JavaScript and streamed HTML with Brotli quality 5. The constrained condition applies 150 ms latency, 625,000 bytes/s download, 125,000 bytes/s upload and 4× CPU slowdown. Coverage instrumentation ran separately.

The comparison ran the previous build followed by the candidate, rather than interleaving builds. Other applications remained open on the developer laptop. The process snapshot is retained with the raw results. These are trusted-click-to-expected-DOM-mutation measurements, not paint measurements.

| Condition | Previous first click | Candidate first click | Second click, previous → candidate | Third click, previous → candidate |
| --- | ---: | ---: | ---: | ---: |
| Normal | 36.05 ms | 33.20 ms | 15.75 → 14.85 ms | 14.35 → 14.60 ms |
| Constrained | 94.50 ms | 75.95 ms | 11.80 → 11.70 ms | 13.65 → 12.25 ms |

The predefined meaningful-change threshold is max(10 ms, 10% of the previous median, twice the larger MAD). It is 10 ms for these first-click comparisons. Only the constrained first-click improvement, 18.55 ms, clears it. Normal and repeated-click changes are inconclusive.

Both builds made five framework requests and used no HTTP cache. A script was still in flight at the first click in 8/10 previous and 9/10 candidate constrained visits. This result does not eliminate the early-click network race.

## Execution and correctness

Separate coverage passed 15 cold visits / 48 actions, three samples each of counter, independent controls, computed total, mode selector and accordion. Framework execution before input was zero in the captured coverage. Counter initialization counts were consistently 15 on first use and zero on repeats; the independent second control added three. Counts refer to Rolldown module initializer callbacks, not CPU time. V8 source coverage includes roughly 99 KB of lexical export declarations on the first action, so that number must not be presented as handler execution cost.

Five final browser scenarios passed: live scalar values survived handoff to the mode selector and later clicks; keyboard activation and ten queued clicks preserved increments; SPA navigation/history/offline controls worked; delayed packs kept controls visible and retained input; failed packs produced observable errors. Fault injection selects a pack actually requested by the tested page, since unused files can remain in the build directory.

Verification passed: root `pnpm run typecheck`; 143 focused tests; 64 docs tests; docs Markless-aware typecheck; the actual `pnpm --dir website run doctor` script, including its production build; final docs build; and diff whitespace checks. The broader compiler/bundler/router run passed 2,853 tests with two expected failures. It also exposed six fixture byte-budget failures and a doctrine guard mismatch; the guard was corrected and subsequently passed. The byte budgets remain unresolved. Empty metadata-loader removal reduced added overhead but did not remove the non-MDX output regression; the latest music-player runs still exceed download/execution/navigation limits. No limits were raised.

Raw timing: `/private/tmp/markless-docs-cold-4b83lW/results.json` and `/private/tmp/markless-docs-cold-D5PaDN/results.json`. Final coverage: `/private/tmp/markless-docs-execution-rcJrc5/results.json`. Final navigation/fault checks: `/private/tmp/markless-docs-navigation-rwW3YR/results.json`. Summaries are in `SCALAR-DISPATCH.json`; raw copies are in ignored `results/scalar-dispatch-2026-09-22/`.

Remaining work: remove unnecessary metadata delivery to ordinary consuming applications and clear their byte budgets; reduce general-runtime work for complex interactions; finish precise execution accounting. No commit, push or goal-completion claim was made for this continuation.
