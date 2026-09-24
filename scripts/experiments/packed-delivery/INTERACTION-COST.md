# First and subsequent docs interactions

Native packing retains lazy module initialization on the tested docs routes. Two avoidable costs were fixed: MDX static page-data construction during resume, and recursive DOM containment walks during dispatch and element lookup. The first interaction still starts the container runtime; this report does not establish globally minimal execution.

## Separate controls stay lazy

Cold Chrome, state documentation, cache disabled, service workers blocked:

| Action | Newly initialized module bodies |
|---|---:|
| Before input | 0 |
| First counter click | 48 |
| First click on the separate “watched variable” demo | 4 |
| Return to counter | 0 |
| Repeat watched-variable click | 0 |

The observed loaded packs contain 1,111 Rolldown lazy initializer callbacks. The first counter action reaches five route callbacks and 43 shared callbacks. The second demo then reaches its own component, wrapper, event symbol and DOM-update symbol. It did not initialize during the first demo's click. The module counts describe `__esmMin` callback execution, not function calls or CPU milliseconds.

## Removed work

MDX client output previously constructed the static prose/HTML array when its resume module initialized. It now constructs that array only inside the existing render-data loader. Navigation still requests it when rendering needs it. The isolated MDX change reduced counter first-action source coverage by 31,610 bytes and computed-demo coverage by 27,464 bytes; repeat coverage was unchanged.

Dispatch and locator checks previously walked descendants in JavaScript to check containment. Real DOM elements now use their native `contains()` method; structural hosts retain the fallback. Nested dispatch, first/repeat clicks and detached-target rejection remain covered.

| Route | First-action containment helper calls, before → after | First repeat, before → after |
|---|---:|---:|
| Counter | 1,161 → 3 | 774 → 2 |
| Computed | 1,512 → 4 | 1,028 → 3 |
| Mode selector | 137 → 16 | 116 → 11 |
| Accordion | 33,379 → 70 | 7,479 → 28 |

These are recorded invocation counts. The browser still performs the native containment check. The accordion's asynchronous activity can vary counts between visits; the repeated coverage runs consistently removed the thousands of recursive calls.

## Interpret coverage correctly

The counter's first-action covered-source total changed from 193,067 to 161,370 bytes. **98,176 bytes of the final total are export declarations**, including the shared pack's 96,572-byte export list. Those declarations are not application handler bodies. The remaining covered source includes runtime setup and declarations as well as called functions. Neither this total nor a whole-pack byte counter measures CPU time.

Repeat counter coverage grows slightly, from 16,498 to 16,568 bytes, despite the large reduction in containment calls: the new native fast path adds source text. Coverage bytes alone cannot rank execution efficiency.

## Remaining cost

The MDX resume handler calls `resumeFromPayloadDocument`, which constructs the payload graph and calls `runtime.start()` before dispatch. The observed counter first-use path includes container locators, event/subscription registration, overlay support and storage support. This setup is broader than the counter's increment and text update. Further reduction needs finer runtime demand boundaries; packing alone does not provide them. Repeat counter clicks initialize no additional modules, but still traverse the graph/dispatch machinery.

The mode selector initializes one additional handler when closing after its first opening; that is demand for a different action, not reinitialization of the whole pack.

## Verification and limits

- Focused regressions failed before the fixes and pass afterward: 44 MDX tests; 65 resume/containment tests.
- Web/router run: 893 passed initially. The two failures were the system Git's Xcode license error and an 11-byte source-text budget overrun. Using Homebrew Git and shortening a touched explanatory comment made their focused reruns pass. No budget was raised; comment shortening does not reduce executable code.
- Root Markless-aware typecheck, docs typecheck, 64 docs tests, docs doctor and production build passed. The final doctor build's 63 client JS files match the measured build byte for byte.
- Five coverage visits and 16 actions passed without page errors. Framework execution before input was zero. The four ordinary scenarios were measured again with the same executed-source totals.
- Independent HTTP/2 + Brotli cold checks passed 16 visits and 48 actions across normal and constrained conditions, with five framework requests, no HTTP cache hits, no click-time JS requests and no pending JS transfers at input. Two samples per condition are a correctness check, not evidence of a latency improvement.
- Final navigation/history/offline and delayed/failed-pack checks passed three scenarios in `/private/tmp/markless-docs-navigation-6RhV1b/results.json`.
- The broader goal's six previously reproduced fixture-budget failures remain unresolved. This is not a full-tree completion claim.

Reproduce coverage with `DOCS_COLD_OUTPUT=<saved-output> node scripts/experiments/packed-delivery/execution-probe.mjs`, then run `execution-attribution.mjs <results.json> <attribution.json>`. The companion JSON preserves per-phase initializer identities, counts, input paths and build paths. Raw copies are in the ignored `results/interaction-cost-2026-09-21` directory.
