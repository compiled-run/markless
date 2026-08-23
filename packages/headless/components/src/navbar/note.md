# navbar — implementation notes

Research: `goals/headless-components/notes/research-navbar.md`.
QDS source read as structural truth:
`~/dev/open-source/qwik-design-system/libs/components/src/navbar/`.

## Shape

Five parts: `navbar.root`, `.item`, `.itemtrigger`, `.itemcontent`, `.itemlink`.
Four of them are the QDS `index.ts` exactly. The fifth is the argued deviation
below.

The family is a **disclosure**, never a menubar. `role="menubar"` puts screen
readers into application mode and promises desktop-menu behaviour that site
navigation does not have; the authoring practices, the aria-at
`disclosure-navigation` plan, QDS's own `spec.md` and every library in the survey
agree. `navbar.browser.ts` asserts no `menu`, `menubar` or `menuitem` role
anywhere in the landmark, and `navbar.sr.ts` asserts a reader never says
"menubar" or "menuitem" while walking it.

One widget family, `navbarState`, rooted by `navbar.root`: `value`, `hover`,
`delay`, `clickGrace`, the consumer's `onChange`, and `show()`, `toggle()`,
`closeAll()`. It is exported as `state` beside the parts, per the owner's
namespace ruling. `navbarItemState` is a second widget-scoped family rooted by
each `navbar.item`, holding that item's `value`, its `active` flag, the panel's
minted id handle, and the three numbers a hover has to remember. It is
deliberately **not** in `index.ts`: it is anatomy, not consumer surface.

## The gate the research named, and what replaced it

The research note's premise is that `navbar.item` **is** a `PopoverRoot`, so
navbar cannot land before a popover family does. There is no popover family in
`packages/headless/components/src`, and this unit was directed to build on the
shipped disclosure precedents instead — collapsible and tabs — rather than wait.

That turns out to be closer to the specification, not further from it. The
authoring practices' own disclosure-navigation example is a `<nav>` of plain
buttons carrying `aria-expanded` and `aria-controls` over containers that are
shown and hidden. It uses no top layer at all. So this family writes the
disclosure directly:

| Concern | QDS (through `popover="auto"`) | Here |
| --- | --- | --- |
| show / hide | top layer, `popovertarget` | `hidden` on the panel |
| light dismiss | the browser | the `overlay` mark reports the outside press; `onDismiss` closes |
| Escape closes | the browser | the `overlay` mark reports it; `onDismiss` closes |
| focus returns on Escape | the browser | written by hand — the primitive moves no focus |
| one dropdown at a time | popover-stack eviction | one `value` on the root |
| detached top-layer entries | a known Fluent UI hazard | not reachable — never in the top layer |

## Deviations from QDS, and the reason for each

1. **`navbar.itemlink` ships, and QDS's does not.** QDS's `spec.md` names five
   parts and its `index.ts` exports four; `navbar-item-link.tsx` was never
   written. The consequence is that the shipped family has nowhere to put
   `aria-current="page"`, which the aria-at disclosure-navigation plan carries as
   a **priority-1** assertion (`stateCurrentPage`). This is QDS's own design,
   built rather than reinvented. Recorded as an argued deviation from the QDS
   export list.
2. **`current` is per LINK, not per item.** `spec.md` put an `active` prop on
   `navbar.item` and had `itemlink` read it back. An item's dropdown holds many
   links and only one of them is the page a person is on, so the ARIA has to be
   decided per link — the shape pagination already ships. `navbar.item`'s
   `active` survives as a styling flag (`ui-active`) and writes no ARIA.
3. **Which dropdown is showing lives on the ROOT, as a `value`.** QDS gets
   mutual exclusion free from the popover stack. Without a top layer, opening one
   dropdown has to close the others, and an instance rooted by an item cannot
   reach its siblings. One value the whole navbar shares says it in one write,
   and it is the shape tabs ships. `navbar.item` therefore takes a required
   `value`, the way `tabs.trigger` does.
