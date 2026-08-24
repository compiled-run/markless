# accordion — implementation notes

Sources read as structural truth, this unit (there is no `research-accordion.md`;
the owner folded the reading into the unit):

- **Qwik UI headless accordion** — `~/dev/open-source/qwik-ui/packages/kit-headless/src/components/accordion/`
  (`index.ts`, `accordion-root.tsx`, `accordion-item.tsx`, `accordion-trigger.tsx`,
  `accordion-content.tsx`, `accordion-heading.tsx`, `accordion.test.ts`), plus
  `hooks/use-enabled-index.tsx` and the qwik-ui collapsible it composes.
- **QDS collapsible** — `~/dev/open-source/qwik-design-system/libs/components/src/collapsible/`,
  which is where `hidden="until-found"`, `disableUntilFound` and `onBeforematch$` actually live.
- **Our own `collapsible` family**, read-only.

**Status: green.** 42 browser rows (21 assertions x CSR and SSR) pass, and the
virtual screen-reader lane passes with one pinned row that is about the reader,
not about this family.

## Does accordion compose our collapsible? No, and here is the reason

Qwik UI's accordion *is* a collapsible per section: its item renders
`<HCollapsible bind:open={isOpenSig}>`, its trigger renders `HCollapsibleTrigger`
and its content renders `HCollapsibleContent`. (QDS itself has **no** accordion —
the QDS precedent the charter names is its **tree**, whose `tree-item.tsx` wraps
`CollapsibleRoot` the same way.) So the question is real, and the answer here is
still no.

What makes Qwik UI's composition work is `useTask$`. Each item runs a task that
tracks the root's `selectedIndexSig` and writes `isOpenSig.value = false` when the
selected index is not its own. That is a **sibling instance being closed by a
reaction it did not start**, and markless has no effect or task primitive: a
handler runs on the section a person pressed, and nothing else in the page gets a
turn. Composing our `collapsibleState()` side by side (Shape B in
`notes/research-factory-composition.md`, the shape that is measured to work
cross-module) would give every section a real `open` cell that only its own
trigger could ever write — so opening one section could never close another, and
the family would hold two disagreeing answers to "is this section open".

The plain-function-in-factory shape (`{...collapsibleCore()}` inside
`shared()`) was never a candidate: that is defect 83, which compiles green,
creates zero cells and throws `ReferenceError` in a handler.

So the accordion owns its state, and the truth is **one cell on the root**:
`accordion.value` names the section that is showing (or, with `multiple`, the
list of sections that are). Every section derives its own open-ness from it. That
is what makes single-open free — closing the previous section is not an action,
it is the same write — and it is the same call combobox made for the same kind of
reason.

**What is shared instead:** nothing at all today, and the honest reason is that
after the state question is settled there is very little left. The remaining
overlap with collapsible is four lines of attribute writing (`aria-expanded`,
`aria-controls`, `hidden`, `ui-open`/`ui-closed`), which is cheaper to write twice
than to abstract. The roving walk **is** extracted (`accordion-walk.ts`, Shape A —
plain functions handed live elements) and is the natural first member of the
`base/roving-focus.ts` core that research note proposes.

## Shape

Five parts: `accordion.root`, `.item`, `.itemlabel`, `.itemtrigger`,
`.itemcontent`. Qwik UI's five are Root, Item, Trigger, Content, Header; the
`item` prefix on the three inner parts is our grammar's, matching `tree`.

Two `shared()` definitions, both widget-scoped:

- `accordionState` — the root's seeded fields, the consumer's `onChange`, the
  plural trigger handle, and the two rules (`toggle`, `reveal`).
- `accordionItemState` — one instance per section, rooted by `accordion.item`:
  its `value`, its own `disabled`, and the two element handles the section's
  parts point at each other with.

`accordion-walk.ts` is plain DOM, imported by the trigger's keydown.

## `accordion.itemlabel` is a heading, and it is what names the panel

The APG asks for the trigger to sit in a heading and Qwik UI ships `Header` for
it, so the part exists. It renders `<h3>` — Qwik UI's own default — and the
`as` prop that would let a consumer pick the level is not shipped, because the
polymorphic seam is unfinished base-package work (`notes/research-collapsible.md`
§7). **That is this family's one accessibility debt**: an accordion inside an
`<h2>` section wants `<h4>` headings and cannot have them today.

