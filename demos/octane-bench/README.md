# Markless Octane benchmark umbrella

This package holds production-path benchmarks for Markless. Each lane owns its fixture, correctness gates, measurement protocol, and machine-readable result. Run the SSR throughput lane with:

```sh
pnpm --dir demos/octane-bench bench -- ssr-throughput
```

Add `--smoke` for a cheap one-second-per-case verification, or `--record` to write `baselines/local/ssr-throughput.json` after a green run. The normal protocol uses a 10-second sample window per case, a warmup of at least three renders and about 10% of that window, a 200,000-sample cap, and up to 5,000 memory-phase renders without forced garbage collection.

## Measurement policy

Absolute latency baselines are machine-profiled observations. Compare a local baseline only with a run on the same OS, CPU, architecture, Node and pnpm versions, and protocol. CI never compares developer-machine milliseconds.

Improvements are reported as a pinned pair: a clean base commit and a clean candidate commit, both identified by full Git SHA and measured with identical environment and protocol metadata. The pair keeps both raw result payloads, its calculated delta, and the noise threshold used to decide whether the movement is meaningful. See `baselines/README.md` for the file contract.

The `ssr-throughput` lane covers deterministic 50-card and 500-card news pages, parallel async registration, nested waterfall async work, and escape-heavy output through a real production Markless SSR build. Octane's tuned-TSRX versus plain-TypeScript deoptimization cases are intentionally absent because plain-TypeScript render authoring is not a supported Markless mode. These numbers describe Markless only and do not imply cross-framework or Octane comparability.