4. **No `<ul>`/`<li>`.** `spec.md` decision #1 dropped the list deliberately:
   the `<nav>` landmark is the primary mechanism and "list, 3 items" is
   supplemental. The measured cost is exactly one assertion, `listBoundary`, at
   **priority 3** — the weakest tier. Following QDS, and recording the price.
5. **No default `aria-label` on the `<nav>`.** `spec.md` promises one and the
   code writes none. aria-at makes the region name priority 1, so a nameless
   navbar does fail an assertion — but a hard-coded "Navigation" on a page with a
   primary nav and a footer nav is two landmarks a reader cannot tell apart.
   `{...rest}` is spread first, so a consumer's own name is the only name. The
   research recommends a dev-mode diagnostic when neither `aria-label` nor
   `aria-labelledby` is present; that needs compiler or core work and is **not**
   in this family.
6. **`switchDelay` is folded into the root's `value`.** QDS keeps a separate
   300 ms skip window. While any dropdown is showing, the next one opens with no
   delay at all — QDS's own better model, argued in its `hover-research.md`, and
   it costs one fewer prop.
7. **No `orientation`.** QDS defers vertical navbars and so does this. A vertical
   top level needs `ArrowUp`/`ArrowDown`, which collides with
   `ArrowDown`-opens-the-dropdown.
8. **`{...rest}` is spread first** on every part, so a consumer can name the
   landmark and cannot overwrite `aria-expanded`, `aria-controls`, `hidden` or
   `aria-current`.

## What the runtime forced

Everything below is measured on this tip, not assumed.

1. **An event reaches the NEAREST part that declared a handler for it, and
   stops.** This is the single fact that shaped the keyboard and pointer model.
   Written the way the research sketches it — the top-level arrow walk on
   `navbar.root` — the walk worked from a link (which declares no `keydown`) and
   did nothing at all from a trigger (which declares one): the trigger's handler
   shadowed the root's and the root's never ran. Every rule therefore lives on
   the part that actually receives the event:
   - the top-level `ArrowLeft`/`ArrowRight` walk is on `itemtrigger` **and** on
     `itemlink`, and stays on `root` as the fallback for a consumer's own
     focusable written straight into the navbar;
   - the in-dropdown walk is on `itemlink`, and stays on `itemcontent` as the
     fallback for a consumer's own focusable inside a panel;
   - close-on-pointer-leave moved from `root` to `item` for the same reason,
     and it is still decided against the **landmark** — `nav.contains(relatedTarget)`
     — so moving from a trigger into its own dropdown never closes anything.
   `navbar.itemlink` resolves no instance at all (it did read `navbarState()`
   while it carried its own `Escape` branch; the overlay primitive owns that
   report now). It works at the top level and inside a dropdown alike, and reads
   which position it is in off the DOM.
2. **A handler symbol's shared-instance reads are rewritten at the symbol's top
   level and NOT inside a nested closure.** Writing the hover delay the obvious
   way —

   ```js
   item.openTimer = window.setTimeout(() => {
       navbar.show(item.value);        // ReferenceError: navbar is not defined
   }, navbar.delay);
   ```

   throws at run time. This is the family's one genuinely new framework
   requirement (the research calls it N5; `research-popover.md` records timers as
   R13, unproven), and it is the boundary of what the current surface expresses.
   The shape that works keeps the graph out of the callback entirely: the handler
   writes a deadline onto the instance, and the timer does DOM work only — it
   asks the browser to deliver the same `pointerover` again once the delay is up,
   and the handler runs a second time with the graph in reach. **No new authoring
   API was added for this.** A capability that let a scheduled callback reach the
   graph would let the fifteen lines collapse to three, and it is worth
   chartering.
3. **A dispatching write has not reached the DOM by the next line.** `ArrowDown`
   opens the dropdown and then focuses the first link inside it; the panel is
   still `hidden` when the next statement runs, and nothing inside a hidden
   subtree can take focus. Measured: the dropdown opened and focus stayed on the
   button. The focus move therefore waits for the DOM rather than for the call,
   in a DOM-only callback bounded at 20 tries over 200 ms rather than a spin.
