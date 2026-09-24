# Inline dispatcher and cyclic preload graphs

Workflow guidance: .ruler/skills/markless-implementation/implementation.md, .ruler/skills/markless-implementation/performance.md, .ruler/skills/markless-implementation/bundler.md.

The inline event dispatcher now meets its unchanged 1,090-byte gzip ceiling: 1,117 → 1,089 bytes. Direct lookup-map construction removes generated branches; the propagation flag captured before asynchronous loading remains. Missing-locator and visible-only tests cover the lookup change alongside existing pointer/focus, synchronous-policy and early-stream ordering checks. This is a deterministic size improvement, not a claimed latency gain.

Broader testing found a separate build failure: the router navigation fixture emits a static import cycle, but the preload graph generator required a DAG. It now detects cycles and preserves their static dependencies. Acyclic graphs retain the existing transitive-edge reduction. Cyclic graphs can retain redundant metadata edges; preload planning still deduplicates URLs. Self, two-node, longer/shared-exit, and dynamic-destination cases pass, as does the actual router fixture build. Two stale fixture assertions now expect the Vite Plus commands adopted in the preceding toolchain change.

## Verification

- Inline size test failed at 1,117 before the change and passes at 1,089 afterward. The 19 focused inline tests pass.
- Four cycle tests failed with the original circular-dependency rejection; the five cycle cases and 27 related manifest/planner/fixture tests pass after the repair.
- Root `pnpm run typecheck`, docs typecheck, 64 docs tests, docs doctor and production build pass. Docs tests retain their existing successful-test shutdown warning.
- The affected web/router/bundler suite has 1,558 passing tests and six failing byte-budget/negative-budget tests. No byte ceiling changed.
- The default Nitro-hosted propagation fixture passes five routes and 15 native clicks, including alternate parent elements, stopped propagation and full-runtime fallback. No HTTP cache reuse or page errors occurred.
- Real docs precise coverage passes 18 visits, 57 control actions and three static-header presses. Six navigation/delivery scenarios pass, including keyboard input, scalar-to-full-runtime handoff, history, offline controls, delayed packs and observable pack failure.

## Cold interaction measurements

Ten fresh Chrome visits per build/condition, 40 visits and 120 counter actions total. Chrome 153.0.8010.53, HTTP cache disabled, service workers blocked, localhost Nitro behind a Brotli-quality-5 proxy for streamed HTML and JS. Constrained runs use 150 ms latency, 5 Mbps and 4× CPU throttling. Timings measure the captured click to the expected DOM mutation, not compositor paint. The previous build ran before the candidate, with no owned tests/builds/profilers overlapping. Other desktop applications were active; process snapshots recorded Chrome, Cursor and WindowServer CPU activity.

| Condition | Click | Previous median | Candidate median |
| --- | --- | ---: | ---: |
| Normal | First | 32.90 ms | 32.80 ms |
| Normal | Second | 15.05 ms | 14.85 ms |
| Normal | Third | 15.15 ms | 15.25 ms |
| Constrained | First | 74.60 ms | 76.80 ms |
| Constrained | Second | 10.45 ms | 10.70 ms |
| Constrained | Third | 10.35 ms | 11.40 ms |

None clears the predefined max(10 ms, 10% of previous median, twice the larger MAD) meaningful-change threshold. Both builds make five framework requests plus three site-script requests, transfer 235,035 encoded framework bytes, and have zero HTTP cache hits, failed actions or page errors. No click starts a new script request. Nine of ten constrained first clicks encounter an already-pending script in each build; a guarantee of no network wait is not established.

Module initializer counts are unchanged: counter first click 15, repeats zero; the independent control adds three; computed first click 56; mode selector first click 72, next click one; accordion first click 117. Before input and on the unrelated static-header press the measured framework initializer count is zero. Lexical export spans in coverage are not CPU execution time. Minimal execution for complex controls remains unproven.

The candidate's 67 public JavaScript files have identical names and SHA-256 hashes to the previous preview. Only the server/HTML-side inline change affects this docs delivery. Port 3000 now serves `/private/tmp/markless-docs-inline-3bKoIN/.output` in session 78146. Fresh isolated Chrome page 17 verifies two counter increments and one independent increment, `__asyncResumeRuntimeStarted === false`, two correct live cells, five framework and three site scripts returning 200, no error/warning console messages and no service worker controller. Chunk URLs did not change in this preview update.

## Open gates

The broad suite still exceeds music-player CSR download/startup limits (140,900 > 140,187 and 14,930 > 14,696 gzip bytes), SSR download/navigation limits (84,822 > 84,771 and 25,711 > 25,502), and the largest-runtime-chunk limits (5,714 > 5,403/5,435). The negative-budget tests fail while their input already exceeds multiple limits. This is not a completed or fully green goal.

The first-action inventory suggests a useful next investigation: client MDX imports scalar dispatch and symbol loading through `mdx-route.ts`, which also imports server composition helpers. The counter initializes `resume-arm-records` and `resume-errors` through that module's static dependencies. Determine which declarations actually run and whether the client import path can avoid those initializers without changing instance scoping, navigation render data or public exports. No such dependency change is included here.

[Structured results](./INLINE-AND-CYCLES.json) include raw-result paths, latency dispersion and network counts. Copies are under ignored `results/inline-cycles-2026-09-22/`. Logs are `/private/tmp/markless-inline-*.log` and `/private/tmp/markless-bundle-cycles-{red,green}.log`. Public JS comparison: `/private/tmp/markless-inline-public-js-equivalence.json`. No commit, push or goal close occurred.
