# Runtime Render/Resume

Unified runtime behavior for CSR render, initial render, browser resume,
delegated event dispatch, graph writes, behavior setup, async invalidation, and
shared patches.

There is no separate server runtime package. CSR render, initial render, and
browser resume are environment-specific phases of the same runtime graph,
serializer protocol, and symbol system. The implementation may expose
environment-specific entry points, but app authors should experience one model
rather than a two-sided deployment split.

### Runtime graph contract

The runtime graph's in-memory data structure is private. Implementations may use
maps, arrays, compact arenas, generated structs, proxies, tries, or hybrid
dev/prod layouts. The spec requires graph behavior, not a particular storage
shape.

Serialized payloads contain stable logical graph references. In-memory node
addresses, object layouts, subscription indexes, dirty queues, and optimizer
choices are implementation details.

Every runtime graph implementation must preserve:

- stable graph references across initial render, serialization, and browser resume
- path-granular reads and writes for object state
- dependency tracking for computed nodes, async nodes, DOM updates, and sync
  event policies
- invalidation after writes and deterministic flush ordering
- object identity and cycle preservation for serializable state
- async computed status, dependency keys, request versions, and cancellation
- diagnostic metadata that maps runtime graph references back to compiler
  artifacts when possible

This graph is not a virtual DOM. It does not store a virtual element tree,
virtual child arrays, component render-output snapshots, or a reconciliation
target. State writes invalidate graph subscribers directly; DOM update symbols
patch located real DOM nodes in place. `markless/view` records and graph DOM update
records may describe how to find/update existing DOM, but they are not an
alternate UI tree to diff.

### Scheduler and flush semantics

The scheduler is a graph scheduler with a DOM mutation journal. A journal is
allowed, but it records concrete DOM operations produced by graph DOM update work;
it is not a VNode journal, render-output journal, or diff queue.

The v1 scheduler contract is:

- Sync event policy runs immediately in the delegated event listener, before any
  lazy handler import.
- Lazy event handler symbols for one event run in authored order. Handler arrays
  await each entry before running the next entry.
- Graph writes made during one framework-owned event turn are batched. They
  invalidate graph paths immediately, but DOM updates run during the next
  flush point.
- The default flush point is a microtask scheduled by the first graph write in
  an otherwise idle turn. The runtime may also force an internal flush before it
  must observe updated DOM or finish an initial render/resume operation.
- A flush drains graph work until stable: recompute dirty sync computed nodes,
  discover newly dirty DOM updates, enqueue demanded DOM update symbols, and repeat
  until no synchronous graph work remains.
- DOM work produced during the flush is appended to a DOM mutation journal and
  applied after graph work settles for that flush.
- Nested writes during a flush are allowed. They extend the same flush when they
  are synchronous and schedule a later flush when they originate from async
  completion or a later event turn.
- Async computed invalidation creates a new request version, aborts the prior
  in-flight version when possible, marks dependent async state as pending, and
  schedules a flush for visible/demanded boundaries. Only the newest matching
  version may commit resolved or rejected state.
- Errors do not roll back graph writes that already committed. The error is
  routed to the nearest framework error boundary or app-level error hook, and
  any additional writes after the throwing/rejected handler entry do not run.

The DOM mutation journal may contain operations such as:

```txt
setText(text locator, value)
setAttr(element locator, name, value)
setProp(element locator, name, value)
insertRange(anchor locator, fragment)
removeRange(anchor locator)
moveRange(anchor locator, before locator)
runCleanup(behavior id)
```

The journal must never contain virtual element nodes, virtual child lists,
component render output, or "old tree/new tree" reconciliation records. It is a
batching and ordering mechanism for real DOM mutations, not an alternate UI
representation.

### Runtime verification harnesses

Runtime graph behavior that does not need a browser stays in ordinary package
unit tests. Any resume mechanic that depends on the browser resuming existing
initial-render output must be proven with `@async/witness` against a real
Vite/Rolldown dev, build, preview, or SSR fixture. That includes payload scripts
already present in the document, generated resolver/chunk loading, delegated
events on initially rendered DOM, DOM updates after lazy symbols, async boundary
replacement, behavior cleanup on removed hosts, and the invariant that component
bodies do not execute during browser resume.

Witness is the canonical proof surface for resume mechanics. If a needed
resume assertion is awkward or impossible with current Witness APIs, extend the
local `@async/witness` package directly and use that new capability here. Do not
replace the resume harness with jsdom, fake DOM, or Vitest browser-mode SSR
workarounds just because they are easier to wire for one fixture.