4. **A destructuring default cannot be read from a template position.**
   `navbar.itemlink` is written `({ current, ... })` with the fallback at the read
   site, because `({ current = false })` plus `aria-current={current ? …}` is
   `MARKLESS_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED`. Every other part's defaults
   are assigned into the instance in the component body, which is allowed.
5. **`aria-current` is `false` in the absent branch, never `undefined`.** An
   `undefined` branch compiles to no DOM-update record at all; `false` is what
   the attribute writer reads as "remove this attribute". Inherited from
   pagination's measurement.
6. **`event.target`, not `currentTarget`.** A lazy handler symbol runs after the
   native dispatch has finished, and `currentTarget` is null by then.
7. **`preventDefault()` is guarded by plain comparisons on `event.key` alone.** A
   guard written over locals derived from graph state is
   `MARKLESS_SYNC_POLICY_UNEXTRACTABLE`; the "does this key apply here" decision
   lives in a second, non-preventing branch.
8. **Shared methods take `next = ''`, not `next: string`.** A dispatching shared
   method is inlined into the calling handler and the capture analysis parses
   that handler with a JavaScript-only parser; a type annotation makes the parse
   throw and every `onClick?.(event)` in the same handler is then reported as an
   unconditional call. Inherited from pagination.
9. **`@if` cannot be a direct child of a component tag**, and a flipping arm
   holding a shared-instance part is `MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED`.
   `conditional-item.tsrx` therefore wraps its arm in a `<div>` and decides on a
   module constant. **A navbar whose entries depend on whether a person is signed
   in is the everyday shape this cannot express yet.**

## The one identity attribute

`ui-navbar-item` and `ui-navbar-dropdown` are anatomy, not state, and they are
the only two attributes in this family that are not `ui-`-prefixed flags a
stylesheet reads. They exist because a lazily loaded handler has no
`currentTarget`, so every walk starts at `event.target` and climbs, and the climb
needs a name for "the item this control belongs to" and "the panel this link is
inside". QDS reaches the same place through `ui-qds-popover-content`; the
`ui-qds-` prefix is what our convention drops, not the idea. The research
suggested filtering on `[popover]` instead, which is only available to a family
that uses the top layer.

## Re-measured 2026-08-23 (U202, at `c4edc6d9`)

The owner's "no DOM selectors" order sent this family back for a rework. The
measurements were taken in `src/tree/` with throwaway probe scenarios and they
apply here unchanged; `src/tree/note.md`, "Re-measured 2026-08-23", carries the
probe details and the exact diagnostics. The shipped code in this folder is
UNCHANGED and still walks the DOM.

Two results decide what this family's rework can do.

**A handler on a widget-rooting element can now read its own instance.** That
lifts the reason every walk in this family starts at `event.target` and climbs.
The nearest-part logic — `from.closest('[ui-navbar-item]')` in the item's pointer
handlers, `from.closest('nav')` in the root's, `box.querySelector('[aria-expanded]')`
for the Escape focus return — looked expressible through `element()` handles held
on the instance the handler already reads: the item keeping a handle for its own
box, the root for its `<nav>`, the item for its trigger.

**Corrected 2026-08-23 (U205): it is not.** The conversion was written and
measured. `navbarState` took a `navEl` bound with `el=` on the `<nav>`,
`navbarItemState` took `boxEl` on the item `<div>` and `triggerEl` on the
trigger, and the six `.closest()` climbs became `navbar.navEl`, `item.boxEl` and
`item.triggerEl`. It compiles clean with no diagnostic, and 18 of the 47 rows go
red: every path guarded on a handle behaves as if the handle were empty — focus
never moves, the landmark never closes, the hover never opens. `contentEl` keeps
working because it is only ever read in an ATTRIBUTE position (`aria-controls`),
which is the one position a handle is measured to serve.

So the shipped climbs stay, and the reason they exist is now two facts rather
than one: a lazily loaded handler has no `currentTarget`, AND an `element()`
handle does not read back as an element inside a handler.

