# datebox

A date typed one part at a time: three number boxes in a named group, no calendar.

The family is named `datebox`, ruled by the owner: it joins the shipped
`checkbox`/`combobox`/`textbox` box family, leaves `date`, `datepicker` and
`calendar` free for the phase-2 composed picker, and does not stutter against the
`dayinput`/`monthinput`/`yearinput` part names, which are unchanged. Naming
research: `goals/headless-components/notes/U471-date-family-name.md`. DevExtreme's
`dxDateBox` and JTSage DateBox ship the same word; neither is a namespace
conflict, but a reader arriving from DevExtreme may expect a calendar dropdown
this family does not have.

Research: `goals/headless-components/notes/U432-dateinput-research.md` — QDS's
`date-input` read in full (it is implemented; their calendar is not), against
React Aria's `useDateField`/`useDateSegment`/`useSpinButton`, the WAI-ARIA APG
spinbutton date picker, Ark UI, and Adrian Roselli.

## Parts

`root` `label` `dayinput` `monthinput` `yearinput` `field` `description` `error`

`root` is one date, so it is the group itself; QDS needs a container inside its
root because one QDS root holds several dates. That frees `field` for the hidden
form input, which is what `field` means here (`select.field`, `radiogroup.itemfield`).

`dayinput`/`monthinput`/`yearinput` are the established `input` role with three
new information prefixes, signed off with the family name. Minting `segment` as a
role was considered and rejected: it clears two component use cases, below the
spec's three-use bar.

The order the boxes read in is the order they are written in. There is no format
prop, and `ArrowLeft`/`ArrowRight` walk them in written order.

## ARIA

QDS's, copied: `role="group"` on the group, `role="spinbutton"` on each box with
`aria-label="day input"` / `"month input"` / `"year input"`, `aria-valuenow`
(absent while a box is empty), `aria-valuemin`, and `aria-valuemax` — where the
day's maximum is live, recomputed from the chosen month and year.

Added, because QDS ships neither part: `aria-describedby` on each box for
`description`/`error`, and `aria-invalid` on each box. The group is not where
those go — `aria-invalid` is not supported on `role="group"`, and the boxes are
the controls the state belongs to.

`description` and `error` are separate parts standing behind separate handles, and
each box names both: `aria-describedby={[errorEl, descriptionEl]}`, the compiler's
handle-list form. A field that mounts both is described by both, error first —
standard announcement order, so what is wrong is conveyed before the format hint,
whichever order the two parts are written in. A part that was never placed drops
out of the list rather than dangling, and a field that placed neither carries no
attribute at all.

`root` is a `<div role="group">` and `label` is a `<label>`, the `radio-group`
precedent. Three boxes have no single control for a `for` to point at, so the
group's name rides `aria-labelledby` to the label's handle. The root cannot carry
that IDREF itself (`MARKLESS_ELEMENT_HANDLE_IDREF_WIDGET_ROOT`), so it renders one
private component a level down that owns the role and the IDREF — the
`progress.bar` idiom.

## Keyboard

`ArrowUp`/`ArrowDown` step by one; day and month wrap at their bounds, year stops
at them; an empty box starts from today. `PageUp`/`PageDown` step by a week, two
months or five years — React Aria's `PAGE_STEP`. `Home`/`End` jump to the box's
own bounds. Digits type, and a box that can hold no more passes focus on.
`Backspace` erases a digit and then walks back a box; `Delete` clears one.
`ArrowLeft`/`ArrowRight` move between boxes. `Tab` walks them natively — three
real tab stops, which is what QDS, React Aria and the APG all do.

## Why a box is not an `<input>`

An input's displayed text is its `value` property, and that property stops
following the `value` attribute the moment a person types into the element. The
graph writes attributes, so an `<input>` could never be told what to show. Each
box is therefore a focusable element that draws its digits as its own text —
React Aria's shape, for the same reason.

That also removes the race QDS's `input-logic.md` records losing: there is no
native text for the state to argue with. Two consequences worth knowing:

- Every keystroke is answered from the graph. `inputmode="numeric"` and
  `maxlength` are gone with the `<input>`, so a mobile keyboard does not know to
  show digits, and an IME cannot compose into a box. v1 does not serve typing
  from a soft keyboard.
- Paste is refused outright rather than parsed. QDS accepts an all-digits paste;
  wiring that here means reading the clipboard in a handler, which is scope for
  a later tranche.

## Value and bounds

The value is an ISO date string, `yyyy-mm-dd`, and `null` while the boxes do not
spell a whole one. `min` and `max` are ISO dates too, and they hold the *date*
rather than any one box: a step that carries the date past a bound pulls the whole
date back to it, which can move all three boxes at once. Month lengths and the
comparison are worked out in `datebox-math.ts` — `@markless/ui` depends on
`@markless/core` and nothing else, so there is no date library behind this.

## Researched defaults applied without an owner answer

The research memo put nine questions to the owner. The family name and the three
segment prefixes have since been ruled on; the rest were answered by the build
packet's researched defaults and are still open for revision:

- No `aria-valuetext`. QDS renders none, so a month announces "3" rather than
  "March" and an empty box announces no value. React Aria and the APG both render
  it and both name this as the gap it closes.
- QDS's `aria-label` spelling verbatim. React Aria prepends the field's label to
  each box because iOS VoiceOver does not announce groups, so the group's name
  never reaches a box there.
- No iOS `role="textbox"` override. React Aria ships one because spinbuttons
  cannot be focused with VoiceOver on iOS. The gap is recorded rather than
  branched on the user agent.
- `min`/`max`, `description` and `error` in v1, none of which QDS has.

## Known gaps

- No calendar. Phase 2, and it rides `popover`: our `popover` already ships the
  `haspopup: 'dialog'`, overlay-dismissal shape React Aria's DatePicker composes.
  QDS's proposed calendar anatomy maps onto our roles except `prevtrigger`/
  `nexttrigger`, where our shipped spelling is `backtrigger`/`forwardtrigger`.
- No time segments, no range, no locale-driven box order, no two-digit year entry.
