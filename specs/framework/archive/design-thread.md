# Arcade TSRX Framework — Design

**Date:** 2026-06-12
**Status:** Approved direction, pre-implementation
**Tagline:** A resumable UI framework for async-first apps.
**Package:** `@arcade/core`

## Summary

A new JavaScript framework that is fully resumable (Qwik-level: zero execution on
load, closures lazy-loaded on first interaction) without any author-facing markers
(no `$`, no `.value`, no `track()`, no `&` lazy destructuring). It achieves this by
supporting exactly one authoring language: **TSRX** (https://tsrx.dev — `.tsrx`
files, `@{}` component blocks, first-class `@if`/`@for`, co-located `<style>`).
Because the framework owns the language via a TSRX codegen plugin, the compiler
sees every component, every state creation site, every closure, and every async
boundary structurally — which is what makes marker-free resumability, async
dataflow, and a plain-value state API tractable.

The central model is: UI structure is a tree-shaped graph, but state dependencies
are a general directed graph. Current web frameworks often force that general
graph through tree-shaped tools: provider ancestry, hook call order, component
subscriptions, rerender boundaries, and hydration boundaries. This framework
does the opposite: the dataflow graph is the boundary. Components project graph
nodes into DOM; events write back into graph nodes; async work derives graph
nodes from awaited data; resumability serializes graph state and edges rather
than re-entering component trees.

JSX/TSX is explicitly **not** supported.

## Goals

1. **Full resumability.** Component bodies never execute on the client — not even
   once. The server serializes state, the reactivity graph, and listener wiring
   into HTML; a ~1KB resumer wakes up only the code a user actually interacts with.
2. **Zero markers.** No `$` suffixes, no `.value`, no `Tracked<T>` boxes, no
   special destructuring syntax, no reactive collection subclasses
   (`RippleArray`-style). The reactive surface is plain values and plain mutation.
3. **No VDOM, no re-renders.** Solid-style fine-grained architecture: templates
   compile to real DOM operations; each dynamic binding is its own subscription.
   "Signal" is an implementation detail of compiled output, never API vocabulary.
4. **TSRX-only.** State and reactivity are language features of `.tsrx` files,
   not a runtime library importable from arbitrary TS.
5. **First-class async.** Async dataflow is a compiler-tracked graph feature, not
   an effect/task/resource wrapper. Pending/error UI is expressed with TSRX
   boundaries, and async dependencies are serializable and resumable.

## Non-Goals

- TSX/JSX support, now or later.
- Reactivity in plain `.ts` files. Plain TS receives values via function calls,
  never live bindings. (This is the boundary that lets the compiler guarantee the
  no-marker property.)
- Qwik-style serialization of arbitrary lexical scopes (see Capture Rule).

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

## Architecture Overview

Five pieces:

1. **Compiler** — a TSRX codegen plugin (the framework is a TSRX compile target,
   alongside React/Solid/Vue targets). Responsible for: rewriting state reads and
   writes, compiling templates to DOM instructions, extracting closures into
   lazily-loadable symbols, splitting async derivations into key functions and
   run functions, compiling async boundaries, computing capture sets, and emitting
   diagnostics when the capture or async tracking rules are violated.
2. **Runtime** — a small fine-grained reactive core (graph cells, object state
   records, async node state, cancellation/versioning, DOM binding helpers).
   Never exposed as user vocabulary.
3. **Server renderer** — runs component bodies once on the server, renders HTML,
   awaits demanded async nodes in v1 non-streaming mode, and serializes the
   resumability payload (state values, async snapshots, subscription graph,
   listener→symbol map) into compact private data scripts in the document.
4. **Resumer** — ~1KB client bootstrap. Attaches one global event listener
   (plus a shared IntersectionObserver for `onVisible`-wired elements),
   lazy-loads symbols on first interaction or visibility, re-attaches bindings
   on first relevant state change. No hydration pass, no component execution.
5. **Build integration** — a Rolldown plugin base exported by `@arcade/core`,
   with framework adapters such as Vite consuming that base plugin. Extracted
   symbols become code-split entry points, and production builds emit the
   generated symbol resolver plus manifest metadata needed by the server
   renderer, resumer, preload/runtime graph, and cached SSR fragments.

The build architecture is Rolldown-first, not Vite-first. The base Rolldown
plugin owns compiler transforms, virtual modules, emitted symbol chunks,
manifest generation, diagnostics, and client/server/library build modes. The
Vite plugin is an adapter that wraps the Rolldown plugin with Vite-specific
environment detection, dev-server transforms, HMR, HTML/dev-tag injection, build
orchestration, and public extension APIs. This mirrors the `qwik-bundler`
structure: a reusable `rolldown` entry point is the core, and `vite` is one
consumer of it.

### Compiler implementation pipeline

The compiler implementation must be an explicit artifact pipeline, not one
monolithic AST visitor. Each compiler feature owns one pass or a small set of
passes that can be developed, tested, disabled, and debugged independently.

Think of the compiler as a set of cooperating mini compilers. Each mini compiler
has a narrow domain, its own intermediate representation or artifact shape, and
a clear boundary with the rest of the pipeline. The state compiler should not
need to know how the view payload is encoded; the sync event policy compiler
should not need to know final chunk filenames; the symbol resolver planner should
not need to re-walk source code to rediscover captures. They exchange typed
artifacts through the orchestrator.

Every pass has:

1. a stable pass ID and human-readable description
2. declared input artifact keys (`consumes`)
3. declared output artifact keys (`produces`)
4. a typed pass context containing only source files, compiler options,
   declared input artifacts, and diagnostic sinks
5. a separately runnable test fixture surface

The orchestrator validates the pass graph before running it. Missing inputs,
duplicate producers for the same artifact, dependency cycles, or undeclared
artifact reads are compiler bugs and fail loudly. Pass order may be derived from
`consumes`/`produces`, but observable behavior must not depend on hidden mutation
between unrelated passes.

Passes communicate through typed artifacts, not private shared state. A pass may
append diagnostics and produce declared artifacts; it must not reach into another
pass's internals, mutate another pass's output in place, or couple itself to the
final emitted JavaScript shape. When a later optimization needs more data, the
owning pass adds or versions an artifact instead of creating an ad hoc side
channel.

