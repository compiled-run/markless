# Render-order ordinals: both seams measured, one chosen, and why it did not land

Measured against the witness at `packages/vitest-browser/browser/item-collections/`
on tip `8dadf9b0`, by compiling each candidate spelling into `ic-widget.tsrx` and
running `--project browser`. Both probes were reverted; the witness is byte-identical
to the tip and no source file changed. Nothing else in this unit was written.

The seam to take is **(b), a roster position readable while deriving**. Seam (a)
cannot answer the ruling at all, for a structural reason the compiler already
documents. Seam (b) can, and its authoring surface already compiles — but it is a
four-part build across the compiler and the browser runtime, not one change, and
it needs a ruling this unit's packet does not carry. That is the whole of the
finding; the measurements are below.

## Seam (a): a render-order counter on the widget instance

Probed spelling — the instance carries `next`, each part takes it and bumps it:

```tsx
export function IcItem({ children }) @{
	const w = ic();
	const item = state({ pos: w.next });
	w.next = w.next + 1;

	<div data-ic-item el={w.itemEls} ui-pos={item.pos}>{children}</div>
}
```

Three refusals, not the one U682 recorded:

- `MARKLESS_SHARED_SEED_UNSUPPORTED` — *Cannot seed "w.next" from "w.next + 1"
  because a component body seeds a shared instance only from its own props or from
  constants.* This is `isUnloweredSharedSeed`,
  `packages/compiler/src/passes/state-lowering.ts:570`, exactly as U682 named it.
- `MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE` on the **state-initializer**
  module: the lifted module for `state({ pos: w.next })` still names `w`, and no
  instance exists there.
- The same code again on the **shared-seed** module for `w.next = w.next + 1`.

So admitting the read in `isUnloweredSharedSeed` is only the first of three: both
lifted symbol modules would also have to rewrite a same-instance member read into a
read of the seed map they already run against. U682 saw this as one runtime
`ReferenceError`; it is two separate emitted modules, each with its own rewrite.

### Why seam (a) is the wrong seam anyway

Two ceilings, both structural, neither removable by relaxing a gate.

**The seed phase never visits a repeat row.** A widget root's seed phase walks its
projection and runs each part's seeds before any part renders — that ordered walk is
what a counter would ride. It deliberately steps over repeat rows:
`rowProjectedEdgeIdsUnder` in
`packages/compiler/src/passes/public-render/shared-seed-pass.ts` says so in as many
words — *how many of them render, and under which row, is a render-time answer, so a
build-time seed phase cannot run their WRITES.* The witness's keyed page and mutating
page put every item inside `@for`. A counter therefore answers for the static,
composed and two-instances pages and for nothing else: 6 of the 11 red rows at best.

**A counter only grows.** The mutating page drops the first of three keyed rows. The
survivors are moved, not re-rendered, and the widget root does not re-seed, so a
seeded ordinal stands at 1 and 2 where the row demands 0 and 1. U682 already said
this; the probe adds only that there is no ordered walk to re-run even if one wanted
to.

## Seam (b): the roster position, read while deriving

Probed spelling — the part binds the widget's roster and its own handle on the one
element, and derives its place:

```tsx
export function IcItem({ children }) @{
	const w = ic();
	const mine = element<HTMLDivElement>();
	const pos = computed(() => w.itemEls.indexOf(mine as HTMLDivElement));

	<div data-ic-item el={[w.itemEls, mine]} ui-pos={pos}>{children}</div>
}
```

**The authoring surface is already legal.** `el={[w.itemEls, mine]}` compiled without
complaint: `collect-elements.ts` handles a handle list on one element and says a
singular handle stays exactly-one while an array-typed one gains a member. No
`@markless/core` export, no `el` prop type change, nothing outside this unit's
contract is needed to spell the question.

Exactly two errors came back, one per handle read, both
`MARKLESS_ELEMENT_HANDLE_UNBOUND` from `elementHandleDeriveReadDiagnostic`
(`packages/compiler/src/passes/semantic-graph/diagnostics.ts:1010` — U682 cited :983,
which is the neighbouring `unboundElementHandleDiagnostic`, a warning rather than this
refusal): *element() handles
are DOM-bound and readable only in event handlers, so "itemEls" is undefined on every
derivation.* One compile gate, not three.

### What it costs after that gate

The gate is the cheap part. Four pieces, in the order they bite:

