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
    <button onClick={() => input.focus()}>Focus</button>
  </>
}
```

`element()` creates an element handle, not reactive data. `el={handle}` binds that
handle to exactly one host element in the current graph scope. When a lazy event
or visibility handler runs in the browser, the resumer resolves the handle's
serialized DOM locator to the current element.

#### Required and optional handles

The declaration says whether the element can be missing, and the compiler holds
it to that:

- `element<T>()` is typed `T`. It must be bound exactly once, in the component
  that declares it, on an element that renders whenever that component does:
  not inside an `@if`/`@switch` arm, an `@try`/`@pending`/`@catch` arm, or
  children passed to a component that does not always render its `{children}`.
  A handle created in a `shared()` factory, bound by another component, or never
  bound cannot keep that promise. Each of these is the build error
  `MARKLESS_ELEMENT_HANDLE_MAYBE_ABSENT`, which names the variable, the line and
  the exact declaration to write.
- `element<T | undefined>()` is typed `T | undefined` and may be bound anywhere
  a singular handle may. Reads use `?.`.
- `element<T[]>()` is an ordered set, never `undefined`; `element<T[] | undefined>()`
  is refused (`MARKLESS_ELEMENT_HANDLE_ARRAY_OPTIONAL`).

`| undefined` is read from the written type argument, like the array form, so an
alias of `T | undefined` reads as required and the diagnostic names the literal
spelling.

Whether a component always renders its `{children}` is a fact on its module
interface (`childrenAlwaysRendered`): its `{children}` hole sits in its root
markup, or in children it passes to a component that always renders them. A
component the build has no interface for counts as not always.

A handler can still run after the whole component is gone (a late click, a
timer, code after an `await`). A required handle then reads `undefined` as
before, and a method call or property read through it does nothing. In a
development build the read also warns on the console, naming the handle.

This covers the common design-system cases: focus registries, item navigation,
measurement, pointer capture, popover/dialog/file-picker APIs, and cross-event
DOM access. It also keeps two jobs separate:

- `element()` names an element for later imperative use.
- element behavior setup and cleanup belongs on the host node through `attach`,
  not inside `element()` handles or serialized state.

`state()` cannot hold DOM nodes, and `element()` handles are not serialized as
data. Passing element handles through component context, arrays, and helpers is
valid when the values remain inside `.tsrx` compiler-owned code.

#### Element handles in IDREF positions

An `element()` handle is also valid where the platform expects an id string
naming another element: `aria-labelledby`, `aria-controls`, `aria-describedby`,
`popovertarget`, and `for`. There is no `useId`. The author names the
relationship - `el={trigger}` on the element, `for={trigger}` on the label - and
the compiler mints the id, writing it onto the bound element and onto every
position that named the handle. Both sides render from one record, so they can
never be spelled differently, and no id string appears in authored source.

The minted id is emitted per module that has such a record; a module with none
carries no minting code at all. What the id is derived from depends on where the
handle is declared. A handle declared in a component is one element per rendered
component, so the id carries that render's own instance prefix. A handle
declared in a `shared()` factory with `{ scope: 'subtree' }` is one element per
rendered widget, so the id carries the token the widget root registers - from
static edge data, before any HTML is written - into the seed map it hands the
parts placed inside it. Two widgets on one page therefore mint different ids for
their triggers, and each label resolves to its own.

These shapes are refused rather than resolved, because each would need identity
this lowering cannot recover:

- A handle named by an IDREF inside a keyed list. One authored handle would name
  one element per row.
- An IDREF read from inside the widget root itself, or from a `shared()` factory
  that is not `{ scope: 'subtree' }`. The widget token does not exist yet in the
  first case and names nothing per-widget in the second.
- An authored `id` on the element an IDREF names. Two id attributes would leave
  the relationship pointing at whichever one the parser kept.
- A handle that no `el=` ever bound, a composite expression, or a multi-value
  IDREF.

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
On a server-rendered host the behavior symbol is imported only when one of these
triggers activates it:

- an event record on the host or on any element inside it dispatches (the
  behavior starts before that record's handlers run; an event handled elsewhere
  on the page does not start it, and neither does an event on an ancestor);
- `onVisible` on the same host fires;
- `onIdle` on the same host fires.

`onVisible` and `onIdle` on the same element are the opt-in for "start when
connected"; it is not component replay. A host the browser creates, either in a
client-rendered mount or in a branch arm or keyed row the runtime inserts after
a state change, runs its behaviors once the element is in the DOM.

A host with `attach` and none of those triggers on it or inside it fails the
build with `MARKLESS_ATTACH_NO_START_TRIGGER`, since its behavior would never
run if the server renders it. Hosts inside `@for` rows, and hosts holding a
component, a spread, or projected children (which may carry a handler the host
cannot see), are not refused.

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
  `onVisible` or `onIdle` (below) ship zero eager behavior; pages with
  `onVisible` run exactly the symbols whose elements are on screen. There is no
  free-floating equivalent (`onMount()`, `client()`) and there never will be —
  anything without an element doesn't belong in a component.

### `onIdle` — "after the page is idle" as an event

Code that no gesture asks for, such as an analytics tag, a chat widget or any
other third-party script, is ordinary code loaded by an element-owned event.
There is no script API. `onIdle` is the one trigger for "when the page has
nothing better to do":

```tsrx
<footer
  onIdle={async () => {
    const analytics = await import('./analytics.ts');
    analytics.start();
  }}
