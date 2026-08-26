# numberbox

One number in one field: a real text input a person types into, two step buttons,
locale-aware display, and a plain number on the wire.

It joins the shipped box family — `checkbox`, `combobox`, `textbox`, `datebox` —
and takes the `input`/`label`/`description`/`error`/`field` shape from `textbox`
verbatim, the `backtrigger`/`forwardtrigger` direction pair from `carousel`, and
`valuelabel` from `slider`.

Research: the numberbox research memo in the goal notes — React
Aria's `useNumberField`/`useSpinButton` and `@internationalized/number`, Zag's
`number-input` machine, Base UI's `number-field`, Kobalte, Mantine,
`rc-input-number` and Fluent read as source, against the WAI-ARIA APG spinbutton
pattern and MDN's `<input type="number">`. Four of the nine headless libraries
checked ship no number field at all: Radix, Ariakit, Bits UI and Melt UI.

## Parts

`root` `label` `input` `backtrigger` `forwardtrigger` `valuelabel` `field`
`description` `error`

Zero new roles and zero new prefixes. `back`/`forward` are carousel's shipped
direction prefixes and `valuelabel` is SPEC's own worked example.

**No `group` part.** Zag wraps the input and its buttons in a `role="group"` and
React Aria returns `groupProps`. There is one control here, the two buttons are
not tab stops, and each points its `aria-controls` at the input — there is nothing
left for a group to group that the label does not already name. The consumer's own
`<div>` does the layout.

**The root renders one element the consumer did not write**: a visually-hidden
`<output aria-live="assertive">` carrying the number a step landed on. See ARIA
below — with no spinbutton role it is the only thing that speaks a stepped value,
and an accessibility guarantee that depends on the consumer mounting an optional
part is not a guarantee.

## ARIA: a plain text box, not a spinbutton

`numberbox.input` is `<input type="text" inputmode="decimal">` with
`aria-roledescription="number field"` and **no `role="spinbutton"`**. Five of the
seven implementations that ship anything — Zag, Kobalte, Ant, Fluent — and the APG
itself all say spinbutton. React Aria takes the role from `useSpinButton` and then
cancels it, with its reason in the source: *"override the spinbutton role, we
can't focus a spin button with VO"*.

Datebox already records the same gap against itself and lives with it, because its
segments are not editable text and there is nothing else they could be. **This
family has the choice datebox did not**, and taking the role would trade a working
text field on iOS for a range announcement that `description` can carry instead.
The trade is bad in that direction.

The measured cost, in this order:

- **The range is not announced.** No role means no `aria-valuemin`/`aria-valuemax`.
  A bounded field must say its range in `numberbox.description`, and
  `numberbox.sr.ts` holds a row against that so it is a requirement rather than a
  suggestion.
- **A step does not announce itself.** So the root renders the live region above,
  and every settled number is written into it. React Aria's substitutions are
  copied: U+2212 replaces the hyphen, because VoiceOver speaks no sign at all when
  other characters sit between a hyphen and the digits, and an empty field
  announces `Empty` rather than being read as whatever surrounds it.
- **`aria-roledescription` is English-only**, exactly as colorpicker's colour names
  are and for the same reason: `Intl` has no API for it and there is no localised
  string table here. React Aria ships it in 34 languages. Recorded, not hidden.
- **On iOS, a roledescription suppresses the "required" announcement** — React
  Aria's measured reason for dropping it on that platform. We do not branch on the
  user agent, so the gap stands.

Announcements are **suppressed while a trigger is held** and spoken once on
release. No reference does this; at a 50 ms repeat a two-second hold is forty
interrupted announcements that finish none.

`aria-invalid` and `aria-describedby` sit on the input — one control, so there is
no question where they belong — and the describedby names `error` before
`description`, the shipped handle-list form. A part that was never placed drops out
of the list rather than dangling.

## Value, and the four cells behind it

`value` is `number | null`, and `null` is what an empty field holds. Not `NaN`
(React Aria's and WinUI's answer): `NaN !== NaN` is miserable in a consumer's
comparison, and `null` is datebox's shipped spelling.

