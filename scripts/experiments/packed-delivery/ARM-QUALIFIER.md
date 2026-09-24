# Deferred arm registration

Workflow guidance: .ruler/skills/markless-implementation/implementation.md, .ruler/skills/markless-implementation/performance.md, .ruler/skills/markless-implementation/bundler.md.

The docs counter no longer initializes arm materialization or its error module merely to load its instance-scoped handler. The arm qualifier's registration state now shares the existing lightweight handle-qualification module. The setter, getter and callback type remain available from resume-arm-records through re-exports. Callback types live with the existing resume types; they introduce no runtime dependency.

This is a small dependency improvement, not a demonstrated speedup or proof of minimum execution. The first counter click initializes 13 modules instead of 15 in three precise-coverage samples. Repeat clicks initialize zero new modules. A different counter adds three, as before. Computed state, the mode selector and accordion retain their previous first-action counts of 56, 72 and 117; the next mode-selector action still adds one. No framework pack initializer runs before input or on the unrelated static-header press. These statements concern the measured packs, not the inline resumer or site scripts.

Two experiments were rejected along the way. Separating client MDX helpers still initialized 15 modules, so those source/config changes were reverted. A separate arm-qualification module reduced the counter to 14 but added one initializer to complex controls. Co-locating the registration slots removed that extra initializer. The regression bundles the actual instance-scoping entry with tree shaking disabled and checks that arm materialization/error modules are absent; it failed before the extraction. Shared registration state and both loading orders also pass.

## Cold docs comparison

Ten fresh Chrome visits per build/condition: 40 visits and 120 counter clicks. HTTP cache disabled, service workers blocked, Chrome 153.0.8010.53, production Nitro builds behind identical Brotli-quality-5 HTML/JS proxies over localhost HTTP/1.1. Constrained runs apply 150 ms latency, 5 Mbps and 4× CPU. The stable build ran before the candidate, with no owned build, test or profiling job overlapping. Other desktop applications remained open. Timings end at the expected DOM mutation, not compositor paint.

| Condition | Click | Stable median | Candidate median |
| --- | --- | ---: | ---: |
| Normal | First | 32.75 ms | 32.90 ms |
| Normal | Second | 14.75 ms | 14.90 ms |
| Normal | Third | 15.00 ms | 14.95 ms |
| Constrained | First | 78.45 ms | 79.45 ms |
| Constrained | Second | 10.55 ms | 9.70 ms |
| Constrained | Third | 9.55 ms | 10.65 ms |

No median change exceeds the predefined max(10 ms, 10% of the previous median, twice the larger MAD) threshold. Both builds use five framework requests plus three site scripts, with zero HTTP cache hits, page errors or failed clicks. No click starts another script request. Already-pending scripts remain on 9/10 stable and 10/10 candidate constrained first clicks. A zero-network-wait guarantee is not established.

There is a small transfer regression: encoded framework response bytes rise from 235,035 to 235,506 (+471 B) for this docs build. Counter first-action coverage falls from 139,186 to 139,114 source bytes; its lexical export spans rise from 99,078 to 99,145. Coverage spans are not CPU time or proof that each handler body within the downloaded pack executed. Do not present this as a large execution reduction.

## Verification and limits

- Root `pnpm run typecheck`, docs Markless-aware typecheck and `pnpm run build` pass.
- The 22 focused tests pass. The dependency/closure combination passes 13 tests under the unchanged raw-source limit. The docs pass 64 tests and doctor/production build. Their existing successful-test shutdown warning remains.
- The affected web/router/bundler suite has 1,562 passes and six existing byte-budget/negative-budget failures. No ceiling changed. Sandbox-only watcher/listen failures were rerun with native filesystem/loopback access and are not counted as successful runs.
- Final docs coverage passes 18 visits, 57 control actions and three static-header presses. Six navigation/delivery scenarios pass, including keyboard input, scalar-to-full-runtime handoff, history, offline controls, delayed packs and observable pack failure.
- The default Nitro-hosted alternate-shape propagation fixture passes five routes and 15 native clicks, including stopped propagation and complex fallback, without HTTP cache hits or page errors.

The combined registration initially tripped the raw-source proxy at 21,144 against 20,970. Moving its callback contracts into resume-types restores that unchanged gate. Independently compiling the registration module before/after that type relocation produces identical 255-byte minified JS; this is source organization, not a shipped-byte saving. Whole-docs hashes were not identical: the generated route-preload table order changed between the two builds and filenames changed with it. The final output was therefore retested directly. Deterministic route-preload emission needs separate investigation before attributing small cross-build transfer differences solely to this source edit.

Remaining gzip gates: largest runtime fixture chunk 5,676 > 5,403/5,435; CSR download/startup 140,854 > 140,187 and 14,927 > 14,696; SSR download/navigation 84,855 > 84,771 and 25,702 > 25,502. SSR startup passes at 4,318 ≤ 4,327. These failures and complex-control minimality remain open; this is not a completed or fully green goal.

## Preview and evidence

Port 3000 remains on the working immutable build `/private/tmp/markless-docs-inline-3bKoIN/.output`; it was not switched during these experiments. The tested candidate is `/private/tmp/markless-docs-arm-final-3G2uAA/.output`, also served at http://localhost:3018/markless/concepts/state in session 65935. Direct Chrome page 18 clicks produced counter 2 and watched variable 1, with the corresponding two live scalar cells on `[data-async-container]`, no full-runtime start, five framework and three site scripts returning 200, and no console errors/warnings or service worker controller. The reported obsolete `chunk-DOTqkIfD.js` returns 404, while a fresh port-3000 `/markless/` response is 200 and does not reference it. Reloading the old document is the appropriate first action; these observations do not justify a cache purge.

Paths, counts, timing distributions and remaining budgets are in [ARM-QUALIFIER.json](./ARM-QUALIFIER.json). Raw copies are under ignored `results/arm-qualifier-2026-09-22/`. No commit, push or goal closure occurred.
