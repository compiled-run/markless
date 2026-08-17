# State Graph

Author-facing graph state semantics, async derivation, shared state, identity, and graph serialization requirements.

## State System

### Surface API

The author-facing graph data model is three intent-named APIs imported from
`@markless/core`:

- `state()` creates graph state.
- `computed()` creates sync or async derived graph state.
- `shared()` creates a named graph root that can be shared across request,
  container, page, or component-library UI graph instances.

Signals, stores, subscriptions, and object-state representation are
implementation details of graph management. `onVisible` is an element event
prop, not a state primitive.
The two local-state APIs, available in any `.tsrx` file (components and shared
logic alike), must be imported by the file that uses them:

```tsrx
import { state, computed } from '@markless/core';

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
  re-derive from their dependencies when read; re-derivation reconciles into the
  same node so only changed paths invalidate. Async computeds are compiler-known
  async graph nodes with pending/error/value state, cancellation, and dependency
  keys. Computeds are not writable (no optimistic-write semantics in v1; revisit
  if real apps demand it).

```tsrx
import { state } from '@markless/core';

let count = state(0);
let session = state({ user: null, status: "anonymous" });

count++;                  // invalidates the scalar cell
session.user = user;      // invalidates only the `user` path
session.status = "ready"; // invalidates only the `status` path
```

### Scoping model

A tree is a constrained graph: one root, parent/child ancestry, no arbitrary
cross-edges. UI structure is usefully tree-shaped, but state dependencies are
not. One state path may feed unrelated DOM updates; one derived value may depend
on local state, shared request state, and another derived value; one event may
write several paths. That is a general directed graph, not a component tree.

State is therefore graph-scoped, not render-boundary-scoped. A component may
create a local graph scope during initial render, but updates do not belong to
the component and never re-enter the component body during browser resume.
Components are just ways to create local graph scopes, attach reads/writes, and
project graph values into DOM.

`shared()` lifts that same graph model into a named dataflow. Some named graphs
are request/container/page state; others are UI graph instances used by
headless UI libraries and design systems whose pieces are authored as separate
components. This is different from hooks and context, which scope state through
render order, provider ancestry, component subscriptions, and rerender
boundaries. In this framework, the boundary is the dataflow:

```txt
where the graph instance lives
which DOM updates read it
which handlers write it
where it must serialize
where it must sync across runtimes
```

That distinction is core to marker-free resumability. Because the compiler owns
the dataflow graph directly, authors do not mark lazy boundaries or manually
construct state boundaries with providers; the graph itself is the resumable
unit. Resuming means loading the symbol touched by an event, materializing its
graph references, applying writes to graph nodes, and running the DOM updates
that actually depend on those paths.

### No effects, no tasks — by design, not omission

There is no `effect()`/`task()` primitive and never will be. A computed and an
effect are the same node (a reactive computation); the only difference is that a
computed is **pull-based** (runs when read) while an effect is **push-based**
(runs because deps changed, with no consumer). That push property is exactly
what breaks resumability (eager self-waking code) and exactly what enables
spaghetti (reacting to state you don't own). Removing it yields the framework's
core invariant:

> **The entire graph is demand-driven from the DOM.** State → computed →
> DOM updates, where compiler-generated DOM update symbols are the only effects in the
> system. Nothing computes unless the screen needs it.

The classic uses of effects each have a better home:

- _Derive state from state_ → `computed()`.
- _Fetch data from state_ → `computed(async ...)` plus a TSRX async boundary.
- _Streams, sockets, async iterators_ → event sources that write into state at
  the site that owns the source (a handler or an `attach` behavior); derived
  values never mutate. A token append is a state write, and a derived transcript
  reconciles so only the changed message re-checks.
- _"When X changes, update Y"_ → an antipattern in every fine-grained system;
  with no render loop, every mutation originates at an identifiable site (an
  event handler), so co-locate the side work there as a plain function.
- _Sync external targets_ (`document.title`, imperative DOM) → these are DOM
  updates to targets the template can't express; solved at the template level,
  not with lifecycle APIs.
- _React to state you don't own_ → deliberately unsupported.
- _Eager browser setup_ (third-party widgets, canvas init, observers) →
  host element behavior through `attach`.

### Derived reconciliation

A computed keeps one persistent graph node. Each re-derivation produces a new
value; the runtime structurally reconciles that value against the node's
previous value and invalidates only the paths that changed.

- Objects reconcile by field. A field that did not change invalidates nothing.
- Arrays reconcile by key when a key is declared for that array through the
  runtime option `reconcile.keyed[{ path, keyPath }]` on the computed node,
  where `path` names an array inside the derived value and `keyPath` is read on
  each element. Without a declared key, arrays reconcile by element identity.
  Index is never identity on its own: two different elements at the same
  position are never reported as the same element.
- Keys must be well formed for keyed matching to apply. In a declared-keyed
  array, every element on both the previous and the next side must have a key
  (reading `keyPath` must not produce `undefined`), and keys must be unique
  within each side. If either side breaks that rule, the array falls back to
  structural reconciliation and the array's own path is reported: the runtime
  never matches the well-formed part by key and the rest by index, and never
  matches by index. Falling back is silent in production because the result is
  still correct, only coarser; a debug-enabled build reports a diagnostic naming
  the array path and the offending key. A key that changes for the element at
  the same slot is not a malformed array — it is an ordinary keyed mismatch,
  which is structural and likewise reports the array's own path.
- Reconciliation never mutates a value. It compares, replaces the node's value,
  and reports the changed paths. `computed()` stays read-only; there is no
  draft, patch, or other mutation API.
- Object identity produced by the derive function is preserved. An element the
  derive function returned unchanged is still the same object after
  reconciliation, which is what keyed rows and element handles rely on.
- Invalidation fan-out is proportional to the changed paths: the work that
  follows reconciliation — dirty paths, woken subscriptions, DOM updates — is
  sized by what changed, not by the size of the value. Comparison itself is not.
  Reconciliation still visits the containers it compares, so each array or
  object level costs O(length) to compare, and the saving is that a subtree
  whose reference is `Object.is`-identical to the previous one short-circuits
  without being walked. Reconciliation makes no sublinear-comparison claim: that
  would need change metadata from the derive function, which the compiler does
  not supply today.
- A derived value may share objects with the state it derives from, so in-place
  writes into those objects are detected within the same flush: the write
  records the touched object together with the path written beneath it, and
  reconciliation reports that path (the write-touched rule). The rule applies
  both where the new derived value still holds the same object reference and
  where only the previous value held it — an in-place write leaves that previous
  value already carrying the new field, so comparing a rebuilt copy against it
  would otherwise see two equal objects and report nothing.
- Async computeds reconcile the fulfilled value the same way and expose
  `status`, `version`, `key`, and `error` as separate paths, so a pending
  re-run carrying the prior value invalidates only those paths. A fulfilled
  value is compared structurally: an async result can land long after the flush
  that wrote the state it embeds, so identical nested references are not
  evidence that nothing changed there and each is reported at its own path,
  while a fulfilled value identical to the previous one at the root reports the
  whole node.

### Async derivation and TSRX boundaries

Async is v1 core, not a deferred resource layer. Without a first-class async
path, users will rebuild effects by hand with `loading`, `error`, and `data`
state. The framework instead treats async as derived graph state:

```tsrx
import { computed } from '@markless/core';

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
  not run at creation; it runs only when demanded by a DOM update or TSRX async
  boundary.
