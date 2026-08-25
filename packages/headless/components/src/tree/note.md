# tree — implementation notes

Research: `goals/headless-components/notes/research-tree.md`.

## Shape

Two widget families, the radio-group shape:

- `treeState` — rooted by `tree.root`. Holds `disabled` and nothing else.
- `treeItemState` — rooted by **every** `tree.item`, including an item written
  inside another item's `tree.itemcontent`. Holds that node's `open`, `leaf`,
  `level`, the `element()` handle for its label, the consumer's `onChange`, and
  `toggle()`.

A node's own parts (`itemtrigger`, `itemcontent`, `itemlabel`, `itemindicator`)
read the node's instance. The nodes inside its content root their own. Nested
same-family widget roots, hand-written, work in both modes — `nested.tsrx` and
`nested-open.tsrx` are the witnesses, and the browser suite's two-trees and
per-node-handler rows say the instances stay apart.

## Deviations from the QDS part list, and why

1. **No `aria-setsize` and no `aria-posinset`.** The APG asks for them only when
   the DOM does not fully represent the hierarchy, and with nested
   `role="group"` containers ours does. Captured proof that this is right: the
   virtual reader announces "position 1, set size 2" off the DOM alone, with
   neither attribute emitted.
2. **`leaf` is an explicit prop.** Inferring it from "has no `tree.itemcontent`"
   would need a child-to-parent seed, and the open/closed rule needs the answer
   at render time.
3. **`Enter` and `Space` on a row click that row's OWN trigger**, found in the
   tree's own `triggerEls` set and checked to belong to this row rather than a
   row nested inside it. QDS clicks "the first focusable inside the row", which
   follows a link written before the trigger. `file-explorer.tsrx` writes the
   link first on purpose and the browser suite asserts the link is not followed.
4. **The indicator carries `ui-open`/`ui-closed`.** QDS ships a bare `<span>`
   with no state at all, which a stylesheet cannot rotate.
5. **No typeahead timer.** QDS holds a `window.setTimeout` handle in a signal.
   Here the buffer and the moment its last key landed are two attributes on the
   container plus a `Date.now()` comparison, so nothing is pending across resume.

## Level is a prop

QDS reads a node's level from the nearest enclosing item's context. That route is
closed here: a component that roots an instance of a family cannot also read the
enclosing instance of the same family, and a seed is built from the component's
own props or constants only (`MARKLESS_SHARED_SEED_UNSUPPORTED`, the rule radio
group already hit). So `tree.item` takes `level`, counting from 1, and a
recursive node passes `level={level + 1}` to its children — the same way the
landed recursion fixture passes `depth`.

## What the compiler forced — measured on this tip

1. **A handler on the element that ROOTS a widget instance cannot read that
   instance.** STALE IN BOTH HALVES as of 2026-08-23 — the instance read was
   re-measured working on a widget ROOT that day (U202), and the never-woken half
   (defect 58) was closed the same day (U211). The shipped code below is
   unchanged all the same: neither re-measurement was followed by a conversion in
   this folder. See the U202 and U205 sections below, both re-anchored.
   `tree.root`'s own `onFocusin` and
   `onKeydown` threw
   `ReferenceError: tree is not defined` out of the lowered symbol on the first
   event. Both handlers are therefore written against the DOM alone, and the two
   pieces of state they maintain live on the container element rather than in
   the graph: the roving tab stop (`tabindex`, moved by `setAttribute`) and the
   typeahead buffer (`ui-typeahead`, `ui-typeahead-at`). The row renders
   `tabindex="-1"` and the container `tabindex="0"` as literals, so the framework
   writes each once and never again and the imperative writes stick.
2. **A part nested inside another part resolves a different instance of the same
   family.** With `tree.itemlabel` written inside `tree.itemtrigger`, the trigger
   read the label handle at instance path `mx-c0-p1-…` while the label minted its
   id at `mx-c0-p1-p2-…`, so `aria-labelledby` pointed at an id that did not
   exist. Every scenario therefore writes the label as a **sibling** of the
   trigger, and the browser suite asserts the trigger's `aria-labelledby` equals
   the label's minted id.
