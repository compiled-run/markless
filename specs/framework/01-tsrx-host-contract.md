# TSRX Host Contract

Framework-specific TSRX host semantics. TSRX owns structural syntax; this host profile adds graph/resume integration.

## TSRX Baseline

This framework should let TSRX answer syntax and template-shape questions
whenever core TSRX already has an answer.

TSRX owns the baseline semantics for:

- components as ordinary TypeScript functions returning TSRX
- statement containers (`@{...}`)
- comments inside template children
- nested component content through TSRX's `children` convention
- lexical scope inside statement containers and control-flow blocks
- `@if`, `@for`, `@switch`, and `@try`
- `@for` `index`, `key`, and `@empty`
- dynamic tags/components (`<{expr}>`)
- scoped `<style>` blocks and style composition

This framework is a TSRX host profile. It consumes the TSRX AST and defines only
the host-specific semantics needed for marker-free graph state, async dataflow,
closure extraction, resumability, serialization, and runtime DOM wiring. When a
question is already answered by TSRX, this design should reference that answer
rather than invent a parallel rule.

The main exception is reactive state semantics. TSRX's core lazy destructuring
syntax remains valid TSRX, but this framework's host profile preserves live
reads for known-reactive sources without requiring authors to use lazy
destructuring markers.

### Loop identity

TSRX already gives `@for` optional `index` and `key` clauses:

```tsrx
@for (const product of products; index i; key product.id) {
  <ProductCard product={product} />
}
```

This framework uses the `key` clause as the stable identity root for repeated
local graph scopes. A keyed loop item keeps its component instances, local
`state()`, `computed()` nodes, async nodes, DOM updates, and event wiring
attached to the same logical item across reorder, insert, and delete operations.

Unkeyed `@for` is positional. That is acceptable for static/stateless output,
but any loop body that creates resumable graph identity must either provide a
stable domain key or explicitly key by position (`index i; key i`) when state
should follow the slot rather than the item. The compiler should diagnose
interactive or stateful unkeyed loops and point at the `@for` header:

```tsrx
@for (const product of products; key product.id) {
  <ProductCard product={product} />
}
```

The loop key applies to generated child identity for that iteration. If a child
component or element supplies its own key, that authored key becomes the child
identity within the keyed loop item.

### Conditional identity

`@if` branches create branch-local graph scopes. When a branch is removed from
the DOM, graph state created exclusively inside that branch is disposed with it:
local `state()`, `computed()` nodes, async nodes, DOM updates, event wiring,
and pending async work.

When the branch becomes active again, it creates fresh branch-local graph state
from the current parent values. This matches the no-VDOM model: conditional
rendering inserts and removes real DOM and graph subtrees directly rather than
retaining hidden virtual subtrees.

```tsrx
export function Panel() @{
  const open = state(false);

  <section>
    <button onClick={() => open = !open}>Toggle</button>

    @if (open) {
      const draft = state("");

      <input value={draft} onInput={event => draft = event.currentTarget.value} />
    }
  </section>
}
```

In this example, `draft` resets every time `open` changes from `false` to `true`.
If state should survive while the branch is hidden, declare it in the nearest
stable parent scope:

```tsrx
export function Panel() @{
  const open = state(false);
  const draft = state("");

  <section>
    <button onClick={() => open = !open}>Toggle</button>

    @if (open) {
      <input value={draft} onInput={event => draft = event.currentTarget.value} />
    }
  </section>
}
```

The compiler should be able to explain this rule when local state appears inside
a conditional branch:

```txt
State declared inside @if is disposed when the branch is removed.
Move it above the @if if it should persist.
```

### Children and projection

TSRX's current documented convention is that composite components accept nested
TSRX child content as `children`; computed values and render-prop-style values
are passed explicitly as `children={...}`. This framework adopts that TSRX
authoring convention. The compiler and runtime model is projection.

```tsrx
export function Panel({ children }) @{
  <section>{children}</section>
}
```

`children` is not a React-style VNode array. It is an opaque compiler-owned
template projection that may be placed into the output at `{children}`. The
parent component can render it, wrap it, or pass it through to another component,
but it cannot inspect, map, clone, diff, count, or mutate the child structure.

This keeps the familiar TSRX authoring model without reintroducing VDOM costs.
Initial rendering is still O(n), because emitting HTML is O(n). Browser resume
must not be O(n) over the component tree: initial render emits the DOM plus
graph, event, element, async, and projection metadata, and the resumer wakes only
from serialized locators when an event, visibility trigger, async continuation,
or state write demands it.

Projection does not make the graph a tree. The DOM placement is tree-shaped, but
state and async graph nodes keep the scopes where they were created. A parent
that renders `{children}` owns only the projection site, not the child graph. If
that projection site is removed by an `@if` branch or keyed item disposal, the
projected DOM and any scopes created exclusively for that projected instance are
disposed with it.

The compiler should diagnose React-style child manipulation in v1:

```txt
children is an opaque template projection in Arcade.
Render it with {children}, pass it through, or wrap it; do not inspect or map it.
```

There is no separate `<Slot />` primitive in v1. Qwik needed slots to keep VDOM
projection sparse; this framework has no VDOM, so the slot-shaped concern is the
projection metadata, not an author-facing component. Named slots are deferred
unless TSRX standardizes a syntax that this host profile can adopt.