/>
```

Semantics:

- An `on*` event handler where the event is "the page has loaded and gone
  idle." It waits for the document's `load` event and for streamed arms to
  land, then for `scheduler.postTask` at background priority, else
  `requestIdleCallback` with a 2000 ms timeout, else a 200 ms timer (WebKit has
  neither scheduler, so it never runs sooner than 200 ms after `load`). The
  handler is a lazy symbol like any other: nothing it names, its own code
  included, is fetched before it runs.
- Fires once per element instance. An element mounted later (an `@if` arm, an
  `@for` row) fires at the next idle period after it appears; an element
  removed before then never fires. Unlike `onVisible`, the return value is
  ignored, as for ordinary events.
- Nothing scans the DOM for hosts. Each host is named by its own event record:
  on a served page the inline trigger resolves top-level hosts through their
  DOM-order locator indexes, and hands records inside arms and rows to the
  runtime by raising the event on the container; the runtime, and a
  client-rendered mount, queue each host when they bind its record to the
  element they hold. Once due, a host's event runs through the page's ordinary
  dispatch queue, behind any gesture already in flight.
- Visible and idle share one inline startup helper (`packages/web/src/inline/defer.ts`),
  served minified and only on a page that ships a deferred trigger, with one
  per-root fired set and one idle wait; the self-wake and storage wake use the
  same idle wait.
- Cost at load is the trigger registration only. Server-rendered pages without
  a deferred trigger are byte-identical; a client-rendered mount reads one
  global that only an app module with an `onIdle` record sets.
- **Not a lifecycle.** Like `onVisible`, it is not a reactive computation and
  not a mount hook: it needs an element, runs once, and reads current values.

### `onDocument*` and `onWindow*` — page-wide events an element owns

A listener on the document or the window is written on an ordinary element, as
a prop like any other event:

```tsrx
@if (open) {
	<dialog
		open
		onDocumentKeyDown={(event) => {
			if (event.key === 'Escape') open = false;
		}}
		onWindowResize={() => (width = window.innerWidth)}
	>
		…
	</dialog>
}
```

`onDocument<Event>` listens on the document and `onWindow<Event>` on the window,
for every event that reaches that target: `onDocumentKeyDown`,
`onDocumentPointerDown`, `onDocumentVisibilityChange`, `onWindowResize`,
`onWindowScroll`, `onWindowOnline`, `onWindowOffline`, `onWindowPopState`, and
so on. The name after the prefix follows the element casing rule (the compiler
lowercases it, so `onDocumentKeyDown` and `onDocumentKeydown` are one listener).
There is no other spelling: no `document:` prefix, no special tag.

Semantics:

- **The element owns the listener.** It listens while that element is on the
  page and stops when the element leaves it: an `@if` arm closing, a keyed row
  leaving, a route change replacing the page. The author writes no cleanup. An
  element that leaves the page stops listening for good; the element the browser
  creates when the arm opens again, or the row comes back, is a new owner and
  listens from the moment it is inserted, in a served page, a client-rendered
  mount, and an arm or row the runtime inserts after a state change.
- **The handler receives the browser's real event, as a listener on that
  target would.** `event.target` is wherever the event happened.
  `event.currentTarget` is `document` for `onDocument*` and `window` for
  `onWindow*`, as for a listener added there with `addEventListener`, and the
  types say so (`KeyboardEvent & { currentTarget: Document }`, from
  `DocumentEventMap` and `WindowEventMap`). That holds when the handler's code
  runs after the browser's dispatch, too. The owning element is reached the way
  any element is in Markless, through an `element()` handle:

  ```tsrx
  let menu = element<HTMLDivElement | undefined>();

  @if (open) {
  	<div
  		el={menu}
  		onDocumentPointerDown={(event) => {
  			if (!menu?.contains(event.target as Node)) open = false;
  		}}
  	>
  		…
  	</div>
  }
  ```
- **Resumable like any other event, at the same cost.** The compiler records it
  exactly as it records `onClick`: an event record on the owning element whose
  name is `document.<type>` or `window.<type>` (`PROTOCOL_GLOBAL_EVENT_SEPARATOR`
  in `@markless/serializer/protocol-global-events`), with the handler extracted
  as a lazy symbol and its sync policy extracted the same way. A served page runs
  no framework code at load for it, and the first matching event loads exactly
  what the same handler written as `onKeyDown` on that element would: the same
  lean dispatch tier, and in the browser the same direct client renderer. A
  page never takes the full runtime because it owns a document or window
  listener.
- **Every owner is a listener on that one target, and the DOM's rules hold.**
  Two elements that both own `onDocumentKeyDown` both run for one key press, in
  document order of the owners. `event.stopPropagation()` in one of them does
  not stop the other document owners (listeners on one target all run), and
  keeps the event from every `onWindow*` owner, as it keeps a document listener's
  event from the window. `event.stopImmediatePropagation()` also skips the
  document owners after that one. These rules hold whether the handlers' code
  is already loaded or loads after the browser's dispatch. A component used
  many times, or an element inside an `@for` row, registers once per instance.
  Inside an `@for` row that is rarely intended, so the build warns with
  `MARKLESS_GLOBAL_EVENT_IN_ROW` and still builds; there is no way to silence
  it, as for every Markless diagnostic, so the fix is to move the prop outside
  the `@for`.
- **Not "only while visible".** The owner listens while it is on the page, seen
  or not. A handler that should act only while its element is in view checks
  that itself, or composes with `onVisible`.

#### Which events, and the build error for the rest

The names are generated from TypeScript's `DocumentEventMap` and
`WindowEventMap` (`packages/typescript-plugin/scripts/generate-global-event-types.ts`
writes both the compiler's list and the prop types), less the events that never
reach that target in the bubble phase:

- events fired at an element without bubbling (`focus`, `blur`, `mouseenter`,
  `mouseleave`, `pointerenter`, `pointerleave`, `toggle`, `invalid`, `cancel`,
  `close`, media events such as `play` and `timeupdate`, `load` and `error` of
  an element) are refused on both targets;
- window-own events (`focus`, `blur`, `load`, `error`, `resize`) are refused on
  the document and accepted on the window;
- `selectionchange` fires at the document without bubbling, so it is refused on
  the window;
- mixed-case names (`DOMContentLoaded`) cannot be spelled through the
  lowercasing rule, and the `webkit*` aliases fire as their standard names.

Any other name is the build error `MARKLESS_GLOBAL_EVENT_UNKNOWN`. When there
is a prop that works, its title names it: the bubbling form on the same target
(`"focus" does not reach the document; use onDocumentFocusIn`), or the same
event on the other target (`"resize" does not reach the document; use
onWindowResize`). The prop types reject the same names, so the editor and
`pnpm run typecheck` report them before the build does, and give the handler the
event type the map names (`KeyboardEvent` for `keydown`). In completions,
`onDocument*` and `onWindow*` rank below the element's own events, and first
once `onD` or `onW` is typed.

Element event props have no capture-phase spelling (a trailing `Capture` is
dropped, and the listener is the ordinary one), so neither do these: there is no
`onDocument*Capture`.

#### Ordering with element events

The listeners sit on the document and the window in the bubble phase. For one
browser event, element handlers run first, then document handlers, then window
handlers, as listeners at those places do natively. The served page's capture
listener on the container forwards the element's event before the document
listener forwards its own, and both go through the page's one dispatch queue, so
the lazy handlers run in that order too. An element handler that stops
propagation through its sync policy stops the event before it reaches the
document; one that stops it later, in its lazy body, still keeps the queued
document and window handlers from running. A document owner cannot stop an
element handler, which has already run. The relay records which phase each
stop call came from on the browser's event (element, document or window, and
which owner made an immediate stop), and the compiled handler of a document or
window record first asks the relay whether its owner still hears the event, so
the rules above hold for handlers whose code loads after the browser's dispatch
returned.

#### `preventDefault` before code has loaded

As with element events, the browser decides the default action when its
listener returns, and the handler's code is still loading then. The compiler
extracts the same sync policy it extracts for an element event
(`if (open && event.key === 'Escape') event.preventDefault()`), and it runs in
the listener: the relay raises its event at the owner synchronously, inside the
browser's own dispatch, so the container's listener runs the owner's policy
exactly as it would for a click on that element; the raised event reads its
fields from the browser's event and forwards `preventDefault()`,
`stopPropagation()` and `stopImmediatePropagation()` to it. So the first Escape
on a page that has run no code is cancelled. What cannot be cancelled on that
first event is anything the policy cannot express: a condition that reads the
DOM or calls a function fails the build with the existing sync-policy
diagnostic, exactly as for an element event.

#### Passive events

`scroll`, `wheel`, `touchstart` and `touchmove` are listened for passively
(`PROTOCOL_PASSIVE_GLOBAL_EVENT_TYPES`): browsers already treat touch and wheel
listeners on the document and window as passive so scrolling never waits for
code, and `scroll` cannot be cancelled at all. A handler on one of them whose
sync policy calls `preventDefault()` would do nothing, so it fails the build
with `MARKLESS_GLOBAL_EVENT_PASSIVE_PREVENT`; the fix is an ordinary `on*` prop
on the element that scrolls, or CSS `touch-action` / `overscroll-behavior`.
`stopPropagation()` in them is allowed.

#### How a listener reaches the browser

A page that owns no `document.*` or `window.*` record pays nothing for this
feature: its HTML and every chunk it downloads and runs are byte-identical to a
build without it.

Everything the feature costs lives in code that only a page owning such a record
loads:

- **The owner attribute.** The compiler writes `m:g="document.keydown ..."`
  (`PROTOCOL_GLOBAL_EVENT_OWNER_ATTRIBUTE`) on every element that owns one, in
  served markup and in the templates the browser builds arms, rows and pages
  from.
- **One relay per record name per document**
  (`packages/web/src/inline/global-relay.ts`). It listens on the document or
  window, and on each event raises a non-bubbling `CustomEvent` named after the
  record at every element that carries the owner attribute, in document order,
  with the browser's event as `detail`. Owners are found when the event fires,
  so an element that left the page (an `@if` closing, a row leaving, a route
  change) is simply not found, and one the browser inserts later is. A served
  page whose records name such an event gets the relay inline after its boot,
  served minified; an app module whose elements own one starts it with
  `import('@markless/web/fns/global-relay')`, so a page rendered or navigated
  to in the browser gets it from the module that needs it. A composed MDX page
  gets it the same two ways: inline when its composed records name one, and
  from the child's own module.
- **Routing, unchanged.** The raised event is an ordinary event on the owning
  element, so the boot, every dispatch tier, the runtime, a client mount and the
  direct client renderer route it with no change: the record named
  `document.keydown` matches it. The compiled handler of such a record starts by
  calling the carrier's `PROTOCOL_GLOBAL_EVENT_ENTER` function, which returns
  false when a stop call keeps this owner from the event and otherwise points
  the browser's event's `currentTarget` at the document or window; the handler
  then runs on the browser's event from `detail`.
- **Early events.** An event that lands while the shell is still parsing is
  held by an early capture script, served only on such a page, for the relay to
  replay.

A page whose records name one of these events takes the same dispatch tier and
client renderer it would take with the same handlers on element events
(`packages/compiler/test/global-events.test.ts` compares the two).

Native targets do not take these props in this version.

Validated by `packages/compiler/test/global-events.test.ts` (records, the
`@for` warning, the unknown-event and passive errors, and the same first-use
demand as an element event),
`packages/web/test/global-events.test.ts` (owners, order, removal, passive
registration, the policy inside the listener, each stop rule, `currentTarget`),
`packages/vitest-browser/browser/global-events/global-events.test.ts` (CSR and
SSR: Escape closes a served dialog with no framework module run before the key;
an `@if` removal stops it and a re-inserted dialog listens; two owners;
`onWindowResize`; element, document, window order; `currentTarget` and the
stop rules across owners; the first Escape cancelled before code loads; a route
change), `packages/bundler/test/global-event-relay.test.ts`
(a page without such a record has no relay, owner attribute or relay import; one
with it has all three), and the prop types and completions in
`packages/typescript-plugin/test/markless-tsc.test.ts` and
`completion-matrix.test.ts`.

A pure pull graph also deletes a class of resumability hazards: resume is
always re-derivation, with no effect-ordering or "did it already run during
initial render" semantics to replay.

This matters double in the AI age: with one way to express any data flow
(derive it), generated code is reviewable by construction — stale-closure
effects, dependency-array bugs, and effect-ordering races are not lintable
mistakes here, they are unrepresentable. (Prior art: Ryan Carniato's
derived-first direction for Solid 2.0 — "you don't need effects; computed is
your effect.")

### A received callback as the handler

A component may hand a callback prop it received straight to an event prop, on
a native element or on a part it renders:

```tsrx
function Key({ onPress }: { readonly onPress?: (event: MouseEvent) => void }) @{
  <button onClick={onPress}>Go</button>
}
```

The semantic graph pass reads `onClick={onPress}`, where `onPress` resolves to
one of the component's own props, as the handler
`(event) => onPress?.(event)` (the parameter is renamed when the prop itself is
called `event`). Everything downstream sees an ordinary handler that invokes a
callback prop, so:

- each instance runs the callback its own parent passed, with the DOM event as
  the callback's first argument, and its writes land on the graph nodes of the
  parent that passed it, including subtree-scoped `shared()` state;
- an instance whose parent passed no callback runs nothing;
- a parent that passes something other than a callback, such as a function
  call's result or a `let`, still stops the build with
  `MARKLESS_CAPTURE_OPAQUE_PROP`, as it does for any handler reading that prop.

Only a bare identifier naming a prop is rewritten. A `@for` row binding of the
same name, a component-local function, or any other expression keeps its own
meaning. Validated by `packages/vitest-browser/browser/direct-callback.test.ts`
(CSR and SSR resume) and `packages/compiler/test/direct-callback-prop.test.ts`.

### Callbacks a component hands on through its props

A component's props reach a child through a spread in either signature form:
`function Pad({ children, ...rest })` spreading `rest`, or `function Pad(props)`
spreading `props`. Both carry every prop the consumer passed (the rest form less
what the signature took out), so a consumer's `onClick` on `<Pad>` becomes an
event record on the element `Pad` spreads onto, and a child component's handler
that calls a prop it got through the spread runs the consumer's callback.

A widget root files the callback it is handed into a callback slot. When a
component hands a root a callback it only received, by name
(`<toggle.root onChange={onChange}>`) or inside its props spread
(`<toggle.root {...rest}>`), the semantic graph pass reads that prop as the
component's own `(value) => onChange?.(value)`, the same lowering as a received
handler above. The family's module graph interface lists the props each root
files into a slot (`callbackSlotProps`), which is how a consumer in another
module knows to lower them. Each instance then runs the callback its own parent
passed, and an instance whose parent passed none runs nothing. Validated by
`packages/vitest-browser/browser/callback-spread.test.ts` (CSR and SSR resume) and
`packages/compiler/test/callback-spread.test.ts`.

### Components in nested keyed rows

A component placed inside keyed `@for` loops is one instance per row of every
loop around it: its instance path carries a `r:<key>:` segment for each
enclosing row, outermost first (`r:b:r:y:c0:`). When one of those rows is
unkeyed it has no identity to carry, and an interactive child refuses as it
does in a single unkeyed row.

A handler in such a component that reads a row value it was passed (`group`,
`item`) finds it by key, not by position: the inner rows of every outer row can
sit side by side in one parent. The compiler records the chain of rows that
holds the value: the outermost row's collection on the graph, each inner row's
collection read off the item around it, and the key path every row is named by.
At dispatch, the keys come from the record's own path. A callback such a
component writes runs on its own row's instance even when a component further
down calls it: the caller names the callback's bound row, cut to the rows that
row was placed by. A chain the compiler
cannot describe (an inner collection that is not a static path off the enclosing
item) stays the build error it is today. Validated by
`packages/vitest-browser/browser/nested-row-components.test.ts` (CSR and SSR resume),
`packages/compiler/test/nested-row-locals.test.ts` and
`packages/web/test/row-bound-path.test.ts`.

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

A handler that calls a parameterless method returned by a `shared()` factory
carries that method's body instead of the call, because the browser has no
factory instance to call it on. Everything the body reads and writes is rewritten
to its graph node, including reads inside the body's own locals, so a body of
several statements lowers with no factory local surviving into the handler
module.

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

A served element whose event record carries a sync policy names it in its `m:on`
event host attribute (`05-resumability-payload.md`, "Event host attribute"), in
the shell, in a served `@try` arm and in a streamed arm. An unconditional policy
is spelled inline (`p`, `s`, `ps`); a conditional one indexes the container's
sync-policy table. The inline boot and the streamed-arm executor walk from the
event target up to the nearest element whose entry for that event names a
policy and run it before the event returns. The policy is never found by the
element's position, so a script that changed the page before Markless woke
cannot make a form submit natively.

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

The generated HTML does not need an `onClick={async (...) => import(...)}` shape.
Each event host carries one `m:on` attribute holding, per event, a short index
of its record and its sync policy, read by the one delegated listener at the
container (the JSAction shape); no handler code or symbol id is written on the
element. The view arena locates every other host by DOM-order streams, skip
runs, branch anchors, or other private locator data, then the resume module
builds internal side tables such as `WeakMap<Element, EventRecord>`.

An event record reaches the graph through the instance its symbols were
rendered with. A composed child's symbol IDs carry that instance path (see
`03-state-graph.md`, "Graph node identity"), so resume recovers the instance
from the ID it loaded and answers the symbol's graph reads and writes on that
instance's nodes; no separate instance field is added to the record. A bound
callback symbol names the component edge it was bound through instead of
carrying the path in its own ID, so its instance is recovered from that edge —
and only the child symbol is re-scoped, because the parent's capture routes are
already page-space graph references.

The compiler and bundler own event discovery, locator assignment, symbol IDs,
chunk/export tables, and compact resolver rows. The browser resumer does not
scan QRL-like attributes ahead of an event, infer event names from markup,
discover chunks, or plan symbols. CSR may use the same event-record model after `render()` creates a
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
