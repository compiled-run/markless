# togglegroup — implementation notes

A set of toggle buttons a person presses on and off: text alignment (one at a
time), or bold/italic/underline (any number at once). Built from
`goals/headless-components/notes/U569-togglegroup-research.md`.

## Shape

| Part | Element | Carries |
| --- | --- | --- |
| `togglegroup.root` | `div` | the family's state; renders one private component a level down that owns `role="group"`, `aria-labelledby`, `ui-multiple`, `ui-vertical`, `ui-disabled`, `ui-required` |
| `togglegroup.label` | `label` | the group's accessible name |
| `togglegroup.item` | `button` | `type="button"`, `value`, `aria-pressed`, native `disabled`, the roving `tabindex`, `ui-pressed`, the click, the focus and the keyboard |
| `togglegroup.itemfield` | `input` | the hidden input that carries one pressed item into a form |

`togglegroup.state()` per widget instance: `value` (raw, see below), `multiple`,
`orientation`, `loop`, `disabled`, `required`, `name`, `focused` (the value of
the item holding the roving tab stop, `''` for nobody), and `toggle(value)`.
`togglegroup.itemstate()` per item: `value`, `disabled`.

Root props: `value`, `multiple`, `orientation`, `loop`, `disabled`, `required`,
`name`, `onChange`. Item props: `value` (required), `disabled`.

`ui-pressed` on a pressed item, `ui-disabled` on a locked item and a locked
group, `ui-multiple` and `ui-required` on a multi-select or required group,
`ui-vertical` on a stacked one. Only the non-default axis carries a flag, which
is the owner ruling `tabs` and `carousel` already follow.

## A toggle button is not a switch

`toggle`, the family next door, is `role="switch"` with `aria-checked` and a
`thumb`: an on/off setting that takes effect at once. A toggle button is a
`button` reporting `aria-pressed`, and the two are different roles with
different announcements. So `togglegroup.item` is a new button modelled on
`calendar.item`, not a composed `toggle` — composing one would produce a row of
switches, which is the wrong control, and a shared factory cannot be called from
another module anyway (`MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED`).

## Arrows move focus and never press

This is the family's largest divergence from `radiogroup`, whose note says arrows
"move focus **and** choose — the APG rule for this pattern". A toggle group is
the opposite rule, and both are correct: two families in this library, arrows
doing different things.

Enter and Space are not handled. The item is a real `<button>` and the browser
activates it; handling them would press twice, and a `preventDefault()` from a
deferred handler cannot suppress a native click on a cold page anyway.

`loop` defaults off, following `tabs`. The APG calls arrow wrapping optional for
this pattern; Radix, Base UI, Ark and Bits all default it on, and the owner's own
Qwik UI component defaults it off.

## The value cell holds whichever shape the consumer wrote

A shared cell is seeded from a bare prop and nothing else
(`MARKLESS_SHARED_SEED_UNSUPPORTED`, measured by calendar), so `value` cannot be
normalised on the way in. The cell holds the union raw — a string for a
single-select group, a list for a `multiple` one — and `heldValues()` normalises
at every read. `toggle()` writes back in the same shape it was given, and
`onChange` reports that shape, which is what makes `multiple` readable at the
call site: `''` when a single-select group is cleared, `[]` when a multi-select
one is.

`heldValues` is exported from the family because `state().value` is that union,
and a consumer reading it needs the same normaliser the family uses.

## Roving focus with no DOM selectors

The item binds `el={[item.el, group.itemEls]}` — its own singular handle and the
group's plural one — and the walk in `togglegroup-walk.ts` reads the plural
handle live at handler time. Nothing here queries the DOM, which `tabs` and
`radiogroup` both still have to: their walk target is an element whose single
`el` slot is already taken by an IDREF binding. A toggle button is its own label,
so nothing points at it and the slot is free.

The prevented-key guard is a flat `===` chain over `event.key` alone, because the
resumer applies that policy synchronously before the handler module loads; a
guard over graph-derived locals is `MARKLESS_SYNC_POLICY_UNEXTRACTABLE`. The
orientation gate is therefore in the walk, not the guard, so a horizontal group
prevents the vertical arrows too. That costs a page scroll that would otherwise
happen and matches what `tabs` and `radiogroup` ship.

