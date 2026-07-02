# Resumability Payload

Serialization tiers, compact state/view data scripts, payload arenas, and DOM locator materialization.

### Serialization tiers

Serialization is for durable graph state, not runtime resources. `computed()`
and `attach={...}` deliberately remove most expensive cases from the serializer:
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
   belong in `attach={...}` or host/meta-framework code. The serializer stores
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
resource setup on the host element with `attach={...}` or recreate it from
serializable state.

### Markless containers

`renderToString(App, options)` emits an SSR resumable container. The container is
the runtime and microfrontend boundary: it owns a rendered DOM root, graph
snapshot, event wiring, symbol resolver metadata, shared state scope IDs, and
the inline resumer bootstrap that activates that exact payload in the browser.

Multiple resumable containers may coexist on one document. Payload records and
DOM locator streams are container-scoped, so event dispatch, shared-state
patches, element handles, and diagnostics do not leak across sibling or nested
microfrontends.

CSR `render(App, { target })` creates the same logical runtime boundary in
memory, but it does not consume or emit `markless/state`, `markless/view`, or the
resumer script. CSR must work like a regular browser app from an empty target
and app bundle.

### Serialization payload

Within each SSR resumable container, the initial render phase emits alongside
the HTML:

1. **State values** — object state serializes with the tiered serializer above.
   Sync `computed()` values are _not_ serialized; they re-derive lazily from
   their dependencies on first read.
2. **Async snapshots** — demanded async computed IDs, dependency keys, request
   versions, status (`pending`, `resolved`, `rejected`), and settled value/error
   data when available. This prevents resume from refetching data the initial
   render already resolved.
3. **Shared instances** — shared definition IDs, request/container/page scope,
   version counters, and the plain state snapshot for each touched shared
   instance. Methods/actions are never serialized.
4. **Subscription graph** — which symbol (DOM update, computed, async
   dependency key) depends on which state path.
5. **Wiring** — DOM element → event → optional sync event policy plus ordered
   symbol list for listeners, and DOM element → DOM update-symbol map for
   dynamic text/attributes/async boundaries.
6. **Element handles** — `element()` handle IDs mapped to DOM locators emitted by
   `el={handle}` bindings. The payload identifies where the element is; it never
   serializes the element object itself.
7. **Element behaviors** — host element locators mapped to ordered behavior
   symbol IDs and serialized behavior inputs from `attach={...}`. The payload never
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
   policies, DOM update records, element handle locators, async boundary
   anchors, and `attach={...}` host metadata.

Production payloads should encode all arena data into compact private data
scripts, rather than relying on verbose JSON objects or scattered per-node
attributes. In particular, production output should not require Qwik-style
per-node `on:click` attributes to know what code is on the page. By default, the
core renderer emits two inert data scripts:

```html
<script type="markless/state">
	...
</script>
<script type="markless/view">
	...
</script>
```

`markless/state` carries the state arena. `markless/view` carries the view/wiring
arena. The renderer may merge, split, or stream these payloads when the
resumer/runtime protocol supports it, but these two script types are the
canonical core containers and the names used by documentation, devtools, and
diagnostics. Token alphabets, tag IDs, table layouts, and compression choices
inside those scripts are private render/resume protocol.

Symbol URL/export metadata for browser resume is carried by a generated compact
resolver table or equivalent payload-adjacent module code. The default resumer
must not fetch or parse build metadata such as the bundle graph to discover
chunks or exports; that output is build/tooling/preload/devtools or adapter
metadata and must be unnecessary for the default browser startup and
symbol-loading path.

The SSR container also includes a tiny inline or module resumer bootstrap. That
bootstrap is executable framework code, but it must only decode container-scoped
payloads, install side tables/listeners/observers, and wait for explicit
triggers. It must not import app symbols or execute component, handler,
behavior, or async-runner code during browser startup.

A fully static SSR container with no browser triggers emits no resumer. When the
container has event-triggered work, production should prefer a generated
specialized resumer for exactly that container surface instead of a broad generic
loader. The base event-only production target is 300-500 B gzip, with a hard
budget of 700 B gzip for the code portion. Size gates must measure the emitted
script after the same Rolldown/Vite production minification and inlining path
that ships it, plus gzip; authored source length is not an acceptance criterion.
That measured scope includes only:

- finding the current SSR container
- reading compact `markless/view` data
- materializing DOM locator side tables
- installing the delegated listener set required by the event table
- walking `event.target` back to the container root
- matching an element/event record
- importing the matching symbol through the generated table
- calling the symbol with framework-owned event, element, root, and runtime
  context

That base budget excludes graph decoding, the full runtime graph, DOM journal
application, async boundary demand, behavior startup, visibility observers,
sync-policy evaluation, dev diagnostics, source maps, CSP plumbing, and any
streaming readiness path. Those features must be feature-sliced: pages without
`onVisible` do not pay for `IntersectionObserver`; pages without
browser-immediate cancellation/propagation do not pay for sync-policy dispatch;
static pages pay 0 B for the resumer.

The compiler/bundler/render pipeline owns the expensive decisions: whether a
resumer is emitted at all, compact `markless/view` encoding, DOM-order locator
assignment, event-symbol extraction, symbol chunking, module/export tables,
feature selection, minification, and inlining. The resumer is a trapdoor data
interpreter for an already-rendered container, not the bundler, graph runtime, or
SSR renderer.

Content Security Policy handling must not bloat the production bootstrap. The
v1 default is an inline classic script because it is the smallest and can locate
its container with browser-native script context. A `renderToString()` call with
a `nonce` option should attach the nonce to executable inline resumer scripts,
and may attach it to inert payload scripts for tooling compatibility. The
resumer must not use `eval`, `new Function`, or inline event-handler attributes.
Strict no-inline CSP modes are a host/rendering option, not resumer runtime
logic.

The production wire format should optimize for HTML size and parse cost:
typed tables or arenas, small numeric/string tags, root IDs, backrefs/forward
refs, and DOM-order skip runs for static nodes are all expected tools. The
view/wiring arena encodes metadata for the existing DOM; it is not a public
VNode format and does not imply a client VDOM or component re-render path.

### View locator materialization

The v1 `markless/view` locator model uses a browser-native `TreeWalker` over
`ELEMENT` and `COMMENT` nodes to materialize encoded DOM-order records onto the
existing initially-rendered DOM. This is a locator-decoding step only:

```txt
markless/view locator stream
-> TreeWalker over existing DOM
-> skip static nodes and ignored/nested regions
-> attach records to real elements/comment anchors
```

The resumer stores the result in internal side tables such as:

```ts
WeakMap<Element, EventRecord | DomUpdateRecord | BehaviorRecord>;
Map<number, Comment>;
```

Element records attach to real DOM elements. Comment records are reserved for
dynamic anchors such as branches, keyed lists, async boundaries, fragments, and
streamed/patch segments. Static nodes should have no per-node attributes and no
runtime record.

This is deliberately not VDOM recovery. The `TreeWalker` pass does not
materialize component VNodes, child VNode trees, or client render functions. It
only maps compact `markless/view` metadata to existing DOM nodes so later graph
writes, events, visibility triggers, and behavior setup can address those nodes
directly.

Development output must remain debuggable. Dev mode may emit a more readable
encoding, but production compactness remains the contract. The runtime and tools
must provide a decoded human-readable dump of the private payload so authors can
inspect why state, listeners, sync policies, DOM updates, or element behaviors
were included.
