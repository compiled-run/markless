# The calendar's rows are COMPONENT rows, and a component row still cannot mint at the write

The three CSR calendar rows and the one screen-reader row pinned `test.fails`
after `landFocusOn`'s frame loop was deleted are not a computed-collection
defect, not a read-ordering defect, and not a demand-load race. All three of
those were measured and are false. The one thing standing between the write and
the row is the refusal U605 wrote down as out of scope: **a page carrying a
component row declines the mint-at-write for every repeat on it**, and the
calendar's day grid *is* that component row.

## The shape

`packages/headless/components/src/calendar/scenarios/basic.tsrx` spells the grid as

```
@for (const day of cal.days; key day) {
    <calendar.item value={day} data-testid="day" />
}
```

`<calendar.item>` is a component, so the compiler records `rowComponent` on that
repeat rather than a `rowTemplate`. That makes the page's `__marklessRowMint`
answer with `fns/row-component-mint` — the superset that carries `.rows` — and
`resume-keyed-repeats.ts` reads exactly that property to decide whether the write
observer may take the apply:

```ts
const settledMint = () =>
    !builds ? { mint: undefined } : cell?.mint && !cell.mint.rows ? { mint: cell.mint } : undefined;
```

`cell.mint.rows` is present, so `settledMint()` answers `undefined`, the write
observer's `run()` returns before its `apply`, and the rows are placed only in
the flush a microtask behind the handler. `walk()`'s next statement —
`landFocusOn(() => dayEls, next)` — therefore reads the pre-write day buttons,
finds no button carrying the date it just wrote (a month crossing lands outside
the 42-day window the old month drew), and focuses nothing. Focus falls to the
body, so the *next* page key never reaches the grid's handler either, which is
why `CSR: Shift with the page keys steps a year` fails on the title alone.

## Measured, not reasoned

`packages/vitest-browser/browser/computed-collection-rows/` mirrors the calendar
in the smallest widget that shows it: a `shared()` widget scope, a 42-key ISO
collection `computed()` off a month cell, a plural `element()` handle, rows that
are a component (`CcrItem`), and a page key that writes the month and then reads
the handle back to focus the day it wrote. It is red on the tip, 4 rows of 6,
**CSR and SSR alike**.

A temporary probe inside the write observer, run against that page, reported one
notification per gesture:

```
{ at: "wire",     id: "c1:repeat:0", builds: true, hasComponent: true, hasTemplate: false, hasSubscribeWrite: true }
{ at: "observer", id: "c1:repeat:0", mint: true, mintHasRows: true, settled: false, items: 42 }
```

and the page's own in-handler outputs read `landed: "missing"`,
`rowsSeen: "42:2026-07-26"` (the August grid, still), `activeElement value: null`.

Each hypothesis the unit was cut against dies on one field of that line:

- **"the observer does not reach a computed-backed collection under a reconcile
  plane."** False. `items: 42` is the observer reading the collection back, and
  the derive it read had already been invalidated and re-run for the `monthAt`
  write. `subscribeWrite`'s dependency walk reaches the computed exactly as U605
  built it to.
- **"the handler's plural `dayEls` read happens before the observer settles."**
  False. The observer ran first — its trace line is recorded before the handler's
  own `rowsSeen` write, and `rowsSeen` still answers the old grid. The read is not
  early; there is simply nothing new to read.
- **"the CSR demand-load of the row-mint module is not the one
  `settleWriteObservers` awaits."** False. `mint: true` at observer time: the
  module is loaded and cached in the cell before the handler's first statement, on
  the very gesture that started the fetch. That half of U605 works.

The one false field is `mintHasRows: true` → `settled: false`.

## Why the fix is not inside this unit's contract

Placing a component row at the write means building its nodes **synchronously**,
inside the handler's own statement. Registration can stay in the flush behind —
`applyKeyedRepeatRowOrder` only needs `mintRow` to answer an element — but the
element itself comes from `rendered.html`, and that html has exactly one
producer:

`packages/web/src/prerender/evaluator.ts` `renderRepeatRowComponent`, reached
from `fns/row-component-mint.ts` `mintComponentRow`. It is the only reference to
that symbol in `packages/web/src` and `packages/vitest-browser` (checked by name
across both trees; not a priced completeness receipt). It is genuinely async, not
async-by-signature: `renderRowComponentEdge` awaits the shared-seed pass,
`renderSsrData`, and `evaluatePrerenderDataComponent` once per child slot.
Pre-warming the dynamic imports does not help — an `await` on an already-resolved
promise still yields the statement the handler needs.

So the change is a synchronous warm path through `prerender/evaluator.ts`, a file
this unit may not touch and which other live units own. Everything on this unit's
side of the line (`resume-keyed-repeats.ts`, `fns/row-component-mint.ts`,
`packages/runtime/src/**`) is already correct for the case it covers.

## Two smaller things the measurement also shows

Neither is the failing behaviour, and neither was changed here:

- The refusal is **per page, not per repeat**. A template repeat sitting on a
  page that happens to carry a component row elsewhere — the calendar's own
  `cal.weekdays` — is refused too, because the test is on the loaded module rather
  than on `repeat.rowComponent`. Weekday names do not move, so nothing measures it.
- The refusal fires **even when no row has to be built**. `applyKeyedRepeatRowOrder`
  calls `mintRow` only for a key with no row root, and `rowRootsByKey` keeps a
  departed key's row, so a pure reorder — or a crossing back to a month already
  drawn — needs no mint at all and could be taken at the write today.

## The witness

`packages/vitest-browser/browser/computed-collection-rows/` — 6 rows over
`ccr-page.tsrx` / `ccr-widget.tsrx`, CSR and SSR. Four are red on the tip and are
the ones the fix has to turn: the page key landing focus on the day it wrote, and
a second crossing keeping the tab stop with the keyboard. The two that pass read
the settled DOM after the flush and would pass on a frame loop too; they are
there to prove the collection and the tab stop are right once the rows arrive,
not to pin the timing. Every timing assertion reads the handler's OWN answers
(`data-ccr-landed`, `data-ccr-rows-seen`) plus `document.activeElement` after the
write is visible — polling on focus itself would pass on a retry loop and pin
nothing.

The witness is left red deliberately. It is the evidence, and it turns green when
a component row can be built inside the handler's statement.

## For whoever picks this up

The owner question is which of these to spend:

1. A synchronous warm render path for a component row in
   `prerender/evaluator.ts`, so `row-component-mint` can answer `mintRow` inside
   the write observer. Largest, and the only one that makes the calendar's own
   markup work as written.
2. Let the family's focus intent survive the async mint — the runtime holds the
   requested focus and lands it when the row attaches. That lives in
   `packages/web/src/fns/element-handle.ts`, which another live unit owns, and it
   answers focus but not the handler's plural read.
3. Nothing in the runtime: the calendar's grid stops being a component row. That
   is a family change and contradicts the part model.