This is a stability rule for the compiler. Adding or changing a feature should
mean adding/changing the smallest relevant pass and artifact contract, not
rewiring the whole compiler. For example, state read/write lowering, async
dependency-key extraction, sync event policy extraction, capture analysis,
template/view lowering, payload arena planning, symbol resolver planning, and
final code generation are separate responsibilities even if an early prototype
runs some of them in one physical module.

Developer tooling must be able to dump artifacts after each pass in a
human-readable form. Tests should target both individual pass artifacts and
end-to-end emitted output, so a regression in event policy extraction does not
have to be diagnosed from a full generated bundle snapshot.

## State System

### Surface API

The author-facing graph data model is three intent-named words:

- `state()` creates graph state.
- `computed()` creates sync or async derived graph state.
- `shared()` creates a named graph root that can be shared across request,
  container, page, or component-library UI graph instances.

Signals, stores, subscriptions, and object-state representation are
implementation details of graph management. `onVisible` is an element event
prop, not a state primitive.
The two local-state intrinsics, available in any `.tsrx` file (components and
shared logic alike):

```tsx
export function Counter() @{
  let count = state(0);
  let double = computed(() => count * 2);

  <button onClick={() => count++}>{count} / {double}</button>
}
```

- `state(initial)` — reactive value. Read it as a plain variable; write with
  plain assignment/mutation. Scalars compile to one reactive cell; objects and
  collections compile to field/path-granular reactive data. There is no separate
  `store()` primitive.
- `computed(fn)` — lazy derived value. Read as a plain variable. Sync computeds
  re-derive from their dependencies when read. Async computeds are compiler-known
  async graph nodes with pending/error/value state, cancellation, and dependency
  keys. Computeds are not writable (no optimistic-write semantics in v1; revisit
  if real apps demand it).

```tsx
let count = state(0);
let session = state({ user: null, status: 'anonymous' });

count++; // invalidates the scalar cell
session.user = user; // invalidates only the `user` path
session.status = 'ready'; // invalidates only the `status` path
```

### DOM element handles

DOM elements are not graph state. They are host objects that may exist in the
browser, may be absent on the server, and may disappear when a conditional or
keyed item is removed.

Use `element<T>()` when lazy event code needs a typed, resumable handle to a host
element. Bind it with the framework-owned `el` prop:

```tsx
export function SearchBox() @{
  let input = element<HTMLInputElement>();

  <>
    <input el={input} />
    <button onClick={() => input?.focus()}>Focus</button>
  </>
}
```

`element()` creates an element handle, not reactive data. `el={handle}` binds that
handle to exactly one host element in the current graph scope. On the server, and
after the element is removed, reading the handle produces `undefined`. When a
lazy event or visibility handler runs in the browser, the resumer resolves the
handle's serialized DOM locator to the current element.

This covers the common design-system cases: focus registries, item navigation,
measurement, pointer capture, popover/dialog/file-picker APIs, and cross-event
DOM access. It also keeps two jobs separate:

- `element()` names an element for later imperative use.
- element behavior setup and cleanup belongs on the host node through `use`,
  not inside `element()` handles or serialized state.

`state()` cannot hold DOM nodes, and `element()` handles are not serialized as
data. Passing element handles through component context, arrays, and helpers is
valid when the values remain inside `.tsrx` compiler-owned code.

### Element behaviors

DOM-backed libraries are not durable state. Chart.js, Monaco, Mapbox, tooltips,
observers, gesture libraries, and drag/resize helpers all need a real browser
element and often need cleanup. They should not be stored in `state()` and they
should not become serializer problems.

Use the framework-owned `use` prop on host elements for node-owned DOM behavior:

```tsx
import { Chart } from "chart.js";

function chart(config: ChartConfig) {
  return (canvas: HTMLCanvasElement) => {
    const instance = new Chart(canvas, config);
    return () => instance.destroy();
  };
}

export function SalesChart({ points }: { points: Point[] }) @{
  const config = computed(() => makeChartConfig(points));

  <canvas use={chart(config)} />
}
```

`use` is the declarative bridge from imperative DOM/library code to the node
that owns it. It is similar in spirit to events and element handles:

```txt
onClick={}  runs event behavior owned by this node
el={}       gives lazy access to this node later
use={}      installs longer-lived DOM behavior owned by this node
```

The behavior result is never serialized. The server records the host element
locator, the behavior code reference, and the serializable behavior inputs. The
client resolves the element, lazy-loads the behavior symbol, runs it in the
browser, and stores the cleanup with that node.

`use` is compiler-special on host elements. In `use={chart(config)}`, the
factory call is not normal eager SSR execution. The compiler treats it as:

```txt
behavior: chart
input: config
owner: current host element
```

The v1 supported forms are:

```tsx
<input use={autofocus} />
<canvas use={chart(config)} />
<div use={[tooltip(options), clickOutside(close)]} />
```

Behavior functions receive the element and may return a cleanup function:

```ts
type ElementBehavior<T extends Element> = (element: T) => void | (() => void);
```

When behavior inputs change, v1 cleans up the existing behavior and runs it
again. Future versions may support an explicit update contract for libraries
that can update in place. Multiple behaviors install in array order and clean up
in reverse order.

`use` is host-element-only. Components can expose higher-level wrappers, but
`use` passed directly to a component is a diagnostic unless that component's
compiler output explicitly forwards it to a host element. Behavior inputs use
the same capture and serialization rules as event handlers: no request objects,
secrets, server-only modules, DOM nodes, or runtime handles may cross into a
client behavior input.

### Scoping model

A tree is a constrained graph: one root, parent/child ancestry, no arbitrary
cross-edges. UI structure is usefully tree-shaped, but state dependencies are
not. One state path may feed unrelated DOM bindings; one derived value may depend
on local state, shared request state, and another derived value; one event may
write several paths. That is a general directed graph, not a component tree.

State is therefore graph-scoped, not render-boundary-scoped. A component may
create a local graph scope during server render, but updates do not belong to
the component and never re-enter the component body on the client. Components
are just ways to create local graph scopes, attach reads/writes, and project
graph values into DOM.

`shared()` lifts that same graph model into a named dataflow. Some named graphs
are request/container/page state; others are UI graph instances used by
headless UI libraries and design systems whose pieces are authored as separate
components. This is different from hooks and context, which scope state through
render order, provider ancestry, component subscriptions, and rerender
boundaries. In this framework, the boundary is the dataflow:

```txt
where the graph instance lives
which bindings read it
which handlers write it
where it must serialize
where it must sync across runtimes
```

