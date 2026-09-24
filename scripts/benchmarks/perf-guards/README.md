# Performance guards

Deterministic checks that keep Markless's measured first-use and loading wins from quietly regressing. They build the interaction benchmark app (`demos/interaction-benchmark/apps/markless`) and the docs site (`website`), serve each production build locally, and inspect it with Chromium. They count bytes, fetch rounds, requests, and executed code. They never time anything, so they give the same answer on a busy CI machine.

```sh
pnpm perf:guard          # the vitest lane that runs at the end of `pnpm test` (about 2-3 minutes)
pnpm perf:guard:check    # the same checks as a plain report; add --no-build to reuse existing builds
pnpm perf:guard:accept <guard> "<subject>" --reason "<one line>"   # re-anchor after an intended cost
pnpm bench:interaction:guard   # optional timing check against a saved baseline build (not in pnpm test)
```

Ports 4221 (benchmark app) and 4222 (docs) must be free; `MARKLESS_PERF_GUARD_PORTS=<bench>,<docs>` picks others.

## What is gated: framework overhead, never app size

Adding application code must never fail a guard; only a heavier framework may. Every shipped byte is classified from the build's own `build/byte-attribution.json` (emitted by `@markless/bundler` from Rolldown's per-module rendered lengths):

- **runtime**: modules of the framework runtime packages (`web`, `core`, `runtime`, `router`, `serializer`), keyed the way the compiler's demand maps name them (`web/resume-branches`).
- **glue**: code the compiler and bundler generate around the app: resume, render-data and resolver modules, payload tables, loaders, and the wrapper bytes the bundler adds to each chunk.
- **author**: the app's own modules and handler (symbol) modules. The per-handler wrapper inside a symbol module is priced by G12, not here.
- **third-party**: everything else from `node_modules`.

Whole-app byte totals (G1 bytes, G6, the music-player stage bytes, executed bytes at load, per-interaction app bytes) are printed with this split but are informational. The framework's share is gated three ways:

- **G10 per-feature runtime cost:** each runtime module's rendered bytes (before minification, so neighbours in its chunk cannot move it) against its anchor. The failure names the module and the compiled features (record kinds, actions, symbol kinds) that demand it.
- **G11 pay-per-use:** a runtime module that any compiled demand names (a feature module) may ship in a page's download only when a demand map of that page's own modules names it.
- **G12 per-construct glue:** the bytes the compiler emits per event handler, text binding, `@if`, keyed `@for` and async boundary, measured as the marginal cost of one more instance on a minimal fixture (`construct-glue.mjs`).

## What each guard protects

Two kinds of check are used:

- **Invariant:** a property that holds by design. A regression has to be fixed. It cannot be accepted.
- **Budget:** a quantity with an anchor, which is the value measured when the anchor was recorded. A change fails only if it adds a meaningful amount of user time. The time is estimated with the cost model fitted by the interaction-benchmark granularity sweep (goal packed-delivery-performance, `notes/T055-granularity.md`) on the constrained profile (150 ms RTT, 5 Mbps, 4x CPU): about **162 ms per extra serial fetch round** and about **2 ms per gzip KB** on the critical path. Small growth from real features passes without anyone touching the anchors.

