# Imported handler write dependencies

An imported handler could write state that its interaction group did not include. The reproducer is a child handler that assigns `hidden = 5` and calls `onChange`; the parent supplies a callback that updates its own state. Before this change, the group included the parent's state but omitted the child's write-only state. Reading capture slots alone cannot recover that write.

The `capture-analysis` pass now retains planned graph writes in `ExtractedCaptureSymbol.graphWrites`. Imported capture composition carries this metadata to `trigger-groups`. That pass looks up the requested bound handler by its loader identity, qualifies local writes with its instance path, and preserves page-shared graph identities. Sibling instances keep separate local writes and parent callbacks. This changes compiler dependency metadata, not runtime capture slots or the browser loader.

Three regressions failed before the fix. They cover two component/prop/state/element shapes, click versus input handlers, sibling instances, and a page-shared object property written without a read. The fixtures pass real compiler-produced child captures into parent compilation. Their action record selects a compiler-produced bound row; it does not claim to reproduce the later SSR composition stage.

## Actual docs compiler evidence

The process-local probe observes compiler results during an ordinary production docs build. Its Node load hook instruments the compile wrapper in memory and returns the original result object. It never edits framework source or adds browser instrumentation. Focused tests verify result/input identity, rejected compilation, unrelated input, and refusal of ambiguous matches.

The first build captured 322 distinct result variants and the build after the fix captured 309. These counts include intermediate results and are not an exhaustive source-module inventory. The generated basic accordion has two pre-link variants and a linked variant with 721 imported symbol claims, 75 bound rows, and 235 extracted capture entries. After the fix, 72 imported capture entries retain graph writes; before it, none did. These records have no capture diagnostics.

The generated accordion records still contain zero trigger groups. The full rendered MDX dependency proof and incremental runtime integration remain unfinished. Widget-shared physical identities, aliases, callback routes, and graph dependencies must use their owning composition rules before selective activation is enabled. The experiment's earlier payload-and-callback candidate is not sufficient proof by itself.

## Verification

- Full compiler and relevant bundler prerender suites: 2,109 passed, two expected failures, 263 files.
- Experiment tests: 65 passed in six files.
- Root and docs Markless-aware typechecks passed.
- Docs doctor and production build passed.
- Docs tests: 64 passed in 15 files. Sandboxed attempts failed before test execution with `EMFILE`; the same `--run` command outside the sandbox passed. Vite reported a nonfatal 10-second teardown timeout.
- Rebuilt client files match the accepted GSbudh build by filename and SHA-256: 63 JavaScript files, 19,274,342 bytes. No new latency improvement is claimed for unchanged client code.

The reported localhost chunk URL returns 404, while a cache-bypassed reload of the current preview uses five different framework files successfully. The root Like control updates 0 → 1 → 2, eight script requests return 200 (five framework and three site scripts), and Chrome reports no console errors or registered service workers. An old document or module graph referencing a replaced build is consistent with the reported error; the fresh preview does not require another build.

Six earlier fixture size/negative-budget failures remain open. No commit, push, or goal closure occurred.

The [machine-readable report](LINKED-COMPILER-WRITES.json) links source hashes and raw verification output. Compressed compiler records, including intermediate variants, are in [results/linked-compiler-writes-2026-09-22](results/linked-compiler-writes-2026-09-22/). To reproduce the capture, run the normal docs build with `MARKLESS_COMPILE_PROBE_DIR` set to an empty directory and `NODE_OPTIONS=--import=<absolute path to capture-compiler-results.mjs>`.
