# calendar

A month of days a person can choose from. Real buttons, no grid.

**Status: incomplete.** The family renders, navigates and reports its `ui-*` state,
and 13 of 38 browser rows are green. Choosing a day does not reach the consumer's
`onChange`, `range` and `unavailable` do not reach the parts that read them, the
keyboard walk does not land focus, and the SSR shape throws on a handle. All four
are measured framework behaviours rather than shape questions, and they are
written out under "What the compiler forced" below with the exact evidence.

Research: `goals/headless-components/notes/U488-calendar-research.md` — React Aria's
`useCalendar*`, Zag/Ark, Bits UI, Melt, Mantine, react-day-picker, the WAI-ARIA APG
grid pattern and GtkCalendar, read against this library's own SPEC.

## Parts

`root` `content` `title` `backtrigger` `forwardtrigger` `item` `field`, plus
`trigger` in popup mode and the optional `label` / `description` / `error` copied
from datebox. Nothing else — no grid, gridcell, row, cell, area or view part, and
no role by those names anywhere.

`calendar.content` is the one surface in both shapes. Inline it renders in place;
with `popup` on the root it is what `calendar.trigger` reveals, and the markup
inside it is identical either way. It is `role="group"`, named by
`aria-labelledby` pointing at `calendar.title`, and it owns the whole keyboard
model.

## The deliberate departure from the APG grid pattern

Every reference — React Aria, Zag, Bits UI, Melt and the APG itself — builds a
date picker as `role="grid"` with `role="gridcell"` days, and three of the four
wrap an inner `role="button"` inside each cell. **This family ships 42 real
`<button>` elements and no grid semantics at all**, and the reasons are worth
stating because the divergence is large.

A real button is addressable by voice control: "click twenty-five" works on a
button and is unreliable on a gridcell, and the single-element grid form the APG
recommends is the one that gives voice control the least to hold on to. The
weekday is already in every day's accessible name — "Tuesday, August 25, 2026" —
which is the fact a grid's row and column position exists to convey, so the grid
would be announcing a second time what each button already says. And row and
column chatter is actively harmful on a touch screen reader, where a person swipes
through 42 cells and hears the table geometry re-announced at every one; React
Aria reaches the same conclusion from the other side when it sets `aria-hidden` on
its whole weekday header row rather than let the names be spoken twice.

The cost is real and is not hidden: a reader gets no "row 3, column 5" and no
dimensions, so a person cannot ask where in the month they are except by listening
to the date. That is the trade taken.

**Grid semantics can be added later without touching a single line of consumer
markup.** The days are `calendar.item` inside the consumer's own container, and
the container is the consumer's; the roles would go on parts this family already
owns. Nothing about the shape below forecloses it.

`aria-pressed`, never `aria-selected`: `aria-selected` is not supported on
`button`, and Melt's shipping it on `role="button"` is invalid ARIA that Bits UI,
its successor, corrected. A day outside `min`/`max` or named in `unavailable`
carries `aria-disabled` and stays focusable — the distinction most home-grown
calendars miss, and the one that lets a keyboard user land on a day and hear why
it cannot be chosen.

## State

`calendar.state()` hands back `days` (42 ISO strings, always six weeks so no row
is ever removed), `weeks` (the same 42 as 6×7), `weekdays` (7 short names in
display order), `title`, `value`, `focused`, `anchor`, and the methods `next`,
`prev`, `select` and `focus`.

The consumer shape is one repeat over `days` and one over `weekdays`:

```tsx
@for (const day of cal.days; key day) {
	<calendar.item value={day} />
}
```

The `key` is not optional: a repeat over reactive state without one is
`MARKLESS_REPEAT_KEY_REQUIRED` at compile time. There is no `computed()` wrapper
around either collection, and there must not be one.

## Props

`value` `month` `multiple` `range` `min` `max` `unavailable` `startofweek`
`disabled` `readonly` `required` `invalid` `name` `popup` `onChange`.

No locale and no format props — `Intl` answers from the document's own locale, the
way datebox's note settles it. No `fixedWeeks` (always on), no `numberOfMonths`,
and no `isDateUnavailable` predicate: a function prop cannot cross a loop row, so
`unavailable` is an array of ISO dates, which is data, and data crosses the graph.