The graph holds four cells and derives the rest: `seed` is what the consumer
wrote, `typed` is text a person has entered and not committed, `held` is what the
last commit settled on and `settled` says whether there has been one.

**The seed is a seed, not a mirror.** After the first gesture `value` is never
re-read. Writing `value={n}` with `onChange={setN}` is redundant rather than
harmful — a number survives its own round trip — but the React habit of treating
it as a controlled prop does not apply.

## Parsing and formatting: `Intl`, and no format props

There is no `formatOptions`, no `format`, no `locale`, and none of Mantine's ten
literal props. The locale is the document's own (`<html lang>`, or the runtime
default), and every symbol the family compares against is read back out of
`Intl.NumberFormat` — format `-10000.111` and take the answer apart with
`formatToParts`. React Aria and Base UI, the two references that also refuse the
spinbutton role, both do exactly this; the house rule costs nothing here.

While typing, everything that could legitimately belong to a number in this locale
is subtracted and what is left must be nothing — React Aria's rule, with no
character allowlist anywhere. Four behaviours fall out of it:

- **Group separators are typeable.** `1,234` stays `1,234` and submits `1234`.
  This is the single most-complained-about `<input type=number>` failure.
- **Both decimal keys work.** The locale's separator and a plain `.` both count,
  because a person's keyboard may not have the locale's key. On a locale whose
  decimal is not `.`, a lone `.` with nothing else spelling a decimal is read as
  one rather than as a group mark.
- **A minus needs somewhere to go.** `min={0}` refuses the key outright rather
  than accepting it and arguing at commit.
- **A decimal point needs fraction digits.** The field's digits come from `step`,
  so the default `step={1}` field is a whole number and a typed point never lands
  in one. This is the one place a consumer is likeliest to be surprised, and it is
  React Aria's rule with `precision` refused.

**Formatting applies on commit, never per keystroke** — unanimous across every
reference that thought about it. Reformatting `1234` into `1,234` mid-word would
put the next keystroke in the wrong place.

Paste rides the same guard rather than getting a path of its own: a paste is an
input event like any other, so `$1,234.50 USD` is refused and `1234.5` is not.
That is strictly better than datebox, which refuses paste outright. A real
clipboard paste is not drivable from browser mode, so the rows cover it as the
one input event it arrives as.

## The math

`numberbox-math.ts`, not an import from `slider-math.ts`: `@markless/ui` depends
on `@markless/core` and nothing else, and datebox sets the precedent for a
family-owned math file.

Steps are counted **from `min`, not from zero**, so a field from 5 in steps of 10
lands on 5, 15, 25 — the rule Base UI needed a `base` parameter to reach. Decimal
arithmetic goes through `toFixed` over the step's own digits, so `0.1 + 0.2` is
`0.3`.

**Snap runs before the step.** From `7` with `step={5}`, pressing up gives `10` and
pressing down gives `5`: an off-grid number typed by hand is pulled onto the grid
in the direction pressed rather than carrying its offset forward.

**An empty field seeds from the bound it steps away from** — up from `min`, down
from `max`, zero when neither is set.

**Clamp happens on commit, never while typing and never on a step.** Mantine's
clamp-while-typing is the one to avoid: with `min={10}`, typing `1` becomes `10`
under the person's fingers and then `12` becomes `102`. Every reference ships an
escape hatch from clamping (`allowOverflow`, `commitBehavior`, `clampBehavior`,
`allowOutOfRange`, `ValidationMode`) — five for five — and v1 ships none. It is
additive later.

One consequence worth stating: with clamping on commit, `invalid` can never mean
"out of range", because the value never is after a commit.

## `currency` is data, not a format

`currency="USD"` is an ISO 4217 code, the way `alpha` is HTML's own attribute name
and `channel` is CSS Color 4's own channel names. The family asks `Intl` where the
symbol goes in the reader's language, shows the number that way, and — this is the
part that earns the prop — **accepts the same characters back**. Without it a money
field refuses money: someone selecting all and pasting `$1,299.00` gets nothing,
because `$` is not part of a plain number.