The heading earns its place twice over, because it also solves a handle
collision. The panel wants `aria-labelledby` pointing at the trigger, the walk
wants every trigger in one plural handle, and one element takes one `el`
(`el={[a, b]}` is chartered but not landed). So the trigger binds the **plural**
handle the walk reads, the heading binds a **singular** handle per section, and
the panel is named by the heading — whose words are the trigger's own, since the
trigger is its only child. Nothing is lost and the walk keeps its handle. A
consumer who omits `accordion.itemlabel` gets an unnamed region, which ARIA
already treats as "not a landmark" rather than as a broken one.

## The three-valued `hidden`, and the gap it exposes in collapsible

`accordion.itemcontent` emits `hidden` absent when the section shows, plain
`hidden` when the root carries `disableUntilFound`, and `hidden="until-found"`
otherwise — one `computed()`, three values, `false` (not `undefined`) for the
open case because the attribute writer reads `false` as "remove this" and
`undefined` as no record at all.

`notes/research-collapsible.md` §7 called this the family's one framework risk
and asked for it to be a red-first row. **It is green, in both render modes**: a
three-valued native boolean-ish attribute round-trips through SSR and through the
CSR mount, and flips correctly on every gesture. One row goes further and
measures what the spelling is *for* — Chromium's UA rule really does give the
element `content-visibility: hidden` and a zero height — so this is not a string
we write and hope about.

**But our `collapsible` family does not ship any of it.** The charter says
"MUST support hidden-until-found like collapsible"; the shipped
`collapsible.tsrx` writes `hidden={collapsible.open !== true}` and has no
`disableUntilFound` prop and no `onBeforematch`. The design exists only in
`research-collapsible.md`. So accordion is the **first** family with find-in-page
support, this note is the evidence that the shape works, and **backporting it to
collapsible is a follow-up someone should take** — it is a ten-line change now
that the risk is retired.

`beforematch` needs no compiler work: the event name is a single lowercase word,
so `onBeforematch` lowercases to `beforematch` under the existing rule, and the
handler runs. (The parked `notes/foreign-camelcase-events.patch` is about the
*type* surface for multi-word event names and does not bite here.)

## Animation is the consumer's, and we ship no height

The charter's "we enable, never animate", read literally. Every part carries
`ui-open` / `ui-closed`, so a stylesheet can reach both states, and the panel
stays in the page when closed so a height transition has something to run on.

We ship **no** height custom property. Qwik UI computes one by cloning the hidden
panel into the document and measuring the clone (`use-collapsible.tsx`), driven
by a `useTask$`; QDS does the same through `getContentDimensions$`. **Our
collapsible exposes nothing of the kind**, and the charter's instruction was to
match it rather than invent, so there is nothing to match. A consumer animating
height today writes `grid-template-rows: 0fr / 1fr` or a `max-height`, both of
which need no number from us. If a measured height is wanted later it is one
capability for both families, not an accordion feature.

## Keyboard

One `onKeydown`, on the trigger. `ArrowDown` / `ArrowUp` step one section,
`Home` / `End` jump to the ends, and **the ends always come round**: Qwik UI
calls its index walk with no `loop` argument and that argument only ever *stops*
the wrap, so an accordion wraps and there is no prop to say otherwise. Sections
nobody may open are stepped past, which is Qwik UI's `disabled` suite exactly.
Enter and Space are left alone — a native `<button>` already activates on both.

The walk starts from **`document.activeElement`**, not `event.currentTarget`: a
lazily loaded handler runs after the native dispatch has finished and
`currentTarget` is null by then (measured in tabs, navbar and otp), while focus
has not moved off the button the key was pressed on. It is handed
`accordion.triggerEls`, the array-typed handle bound on every trigger, so there
is no `querySelector` and no `closest` anywhere in the family.

The `preventDefault` guard is written out of event fields alone, because a policy
that has to beat the browser must be readable before the handler symbol loads
(`MARKLESS_SYNC_POLICY_UNEXTRACTABLE`).

## Deviations from Qwik UI, and the constraint or judgement behind each

1. **A section is named by a required `value`, never by its position.** Qwik UI
   derives identity from an injected `_index` and keeps an `itemsMap` of
   index → disabled. Positional identity is not a consumer prop in this library
   and there is no render-time counter; tabs and carousel made the same call.
