# Payload Locators Proof

This fixture defines the executable-spec surface for payload view/wiring
locator planning in `@arcade/core`. It is not a compiler implementation,
runtime resumer implementation, browser demo, or final artifact JSON.

The fixture source lives at [src/App.tsrx](./src/App.tsrx).

## Covered Architecture Risks

- DOM-order locator streams for host elements that need runtime records while
  static host nodes remain skippable and do not require per-node attributes.
- Branch anchors for `@if` sections whose DOM and graph scopes appear and
  disappear with real DOM insertion/removal.
- Keyed list item locators for `@for (...; key item.id)` rows whose identity
  follows domain keys across reorder, insert, and delete operations.
- Text binding locators for scalar, computed, branch-local, and keyed-list text
  bindings that must update concrete text nodes rather than virtual children.
- Behavior host locators for `attach={...}` entries, including serialized behavior
  inputs and cleanup ownership on the host element.
- Element handle locators for `element()` plus `el={...}` bindings, including a
  branch-owned handle that should resolve to `undefined` after its branch is
  removed.
- No VDOM semantics: the fixture must not imply component re-execution, virtual
  child arrays, old/new tree reconciliation, or public locator attributes on
  every node.

## Future Pass-Boundary Tests

The same authored fixture should be consumed one layer at a time:

1. **TSRX semantic graph**: identify the component function, state sites,
   computed sites, host nodes, event props, `attach={...}` behavior hosts,
   `element()` handles, `el={...}` bindings, text bindings, `@if` branches,
   keyed `@for` loops, `@empty` fallback, and DOM-order ownership of locator
   records.
2. **Payload arena planning**: prove the view/wiring arena can represent:
    - DOM-order locator records for dynamic host elements and text bindings.
    - skip runs for static host nodes that do not need runtime records.
    - comment anchor records for conditional branches and keyed list ranges.
    - keyed item identity records rooted at `item.id`.
    - behavior host records with ordered behavior symbol IDs and serializable
      behavior inputs.
    - element handle records that map handle IDs to DOM locators instead of
      serializing DOM objects.
3. **Symbol resolver planning**: assign symbol IDs for event handlers, binding
   update functions, and behavior functions whose dynamic imports are owned by
   the generated resolver, not by authored host attributes.
4. **Runtime graph**: use planned locator records to test concrete DOM mutation
   journal entries such as `setText`, `setAttr`, `insertRange`, `removeRange`,
   `moveRange`, and `runCleanup` without virtual element nodes or child lists.
5. **Browser resume**: materialize the `arcade/view` locator stream with a
   `TreeWalker`, attach event/binding/behavior/element-handle records to real
   elements or comment anchors, and verify that static nodes do not need
   per-node attributes.

## Non-Goals

- No final expected artifact JSON is checked in yet.
- No compiler, runtime, serializer, bundler, event delegation, payload encoder,
  or browser implementation lives in this fixture.
- This fixture does not decide private locator token alphabets, compact payload
  table layouts, manifest shapes, generated helper names, or exact diagnostic
  codes.
- Comments in `src/App.tsrx` mark expected locator categories, not final
  compiler output.