That distinction is core to marker-free resumability. Because the compiler owns
the dataflow graph directly, authors do not mark lazy boundaries or manually
construct state boundaries with providers; the graph itself is the resumable
unit. Resuming means loading the symbol touched by an event, materializing its
graph references, applying writes to graph nodes, and updating the DOM bindings
that actually depend on those paths.

### Loop identity

TSRX already gives `@for` optional `index` and `key` clauses:

```tsx
@for (const product of products; index i; key product.id) {
  <ProductCard product={product} />
}
```

This framework uses the `key` clause as the stable identity root for repeated
local graph scopes. A keyed loop item keeps its component instances, local
`state()`, `computed()` nodes, async nodes, DOM bindings, and event wiring
attached to the same logical item across reorder, insert, and delete operations.

Unkeyed `@for` is positional. That is acceptable for static/stateless output,
but any loop body that creates resumable graph identity must either provide a
stable domain key or explicitly key by position (`index i; key i`) when state
should follow the slot rather than the item. The compiler should diagnose
interactive or stateful unkeyed loops and point at the `@for` header:

```tsx
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
local `state()`, `computed()` nodes, async nodes, DOM bindings, event wiring,
and pending async work.

When the branch becomes active again, it creates fresh branch-local graph state
from the current parent values. This matches the no-VDOM model: conditional
rendering inserts and removes real DOM and graph subtrees directly rather than
retaining hidden virtual subtrees.

```tsx
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

```tsx
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
JSX content as `children`; computed values and render-prop-style values are
passed explicitly as `children={...}`. This framework adopts that TSRX authoring
convention. The compiler and runtime model is projection.

```tsx
export function Panel({ children }) @{
  <section>{children}</section>
}
```

`children` is not a React-style VNode array. It is an opaque compiler-owned
template projection that may be placed into the output at `{children}`. The
parent component can render it, wrap it, or pass it through to another component,
but it cannot inspect, map, clone, diff, count, or mutate the child structure.

This keeps the familiar JSX/TSRX authoring model without reintroducing VDOM
costs. Server rendering is still O(n), because emitting HTML is O(n). Client
resume must not be O(n) over the component tree: SSR emits the DOM plus graph,
event, element, async, and projection metadata, and the resumer wakes only from
serialized locators when an event, visibility trigger, async continuation, or
state write demands it.

Projection does not make the graph a tree. The DOM placement is tree-shaped, but
state and async graph nodes keep the scopes where they were created. A parent
that renders `{children}` owns only the projection site, not the child graph. If
that projection site is removed by an `@if` branch or keyed item disposal, the
projected DOM and any scopes created exclusively for that projected instance are
disposed with it.

The compiler should diagnose React-style child manipulation in v1:

```txt
children is an opaque template projection in @arcade/core.
Render it with {children}, pass it through, or wrap it; do not inspect or map it.
```

There is no separate `<Slot />` primitive in v1. Qwik needed slots to keep VDOM
projection sparse; this framework has no VDOM, so the slot-shaped concern is the
projection metadata, not an author-facing component. Named slots are deferred
unless TSRX standardizes a syntax that this host profile can adopt.

### No effects, no tasks — by design, not omission

There is no `effect()`/`task()` primitive and never will be. A computed and an
effect are the same node (a reactive computation); the only difference is that a
computed is **pull-based** (runs when read) while an effect is **push-based**
(runs because deps changed, with no consumer). That push property is exactly
what breaks resumability (eager self-waking code) and exactly what enables
spaghetti (reacting to state you don't own). Removing it yields the framework's
core invariant:

> **The entire graph is demand-driven from the DOM.** State → computed →
> bindings, where compiler-generated DOM bindings are the only effects in the
> system. Nothing computes unless the screen needs it.

The classic uses of effects each have a better home:

- _Derive state from state_ → `computed()`.
- _Fetch data from state_ → `computed(async ...)` plus a TSRX async boundary.
- _"When X changes, update Y"_ → an antipattern in every fine-grained system;
  with no render loop, every mutation originates at an identifiable site (an
  event handler), so co-locate the side work there as a plain function.
- _Sync external targets_ (`document.title`, imperative DOM) → these are
  bindings to targets the template can't express; solved at the template level,
  not with lifecycle APIs.
- _React to state you don't own_ → deliberately unsupported.
- _Eager client setup_ (third-party widgets, canvas init, observers) →
  host element behavior through `use`.

### `onVisible` — visibility as an event, not a lifecycle

Visibility is modeled as an element event, parallel to `onClick`:

```tsx
<img src={src} onVisible={() => analytics.recordImageSeen(src)} />
```

Semantics:

- An `on*` event handler where the event is "element entered the viewport."
  The resumer registers one shared IntersectionObserver for wired elements;
  the handler is extracted as a lazy symbol (capture rule applies) and loads
  only when its element first becomes visible.
- Fires once per element instance, receives the element, may return a cleanup
  that runs on element removal.
- **Not a reactive computation.** State reads inside are current-value reads —
  no subscriptions, no re-runs. DOM-backed libraries that need setup, updates,
  and cleanup belong in `use`, not `onVisible`.
- The zero-JS guarantee gets a _scoped_, greppable asterisk: pages without
  `onVisible` ship zero eager behavior; pages with it run exactly the symbols
  whose elements are on screen. There is no free-floating equivalent
  (`onMount()`, `client()`) and there never will be — anything without an
  element doesn't belong in a component.

A pure pull graph also deletes a class of resumability hazards: resume is
always re-derivation, with no effect-ordering or "did it already run on the
server" semantics to replay.

This matters double in the AI age: with one way to express any data flow
(derive it), generated code is reviewable by construction — stale-closure
effects, dependency-array bugs, and effect-ordering races are not lintable
mistakes here, they are unrepresentable. (Prior art: Ryan Carniato's
derived-first direction for Solid 2.0 — "you don't need effects; computed is
your effect.")

### Async derivation and TSRX boundaries

Async is v1 core, not a deferred resource layer. Without a first-class async
path, users will rebuild effects by hand with `loading`, `error`, and `data`
state. The framework instead treats async as derived graph state:

```tsx
function UserRoute() @{
  const user = computed(async ({ signal }) => {
    const id = route.params.userId;

    const res = await fetch(`/api/users/${id}`, { signal });
    if (!res.ok) throw new Error("Failed to load user");

    return await res.json();
  });

  @try {
    <Profile user={user} />
  } @pending {
    <Spinner />
  } @catch (err) {
    <ErrorView error={err} />
  }
}
```

Semantics:

- `computed(async ({ signal }) => ...)` creates a lazy async graph node. It does
  not run at creation; it runs only when demanded by a DOM binding or TSRX async
  boundary.
- Reactive reads before the first `await` form the dependency key for the async
  node. When that key changes, the runtime creates a new request version.
- Reactive reads after the first `await` are a compile-time diagnostic. Snapshot
  the value before awaiting, or split the logic into an async computed plus a
  sync computed:

```tsx
const rawUser = computed(async ({ signal }) => fetchUser(route.params.userId, signal));
const formattedUser = computed(() => formatUser(rawUser, locale));
```

- Sync computeds may depend on async computeds. They become
  async-pending-capable transitively and must still be read under an async
  boundary if their upstream async value can be pending or rejected.
- The runtime passes an `AbortSignal` to async computeds. On dependency-key
  change or disposal, stale work is aborted when possible; stale promise
  resolutions are ignored even if the underlying operation cannot abort.
- `@try` / `@pending` / `@catch` is the only v1 UI mechanism for observing async
  pending/error state. There is no public `resource()`, `.loading`, `.error`, or
  `track()` API.
- A template read of an async computed must be dominated by an async boundary.
  Missing boundaries are compile-time diagnostics in v1. A future router may
  provide route-level implicit boundaries, but the v1 compiler should keep the
  rule explicit.
- In v1 non-streaming SSR, the server awaits all demanded async nodes inside
  rendered boundaries before emitting final HTML. Streaming, out-of-order
  flushing, stale-while-revalidate, and explicit cache policy are separate
  features.
- On client revalidation, a dependency-key change returns the boundary to
  `@pending` for the new key. Stale-content and cached-key policies are deferred.

Internally, the compiler can lower the single author-facing function into a
resource-shaped pair:

```ts
_asyncComputed({
	key: () => ({ id: route.params.userId }),
	run: async ({ key, signal }) => fetchUser(key.id, signal),
});
```

That split is an implementation model, not public API. It keeps the authoring
surface aligned with JavaScript `async`/`await`, while giving the runtime the
explicit dependency key, cancellation hook, version counter, and serialization
record required for resumability.

Rationale: runtime-only tracking systems lose dependencies after `await` unless
users manually read them before suspension; Qwik solves that with `track()`, and
Vue/Angular document the same synchronous-tracking constraint. Svelte's compiler
can recover some async dependencies in compiler-visible expressions. This
framework takes the TSRX-only route: no marker, but strict compiler diagnostics
at the async boundary.

The state, async, element, event, and element-behavior primitives are
**compiler intrinsics**, not imports of a value type. There is no
`Signal`/`Tracked` type in the public API. Event handler props are camelCase
(`onClick`, `onInput`), matching TSRX/JSX convention — no directive namespace.
Element handles use the host prop `el`, which only accepts `element()` handles.
Element behaviors use the host prop `use`, which only accepts compiler-known
element behavior expressions.

Event and behavior props accept either one expression or an array of expressions:

```tsx
<button onClick={[saveDraft, closeDialog]} />
<div onVisible={[recordImpression, preloadDetails]} />
<canvas use={[chart(config), resizeCanvas]} />
```

For `on*` event props, array entries run in authored order. The runtime stops at
the first thrown or rejected entry and routes the error through the normal error
boundary path. Return values are ignored for ordinary events. For event props
with lifecycle cleanup semantics such as `onVisible`, returned cleanup functions
are stored and later run in reverse order.

Event handlers are lazy-loaded behavior, so the browser cannot wait for handler
chunks before deciding default actions. For v1, only browser-critical
cancellation/propagation is allowed to run synchronously. When the compiler sees
`event.preventDefault()` or `event.stopPropagation()` inside an event handler, it
tries to extract the smallest equivalent sync policy from the surrounding
condition. That policy may read only already-resumed framework graph state,
serializable constants/props, and simple event fields. It may not import code,
call arbitrary user functions, await async work, read DOM resources, or perform
graph writes in v1. State writes remain in the lazy handler chunk.

```tsx
let menuOpen = state(false);