1. **The derive symbol must be handler-shaped.** The diagnostic's own reason is that
   only handler-shaped reads are rewritten into the DOM lookup. The resume side is
   already there: `refreshSyncComputed`
   (`packages/web/src/resume-sync-computed.ts`) hands `getElementHandle` to the derive
   symbol it loads, so a rewritten derive would be answered today.
2. **First paint has no DOM.** In SSR and on a CSR mount the roster is empty and
   `indexOf` answers `-1`. The render has to answer this reading from render order
   instead — it is emitting the elements in document order and already mints a
   per-widget-instance token for them (`widgetInstanceReadSource`,
   `packages/compiler/src/passes/public-render/residue-reader.ts`). That is where the
   two regimes meet: at render, position is emission order; after resume, position is
   the live roster. They agree, which is the whole reason this seam is the right one.
3. **Nothing announces a roster change.** `materializeElementHandles`
   (`packages/web/src/resume-locators.ts:58`) is explicit that row-owned handles are
   *not* registered at all — *their elements are whatever the repeat's live children
   hold at READ time, so a reorder or a removal needs no bookkeeping to stay true.*
   That is why `survey()` renumbers correctly today and why a derived cell would not:
   there is no event to invalidate on. The repeat's row mutation would have to notify.
4. **A row added after resume is refused before any of this matters.**
   `MARKLESS_REPEAT_ROW_COMPONENT_WIDGET_UNRESOLVED`, `assertRowWidgetsResolved`,
   `packages/web/src/fns/row-component-mint.ts:433` — T009. Two of the eleven red rows
   ("an item added after resume takes the next position by itself", "the roster
   renumbers after an item is added") are red for that reason alone; the second does
   not involve an ordinal at all. Neither can go green until T009 does.

### The serializer question, answered

It does not need a serializer change, and this is worth recording because the packet
allowed blocking on it. `ProtocolStatePayload.computed[].dependencies` in
`packages/serializer/src/protocol.ts:124` is `{ graphNodeId, path }`, and an element()
handle **is** a graph binding with an id — `marklessElementHandlePropValue` exists
precisely because a route landing on a handle id is answered from the page's handle
registry rather than the graph. So "this computed re-derives when that roster moves"
is expressible in the record shape that ships today. What is missing is the writer:
nothing writes or notifies that node when the roster changes (point 3 above). That is
a `@markless/web` change, inside this unit's contract, not a protocol change.

## Why nothing was flipped

The eleven rows are one receipt, not eleven. Flipping the six that a counter could
reach would put a rule in `SPEC.md` — position is derived from render order, families
never take an index prop — that the code keeps only outside `@for`, and would drop
`index` from `tour.item` and `otp.item` while `otp`'s own `otp.length = index + 1`
still needs a prop to seed from. The witness is left exactly as U682 left it: red on
purpose, with the reasons now priced per gate.

## Bytes moved

None. Two probe versions of
`packages/vitest-browser/browser/item-collections/ic-widget.tsrx` were written and
reverted; `git status` is clean apart from this note. `SPEC.md`, `tour.tsrx`,
`otp.tsrx`, their scenarios and `item-collections.test.ts` are untouched.

## What to cut next

Four cards, in dependency order. The first two are the capability; the third is
already carded; the fourth is the cleanup this unit was written as.

1. **Derive-time handle reads.** Lift `elementHandleDeriveReadDiagnostic` for a read of
   a handle the same component binds, rewrite the derive symbol handler-shaped, and
   answer it from `getElementHandle` on resume. Verified by a browser row that reads a
   position after a gesture, with first paint still unanswered.
2. **Render-order answering and roster invalidation.** The server render module and the
   client render-data reader answer a roster position from emission order under the
   widget-instance token; the repeat's row mutation notifies the handle node so the
   derived cell re-runs. This is what turns the eight first-paint rows and the
   drop-renumber row green.
3. **T009** (`assertRowWidgetsResolved`), which the two add-a-row rows wait on.
4. **The family cleanup**: drop `index` from `tour.item` and `otp.item`, flip the rows,
   write the `SPEC.md` sentence.

## Owner question this carries

Card 2 changes what an `element()` handle *is*: today it is a DOM locator readable only
from a handler, and afterwards a plural one is also a render-order source a derivation
may read. That is a framework-semantics ruling, not a family decision, and it belongs
in the ruling that closes it rather than in a worker's improvisation.
