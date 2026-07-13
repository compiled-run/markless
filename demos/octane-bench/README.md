# Markless Octane benchmark umbrella

This package holds production-path benchmarks for Markless. Each lane owns its fixture, correctness gates, measurement protocol, and machine-readable result.

## SSR throughput

Run the SSR throughput lane with:

```sh
pnpm --dir demos/octane-bench bench -- ssr-throughput
```

Add `--smoke` for a cheap one-second-per-case verification, or `--record` to write `baselines/local/ssr-throughput.json` after a green run. The normal protocol uses a 10-second sample window per case, a warmup of at least three renders and about 10% of that window, a 200,000-sample cap, and up to 5,000 memory-phase renders without forced garbage collection.

## Lane status: signal-favoring (PARKED RED)

The signal-favoring lane is implemented and node-tested but currently fails at mount with
`Unknown async symbol` at octane's mandated 100-level topology: markless's production symbol
pipeline breaks at runtime (90 levels mount; 100 do not). The previously documented build
failure for a single 211-symbol module was the same packed resolver-table defect as framework
finding 8 and is fixed; the remaining mount failure is separate PM work. The topology is not
shrunk because that would fake comparability. The lane turns green when its mount ceiling is
fixed; its mount gate is that fix's proof.

## Lane status: async-waterfall (UNPARKED FOR BUILD)

The async-waterfall lane is implemented, node-tested, and green for `node bench.mjs
async-waterfall --build-only` at octane's mandated ten-level topology. Framework finding 8 is
fixed: OXC packed dense resolver URL arrays into a comma-joined string, and the bundler now
recovers every generated symbol row from that representation. The focused 8-by-8, 8-by-9,
16-by-1, and 10-by-10 build matrix passes, including all 31 resolver rows for ten by ten. Nested
async boundary markup remains separately rejected as `nested-boundary-unsupported`, so the ten
levels are flat siblings backed by a true ten-node async dependency chain. The lane is restored
to this package's default `build` script. Browser measurement and the first performance baseline
remain PM work and are not part of this build-only unpark.

## Lane status: effectful-list (PARKED RED, no lane directory)

The effectful-list adaptation translates octane's per-row effect/ref pairs to per-row
`element()` handles plus `attach` behaviors, and the compiled keyed `@for` pipeline rejects that
row shape outright: `MARKLESS_ELEMENT_HANDLE_DUPLICATE`, repeat gate `supported: false` with
reason `unsupported-row-binding`, `MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT`, and an SSR
output whose table body is empty. Implementing the lane today would silently omit every row and
all lifecycle records, so no lane directory exists. The lane starts when keyed rows support
element handles and attach records; the minimal repro is a keyed row of the form
`<tr el={row} attach={(host) => { return () => {}; }}>`.

## Measurement policy

Absolute latency baselines are machine-profiled observations. Compare a local baseline only with a run on the same OS, CPU, architecture, Node and pnpm versions, and protocol. CI never compares developer-machine milliseconds.

Improvements are reported as a pinned pair: a clean base commit and a clean candidate commit, both identified by full Git SHA and measured with identical environment and protocol metadata. The pair keeps both raw result payloads, its calculated delta, and the noise threshold used to decide whether the movement is meaningful. See `baselines/README.md` for the file contract.

The `ssr-throughput` lane covers deterministic 50-card and 500-card news pages, parallel async registration, nested waterfall async work, and escape-heavy output through a real production Markless SSR build. Octane's tuned-TSRX versus plain-TypeScript deoptimization cases are intentionally absent because plain-TypeScript render authoring is not a supported Markless mode. These numbers describe Markless only and do not imply cross-framework or Octane comparability.

## Streaming SSR

Run the streaming lane with:

```sh
pnpm --dir demos/octane-bench bench -- streaming-ssr
```

The `streaming-ssr` lane builds a production Node-loadable SSR fixture and measures `renderToStream` for ten TSRX async cards. The deterministic `staggered` scenario resolves cards at 5 ms intervals through 50 ms and reports shell/first-nonempty-chunk latency plus total completion latency. The `all-fast` scenario resolves every card after about 1 ms and additionally reports renders per second. Full runs use five warmups and 30 timed renders per scenario; `--smoke` uses one warmup and three timed renders.