<input
	onKeyDown={(event) => {
		if (menuOpen && event.key === 'Escape') {
			event.preventDefault();
			menuOpen = false;
		}
	}}
/>;
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

For `use`, behavior entries install in authored order and clean up in reverse
order. Each behavior has its own serialized input and code reference, so one
behavior can be lazy-loaded or diagnosed independently from the others.

`state()`/`computed()` may be created anywhere in a call tree rooted in a
component or shared instance — including helper functions in non-component
`.tsrx` files. Creation at **module scope** is a compile-time
diagnostic in v1: module-scope state would be shared across requests on the
server and has no home in the per-document serialization payload. Request,
container, and page state is declared with `shared()` definitions instead.

### Implementation: compiler-owned graph state

**Primitives (compiler-rewritten).** The compiler knows every `state()`/`computed()`
creation site statically, so every read of that binding compiles to a graph read
(`_get(count)`) and every write to a graph write — including reads inside
closures, template expressions, destructured aliases, and non-component helper
functions in `.tsrx` files. Reactivity crosses `.tsrx` function boundaries with
zero ceremony; "transporting reactivity" is not a concept users need.

**Objects and collections.** `state(obj)` supports objects, arrays, `Map`, `Set`,
and `Date` without a separate `store()` primitive or reactive collection
subclasses. `user.profile.name = x` and `items.push(x)` are graph writes with
path-level invalidation semantics, so a deep mutation updates only the bindings
that read that path.

Object identity is part of the state graph contract. If two state paths point to
the same object before SSR serialization, they point to the same object after
resume:

```ts
const user = { id: 1 };
let task = state({ author: user, assignee: user });

// After resume:
task.author === task.assignee; // true
```

Cycles are supported when every reachable value is otherwise serializable:

```ts
const user = { id: 1, manager: null as null | typeof user };
user.manager = user;
let session = state({ user });

// After resume:
session.user.manager === session.user; // true
```

The serializer fails because a reachable value is unsupported, not because the
graph is circular. Diagnostics must point at the unsupported state path:

```txt
Cannot serialize state.session.user.socket because WebSocket is a live runtime
object. Move it to a host element behavior or recreate it from serializable
state.
```

