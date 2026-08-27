# Keyed rows mint at the write, not in the flush behind it

The open question U600 left — the handler's own read of a plural `element()`
handle answering the OLD rows on the statement after a collection write — is
closed. Calendar's `landFocusOn` 30-frame loop no longer has anything to wait
for. This note records the mechanism, the two things that had to change together,
what stays demand-loaded, and what the fix deliberately does not cover.

## What was actually deferred

Not the DOM commit. U600 measured that the re-mint lands inside the same dispatch
with zero animation frames. What was deferred was *where* the mint runs: inside
the graph's flush subscription (`packages/web/src/resume-keyed-repeats.ts`), and
the flush is a microtask behind the statement that wrote. The handler's next
statement therefore read the pre-write rows, because
`materializeElementHandles`'s `rowMembers()` walks the repeat parent's live
element children and those children had not moved yet.

## The mechanism

**A write hook on the graph.** `packages/runtime/src/graph.ts` gains
`subscribeWrite(observer)` and a matching `RuntimeGraphWriteObserver`. It is
notified at the end of `markDirtyPath`, which is the one place every mutation
route funnels through (`write`, `update`, `call`, `delete`, the read-initializer,
the shared plane, async settle), and it is notified *after* the computed
invalidation pass so an observer reading back finds a fresh derive.

Three guards make it safe rather than merely early:

- **Never during a flush.** `flushing` short-circuits the notification, so the
  flush's own subscription pass stays the single answer there.
- **Never re-entrant.** A write made from inside an observer notifies nobody.
- **Reaches derived collections.** An observer on a computed node is run for a
  write to anything that node derives from, walked through `dependencies`. This
  is required, not decorative: with a reconcile plane installed the invalidation
  is *deferred*, so the write dirties no path under the computed for a path test
  to find.

**The repeat subscribes to it.** `wireKeyedRepeats` now registers a write
observer beside its flush subscription. Mint stays single-sourced: both call the
same `apply` closure over the same `rowRootsByKey` map, so whichever runs first
places the rows and the other finds `currentRows === nextRows` and returns.
`applyKeyedRepeatRowOrder` was already idempotent; nothing about it changed.

The observer takes the apply only when the flush's own **synchronous** branch
would have taken it — no builds needed, or a resident template mint. A repeat
that has to await anything (a mint module still in flight, a component row, whose
render is async) is left entirely to the flush, exactly as before. A duplicate
key, and anything the mint throws, is swallowed here and left for the flush to
raise from the one place that has always raised it.

## The second half: a gesture must not race the load its own wiring began

Mint-at-write alone fixed SSR and left CSR red. Measured, not guessed: with a log
in the observer, CSR fired it with `mint: false` — `render-csr.ts` keeps the graph
and full runtime demand-loaded until the first interaction, so `wireKeyedRepeats`
starts the row-mint fetch during that very gesture and the handler's write lands a
microtask or two ahead of it.

The answer is **not** to make the gesture wait on a new load. The observer
declares `settle()`, which hands back the load **already in flight** and starts
nothing; `graph.settleWriteObservers()` gathers those, and `resume-events.ts`
awaits it once per dispatch, before running any handler symbol, in both
`dispatchViewEvent` and `dispatchRowEvent`. On a page with nothing pending it
returns `undefined` and costs zero microtasks; once `cell.mint` is set the
observer answers `undefined` for the rest of the page's life. No fetch is added
to any gesture — the concurrent one simply stops being raced.

## Measured

`packages/vitest-browser/browser/write-then-focus/` — 8/8 green (was 6/8). The two
month-change rows, CSR and SSR, now read
`rows-seen = 2026-09-01,2026-09-02,2026-09-03` in-handler and land
`document.activeElement` on the row whose key the same handler wrote, with no
frame loop anywhere. The focus itself needs no replay in this case: the new row
is connected and focusable when the handler reaches it, so native `focus()` takes
on the first call and `fns/element-handle.ts` holds nothing.

Pins re-run green with their loops still in place: `browser/krg`, `krg-remove`,
`part-row-refresh`, `disposed-row-dispatch`, `repeat-owner-path`,
`calendar-blockers`, `demand-load-replay`, `focus-primed` (90 rows over 11 files),
plus `runtime/test`, `web/test`, `core/test` (644) and the headless `ui` lane for
calendar, select, tree, toaster and checklist.

One `ui` row is red and was red before this change, verified by reverting to the
untouched tip and re-running: `checklist.browser.ts > CSR: a mounted error marks
the group invalid, written after the items or before them` is a `test.fails` pin
that already passes on the tip, so it reports "Expect test to fail". It belongs to
whoever owns the checklist error path, not here.

## The leanness wall, paid in comments

`resume-keyed-repeats.ts` is its own static-closure entry and sat at 20,933 source
bytes against the 20,983 wall in
`packages/web/test/event-only-resume-closure.test.ts` — 50 bytes of headroom. The
observer, its `settle`, and the `uniqueRepeatKeys` split cost 2,181. Paid the way
the wall's own history says to pay it: the file's comment paragraphs were cut to
the terse lines the repo's comment rule asks for, no logic removed. Now 20,338,
with 645 bytes of headroom. Every fact those paragraphs carried that a maintainer
could not get from the code is still in the file, one line each.

## What this does not cover

- **Component rows.** `repeat.rowComponent` needs an async pre-render
  (`fns/row-component-mint.ts` `rows()`), so a page carrying one gets the resident
  mint module with `.rows` on it and the observer declines for *every* repeat on
  that page, template rows included. Those pages keep the flush-time mint they
  have always had. Making a component row observable at the write means rendering
  it synchronously, which is a different unit and a bigger question.
- **A repeat with no `collectionGraphNodeId`** registers no observer, as it
  registers no subscription.
- **`subscribeWrite` and `settleWriteObservers` are optional on `RuntimeGraph`.**
  Several facades take a `Pick` of that contract (`event-resume.ts`,
  `fns/prerender-trigger-resume.ts`, the test doubles in `web/test/resume.test.ts`)
  and none of them are in this unit's contract. A caller without the members gets
  the flush-time answer it always had.

## Witness

`packages/web/test/rows-mint-at-write/rows-mint-at-write.test.ts` — 8 rows. Every
DOM assertion reads straight after `graph.write` and **before** `graph.flush`:
awaiting the flush first would pass on the old behaviour and pin nothing. It
covers rows in place at the write, exactly one mint across write and flush, a
departing key gone at the write, a computed-backed collection reached through the
state write behind it, a page with no row-mint loader left alone, a released
repeat hearing nothing further, and the graph's two guards (no re-entry, and no
notification for a write made during a flush). 7 of the 8 are red on the untouched
tip.

## For the follow-up

`calendar/calendar-focus.ts` `landFocusOn(days, iso)` with its `VALUE_TRIES = 30`
can now be a plain `days.find(...)?.focus()` in the handler: the day the handler
wrote is in the DOM and answered by the plural handle before the next statement.
That deletion is a `packages/headless/**` change and outside this unit.