**Ordered item registration into the enclosing instance is not expressible.**
Three routes measured, all closed (diagnostics in the tree note). That is exactly
what the two arrow-key walks need: the ordered collection of top-level controls,
and the ordered collection of one panel's links. Neither collection can be built,
so `ArrowLeft`/`ArrowRight` at the top level, the six movement keys inside a
panel, and `ArrowDown`'s step into the panel's first control have no
primitive-only form today. The capability to raise is named in the tree note:
ordered item registration into an ancestor widget instance.

Note that the collections this family walks include **consumer-written links**
(`navbar.itemlink`, and plain `<a href>` inside a panel), so registration would
have to work for a part that roots no instance of its own, not only for
`navbar.item`.

## Overlay primitive: LANDED 2026-08-23 (U244, at `8494898d`)

The owner's order is that this family's dropdowns ride the overlay primitive
instead of hand-rolled dismissal. **They do, as of this commit.** The panel
carries the bare `overlay` attribute, and `navbar.itemcontent`'s `onDismiss`
decides what a dismissal means. Nothing is imported for it.

Measured on this tip: 47/47 before the conversion, **51/51 after** (the four new
rows are listed under "Test lanes"), and the screen-reader lane's 12 rows —
including its own Escape row — still green.

### What the earlier attempt hit, and why none of it holds now

U219 wrote this conversion against the previous `openOverlay(element, options)`
surface and recorded four walls. The architecture that landed at `e21d8203`
retired all four, three of them by removing the thing that broke:

1. **`onDismiss` could not write the family's state.** It was
   `MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE` — a callback inside an
   options object is a nested closure, and a shared-instance read is rewritten at
   the handler symbol's top level. `onDismiss` is now an ordinary event attribute
   on the element, so its body is a handler top level: `navbar.closeAll()` and
   `item.graceUntil = …` both compile and both run.
2. **A widget-scoped `element()` handle answered for the wrong item.** The
   conversion no longer passes a handle to anything. The `dismiss` event is
   dispatched on the panel itself and routed to that panel's own handler, so a
   page with three entries reaches the entry that is showing. The suite row `CSR:
   with two entries on the page a dismissal reaches the one that is showing`
   opens the SECOND entry precisely because last-registration-wins would have
   answered for it.
3. **`openOverlay` always moved focus into the surface.** The primitive moves no
   focus at all now, so there is nothing to suppress. The Escape row asserts the
   panel carries no `tabindex`, which is what the old forced focus move left
   behind.
4. **`@markless/ui` could not import the primitive.** There is nothing to import.
   `packages/headless/components/package.json` is untouched.

### What the conversion removed, and what it added

Gone: the three hand-rolled `Escape` branches on `itemtrigger`, `itemcontent` and
`itemlink`, and `Escape` from those three `preventDefault` guard lists — the
primitive's document listener reads `defaultPrevented`, and this family has no
default to suppress. `navbar.itemlink` now resolves no widget instance at all;
`closeAll()` for its own Escape branch was the only reason it read `navbarState`.

Kept, because the primitive deliberately does not do it: the focus return. Escape
from inside an entry has to land on the button that opened the panel, so
`onDismiss` reads whether focus was inside the entry **before** it closes — a
hidden subtree cannot hold focus, so the answer is gone a moment later — and puts
it back on the trigger.

New: light dismiss on an outside press, which this family did not offer before
(see the QDS comparison table above, where the row reads "not offered"). QDS gets
it from `popover="auto"`; adopting the primitive brings the family closer to the
reference rather than further.

### The one collision, and the guard

The primitive reports on **pointerdown**, and a press on the trigger of an open
dropdown lands outside the panel — so the press dismisses and the `click` that
follows the same press would toggle the dropdown straight back open. Measured:
with the guard removed, exactly one row goes red (`CSR: a real press on the
trigger of an open dropdown closes it and leaves it closed`) and it fails on
`aria-expanded` still being `"true"`.

The guard reuses the grace window the hover model already ships:
`onDismiss` arms `item.graceUntil`, and the trigger's existing
`if (item.graceUntil <= Date.now())` swallows the click. It is on the ITEM
instance, so it never suppresses a click on a different entry's trigger — pressing
the Docs trigger while Products is showing still opens Docs.