Markless has a mandated, non-configurable 10 ms first-flush deadline. Boundaries that resolve before that deadline render inline in the shell. As a result, `all-fast` typically completes in a single flush. Chunk count and total bytes are recorded as framework-specific metadata exactly as emitted; they are not normalized and should not be compared as equivalent framing work across frameworks. The timing results describe Markless's production behavior and do not by themselves establish cross-framework comparability.

## Production news

Run the node-verifiable production build and warm SSR phase with:

```sh
pnpm --dir demos/octane-bench bench -- news --ssr-only
```

Run the complete lane on a host with Chromium available with:

```sh
pnpm --dir demos/octane-bench bench -- news
```

The lane reuses `ssr-throughput`'s deterministic 50-article corpus and ports the production dual-build, five-warmup/twenty-sample warm SSR phase, static HTTP splice, fresh-browser-context sampling, article-count check, DOM-adoption check, and theme-toggle interaction from Octane's `benchmarks/news/gen.mjs`, `run.mjs`, and `octane-tsrx` target. Both client and server outputs are production Vite builds.

The client timing is honestly named `resume_first_dispatch_ms`: it starts immediately before the deterministic theme-toggle dispatch and ends when the expected DOM mutation commits, including Markless resume and the first dispatched action. It is a Markless-specific resume measurement and is not presented as equivalent to another framework's eager client-startup measurement. A JavaScript request initiated after dispatch fails the sample.

Each full result also records server HTML bytes, transferred bytes for the document's declared modulepreloaded JavaScript, and startup-executed bytes when the Chromium V8 coverage driver supplies them. MLA-S1 receives only `action` observations. MLA-I2 allows exactly the document, the document's modulepreloaded JavaScript, and its linked CSS; an undeclared request fails closed. The full run writes `dist/results/news-analyzer-verdict.json` through `@markless/analyzer`'s verdict contract.

`playwright` is a declared development dependency. If dependencies have not been refreshed since this lane was added, the benchmark owner must run `pnpm install` and ensure Chromium is installed before the full command. Use `--record` only after the complete lane passes to write the local baseline.

## Async waterfall

Build the production SSR-and-resume fixture without launching a browser:

```sh
pnpm --dir demos/octane-bench bench -- async-waterfall --build-only
```

The benchmark owner runs the complete Playwright phase on quiet hardware with:

```sh
pnpm --dir demos/octane-bench bench -- async-waterfall
```

This lane renders ten flat sibling TSRX async boundary sites backed by a true nested dependency chain of ten `computed(async ...)` nodes (nested boundary MARKUP is rejected by the compiler as `nested-boundary-unsupported`; the waterfall semantics live in the data dependencies). Each node waits for a fixed 16 ms simulated delay. The full protocol collects ten independent cold samples with no ordered warmup population: every sample opens a fresh page served from a fresh SSR render and page-local async graph, dispatches one real root-state click, and waits through a MutationObserver predicate until the deepest boundary commits `L9:v1`. That same page then contributes one second-click update sample ending at `L9:v2`.

The cold metric is named `ssr_resume_first_dispatch_ms`; it includes resume, the first dispatched action, the ten dependent async settlements, and the deepest observable DOM commit. The lane also reports `update_deepest_boundary_ms` and a waterfall factor against the ten-level serial floor of 160 ms. It does not claim equivalence with another framework's client-startup measurement.

The production server passes the built resume-entry chunk to `renderToString`, emits the complete bundle-graph preload plan, and declares the document, module entry script, every modulepreloaded script, and linked CSS for MLA-I2. Any code request in a first-dispatch action window fails MLA-S1. Exact boundary count, deepest values at versions zero through two, absence of failed arms, and both network policies must pass before the lane writes `dist/results/async-waterfall-analyzer-verdict.json`. No baseline is recorded by the implementation workflow.

## Signal-favoring propagation