- Reactive reads before the first `await` form the dependency key for the async
  node. When that key changes, the runtime creates a new request version.
- Reactive reads after the first `await` are a compile-time diagnostic. Snapshot
  the value before awaiting, or split the logic into an async computed plus a
  sync computed:

```tsrx
import { computed } from '@markless/core';

const rawUser = computed(async ({ signal }) =>
  fetchUser(route.params.userId, signal)
);
const formattedUser = computed(() => formatUser(rawUser, locale));
```

- Async computeds compose through their key phases. If an async computed's
  dependency closure contains an unsettled async computed, the dependent
  becomes pending without its function running. Settlement of that closure
  retries the dependent key phase. All unsettled async dependencies discovered
  by the key phase are demanded in parallel; they are not serialized by source
  or document order. If any required dependency rejects, the dependent rejects
  without running its function.
- A sync context — a template read, sync computed, or dependency record — reads
  an async computed as the boundary-guarded snapshot value. A bare read is that
  value, never status or snapshot metadata. Sync computeds may depend on async
  computeds; readers of the sync computed gate on its complete async ancestor
  closure and must still be dominated by an async boundary when an ancestor can
  be pending or rejected.
- Async chains have the same graph semantics during blocking SSR, streaming
  SSR, browser resume, and CSR. Demand and settlement are independent of
  boundary document order. Each async computed runs at most once during a
  server render, even when multiple boundaries demand it.
