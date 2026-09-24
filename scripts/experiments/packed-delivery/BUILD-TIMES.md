# Docs build-time measurements

Workflow guidance: .ruler/skills/markless-implementation/implementation.md, .ruler/skills/markless-implementation/bundler.md, .ruler/skills/markless-implementation/performance.md

Measured on the actual docs application with fresh Vite Plus processes in the same checkout. Each configuration received one warmup and three interleaved before/after measurements. No CPU profiler, concurrent owned builds/tests, or Chrome sessions ran during the timing series. Filesystem caches were warm; compiler and TypeScript service state began fresh in each process. The acceptance threshold was a median improvement above 5% with correctness checks passing.

| Build | Before median | After median | Reduction | Before range | After range |
| --- | ---: | ---: | ---: | --- | --- |
| Normal docs | 27.38 s | 23.22 s | 15.2% | 26.59–28.08 s | 22.50–23.66 s |
| Experimental packed docs | 60.56 s | 28.23 s | 53.4% | 60.17–62.16 s | 27.76–28.23 s |

These are full `pnpm --dir website exec vp build` wall times, excluding the separate SEO generation script. The normal build's client stage fell from 20.21 to 16.13 seconds; packed client builds fell from 53.44 to 20.92 seconds. SSR remains approximately 5.5 seconds. These are local measurements, not a universal build-time guarantee.

## Changes

- Reuse parsed imported type documents between isolated documentation code fences. Inactive retention is bounded at 512 documents. The regression changes 114 new parses to one without sharing synthetic fence globals.
- Cache router import scans per chunk, invalidating on source or filename changes.
- Assemble packed-facade edits once and index reserved names once per chunk instead of repeatedly copying/scanning large packs.
- Defer direct-loader name searches until the function qualifies; replace generated initializer names in one pass while preserving replacement order.
- Use the installed Rolldown parser for emitted-JS import/helper scans and generate facade source maps only when requested. Authored TSRX still uses the compiler's existing parser.

## Correctness and limits

The normal before/after outputs have 2,140 byte-identical public JavaScript files, including 2,136 generated chunks and four site scripts. Server files and Nitro metadata are not byte-identical. In packed output, 62 of 63 generated chunks match after normalizing content-hash filenames. The remaining shared chunk contains a differently ordered serialized route-preload table; the browser checks are required rather than claiming whole-output byte equivalence. The 55 SSR route preload entries, plus navigation/style entries, match as URL sets after remapping equivalent chunk filenames.

Root and docs Markless-aware TypeScript checks passed. Focused framework checks passed 59 tests across 11 files; docs passed 64 tests across 15 files. The docs doctor passed, including a standard production build. Source-map, content-hash, namespace, lazy initialization and preload invalidation checks are included. The docs test process exited successfully after its existing Vite close-timeout warning.

Three Chrome scenarios passed: intent/SPA/history/offline, delayed delivery with visible controls and retained clicks, and expected delivery failure. Final cold smoke passed eight visits and 24 actions across normal and constrained conditions, with five framework JS requests plus three site scripts per visit. No action started another JS request or had JS requests pending at click time. No page errors or HTTP cache hits occurred; Chrome's cache notifications were for inline data-URL images. This is a correctness smoke, not a new statistically meaningful latency comparison.

Six fixture-budget failures reproduced earlier at checkpoint d5107ae0 remain open in the broader goal; this report does not claim a completely green repository suite. Packing remains experimental and the normal docs build remains the default. No commit or push was performed for these changes.

Raw timing samples, source hashes and output comparisons are in [BUILD-TIMES.json](./BUILD-TIMES.json). Source snapshots and raw build logs are under `/private/tmp/markless-build-speed-paired-5ZJaty`; final packed preview is `/private/tmp/markless-docs-build-speed-final-fWI6Q2/.output`. Browser results: `/private/tmp/markless-docs-navigation-IPeBJA/results.json` and `/private/tmp/markless-docs-cold-oIf1UO/results.json`.
