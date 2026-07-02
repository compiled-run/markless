# Events, Symbols, And Behaviors

DOM handles, node-owned behaviors, visibility events, event semantics, sync policy, and lazy symbol resolution.

### DOM element handles

DOM elements are not graph state. They are host objects that may exist in the
browser, may be absent during initial render, and may disappear when a
conditional or keyed item is removed.

Use `element<T>()` when lazy event code needs a typed, resumable handle to a host
element. Bind it with the framework-owned `el` prop:

```tsrx
export function SearchBox() @{
  let input = element<HTMLInputElement>();

  <>
    <input el={input} />
    <button onClick={() => input?.focus()}>Focus</button>
  </>
}
```

`element()` creates an element handle, not reactive data. `el={handle}` binds that
handle to exactly one host element in the current graph scope. During initial
render, and after the element is removed, reading the handle produces
`undefined`. When a lazy event or visibility handler runs in the browser, the
resumer resolves the handle's serialized DOM locator to the current element.

This covers the common design-system cases: focus registries, item navigation,
measurement, pointer capture, popover/dialog/file-picker APIs, and cross-event
DOM access. It also keeps two jobs separate:

- `element()` names an element for later imperative use.
- element behavior setup and cleanup belongs on the host node through `attach`,
  not inside `element()` handles or serialized state.

`state()` cannot hold DOM nodes, and `element()` handles are not serialized as
data. Passing element handles through component context, arrays, and helpers is
valid when the values remain inside `.tsrx` compiler-owned code.

### Element behaviors

DOM-backed libraries are not durable state. Chart.js, Monaco, Mapbox, tooltips,
observers, gesture libraries, and drag/resize helpers all need a real browser
element and often need cleanup. They should not be stored in `state()` and they
should not become serializer problems.

Use the framework-owned `attach` prop on host elements for node-owned DOM behavior:

```tsrx
import { Chart } from "chart.js";

function chart(config: ChartConfig) {
  return (canvas: HTMLCanvasElement) => {
    const instance = new Chart(canvas, config);
    return () => instance.destroy();
  };
}

export function SalesChart({ points }: { points: Point[] }) @{
  const config = computed(() => makeChartConfig(points));

  <canvas attach={chart(config)} />
}
```

`attach` is the declarative bridge from imperative DOM/library code to the node
that owns it. It is similar in spirit to events and element handles:

```txt
onClick={}  runs event behavior owned by this node
el={}       gives lazy access to this node later
attach={}      installs longer-lived DOM behavior owned by this node
```

The behavior result is never serialized. Initial render records the host element
locator, the behavior code reference, and the serializable behavior inputs.
Browser resume startup records that metadata but does not run app behavior code.
The behavior symbol is imported only when an explicit browser trigger activates
it, such as visibility, an event, or a future declared behavior policy. A behavior
that must run eagerly when connected must be represented as an explicit opt-in
trigger for that host; it is not component replay.

`attach` is compiler-special on host elements. In `attach={chart(config)}`, the
factory call is not normal eager initial-render execution. The compiler treats
it as:

```txt
behavior: chart
input: config
owner: current host element
```

The v1 supported forms are:

```tsrx
<input attach={autofocus} />
<canvas attach={chart(config)} />
<div attach={[tooltip(options), clickOutside(close)]} />
```

Behavior functions receive the element and may return a cleanup function:

```ts
type ElementBehavior<T extends Element> = (element: T) => void | (() => void);
```

When behavior inputs change, v1 cleans up the existing behavior and runs it
again. Future versions may support an explicit update contract for libraries
that can update in place. Multiple behaviors install in array order and clean up
in reverse order.

`attach` is host-element-only. Components can expose higher-level wrappers, but
`attach` passed directly to a component is a diagnostic unless that component's
compiler output explicitly forwards it to a host element. Behavior inputs use
the same capture and serialization rules as event handlers: no request objects,
secrets, host-only modules, DOM nodes, or runtime handles may cross into a
browser behavior input.

### `onVisible` — visibility as an event, not a lifecycle

Visibility is modeled as an element event, parallel to `onClick`:

```tsrx
<img
  src={src}
  onVisible={() => analytics.recordImageSeen(src)}
/>
```

Semantics:

- An `on*` event handler where the event is "element entered the viewport."
  The resumer registers one shared, container-scoped IntersectionObserver for
  wired elements;
  the handler is extracted as a lazy symbol (capture rule applies) and loads
  only when its element first becomes visible.
- Fires once per element instance, receives the element, may return a cleanup
  that runs on element removal.
- **Not a reactive computation.** State reads inside are current-value reads —
  no subscriptions, no re-runs. DOM-backed libraries that need setup, updates,
  and cleanup belong in `attach`, not `onVisible`.
- The zero-JS guarantee gets a _scoped_, greppable asterisk: pages without
  `onVisible` ship zero eager behavior; pages with it run exactly the symbols
  whose elements are on screen. There is no free-floating equivalent
  (`onMount()`, `client()`) and there never will be — anything without an
  element doesn't belong in a component.

A pure pull graph also deletes a class of resumability hazards: resume is
always re-derivation, with no effect-ordering or "did it already run during
initial render" semantics to replay.

