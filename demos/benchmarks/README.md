# Markless benchmarks

This package contains the shared runner, result helpers, and baselines for the Markless benchmarks. Each benchmark is a sibling package under `demos/` and owns its fixture, correctness gates, and measurement protocol.

## Measurement policy

Every timed result is accepted only after its benchmark-specific correctness gates pass. Results record the full protocol, raw samples, operating system, architecture, CPU model, Node and pnpm versions, full Git SHA, and dirty-tree status. Forced garbage collection is disabled for server measurements; browser benchmarks record when they request browser garbage collection before samples.

Absolute numbers are machine-local; no cross-framework comparability is implied. Compare latency only on the same OS, CPU, architecture, Node and pnpm versions, and protocol. CI does not compare developer-machine milliseconds.

The `--record` flag writes `baselines/local/<benchmark>.json` only after a passing run. An improvement claim uses `baselines/pairs/<benchmark>/<base-sha>--<candidate-sha>.json`: both worktrees must be clean, both full Git SHAs must match the filename, environment and protocol metadata must match, both raw result payloads must be retained, and repeated measurements must clear the declared noise threshold while correctness remains green. See `baselines/README.md` for the complete file contract.

## SSR throughput

```sh
pnpm --dir demos/benchmarks bench -- ssr-throughput
```

This benchmark measures production `renderToString` throughput for deterministic 50-card and 500-card news pages, parallel async registration, nested waterfall async work, and escape-heavy output. The normal protocol uses a ten-second timed window per case, at least three warmup renders and about one second of warmup, a 200,000-sample cap, and up to 5,000 memory-phase renders without forced garbage collection.

Each case verifies byte-identical output against its expected body before reporting operations per second and latency percentiles. The news cases verify article counts and content, the async cases verify settlement order and output, and the escape-heavy case verifies escaped sentinel content. Memory values are allocator-growth observations, not proof of a leak or its absence.

## Streaming SSR

```sh
pnpm --dir demos/benchmarks bench -- streaming-ssr
```

This benchmark measures production `renderToStream` behavior for ten TSRX async cards. The deterministic `staggered` case resolves cards at five-millisecond intervals through 50 milliseconds and records shell latency, first nonempty chunk latency, and total completion latency. The `all-fast` case resolves every card after about one millisecond and also reports renders per second. Full runs use five warmups and 30 timed renders per case.

Correctness gates verify final HTML, chunk order, card content, and total bytes. Markless has a fixed ten-millisecond first-flush deadline, so boundaries resolved before the deadline render in the shell. Chunk count and total bytes are recorded exactly as emitted as framework-specific metadata.

## News

```sh
pnpm --dir demos/benchmarks bench -- news
```

This benchmark measures a production dual client-and-server build of a deterministic 50-article page. It collects a five-warmup, twenty-sample warm SSR phase and fresh-browser-context samples for resume plus the first deterministic theme-toggle dispatch. The client metric starts immediately before dispatch and ends when the expected DOM mutation commits, so `resume_first_dispatch_ms` includes resume and the first visible update.

Gates require the expected article count, server HTML, DOM adoption, theme change, and zero JavaScript requests after the measured dispatch. MLA-I2 allows only the document, declared modulepreloaded JavaScript, and linked CSS; undeclared requests fail closed. Results also record server HTML bytes, declared preloaded bytes, startup-executed bytes when Chromium coverage supplies them, and `news-analyzer-verdict.json`.

## Async waterfall

Status: GREEN. The production build and ten-level async data path pass their route-integrity, SSR, resume, and update gates.

```sh
pnpm --dir demos/benchmarks bench -- async-waterfall
```

This benchmark measures ten flat TSRX async boundary sites backed by a nested dependency chain of ten `computed(async ...)` nodes. Every node waits a fixed 16 milliseconds. A full run collects ten independent cold samples: each sample uses a fresh page and SSR render, dispatches one real root-state action, waits until the deepest boundary commits `L9:v1`, then measures a second update ending at `L9:v2`.

The cold `ssr_resume_first_dispatch_ms` metric includes resume, first dispatch, all ten dependent settlements, and the deepest DOM commit. The benchmark also reports `update_deepest_boundary_ms` and a waterfall factor against the 160-millisecond serial floor. Gates require exactly ten boundaries, deepest values `L9:v0`, `L9:v1`, and `L9:v2`, no failed arms, a complete bundle-graph preload plan, no undeclared requests, and no code request during the first-dispatch window. Passing runs write `async-waterfall-analyzer-verdict.json`.

