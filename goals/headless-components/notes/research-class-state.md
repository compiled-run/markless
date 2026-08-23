# Class-based closure state in Markless — research memo

Unit `headless-framework/T076-class-state-research`. Research only. **No decision is made here.**
Section 5 is a recommendation the owner may take or discard.

Probe base: this worktree reset to `feat/headless-ui-pilot` tip `49770d1a` ("merge: SSR chain + row
scoping (T074)"), `pnpm install --prefer-offline`. QDS read at `qwik-design-system` `1aa1ed80`
(release v0.15.2), read-only.

Vocabulary note: these classes are called "instances", "helper objects", or by their own names
throughout. They are not called machines.

---

## 1. What QDS actually does, and why

### 1.1 Where the classes are

Eight class declarations exist in `libs/components/src`, and they cluster in exactly the two
families the packet names, plus popover:

| File | Classes |
| --- | --- |
| `select/select-utils.ts` | `SelectNavigation`, `SelectTypeahead` |
| `carousel/math/velocity-tracker.ts` | `VelocityTracker` |
| `carousel/math/waapi-core.ts` | `WaapiAnimationCore` |
| `carousel/math/transform-manager.ts` | `TransformManager extends WaapiAnimationCore` |
| `carousel/math/infinite-scroll-manager.ts` | `InfiniteScrollManager extends WaapiAnimationCore` |
| `carousel/math/momentum.ts` | `MomentumAnimator` |
| `popover/math/safe-polygon.ts` | `SafePolygonTracker` |

Everything else in those families is a Qwik `component$` plus plain helper functions. So the
division of labour is clear: **markup, ARIA wiring, and reactive plumbing live in components and
signals; per-interaction computation lives in classes.**

### 1.2 What state lives in fields, and what stays in signals

The split is consistent and deliberate.

**Signals hold the durable, shared, serializable facts.** `select-root.tsx` keeps `isOpen`,
`selectedValues`, `highlightedIndex`, `currentIndex`, `itemValues`, `itemLabelText`,
`disabledItems`, `itemRefs`, `totalItems` as signals in the context object. Those are the values
another part reads, that SSR must render, and that resume must restore.

**Class fields hold derived indexes and interaction scratch.** They are all recomputable from the
signals above, or from the DOM:

- `SelectNavigation` (`select-utils.ts:46`) takes four arrays in its constructor — `itemRefs`,
  `disabledItems`, `itemValues`, `itemLabelText` — and holds five private memo fields:
  `enabledIndices`, `valueToIndex`, `labelToIndex`, `lowerCaseValues`, `lowerCaseLabels`. Each is
  built on first use and reused thereafter (`getEnabledIndices`, `getValueToIndexMap`,
  `getLabelToIndexMap`, `getLowerCaseValues`, `getLowerCaseLabels` all begin with `if (this.x)
  return this.x`). Nothing here is a fact; everything is an index over facts the signals already
  hold.
- `SelectTypeahead` (`select-utils.ts:329`) holds `searchStr` and a `timeout` handle. `addKey`
  appends, resets the 750 ms window, and returns the current search; `clear` empties it. The
  timeout handle is a browser-only value that could not be serialized in any case.
- `VelocityTracker` holds two `Float64Array`s sized once from `config.velocitySamples`, plus `head`
  and `count` — a ring buffer. `addSample` writes two slots and advances an index. It allocates
  nothing per sample.
- `TransformManager` caches `lastAppliedPosition`, `cachedBoundaries` with a `boundariesInvalidated`
  flag, and `cachedItemPositions` as a `Float64Array` with an `itemPositionsInvalidated` flag. Its
  own header comment states the reason: *"Performance: Tracks last known position to avoid expensive
  getComputedStyle() calls during touch interactions on mobile."*

### 1.3 How the instances cross Qwik's serialization boundary

They do not. That is the whole trick, and it is worth being precise about it.

Every instantiation site that lives inside a component uses `useSerializer$`:

```ts
// select-root.tsx:126
const navigation = useSerializer$<SelectNavigation | null, null>(() => {
  const createNav = () =>
    new SelectNavigation(itemRefs.value, disabledItems.value, itemValues.value, itemLabelText.value);
  return { deserialize: createNav, update: createNav, initial: null };
});

// select-root.tsx:137
const typeahead = useSerializer$<SelectTypeahead | null, null>(() => {
  const createTypeahead = () => new SelectTypeahead();
  return { deserialize: createTypeahead, update: createTypeahead, initial: null };
});
```

`carousel-scroll-area.tsx` does the same three times — `velocityTracker` (line 100),
`transformManager` (line 112), `infiniteScrollManager` (line 128) — each with
`{ deserialize, update, initial: undefined }`.

**Not one of these five call sites supplies a `serialize` function.** Qwik's own docs
(`packages/docs/.../core/state/index.mdx`) spell out what that means: *"`serialize?: (value: T) => S
| Promise<S>`: Optional, serializes the object. If not provided, the object will be serialized as
`undefined`."* The payload therefore carries a lazy reference to the builder (a QRL) and the literal
`undefined` — no fields, no prototype, no bytes proportional to the instance.

The runtime side confirms the shape. `SerializerSignalImpl` (`core.mjs:2741`) extends
`ComputedSignalImpl` and starts `INVALID`; `$computeIfNeeded$` resolves the QRL only when something
reads `.value`, then calls `deserialize(currentValue)` the first time and `update(currentValue)` on
every later invalidation, tracking whichever signals those closures read. The serializer branch
(`core.mjs:9653`) writes `TypeIds.SerializerSignal` as `[computeQrl, effects, maybeValue]`.

Consequence: on the server `navigation.value` is `null` and nothing is constructed. In the browser
the instance is constructed on the first `.value` read, which happens inside a keydown or
pointer handler — `select-content.tsx:35`, `select-trigger.tsx:33` — not at load. Because `update`
is the same builder, `SelectNavigation` is rebuilt whenever `itemRefs`/`itemValues`/`disabledItems`/
`itemLabelText` change, so its memo fields are per-build caches, not a long-lived identity.

`TransformManager` and `InfiniteScrollManager` add a second layer:
`getCachedTransformManager` (`transform-manager.ts:476`) keeps a module-level
`WeakMap<HTMLElement, TransformManager>` and reuses the instance for a given scroll-area element
unless the orientation changed. So even when `update` re-runs, the same object comes back and its
position/boundary caches survive.

### 1.4 What "optimized closure state on the hot path" means here, precisely

Four separate properties, all observable in the source:

1. **Zero cost until the first interaction.** `initial: null` / `initial: undefined` plus lazy
   `deserialize` means the server never constructs one and the load path never constructs one. This
   is *not* "single allocation at load" — it is "no allocation at load, single allocation at first
   use". The carousel's WeakMap makes it one allocation per scroll-area element for the tab's
   lifetime.
2. **Zero allocation per event.** `VelocityTracker.addSample` writes into pre-sized `Float64Array`s.
   `TransformManager.applyTransformDirect` writes a style string. Nothing builds an object per
   pointermove.
3. **No re-derivation per event.** The expensive parts — enabled-item lists, value→index and
   label→index maps, lower-cased label arrays, scroll boundaries, item positions — are computed once
   and read from a field afterwards. `findMatchingItem` for typeahead is a scan over a cached
   lower-case array, not a fresh `toLowerCase()` pass.
4. **Monomorphic, non-reactive field access on the hot path.** Once the instance exists, `this.head`,
   `this.count`, `this.lastAppliedPosition` are plain property reads on one fixed-shape object. No
   proxy trap, no signal subscription, no graph read. That is the part a reactive-cell model cannot
   reproduce for free, and it is why the carousel is written this way and the select's list indexing
   is not written as `useComputed$`.

There is also a fifth, non-performance reason that the memo should not lose: **these classes are the
natural unit of the logic.** `SelectNavigation` is one object with eleven cohesive methods over four
inputs. Expressed as free functions it becomes eleven functions each re-threading four arrays and
five caches.

---

## 2. What Markless does today — probed, not assumed

Ten probes were compiled through `compileTsrxModule` in this worktree. Probe files were deleted
before this memo was staged; the findings below quote the artifacts they produced.

An important collection detail: the class-instance guard lives in **capture analysis**, and its
diagnostics surface on `symbolModules.diagnostics`, not on `semanticGraph`/`stateLowering`. A sweep
that only reads the graph-level artifacts will report "clean" for cases that in fact fail closed. It
will also report "clean" for cases that genuinely have no diagnostic anywhere — P1 and P6 below were
re-checked by walking *every* artifact's `diagnostics` array, and both came back empty.

### 2.1 Results

| # | Authored shape | Compile result | What actually happens |
| --- | --- | --- | --- |
| P1 | `shared(() => new Nav([...]), { scope: 'widget' })`, part reads `n.index`, handler calls `n.next()` | **Clean. Zero diagnostics in every artifact.** | Broken output. See 2.2. |
| P2 | class local inside a factory, method inlined into a handler | **Fails closed** — `MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED` | Compile blocked, good message |
| P3 | `state({ nav: new Nav([...]), index: 0 })` | Clean | Instance is rebuilt in the browser, but the method call loses `this`. See 2.3. |
| P4 | `const nav = new Nav()` in a component body, used in a handler | **Fails closed** — same code | Compile blocked |
| P5 | same, field read in markup | **Fails closed** — same code | Compile blocked |
| P6 | module-scope `const nav = new Nav()`, used in a handler | Clean, zero diagnostics | Handler symbol module references an unbound `nav`. See 2.4. |
| P7 | baseline factory-closure idiom (`{ ...s, next() {} }`) | Clean | Fully lowered to graph reads/writes |
| P8 | module-scope **plain function** called from a handler | Clean, zero diagnostics | Same unbound-reference shape as P6 — this is not class-specific |
| P9 | `shared(() => ({ ...s, nav: new Nav([...]) }))`, part reads `s.nav.index` | Clean | SSR render crashes. See 2.5. |

### 2.2 P1 — `shared()` returning a class instance is the worst case

`protocolState.sharedDefinitions` records the family but with nothing in it:

```json
{ "id": "shared:src/p1.tsrx#nav", "name": "nav", "scope": "widget",
  "version": 0, "graphNodeIds": [] }
```

No `returnProperties` at all — contrast P2/P7, where the same field carries
`[{kind:"graph",name:"index",...},{kind:"method",name:"next"}]`. `protocolState.cells` is empty and
`protocolView.domUpdates` is empty, so `{n.index}` would never update even if the rest worked.

It does not work. The emitted SSR module falls through to the raw-source residue branch:

```js
switch(residue.source){case "n.index":return (n.index);
  default:throw new Error('MARKLESS_SSR_DATA_RESIDUE_MISSING: '+residue.source);}
```

`n` is never declared in that module — the module scope it emits contains `class Nav {...}` and
nothing else. **SSR render throws `ReferenceError: n is not defined`.** The browser handler symbol
is `export function symbol_0(context) { return n.next(); }`, unbound the same way.

This is the case the owner's consumers will write first, because
`shared(() => new SelectNavigation(...))` is the obvious translation of the QDS code, and it
produces a runtime crash with no compiler diagnostic.

### 2.3 P3 — a class inside `state()` is reconstructed, but `this` is lost

The payload carries the cell with no value at all:

```html
<script type="markless/state">{"version":1,"cells":[{"graphNodeId":"state:s","name":"s",
"valueKind":"object"}],"computed":[],"sharedDefinitions":[]}</script>
```

No `value` key — compare P2/P7/P8, whose cells carry a full `records` array. Instead the compiler
emits a `state-initializer` symbol that carries the class declaration and re-runs the constructor in
the browser:

```js
class Nav { items = []; index = 0; constructor(items){this.items=items;} next(){...} }
export const authoredSource = "{ nav: new Nav([\"a\", \"b\"]), index: 0 }";
export function symbol_2() { return { nav: new Nav(["a", "b"]), index: 0 }; }
```

The SSR module separately does `let s = marklessStateValue(..., "state:s", { nav: new Nav(["a","b"]), index: 0 })`.

So Markless already has, implicitly, the *mechanism* Qwik makes explicit: nothing about the instance
crosses the wire; a builder re-runs in the browser. Three problems with getting it implicitly:

1. **The method call is emitted unbound.** `s.nav.next()` lowers to
   `context.graph.read("state:s", ["nav","next"])()`. `graph.read` returns the raw property
   (`readMarklessPublicPath(cells.get(id), path)`), so the method runs with no receiver. Class
   bodies are strict, so `this` is `undefined` and `this.index` throws a `TypeError` at click. No
   diagnostic.
2. **Any server-side mutation is silently discarded**, because the payload carries nothing. A
   consumer who mutates during render sees the value on the SSR HTML and loses it on resume.
3. **It is invisible.** Nothing in the source says "this is rebuilt, not transferred".

### 2.4 / 2.5 P6, P8, P9 — the adjacent gaps

**P6 and P8: module-scope declarations are not carried into handler symbol modules.** The emitted
handler is `export function symbol_0(context){ nav.next(); ... }` with no import for `nav`.
Tracing it: `sourceModuleScopeLines` is computed once in `emitSymbolModules`
(`symbol-modules.ts:78`) but is only consumed by `buildStateInitializerEmission`
(`symbol-modules.ts:1164`); the event-handler builder receives only `moduleImports`, which
`collect-module-imports` populates from real `import` statements. The bundler
(`packages/bundler/src/transform.ts:424`) only rewrites the export name; it injects nothing. So a
same-file module-scope binding referenced from a handler is unresolved.

P8 shows this is **not class-specific** — a plain `function bump(n)` behaves identically. The
supported route today is an *imported* helper (`packages/compiler/test/imported-helper-event-symbols.test.ts`),
and imports are carried through. This matters because the capture-analysis suggestion text says
*"hoist serializable helpers to module scope"*, which does not hold for same-file module scope in a
handler body. Whatever is decided about classes, this looks like a separate defect worth a card.

Caveat on rigor: P6/P8 are read from the compiler and bundler artifacts, not witnessed in a browser.
The claim "the symbol module has no binding for `nav`" is directly readable in the emitted source;
the claim "therefore it throws at click" is inference from that source plus the bundler pass that
consumes it.

**P9: a non-graph field on a factory object crashes SSR.** For `{ ...s, nav: new Nav([...]) }` with
markup reading `s.nav.index`, the SSR module reconstructs the instance from graph fields only and
then dereferences the missing one:

```js
const s = {"index": marklessSsrReadPublicPath(marklessSsrRenderStateValues.get(
  "shared:src/p9.tsrx#spike/state:s"), ["index"])};
switch(residue.source){case "s.nav.index":return (s.nav.index); ...}
```

`s.nav` is `undefined`; reading `.index` throws a `TypeError` during render. Zero diagnostics.

### 2.6 What the existing guard does cover

`collect-state.ts:992` classifies a component-body local as `class-instance` when its initializer is
a `new X(...)` whose constructor is not on the serializable-builtin list (`Date`, `RegExp`, `Map`,
`Set`, ...). Capture analysis then refuses to emit any lazy symbol that reads such a local, with a
message that already says the right thing:

> Cannot emit lazy event-handler symbol "symbol:0" because it reads component-local "nav", a local
> class instance value that cannot cross a resume boundary.

The detection is purely syntactic (`new X(...)` at the declaration site) and scoped to component-body
and factory-body locals. That is why P4/P5/P2 are caught and P1/P3/P6/P9 are not.

### 2.7 Summary of the state of play

Markless today has **one supported idiom** (the object-literal factory: state fields plus methods,
methods inlined into handler symbols), **one correct refusal** (class instance as a body local), and
**four silent failure modes** (P1, P3's lost receiver, P6, P9). The silent ones produce a
`ReferenceError` or `TypeError` at render or at click with no compiler output — which is worse than
either endpoint of the decision this memo is feeding.

---

## 3. How other frameworks solve it

### 3.1 Qwik — `useSerializer$` / `createSerializer$`

Covered mechanically in §1.3. The costs, stated plainly:

- **An explicit per-instance declaration.** Every class that a component holds needs its own
  `useSerializer$` call. QDS pays this five times across two families.
- **A lazy module per site.** The config closure becomes a QRL; the payload stores a reference to it.
- **A correctness trap severe enough to need a lint rule.** Qwik ships
  `eslint-plugin-qwik/src/serializerSignalUsage.ts` whose entire job is to check that `update` reads
  every signal `deserialize` reads — otherwise the instance silently stops refreshing. The rule's
  own fixture files are named `invalid-missing-store.tsx` and `invalid-missing-signal.tsx`.
- **Server mutations are lost unless you write `serialize`**, and QDS never writes one.

### 3.2 SvelteKit — the `transport` hook, plus classes as first-class reactive containers

Svelte 5 makes classes the *recommended* place for non-trivial state: `class X { field = $state(0) }`
is idiomatic, and the field is a reactive cell with normal `this` semantics. Real-world usage is
heavy and looks strikingly like QDS: `immich`'s `TimelineManager`, `TimelineMonth`, `TimelineDay`,
`AssetViewerManager`, and a `TransformManager` with `$state`-declared drag/crop fields;
`unionlabs/union`'s store classes.

For the wire, SvelteKit adds a **global, per-class codec** in `src/hooks.ts`:

```ts
export const transport: Transport = {
  MyCustomType: {
    encode: (value) => value instanceof MyCustomType && [value.data],
    decode: ([data]) => new MyCustomType(data)
  }
};
```

Found in the wild at `huggingface/chat-ui` (`PublicConfig`), `ciscoheat/sveltekit-superforms`
(`Decimal`, `RecordId`), `vercel/ai-chatbot-svelte` (`SelectedModel`, `ChatHistory`),
`remult/remult`, `andrii-kryvoviaz/slink`. So Svelte's answer is a **two-part** one: transparent
class reactivity in the browser, and an explicit opt-in codec only for values that must cross.

### 3.3 Nuxt / Vue — `definePayloadReducer` / `definePayloadReviver`

Vue's `reactive()` proxies a class instance fine at runtime; `this` inside a method is the proxy, so
mutations track. The wire is the problem: the payload is `devalue`-encoded and cannot carry a
prototype. Nuxt's answer is the same per-type codec, registered from a plugin:

```ts
export default definePayloadPlugin(() => {
  definePayloadReducer('DateTime', (v) => v instanceof DateTime && v.toJSON())
  definePayloadReviver('DateTime', (v) => DateTime.fromISO(v))
})
```

Used by `vuejs/vuefire` (Firestore `Timestamp`, `GeoPoint`), `vuejs/pinia` (`skipHydrate`),
`posva/pinia-colada` (query cache).

### 3.4 SolidStart — seroval plugins

SolidStart serializes with `seroval`. Values it has no built-in support for — `ObjectId`, Prisma
`Decimal`, `Temporal`, arbitrary user classes — previously threw when returned from a server
function. The fix is a configured plugin module:

```ts
solidStart({ serialization: { plugins: "src/seroval-plugins.ts" } })
```

with `createPlugin` and `OpaqueReference` re-exported from `@solidjs/start/serialization`. The
module is bundled into *both* ends so the format agrees. Solid's client stores are proxies over plain
objects and are not the place class instances live; in practice Solid apps hold them in closures or
module scope.

### 3.5 MobX — the instance *is* the store

`makeAutoObservable(this)` in the constructor, and the class fields become observables. Widely used
(`openreplay`, `blinko`, `fivem`). No serialization story at all — it is a client-only reactivity
system, and apps hand-roll `toJSON`/`fromJSON`.

### 3.6 The common shape

Every framework that both (a) supports SSR and (b) lets consumers hold class instances has landed on
the *same two-part* answer:

1. **Transparent reactivity for the instance in the browser.** Fields are cells; methods keep `this`.
2. **A declared, per-class codec at the wire boundary** — `serialize`/`deserialize`,
   `encode`/`decode`, reducer/reviver, seroval plugin. Named differently, structurally identical.

**Nobody infers the codec from source.** Not one of them reads a class body and derives
reconstruction data. The reason is visible in the QDS corpus: inheritance (`extends
WaapiAnimationCore`), getters (`get currentSearch()`), private `#`/`private` memo fields,
`Float64Array` fields, `window.setTimeout` handles, and constructor parameters that are signal
objects. Deriving a codec for those from syntax is not a small pass.

The one framework that gets away with *no* codec at all is the QDS usage of Qwik: because nothing
crosses, the "codec" degenerates to "a builder that runs in the browser". That degenerate case is
exactly what Markless already does accidentally in P3.

---

## 4. The option space

Constraint carried into every option: the pilot's standing lean is **no new authoring primitives**.
`state()`, `computed()`, `element()`, `shared()`, `storage()`, and `attach` are the surface.

### (a) Factory-closure idiom only, plus a fail-closed diagnostic for class instances

Close P1/P3/P6/P9 with errors that name the factory pattern and show the rewrite.

- **Consumer surprise:** high but *honest*. A consumer writing `shared(() => new SelectNavigation(...))`
  is stopped at compile with a rewrite, instead of getting a `ReferenceError`. The surprise is
  front-loaded and teachable. The cost is real: the QDS `SelectNavigation` rewrite is eleven methods
  and five memo fields expressed as a factory object, and the memo fields have nowhere natural to
  live except as more graph fields — which is exactly the re-derivation the class exists to avoid.
- **Payload/bytes:** unchanged. The factory idiom already serializes only declared graph fields.
- **Interaction-time performance:** *worse than QDS today*, and this is the honest sticking point.
  Under the factory idiom, `s.enabledIndices` is a graph cell, so a per-keystroke typeahead scan
  becomes graph reads instead of `this.` field reads. Whether that matters at select/carousel scale
  is measurable, not assumed — but it does not match the owner's stated intent.
- **Load-time performance:** unchanged and good.
- **Implementation depth:** small. The `class-instance` classifier already exists in
  `collect-state.ts`; it needs to run at three more sites (shared factory return, `state()` initializer
  property, module scope) and the shared-definition collector needs to reject a factory whose return
  is not an object literal. Days, not weeks.
- **QDS port needs:** a full rewrite of `SelectNavigation`, `SelectTypeahead`, and all four carousel
  math classes into factories, and a place to put the memo fields that is not a graph cell.

### (b) Transparent class support — fields as cells, methods as symbols, reconstruction data

- **Consumer surprise:** lowest of all options in the happy path; the code just works.
- **Payload/bytes:** grows. Every field becomes a cell in `protocolState`. `TransformManager`'s
  `cachedItemPositions: Float64Array` would either be serialized (bytes proportional to item count,
  for data that is pure cache) or need an exclusion rule the consumer has to learn — at which point
  the transparency has leaked.
- **Interaction-time performance:** *worse*, structurally. Turning `this.head` into a graph read is
  precisely the transformation the owner's intent is trying to avoid. Making the hot path fast again
  would require the compiler to prove a field is instance-local and un-observed and leave it as a
  plain field — a whole analysis of its own.
- **Load-time:** more cells to restore at resume.
- **Implementation depth — honest sizing against the existing factory lowering.** The existing
  lowering already produces the right *shape*: `returnProperties` with `{kind:'graph'}` fields and
  `{kind:'method'}` methods, and methods get inlined into handler symbols. Extending that to a class
  means (i) reading field declarations and constructor assignments as the cell shape, (ii) mapping
  methods to the same method kind, (iii) rewriting `this.x` to graph paths. Those three are a modest
  extension of a pass that exists. Then (iv): inheritance chains, `get`/`set` accessors, `private`
  and `#` fields, typed-array fields, methods that close over constructor parameters rather than
  fields, and instances handed to other instances. QDS uses *every one of those* today —
  `TransformManager extends WaapiAnimationCore`, `get currentSearch()`, five `private` memo fields,
  `Float64Array`, and `SelectNavigation`'s four constructor arrays that are never stored as declared
  fields but closed over as constructor params. So: near to the existing lowering for a toy class,
  materially past it for the corpus this is meant to serve.
- **QDS port needs:** would work for `SelectTypeahead`. Would not work as-is for `TransformManager`
  or `VelocityTracker` without field-exclusion rules and an inheritance story.

### (c) An explicit serializer hook (a `useSerializer$` equivalent)

- **Consumer surprise:** low for anyone arriving from Qwik, Svelte, Nuxt, or Solid — it is the
  industry-standard shape (§3.6). Higher for someone arriving fresh, because it is one more concept.
- **Payload/bytes:** best-in-class *if* the QDS convention is followed (no `serialize` ⇒ nothing on
  the wire). Worst if a consumer writes `serialize` casually.
- **Interaction-time:** matches the owner's intent exactly — after construction the object is a plain
  object and every field access is a plain field access.
- **Load-time:** matches — lazy `deserialize` means nothing is built until first use.
- **Implementation depth:** medium. Needs a new authoring API (against the standing lean), a lazy
  cell kind in the graph, a dependency-tracking `update` re-run, and — going by Qwik's experience —
  a diagnostic for the `update`-misses-a-dependency trap, because Qwik needed a dedicated lint rule
  for exactly that.
- **QDS port needs:** near-mechanical. Five call sites translate one-for-one.
- **Against the lean:** this is a new primitive, and it is a primitive whose whole content is
  "here is how to rebuild something the framework cannot understand". That is a real admission of
  defeat about the compiler's reach — which may be the right admission, but it should be made
  deliberately.

### (d) What the probes actually suggest: a browser-only instance, no new primitive

The probes show Markless is *already* doing the QDS thing in P3 — emitting a builder that re-runs in
the browser and putting nothing in the payload — it just does it implicitly and gets the receiver
wrong. And the diagnostic text already points at the intended home for DOM-backed setup: *"move
DOM-backed setup into a host element behavior with `attach`."*

Two sub-shapes, both using surface that exists:

- **(d1) Close the module-scope gap (§2.4), then a module-level factory + `WeakMap` works.** This is
  *literally* the QDS carousel pattern: `getCachedTransformManager` is a module-level function over a
  module-level `WeakMap`, and QDS reaches it from handlers. In Markless today that fails because
  same-file module-scope bindings are not carried into handler symbol modules — but an *imported*
  helper already is (`imported-helper-event-symbols.test.ts`). So a consumer could get most of the
  way there today by putting the factory in a sibling `.ts` module and importing it. Fixing the
  same-file gap makes it ergonomic, and it fixes P8 (plain functions) at the same time.
- **(d2) The instance is owned by an `attach` behavior on the host element.** The behavior runs in
  the browser, holds the instance in its own closure, and reads/writes graph cells for the facts that
  must be shared. This is the closest structural match to `TransformManager`, which is keyed by the
  scroll-area element anyway.

Properties: **payload cost zero** (nothing about the instance is described anywhere); **interaction
performance identical to QDS** (plain field access, single allocation, memo fields intact);
**load-time zero**; **no new authoring API**. Consumer surprise is moderate — the rule "an instance
lives in module scope or in an `attach` behavior, never in a component body" has to be taught, and
the failure mode when it is broken must be a diagnostic, not a `ReferenceError`.

Implementation depth: the module-scope-declaration gap is a contained compiler change (feed
`sourceModuleScopeLines` into the event-handler/behavior emission the way it already feeds the
state-initializer emission, with the same `referencedModuleDeclarationSources` filter). The
diagnostics for P1/P9 are the same classifier work as option (a). The `this`-loss in P3 (§2.3) is a
defect that needs fixing under *every* option.

### Cross-cutting: three things are true regardless of the decision

1. `shared(() => new X())` and `{ ...s, nav: new X() }` produce crashing output with no diagnostic.
   That is a fail-closed hole, and the repo's own doctrine says severity=error means must-not-ship.
2. `s.nav.next()` lowering to an unbound call is a correctness bug in the existing `state()` path.
3. Same-file module-scope bindings not reaching handler symbol modules is a separate defect that
   affects plain functions too, and it contradicts the compiler's own suggestion text.

---

## 5. Recommendation (a recommendation — the owner decides)

**Split the question in two, and do not let the second one hold up the first.**

**First, close the holes, whatever else is decided.** Fail P1 and P9 closed with a diagnostic that
names the factory pattern; fix the unbound method call in P3; file the module-scope-declaration gap
as its own card since it is not class-specific. None of this commits to a design, all of it stops
shipping crashing output, and it is the smallest work in the memo.

**Second, for the capability itself, I would pursue (d) before (b) or (c).** The reasons, in order of
weight:

- **It is what QDS actually does.** Not an approximation of it — the same mechanism. Nothing crosses
  the boundary, the instance is built lazily in the browser, and a module-level cache keyed by
  element keeps it alive. The carousel's `getCachedTransformManager` is already module-scope-plus-
  WeakMap; the select's `useSerializer$` degenerates to "build it in the browser" because it declares
  no `serialize`. Option (d) reproduces both without asking the consumer to learn a new word.
- **It is the only option that preserves the owner's stated intent unchanged.** Options (a) and (b)
  both convert `this.field` into a graph read on the hot path, which is the specific thing the QDS
  classes exist to avoid. Option (d) leaves the hot path as plain field access.
- **It costs no payload bytes and no new authoring API**, which keeps the pilot's lean intact.
- **The compiler work is bounded and useful on its own** — the module-scope gap is a defect worth
  fixing regardless.

**On option (c):** it is the industry consensus shape and it would work. I would hold it in reserve
rather than adopt it now, for one specific reason: a serializer hook earns its keep when an instance
must carry *server-computed* state to the browser. Neither QDS select nor QDS carousel does that —
all five call sites decline to write `serialize`. Until a consumer produces a case that genuinely
needs the server's version of the object, (c) buys a new primitive and Qwik's documented
`update`-dependency trap in exchange for a capability nobody in the reference corpus uses. If such a
case shows up, (c) is the right answer and the precedent for its exact shape is unanimous.

**On option (b):** I would keep it as a separate, later question rather than fold it in here. For a
class with only plain serializable fields it is a modest extension of the lowering that already
exists. For the corpus that motivated the question — inheritance, accessors, private memo fields,
typed arrays, constructor-param closures — it is not close, and the field-exclusion rules it would
need to stay fast are their own design.

**What I would want before the owner commits either way:** a measurement, not an argument. Port
`SelectTypeahead` and `SelectNavigation` under option (a) (pure factory-closure) and under option (d)
(module-level instance), and measure keystroke-to-highlight on a several-hundred-item list. The
performance claim in §1.4 is read off the QDS source and is architecturally sound, but it is not yet
witnessed at Markless's scale, and the owner's intent is stated in performance terms.