| Guard                      | Kind                               | Why it exists (the regression a reader would notice)                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1 critical path           | invariant: 1 fetch round           | Every file a page needs to boot must be requested in the first round. A file found only after its importer arrives costs one round trip, about 162 ms on a slow phone. The route's bytes are reported with their runtime / glue / author / third-party split, not gated.                                                                                                                                                                              |
| G2 zero click-time JS      | invariant                          | Code that is fetched when a control is first used costs at least one round trip before anything happens. Every distinct control on each benchmark route, and on a sample of docs pages, gets a trusted first click (text fields also get one typed character, selects pick another option). Each input must fetch 0 JS files.                                                                                                                         |
| G3 first-use execution     | budget: +25%                       | The JavaScript that runs between an input and its response is main-thread time the reader waits through. V8 precise coverage measures executed source, functions called, and module initializers run for the counter, toggle, tab, search, dialog, and settings actions. The build fails when an action's executed source grows by more than 25% (and by more than 2 KB), or when noticeably more modules initialize.                                 |
| G4 lean dispatch coverage  | invariant with an allowlist        | Actions on a lean dispatch path (scalar or row, and later closure) respond without booting the full runtime. The counter went from 57 to 46 ms early and from 28 to 12 ms settled when it became lean. The compiler's `execution-demand.json` records each action's path. The guard fails when an action that was lean falls back to full resume, unless an `allowFullResume` entry gives the reason. Every run lists which actions take full resume. |
| G5 same-task dispatch      | invariant                          | After the runtime has started, a handler must change the DOM inside the task that delivered the input, including the first use of code the page preloaded: a branch arm, a list's `@empty` arm, a dialog, a computed refresh. A task hop lets the browser render a frame first; removing it took the records dialog from 79 to 52 ms. A probe checks that the named DOM change arrives before a message posted at input time.                         |
| G6 over-preload waste      | report                             | Preloaded code that neither load nor any control ever executes. Each control is used once on its own fresh page with V8 block coverage; the never-executed share of every preloaded file is reported in gzip bytes. It grows with app code, so it is informational.                                                                                                                                                                                   |
| G7 compile hints           | invariant                          | `//# allFunctionsCalledOnLoad` makes Chromium compile a whole file while it streams. It must stay on packs a route preloads and never land on lazily loaded code, which would then be compiled when it may never run.                                                                                                                                                                                                                                 |
| G8 navigation in one round | invariant                          | Client navigation must fetch the next route's code in the single burst the link's intent preload starts. A file discovered after another one arrives costs one more round trip. A document reload in place of client navigation also fails.                                                                                                                                                                                                           |
| G9 renames stay local      | invariant                          | Built chunks import each other through the import map every page carries, so a chunk's bytes name no other chunk's hashed file. A chunk that did would be re-downloaded whenever that file changed: before this, a one-line edit to a shared helper re-downloaded 302 of the docs home page's 336 KB. The guard scans every built chunk on both sites.                                                                                                |
| G10 runtime per feature    | budget: +128 B rendered per module | See above. A new runtime module fails until accepted; a removed one is reported.                                                                                                                                                                                                                                                                                                                                                                      |
| G11 pay-per-use            | invariant                          | See above. Checked on every benchmark route's download.                                                                                                                                                                                                                                                                                                                                                                                               |
| G12 glue per construct     | budget: +24 B per instance         | See above.                                                                                                                                                                                                                                                                                                                                                                                                                                            |

Each failure message names the site, route or action, the measured value, the anchor, the estimated user cost, and, for budgets, the exact command that accepts it.

## Re-anchoring legitimately

Anchors live in `anchors.json`. They are the values measured on the tree where they were last accepted, not limits to raise until the build passes.

1. Only re-anchor when a change **intends** the cost (a feature that needs the bytes or the work) or **lands a win** (lower numbers). A win is locked in by re-anchoring in the same change set.
2. Run one command. It re-measures, updates that one subject, and appends a dated `history` entry with your reason:
    ```sh
    pnpm perf:guard:accept runtime "web/resume-branches" --reason "branches learn nested arms"
    pnpm perf:guard:accept construct "keyed @for" --reason "rows carry their key for reorder"
    pnpm perf:guard:accept execution dialog --reason "dialog now validates on open"
    pnpm perf:guard:accept lean "/" --reason "toggle reads an element handle, which lean dispatch cannot serve"
    ```
    Guards: `runtime`, `construct`, `execution`, `lean`, or `all`. Use `"*"` as the subject for every subject of that guard. `--from-last` reuses the measurement the last `pnpm perf:guard` run saved instead of measuring again.
3. Commit `anchors.json` with the change that caused the move.

Never re-anchor to make an unexplained regression pass. Invariants (G1 rounds, G2, G5, G7, G8, G9, G11) cannot be accepted. `knownViolations` holds only violations that already existed when a guard was introduced. Each entry carries its reason and is reported on every run. Remove it once the violation is fixed; the report says when that happens.

## Timing check (optional)

`pnpm bench:interaction:guard` compares this tree with a saved baseline build of the benchmark app. It uses the interaction runner with the constrained profile in Chromium, 10 alternating visits per case, on the key cases: counter, toggle, tab, search, dialog, settings, and navigation. A case counts as slower only if its median `inputToResponseMs` is more than 25% **and** more than 30 ms above the baseline, or if it loses successful visits. Use it for nightly or manual runs on a quiet machine, never as a merge gate.

```sh
pnpm bench:interaction:guard --save-baseline   # on the reference tree
pnpm bench:interaction:guard --lock /private/tmp/mlbench-timing.lock   # later, on the tree under test
```

## Files

- `config.mjs`: routes, actions, probes, the cost model, and budgets.
- `measure.mjs`: builds, serves, and measures.
- `evaluate.mjs`: compares a measurement with the anchors.
- `attribution.mjs`: reads `byte-attribution.json` and `execution-demand.json`; byte split, runtime module sizes, pay-per-use.
- `construct-glue.mjs`: the minimal construct fixtures behind G12.
- `cli.mjs`: `check`, `measure`, and `accept`.
- `evaluate.test.ts`: proves each guard fails with a clear message.
- The shared browser helpers are `demos/interaction-benchmark/runner/lib/controls.mjs` (control discovery and first-use visits) and `coverage.mjs` (V8 coverage windows).
- The vitest lane is `packages/bundler/test/perf-guards/`.