## Keyboard

Arrows walk a day and a week, `Home` and `End` reach the week's ends, `PageUp` and
`PageDown` step a month, and with Shift a year. `Enter` and `Space` are absent
from the handler on purpose: the day is a real button and the browser activates
it, so handling them would choose twice. Escape abandons a half-picked range, and
in popup mode closes and hands focus back to the trigger.

Crossing a month is not a special case — the date moves, and the visible month
follows it.

## What the compiler forced — measured on this tip

1. **A shared factory's derived set is copied whole into any consumer module that
   reads one cell of it, and this module's imports do not travel.** Reading
   `cal.days` from a scenario threw `ReferenceError: visibleMonth is not defined`,
   and as each computed was made self-contained in turn the name moved on to
   `heldList`. So every `computed()` on `calendarState` is written out of platform
   globals only, and every other derived fact is a `computed()` on the part that
   needs it, where `./calendar-math.ts` does resolve. The duplication between the
   inline grid in `calendar.tsrx` and `gridDays` in `calendar-math.ts` is the price,
   and it is the one place the two could silently drift.

2. **A shared cell is seeded from a bare prop and nothing else.**
   `calendar.seedText = seedTextOf(value)` is `MARKLESS_SHARED_SEED_UNSUPPORTED`,
   so the union-shaped `value` prop is held raw in the `seed` cell and normalised
   at every read instead.

3. **`[...held, iso].sort()` inside a shared method is read as a write target**
   (`MARKLESS_STATE_UNRESOLVED_WRITE`). `toggledList` in `calendar-math.ts` is that
   expression moved into a pure function.

4. **A component may not be shared across scenario modules.** Exporting one
   `Month` and importing it from the other eight scenarios gave
   `MARKLESS_PRERENDER_DATA_COMPONENT_MISSING: Month`; every scenario now writes its
   own, the `fileupload.Rows` shape.

5. **A consumer cannot call a shared method.** `cal.select('2026-08-10')` from a
   plain page button is refused outright with `MARKLESS_SHARED_METHOD_CROSS_MODULE`,
   which names every free binding the copied body would need. The diagnostic's own
   advice is the family's rule: the call belongs in a part this family publishes.

## Still open — the four the family does not yet clear

Each is a measured behaviour, not a shape question, and each has a red row in
`calendar.browser.ts` written as what should happen.

- **`onChange` never fires from `calendar.item`.** The press lands: `pickedText` is
  written, `ui-selected` and `aria-pressed` move to the pressed day, the roving
  tab stop follows. Only `calendar.onChange?.(iso)` — read from the copied body of
  `select` inside the item's handler module — finds an empty slot. This is
  hovercard's measured gap ("a callback stored by a component is invisible to that
  component's own handler modules") appearing across two components rather than
  one, and the item cannot take hovercard's fix because it is the root that holds
  the prop and the item that owns the press.
- **`range` reads false inside the copied method body.** A first press in a range
  calendar sets `pickedText` rather than `anchorAt`, so no anchor is ever live.
- **`unavailable` reads undefined in a part's `computed()`.** A bounded day carries
  `ui-disabled` (from a computed that does not touch the array) while
  `aria-disabled` stays `false` (from one that does), which is contradictory on the
  same element and points at the array-valued cell rather than at either rule.
- **SSR throws `MARKLESS_ELEMENT_HANDLE_WIDGET_INSTANCE_MISSING` on `titleEl`.**
  Every SSR row fails on it; the CSR rows for the same scenarios pass.

## What v1 refuses regardless

No month or year drill-down — the route back is `calendar.title` becoming a button
under a `drilldown` boolean and `state()` handing back months or years instead of
days, which needs no new role and no consumer change. No drag-to-select. No RTL
arrow swap. No week numbers. No multiple visible months. `calendar.field` submits a
single ISO date; `multiple` and `range` submit nothing through it, which is
combobox's measured ceiling inherited rather than a new one.

`calendar.label` is a visible caption only. The month's group is named by
`calendar.title` so the name a reader hears follows the month on show, which means
the label is not wired to anything — named here rather than left to be discovered.
