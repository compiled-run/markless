# Navigation latency: measured improvement, not ready to land

The browser was loading SSR component dependencies while resuming the departing MDX page and loading the destination. Destination rendering then requested local initializers and synchronous computed functions through sequential lazy symbol loaders. DOM insertion itself took about 1 ms. This was not a fixed click delay.

The candidate patch emits small MDX navigation/resume modules without eager SSR component imports. The bundler links compiler-selected state initializers and synchronous computed functions into render data. Fresh rendering can invoke those functions directly; live graphs and bound captures retain the existing scoped loader. Event handlers remain lazy. Runtime-dependent values are still evaluated at render time; dependency selection and linking move to compilation.

## Measurements

Isolated Vite dev server, installed Chromium, 1440×1000, no throttling. Each browser visits Select, navigates to Combobox, returns to Select, then performs eight alternating measured transitions. Two server runs before and two after; each has a second fresh-browser run with server caches warm. Measurement is captured click event to the first animation-frame callback after mounting, a next-frame approximation rather than a compositor presentation timestamp.

| Condition | Before | Candidate |
| --- | --- | --- |
| First navigation after server restart, two runs | 779–841 ms | 598–625 ms |
| Fresh browser, server caches warm, two runs | 280–314 ms | 222–234 ms |
| Warm repeat navigation, pooled median | 73.5 ms | 57.9 ms |
| Warm Select median | 71.2 ms | 56.3 ms |
| Warm Combobox median | 76.1 ms | 59.8 ms |
| Initial script requests | 5 | 5 |
| First-navigation resources, complete trace | 269 / 12.2 MiB | 238 / 9.3 MiB |

Restarted-server medians improve 24.5% / 198 ms; warm-server fresh-browser medians improve 23.2% / 69 ms. Both exceed the predefined 20% and 30 ms threshold. Warm repeat savings are secondary: 15.6 ms does not exceed the absolute threshold. Dev byte counts include unminified output and source maps; these are not production bundle sizes.

Original timing files: `before.json`, `before-2.json`. Repeated baseline: `before-repeat.json`, `before-repeat-2.json`. Candidate: `linked.json`, `linked-2.json`, `linked-repeat.json`, `linked-repeat-2.json`. Earlier `after*` and `resume*` files record intermediate experiments. Early resource lists were truncated by the browser resource timing buffer; use repeated baseline and linked results for byte/request comparisons. The final probe increases that buffer before page load.

No page errors or document reloads occurred in these runs. Heading, sidebar active route, and retained header checks pass. The first two transitions in each run are excluded from warm medians. The server was restarted whenever compiler/bundler source changed, and stopped afterward.

## Verification and remaining blockers

- The new MDX module regression failed on eager component imports before the implementation; its resume variant failed likewise. The new initializer tests failed before linking and now render alternate component shapes and changing props without requesting initializer symbols through the loader.
- Root `pnpm run typecheck`: passed, including after final edits.
- Focused compiler/bundler/router/web run: 248 tests passed. Additional final focused run: 52 tests passed, including computed routing, widget composition and state collisions; these counts overlap.
- Website tests: 43 passed. Sandboxed runs failed in the native watcher with EMFILE; the permitted run passed. Its process reported a shutdown timeout after successful tests.
- Select browser suite: 78 passed.
- Website browser Witness: both sidebar scenarios passed, including destination rendering, theme interaction and rapid Select toggles. `/tmp/markless-nav-website/2026-09-19T19-59-31.058Z/receipt.json`.
- Router dev Witness: startup remains lazy, SPA navigation and destination counter pass. `/tmp/markless-nav-dev/2026-09-19T19-56-24.227Z/receipt.json`.
- Production MDX Witness: direct SSR resume, round-trip SPA navigation, counters, one document and no browser errors pass. `/tmp/markless-nav-mdx-production/2026-09-19T19-59-33.508Z/receipt.json`.
- Website Markless-aware typecheck remains red with 100 errors in `mug-art.tsrx` and `mug-studio.tsrx`, already present before this task.
- Production preload-strategy Witness remains red. Without this optimization it fetches three unplanned chunks after navigation under its slow-network conditions; the candidate fetches four. The failure predates this patch, but the candidate's production preload performance is not verified and the extra dependency step remains unresolved. Baseline receipt: `/tmp/markless-nav-build-before/2026-09-19T19-57-30.100Z/receipt.json`; candidate: `/tmp/markless-nav-build/2026-09-19T19-56-28.513Z/receipt.json`.

The patch is not ready to land while those checks remain red. Cold dev navigation still takes about 600 ms, with first-request Vite compilation and render dependency loading remaining on the path. No new startup prefetch mechanism was added. Restart the website dev server and refresh its tab to exercise the changed compiler. No push or merge was performed.
