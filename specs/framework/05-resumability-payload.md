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

Graph node IDs in these arenas are protocol, not an internal convention. A
composed child's IDs carry the instance path defined in `03-state-graph.md`
("Graph node identity"); the grammar is owned by one serializer constant module
so the compiler, the composing layer, and resume all spell it the same way, and
an ID is byte-identical across SSR, payload, and the browser graph.

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

Production payloads encode arena data into compact private data scripts rather
than verbose JSON objects. The one per-node exception is the event host
attribute (see "Event host attribute" below): every served element that hosts an
event record carries a short `m:on` attribute naming its events, so the inline
boot finds a press's handler from the event target alone, with no data script
parsed and no element walk at load. Everything else stays off the elements.
Until records are rebuilt from compiled code (see "Records rebuilt from compiled
code" below), the core renderer emits two inert data scripts:

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
bootstrap is executable framework code, but at load it must only install
container-scoped listeners/observers for a page-specific list of event names
baked into it, and wait for explicit triggers. It does not parse `markless/view`
or `markless/state` and does not walk the container's elements at load. It must
not import app symbols or execute component, handler, behavior, or async-runner
code during browser startup.

A fully static SSR container with no browser triggers emits no resumer. When the
container has event-triggered work, production should prefer a generated
specialized resumer for exactly that container surface instead of a broad generic
loader. The base event-only production target is 300-500 B gzip, with a hard
budget of 700 B gzip for the code portion. Size gates must measure the emitted
script after the same Rolldown/Vite production minification and inlining path
that ships it, plus gzip; authored source length is not an acceptance criterion.
That measured scope includes only:

- finding the current SSR container
- installing the delegated listener set for the baked event-name list
- walking `event.target` back to the container root, reading the `m:on`
  attribute of each element on the way
- pinning the container's element census at the first forwarded event
- importing the resume module and handing it the event, the matched host and
  that host's event record reference

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

### Event host attribute

The server writes one `m:on` attribute (`PROTOCOL_EVENT_HOST_ATTRIBUTE`, grammar
owned by `packages/serializer`) on each served element that hosts an event
record. Its value is a `;`-separated list of entries:

```txt
entry  = name [ ":" ref ] [ "!" policy ]
ref    = index | "-"
policy = "p" | "s" | "ps" | index
```

- `name` is the DOM event name.
- `ref` is the record's index in the event list of the region the element was
  served in: the container's top-level `events`, or for an element served
  inside a streamed arm, that arm's `events`. `-` marks an event an external
  delegate owns: the press is not forwarded. No `ref` means the element has no
  record of its own for that event but scopes records the boot cannot index (a
  keyed repeat parent whose rows have handlers, or a host inside a served arm):
  the press is forwarded with no record and the resume module matches it.
- `policy` is the record's sync policy. `p`, `s` and `ps` are an unconditional
  `preventDefault`, `stopPropagation` or both. A number indexes the container's
  sync-policy table, an inert `<script type="markless/policy">` holding each
  distinct conditional policy once; the boot parses it only at the first event
  that needs one. A host in a streamed arm takes its policy from the arm's own
  record instead, which its executor has already parsed.

The inline boot listens for the baked event names. On an event it walks from
the target to the container, applies the first policy it meets, and forwards
the first entry with a `ref` for that event name, passing the element it was
found on as the host. When no entry has a `ref`, a press of an event name that
nested records (rows, arms) or a later-registered listener use is forwarded
with no record unless it is a link click outside every scoped element on a page
with no branches and no async boundaries, which leaves the page without waking
it. The resume module turns a `ref` back into the record it names.

The attribute is the only wiring a static or unrelated element never pays for:
elements without an event record carry nothing. A script that changes the page
before it wakes cannot misroute a press, because the host is found from the
event target, not by position.

### Record templates

A served page must not repeat a record's shape once per list row or composed
instance. Records that differ only in their per-instance values (the numbers
of an instance path, a keyed row segment, a DOM-order index) are served once as
a template, and each record carries only the values that differ between the
records sharing it. The serializer owns the encoding (`PROTOCOL_TEMPLATED_LISTS`
names the record lists that may use it; `encodeProtocolPayloadLists` writes a
served page's lists, `decodeProtocolPayloadLists` reads them back) and every
reader of a served `markless/state` or `markless/view` script decodes through
it, so the decoded payload is byte-for-byte the payload the renderer produced.

Contract:

- Decoding is exact. A template is the record's JSON text with its values cut
  out, so any record, value or string round-trips unchanged; the encoder needs no
  knowledge of record kinds.
- A list is templated only when that shortens it by at least a quarter;
  otherwise it stays a plain array, which every reader also accepts. Gzip
  already folds a few repeats, so small lists gain nothing worth the decode.
- Field names travel as indexes into a key table generated from the protocol
  types (`packages/serializer/scripts/generate-record-keys.ts` writes
  `protocol-record-keys.ts`; a test fails when the two drift). A name the table
  does not spell travels as itself, so a record with an unforeseen field still
  round-trips.
- A record no other record shares is served as a template of its own when its
  key indexes shorten it, and as itself otherwise.
- The view lists the resume module reads before it decodes anything (locators,
  events, keyed repeats, branches, async boundaries) and the state cells a sync
  policy reads at event time stay plain; decoding never runs at load.
- Payload scripts a browser renders for itself (client renders that hand
  records to resume without a server) are never templated: only the served
  html pays the encode.

The resume data each list row adds is gated by perf guard G13 on a list-heavy
fixture.

### View locator materialization

The v1 `markless/view` locator model uses a browser-native `TreeWalker` over
`ELEMENT` and `COMMENT` nodes to materialize encoded DOM-order records onto the
existing initially-rendered DOM. This is a locator-decoding step only:

```txt
markless/view locator stream
-> TreeWalker over existing DOM (the census)
-> if the container no longer holds the element count it was served with,
   find each located host under its served parent instead of by position
-> attach records to real elements/comment anchors
```

A locator's DOM-order index counts every element the container was served
with, so a third-party script that adds, removes or swaps an element before the
page wakes would shift every later index. Resume does not trust positions alone
for that reason. The container carries one `data-markless-paths` attribute
(`PROTOCOL_LOCATOR_PATHS_ATTRIBUTE`), written by the server from the html it
served: the served element count, then for every located host and each of its
ancestors its parent, its parent's served element-child count, its place among
those children and its tag. The inline boot walks the container once, at the
first event it forwards (or the first deferred trigger), not at load: that is the
moment the census is pinned, before the woken runtime commits any arm. When the
count matches, the census is the walk. When it does not, each located element is
matched by tag among its parent's children, scanning only as far as that
parent's child count grew or shrank, so a change moves nothing outside the
parent it happened in. Unlocated elements fill the census slots between located
ones; extra elements are left out and missing ones leave null slots. Arm,
boundary and keyed-row records already locate relative to their own comment
anchor or row root, so they are unaffected by changes outside their range.

A container that is an author's element (the router makes the document's
`<body>` the container) can hold nodes the page did not render. The host closes
the page's nodes with the `PROTOCOL_CONTAINER_END_COMMENT` comment and, when
document content precedes them, opens them with the
`PROTOCOL_CONTAINER_START_COMMENT` comment. Every page-level position the
browser reads counts only the nodes between the two: the element census and its
served count, comment-anchor indexes, and the child places the paths attribute
records under the container. The server measures the page's html alone, so
built resume modules hold the same positions whatever the document puts around
the page. The census walk resets at the start comment and stops at the end
comment in the same pass, so finding them costs no extra walk.

No static node gains an attribute: the paths ride on the container element only,
and only event hosts carry `m:on`.
A foreign change that removes or swaps a located element itself drops that one
host. Under the paths attribute a host whose element is missing or has the wrong
tag is reported through `reportError` and skipped, and the rest of the page
resumes; development builds add which node now stands there and where. Without
the attribute (a page the server did not measure) the mismatch is still a thrown
`MARKLESS_RESUME_LOCATOR_MISMATCH`, so a refused wake can retry.

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

### Records rebuilt from compiled code

Almost every record in `markless/state` and `markless/view` is something the
compiler already emitted into the page's render data: ids, wiring, update
records, shared definitions, computed records, row templates and arm plans. A
served page does not ship them. On the first interaction (or deferred trigger)
the resume module rebuilds the page's records by running the page's compiled
render data in the browser against the values the request rendered with, then
matches DOM-order indexes against the census pinned at that event. This is the
prerender wake channel, and it is the default for every page whose route the
build can wake.

What the server sends instead is only what the compiled code cannot know (see
"Request values" below). The server checks parity at render time: it rebuilds
the records the same way the browser will, from the same inputs, and compares
them with the records the render produced. A mismatch is the build or render
error `MARKLESS_RESUME_RECORD_DELTA_PARITY_MISMATCH`, never a page that resumes
with records that differ from its HTML.

A page the build cannot wake (its route has no wake module, or its render data
reaches something only the server holds) keeps serving its records. The next
best form of those records is a cacheable file the HTML references and the
browser fetches on first interaction or prefetches when idle, which runs no JS
at load; the inline payload scripts remain the form of last resort.

The rebuild is subject to `06-runtime-resumer.md` ("Records rebuilt on first
interaction"): it produces records only and has no effect a user can observe.

### Request values

What a served page still sends is the set of values the compiler cannot
reproduce from source:

- state cell values that differ from their compiled initializer, including
  route props that are not a function of the URL;
- async snapshot values and status;
- the row keys of a keyed repeat whose collection is request data;
- `attach` input values that are not literals;
- minted element ids the instance path cannot re-mint.

They travel per container in one inert `<script type="markless/values">` in the
tagged-JSON encoding: plain JSON for everything JSON can express, one-key tags
for the rest (`$u` undefined, `$n` NaN/±Infinity/-0, `$b` BigInt, `$d` Date, `$m`
Map, `$s` Set, `$x` RegExp, `$l` URL, `$o` for a real key that starts with `$`,
`$i`/`$r` for shared or cyclic objects), plus a list of which entries carry tags
so untagged entries come out of one native `JSON.parse`. Its decoder loads with
the resume module, never at load. A value a sync policy reads at event time is
read from the same script, untagged, so the boot needs no decoder.

Values are not read back from the rendered DOM: text a translator, extension or
early keystroke changed before the page woke would seed state with the wrong
value.