The concrete object-state representation is private and may vary by target or
optimization level. The public contract is plain JavaScript read/write syntax,
path-granular dependency tracking, identity-preserving serialization, and no
author-facing marker type.

A pure-compiler approach (Svelte-4-style static dependency tracking) is rejected
outright: resumability requires a reified runtime graph, because the graph is
exactly what gets serialized.

### Destructuring

Destructuring from a known-reactive source (props, a `state()` object) compiles
to alias bindings: `const { x } = props` means every later read of `x` emits
`props.x`. No `&` marker, no lost reactivity. This is the Svelte 5 `$props()`
behavior generalized to all compiler-known reactive sources. Rest/spread of a
reactive source produces live forwarding fields rather than a value snapshot.
That rule is what makes returning a state object plus methods from `shared()`
ergonomic: `return { ...s, login() { ... } }` preserves `s.user` as a graph
reference.

### Props

Component props are getter-backed; reads inside the child re-read the parent's
graph. Destructuring in the parameter list is auto-aliased as above.

### Shared state — `shared()`

There is no `context()` and no `store()`. React-style context makes authors
create tree boundaries (`Provider`, context IDs, wrapper hooks) for data that is
usually just named dataflow: auth, i18n, cart, feature flags, current org, route
cache, websocket state, or component-library state shared by root/trigger/item/
content pieces. `shared()` names that dataflow directly.

```tsx
// session.tsrx - definition only; module scope holds no instance
export const session = shared(() => {
  const s = state({
    user: null,
    status: "anonymous",
  });

  const signedIn = computed(() => s.user !== null);

  return {
    ...s,
    signedIn,

    async login(creds) {
      s.status = "loading";
      s.user = await loginUser(creds);
      s.status = "ready";
    },

    logout() {
      s.user = null;
      s.status = "anonymous";
    },
  };
});

function Header() @{
  const s = session();

  @if (s.signedIn) {
    <Avatar user={s.user} />
  }
}
```

`session()` does not mean "run a hook." It means: resolve this named dataflow
instance for the current graph context. For app data, that graph context is
usually request/container/page. The instance is created on the server,
serialized into the graph payload, resumed lazily on the client, and
synchronized by serialized patch events only when it crosses container/runtime
boundaries.

```txt
shared definition
  -> request-scoped server instance
  -> serialized graph snapshot
  -> lazy client graph instance
  -> CustomEvent patches across container/runtime boundaries
```

Semantics:

- **Identity:** compiler-emitted stable ID per definition (package + export
  name). No `createContextId`, and IDs survive serialization and
  separately-built bundles.
- **Resolution:** a bare call resolves the active instance of that shared
  definition for the current graph context. There is no `provide()` or
  `create()` in v1. For request/page data, the active instance is the
  request/container/page instance. For headless UI and design-system components,
  the active instance is the compiler-owned UI graph instance serialized for
  that widget. Multiple widgets get distinct graph instances through normal
  component, key, and projection identity; event/resume symbols carry the graph
  instance ID they were rendered with.
- **Boundaries are dataflow, not components.** The framework tracks who reads,
  who writes, which runtime owns the instance, and where the state must
  serialize or sync. Authors do not place provider components to define those
  boundaries.
- **Local writes are graph writes.** Inside one container, `s.user = user`
  mutates the local reactive graph directly. Custom events are not the state
  engine.
- **Cross-runtime writes are event patches.** When a shared instance spans
  nested containers, sibling micro-frontends, or a page shell boundary, the write
  additionally emits a versioned `CustomEvent` carrying plain serialized data.
  Other runtimes fold the patch into their own local graph.
- **State crosses bundles; code does not.** Separately-built containers may each
  bundle their own `session.login()` implementation. They synchronize through
  shared definition IDs and data patches, not shared JS object identity.

Rationale receipts (GitHub code search, June 2026): ~75% of React `useContext`
call sites are hidden behind hand-rolled bare-call wrappers (`useAuth()`-style,
~24k files) - when most users wrap an API before using it, the wrapper is the
correct primitive. ~12k files hand-write orphan-provider errors, which this
model deletes for root/request state instead of pushing into userland. Zustand's
define-then-bare-call shape appears in ~60k files, with its ~21k selector call
sites being pure re-render tax that a fine-grained graph deletes.

#### Shared examples

**Request session**

```tsx
export const session = shared(() => {
  const s = state({ user: null, status: "anonymous" });

  return {
    ...s,
    async login(creds) {
      s.status = "loading";
      s.user = await loginUser(creds);
      s.status = "ready";
    },
  };
});

function AccountButton() @{
  const s = session();

  <button onClick={() => s.login(creds)}>
    {s.user ? s.user.name : "Sign in"}
  </button>
}
```

**Composition between shared definitions**

Factories may call other shared definitions. The call resolves from the creation
context of the instance, so composed state keeps request/container isolation.

```tsx
export const cart = shared(() => {
	const s = session();
	const c = state({ id: 'current', items: [] });

	const total = computed(() => {
		const subtotal = c.items.reduce((sum, item) => sum + item.price, 0);
		return applyCustomerPricing(subtotal, s.user);
	});

	return {
		...c,
		total,
		add(item) {
			c.items.push(item);
		},
	};
});
```

The compiler can see shared-definition dependencies and should reject circular
definition graphs with a diagnostic that prints the cycle.

**Page-shell and micro-frontend state**

```tsx
export const shell = shared(() => {
  const s = state({
    sidebarOpen: false,
    activeCartId: null,
  });

  return {
    ...s,
    toggleSidebar() {
      s.sidebarOpen = !s.sidebarOpen;
    },
  };
});

// Header bundle
function HeaderCartButton() @{
  const s = shell();
  const c = cart();

  <button onClick={() => {
    s.activeCartId = c.id;
    s.sidebarOpen = true;
  }}>
    Cart
  </button>
}

// Sidebar bundle, built separately
function CartSidebar() @{
  const s = shell();

  @if (s.sidebarOpen) {
    <aside>{s.activeCartId}</aside>
  }
}
```

The two bundles share live state without sharing code. The header write updates
its local graph and emits a serialized patch for the `shell` shared ID; the
sidebar runtime folds that patch into its own graph.

**Headless UI / design-system graph**

