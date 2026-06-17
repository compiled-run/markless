# Sync Event Policy Proof

This fixture defines the executable-spec surface for synchronous browser event
policy extraction in `@arcadejs/core`. It is not a runtime event delegation
implementation, not a dynamic import resolver, and not final artifact JSON.

The fixture source lives at [src/App.tsrx](./src/App.tsrx).

## Covered Architecture Risks

- Lazy event handler symbols through `onKeyDown`, `onClick`, and `onSubmit`
  handlers that also perform graph writes.
- Synchronous `preventDefault()` policy extracted from a keydown guard whose
  condition uses only framework graph state and event fields.
- Synchronous `stopPropagation()` policy extracted from the same provable guard.
- Guard conditions that combine framework state (`menu.open`,
  `shortcuts.trapArrows`) with event fields (`event.key`, `event.altKey`,
  `event.shiftKey`).
- Lazy state writes left in the handler symbol, including `menu.open = false`,
  `menu.activeIndex++`, `menu.lastAction = ...`, and object path writes.
- A diagnostic case where `event.preventDefault()` is guarded by DOM/runtime
  work (`new FormData(event.currentTarget)`) that cannot be proven from graph
  state plus stable event fields.

## Future Pass-Boundary Tests

The same authored fixture should be consumed one layer at a time:

1. **TSRX semantic graph**: identify the component functions, `state()` sites,
   `computed()` sites, host nodes, event props, event method calls, event-field
   reads, graph-state reads, and graph writes inside handlers.
2. **Sync event policy extraction**: prove the compiler can split only the
   synchronous browser-critical policy from the lazy handler body: - `menu.open && event.key === "Escape"` allows extracting
   `event.preventDefault()` and `event.stopPropagation()`. - `shortcuts.trapArrows && (event.key === "ArrowDown" || event.key ===
"ArrowUp")` allows extracting `event.preventDefault()`. - graph writes such as `menu.open = false` and `menu.activeIndex++` remain in
   the lazy handler symbol.
3. **Diagnostics**: reject or require an explicit eager policy for
   `src/App.tsrx` submit policy because its guard depends on `FormData` and
   `event.currentTarget` DOM state instead of only graph state plus event fields.
   The diagnostic should include a source span, phase, reason, and suggested
   fixes such as declarative sync policy, eager/activation-loaded listener, or
   moving the DOM-dependent check into the lazy handler after accepting browser
   default-action timing.
4. **Payload arena planning**: represent event records, sync policy records,
   graph-state dependencies, event-field dependencies, and lazy symbol IDs
   without encoding DOM closures on host nodes.
5. **Symbol resolver planning**: assign symbol IDs for the lazy handlers. Dynamic
   imports belong in the generated resolver, not in the authored event props and
   not in the sync policy snippet.
6. **Runtime graph**: prove sync policy can read current graph state
   synchronously before the lazy handler is imported, while lazy writes still
   batch through the runtime graph and scheduler.
7. **Browser resume**: after resume, delegated event wiring runs the sync policy
   in time for `preventDefault()` / `stopPropagation()`, then resolves and runs
   the lazy handler symbol.

## Non-Goals

- No final expected artifact JSON is checked in yet.
- No compiler, runtime, serializer, bundler, event delegation, dynamic import,
  or browser implementation lives in this fixture.
- This fixture does not decide private graph IDs, compact payload encoding,
  manifest layout, generated helper names, or exact diagnostic codes.
- Diagnostic comments in `src/App.tsrx` mark expected error categories, not
  final wording.