3. **`@if` and `@for` cannot be direct children of a component tag**
   (`MARKLESS_PARSE_ERROR`, the same limit `tabs/scenarios/arm-tabs.tsrx`
   records). A recursive arm or a loop inside `tree.itemcontent` needs an
   intrinsic wrapper, so `deep.tsrx` and `nodes-from-data.tsrx` write
   `<div role="none">`, which takes the wrapper back out of the accessibility
   tree and leaves the group owning its rows. The keyboard walk is written by
   containment (`here.contains(next)`) rather than by a `[role="group"] >`
   child selector for exactly this reason.
4. **`tree.itemcontent` reads a `computed()`, not the comparison inline.** The
   inline read renders the group closed and never refreshes at the first level.

## Re-measured 2026-08-23 (U202, at `c4edc6d9`)

The owner's "no DOM selectors" order sent this family back for a rework. Two
facts were measured with throwaway probe scenarios before any code was touched,
and they decide what the rework can and cannot do. The probes were deleted; the
shipped code in this folder is UNCHANGED and still walks the DOM.

**The rooting-element limit has LIFTED.** A handler written on the element that
roots a widget instance now reads and writes that instance, and calls its shared
methods. Probe: a component rooting a `widget`-scoped instance, with
`onKeydown={() => { probe.hits = probe.hits + 1 }}` on its own root element, and
a sibling part rendering `probe.hits`. One keystroke rendered `1`. Calling a
shared method from the same handler also ran. So "What the compiler forced" item
1 above is no longer true, and `tree.root`'s handlers may read `treeState()`.

**Registering items into the enclosing instance is still not expressible**, and
that is what the keyboard walk actually needs — an ordered collection of the
tree's rows, each with a focusable element reference. Three routes, all closed,
all measured:

1. A plain (non-`state()`) array field on the shared instance:
   `MARKLESS_SHARED_SEED_UNKNOWN_FIELD` — "Instance callback fields such as
   `rows` are not supported yet (tracked)".
2. Accumulating into a `state()` array from a component body
   (`tree.rows = tree.rows.concat([...])`): `MARKLESS_SHARED_SEED_UNSUPPORTED` —
   "a component body seeds a shared instance only from its own props or from
   constants". Reading the enclosing instance is neither.
3. Calling a shared method on the enclosing instance from a component body
   (`tree.register(name)`): compiles clean and **silently does nothing**. In one
   probe two item bodies called it and the rendered value stayed empty, while the
   same method called from a handler on the same run appended as written. This is
   the closest miss of the three: the syntax is accepted, only the body-time
   execution is missing. *Not re-measured since `handler callbacks route
   shared-instance writes` (commit `7d009f8f`, defect 66) landed on 2026-08-23.
   That landing is about handler-time writes and this gap is body-time, so it is
   not obviously the same thing — but the route is cheap to re-try and nobody
   has.*

Without registration there is no ordered row collection, so `ArrowDown`/`ArrowUp`
/`Home`/`End`, the descend and ascend steps, the roving tab stop and the
typeahead scan cannot be re-expressed through primitives. `tree.item`'s own
toggling (`ArrowRight` to open, `ArrowLeft` to close, `Enter`/`Space`) no longer
needs the DOM at all now that limit 1 has lifted — it is only focus MOVEMENT that
is stuck.

### Corrected 2026-08-23 (U205): the item's toggling could NOT be converted — its cause CLOSED the same day (U211)

The paragraph above expected `ArrowRight`/`ArrowLeft`/`Enter`/`Space` to drop the
DOM once limit 1 lifted. It was tried on 2026-08-23 and did not work then, so the
shipped keyboard is unchanged and every key is still handled on `tree.root`. The
cause U205 found has since been closed; read the re-anchor below before treating
anything in this section as current.

**A keydown handler declared on `tree.item` never runs. — CLOSED 2026-08-23
(defect 58, non-reproducing).**

*Re-measured 2026-08-23 by the headless-pilot board, unit
`U211-widget-root-handler-wake`: a nested widget-rooting element's handler wakes
and runs, at two nesting depths, in CSR and after resume. It was fixed
collaterally by `handler callbacks route shared-instance writes` (commit
`7d009f8f`, defect 66), which is on this tip and postdates every measurement in
this section. The shipped keyboard here is unchanged — every key is still handled
on `tree.root` — because the conversion was not re-tried after that landing.*

