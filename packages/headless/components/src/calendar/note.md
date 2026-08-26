# calendar

A month of days a person can choose from. Real buttons, no grid.

**Status: one framework defect short of complete.** 36 of 38 browser rows are
green in both CSR and SSR, the screen-reader lane is green, and the family is
registered in the shared conformance battery. Two rows are red, both on the same
measured defect: a `@for` row built *after* the first render gets its own
detached copy of the widget instead of the one its ancestors hold. It is written
out under "The one thing still broken" with the transcript that shows it.

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
model — including the one `onFocusin` that keeps the tab stop on whichever day a
person reached. That handler is on the content and not on the 42 days on purpose:
one event record for the month rather than 42, one per row.

## The deliberate departure from the APG grid pattern

Every reference — React Aria, Zag, Bits UI, Melt and the APG itself — builds a
date picker as `role="grid"` with `role="gridcell"` days, and three of the four
wrap an inner `role="button"` inside each cell. **This family ships 42 real
`<button>` elements and no grid semantics at all**, and the reasons are worth
stating because the divergence is large.

A real button is addressable by voice control: "click twenty-five" works on a
button and is unreliable on a gridcell, and the single-element grid form the APG
recommends is the one that gives voice control the least to hold on to. The
weekday is already in every day's accessible name — the virtual reader's own
transcript of our markup is `button, Tuesday, August 25, 2026, 2026-08-25, not
disabled, not pressed` — which is the fact a grid's row and column position exists
to convey, so the grid would be announcing a second time what each button already
says. And row and column chatter is actively harmful on a touch screen reader,
where a person swipes through 42 cells and hears the table geometry re-announced
at every one; React Aria reaches the same conclusion from the other side when it
sets `aria-hidden` on its whole weekday header row rather than let the names be
spoken twice.

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
display order), `title`, `month`, `value`, `focused`, `anchor`, and the methods
`next`, `prev`, `select` and `focus`.

The consumer shape is one repeat over `days` and one over `weekdays`:

```tsx
@for (const day of cal.days; key day) {
	<calendar.item value={day} />
}
```

The `key` is not optional: a repeat over reactive state without one is
`MARKLESS_REPEAT_KEY_REQUIRED` at compile time, re-tested on this tip. There is no
`computed()` wrapper around either collection, and there must not be one.

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

1. **A `computed()` may not close over a loop row's own prop.** Reading `value`
   directly inside the item's computeds is
   `MARKLESS_CAPTURE_OPAQUE_PROP: … prop "value" for "CalendarItem" is the runtime
   expression "day"`, once per computed. The prop is copied into a graph cell —
   `state({ value })` — and every computed reads that cell instead.

2. **A `computed()` may not read a sibling `computed()` in the same part.** The
   copy that carries the body does not carry its neighbours: under CSR the read
   is silently falsy, and a prerendered page throws
   `ReferenceError: isLocked is not defined`. Thirteen SSR rows failed on exactly
   that. The fix is not a bigger computed — it is to put the comparison **inline in
   the attribute**, `aria-pressed={isSelected ? 'true' : 'false'}`, which is the
   form `toggle` and `checkbox` already use and which refreshes correctly. The
   previous note's claim that an inline comparison "renders once and then goes
   stale" was measured on an older tip and does not hold here; it has been deleted.

3. **A shared cell is seeded from a bare prop and nothing else.**
   `calendar.seedText = seedTextOf(value)` is `MARKLESS_SHARED_SEED_UNSUPPORTED`,
   so the union-shaped `value` prop is held raw in the `seed` cell and normalised
   at every read instead. Carried from the previous build; not re-tested on this
   tip.

4. **`[...held, iso].sort()` inside a shared method is read as a write target**
   (`MARKLESS_STATE_UNRESOLVED_WRITE`). `toggledList` in `calendar-math.ts` is that
   expression moved into a pure function. Carried from the previous build; not
   re-tested on this tip.

5. **A shared factory's `computed()` may not import from another file.** Every
   `computed()` on `calendarState` is written out of platform globals rather than
   out of `./calendar-math.ts`, which is why `days`, `weeks`, `title` and `focused`
   each re-derive the visible month instead of calling `visibleMonth`. That
   duplication is the price, and `calendar.browser.ts` pins the two against each
   other. Carried from the previous build; not re-tested on this tip.

6. **A component may not be shared across scenario modules**
   (`MARKLESS_PRERENDER_DATA_COMPONENT_MISSING`), and **a consumer cannot call a
   shared method** (`MARKLESS_SHARED_METHOD_CROSS_MODULE`). Both carried from the
   previous build; neither re-tested on this tip. Every scenario writes its own
   `Month`, and every call into the family goes through a part the family
   publishes.

Four of the previous note's blockers are **gone on this tip** and their entries
have been deleted: `onChange` now reaches the consumer from `calendar.item`,
`range` reads correctly inside a copied method body, the `unavailable` array
reaches a part's `computed()`, and SSR no longer throws
`MARKLESS_ELEMENT_HANDLE_WIDGET_INSTANCE_MISSING` on `titleEl` — all thirteen SSR
rows are green.

## The one thing still broken

**A `@for` row built after the first render gets a detached widget of its own.**

Move the month forward once, then press a day that only exists in the new month.
Measured on `scenarios/controlled.tsrx`, where the page holds the value and counts
the calls:

| what was read                       | what came back           | what it should be |
| ----------------------------------- | ------------------------ | ----------------- |
| the page's `onChange` call count     | `0`                      | `1`               |
| the page's value                     | `2026-08-14` (the seed)  | `2026-09-14`      |
| the pressed day's `ui-*`             | `ui-outside ui-selected` | `ui-selected`     |
| a row carried over from the old grid | correct                  | correct           |
| which day carries `tabindex="0"`     | unmoved                  | the pressed day   |

The new row does react — its own `ui-selected` appeared — but it is reacting to a
**second instance**. Inside it, `calendarState()` hands back cells at their seed
values (`monthAt` reads `''`, never `'2026-09-01'`) and the factory's derived cells
as `undefined`, which is why `sameMonth` throws
`TypeError: Cannot read properties of undefined (reading 'slice')` from the item's
`isOutside`, and why a keydown bubbling out of such a row is
`MARKLESS_EVENT_DISPATCH_UNMATCHED: No event record matched keydown dispatch at
button`. Its writes never reach the widget the ancestors hold.

Routing the item through `calendar.month` and `calendar.focused` — the family's own
derived cells — rather than rebuilding the month from `monthAt` does **not** fix
it; the derived cells are simply absent from the detached copy. That routing was
kept anyway, because it removes a real duplication between the factory and the
item, but it is not a cure and must not be read as one.

The two red rows in `calendar.browser.ts` are written as what should happen:

- `CSR: PageDown crosses the month and takes the focus with it` — after the month
  crosses, no day carries `tabindex="0"` (0 tab stops, not 1).
- `CSR: Shift with the page keys steps a year` — the second Shift+PageUp never
  reaches the handler, so the title stops at August 2026 instead of August 2025.

Nothing in the family's shape avoids this. The keys must change when the month
changes — they are the dates — so the rows must be rebuilt, and the ruled consumer
shape has no index to key by.

## Not yet written

The NVDA and VoiceOver transcript files. Both real-reader lanes navigate to
`FAMILY_ANCHORS.<family>` in `apps/sr-gallery/preview-server.ts`, which has no
`calendar` entry and no calendar section on the gallery page. That file is outside
this family, and a literal `'/#calendar'` here would restate a config fact its
owner should hold. The virtual reader's lane, `calendar.sr.ts`, is green and its
transcript is quoted above.

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
