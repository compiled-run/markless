# timebox research

A time of day typed one part at a time: hour, minute, optionally second, and — in
a 12-hour locale — AM/PM. No calendar, no time zone, no date.

## The landscape, honestly

Segmented spinbuttons are **one lineage, not an ecosystem convergence**. The
CATALOG records this and it held up on re-check:

- **React Aria TimeField** — the origin. `TimeField` > `DateInput` > `DateSegment`,
  one segment per editable unit (hour, minute, second, dayPeriod). `granularity`
  (`hour`/`minute`/`second`) decides which segments exist; `hourCycle` (12/24)
  overrides the locale's default; `placeholderValue` seeds the cycle for empty
  segments and "defaults to 12:00 AM or 00:00 depending on the hour cycle".
- **Bits UI Time Field** — a Svelte port of the same model: `Root` > `Input` >
  `Segment` + `Label`. Its docs state the tab behaviour outright: "Each segment
  functions as its own tab stop." Editable segments are hour, minute, second,
  dayPeriod, timeZoneName; the separators between them are *literal* segments.
  In a 24-hour locale (German is the example it gives) the dayPeriod segment does
  not render at all.
- **Melt UI date-field** — the same segment machinery, but there is no separate
  time field: time rides along inside `CalendarDateTime`.
- **Ark UI / Zag** — ship **no time component at all**. Their machines directory
  has `date-picker` only, which is a parse input plus a calendar. There is no
  third independent implementation of this pattern to triangulate against.

So the pattern is well-evidenced but narrow: two real implementations, one of
which is a port of the other, plus one library that folds time into a date value.
That is worth saying plainly before treating it as settled practice.

## What this family inherits instead

**The shipped `datebox` is the real reference.** It is not, as the build packet
assumed, a future family: it landed with the segment engine already built —
`role="spinbutton"` per segment, `aria-valuenow`/`valuemin`/`valuemax`, typed
digits with auto-advance, `Backspace` erase-then-walk-back, arrow stepping with
wrap, and all of the arithmetic isolated in `datebox-math.ts` as plain functions
over plain values. `timebox` mirrors that structure function for function, which
is why the machinery here reads as a sibling of `datebox-math.ts` rather than an
invention.

`datebox/note.md` lists "No time segments, no locale-driven box order" among its
known gaps. Those two gaps are exactly what this family adds.

### Tab stops: real ones, not a roving one

The build packet asked for roving focus with a single tab stop. Every piece of
evidence points the other way, so this family ships per-segment tab stops:

- `datebox` shipped `tabindex="0"` on every segment, and its note records the
  reasoning: "`Tab` walks them natively — three real tab stops, which is what
  QDS, React Aria and the APG all do."
- Bits UI documents the same behaviour in the same words.
- A roving timebox next to a non-roving datebox in the same cluster would be an
  inconsistency nobody asked for.

`ArrowLeft`/`ArrowRight` also walk the segments, so a person who thinks of it as
one control still gets one; `Tab` simply does not swallow the group. This is the
one place the build knowingly departs from the packet, and it is raised for the
owner rather than buried.

## The two charter decisions, as ruled

### Segmented spinbuttons

Taken. It is the only model with an accessibility story that beats
`<input type="time">` on more than styling, and it is the model the sibling
`datebox` already ships.

### Platform `Intl`, no `@internationalized/date`

Taken, and it holds up. Everything the family needs from a locale comes out of
`Intl.DateTimeFormat.prototype.formatToParts`:

- **12 vs 24 hour** — format a known time and look for a part of type
  `dayPeriod`. Its presence *is* the locale's hour cycle, and reading it this way
  needs no `resolvedOptions().hour12` quirk-handling.
- **Segment order** — the same parts array, filtered to the editable types, in
  the order the locale writes them. `en-US` yields `hour minute dayperiod`;
  `de-DE` yields `hour minute`; `ko-KR` puts the period *first*, yielding
  `dayperiod hour minute`. That last one is why the order is worth reporting at
  all: it is not always a suffix.
- **The AM/PM words themselves** — format 09:00 and 21:00 and read each
  `dayPeriod` part's value, so the segment shows the locale's own label rather
  than a hardcoded English "AM". Measured caveat: which words those are is the
  runtime's ICU data, not this family's business — a German 12-hour field on the
  Node build used here reads "AM"/"PM", not "vorm."/"nachm.".

Nothing about a time of day needs a calendar system, a time zone database, or
arithmetic that carries across days. `@internationalized/date` would buy none of
those here.

## Value model: a canonical 24-hour string

`'HH:mm'`, or `'HH:mm:ss'` once a `timebox.secondinput` is mounted. Chosen over
a `{ hour, minute, second }` object:

- It is what the platform already means by a time value: the HTML
  `<input type="time">` `value` is exactly this string, so `timebox.field`
  submits a form value indistinguishable from the native control's.
- It matches `datebox`'s ISO string, keeping the cluster's two families
  symmetrical — and a future date-time composition is then string concatenation.
- It compares and sorts as text once both sides are padded, which is the whole of
  the `min`/`max` implementation.
- An object identity would be new on every keystroke, making `onChange`
  de-duplication the consumer's problem.

The string is **always 24-hour**, whatever the locale shows. A 12-hour field
displays `2` with a `PM` segment and reports `14:30`. The display is a locale
concern; the value is not.

## Keyboard

Inherited wholesale from `datebox`, minus the parts a time does not have:

`ArrowUp`/`ArrowDown` step by one and wrap at both ends (hours wrap 12→1 or
23→0, minutes and seconds wrap 59→0, AM/PM toggles). `PageUp`/`PageDown` step
further — React Aria's page steps, adapted: 1 hour, 15 minutes, 15 seconds.
`Home`/`End` jump to the segment's own bounds. Digits type, and a segment that
can hold no more passes focus on. `Backspace` erases a digit and then walks back
a segment; `Delete` clears one. `ArrowLeft`/`ArrowRight` move between segments.
On the AM/PM segment, `a` and `p` set it directly — React Aria's behaviour.

A step on an empty segment lands on that segment's placeholder base rather than
doing nothing: 12 (or 0) for the hour, 0 for minutes and seconds, AM for the
period. That is React Aria's `placeholderValue` default expressed as arithmetic
instead of as a prop.

## ARIA

`datebox`'s markup, with one deliberate addition.

Each segment is a `role="spinbutton"` with `aria-label` (`"hour input"`,
`"minute input"`, `"second input"`, `"AM or PM"`), `aria-valuenow` (absent while
the segment is empty), `aria-valuemin`, `aria-valuemax`, `aria-describedby`
pointing at `error` then `description`, and `aria-invalid`. The root is a
`role="group"` named by `label` through `aria-labelledby`.

**The addition: `aria-valuetext` on the AM/PM segment only.** `datebox` ships no
`aria-valuetext` anywhere, recorded there as a researched default. It cannot
stand here: the period segment's `aria-valuenow` is `0` or `1`, and a reader that
speaks a bare "0" has conveyed nothing. The numeric segments keep the sibling's
bare-number behaviour, so the divergence is confined to the one segment where a
number is genuinely meaningless.

Readers voice a spinbutton's value as a phrase wrapped around the number rather
than as a fixed word, which is why `timebox.sr.ts` carries its own word table
instead of asking the shared `Vocabulary` for a slot — the same reason
`datebox.sr.ts` and `slider.sr.ts` record for theirs.

## Divergences from the references, with mappings

| Reference | Their spelling | Ours | Why |
| --- | --- | --- | --- |
| React Aria | `hourCycle={12 \| 24}` | `hour12` boolean, omitted = the locale's own | SPEC bans mode/type enum props; `hour12` is `Intl`'s own option name |
| React Aria | `granularity="second"` | mount a `timebox.secondinput` | the parts written are already the answer; `datebox` derives the same way |
| React Aria | `placeholderValue` | arithmetic, no prop | one less prop for a default nobody overrides in practice |
| Bits UI | `Input` wrapper part | none | one time per root, so the root is the group — `datebox`'s ruling |
| Bits UI | literal separator segments | the consumer's own markup | a colon is not behaviour |
| Both | `Time`/`CalendarDateTime` objects | `'HH:mm[:ss]'` string | above |

## Known gaps

- No time zones and no `timeZoneName` segment. Out of charter.
- Paste is refused outright, as in `datebox`: reading the clipboard in a handler
  is a later tranche.
- No `inputmode` and no soft-keyboard support, for `datebox`'s recorded reason —
  a segment is a focusable element drawing its own digits, not an `<input>`, so a
  mobile keyboard does not know to offer digits.
- The locale's segment order is reported as `ui-order` for a consumer to lay out
  against, but the family does not reorder the parts itself: the order the
  segments read in is still the order they are written in, which is `datebox`'s
  rule. Auto-reordering would fight the consumer's own markup.
- No `role="textbox"` override for iOS VoiceOver, where spinbuttons cannot be
  focused. Recorded here as `datebox` records it, rather than branching on the
  user agent.
- The segment engine is duplicated rather than shared with `datebox-math.ts`.
  Both files are plain functions over plain values with the same shape, so
  lifting the common half into one module is a real follow-up — it was outside
  this unit's file contract.
