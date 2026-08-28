# timebox

A time of day typed one part at a time: hour, minute, optionally second, and — on
a 12-hour clock — AM/PM. No calendar, no time zone, no date.

Research: `./research.md` — React Aria TimeField and Bits UI Time Field read in
full, against Melt's date-field segments and the shipped sibling `datebox`.

## The sibling, not the beachhead

The charter treated `timebox` as the family that would establish segment
machinery for a future `datebox`. `datebox` had already shipped it. So this
family is a sibling rather than a beachhead: `timebox-math.ts` mirrors
`datebox-math.ts` function for function, and the parts mirror its anatomy.

The engine is duplicated rather than shared. Both are plain functions over plain
values with the same shape, so lifting the common half into one module is real
follow-up work — it was outside this unit's file contract, and doing it properly
means touching `datebox` too.

## Parts

`root` `label` `hourinput` `minuteinput` `secondinput` `dayperiodinput` `field`
`description` `error`

`root` is one time, so it is the group itself, and `field` is free for the hidden
form input — `datebox`'s ruling, and what `field` means across the form families.

`hourinput`/`minuteinput`/`secondinput`/`dayperiodinput` are the established
`input` role with four new information prefixes, extending the pattern
`datebox`'s `dayinput`/`monthinput`/`yearinput` set. They are the platform's own
part names: `hour`, `minute`, `second` and `dayPeriod` are exactly what
`Intl.DateTimeFormat.formatToParts` calls them. **Owner sign-off is owed on the
four prefixes**, as it was for `datebox`'s three.

The order the boxes read in is the order they are written in, and
`ArrowLeft`/`ArrowRight` walk them in that order. There is no format prop.

## Tab stops

Every box is a real tab stop. The build packet asked for roving focus with one
tab stop; `datebox` shipped `tabindex="0"` per segment with its reasoning
recorded ("which is what QDS, React Aria and the APG all do"), and Bits UI
documents the same. **This is the one place the build knowingly departed from its
packet, and it is an owner question rather than a settled fact.** Reversing it is
a one-line change to `tabStop` plus the rows that assert it.

## ARIA

`datebox`'s markup: `role="group"` on the group named through `aria-labelledby`,
`role="spinbutton"` on each box with its own `aria-label`, `aria-valuenow`
(absent while a box is empty), `aria-valuemin`, `aria-valuemax`,
`aria-describedby` naming `error` then `description`, and `aria-invalid`.
`aria-readonly` is added, which `datebox` has no need for.

**One deliberate divergence: `aria-valuetext` on the AM/PM box only.** `datebox`
renders none anywhere, recorded there as a researched default. It cannot stand
here — the period's `aria-valuenow` is 0 or 1, and a reader speaking a bare "0"
has conveyed nothing. The numeric boxes keep the sibling's bare-number behaviour,
so the divergence is confined to the one box where a number means nothing.

The period box is named `"AM or PM"` rather than `"dayperiod input"`: the Intl
part type is the right name for the *part*, not for what a reader should hear.

## Keyboard

`ArrowUp`/`ArrowDown` step by one and every box wraps at its bounds — hours from
12 round to 1 (or 23 round to 0), minutes and seconds from 59 round to 0, and the
period toggles, which is what two values wrapped comes to. `PageUp`/`PageDown`
move an hour, fifteen minutes, fifteen seconds. `Home`/`End` jump to the box's
own bounds. Digits type and a box that can hold no more passes focus on; `a` and
`p` set the period directly. `Backspace` erases a digit and then walks back a
box; `Delete` clears one.

Stepping an *empty* box lands on that box's placeholder value rather than doing
nothing: 12 (or 0) for the hour, 0 for minutes and seconds, AM for the period.
That is React Aria's `placeholderValue` default expressed as arithmetic, which is
why there is no prop for it.

## Value and bounds

`HH:mm`, or `HH:mm:ss` once a `timebox.secondinput` is mounted — always 24-hour,
whatever the boxes show. It is exactly the string a native `<input type="time">`
submits, and exactly the shape `datebox`'s ISO date has, so the two families
compose by concatenation when the date-time picker arrives. `null` while the
boxes do not spell a whole time.

Mounting the second box is what sets the granularity: the parts a consumer wrote
are already the answer, so there is no `granularity` prop to keep in step with
the markup (React Aria has one; the mapping is in `research.md`).

`min` and `max` are the same shape and hold the *time* rather than any one box, so
a step past a bound can move several boxes at once. Both sides are padded to
seconds and compared as text; that is the whole implementation.

## Locale

Everything locale-shaped comes from `Intl.DateTimeFormat.formatToParts`, with no
date library — `@markless/ui` depends on `@markless/core` and nothing else.

- 12 versus 24 hour is whether the locale writes a `dayPeriod` part at all. The
  `hour12` prop overrides it; omit the prop and the locale decides.
- `ui-order` on the group reports the order this locale writes the mounted parts
  in. It is not always `hour minute dayperiod`: `ko-KR` puts the period first.
  The family reports the order rather than acting on it — the boxes still read in
  written order, which is `datebox`'s rule, and reordering them would fight the
  consumer's markup.
- The AM/PM words are the locale's own, read off a 9am and a 9pm probe. Which
  words those are is the runtime's ICU data: a German 12-hour field reads
  "AM"/"PM" on the Node build measured here, not "vorm."/"nachm.".

## Known gaps

- No time zones and no `timeZoneName` segment. Out of charter.
- Paste is refused outright, as in `datebox`.
- No `inputmode`, so a soft keyboard does not know to offer digits — `datebox`'s
  recorded consequence of a box being a focusable element rather than an
  `<input>`.
- No `role="textbox"` override for iOS VoiceOver, where spinbuttons cannot be
  focused. Recorded rather than branched on the user agent, as `datebox` does.
- Not registered: the gallery, manifest, conformance and chaos lanes do not know
  this family yet, and `timebox-transcript.ts` carries a literal `'/#timebox'`
  where every other family reads `FAMILY_ANCHORS`. Registration is a follow-up
  unit and swaps that literal.