This matters double in the AI age: with one way to express any data flow
(derive it), generated code is reviewable by construction — stale-closure
effects, dependency-array bugs, and effect-ordering races are not lintable
mistakes here, they are unrepresentable. (Prior art: Ryan Carniato's
derived-first direction for Solid 2.0 — "you don't need effects; computed is
your effect.")

### Event handler arrays and sync policy

Event and behavior props accept either one expression or an array of expressions:

```tsrx
<button onClick={[saveDraft, closeDialog]} />
<div onVisible={[recordImpression, preloadDetails]} />
<canvas attach={[chart(config), resizeCanvas]} />
```

For `on*` event props, array entries run in authored order. The runtime stops at
the first thrown or rejected entry and routes the error through the normal error
boundary path. Graph writes already committed by earlier entries are not rolled
back. Return values are ignored for ordinary events. For event props with
lifecycle cleanup semantics such as `onVisible`, returned cleanup functions are
stored and later run in reverse order.

Event handlers are lazy-loaded behavior, so the browser cannot wait for handler
chunks before deciding default actions. For v1, only browser-critical
cancellation/propagation is allowed to run synchronously. When the compiler sees
`event.preventDefault()` or `event.stopPropagation()` inside an event handler, it
tries to extract the smallest equivalent sync policy from the surrounding
condition. That policy may read only already-resumed framework graph state,
serializable constants/props, and simple event fields. It may not import code,
call arbitrary user functions, await async work, read DOM resources, or perform
graph writes in v1. State writes remain in the lazy handler chunk.

This extraction uses the TSRX semantic graph: `onKeyDown={...}` is an event
attribute, its value is a normal function AST, the guard is an `IfStatement`,
and graph-state reads/writes are resolved through the same binding map used by
state lowering. No inline DOM closure is required for the authored handler.

```tsrx
let menuOpen = state(false);

<input
  onKeyDown={(event) => {
    if (menuOpen && event.key === "Escape") {
      event.preventDefault();
      menuOpen = false;
    }
  }}
/>
```

The compiler records a sync policy equivalent to:

```ts
if (graph.read(menuOpenId) && event.key === 'Escape') {
	event.preventDefault();
}
```

The `menuOpen = false` write still runs in the lazy handler symbol after the
runtime imports it. If the cancellation/propagation condition cannot be proven
from graph state, constants/props, and event fields, compilation fails with a
diagnostic rather than silently emitting a handler whose default action is too
late to matter.

For `attach`, behavior entries install in authored order and clean up in reverse
order. Each behavior has its own serialized input and code reference, so one
behavior can be lazy-loaded or diagnosed independently from the others.

### Symbol loading and event wiring

Extracted symbols are lazy-loaded, but normal framework-owned wiring does not
turn into QRL-like user values or per-node DOM closures. Authored event props
compile to encoded `markless/view` records:

```txt
DOM locator + event name + optional sync policy IR + ordered handler symbol IDs
```

The generated HTML does not need an `onClick={async (...) => import(...)}` shape,
and production output should not require per-node event attributes. The
`markless/view` arena locates nodes by DOM-order streams, skip runs, branch anchors,
or other private locator data, then the resumer builds internal side tables such
as `WeakMap<Element, EventRecord>`.

The compiler and bundler own event discovery, locator assignment, symbol IDs,
chunk/export tables, and compact resolver rows. The browser resumer does not
scan QRL-like attributes, infer event names from markup, discover chunks, or
plan symbols. CSR may use the same event-record model after `render()` creates a
live container, but CSR does not use the inline SSR resumer to avoid component
execution.

Dynamic imports are owned by a generated symbol resolver, not by each event prop.
The resolver is a page/build-scoped module or equivalent compact runtime table
that maps symbol IDs from `markless/view` to chunks and exports:

```ts
const symbolManifest = [
	1,
	'build-ab12',
	null,
	['/build/chunk-ab12.js'],
	['onKeyDown_7', 'textBinding_8'],
	{ 7: [0, 0], 8: [0, 1] },
];

const moduleUrls = symbolManifest[3];
const exportNames = symbolManifest[4];
const symbolRows = symbolManifest[5];

export function loadSymbol(id: number) {
	const row = symbolRows[id];
	if (!row) {
		throw createUnknownSymbolError(id);
	}

	return import(/* @vite-ignore */ moduleUrls[row[0]]).then((mod) => mod[exportNames[row[1]]]);
}
```

The exact resolver tuple layout is private build output. Table data may scale
with symbol count, but the executable loader source must stay constant-size: no
generated `switch (id)`, no generated `case` per symbol, and no per-node import
closures. The build integration finalizes module URL/specifier entries after
chunk emission, then the browser receives only the resolver table needed for the
current build or page, plus enough build/protocol identity to fail closed if
`markless/view` references a symbol the resolver does not know. The default
browser runtime must not fetch or parse build metadata such as the bundle
graph to discover symbol chunks; that output is build/tooling/adapter
metadata, not the runtime symbol-loading primitive.

The same resolver path is used for event handlers, DOM update symbols,
`attach={...}` behavior symbols, async computed run functions, and other lazy
runtime behavior. Captures are materialized by the runtime from graph references,
serializable constants, props/shared references, and element locators; they are
not serialized as arbitrary function closures.
