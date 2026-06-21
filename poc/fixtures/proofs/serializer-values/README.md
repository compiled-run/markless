# Serializer Values Proof

This fixture defines the executable-spec surface for serializer value handling
in `@arcade/core`. It is not a serializer implementation, runtime resume
implementation, payload encoder, browser demo, or final artifact JSON.

The fixture source lives at [src/App.tsrx](./src/App.tsrx).

## Covered Architecture Risks

- Serialization tiers for primitives, plain objects, arrays, framework graph
  references, app-owned value classes, recreated computed values, DOM/resource
  behavior, and unsupported values.
- Object identity preservation when multiple state paths, collection entries,
  and map entries point at the same object.
- Cycle preservation through mutually linked objects whose reachable values are
  otherwise serializable.
- Built-in value support for `Date`, `RegExp`, `Map`, `Set`, `URL`, `BigInt`,
  typed arrays, and `ArrayBuffer`.
- App value class restore by prototype plus serializable own fields. The
  fixture uses `MoneyValue` and `CustomerSnapshot` methods as imported behavior;
  method bodies are not serialized data.
- Recreated values that belong in `computed()` instead of durable state.
- DOM/resource behavior that belongs in `attach={...}` with serializable inputs,
  while the behavior result, cleanup, `AbortController`, and element object are
  not serialized.
- Unsupported DOM/runtime value diagnostics for live elements, element handles
  stored in state, requests, streams, sockets, `WeakMap` state, and private
  runtime resources.
- Secret-leak warning shape for state paths whose names or values look like
  durable secrets.

## Future Pass-Boundary Tests

The same authored fixture should be consumed one layer at a time:

1. **TSRX semantic graph**: identify the component functions, `state()` sites,
   `computed()` sites, `attach={...}` behavior hosts, element handles, built-in
   constructor calls, class instances, shared object references, cycle setup,
   and diagnostic comments.
2. **Serializer value classification**: classify reachable graph values by
   tier:
    - primitives, plain objects, arrays, `Date`, `RegExp`, `Map`, `Set`, `URL`,
      `BigInt`, typed arrays, and `ArrayBuffer`;
    - framework graph references and element handles as framework IDs/locators,
      not user objects;
    - app value classes with serializable own fields and imported prototype
      methods;
    - recreated computed values whose durable dependencies serialize instead of
      the derived object itself;
    - DOM/resource behavior represented by behavior code reference plus
      serializable inputs;
    - unsupported live DOM/runtime resources.
3. **Identity table planning**: prove repeated references to `sharedContact`,
   `cycleA`, and class instances become payload IDs/backrefs rather than naive
   JSON cloning.
4. **Cycle planning**: prove the `cycleA`/`cycleB` graph allocates shells first,
   then fills fields/refs, while still rejecting unsupported values at exact
   state paths.
5. **Class restore planning**: prove `MoneyValue` and `CustomerSnapshot`
   instances restore with `Object.create(Class.prototype)` plus serialized own
   fields, without constructor re-execution or method body serialization.
6. **Diagnostics**: reject `Diagnostics` state paths with structured
   `phase: "serialization"` diagnostics for live DOM nodes, element handles in
   state, request/stream/socket/runtime handles, `WeakMap` state, and private
   hidden resource wrappers. Warnings for suspicious secret paths should include
   the state path, value kind, severity, and suggested fix.
7. **Payload arena planning**: represent state roots, typed roots,
   object/collection/class refs, constants, backrefs, and forward refs without
   committing to compact token alphabets or final payload JSON.
8. **Runtime resume**: restore supported values while preserving identity,
   cycles, prototypes, collection entries, typed arrays, and `ArrayBuffer`
   contents. Unsupported values must fail before resume with actionable
   diagnostics.

## Non-Goals

- No final expected artifact JSON is checked in yet.
- No compiler, runtime, serializer, payload encoder, bundler, or browser
  implementation lives in this fixture.
- This fixture does not decide private payload ID alphabets, compact table
  layouts, generated helper names, adapter APIs, or exact diagnostic codes.
- Diagnostic comments in `src/App.tsrx` mark expected error and warning
  categories, not final wording or final diagnostic codes.
- No tiny support files are needed: app-owned value classes are defined directly
  in `src/App.tsrx` so future tests can consume one authored source file.