Compound components often split one widget across separately authored pieces:
root, trigger, content, item, label, indicator. Qwik Design System solves this
with Qwik context because Qwik needs a provider mechanism. In this framework,
the same pattern is a named graph.

```tsx
// select.tsrx - definition only; module scope holds no instance
export const select = shared(() => {
  const s = state({
    open: false,
    value: null,
    highlightedIndex: null,
    itemValues: [] as string[],
  });

  return {
    ...s,
    choose(value: string) {
      s.value = value;
      s.open = false;
    },
  };
});

export function SelectRoot({ children }) @{
  const s = select();

  <div data-open={s.open}>{children}</div>
}

export function SelectTrigger() @{
  const s = select();

  <button onClick={() => s.open = !s.open}>
    {s.value ?? "Select"}
  </button>
}

export function SelectItem({ value, children }) @{
  const s = select();

  <div onClick={() => s.choose(value)}>{children}</div>
}
```

All three components read and write the same select graph instance for that
rendered widget. A second `<SelectRoot>` gets a different graph instance. No
provider component, context ID, wrapper hook, or tree-shaped public API is
introduced; the compiler/runtime records graph instance identity in the same
SSR/resume metadata used for events, projection, keyed loops, and DOM bindings.

**Self-contained local widget state**

Self-contained component instances usually do not need `shared()`. Their
boundary is local ownership, so ordinary `state()` is enough.

```tsx
export function Select({ options }) @{
  const s = state({ open: false, value: null });

  <button onClick={() => s.open = !s.open}>{s.value ?? "Select"}</button>

  @if (s.open) {
    <ul>
      @for (const option of options; key option.value) {
        <li onClick={() => {
          s.value = option.value;
          s.open = false;
        }}>
          {option.label}
        </li>
      }
    </ul>
  }
}
```

This keeps `shared()` from replacing local state. Use `state()` for
self-contained component state. Use `shared()` when a named graph must be
resolved by multiple independently-authored pieces, across a request/page or
inside a design-system widget.

## Resumability

### Extraction is the compilation model

Qwik requires `$` because it operates on arbitrary TS where extraction must be
opt-in. Here the boundaries are structural and the compiler already knows them.
Every one of the following is extracted into its own lazily-loadable symbol, with
no annotation:

- event handler expressions (`onClick={...}`, `onVisible={...}`), including
  each entry in event handler arrays
- element behavior expressions (`use={...}` on host elements), including each
  entry in behavior arrays
