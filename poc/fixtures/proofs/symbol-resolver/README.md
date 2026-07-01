# Symbol Resolver Proof

This fixture defines the executable-spec surface for symbol resolver planning in
`@markless/core`. It is not a generated resolver implementation, a bundler
manifest, dynamic import runtime code, event delegation, or final artifact JSON.

The fixture source lives at [src/App.tsrx](./src/App.tsrx).

## Covered Architecture Risks

- Authored event props stay normal TSRX and do not compile to DOM event
  closures. They become lazy event handler symbol records.
- Binding update functions for dynamic text, attributes, properties, branch
  content, and keyed list rows become lazy binding symbols.
- `attach={...}` behavior factories become behavior symbols with serializable
  inputs and ordered cleanup ownership on the host element.
- Async `computed()` callbacks become async runner symbols that the scheduler can
  request through the resolver.
- Generated resolver code owns `import()`. Authored event props, binding
  expressions, behaviors, and async computed callbacks do not contain
  `await import(...)`.
- Unknown, stale, or manifest-mismatched symbol IDs fail closed with structured
  diagnostics instead of running a best-effort or wrong symbol.
- Inline sync event policy remains encoded with event wiring. The Escape
  `preventDefault()` policy must be available synchronously and must not wait on
  lazy symbol resolution.

## Future Pass-Boundary Tests

The same authored fixture should be consumed one layer at a time:

1. **TSRX semantic graph**: identify component functions, `state()` sites,
   `computed()` sites, async computed callbacks, host nodes, event props,
   dynamic bindings, `attach={...}` behavior hosts, element handles, branch scopes,
   and keyed list scopes.
2. **State lowering**: prove handler and binding bodies read and write graph
   cells by ID instead of capturing mutable JavaScript closure state.
3. **Payload arena planning**: represent event records, binding records,
   behavior records, async runner records, sync policy records, and DOM locator
   references without encoding per-node DOM closures.
4. **Symbol resolver planning**: assign stable private symbol IDs for:
    - event handlers such as `onInput`, `onKeyDown`, `onClick`, and `onSubmit`;
    - binding update functions for `value`, `aria-*`, `data-*`, dynamic text, and
      branch/list text;
    - behavior factories used by `attach={...}`;
    - async computed runner callbacks.
5. **Generated resolver ownership**: emit a resolver table that maps symbol IDs
   to manifest entries, chunks, and exports. The generated resolver is the only
   place that performs dynamic `import()`.
6. **Sync event policy separation**: prove the Escape guard's
   `event.preventDefault()` policy is encoded inline from graph state plus event
   fields, while graph writes such as `panel.open = false` remain in the lazy
   event handler symbol.
7. **Diagnostics**: corrupt or remove one event, binding, behavior, and async
   runner symbol in a future test and assert fail-closed diagnostics for unknown
   symbol, manifest hash mismatch, missing chunk/export, and protocol mismatch.
8. **Browser resume**: delegated events, binding refreshes, behavior startup, and
   async computed scheduling ask the resolver for symbols by ID; resumed DOM
   nodes never receive authored closures.

## Non-Goals

- No final expected artifact JSON is checked in yet.
- No compiler, runtime, serializer, bundler, event delegation, resolver, dynamic
  import, or browser implementation lives in this fixture.
- This fixture does not decide private symbol ID alphabets, manifest file names,
  chunk grouping, generated helper names, compact payload encoding, or exact
  diagnostic codes.
- Comments in `src/App.tsrx` mark expected symbol categories and future
  diagnostic setup points, not final compiler output.
