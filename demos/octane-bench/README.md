# Markless Octane benchmark umbrella

This package holds production-path benchmarks for Markless. Each lane owns its fixture, correctness gates, measurement protocol, and machine-readable result.

## SSR throughput

Run the SSR throughput lane with:

```sh
pnpm --dir demos/octane-bench bench -- ssr-throughput
```

Add `--smoke` for a cheap one-second-per-case verification, or `--record` to write `baselines/local/ssr-throughput.json` after a green run. The normal protocol uses a 10-second sample window per case, a warmup of at least three renders and about 10% of that window, a 200,000-sample cap, and up to 5,000 memory-phase renders without forced garbage collection.

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
