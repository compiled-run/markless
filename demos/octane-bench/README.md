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
pipeline breaks near ~200 compiled symbols (90 levels mount; 100 do not; a single 211-symbol
module also fails at build). The topology is not shrunk because that would fake comparability.
The lane turns green when the framework ceiling is fixed; its mount gate is that fix's proof.

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

This lane ports Octane memo-wall's two deterministic 1,000-row branches with mount, equal-parent-write, one-row-change, and fan-out operations. The walls are inline keyed `@for` tables (the JSFB-proven authoring shape) that start empty and fill via dispatched clicks — the fill dispatch is the measured wall-mount operation. Exact-work evidence is MutationObserver text-mutation counts with truthful expectations: equal writes prove ZERO work, a one-row change proves exactly 3 cell writes, and the fan-out (a theme field travelling in row data) proves 3,000 writes — markless rewrites every bound cell of a changed row object, so per-field identical-value suppression (3,000 → 1,000) is a named score-improvement hypothesis.

Two honesty notes. First, `shared()` (the context-translation the plan mandated) has no compiled-TSRX support yet, and single-source cross-state fan-out into keyed rows renders empty — both are parked framework findings; the row-data fan-out here is explicitly NOT context semantics. Second, several constructs silently drop or empty compiled output (call-expression `state()` initializers, module-scope calls / template literals / non-row state references inside row expressions); this fixture documents the proven shape and the goal notes carry the full forensics.

Full runs use five warmups, twenty timed samples, ten inner repetitions for equal and one-row writes, five repetitions for shared fan-out, a five-millisecond yield, and browser garbage collection before each sample. Fixture-owned counters and MutationObserver tallies gate every timing. Equal writes require zero computed evaluations and zero DOM mutations; one-row writes require exactly one targeted Row→Inner→Leaf chain and three DOM text mutations; each `shared()` write requires exactly 1,000 targeted leaf evaluations and DOM mutations with zero work in the other branch. A failed count produces a failed result and nonzero exit.

The production client reuses the signal-favoring static preview server, declares the document and every production build asset, and permits zero requests during timed windows. Its verdict receipt contains MLA-I2-NETWORK and MLA-EXT-MEMO-GATES. MLA-S1 does not apply because this is a CSR propagation lane rather than a resume oracle.