`percent` and `unit` are refused, and the asymmetry is the whole argument: a
percent sign outside the input is decoration a consumer can supply, and a currency
symbol inside it is not. A consumer whose value is `50` and whose display should be
`50%` writes `min={0} max={100}` and appends the sign; both work today with zero
props. Ruling that goes with it: **our percent is not a thing.** React Aria's
parser divides a percent entry by 100 on the string, so `50%` parses to `0.5` — a
value decision, not a display one, and one we do not make.

A currency field rounds to its currency's own scale on commit, and a code `Intl`
does not recognise is ignored rather than thrown at render.

## Keyboard

`ArrowUp`/`ArrowDown` step by one; `Shift` and `PageUp`/`PageDown` both step by ten
of them. No reference wires both — Zag and Base UI put the big step on `Shift`,
the APG and Fluent and our own slider put it on the page keys — and wiring both
costs one line and matches the family next door (`slider-math.ts`'s `BIG_STEP`).

`Home`/`End` jump to `min`/`max` **and are inert without one**, so the browser's own
caret behaviour survives in a field that has no floor. This is a deliberate
divergence from our slider, where `Home` always returns `min`: a slider is not
editable text and has no caret to move.

`Enter` commits and **does not prevent default**, so a numberbox inside a form
still submits it, with the committed number already in `numberbox.field`.

`Alt`+arrow is refused. Two of six references have it, it has no APG standing,
`Alt` is a system-menu modifier on Windows, and a third step size on a few-props
family is not earned.

## The triggers

`<button type="button" tabindex="-1">` with `aria-label="Decrease"`/`"Increase"`
and `aria-controls` pointing at the input. Out of the tab order because the text
field is the only tab stop and the arrows already do what the buttons do — twelve
numeric fields in a form would otherwise be twenty-four extra stops for no new
capability.

The label is the bare direction, not `"Increase Quantity"`. React Aria composes the
field's label in four different ways; that needs the label part's *text*, and
reading another part's text is what SPEC's DOM rule forbids. `aria-controls` is
what a reader gets instead.

A mouse press moves focus to the input; a touch or reader press leaves focus on the
button, so no soft keyboard appears and the reader cursor stays put — React Aria's
branch, copied.

**Hold to repeat**: one step lands at once, then a 500 ms wait, then every 50 ms.
One `setInterval` counting its own ticks rather than a timeout that starts an
interval — Zag's structure with one thing to cancel. It stops at the bound rather
than spinning against a clamp, and `pointerup`, `pointerleave` and `pointercancel`
all end it.

## Form integration

The input shows `$1,299.00`. A form must submit `1299`. Those are two strings and
only one can be `name`d, so `numberbox.field` carries the plain number — no
grouping, no symbol, `.` for a decimal point — and the visible input carries no
`name` at all. Zag puts `name` on the visible input and therefore submits
`1,234.50`; React Aria and Kobalte split it the way we do.

`type="text"`, not `type="number"`, on the hidden element. React Aria synthesises a
detached `<input type="number">` purely to borrow the browser's range-validation
messages; we clamp on commit, so the submitted value is never out of range and
there would be nothing for it to catch.

A cleared field submits `''`.

## What the compiler forced — measured on this tip

Four things in this family are shaped by the framework rather than by the design,
and each was found by a red row rather than reasoned about in advance.

**A shared method may not be called `set`.** The compiler reads `x.set(...)` as a
Map or Set mutation and refuses the write
(`MARKLESS_STATE_UNRESOLVED_WRITE`). The method is `settle(from, next)`.

**The rejected keystroke is put back, not prevented.** `preventDefault` is
browser-critical, so the compiler only emits it when the condition is graph state
and event-field equality (`MARKLESS_SYNC_POLICY_UNEXTRACTABLE`), and "is this
character part of a number in this locale" is neither. So there is no `beforeinput`
guard: the keystroke lands, the dispatch vets the field's whole text and writes back
the most of it that could still become a number. React Aria's model rather than
Zag's, for a compiler reason rather than a taste one.

The keydown guard *is* hoistable, because it is written over event fields and two
graph cells: `hasMin` and `hasMax` exist so that `Home` and `End` can be inert
without a bound. `numberbox.min !== undefined` inline would not extract — a bound
of `0` is falsy, and the comparison is not one of the shapes the collector reads.

**A handler module cannot name an element handle, and cannot write through one.**
`inputEl?.value` in a shared method is `MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE`;
assigning to it is `MARKLESS_STATE_READ_ONLY_WRITE`. Reading works through a local
(`const held = inputEl;`), and *writing* only through the element the event carried
(`event.target`). One further trap: the alias is per-module and by name, so a local
named `box` bound to the handle in one method makes `box.value = …` a read-only
write in every other method in the file.

**The graph runs behind the element, and the value binding must not fight it.** A
dispatch runs after the browser has finished with the event, so mid-edit the input
holds text the graph has not seen. Two consequences, both measured as red rows
first:

- The input's `value` binding carries **only the settled number, formatted** — never
  the half-typed text. A binding that followed the typing patches an older string
  back over a newer one and silently eats keystrokes. This is Base UI's
  `allowInputSync` flag by another route.
- Every handler that acts on the current number reads it off the element it was
  given rather than off the graph. Once a step or a commit has settled a number the
  graph is authoritative again — and the repeat timer relies on that, because
  re-reading the element each tick would step twice from the same value while the
  DOM catches up.

## Screen reader lanes

The virtual lane (`numberbox.sr.ts`) is measured against this tip. What that reader
actually says for the starter is `number field, Quantity`; for a bounded field,
`number field, Dose, 1.50, A number between 0.5 and 3, in steps of 0.25.`; for a
mounted error, `number field, Quantity, 0, Enter at least one. A whole number, one
or more., invalid`. The triggers read `button, Decrease, 1 control`.

`numberbox.nvda.ts` and `numberbox.voiceover.ts` are **written and not run** — no
real-reader lane runs locally, and the gallery section they walk lands with the
gallery registration. The claim they exist to settle is the one this family
diverges on: whether a reader speaks the roledescription in the role's place, and
whether the live region's announcement is heard at all.

## What v1 refuses

- **A scrub area** (Base UI, Zag). Pointer-only, no keyboard or reader equivalent,
  `requestPointerLock` skipped entirely on Safari, 12.6 KB. Nothing here forecloses
  it: it would be one new part over the same `increment()`/`decrement()`.
- **Mouse-wheel stepping** (React Aria and Kobalte on by default, Zag and Ant
  opt-in). Unspecified in HTML — `whatwg/html` #10911 is an open request to specify
  it — and the field-wide workaround is `onWheel={(e) => e.currentTarget.blur()}`,
  which blurs the field the person is editing to stop the wheel destroying its
  value.
- **`onInput`.** The half-typed number is on `numberbox.state()` and the DOM event
  rides `{...rest}` on the input part. `onChange` fires on commit — blur, `Enter`,
  and every step. This is the one place the family knowingly reads differently from
  its nearest sibling: slider's `onChange` fires *during* a drag, and typing is the
  drag here.
- **`precision`.** The field's fraction digits come from `step`.
- **String or `BigInt` values** (Ant's `stringMode`, Mantine's `BigInt`) for
  amounts past `Number.MAX_SAFE_INTEGER`. This is the one refusal that is **not
  additive** — it would change `value`'s type — and the use cases are real: account
  numbers, order quantities in minor units, token amounts.
- **`AcceptsExpression`** (WinUI) — infix arithmetic evaluated on `Enter`. The only
  genuinely novel idea in the whole survey, and an expression parser in a headless
  UI library.
- Non-ASCII numerals on entry, and a `form` prop associating the field with a form
  by id.