Vitest browser mode remains useful for focused real-browser DOM mechanics where
SSR/initial-render output is not the behavior under test. The framework should
provide a CSR-only `packages/vitest-browser` support package for tests such as
event/default timing, DOM journal application, `IntersectionObserver`, element
handle lookup, microtask ordering, and other isolated runtime-browser checks.
That package should follow the CSR helper shape of
`/Users/jacksm5pro/dev/open-source/vitest-browser-qwik` and intentionally leave
resume proofs to Witness-backed fixtures.

### CSR render containers

`render(App, { target })` is the normal browser render path. It executes the
component body in the browser, creates DOM under the target, constructs a live
runtime container, and wires events from compiled render artifacts. A CSR
container owns:

- the root target and cleanup/unmount boundary
- one graph instance and scheduler
- event delegation scope
- symbol resolver/chunk loader
- shared-state container scope

CSR must not depend on SSR artifacts. A CSR app must still render and handle
events when the document has no resumable container markup, no `markless/state`, no
`markless/view`, and no inline resumer script.

CSR may share the live container, delegated event, symbol resolver, graph, and
scheduler machinery after `render()` has created the DOM and runtime graph. It
does not use the inline SSR resumer to skip component execution, because CSR has
no server-created DOM or serialized graph to resume.

### SSR resumable containers

`renderToString(App, options)` is the server initial-render path. It returns HTML
containing the rendered DOM, a resumable container boundary, container-scoped
payload scripts, compact symbol resolver table metadata, and the inline resumer
bootstrap. That container boundary is the microfrontend/island scope for DOM
locators, events, shared-state patches, diagnostics, and cleanup.

The inline resumer activates automatically when the SSR HTML runs in a browser.
App authors should not need to write a normal browser `resume()` call. Low-level
resume functions are internal adapter/test utilities unless a specific public
use case is accepted later.

Container startup may execute the tiny framework resumer, but it must not import
app chunks or run component bodies, event handlers, behavior symbols, or async
runner symbols. Startup is limited to decoding payloads, materializing locator
side tables, installing container-scoped listeners/observers, and waiting for
explicit triggers such as interaction or visibility.

### Inline resumer boundary

The inline resumer is a tiny browser trapdoor for an already-rendered container.
It is not the app runtime, not the bundler, and not a hydration engine. Static
SSR containers with no browser triggers emit no resumer script.

For the event-only v1 path, the resumer owns only:

- locating the current SSR container
- reading the compact `markless/view` data for that container
- materializing locator side tables against the existing DOM
- installing delegated listeners for the event names present in that data
- walking from `event.target` to the container root
- matching the element/event record
- resolving the module/export row through the generated table
- importing and calling the lazy symbol

The compiler/bundler/render pipeline owns locator planning, event extraction,
symbol IDs, chunk emission, finalized module URL/specifier tables, feature
selection, and minified inline source generation. The generated loader source is
constant-size over compact row data and may use
`import(/* @vite-ignore */ url)` against finalized chunk specifiers. The resumer
must not scan event attributes, discover chunks, parse build metadata,
plan symbols, decode the whole graph, run the DOM journal, start behaviors,
demand async boundaries, or include visibility/sync-policy code unless the
container payload needs that feature.

Production size targets are part of the runtime contract:

- event-only specialized resumer: 300-500 B gzip target, 700 B gzip hard budget
- event plus sync policy: separate feature block, not paid by event-only pages
- visibility support: separate feature block, not paid by pages without
  `onVisible`
- static SSR with no triggers: 0 B resumer

CSP handling belongs to the render/host layer. The default v1 output may use an
inline classic script with a caller-provided nonce from
`renderToString(App, { nonce })`. The resumer itself must not contain CSP
detection, nonce discovery, hash generation, `eval`, `new Function`, or inline
event-handler attributes.

### Progressive runtime execution

The runtime contract generalizes the inline resumer's discipline to the whole
browser runtime: **execution is proportional to the user's action, never to the
page's content or to the framework's feature set.** The fastest work is work
that never runs; the runtime is architected so the necessary work for one
interaction is the only work that interaction pays for.

Load-time invariant: **the only code that executes at load is the inline
resumer** (the bootstrap tier below, ~600 B class). Every external runtime
module may be `modulepreload`ed — fetching is cheap and explicitly not the
cost metric; fetched-but-unexecuted code costs no main-thread work. The cost
metric for this contract is **executed bytes per action**.

Three gates, in order:

