# radio-group — implementation notes

Research: `goals/headless-components/notes/research-radio-group.md`.

## Shape

Two widget families, not one:

- `radiogroupState` — rooted by `radiogroup.root`. Holds `value`, `orientation`,
  `loop`, `disabled`, `required`, `name`, `invalid`, `tabbable`, the consumer's
  `onChange`, and `choose(next)`.
- `radiogroupItemState` — rooted by `radiogroup.item`. Holds that one option's
  `value`, its own `disabled`, and the `element()` handle for its native radio.

`radiogroup.item`'s body reads the group instance while rooting an instance of
the item family, and the parts inside an item (`itemtrigger`, `itemindicator`,
`itemlabel`, `itemfield`) read both. That is the nested-family shape research
§6c named, and it is why an item label can point `for` at its own input with no
registry and no construction-order index.

## Deviations from the QDS part list, and why

1. **No group-level `field` part.** QDS ships one that renders nothing and pushes
   `name` and `required` into context, with its own dev warning that it must come
   before any item. `name` and `required` are plain props on `radiogroup.root`
   here: one fewer part, no ordering footgun, and `field` keeps the meaning it
   has in checkbox, toggle and textbox — the hidden native control. Research §7
   argues this, §9.1 flagged it as wanting a ruling, and the ruling is that the
   family has one field part, `itemfield`.
2. **`root` is a `<div role="radiogroup">` and `label` is a `<label>`.** No
   `<fieldset>`, no `<legend>`: a consumer who wanted native HTML would write
   native HTML. The group's name rides `aria-labelledby` to the label's handle.
   The root cannot carry that IDREF itself
   (`MARKLESS_ELEMENT_HANDLE_IDREF_WIDGET_ROOT`), so the root renders one private
   component a level down that owns the role and the IDREF — the `progress.bar`
   idiom. Group `disabled` is explicit rather than the fieldset cascade: it
   reaches each option's input, item and trigger through the same read the
   option's own `disabled` prop takes. QDS emits an `aria-labelledby` that points
   at an id which may not exist; a handle that was never bound drops the
   attribute instead.
3. **`itemtrigger` carries no `aria-checked` and no `role`.** QDS puts
   `aria-checked` on a plain div, where it is inert. The radio semantics live on
   the native input beside it; the trigger reports `ui-selected` instead.
4. **`itemtrigger` does not render `itemfield` for you.** A consumer places
   `radiogroup.itemfield` the way they place `checkbox.field`, so placing both
   cannot produce two inputs.
5. **The arrow axis is gated on `orientation`** (5 of 7 surveyed libraries do
   this; QDS does not, though it takes the prop).

## What the compiler forced

Re-measured 2026-08-23 on the pilot tip that fixed the capture-analysis
TypeScript parse, the SSR prelude union, instance-identity layers 4-7, the
claimed-root callback binding and the detached method receiver. Three of the
four workarounds the earlier attempt applied are GONE, restored to their natural
authored shapes and green:

- `choose(next: string)` carries its own annotation again, and the factory no
  longer needs a written return type to contextually type it. The
  `RadioGroupInstance` type existed only to carry that annotation and is deleted.
- The keyboard walk selects with `querySelectorAll<HTMLInputElement>('input[type="radio"]')`
  and casts `event.target`, instead of selecting by bare tag and narrowing with
  `instanceof`. A handler source now parses with its TypeScript intact.
- Nothing else in the family needs a shape it would not have been written in.

Two things still have to be written around, both MEASURED on this tip, not
assumed:

1. **An `@if` condition written as an expression renders once and then never
   refreshes.** Probed directly: after a choice lands, the item's `ui-selected`,
   the trigger's `ui-selected` and the native input's `checked` all update, while
   an `@if` arm over the identical comparison stays empty. It is not about the
   two families or the comparison - `@if (group.value === 'a')`, one family
   against a literal, is equally stale, and `@if (someComputed)` refreshes. So
   `radiogroup.itemindicator` reads a `computed()`, and the arm reads one graph
   cell. Worth 17 rows of this suite. Checkbox's `@if (checkbox.checked)` works
   because a bare property read is not an expression, which is why the gap has
   gone unnoticed.
2. **`tabindex` stays hoisted to a `computed()`.** Restoring the inline
   conditional compiles and passes a first run, but it destabilises gestures: 4
   suite runs with it inline went red 3 times, in two different rows (the
   consumer-callback row twice, the horizontal-axis walk once), each an
   intermittent first-gesture race rather than a fixed failure. The same 3 runs
   with the value hoisted were green 3 for 3. The hoist is therefore kept as a
   measurement, not a preference.

## Pinned row

