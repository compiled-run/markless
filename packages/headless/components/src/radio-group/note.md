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
   argues this; §9.1 flagged it as wanting a ruling.
2. **`root` is a `<fieldset>` and `label` is its `<legend>`.** The group's
   accessible name with no id, no IDREF and no minted token, which is what
   `MARKLESS_ELEMENT_HANDLE_IDREF_WIDGET_ROOT` makes impossible via
   `aria-labelledby` today. It also gives group `disabled` natively: a disabled
   fieldset disables every control inside it. QDS emits an `aria-labelledby`
   that points at an id which may not exist; that is not copied.
3. **`itemtrigger` carries no `aria-checked` and no `role`.** QDS puts
   `aria-checked` on a plain div, where it is inert. The radio semantics live on
   the native input beside it; the trigger reports `ui-selected` instead.
4. **`itemtrigger` does not render `itemfield` for you.** A consumer places
   `radiogroup.itemfield` the way they place `checkbox.field`, so placing both
   cannot produce two inputs.
5. **The arrow axis is gated on `orientation`** (5 of 7 surveyed libraries do
   this; QDS does not, though it takes the prop).

## What the compiler forced

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