1. **Declared.** The payload's record inventory is the runtime capability
   manifest. A runtime capability module (keyed-repeat identity, async
   boundaries, sync-computed derivation, device storage, and future record
   kinds) may load only when the container's payload declares records of that
   kind. Pages without a record kind ship and load none of its runtime.
2. **Demanded.** A loaded capability executes only when demanded: an
   interaction dispatches a symbol, a graph write wakes subscribers of the
   touched paths, a visible boundary needs its async value. Loading a module
   because the payload declares it never executes feature work by itself;
   wiring is bounded by the records present, execution by the writes and
   events that actually occur.
3. **Minimal per action.** The execution set of one interaction is: the
   delegated listener walk, the sync-policy records for that target/event, the
   symbol chain for that element/event, the graph writes it performs, and the
   subscribers of exactly the written paths — plus the capability modules those
   subscribers require. Nothing else executes. In particular: no capability
   module executes for record kinds the action did not touch, no component
   body executes ever, and the full runtime never executes as a unit at any
   single moment unless one action genuinely touches every capability on the
   page.

Per-action execution granularity is a chunking requirement, not just a gating
requirement: the runtime chunk graph must place dynamic-import boundaries
between capabilities AND between sub-capability paths, finely enough that a
simple action executes only a few-hundred-byte slice of runtime (a scalar
counter click is the canonical case: event dispatch, one scalar write, one
text update — a ~400 B-class execution set, never the whole event tier, never
keyed-repeat/form-policy/async code the action did not touch).

Tier model implied by the gates:

- **Bootstrap** (the inline resumer above): listener installation and record
  lookup only; its size targets are unchanged and load-bearing.
- **Interaction tier**: decode-lean, locator materialization, event dispatch,
  sync policy — enough for full correctness of first interactions while
  heavier capabilities stream in behind the handoff gate.
- **Capability modules**: one per record kind, payload-gated, independently
  loadable because compile-time analysis (not a shared interpreter) carries
  the semantics.

Accepted end state (see 08-deferred-decisions.md): **function-exact runtime
emission** — the runtime authored as fine-grained functions, the compiler
emitting per-route imports of exactly the functions that route's records and
constructs require, the bundler packing per-route chunks over a shared core.
Capability modules are the current granularity; function-exact emission is the
same contract at its limit and supersedes runtime capability checks with
static, per-route truth.

Verification contract:

- Emitted-runtime size walls and per-chunk caps in the bundler fixture tests
  guard total bloat regardless of chunking; chunk splitting must never be used
  to hide runtime growth. Preloaded-bytes caps are not part of this contract:
  budgets on fetch measure the wrong axis and must not be added or enforced as
  execution proxies.
- Per-action executed-bytes budgets in browser-mode tests are the primary
  progressive-execution guard: after load, only the inline resumer has
  executed; after one action, the executed runtime module set and its byte
  total match that action's minimal path.
- Browser-mode tests assert execution gating directly: after load, no
  capability module has executed; after one interaction, only the touched
  capability executed. Run-distribution (N-of-M) evidence is required for
  runtime timing claims.
- With function-exact emission, an emitted-equals-required assertion (the
  function set in a route's output matches the set its constructs demand)
  becomes the primary guard, and the size walls tighten to match.

### Resume behavior

- One container-scoped delegated event listener (capture phase) from the resumer.
- Before importing handler symbols, the delegated listener evaluates any
  compiler-emitted sync event policy for the target/event. This is the only v1
  path for synchronous `preventDefault()` / `stopPropagation()` behavior. The
  policy reads the already-materialized graph data plane by ID; it does not load
  app chunks or execute component/handler code.
- First interaction: look up the ordered symbol list for that element/event,
  resolve each symbol through the generated symbol resolver's compact table,
  materialize its captured graph references and element handles, and run
  handlers in authored order. The resolver owns the dynamic import, including
  any `import(/* @vite-ignore */ url)` runtime import form; event props are only
  encoded symbol IDs in `markless/view`.
- Element handles resolve from serialized DOM locators at handler execution time.
  If the element was removed or the locator no longer matches, the handle reads
  as `undefined`.
- Element behaviors resolve from serialized DOM locators when their explicit
  browser trigger activates. The resumer then imports the behavior symbol,
  materializes its serialized inputs, runs the behavior with the element, and
  stores cleanup on the node. Behavior input changes clean up and rerun the
  behavior. Removed nodes clean up their behaviors before their locators are
  discarded.
- State writes during that run propagate through the graph and are flushed by
  the scheduler above; subscribed DOM update symbols are loaded on demand and
  update the DOM in place. Nothing re-renders; there is no component
  re-execution path in the browser runtime at all.
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
