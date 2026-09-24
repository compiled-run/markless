# Intent-triggered module initialization

Workflow guidance: .ruler/skills/markless-implementation/implementation.md, .ruler/skills/markless-implementation/performance.md, .ruler/skills/markless-implementation/bundler.md.

The docs confirm a small amount of unnecessary initialization: `resume-events.preloadSymbolsFor` calls `loadSymbol` for possible keyboard/press handlers during focus and hover. Native imports initialize those modules even when the handler is never dispatched. Suppressing that speculative call in a private production-output copy removes two first-action initializers from the menu (72→70) and one from the accordion (117→116). The removed symbols are keyboard handlers; two have empty initializer bodies and the other initializes dependencies already reached by the click plus a constant. This is not the main first-interaction cost.

No production change is adopted. The private copy retains native modulepreload and the original byte length and filenames; Chrome HTTP caching is disabled. The initial copy incorrectly shortened the pack while Nitro retained its original Content-Length, causing incomplete responses before framework execution. Those runs are excluded. The rewrite script now asserts byte-length preservation.

Eighteen coverage visits pass 57 control actions and three static-header presses. The counter remains at 13 first-action initializers; its repeats initialize zero and an independent counter adds three. Computed state remains at 56. The menu's second action still initializes one close-path module; other measured repeats initialize none. Coverage ranges and initializer counts are not CPU time or proof of minimum necessary work. Six navigation/keyboard/delivery scenarios pass, including the intentional missing-pack failure case.

Eighty cold visits and 240 clicks compare the unchanged build with the private copy. Each route/condition/build has ten fresh Chrome 153.0.8010.53 contexts, HTTP cache disabled and service workers blocked. Both use Brotli quality 5 HTML/JS over localhost HTTP/1.1. Constrained runs use 150 ms latency, 5 Mbps and 4x CPU. Runs are before then after, without overlapping owned build/test/profiling work; other desktop apps remain open. Timing ends at the expected DOM mutation, not paint.

| Control / condition | First before→after | Second before→after | Third before→after |
| --- | ---: | ---: | ---: |
| Menu / normal | 40.60→40.90 ms | 16.35→16.60 ms | 15.85→16.40 ms |
| Menu / constrained | 148.95→147.55 ms | 16.55→15.30 ms | 17.50→17.75 ms |
| Accordion / normal | 60.20→60.25 ms | 21.60→21.45 ms | 21.65→21.65 ms |
| Accordion / constrained | 216.00→231.55 ms | 46.30→44.60 ms | 39.45→41.90 ms |

No difference clears the established max(10 ms, 10% prior median, twice larger MAD) threshold. The constrained accordion's first-action threshold is 41.10 ms; its spread prevents interpreting the 15.55 ms increase as a demonstrated regression. No speedup is established either.

Both outputs make five framework requests plus three site scripts. The 240 clicks produce no page errors, failed actions, HTTP cache hits or newly started script requests. Preloads remain unfinished at 14/40 prior and 13/40 candidate first clicks; this does not prove zero network wait. The diagnostic rewrite changes encoded framework bytes by +2 B. Root `pnpm run typecheck` passes. The previous six framework size/negative-budget failures remain unresolved; this experiment does not change production code or those budgets.

Exact distributions, initializers, raw paths and excluded runs are in [INTENT-EXECUTION.json](./INTENT-EXECUTION.json); raw copies are under ignored `results/intent-execution-2026-09-22/`. Existing previews remain unchanged, including the working final build on port 3019. No commit, push or goal closure occurred.