- Async dependency cycles are compile-time errors, including cycles whose path
  crosses one or more sync computeds.
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
- Initial render streams boundaries with authored `@pending` arms by default;
  blocking render is an explicit opt-out. Boundary flushing and deadline rules
  are owned by [12-arm-rendering.md](./12-arm-rendering.md); they do not change
  async dependency composition.
- On browser revalidation, a dependency-key change makes the boundary pending
  for the new key. The deadline-gated arm rules determine whether the prior
  settled content remains visible or the authored `@pending` arm commits.
  Cross-navigation cache policy is specified separately.

Deferred: development-time diagnostics for avoidable async waterfalls and
router-derived prefetching are recorded follow-ups. They are observability and
demand-planning features, not part of the composition semantics above.

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

The state, async, element, event, and element-behavior APIs are
**compiler-rewritten framework APIs**, not runtime reactive values. Authors must
import APIs such as `state`, `computed`, `shared`, and `element` from
`@markless/core`; bare calls are diagnostics. The compiler recognizes these
APIs through their imported bindings, rewrites supported `.tsrx` usage, and the
runtime stubs fail loudly if called directly without compilation. There is no
`Signal`/`Tracked` type in the public API. Event handler props are camelCase
(`onClick`, `onInput`), matching TSRX event-prop convention — no directive
namespace. Element handles use the host prop `el`, which only accepts imported
`element()` handles. Element behaviors use the host prop `attach`, which only
accepts compiler-known element behavior expressions.

`state()`/`computed()` may be created anywhere in a call tree rooted in a
component or shared instance — including helper functions in non-component
`.tsrx` files. Creation at **module scope** is a compile-time
diagnostic in v1: module-scope state would be shared across requests on the
host runtime and has no home in the per-document serialization payload.
Request, container, and page state is declared with `shared()` definitions
instead.

### Implementation: compiler-owned graph state

**Imported framework APIs (compiler-rewritten).** The compiler knows every
`state()`/`computed()` creation site whose callee resolves to an import from
`@markless/core`, so every read of that binding compiles to a graph read
(`_get(count)`) and every supported write compiles to a graph write — including
reads inside closures, template expressions, destructured aliases, and
non-component helper functions in `.tsrx` files. Reactivity crosses `.tsrx`
function boundaries with zero ceremony; "transporting reactivity" is not a
concept users need.

This rewrite is driven by TSRX semantic analysis, not by the lowered output or
string matching. The state compiler consumes the TSRX structural graph plus
normal JavaScript/TypeScript AST and scope information:

- Imported `state()` / `computed()` calls in variable declarators become graph
  bindings owned by the nearest stable TSRX graph scope. Bare calls with the
  same names are rejected with a diagnostic that asks the author to import the
  API from `@markless/core`.
- Reads in TSRX expression children, element attributes, event handlers,
  behavior inputs, computed bodies, and nested helper functions resolve through
  the lexical binding map and lower to graph reads when they target a known
  graph binding or alias.
- `AssignmentExpression` and `UpdateExpression` nodes lower to graph writes
  when their left-hand side resolves to a graph binding or graph path.
- Object and array literals passed to `state()` are analyzed as syntax, so
  static keys, literal values, and initial nested paths are known before the
  serializer runs.
- Dynamic values are still validated at runtime serialization. Semantic
  analysis can classify the origin and path; it does not pretend to know the
  concrete value returned by an opaque function, network request, or
  third-party library.