- `computed()` bodies
- async computed run functions and async boundary branch bindings
- DOM binding expressions (text/attribute bindings — the system's only effects)
- component bodies (executed on the server only)

### Symbol loading and event wiring

Extracted symbols are lazy-loaded, but normal framework-owned wiring does not
turn into QRL-like user values or per-node DOM closures. Authored event props
compile to encoded `arcade/view` records:

```txt
DOM locator + event name + optional sync policy IR + ordered handler symbol IDs
```

The generated HTML does not need an `onClick={async (...) => import(...)}` shape,
and production output should not require per-node event attributes. The
`arcade/view` arena locates nodes by DOM-order streams, skip runs, branch anchors,
or other private locator data, then the resumer builds internal side tables such
as `WeakMap<Element, EventRecord>`.

Dynamic imports are owned by a generated symbol resolver, not by each event prop.
The resolver is a page/build-scoped module or equivalent compact runtime table
that maps symbol IDs from `arcade/view` to chunks and exports:

```ts
export function loadSymbol(id: number) {
	switch (id) {
		case 7:
			return import('/assets/menu.handlers.ab12.js').then((mod) => mod.onKeyDown_7);
		case 8:
			return import('/assets/menu.bindings.cd34.js').then((mod) => mod.textBinding_8);
		default:
			return Promise.reject(new Error(`Unknown async symbol ${id}`));
	}
}
```

The exact resolver syntax is private build output. The full symbol manifest is a
build/server artifact. The browser receives only the resolver/table needed for
the current build or page, plus enough build/protocol identity to fail closed if
`arcade/view` references a symbol the resolver does not know.

The same resolver path is used for event handlers, DOM binding symbols,
`use={...}` behavior symbols, async computed run functions, and other lazy
runtime behavior. Captures are materialized by the runtime from graph references,
serializable constants, props/shared references, and element locators; they are
not serialized as arbitrary function closures.

### The Capture Rule (replaces the marker)

An extracted closure may capture only:

1. `state()` / `computed()` references — serialized as graph references, not values
2. `element()` handles — serialized as DOM locators, not DOM nodes
3. props and `shared()` instance references
4. module-level imports — re-imported by the emitted symbol module
5. serializable constants (JSON-compatible values, plus the framework's extended
   set: Date, RegExp, Map, Set, URL, BigInt, typed arrays, ArrayBuffer)

Capturing anything else — a local class instance, a raw function, a DOM node held
in a plain variable — is a **compile-time diagnostic** pointing at the exact
variable, explaining why it can't cross a resume boundary and what to do instead
(usually: make it state, make it an `element()` handle, hoist it to module scope,
derive it inside the closure, or move DOM-backed setup into a host element
behavior with `use`). The diagnostic does the job Qwik's `$` does, but only fires
when something is actually unserializable instead of taxing every line.
Diagnostic quality is a first-class deliverable, not polish.

### Serialization tiers

Serialization is for durable graph state, not runtime resources. `computed()`
and `use={...}` deliberately remove most expensive cases from the serializer:
derived values are recreated, and DOM-backed libraries are owned by the host
node that uses them.

The serializer checks reachable graph values in this order:

1. **Built-ins** — primitives, plain objects, arrays, `Date`, `RegExp`, `Map`,
   `Set`, `URL`, `BigInt`, typed arrays, and `ArrayBuffer`. Object identity and
   cycles are preserved across the whole serialized graph.
2. **Framework graph values** — `state()` references, `shared()` roots, async
   snapshots, code references, event references, element handles, and behavior
   references. These serialize as framework IDs/locators, not as user objects.
3. **App-owned value classes** — importable classes defined in app source whose
   durable state is represented by serializable own fields. Methods are code,
   not data, so method bodies are never serialized.
4. **Third-party value classes** — importable third-party classes with
   serializable own fields and prototype methods that do not depend on hidden
   constructor-only state. These use the same restore path as app-owned classes.
5. **Recreated values** — derived objects that should not be durable state belong
   in `computed()`. The serialized graph stores their dependencies, then rebuilds
   the value lazily after resume.
6. **DOM/resource behavior** — values that need a live element, browser API,
   observer, editor, chart, map, canvas context, worker, socket, or cleanup
   belong in `use={...}` or server/meta-framework code. The serializer stores
   only the behavior code reference and serializable inputs.
7. **Unsupported values** — private hidden state, WeakMap-only state, live DOM
   nodes, request objects, secrets, DB clients, streams, native handles, and
   other values that cannot be restored from safe durable data.

Class restoration is prototype restoration, not constructor re-execution. For an
app-owned or third-party value class, the runtime imports the class and restores
the instance as if it had done:

```ts
const instance = Object.create(Class.prototype);
Object.assign(instance, serializedOwnFields);
```

Constructors do not run during resume. Public own fields are durable data;
prototype methods are imported behavior. Private fields are only supported when
they are initialized from serialized public state by an explicit library adapter
or by recreating the value in `computed()`. `toJSON()`/`fromJSON()` may be used by
library adapters, but ad hoc class serialization is not the default authoring
model.

If a class wraps DOM or runtime resources, it is not a value class. Put the
resource setup on the host element with `use={...}` or recreate it from
serializable state.

### Serialization payload

The server renderer emits, alongside the HTML:

1. **State values** — object state serializes with the tiered serializer above.
   Sync `computed()` values are _not_ serialized; they re-derive lazily from
   their dependencies on first read.
2. **Async snapshots** — demanded async computed IDs, dependency keys, request
   versions, status (`pending`, `resolved`, `rejected`), and settled value/error
   data when available. This prevents resume from refetching data the server
   already resolved.
3. **Shared instances** — shared definition IDs, request/container/page scope,
   version counters, and the plain state snapshot for each touched shared
   instance. Methods/actions are never serialized.
4. **Subscription graph** — which symbol (binding, computed, async dependency
   key) depends on which state path.
5. **Wiring** — DOM element → event → optional sync event policy plus ordered
   symbol list for listeners, and DOM element → binding-symbol map for dynamic
   text/attributes/async boundaries.
6. **Element handles** — `element()` handle IDs mapped to DOM locators emitted by
   `el={handle}` bindings. The payload identifies where the element is; it never
   serializes the element object itself.
7. **Element behaviors** — host element locators mapped to ordered behavior
   symbol IDs and serialized behavior inputs from `use={...}`. The payload never
   serializes the behavior result, DOM-backed class instance, observer, editor,
   map, chart, canvas context, or cleanup function.

State and shared snapshots use an identity table, not naive JSON tree cloning.
Every serializable object, array, collection, or restorable class instance gets a
payload ID. Repeated references encode that ID, and cyclic graphs allocate shells
first before fields/entries are filled. This preserves object identity while
still rejecting unsupported values at their exact graph path.

Payloads are specified as logical arenas, not as public object-shaped JSON:

1. **State arena** — graph cells, typed roots, object/collection/class refs,
   async snapshots, shared snapshots, constants, backrefs, and forward refs.
2. **View/wiring arena** — DOM locator stream, listener symbol IDs, sync event
   policies, binding records, element handle locators, async boundary anchors,
   and `use={...}` host metadata.

Production payloads should encode all arena data into compact private data
scripts, rather than relying on verbose JSON objects or scattered per-node
attributes. By default, the core renderer emits two inert data scripts:

```html
<script type="arcade/state">
	...
</script>
<script type="arcade/view">
	...
</script>
```

`arcade/state` carries the state arena. `arcade/view` carries the view/wiring
arena. The renderer may merge, split, or stream these payloads when the
resumer/runtime protocol supports it, but these two script types are the
canonical core containers and the names used by documentation, devtools, and
diagnostics. Token alphabets, tag IDs, table layouts, and compression choices
inside those scripts are private renderer/resumer protocol.

The production wire format should optimize for HTML size and parse cost:
typed tables or arenas, small numeric/string tags, root IDs, backrefs/forward
refs, and DOM-order skip runs for static nodes are all expected tools. The
view/wiring arena encodes metadata for the existing DOM; it is not a public
VNode format and does not imply a client VDOM or component re-render path.

### View locator materialization

The v1 `arcade/view` locator model uses a browser-native `TreeWalker` over
`ELEMENT` and `COMMENT` nodes to materialize encoded DOM-order records onto the
existing server-rendered DOM. This is a locator-decoding step only:

```txt
arcade/view locator stream
-> TreeWalker over existing DOM
-> skip static nodes and ignored/nested regions
-> attach records to real elements/comment anchors
```

The resumer stores the result in internal side tables such as:

```ts
WeakMap<Element, EventRecord | BindingRecord | BehaviorRecord>;
Map<number, Comment>;
```

Element records attach to real DOM elements. Comment records are reserved for
dynamic anchors such as branches, keyed lists, async boundaries, fragments, and
streamed/patch segments. Static nodes should have no per-node attributes and no
runtime record.

This is deliberately not VDOM recovery. The `TreeWalker` pass does not
materialize component VNodes, child VNode trees, or client render functions. It
only maps compact `arcade/view` metadata to existing DOM nodes so later graph
writes, events, visibility triggers, and behavior setup can address those nodes
directly.

Development output must remain debuggable. Dev mode may emit a more readable
encoding, but production compactness remains the contract. The runtime and tools
must provide a decoded human-readable dump of the private payload so authors can
inspect why state, listeners, sync policies, bindings, or element behaviors were
included.

### Resume behavior

- One global delegated event listener (capture phase) from the resumer.
- Before importing handler symbols, the delegated listener evaluates any
  compiler-emitted sync event policy for the target/event. This is the only v1
  path for synchronous `preventDefault()` / `stopPropagation()` behavior. The
  policy reads the already-materialized graph data plane by ID; it does not load
  app chunks or execute component/handler code.
- First interaction: look up the ordered symbol list for that element/event,
  resolve each symbol through the generated symbol resolver, materialize its
  captured graph references and element handles, and run handlers in authored
  order. The resolver owns the dynamic import; event props are only encoded
  symbol IDs in `arcade/view`.
- Element handles resolve from serialized DOM locators at handler execution time.
  If the element was removed or the locator no longer matches, the handle reads
  as `undefined`.
- Element behaviors resolve from serialized DOM locators when the host element is
  connected on the client. The resumer imports the behavior symbol, materializes
  its serialized inputs, runs the behavior with the element, and stores cleanup
  on the node. Behavior input changes clean up and rerun the behavior. Removed
  nodes clean up their behaviors before their locators are discarded.
- State writes during that run propagate through the graph; subscribed binding
  symbols are loaded on demand and update the DOM in place. Nothing re-renders;
  there is no component re-execution path in the client runtime at all.
- Async computed invalidation aborts the prior request version, imports the async
  run function only when a visible/demanded boundary needs it, and applies only the
  newest matching result to the graph.
- If a write touches a shared instance that spans a container/runtime boundary,
  the local graph write additionally emits a versioned `CustomEvent` patch. The
  exact event name and encoding are private runtime protocol, but the shape is
  plain data:

```ts
{
  id: "pkg/session#session",
  scope: "page",
  version: 42,
  patch: [
    ["set", ["user"], user],
    ["set", ["status"], "ready"],
  ],
}
```

## Diagnostic System

Diagnostics are a first-class framework surface, not polish. The compiler and
runtime must explain mistakes in terms junior developers and AI agents can act
on without reverse-engineering the framework. Every important error should answer
four questions:

1. What happened?
2. Why is it invalid in this framework?
3. What should change?
4. Where can I read more?

All diagnostics use one structured shape across compiler and runtime:

```ts
type Diagnostic = {
	code: string; // stable, e.g. "ARCADE_CAPTURE_DOM_NODE"
	severity: 'error' | 'warning' | 'info';
	phase:
		| 'parse'
		| 'state-lowering'
		| 'capture-analysis'
		| 'sync-policy'
		| 'serialization'
		| 'payload'
		| 'resume'
		| 'runtime';
	title: string;
	message: string;
	why: string;
	primarySpan?: SourceSpan;
	secondarySpans?: LabeledSpan[];
	passId?: string;
	artifactKeys?: string[];
	statePath?: string;
	symbolId?: string;
	elementLocator?: string;
	suggestions: Suggestion[];
	docsUrl: string;
};
```

Human output must be consistent: stable code, short title, source location,
code frame, explanation, and concrete fix. When the compiler can safely suggest
a rewrite, it should include before/after text or an autofix range. When it
cannot safely rewrite, it still gives a precise migration path.

Example shape:

```txt
ARCADE_CAPTURE_DOM_NODE: Cannot capture a DOM node in a lazy event handler

src/Menu.tsrx:13:27
  12 | const menuEl = document.querySelector("#menu");
  13 | <button onClick={() => menuEl.focus()} />
                              ^^^^^^ captured here

Why:
  Lazy handlers run after resume. A live DOM node cannot be serialized into
  arcade/state or recovered from a JavaScript closure.

Fix:
  Use element() plus el={...}, then read the element handle inside the handler.

Before:
  const menuEl = document.querySelector("#menu");

After:
  const menu = element<HTMLElement>();
  <div el={menu} />
```

Machine output must be available as JSON for editor integrations, tests, and AI
agents. JSON diagnostics include stable `code`, exact spans, `phase`, `passId`,
`artifactKeys`, and structured suggestions. Human wording may improve over time;
codes and machine fields are compatibility surface.

Diagnostic documentation follows the stable code:

```txt
https://corejs.dev/errors/ARCADE_CAPTURE_DOM_NODE
```

Runtime diagnostics must link back to compiler artifacts whenever possible. A
resume failure should name the symbol ID, source span, payload script, expected
build/protocol hash, and actual resolver/runtime hash. A serialization failure
should include the state path and value kind. A behavior failure should include
the host locator and behavior symbol. This makes runtime errors actionable
without requiring users to inspect compact payload encoding.

Required compile-time diagnostics include capture-rule violations,
`state()`/`computed()` used outside a `.tsrx` reactive scope, reactive reads
after `await` in async computed bodies, async reads outside an async boundary,
`el` used with a non-`element()` handle, one `element()` handle bound to multiple
live host elements, an element handle stored in `state()` or serialized data,
unserializable initial state, and unextractable sync event policy for
`preventDefault()` / `stopPropagation()`.

Runtime dev diagnostics fail loudly with the same structured shape.
Serialization failures at SSR time include state path and value kind. Async
result serialization failures include async computed ID and dependency key.
Resumer errors include symbol ID, graph reference, payload script, and
version/hash mismatch details.

Runtime production errors may minimize human text, but they still preserve the
stable code, docs URL, and structured metadata for the app-level error hook.
Symbol load failures retry once, then surface through that hook.

## Testing Strategy

- **Compiler:** pass-level artifact tests plus final-output snapshots per
  language feature (state rewrite, destructuring aliasing, async dependency-key
  extraction, post-await diagnostics, boundary lowering, extraction, sync event
  policy extraction, capture diagnostics). Each pass has fixtures for
  input artifacts → output artifacts/diagnostics; full compiler snapshots still
  cover input `.tsrx` → emitted JS + symbol resolver/manifest.
- **Runtime:** unit tests on the graph (dependency tracking, path-level
  subscriptions, lazy computed, async computed status/versioning/cancellation).
- **Resumability end-to-end:** render a fixture app on the server, load it in a
  headless browser with **zero framework JS executed**, assert no execution before
  interaction, assert server-resolved async data does not refetch on resume, then
  interact and assert only the expected symbols were fetched and the DOM updated.
  This e2e harness is the core invariant check and gets built early, not last.

## Deferred Decisions

Deliberately out of scope for the first implementation plan, to be designed when
their prerequisites exist:

- Keeping imperative third-party state in sync after `onVisible` init (the
  `chart.update` problem), plus possible `onVisible` variants (idle trigger,
  `onHidden`).
- Async caching policy beyond "current dependency key", stale-while-revalidate
  UI, manual refresh/invalidation APIs, and prefetch policy.
- Writable `computed()` (optimistic state).
- Streaming SSR / out-of-order flushing.
- Server functions / RPC story.
- Devtools (graph visualization).

## Build Order (high level)

1. Reactive runtime core (graph + object state + async node status/versioning) —
   pure TS, testable standalone.
2. Compiler: state rewriting + template codegen for client-side rendering (CSR
   mode first, to validate the language surface without serialization).
3. Async computed lowering + `@try`/`@pending`/`@catch` boundary lowering.
4. Closure extraction + capture analysis + diagnostics.
5. Server renderer + serialization + resumer; e2e resumability harness.
