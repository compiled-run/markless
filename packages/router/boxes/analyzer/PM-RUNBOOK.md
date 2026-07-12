# Router analyzer box runbook

Run `pnpm --dir packages/router test:boxes -- --retry=0`, then `pnpm receipts:check`.
The preview box invalidates `analyzer-route-actions.json` before building and rewrites it only after the existing router assertions and analyzer S1/I2 gates pass.

Fault controls available to the PM:

- Route closure: run `pnpm exec vitest run packages/router/test/analyzer-gate.test.ts`; its red controls remove `pages/404.tsrx` from the matrix view and add `pages/undeclared.tsrx` to discovery.
- Network declaration: the same test injects `/build/bundle-graph.json`, which E1 intentionally excludes because browser observation must make zero bundle-graph requests.
- Post-settlement chunk: the same test injects a second navigation module after the destination settlement count and requires MLA-S1 to fail.
- Pending policy: Harbor is measured only after the existing streaming-settle box observes its 300ms commit. No boundary allowance is declared without an observed boundary ID.
- Executed bytes: I5 remains manifest-deferred under the dated policy entry because MDX m0 runtime attribution IDs are unknown. Do not add a required not-run receipt; the receipt checker rejects non-pass results by design.