#### State lvalue meta-contract

The spec does not try to pre-enumerate every valid JavaScript lvalue shape.
Implementation owns that table through semantic-analysis fixtures. The normative
rule is:

```txt
If semantic analysis can resolve a read/write target to a graph binding or graph
path, and the compiler/runtime can preserve normal JavaScript semantics, the
form is supported.

If the target is unresolved, ambiguous, read-only, or would require surprising
semantics, compilation fails with a diagnostic.
```

Normal JavaScript binding semantics are preserved. Reassigning a `const` graph
binding is still illegal, while mutating a property of a `const` object-state
binding is allowed when the property path resolves:

```tsrx
let count = state(0);
count++; // supported when semantic analysis resolves `count`

const frozenCount = state(0);
frozenCount++; // diagnostic: const reassignment

const menu = state({ open: false });
menu.open = true; // supported: property mutation, not binding reassignment
```

`computed()` and props are read-only in v1. Writes to them, including writes
through aliases, are diagnostics unless a future explicit writable-computed
contract is added.

The exact supported surface for update expressions, compound assignments,
member writes, destructured aliases, rest/spread aliases, and collection methods
is locked by compiler fixture tests rather than prose. New forms are added only
when the fixture proves that the compiler can resolve the target and the runtime
can preserve JavaScript-visible behavior.

For example:

```tsrx
function Counter() @{
  let count = state(0);

  <button onClick={() => count++}>Count {count}</button>
}
```

The semantic graph records one graph binding (`count`), one event attribute
(`onClick`), one update expression (`count++`), and one text DOM update read
(`{count}`). The event symbol write lowers to `graph.update({ graphNodeId:
countId, ... })`; the text DOM update lowers to `graph.read(countId)`.

For object state:

```tsrx
function Menu() @{
  const menu = state({ open: false });

  <button onClick={() => menu.open = !menu.open}>
    Toggle
  </button>
}
```

The compiler resolves both sides of `menu.open = !menu.open` to the same graph
path. The read subscribes to `menu.open`; the assignment invalidates that path
without treating the whole object as an opaque value.

**Objects and collections.** `state(obj)` supports objects, arrays, `Map`, `Set`,
and `Date` without a separate `store()` primitive or reactive collection
subclasses. `user.profile.name = x` and `items.push(x)` are graph writes with
path-level invalidation semantics, so a deep mutation updates only the DOM updates
that read that path.

Object identity is part of the state graph contract. If two state paths point to
the same object before initial-render serialization, they point to the same
object after resume:

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

Writes through destructured aliases follow the state lvalue meta-contract. If
the alias can be resolved to a writable graph path while preserving normal
JavaScript semantics, it may lower to a graph write; otherwise it is a
diagnostic. Props and `computed()` aliases remain read-only in v1.

### Props

Component props are getter-backed; reads inside the child re-read the parent's
graph. Destructuring in the parameter list is auto-aliased as above.

### Shared state — `shared()`

There is no `context()` and no `store()`. React-style context makes authors
create tree boundaries (`Provider`, context IDs, wrapper hooks) for data that is
usually just named dataflow: auth, i18n, cart, feature flags, current org, route
cache, websocket state, or component-library state shared by root/trigger/item/
content pieces. `shared()` names that dataflow directly.

```tsrx
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
usually request/container/page. The instance is created during initial render,
serialized into the graph payload, resumed lazily in the browser, and
synchronized by serialized patch events only when it crosses container/runtime
boundaries.

```txt
shared definition
  -> request-scoped initial-render instance
  -> serialized graph snapshot
  -> lazy browser graph instance
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

```tsrx
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

```tsrx
export const cart = shared(() => {
  const s = session();
  const c = state({ id: "current", items: [] });

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

```tsrx
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

```tsrx
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
render/resume metadata used for events, projection, keyed loops, and DOM
updates.

**Self-contained local widget state**

Self-contained component instances usually do not need `shared()`. Their
boundary is local ownership, so ordinary `state()` is enough.

```tsrx
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