***The live claim for the next reader is defect 67, not 58.*** *What U211 did
reproduce is narrower: only the innermost element on a bubble path is resumed, so
an enclosing element's same-event handler is dropped. That is exactly the shape a
per-item keydown would take here — `tree.item` rows nest inside one another and
inside `tree.root`, and `tree.root`'s single `onKeydown` is the enclosing handler
this family's whole navigation depends on. So the conversion U205 tried is
plausibly blocked again by 67 even though 58 is gone, and it should be re-tried
only after 67 lands. Its fix is in flight as board unit
`U232-bubble-path-dispatch`. Nothing in that paragraph was measured in this
family; it follows from U211's reproduction.*

The measurement that opened 58, kept as history: the handler was written
on the item's own root element, calling `item.toggle()`. It compiles clean, the
runtime matches the event (`keydown matched event record c1:h2`, and
`bound:symbol:2:component-edge:1` runs), and then the trace says
`keydown [div] · woke 0 modules`: the handler's own symbol module is never woken,
so its body never executes. A `console.log` as the first statement in that
handler printed nothing across a full suite run, while the same `console.log` in
`tree.root`'s `onFocusin` printed on every focus (`focusin ... woke 1 modules`).
All 15 keyboard rows went red, none with a runtime error.

U202's probe measured something narrower than it concluded: a handler on the
element rooting a widget instance can read that instance **when its symbol is
woken**. What is missing here is the wake, not the instance read. So the
rooting-element limit is lifted for the root of a widget (`tree.root`,
`navbar.root`, `navbar.item`, all of which wake and run today) and not for
`tree.item`, whose keydown record is matched but never woken.

*That last split no longer holds: `tree.item` wakes too as of 2026-08-23 (U211,
and `7d009f8f` behind it). The first half of the reading — that the missing piece
was the wake and not the instance read — is what survived, and it is why closing
the wake was enough.*

The capability to raise: **ordered item registration into an ancestor widget
instance** — a descendant widget or part appending its `element()` handle, and
the per-item facts a walk reads, to a collection field on an enclosing widget's
shared instance, readable and indexable from any handler inside that widget. It
is the mechanism QDS spells as its ref-array registration and
`base/src/helpers/item-registry.ts` (see `notes/T012-design-system-from-code.md`
§2). Making route 3 execute at body time would be the smallest change that
unlocks it.

**LANDED, and this family is converted — 2026-08-24.** `element<T[]>()` is that
collection: one plural handle bound on every part of a kind reads back live and
in document order, and `el={[a, b]}` lets a part carry an item-instance handle
and a root-instance set membership at once. `treeState` now holds `rootEl`,
`rowEls`, `groupEls`, `triggerEls` and `labelEls`; `tree-walk.ts` turns them into
the visible-row walk, "which row am I on", "this row's own trigger or label" and
"the row one level up". No selector is read anywhere in `tree.tsrx`, and
`ui-treeitemtrigger` and `ui-treeitemlabel` are gone with the queries that
needed them.

## Open/closed is `hidden`, never an arm

The group is always in the page and `hidden` decides whether it shows. Three
independent reasons, all recorded in research §6c.1: a widget root inside an arm
that flips at runtime is refused outright
(`MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED`) and every node in a group is one; the
ids other parts point at would dangle; and it is the rule the landed tabs panel
and collapsible content already follow.

## Navigation, without a registry

One `onKeydown` on `tree.root`, not one per row. Keydown bubbles, so a handler
per row would run once for the row and again for every row enclosing it, and each
of those would act on its own instance. The single root handler reads
`event.target`, walks
`root.querySelectorAll('[role="treeitem"]')` filtered by
`!row.closest('[role="group"][hidden]')`, and opens or closes by clicking the
focused row's own marked trigger — which routes the change through that node's
instance without the handler ever needing to reach it.

`ArrowRight` is two-phase (open, then descend) and `ArrowDown` never opens
anything; both are asserted in both directions.

## Pinned rows