Check the generated fixture without launching a browser:

```sh
pnpm --dir demos/octane-bench bench -- signal-favoring --gen-check
```

Build the production CSR fixture with:

```sh
pnpm --dir demos/octane-bench bench -- signal-favoring --build-only
```

The benchmark owner runs the complete Playwright phase and records a local baseline with:

```sh
pnpm --dir demos/octane-bench bench -- signal-favoring --record
```

This lane ports Octane's generated 100-component signal-favoring chain, five warmups, twenty timed samples, inner repetitions, short sample yields, browser-GC request, shallow/middle/deep writes, forward per-write flush, one-flush forward and reverse sweeps, mount, and teardown. Ordinary TSRX `state()` owners appear at levels 1, 11, 21, through 91. Every level derives one `computed()` from its predecessor, and fixture-owned wrappers count those evaluations. MutationObserver records the reactive DOM nodes affected and the number of observer batches.

Correctness gates require exact computed and DOM work: shallow, middle, and deep writes affect 100, 50, and 10 levels; a per-write sweep performs 550 evaluations and ten mutation batches; either one-flush sweep performs 100 evaluations in one mutation batch; and an equal write performs no work. The production client uses `@markless/web`'s `render` export. Its static server allows only the document and production build assets, primes lazy render imports before timing, and fails MLA-I2 if any request enters a measured propagation window. The receipt contains MLA-I2-NETWORK and MLA-EXT-SIGNAL-GATES; MLA-S1 does not apply because this CSR lane is not a resume or preload oracle.

## Memo wall

Build the production CSR fixture with:

```sh
pnpm --dir demos/octane-bench bench -- memo-wall --build-only
```

The benchmark owner runs the complete Playwright phase and records a local baseline with:

```sh
pnpm --dir demos/octane-bench bench -- memo-wall --record
```

This lane ports Octane memo-wall's two deterministic 1,000-row branches with mount, equal-parent-write, one-row-change, and fan-out operations. The walls are inline keyed `@for` tables (the JSFB-proven authoring shape) that start empty and fill via dispatched clicks — the fill dispatch is the measured wall-mount operation. Exact-work evidence is MutationObserver text-mutation counts with truthful expectations: equal writes prove ZERO work, a one-row change proves exactly 3 cell writes, and the fan-out (a theme field travelling in row data) proves exactly 3,000 writes under the current unconditional row writer — 1,000 of them change visible content (the leaf cell) and 2,000 rewrite identical values. Dropping the fan-out to 1,000 remains the suppression hypothesis; the naive live-node-compare attempt was measured and reverted (see the dbmon section).

Two honesty notes. First, `shared()` (the context-translation the plan mandated) has no compiled-TSRX support yet, and single-source cross-state fan-out into keyed rows renders empty — both are parked framework findings; the row-data fan-out here is explicitly NOT context semantics. Second, several constructs silently drop or empty compiled output (call-expression `state()` initializers, module-scope calls / template literals / non-row state references inside row expressions); this fixture documents the proven shape and the goal notes carry the full forensics. In particular, expression bindings inside keyed rows (`{row.value + 1}`) compile to broken member paths that render empty cells (framework finding 10) — this lane originally shipped with that defect and its count-only gates missed it, so every cell now binds a precomputed row field (`inner`, `leaf`) and the gate additionally asserts DOM-internal content consistency (`inner === value + 1`, `leaf === value + theme bumps`) on sampled rows after every operation.

Full runs use five warmups, twenty timed samples, ten inner repetitions for equal and one-row writes, five repetitions for the row-data fan-out, a five-millisecond yield, and browser garbage collection before each sample. Fixture-owned counters and MutationObserver tallies gate every timing. Equal writes require zero computed evaluations and zero DOM mutations; one-row writes require exactly one targeted Row→Inner→Leaf chain and three DOM text mutations; each fan-out write requires exactly 3,000 DOM text writes (1,000 leaf-value changes carried in row data plus 2,000 identical-value rewrites under the unconditional writer) with zero work in the other branch. A failed count produces a failed result and nonzero exit.

