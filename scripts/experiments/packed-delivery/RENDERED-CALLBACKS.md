# Rendered callback ownership

The real accordion page now passes the experimental callback ownership check. Its `m3:` demo scope has 19 compiler-selected callback slots: eight bound callbacks and eleven absent optional callbacks. The eight bound callbacks resolve to symbols in that same scope through the existing `marklessInvokeCallbackSlot` implementation. This removes the previously recorded unknown-cell refusal without inferring callback roles from names or treating arbitrary strings as symbols.

A private copy of the accepted GSbudh server instruments two owning functions: `marklessSsrCallbackSlot` marks the cell when the compiler-generated renderer seeds it, and `composeMdxState` collects the final composed identity. The marker is a JavaScript symbol property, preserved by object spread and excluded by JSON serialization. The uninstrumented and instrumented SSR responses are byte-identical: 968,542 bytes. The private copy's 63 client JavaScript files are also unchanged, totaling 19,274,342 bytes. Running this probe does not alter a live preview.

Across the rendered page, the probe observes 65 marked callback slots, twelve bound callbacks, and no unmarked unknown-valued cells. The bound callback dispatch targets stay inside their owning MDX scopes. The experimental planner checks this explicit evidence against served values, rejects missing/stale/duplicate entries and unresolved targets, and accounts for incoming as well as outgoing callback dependencies. Unwitnessed unknown cells anywhere in the page prevent separation. Other ownership and unsupported-feature checks remain in place.

With these observations, the planner accepts the accordion demo's 68 cells, 153 computed records and 81 event records as a candidate. Seven other MDX scopes remain outside the candidate set. This is payload and rendered-callback evidence only: it does not establish the linked compiler symbol/capture dependency closure or make incremental activation safe to ship.

Five probe tests and nine planner tests failed before their implementations. The final experiment suite passes 62 tests in five files. `pnpm run typecheck` passes. No production source changed in this step, no new docs build or latency comparison is claimed, and no commit, push or goal closure occurred. The six earlier fixture budget failures remain open.

The next implementation still needs the compiler's linked dependencies for hidden state, plus staged runtime handling of render data, ancestor event propagation, already-live scalar state, retry, disposal and navigation. Only after those are verified should the integrated implementation be timed against GSbudh. The prior 27.45 ms CPU-only diagnostic saving is not a shipping result.

Reproduce with:

```sh
node --experimental-strip-types scripts/experiments/packed-delivery/inspect-rendered-callbacks.mjs \
  /private/tmp/markless-docs-combined-demand-GSbudh/.output \
  http://localhost:3020/markless/ui/accordion/ \
  /private/tmp/markless-rendered-callbacks-report.json
pnpm exec vp test scripts/experiments/packed-delivery
pnpm run typecheck
```

[Machine-readable report](RENDERED-CALLBACKS.json) and [raw checks](results/rendered-callbacks-2026-09-22/) retain source hashes, exact callback targets, refusals and the unchanged client file manifest.
