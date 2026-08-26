# calendar

A month of days a person can choose from. Real buttons, no grid.

**Status: complete.** All 54 browser rows are green in both CSR and SSR, the
virtual screen-reader lane is green, the real reader lanes and the gallery
section they read are written, and the family is registered in the shared
conformance battery. The one framework defect this family used to be short of —
a keydown refused when the key before it removed the day it landed on — is fixed
in the runtime; what it was and what fixed it is under "The defect this family
found".

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

4. **`[...held, iso].sort()` inside a shared method is read as a write target.**
   Re-tested on this tip: `MARKLESS_STATE_UNRESOLVED_WRITE: Cannot write to
   "[...held, iso]" because the compiler cannot resolve that target.` `toggledList`
   in `calendar-math.ts` is that expression moved into a pure function.

5. **A shared factory's `computed()` may not import from another file.** Every
   `computed()` on `calendarState` is written out of platform globals rather than
   out of `./calendar-math.ts`, which is why `days`, `weeks`, `title` and `focused`
   each re-derive the visible month instead of calling `visibleMonth`. That
   duplication is the price, and `calendar.browser.ts` pins the two against each
   other. Re-tested on this tip by pointing `title` at `visibleMonth`: every row
   in the family's own lanes fails with `ReferenceError: visibleMonth is not
   defined`.

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

## The defect this family found

**A keydown was refused when the key before it removed the day it landed on.**
Fixed in the runtime; kept here because the measurement is what named it.

Press Shift+PageUp twice with nothing between the presses. The first press steps
the year, which replaces all 42 rows — the keys are the dates — and the second
press is dispatched at the day the first press was standing on, which by then is
gone from the page. Verbatim, twice per run:

```
RuntimeResumeError: MARKLESS_EVENT_DISPATCH_UNMATCHED: No event record matched keydown dispatch at button.
 ❯ unmatchedDispatchError packages/web/src/resume-events.ts:581:14
 ❯ Object.dispatch packages/web/src/resume-events.ts:173:3
 ❯ Object.dispatch packages/web/src/resume-runtime.ts:385:32
 ❯ Object.dispatch packages/web/src/resume.ts:35:4
```

The mechanism, measured on this tip with a capture-phase listener recording each
keydown's target and whether that element was still in the document afterwards:

| # | keydown    | target               | what happened                |
| - | ---------- | -------------------- | ---------------------------- |
| 1 | `Shift`    | `button[2026-08-14]` | landed                       |
| 2 | `PageDown` | `button[2026-08-14]` | landed; title to August 2027 |
| 3 | `Shift`    | `button[2027-08-14]` | landed                       |
| 4 | `PageUp`   | `button[2027-08-14]` | landed; title to August 2026 |
| 5 | `Shift`    | `button[2027-08-14]` | threw                        |
| 6 | `PageUp`   | `button[2027-08-14]` | threw                        |

Keydowns 3 to 6 were all dispatched against the August 2027 grid, and their target
was still connected both synchronously and one microtask after each was pressed:
the rewrite keydown 4 caused had not happened yet when 5 and 6 were pressed.
`dispatch` in `resume-events.ts` is `async` — it awaits the runtime module before
it looks at anything — and by the time it runs for the last two the rewrite has
removed their target, so the guard that asks whether the target is still inside
the resume root refuses them. The runtime
already holds the idea that this is not a defect: `ignoredDisposedEventTargets`
exists so that "a dispatch after container teardown is never an unmatched
defect", but it is filled only when a whole container is torn down, never when a
keyed repeat disposes a row.

Nothing in the family's shape avoided it. The keys must change when the month
changes — they are the dates — so the rows must be rebuilt, and a family cannot
order a browser's keystrokes against a rewrite its own previous keystroke caused.

**What fixed it.** A keyed repeat that takes a row out of the document now
records the parent it hung from, and dispatch finishes the walk across that
record when the row's own parent link is gone. The event is routed on the path
it WOULD have taken at press time, so every record above the repeat — here the
one `onKeydown` on `calendar.content` — still runs. The gesture is not dropped;
only the removed row's own record is skipped, and only once its key has left the
collection, because that row has no item left to act on.
`CSR: Shift with the page keys steps a year` is green, and the title reaches
August 2025. The runtime side is `packages/web/src/resume-events.ts` and
`resume-keyed-repeats.ts`, witnessed in
`packages/vitest-browser/browser/disposed-row-dispatch/`.

The previous note's defect — a `@for` row built after the first render getting its
own detached copy of the widget — is **gone on this tip** and its entry has been
deleted. Re-measured: `scenarios/controlled.tsrx` now reports the `onChange` call,
carries the new month's date, writes `ui-selected` without `ui-outside`, and moves
the tab stop onto the pressed day; `CSR: PageDown crosses the month and takes the
focus with it` is green; and the `TypeError: Cannot read properties of undefined
(reading 'slice')` that `sameMonth` used to throw out of a minted row's
`isOutside` no longer appears in the lane at all.

Routing the item through `calendar.month` and `calendar.focused` rather than
rebuilding the month from `monthAt` was kept: it removes a real duplication
between the factory and the item, and on this tip those derived cells do reach a
minted row.

## The real reader lanes

`calendar.nvda.ts` and `calendar.voiceover.ts` run the shared
`calendar-transcript.ts` against `FAMILY_ANCHORS.calendar`, whose section is last
on the gallery page and pins August 2026 with one day chosen and one a person may
not choose, so what a reader hears is the same on every run. What is asserted is
the divergence itself: each day announced as a button carrying its whole date,
the day nobody may choose saying so and still refusing when pressed, and the
month's group renamed by the title whenever the month moves. A day's expected name
is read off the element rather than rebuilt from `Intl`, because the page's locale
is the browser's and the transcript runs in node.

`aria-pressed` is asserted on the element, not in a phrase: neither reader has a
`Vocabulary` slot for it, and datebox records the same reason for `spinbutton`.

Neither reader has run against this markup. On this machine the lane prints
`Error: NVDA is not supported` and `Error: VoiceOver cannot be started` /
`Failed to mount Guidepup preferences`, so every wording in the tables above is
the virtual reader's, and the real lanes are unmeasured.

The virtual reader's own lane, `calendar.sr.ts`, is green. `calendar.title` is a
polite live region; the runtime no longer re-announces it when a gesture leaves
its text unchanged, so a day's own phrase is the last one spoken.

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
