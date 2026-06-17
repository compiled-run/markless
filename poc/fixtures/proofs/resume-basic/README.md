# Resume Basic Proof

This is the canonical vertical-slice fixture for `@arcadejs/core`. It is an
executable spec for compiler/runtime contracts, not a demo app and not a
throwaway implementation.

The fixture source lives at [src/App.tsrx](./src/App.tsrx).

## Covered Architecture Risks

- Scalar `state()` read/write through a counter.
- Object state path reads and writes through `menu.open`, `menu.query`,
  `menu.selectedId`, and `menu.lastAction`.
- Lazy event symbols through `onClick`, `onInput`, and `onKeyDown` handlers.
- Synchronous `preventDefault()` policy extraction from an `onKeyDown` guard
  that reads graph state and event fields.
- Async `computed()` under `@try` / `@pending` / `@catch`.
- Host element behavior through `attach={markProofPanel(panelLabel)}`.
- DOM locator ownership through `element()` plus `el={searchInput}`.

## Future Pass-Boundary Tests

The same authored fixture should be consumed one layer at a time:

1. **TSRX semantic graph**: identify the component, host nodes, dynamic text
   bindings, event props, `state()` sites, `computed()` sites, `element()` site,
   `el` binding, and `attach` binding.
2. **State lowering**: prove `count++`, `menu.query = ...`, `menu.open = false`,
   `menu.lastAction = ...`, and reads such as `menu.open` and `details.title`
   lower through graph access.
3. **Payload arena planning**: produce graph cells, async state records, element
   handle records, behavior host records, event records, sync policy records,
   and DOM locators without requiring a runtime DOM implementation.
4. **Symbol resolver planning**: assign symbol IDs for event handlers, DOM
   binding update functions, the element behavior, and the async computed run
   function. Dynamic imports belong in the generated resolver, not event props.
5. **Runtime graph**: consume the planned graph/payload shape to test reads,
   writes, dependency invalidation, async request versioning, and DOM mutation
   journal entries.
6. **Browser resume**: decode payloads, locate the input and panel, run the sync
   keydown policy before lazy imports, load lazy symbols, write graph state, and
   flush concrete DOM mutations.

## Current Implementation Proof

- `poc/packages/compiler/test/semantic-graph.test.ts` is the first red test. It
  consumes [src/App.tsrx](./src/App.tsrx) and expects a human-readable TSRX
  semantic graph artifact.

## Non-Goals

- No final expected artifact JSON is checked in yet.
- No compiler, runtime, serializer, bundler, or browser implementation lives in
  this fixture.
- This fixture should not decide private compact payload encoding. Expected
  artifacts should be introduced by the first failing test for each pass.