## Computed chain

Status: GREEN. The 100-level chain mounts and propagates writes through exact evaluation, DOM, and request gates.

```sh
pnpm --dir demos/benchmarks bench -- computed-chain
```

This benchmark measures propagation through a generated 100-level computed chain. State owners appear at levels 1, 11, 21, through 91; every level derives one `computed()` from its predecessor. Full runs use five warmups, twenty timed samples, repeated shallow, middle, and deep writes, sequential and single-dispatch sweeps, mount, and teardown. Fixture-owned wrappers count evaluations, and MutationObserver records affected DOM nodes and commit batches.

Gates require shallow, middle, and deep writes to affect exactly 100, 50, and 10 levels. A sequential sweep must perform 550 evaluations in ten commit batches. Each single-dispatch sweep must perform the current expected 550 evaluations while coalescing 100 final DOM writes into one batch. An equal write must perform no work, and timed propagation windows permit zero requests. The analyzer receipt contains MLA-I2-NETWORK and MLA-EXT-CHAIN-GATES. Reducing a single-dispatch sweep from 550 evaluations to 100 without changing its other gates remains the named improvement hypothesis.

## Memo wall

```sh
pnpm --dir demos/benchmarks bench -- memo-wall
```

This benchmark measures two deterministic 1,000-row keyed tables across mount, equal-parent-write, one-row-change, and fan-out operations. Full runs use five warmups, twenty timed samples, ten repetitions for equal and one-row writes, five fan-out repetitions, a five-millisecond yield, and browser garbage collection before each sample.

Fixture counters and DOM observations require equal writes to produce zero computed evaluations and zero mutations, one-row writes to touch exactly one Row-to-Inner-to-Leaf chain and three text nodes, and each fan-out write to produce exactly 3,000 text writes in one branch with zero work in the other. Sampled cells must satisfy `inner === value + 1` and the expected leaf value after every operation. The row-data fan-out is not context semantics: compiled TSRX does not yet support the intended `shared()` shape, and expression bindings inside keyed rows remain restricted to the proven precomputed-field form. Timed windows permit zero requests, and the receipt contains MLA-I2-NETWORK and MLA-EXT-MEMO-GATES.

## Dbmon

```sh
pnpm --dir demos/benchmarks bench -- dbmon
```

This benchmark measures a deterministic seeded 1,000-row database table across mount, full tick, 100-row partial tick, all-new-key remount, keyed reorder, and teardown. Full runs use ten warmups, 30 samples, browser garbage collection, and a five-millisecond yield. Timing ends only after each operation's observable DOM effect commits.

Semantic gates verify row and cell counts, surviving-key node reuse, replacement for new keys, changed sort order, and empty teardown. Exact mutation gates require 7,000 text writes for a full tick and 700 for a partial tick. Content snapshots require 5,500–6,000 changed values for a full tick and 550–600 for a partial tick; the committed deterministic corpus produces 5,968 and 596. Timed windows permit zero requests, and the receipt contains MLA-I2-NETWORK and MLA-EXT-DBMON-GATES. The pinned pair under `baselines/pairs/dbmon/` records why a live-node identical-value suppression attempt was reverted.

## TodoMVC

```sh
pnpm --dir demos/benchmarks bench -- todomvc
```

This benchmark measures add-100, toggle-all on and off, complete-25, filter cycling, edit-10, clear-completed, destroy-25, and DOM-comment operations against the same TodoMVC source used by the bundle-size benchmark. Every preparation and measured change uses the fixture's real keydown, double-click, or click handler. One complete operation pass warms the fixture, and full runs collect eight samples per operation.

The harness waits for row count, completed count, filter state, or label text to commit before stopping each clock. Gates verify the scripted todo state after every sample, require a stable comment count across eight observations, and permit zero requests during timed windows. The receipt contains MLA-I2-NETWORK and MLA-EXT-TODOMVC-GATES.

## Chat stream

```sh
pnpm --dir demos/benchmarks bench -- chat-stream
```