Four walls, all deterministic, all `test.fails` so the row turns red the day the
wall lifts.

1. **`${mode}: branches written open render open`.** A node written `open`
   reports itself open — its element carries `aria-expanded="true"` and
   `ui-open` — while its group is still served hidden, because the seed the
   node's body writes does not reach the `tree.itemcontent` part's first read.
   Measured: the group follows the node perfectly from the first gesture onward
   (`CSR: a second-level node opens and closes its own group from the first
   gesture` is the witness, and it also proves the instance is shared). What
   separates this from collapsible's working `open` prop is that `tree.item` is a
   widget root inside a widget root. Every keyboard row therefore opens its
   branch by gesture rather than by prop.
2. **`CSR: a self-composing node unrolls to the depth its prop names`** and the
   two `deep.tsrx` gesture rows. **SSR renders it correctly** — four levels of one
   component composing itself, each rooting its own widget instance — and CSR
   throws `Error: Unknown async symbol c0:p4:p5:c0:p1:symbol:2` out of the client
   resolver before anything renders. This is research §6c.2's spike: the landed
   recursion receipts cover a PLAIN self-composing component, and the
   widget-rooting half of that capability is red on the client only.
3. **`CSR: the nested level of a loop over nested data renders its nodes`.** SSR
   renders three file rows at level 2 from a keyed `@for` inside
   `tree.itemcontent`; CSR renders the outer loop's two folders and zero files,
   with no diagnostic and no runtime error. Research §6c.3 expected this row to
   fail; it fails in one mode.

## Screen-reader lane

`tree.sr.ts` runs the derived sequences from research §4c. **There is no aria-at
plan for treeview or treegrid**, so every expectation is ours, derived from the
WAI-ARIA semantics, and every phrase was captured from the reader before it was
written down.

Two facts have no slot in the shared reader vocabulary — the `tree` and
`treeitem` roles, and the level — so the rows that need them assert on the
captured phrase and say so at the site. `test-support/vocabularies.ts` is outside
this family's scope; adding `tree`, `treeitem` and a level slot would let those
rows use `Conveys` like every other family.

Captured, and worth knowing: **the accessible name of an OPEN row is the text of
its whole subtree** ("src index.ts app.tsrx"), because the row has no name of its
own and the reader computes one from its contents. Naming the row from
`tree.itemlabel` would need an IDREF handle read on a widget root, which is
`MARKLESS_ELEMENT_HANDLE_IDREF_WIDGET_ROOT` today — the same blocker that stops
`tree.label` naming the tree, which is why the scenarios write `aria-label` on
the root instead.

### The lane needs `fileParallelism: false`

Measured on this tip, and it is not a tree defect. `pnpm test:sr` runs its files
in **parallel** — `test-support/vitest.config.ts` does not set
`fileParallelism: false`, while the `ui` browser project does, on the U173
measurement that parallel iframes contend on one dev server until gesture
latency crosses the 1000ms poll ceiling (p99 1230ms parallel vs 363ms serial).

- With `tree.sr.ts` moved aside, the lane is green: 79 passed, 7 expected fail.
- With it present, the lane loses three to four rows in OTHER families —
  `pagination`: "activating a page moves the current-page state to it",
  `tabs`: "arrowing to the next tab announces that tab as selected",
  `collapsible`: "pressing enter announces the trigger as expanded". Every one of
  them is a gesture row waiting inside a 1s poll. Which ones fail varies run to
  run; that they are gesture rows does not.
- Run on its own, `tree.sr.ts` is green, and so is each of those three families
  run together without it.

This family's own gesture row was rewritten to survive the load — the click
happens before the reader starts and the wait is a plain loop, not a poll — and
it now passes in the full lane. The three foreign rows cannot be fixed from
inside `src/tree/`. The one-line fix is `fileParallelism: false` in
`packages/headless/components/test-support/vitest.config.ts`, which is the same
setting and the same reason the browser project already carries.

The driver's key vocabulary has `space`, `enter`, `arrowDown` and `arrowRight`
only, so the reader lane cannot press ArrowLeft, Home or End. Those keys are
covered in the browser suite and are an honest gap here, not an untested one.