The production client reuses the signal-favoring static preview server, declares the document and every production build asset, and permits zero requests during timed windows. Its verdict receipt contains MLA-I2-NETWORK and MLA-EXT-MEMO-GATES. MLA-S1 does not apply because this is a CSR propagation lane rather than a resume oracle.

## Dbmon

Build the production CSR fixture with:

```sh
pnpm --dir demos/octane-bench bench -- dbmon --build-only
```

The benchmark owner runs the complete Playwright phase and records a local baseline with:

```sh
pnpm --dir demos/octane-bench bench -- dbmon --record
```

This lane ports Octane dbmon's deterministic seeded generator and six operations: dispatched empty-to-1,000-row mount, full tick, 100-row partial tick, all-new-key remount, keyed reorder, and teardown. Each row has seven bound text cells. An untimed semantic pass verifies row and cell counts, keyed node reuse for surviving keys, replacement for new keys, changed sort order, and an empty root after teardown. Full runs use ten warmups, 30 samples, browser garbage collection, and a five-millisecond yield. Because delegated compiled-CSR handlers run on a later task than the dispatching click and `graph.flush()` resolves before the DOM journal applies, every timed window waits on the operation's observable DOM effect (mutation-count thresholds for ticks, first-row identity for remounts, row order for sorts) before the clock stops.

MutationObserver evidence uses the current compiler-proven behavior: replacing a row object rewrites every one of its seven bound texts, including the stable database name, so the exact gates are 7,000 full-tick and 700 partial-tick text mutations. Each tick additionally snapshots all 7,000 cells and requires the number of cells whose VALUE changed to sit in a 5,500–6,000 (full) / 550–600 (partial) band — with the current seeded corpus a full tick changes 5,968 values and a partial tick 596 — so a silently broken row writer can never pass on counts alone. Per-field identical-value suppression remains this lane's score-improvement hypothesis: a naive implementation comparing against the live text node was measured and REVERTED (pinned pair under `baselines/pairs/dbmon/`: full-tick p50 regressed +17.4% because 7,000 per-cell reads cost more than the 32 writes they saved); a future attempt should compare raw prior-item fields so stable fields also skip stringification. Dynamic threshold classes from Octane's fixture are not rendered because dynamic keyed-row attributes are outside the currently proven Markless row shape; the deterministic count and elapsed values still churn in all six non-name cells.

The production client reuses the static build server, declares the document and all emitted assets, and permits zero requests during every timed window. The verdict receipt contains MLA-I2-NETWORK and MLA-EXT-DBMON-GATES; MLA-S1 does not apply to this CSR lane.

## TodoMVC

Build the production CSR fixture with:

```sh
pnpm --dir demos/octane-bench bench -- todomvc --build-only
```

The benchmark owner runs the complete Playwright phase and records a local baseline with:

```sh
pnpm --dir demos/octane-bench bench -- todomvc --record
```

This lane reuses the TodoMVC source measured by bundle-size and ports Octane's add-100, toggle-all on and off, complete-25, filter cycle, edit-10, clear-completed, destroy-25, and DOM-comment operations. Every preparation and measured change goes through the fixture's actual keydown, dblclick, or click handler; the harness has no state mutation hook. Preparation is untimed, one complete operation pass warms the fixture, and full runs collect eight samples per operation. Delegated compiled-CSR handlers run on a later task than the dispatching script and `graph.flush()` resolves before the DOM journal applies, so the harness waits on each interaction's observable DOM effect (row count, completed count, label text) through a MutationObserver hook before the clock stops; timing therefore ends at the committed DOM state a user would see, and the DOM is checked after every sample.

Visibility, completion, and editing travel in row data. The keyed row uses static attributes plus row-only text bindings because dynamic keyed-row attributes and nested row branches are not compiler-proven yet. This changes the evidence selectors but not the scripted todo state transitions. The comment count is sampled eight times and must remain stable. The production client permits zero timed-window requests, and its verdict receipt contains MLA-I2-NETWORK and MLA-EXT-TODOMVC-GATES.

