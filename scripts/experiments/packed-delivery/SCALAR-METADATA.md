# Scalar metadata only for its consumer

The bundler now emits scalar action metadata only for an explicit symbol-source request. MDX requests that variant; ordinary applications omit the export. Nested metadata and handler lookups use the same variant. This preserves lazy initialization and the five-request docs delivery. The larger goal remains incomplete.

Review preview: http://localhost:3000/markless/concepts/state, immutable output `/private/tmp/markless-docs-scalar-consumer-final-CyhBha/.output`, server session 62741. Reload an already-open page after the build switch.

## Evidence

Two differently shaped source fixtures failed before the request boundary was implemented. Their ordinary/requested transforms now pass in both orders, including repeated cached transforms. The nested-route test invokes emitted loaders and verifies that both lookups request the same child variant. The consuming docs test caught a circular host import that unit tests under Vitest did not expose; extracting `scalar-plan-source.ts` removed it, and that actual Node-process test passes.

Non-MDX gzip budgets returned to their pre-scalar values:

| App and stage | Before this change | After | Existing limit |
| --- | ---: | ---: | ---: |
| CSR download | 140,969 B | 140,827 B | 140,187 B |
| CSR startup | 14,915 B | 14,916 B | 14,696 B |
| SSR download | 85,026 B | 84,882 B | 84,771 B |
| SSR startup | 4,329 B | 4,327 B | 4,327 B |
| SSR first navigation | 25,815 B | 25,717 B | 25,502 B |

The SSR startup gate is green again. Other overruns remain; no ceilings changed. This is a removal of unused metadata delivery, not a claim that ordinary application budgets are fixed.

Final production-output coverage passed 15 cold visits / 48 actions, three samples each for counter, independent controls, computed total, mode selector and accordion. No framework pack execution was observed before input. Initializer counts remain 15 for the first counter action, zero for repeats, and three for the independent second control. Computed/mode/accordion first actions still initialize 56/72/117 modules. Five navigation scenarios pass: scalar-state handoff, keyboard/queued input, navigation/history/offline controls, delayed packs and observable failed packs.

A separate unprofiled comparison used ten fresh Chrome contexts per build/condition, 40 visits / 120 actions total. CDP HTTP cache disabled, service workers blocked, streamed HTML/JS Brotli quality 5 over local HTTP/1.1; constrained visits apply 150 ms latency, 5 Mbps download and 4× CPU slowdown. The previous scalar build ran first, then the candidate, on a developer laptop with other apps open. No owned build, test or coverage run overlapped. Chrome was 153.0.8010.53. Measurements end at the expected DOM mutation, not paint.

| Condition | First click, previous → candidate | Second | Third |
| --- | ---: | ---: | ---: |
| Normal | 33.65 → 33.90 ms | 15.10 → 15.15 ms | 15.30 → 15.00 ms |
| Constrained | 67.15 → 67.50 ms | 11.55 → 11.10 ms | 12.35 → 11.30 ms |

No change clears max(10 ms, 10% of the previous median, twice the larger MAD); the constrained first-click threshold is 14 ms. There is no demonstrated latency improvement or regression. Both builds use five framework requests plus three site scripts, with zero HTTP cache hits, failed actions or page errors. A script was still pending on 7/10 previous and 8/10 candidate constrained first clicks, so the early-click network race remains.

The docs transfer tradeoff is small but real: the first measured visit transfers 234,479 → 234,975 framework bytes, +496 B, from Chrome's encoded network lengths, which include response overhead. The change makes ordinary apps smaller; it does not make this docs route smaller. The docs initialization counts and measured latency remain unchanged.

The final manual Chrome check used both a fresh context and a restored tab. Fresh-context counter/independent-control clicks produced two correct live cells without starting the full runtime. Initial counter clicks in the restored tab hit the fixed header covering the counter's center after scroll restoration; `elementFromPoint` identified the header. Moving the control into unobscured view and clicking it produced the expected update. This was not a failed module fetch. The header click did expose another unnecessary wake: an unmatched static click starts the full MDX runtime. That needs a focused regression and careful preservation of authored ancestor/global handlers and outside-overlay behavior.

Verification: root `pnpm run typecheck`; 185 focused tests; 64 docs tests; docs Markless-aware typecheck; actual `pnpm --dir website run doctor`, including production build; browser checks above. The four music-player budget tests still fail on the remaining limits. Existing fixture chunk caps and exact execution accounting remain open. The docs test process prints a shutdown warning after passing, but exits successfully.

Raw and summarized evidence: [SCALAR-METADATA.json](./SCALAR-METADATA.json), with raw copies under ignored `results/scalar-metadata-2026-09-22/`. Additional diagnostic observation: four inspected music-player SSR chunks contain encoded absolute checkout paths in imported symbol IDs or native template IDs. The inspected owners are `linkedImportedSymbolInputs` in compiler `passes/link/module-link.ts` and `passes/public-render/component-definitions.ts`. Their size effect is not yet isolated; no identity rewrite was made.
