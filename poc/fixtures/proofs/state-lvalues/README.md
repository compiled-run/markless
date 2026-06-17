# State Lvalues Proof

This fixture defines the executable-spec surface for plain JavaScript lvalue
lowering in `arcade`. It is not a compiler implementation and it does
not check in expected artifact JSON.

The fixture sources live at:

- [src/valid.tsrx](./src/valid.tsrx) for supported state read/write forms.
- [src/diagnostics.tsrx](./src/diagnostics.tsrx) for authored invalid forms that
  future compiler diagnostics must reject.

## Covered Architecture Risks

- Scalar state updates through `count++`.
- Scalar state replacement through `count = x`.
- Object path writes through `obj.x = y`.
- Nested object path reads and writes through paths such as
  `obj.nested.title`, `obj.nested.meta.dirty`, and
  `obj.items[index].meta.edits`.
- Array mutation expectations for state arrays: `push`, indexed assignment,
  nested item writes, and `splice` are graph writes with list/path invalidation.
- Alias-sensitive semantics for loop aliases and object-path aliases that can
  preserve normal JavaScript behavior.
- Destructuring and alias diagnostics for forms whose target is ambiguous,
  read-only, or would change JavaScript-visible behavior.
- Writes to `computed()` diagnostics, including writes through computed aliases.
- Writes to props diagnostics, including nested prop path and destructured prop
  alias writes.

## Future Pass-Boundary Tests

The same authored fixture should be consumed one layer at a time:

1. **TSRX semantic graph**: identify the component functions, prop bindings,
   `state()` sites, `computed()` sites, loop aliases, destructuring aliases,
   event props, text bindings, update expressions, assignment expressions,
   member paths, array method calls, and invalid write sites.
2. **State lowering**: prove supported writes lower through graph access while
   preserving JavaScript semantics:
    - `count++` reads the current scalar value, writes the incremented value, and
      returns the normal update-expression value.
    - `count = x` replaces the scalar graph cell.
    - `obj.x = y` writes only the `x` path.
    - nested writes such as `obj.nested.title = value` and
      `obj.items[index].meta.edits++` invalidate only the affected paths plus any
      dependent aggregate/list bindings.
    - state-array `push`, indexed assignment, nested item writes, and `splice`
      are represented as graph writes rather than opaque whole-app rerenders.
3. **Diagnostics**: reject invalid writes in `src/diagnostics.tsrx` with
   structured diagnostics that include stable codes, source spans, `phase:
"state-lowering"`, a short reason, and actionable suggestions: - computed bindings and aliases are read-only in v1. - props and destructured prop aliases are read-only in v1. - destructured state aliases that cannot be mapped back to a graph path
   without changing JavaScript semantics are diagnostics. - computed-property destructuring from state is ambiguous unless a later
   fixture proves a supported form.
4. **Payload arena planning**: consume lowered state operations to plan graph
   cells, object/list path records, subscriptions, and event records without
   requiring runtime DOM code or final compact payload encoding.
5. **Symbol resolver planning**: assign symbol IDs for the event handlers and
   DOM binding update functions that own these reads and writes. Dynamic imports
   belong in the generated resolver, not in event props.
6. **Runtime graph**: use the planned operations to test scalar writes,
   path-level object invalidation, list invalidation, computed invalidation, and
   DOM mutation journal entries.
7. **Browser resume**: after resume, run the lazy event symbols, apply scalar,
   object, nested, and array writes to graph state, and flush only the concrete
   DOM mutations demanded by subscribed bindings.

## Non-Goals

- No final expected artifact JSON is checked in yet.
- No compiler, runtime, serializer, bundler, or browser implementation lives in
  this fixture.
- This fixture does not decide private graph IDs, compact payload encoding, or
  exact generated JavaScript helper names.
- Diagnostic comments in `src/diagnostics.tsrx` mark expected error categories,
  not final wording or final diagnostic codes.