Its price, recorded rather than hidden: the window is armed by **any**
outside press, not only a press on the trigger, because the `dismiss` report
carries a reason and nothing else. So a press somewhere else on the page followed
by a click on the same entry's trigger inside `clickGrace` (300 ms by default)
does not re-open that entry. Narrowing it needs the press target, or its
coordinates, on the report.

### `onDismiss` has no type — RESOLVED 2026-08-23

The stopgap `overlay-dismiss.d.ts` that used to live in this folder is deleted.
The `dismiss` event is now declared in the type service itself
(`packages/typescript-plugin/src/markless-tsrx.d.ts`, `MarklessEventMap`
intersected into `ElementEventMap` — deliberately not the global
`GlobalEventHandlersEventMap`, so unrelated consumer DOM code is untouched).

One more thing the compiler required: `MARKLESS_EVENT_SPREAD_SHADOWED`. A part
that spreads `{...rest}` and writes its own `onDismiss` has to destructure the
prop and call it, the way every other handler in this family does.
`navbar.itemcontent` takes `onDismiss` and runs the consumer's after its own.

## Panels stay mounted

`hidden` decides whether a dropdown shows; an arm never does. The trigger's
`aria-controls` points at the panel's minted id, and an unmount would leave that
reference dangling — plus the focus, scroll position and form state inside a
panel would be lost on every close. This is the same never-unmount rule
collapsible and tabs ship, and it is independently the fix for the Fluent UI
hazard the research quotes (a surface that unmounts before its close-side effect
can run).

## The trigger-collision guard is armed by identity

One press can produce two reports. `userEvent.click` on the trigger of an open
dropdown sends a `pointerdown` that lands outside the panel, so the primitive
reports a dismissal and the family closes — and then the `click` from that same
press reaches the trigger, whose handler would toggle the entry straight back
open. Something has to tell the trigger that the close it is about to undo was
caused by its own press.

The first version of that guard was a deadline on the item: any dismissal set
`graceUntil` to now plus `clickGrace`, and the trigger swallowed every click
before it. It worked for the collision and cost a real interaction. A person who
pressed anywhere else on the page while a dropdown was showing — dismissing it —
and then went straight to a trigger had that click swallowed too, because the
window could not tell the two presses apart. 300 ms is easily inside a normal
reach across a header.

The report now carries `pressTarget` for `outside-press` (and omits the key for
`escape`, which has no target), so `onDismiss` asks where instead of how soon:

    const pressed = event.detail.pressTarget;
    const onOwnTrigger = pressed !== undefined && back !== null && back.contains(pressed);

The `as unknown as HTMLElement | undefined` on that read is a stopgap, and it is
carried here rather than hidden. `markless-tsrx.d.ts` declares
`pressTarget?: Element` with a bare `Element`, which inside
`declare namespace __MarklessTypeService` resolves to that namespace's own branded
markup `Element` — an interface with no DOM members at all, so
`back.contains(pressed)` is `TS2345: Argument of type 'Element' is not assignable
to parameter of type 'Node'`. Every other DOM element reference in that file is
spelled `globalThis.Element` (the IDREF type two lines below `Element`'s own
declaration, and eight generic constraints), so this is a slip rather than a
decision, and the fix is that one word. It is outside this folder, so this unit
could not make it; the cast comes out the day it lands. Any consumer who touches
`event.detail.pressTarget` as a node hits the same error today.

`back` is the same `box.querySelector('[aria-expanded]')` climb the Escape focus
return already uses, not an `element()` handle — a handle does not read back as
an element inside a handler on this tip, measured above. `contains` rather than
`===` because a consumer is free to put an icon or a span inside the trigger, and
that is what the press lands on.

Only that press can collide, so only that press arms the swallow. The deadline
did not go away, it just stopped being the whole guard: the click that pairs with
a press may never arrive (the pointer moves off before release), so the armed
state still has to expire on its own rather than wait for a click that is not
coming. Hover-opening still arms it on its own account, for the unrelated reason
that a dropdown opened under a resting pointer should not be shut by the click
that follows.

