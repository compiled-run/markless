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

1. **`aria-expanded` is emitted the way WAI-ARIA asks, not the way QDS does.** A
   closed parent reports `"false"`; a leaf reports nothing. QDS writes
   `isOpen || undefined`, so a collapsed folder and an end node are announced
   identically and there is no signal that anything can be opened.
2. **No `aria-selected` anywhere.** QDS writes `aria-selected="false"` on every
   node of a tree that has no selection concept. This family is a disclosure
   tree: it opens and closes, and the consumer puts links or buttons in the rows
   for whatever activation means in their app.
3. **No `aria-setsize` and no `aria-posinset`.** The APG asks for them only when
   the DOM does not fully represent the hierarchy, and with nested
   `role="group"` containers ours does. Captured proof that this is right: the
   virtual reader announces "position 1, set size 2" off the DOM alone, with
   neither attribute emitted.
4. **`leaf` is an explicit prop.** Inferring it from "has no `tree.itemcontent`"
   would need a child-to-parent seed; getting `aria-expanded`'s presence right is
   a required rule, not a nicety.
5. **`Enter` and `Space` on a row click that row's OWN trigger**, found by a
   marker attribute (`ui-treeitemtrigger`) and checked to belong to this row.
   QDS clicks "the first focusable inside the row", which follows a link written
   before the trigger. `file-explorer.tsrx` writes the link first on purpose and
   the browser suite asserts the link is not followed.
6. **The indicator carries `ui-open`/`ui-closed` and `aria-hidden="true"`.** QDS
   ships a bare `<span>` with no state at all, which a stylesheet cannot rotate.
7. **No typeahead timer.** QDS holds a `window.setTimeout` handle in a signal.
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
   instance.** `tree.root`'s own `onFocusin` and `onKeydown` throw
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