## Chat stream

Build the production CSR fixture with:

```sh
pnpm --dir demos/octane-bench bench -- chat-stream --build-only
```

The benchmark owner runs the complete Playwright phase and records a local baseline with:

```sh
pnpm --dir demos/octane-bench bench -- chat-stream --record
```

This lane reuses the chat-stream source measured by bundle-size. A fixed Mulberry32 seed creates a ten-message conversation, a 200-message history, and repeatable 240-to-432-token replies without `Math.random`. The harness sends four replies in eight-token batches, sends the same workload in 64-token batches, appends two replies to the long history, switches between conversations five round trips, and counts DOM comments. One full pass warms every operation and full runs collect eight DOM-verified samples per operation.

The fixture exposes `window.__pump(k)`, `window.__reset()`, and the `window.__benchSettled(predicate)` commit-wait used by the harness. The hooks dispatch hidden fixture controls and wait for each dispatch's observable DOM effect (message count, streaming markers, the pump button's remaining-tokens attribute) instead of trusting `graph.flush()`, which resolves before the DOM journal applies; there are no fixture timers or direct state writes from the harness. The composer prompt and pump-size fields are uncontrolled inputs read directly by their click handlers, because a keyed-repeat component drops its export silently when any non-row state is bound outside the loop (see the framework findings note). Message bodies are precomputed row fields rather than nested segment rows, keeping keyed expressions within the proven row-only shape. Every stream gate requires a zero token remainder and no streaming message. The comment count must remain stable, timed windows permit zero requests, and the verdict receipt contains MLA-I2-NETWORK and MLA-EXT-CHAT-GATES.

## Bundle size

Run the deterministic Node-only production builds with:

```sh
pnpm --dir demos/octane-bench bench -- bundle-size
```

The lane builds three Markless applications once each: the existing keyed JS framework benchmark source, the TodoMVC lane fixture, and the chat-stream lane fixture. The latter two start their keyed collections with literal empty arrays and populate them only from dispatched handlers. Bundle-size and the browser lanes therefore measure the same source files rather than forked copies. This preserves the compiler-proven keyed-row shape documented by memo-wall.

Every build uses the production Markless Vite plugin, an ES2022 target, and one normalized Oxc minification pass. Oxc is the repository's Vite/Rolldown-native equivalent of Octane's normalized one-pass esbuild setting; the lane does not introduce esbuild alongside the repository toolchain. Only emitted JavaScript is measured. Raw, best-level gzip, and maximum-quality brotli bytes are reported for the total, application modules, and framework/runtime modules. Compression is applied independently to each emitted JavaScript file and then summed.

Attribution comes from Rolldown's module provenance for each emitted chunk. Modules under each fixture's application source root count as application code. Markless package modules, dependencies, and all virtual modules count as framework code. The production `bundle-graph.json` must also exist and be non-empty. Non-recursive code-splitting keeps application dependencies imported by lazy symbols in the application bucket. A mixed-provenance chunk or an empty application/framework bucket fails the lane instead of producing a score.

These are Markless production-build measurements, not claims that byte buckets or application behavior are cross-framework equivalent.

## Codegen size

Run the deterministic compiler corpus with:

```sh
pnpm --dir demos/octane-bench bench -- codegen-size
```

The lane owns a fixed 14-file TSRX corpus covering events, component composition, keyed flow, dynamic classes, forms, async boundaries, `state()` and `computed()`, element handles, conditional and switch flow, spread attributes, nested markup, capture events, and multiple state writes. It calls the compiler package's main programmatic export once per file and measures both official render outputs: the direct client module when available (otherwise the compiler's CSR module) and the SSR module.

For every file and each mode, the result records source raw/gzip bytes and compiled raw/minified/gzip bytes. Compiled gzip is taken after one Oxc minification pass. Aggregate values are sums of those per-file values. Every corpus filename and SHA-256 hash is embedded in both mode results; changing any file starts a new baseline series, and a hash mismatch fails validation. The lane reports code generation size only and makes no cross-language expansion-ratio comparability claim.
