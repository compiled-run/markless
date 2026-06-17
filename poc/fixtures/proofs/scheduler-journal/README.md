# Scheduler Journal Proof

This fixture defines the executable-spec surface for scheduler and DOM mutation
journal semantics in `@arcadejs/core`. It is not a scheduler implementation,
runtime graph implementation, DOM mutation application layer, browser demo, or
final artifact JSON.

The fixture source lives at [src/App.tsrx](./src/App.tsrx).

## Covered Architecture Risks

- Batched event writes through handlers that update several graph cells before
  any DOM journal is expected to flush.
- Microtask flush semantics: graph writes from one handler batch should publish
  one ordered journal flush after the handler batch completes.
- Computed invalidation after graph writes through `selected`, `visibleItems`,
  `summary`, and `flushLabel`.
- Async computed completion versioning through `preview`, which depends on
  `journal.selectedId` and `journal.revision`.
- Stale async completion ignored after newer writes by changing selection and
  incrementing `journal.revision` before an older `preview` can settle.
- Concrete DOM mutation journal categories:
    - `setText` from dynamic text bindings such as `{summary}` and `{flushLabel}`;
    - `setAttr` from dynamic attributes such as `data-revision`, `data-selected`,
      `aria-busy`, and keyed row state;
    - `insertRange` from opening the branch or adding a row;
    - `removeRange` from closing the branch or deleting a keyed row;
    - `moveRange` from keyed row reorder;
    - `runCleanup` from behavior cleanup on removed branch and list ranges.
- No VDOM semantics: future tests should assert ordered journal records against
  concrete DOM locators, not virtual element reconciliation.
- No rollback after committed graph writes: `commitThenThrow` writes graph state
  before throwing, and future runtime tests should keep committed writes visible.
- Handler ordering when multiple lazy handlers run for the same browser event
  through the ordered `onClick={[...]}` handler list.
- Behavior cleanup ordering for removed branch and keyed-list ranges through
  `attach={journalBehavior(...)}` on both a branch host and row hosts.

## Future Pass-Boundary Tests

The same authored fixture should be consumed one layer at a time:

1. **TSRX semantic graph**: identify the component function, state sites,
   computed sites, async computed runner, event props, ordered handler list,
   dynamic text bindings, dynamic attributes, `@if` branch, keyed `@for` loop,
   `@empty` fallback, `attach={...}` behavior hosts, and `element()` handle.
2. **State lowering**: prove event writes such as `journal.filter = ...`,
   `journal.revision++`, `items.push(...)`, `items.splice(...)`, and
   `journal.committed++` become graph writes instead of closure mutation.
3. **Scheduler planning**: prove writes from a handler batch invalidate computed
   nodes synchronously in the graph, then schedule one microtask journal flush.
   Ordered handler arrays must run in authored order before the flush.
4. **Async scheduler**: assign an async request/version to each `preview` run;
   later graph writes must supersede older pending completions. Stale completion
   should produce no DOM journal entries.
5. **DOM mutation journal**: derive concrete records for `setText`, `setAttr`,
   `insertRange`, `removeRange`, `moveRange`, and `runCleanup` from locator
   records. These records target real DOM ranges and text/attribute locators,
   not virtual child arrays.
6. **Failure semantics**: when `commitThenThrow` throws after graph writes,
   committed graph writes are not rolled back. Future diagnostics may surface the
   thrown error, but the graph state and already-scheduled journal remain
   authoritative.
7. **Cleanup ordering**: when the details branch closes or keyed rows are
   removed/moved, cleanup for removed behavior hosts runs before their DOM ranges
   are detached, and move-only rows do not run cleanup.

## Non-Goals

- No final expected artifact JSON is checked in yet.
- No compiler, runtime graph, scheduler, serializer, event delegation, DOM
  mutation application, browser resume, or bundler implementation lives in this
  fixture.
- This fixture does not decide private scheduler queue data structures, compact
  journal encoding, generated helper names, exact diagnostic codes, or browser
  timing APIs.
- Comments and names in `src/App.tsrx` mark expected scheduler/journal
  categories, not final compiler or runtime output.
