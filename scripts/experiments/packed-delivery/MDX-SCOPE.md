# MDX interaction scope experiment

The docs counter currently resumes the composed MDX payload: 72 cells, 177 computed records, 481 locators, 23 events and 299 DOM updates. Its own rendered child needs one cell, two locators, one event and one DOM update. An isolated payload experiment confirms that the extra setup has measurable cost on the throttled run, but narrowing the payload alone leaves most of the shared resume module initialization in place.

| Counter interaction | Full page payload | Counter payload |
|---|---:|---:|
| Normal first click, median | 36.90 ms | 35.75 ms |
| Normal repeat, median | 15.00 ms | 15.05 ms |
| Constrained first click, median | 65.35 ms | 53.05 ms |
| Constrained repeat, median | 15.10 ms | 14.55 ms |
| First-click module initializers | 48 | 44 |
| Repeat module initializers | 0 | 0 |

The constrained first-click reduction of 12.30 ms exceeds the predeclared 10 ms threshold. The other timing changes do not. This supports continuing the narrower-resume investigation; it does not establish the performance of an integrated implementation.

## Method and limitations

Same immutable docs build, markup and JS packs for both variants. The private proxy replaces the state/view payload with the counter's records for the isolated variant. Both HTML variants are buffered before Brotli compression. Unrelated controls intentionally lose their records in that variant: this is a diagnostic, not a shipping feature or a passing navigation test. The localhost:3000 user preview was not modified.

Forty fresh Chrome 153 contexts, ten visits per variant and condition, three clicks per visit, alternating variant order. HTTP/2, Brotli quality 5, HTTP cache disabled and service workers blocked. Constrained means 150 ms RTT, 5 Mbps down, 1 Mbps up and 4× CPU. Timing is captured click to expected DOM mutation, not paint. Threshold: max(10 ms, 10% of the full median, twice the larger MAD). No owned build/test overlapped timing; a process snapshot showed the user's Cursor renderer at 35.7% CPU, so this was not an otherwise-idle machine.

The 120 counter actions passed. Each visit made five framework JS requests plus three site script requests. No HTTP cache hits, pending JS transfers at click or click-triggered JS requests were observed. The raw probe's generic cache counter includes two inline data-URL image cache events per visit; those are not HTTP-cache reuse. The companion JSON distinguishes them. Raw transport metadata retains an inherited streaming label; the explicit scope-probe metadata and this report correctly describe buffered HTML.

Coverage ran separately: three visits per variant, 18 actions. Framework code executed before input was zero; initializer counts were consistent across those visits. Full first-click covered source was 161,326 bytes versus 156,489 isolated; 98,176 bytes in each were export declarations. Coverage is source attribution, not CPU time. Initializer counts also include small declaration/dependency wrappers, not just substantive application work.

The isolated run skipped the storage-plane, sync-policy-core and resume-sync-demand initializers plus one minified helper. It still reached the common graph, payload decoding, locator, event, runtime-start and overlay modules. The overlay loader checks the whole root DOM, so unrelated page overlays still activate that support even with the counter-only records.

## Safe integration remains unfinished

The tested ownership planner is kept under this experiment directory; production MDX emission does not call it. Its focused tests preserve DOM indexes, reject overlapping scopes and outside graph reads, and now reject storage references and mismatched child/composed inventories. Those last three tests failed before the guards were added. This is a conservative prototype, not a complete closure proof for arbitrary component capabilities.

Integration must retain later controls, live shared state, serialized event order, focus/hover priming, disposal and navigation. The existing staged runtime needs review for MDX render-data forwarding and container lifecycle before reuse. The inline hover/focus wake can arrive without an event record, so selecting a group only by the first click's symbol is insufficient. No route-specific selector or counter identifier belongs in production code.

Root Markless-aware typecheck and 59 focused MDX/projection tests passed before moving the unused planner into this experiment directory. Final validation is recorded in IMPLEMENTATION.md. Existing broader fixture-budget failures remain open; this report is not goal completion.

Reproduce with `DOCS_COLD_OUTPUT=<saved-output> DOCS_COLD_SCOPE_PROBE=1 DOCS_COLD_BROTLI=1 DOCS_COLD_HTML_BROTLI=1 DOCS_COLD_HTTP2=1 DOCS_COLD_SAMPLES=10 node scripts/experiments/packed-delivery/probe.mjs`. Coverage uses `DOCS_COLD_SCOPE_PROBE=1 DOCS_EXECUTION_SAMPLES=3 node scripts/experiments/packed-delivery/execution-probe.mjs` with the same saved output. Paths and build hash are in MDX-SCOPE.json.