## Test lanes

`navbar.browser.ts` — 52 rows, all green: the shared rows in both modes, the
consumer callback, gestures, the full keyboard model, four resume rows, the
dismissal block, and the hover block.

The five dismissal rows are what the overlay adoption is proved by:

- `escape arrives as a dismissal and only the family moves focus` — the mark is
  bare, the panel closes, focus lands on the trigger, and the panel took no
  `tabindex`, so the only focus move on the page was the family's;
- `a press outside the panel closes the dropdown that was showing` — behaviour
  this family did not have before;
- `with two entries on the page a dismissal reaches the one that is showing` —
  the second entry, because that is the one a shared flat handle map would get
  wrong;
- `a press away from the trigger leaves the next click on it working` — the
  identity guard below, and the row that goes red the moment the swallow is armed
  on any dismissal again (measured: arming unconditionally fails it on the click
  that should have re-opened the entry);
- `a real press on the trigger of an open dropdown closes it and leaves it
  closed` — the pointerdown-versus-click collision, and the only row in the file
  that presses with a real pointer, which is why it sits last.

**The hover rows run last, and the order is load-bearing.** The pointer in a real
browser stays where the previous test left it, so a row that hovers leaves the
cursor parked over the next test's freshly rendered navbar and opens a dropdown
nobody asked for. Measured: with the hover rows in the middle of the file, four
later rows failed on a panel a parked pointer had opened; moving them to the end
made all four green with no change to the family.

`navbar.sr.ts` — 12 rows, all green **when the file runs on its own**, covering
the aria-at plan's sequences A–F over that plan's own "Mythical University"
fixture: the landmark and its name, the three button names, collapsed, the change
to expanded, the link role and names inside an opened dropdown, the current page,
the change back to collapsed on Escape, and the named page-content region. The
`listBoundary` assertion (priority 3) has no row because there is no list; §4 of
the deviations above carries the decision.

### The lane problem this note used to carry is fixed

It recorded that adding a thirteenth `*.sr.ts` file pushed the screen-reader
project past its concurrency ceiling, and that the fix — `fileParallelism: false`
in `packages/headless/components/test-support/vitest.config.ts` — was outside the
unit's contract. That config now carries it. Re-measured 2026-08-23 (U244):
`pnpm test:sr` runs 14 files, 98 passed, 7 expected fail, 4 skipped, exit 0.

## Not wired into the barrel

`src/index.ts` does not carry `navbar` yet, and neither does the package's
`exports` map, so the scenarios import `../index.ts` directly. Both are the PM's
to wire at fan-in.

## Still open

- **A scheduled callback cannot reach the graph.** Point 2 above. Worth
  chartering; the hover delay works today only because the timer can bounce the
  crossing back through the browser.
- ~~`dismiss` has no type in the type service.~~ RESOLVED 2026-08-23: declared in
  `markless-tsrx.d.ts` via `MarklessEventMap`; the folder stopgap is deleted.
- ~~A `dismiss` report says why, not where.~~ RESOLVED 2026-08-23: the detail
  carries `pressTarget` for `outside-press` and omits the key for `escape`, so
  `navbar.itemcontent` arms the swallow by identity — only when the press landed
  on this item's own trigger. What that bought is in
  [The trigger-collision guard is armed by identity](#the-trigger-collision-guard-is-armed-by-identity).
- **`pressTarget` is declared with the wrong `Element`.** One bare `Element` in
  `packages/typescript-plugin/src/markless-tsrx.d.ts` where every neighbour says
  `globalThis.Element`; the folder carries a cast until it is fixed. Section
  [The trigger-collision guard is armed by identity](#the-trigger-collision-guard-is-armed-by-identity)
  has the error and the one-word fix.
- **A navbar entry inside a flipping arm.** Point 9 above.
- **A dev-mode diagnostic for an unnamed landmark.** Deviation 5.
- **`Home`/`End` at the top level.** `spec.md` promises them and QDS's code
  implements only the arrows; the authoring practices list them as optional. Not
  implemented here either, and recorded rather than silently inherited.