2. **No per-item `open` prop.** Qwik UI's item takes one, and in `multiple` mode
   it is the *only* thing that opens a section. Here the root's `value` is the
   single truth in both modes — with `multiple` it is the list of open sections —
   so an item `open` prop would be a second, disagreeing seed for the same fact.
3. **No `initialIndex`, no `bind:value`, no `behavior`, no `animated`,
   no `itemsMap`.** Positional again; two-way binding is not our surface;
   `behavior` is deprecated upstream; `animated` exists only to drive the
   automatic-animation task we do not have; `itemsMap` is the registry the plural
   handle replaces.
4. **`collapsible` defaults to true**, exactly upstream, and it is the allow-zero
   switch: with it off, the open section refuses to close, though another may
   take its place.
5. **`disableUntilFound` comes from QDS's collapsible root**, not from qwik-ui,
   whose collapsible has no find-in-page support at all.
6. **`role="region"` is written unconditionally**, as upstream writes it. An
   unnamed region is not exposed as a landmark, so a consumer who skips the
   heading part is not punished for it.

## Measured on this tip, and worth knowing

1. **A section's seed reaches its own child parts on the first read.** The item
   writes `item.value` and `item.disabled` in its body and the trigger, the
   heading and the panel read them from their own bodies — including on the
   server-rendered first paint, which is what the "section the root's value names
   starts open" row proves. `tree`'s note pins the opposite for `tree.item`
   (wall 1 there), so the difference is worth naming: tree seeds the **openness**
   of a node from the node's own prop, while here the openness lives on the root
   and only the section's *name* comes from the item.
2. **A keyed `@for` whose rows root a widget works here, seed and handler
   included.** `scenarios/from-data.tsrx` renders three sections from a
   `computed()` array; clicking a row's trigger runs `accordion.toggle(item.value)`
   with the value the row was seeded with, and the right section opens, in CSR and
   SSR. Carousel's note records `MARKLESS_CAPTURE_OPAQUE_PROP` for what reads like
   the same shape, and combobox records a keyed repeat not following its source.
   Neither reproduces here. The difference this family has is that its source
   array never changes length — combobox's whole point is that it does — so the
   honest reading is: **rooting a widget from a keyed row is fine; a keyed repeat
   whose source changes is the part still known to be broken.**
3. **A plural handle declared on the root's instance binds fine on elements
   inside a nested widget.** `accordion.triggerEls` lives on `accordionState` and
   is bound by `accordion.itemtrigger`, which sits inside the section's own widget
   instance. The walk reads every trigger of its own accordion and none of the
   other one's (`scenarios/two-accordions.tsrx` asserts both halves).
4. **A three-valued `hidden` survives SSR and resume**, as above.
5. **Multi-parameter shared methods and a consumer callback both work** —
   `onChange` fires once per change and the family's rule runs before the
   consumer's own `onClick`, which is what lets their handler read the new state.

## Rows this family does not carry

- **`accordion.itemlabel` cannot choose its heading level.** See above.
- **No `aria-labelledby` from the panel to the trigger itself.** The heading
  stands in, for the handle reason given above. `el={[a, b]}` is the chartered
  capability that would collapse the two.
- **The screen-reader row for a closed panel is pinned red.** The virtual reader
  models `hidden` and `display:none` but not `content-visibility`, so it walks
  into an `until-found` panel that a real accessibility tree does not contain.
  The browser suite carries the real evidence. How a real reader's virtual cursor
  treats an until-found section is genuinely open — the same question
  `notes/research-tree.md` raises for JAWS.
- **No animation hooks beyond `ui-open`/`ui-closed`.** See above.

## Follow-ups this unit did not take

1. **Backport `hidden="until-found"`, `disableUntilFound` and `onBeforematch` to
   `collapsible`.** The charter assumed it was already there. The shape is proven
   here; collapsible is the family that most obviously wants it, and `tree` wants
   it next (QDS's tree carries a `disableUntilFound` of its own).
2. **`base/roving-focus.ts`.** `accordion-walk.ts` is the third hand-rolled copy
   of the same five steps; the extraction is described in
   `notes/research-factory-composition.md` and needs no compiler work.
3. **A heading-level answer** — the `as` seam, or a narrower `level` prop, for
   `accordion.itemlabel`.