**Which item holds the tab stop.** `focused` once anything has been focused;
before that, the first pressed value; and while nothing is pressed at all, every
enabled item is a stop until the first focus narrows it. That last window is
`radiogroup`'s order-independent answer, reused rather than reinvented: seeds are
order-independent by design and there is no runtime creation-order counter.

## Forms

`togglegroup.itemfield` is written **inside** the item whose value it submits,
and is legal there because `type="hidden"` is the one input state that is not
interactive content — it takes no focus and never reaches the accessibility tree,
so a button holding one is still a button holding only its own label. An
unpressed item's field is `disabled`, which is how the form data set leaves it
out. A multi-select group therefore submits its name once per pressed item with
no special handling, and single-select submits it once.

`name`, `multiple`, `orientation`, `loop`, `disabled` and `required` are declared
by the root and by nothing else. What a *part* writes to the group instance never
reaches parts built inside a keyed `@for` row, and toggle group items are usually
written from a loop, so this is the common case rather than a corner —
`scenarios/items-from-data.tsrx` is the row that holds it.

`required` is behaviour, not validation: the group refuses to give up its last
pressed value. It is deliberately not written onto the hidden fields, because a
`required` control that cannot be focused blocks submission with no way for the
browser to show why.

## What v1 refuses

No `type: 'single' | 'multiple'` enum. Radix's forks the ARIA tree — single-select
Radix is `role="radiogroup"` with `role="radio"` items — and we already ship that
fork as its own family. `multiple` changes how many values `value` may hold and
nothing else; `role="group"` and `aria-pressed` in both modes.

No `role="toolbar"`. The APG scopes toolbar to mixed control sets whose tab stops
are being collapsed; this is a set of one thing, and `calendar` already ships
`role="group"` holding `aria-pressed` buttons. The cost, stated plainly: `group`
is a quieter announcement than `toolbar`.

No `aria-orientation`: ARIA does not list it as supported on `group`, so writing
it would be inert. The axis reaches CSS through `ui-vertical`.

No `"mixed"` pressed state, no `aria-selected` or `aria-checked` on the button
(neither is supported there), no item-level `pressed` prop (the root's `value`
owns it), no `indicator` part (a pressed button styles itself off `ui-pressed`),
no `description` or `error` part (both are established roles, but `error` ships a
known-red pinned row in two families today), no RTL `dir`/`direction` (no locale
source in the dependency graph), no `asChild`, no `rovingFocus: false`, and no
`aria-activedescendant` — it is deliberately absent from the compiler's IDREF
attributes, so roving DOM focus is the only model.

## Qwik UI mapping

| Qwik UI | Here | Why |
| --- | --- | --- |
| `multiple` boolean, `role="group"`, `aria-pressed`, `orientation`, `loop`, `disabled` on root and item, `value` on the item | kept | this is the reference the family agrees with most |
| `onChange$` | `onChange` | the house primary-callback name |
| `bind:value` signal | `value` + `onChange` | no `bind:*`, no controlled/uncontrolled split |
| `direction: 'ltr' \| 'rtl'` | dropped | no locale source in the dependency graph |
| `pressed` on the item | dropped | an item cannot report its own initial state to the root |
| `data-qui-*` identity attributes | dropped | `ui-*` state only |
| `aria-orientation` on `role="group"` | dropped | not supported on that role |
| no Home/End | Home and End shipped | the APG lists them and four other libraries ship them |
| `registerItem$` / `itemsCSR` registration pass | `focused` plus a plural `element()` handle | seeds are order-independent; no runtime creation-order counter |
| `enabledItems` DOM query | the plural handle, read live | no DOM selectors in family source |

## Not wired into the gallery yet

`togglegroup-transcript.ts` spells its own gallery anchor rather than reading
`FAMILY_ANCHORS`, because the sr-gallery section and the CI matrix entry land in
a follow-up. The two real-reader lanes are written and have never been run.