`a mounted error marks the group invalid` is pinned `test.fails` in both modes.
`radiogroup.error` sets `group.invalid = true` from its own component body, and
the root's `aria-invalid` never picks it up: both roots read `"false"` in CSR and
SSR alike, whichever side of the options the error is written on. A write made
while the shared instance is still rendering schedules no refresh for a part that
already rendered, so document order is not the cause and no in-family shape
avoids it. Checklist pins the same row for the same reason. It is deterministic,
so `test.fails` rather than skip: the row turns red the day the write propagates,
which is the signal to unpin it.

## What the compiler forced originally

- `item.disabled = disabled || group.disabled` is `MARKLESS_SHARED_SEED_UNSUPPORTED`:
  a component body seeds a shared instance from its own props or constants only.
  The item seeds its own prop, and every read site adds `|| group.disabled`.
- `preventDefault()` inside a guard written over local `const`s derived from
  graph state is `MARKLESS_SYNC_POLICY_UNEXTRACTABLE`. The policy is now a plain
  six-key comparison on `event.key`, with the orientation gate in a second,
  non-preventing branch — the same split QDS reaches by a different route.

## Roving tabindex without an index

QDS gives the first item the tab stop when nothing is chosen, using a
construction-order counter. Markless seeds are order-independent by design, so
this family answers with `tabbable` instead: while `value` is empty every enabled
option holds a tab stop, and the first focus writes `tabbable`, which narrows the
group to a single stop from then on. Once a choice exists the chosen option is
the only stop, which is the rule that makes Shift+Tab land on the checked radio.
The group is therefore always reachable, which is the failure mode that matters;
the multi-stop window before the first focus is the known cost.

## Navigation

DOM order is the navigation order:
`closest('[role="radiogroup"]').querySelectorAll('input[type="radio"]')`, filtered
to the enabled ones, from the event's own target. No registry, no ids. Arrow keys
move focus **and** choose — the APG rule for this pattern, and the one every
hand-rolled radio group in the wild gets wrong.

### Why the collection handle cannot replace that walk yet

Measured 2026-08-23 on the pilot tip that landed array-typed `element()` handles
(the C-prime capability). Converting the walk needs `element<HTMLInputElement[]>()`
on the group instance, bound on **the element the walk focuses** — the native
radio. That element already carries `el={item.fieldEl}`, because
`radiogroup.itemlabel` points `for` at it, and the suite pins
`label[for] === input[id]` for every option.

An element accepts exactly one `el`, so the two cannot both land there. Both
spellings were compiled, and both are refused:

- `el={[item.fieldEl, group.fieldEls]}` — `MARKLESS_ELEMENT_HANDLE_REQUIRED`:
  "[item.fieldEl, group.fieldEls]" is an unknown value, not an element() handle.
- dropping the singular so the plural can bind — `MARKLESS_ELEMENT_HANDLE_IDREF_UNBOUND`
  on `for={item.fieldEl}`.

Pointing `for` at the plural handle instead is refused by design: the C-prime
ruling keeps IDREF positions at exactly one element
(`MARKLESS_ELEMENT_HANDLE_PLURAL_IDREF`).

So the gap is not radio-group's shape, it is that one element cannot be both a
singular IDREF target and a member of a declared set. Two ways out, both bigger
than this family:

1. Let `el` carry several handles on one element, each resolved under the rules it
   already has (one singular IDREF target beside one plural membership). Then this
   family converts with no other change.
2. Move the radio semantics onto `radiogroup.itemtrigger` as a
   `<button role="radio">`, the shape checkbox already ships — the trigger becomes
   the focusable element and the label's target, the native input becomes
   aria-hidden form plumbing, and the set binds the triggers. That reverses
   deviation 3 above and makes the trigger mandatory, so it is a family redesign,
   not a conversion.

Workarounds that keep both today were rejected as worse than the walk: binding the
set on a hand-rolled clipping span (duplicates the a11y-critical style
`base/visually-hidden.tsrx` owns, and reaches the input through
`firstElementChild`), and binding it on the item host (still needs a
`querySelector` per row to reach the input).

## Why `name` and `required` sit on the root

The group's form configuration is declared by `radiogroup.root`, and
`radiogroup.itemfield` is the family's one `field` part — the hidden native
radio, the same meaning `field` carries in checkbox, toggle, textbox, select and
combobox. A second, renderless `field` part carrying `name` and `required` was
tried and removed: one role, one meaning.

That placement is also what makes looped options submit. Measured 2026-08-23:
**what a part writes to the group instance never reaches parts built inside a
keyed `@for` row.** With `name` declared by a separate part, options written flat
took it while rows from a loop carried `name=""`, and a 2 second poll never
resolved it — the rows read the instance as the root left it. Three shapes were
measured in `options-from-data.tsrx` (the part before the loop, after the loop,
and the item field reading through a `computed()` cell), all giving `["","",""]`.
The root always writes before rows are built, so declaring there avoids the hole
rather than working around it. The framework gap is still real for any other part
that writes to a shared instance a loop's rows read.