This benchmark measures deterministic streaming updates over a ten-message conversation, a 200-message history, repeatable 240-to-432-token replies, and conversation switching. It sends four replies in eight-token batches, repeats the workload in 64-token batches, appends two long-history replies, switches conversations five round trips, and samples DOM comments. One complete pass warms every operation; full runs collect eight DOM-verified samples per operation.

The harness dispatches fixture controls and waits for message count, streaming markers, and remaining-token state to commit. Gates require zero remaining tokens, no streaming message after completion, stable comment counts, correct conversation content, and zero timed-window requests. The receipt contains MLA-I2-NETWORK and MLA-EXT-CHAT-GATES.

## Bundle size

```sh
pnpm --dir demos/benchmarks bench -- bundle-size
```

This benchmark builds three production Markless applications once each: the keyed JS framework benchmark source, TodoMVC, and chat stream. Every build uses the production Markless Vite plugin, an ES2022 target, and one Oxc minification pass. It measures only emitted JavaScript and reports raw, best-level gzip, and maximum-quality brotli bytes for total, application, and framework/runtime buckets.

Rolldown module provenance assigns modules under each fixture source root to application code; Markless packages, dependencies, and virtual modules count as framework code. The production `bundle-graph.json` must exist and be nonempty. A mixed-provenance chunk, an empty application bucket, an empty framework bucket, or totals that do not equal their buckets fails the benchmark.

## Codegen size

```sh
pnpm --dir demos/benchmarks bench -- codegen-size
```

This benchmark measures compiler output for a fixed 14-file TSRX corpus covering events, component composition, keyed flow, dynamic classes, forms, async boundaries, `state()` and `computed()`, element handles, conditional and switch flow, spread attributes, nested markup, capture events, and multiple state writes. It compiles each file through the compiler package's main programmatic export and measures the direct client output when available, otherwise the CSR output, plus SSR output.

For every file and mode, the result records source raw/gzip bytes and compiled raw/minified/gzip bytes after one Oxc minification pass. Aggregate values are sums of the per-file values. Every corpus filename and SHA-256 hash is embedded in both mode results; a corpus mismatch, compiler diagnostic, empty output, invalid byte count, or aggregate mismatch fails validation.

## Derived reconcile

Status: RED. It records the O(N) re-check behaviour that derived reconciliation is meant to remove.

```sh
pnpm --dir demos/benchmarks bench -- derived-reconcile
```

This benchmark counts DOM-expression re-checks, never milliseconds. It builds a production-shaped runtime graph in Node — state cells plus a derived node — and registers one `view-dom-update:*` subscription per DOM expression, exactly as the resume runtime does for a DOM update record. One re-check is one run of such a subscription, so the count is the oracle; time would only hide the growth.

Four modes run at N = 100 and N = 1,000: `list-keyed` (rows `{ id, title, completed }` with a declared `id` key), `list-identity` (the same rows with no declared key), `object-fields` (a derived record `k0..kN` built from a state array), and `list-keyed-compute` (the keyed list behind a `compute`-carrying node instead of a demand subscription that commits through `graph.write`). Each case takes a warm mount flush, makes exactly one single-field change, and flushes once.

The gates are that every case delivers the changed value to its own subscription, and that `reChecks` at N = 100 equals `reChecks` at N = 1,000 for each mode. Expected absolute counts once reconciliation lands — one for keyed lists, two for identity lists (both fields of the replaced row), one for record fields — are recorded as metrics, not gates, so they cannot be quietly retuned. Today a recomputed derived node dirties its whole root path, so each list mode re-checks 200 expressions at N = 100 and 2,000 at N = 1,000, and each record mode 100 against 1,000; the run reports `failed` and exits 1.

## Effectful list status

An effect-lifecycle benchmark is SKIPPED by owner adjudication (2026-07-13), the same reasoning
as the portal and context skips: markless has no effects by design - `state()` and `computed()`
are the reactive model, and element behaviors via `element()`/`attach` are a lifecycle surface,
not an effects system. A benchmark built on translating another framework's effect semantics
would measure the translation rather than the framework. Keyed rows DO support per-row element
handles and attach behaviors (browser-proven contract in the framework test suite: distinct
hosts per key, attach exactly once per creation, zero lifecycle on reuse and reorder,
exactly-once ordered cleanups); if row behaviors gain real application usage, a timing
benchmark at 1,000-row scale is a small follow-up, and correctness is guarded by the contract
test meanwhile.

