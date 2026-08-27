# Write-then-focus: where the deferral was, and what now guarantees the landing

Seven families retry `focus()` for 12–30 animation frames because a handler
writes `open = true` and the surface is still `hidden` on the next line. This
note records where that gap actually was, what closed it, the measured budget,
and which loops the follow-up can delete.

## Where the deferral was

Two places, and only one of them is inside this unit's contract.

1. **The flush is scheduled, not inline.** `packages/runtime/src/graph.ts`
   `scheduleFlush` arms a microtask; a state write only marks dirty paths. The
   dispatch itself awaits the flush in the `finally` of `dispatchViewEvent` /
   `dispatchRowEvent` (`packages/web/src/resume-events.ts`), so **the commit
   already lands before `dispatch` returns** — it simply lands after the handler
   body has finished.

2. **A binding's DOM-update symbol is demand-loaded.**
   `packages/web/src/resume-runtime.ts` (~line 174) subscribes each
   `view.domUpdates` entry with `async run(value) { const symbol = await
   input.loadSymbol(domUpdate.symbolId); ... }`, and `resume-branches.ts` awaits
   `import('./dom-journal.ts')` on a branch flip. Applying a write to the DOM can
   therefore require a module fetch.

**A fully synchronous commit is not reachable.** It would mean every binding's
update symbol is resident before the first gesture, which is precisely what the
demand-load design refuses (`browser/demand-load-replay`). Both files that would
have to change — `runtime/src/graph.ts` and `web/src/resume-runtime.ts` — are
outside this unit's contract as well. So the packet's second branch is the one
taken: the commit stays where it is (before `dispatch` returns) and the **focus**
is what moves to the far side of it.

## What changed

`packages/web/src/fns/element-handle.ts` (new). A dispatch wraps its element
handle reader, so every element a handler reaches through an `element()` handle
gets a `focus` shim installed as an own property — the element object itself is
unchanged, so `document.activeElement === target` and `handle.contains(node)`
still compare as before.

The shim is deliberately narrow:

- It calls native `focus()` first, always.
- It records the call for replay **only** if the target refused it *and* a
  dispatch with uncommitted writes is open.
- `resume-events.ts` opens that window before running the handler symbols and
  closes it after `flushRuntimeGraph()` resolves; closing it replays the last
  refused call.

Two landmines were measured on the way, both worth keeping:

**A held record must be stamped with the dispatch that made it.** A first draft
kept one module-level `pending` and landed whatever was in it at the end of any
dispatch. That passed `modal` alone and failed
`modal.browser.ts > SSR: the first Escape on a dialog served open closes it`
whenever the six family files ran together: the dialog closed, but the
background's `inert` never released, because a focus refused during one dispatch
was replayed at the end of a later one and disturbed the overlay's focus
bookkeeping. Records now carry the dispatch id that made them and are dropped
unless that same dispatch closes them.

**The window must not swallow focus calls it did not cause.** The first draft also captured *every* focus call inside the window and regressed
`calendar.browser.ts > CSR: every key of the roving model moves the focused day`
(two `ArrowLeft`s landed one day): the families' own `requestAnimationFrame`
callbacks can fire while an awaiting dispatch still holds the window open, and
their successful focus moves were being held and reordered. Replaying only
*refused* calls leaves every already-working focus untouched — which is why the
six family lanes stay green with their loops still in place.

No `requestAnimationFrame` anywhere in the runtime path, and no per-call
"wait N frames" API: the write commits, the wait did not move.

## Measured budget

Chromium, `browser` project, CSR, one press on a handler that writes `open =
true` then focuses a `hidden`-bound surface. Timestamp taken inside the handler
at the write; commit timestamped by a `MutationObserver` on the `hidden`
attribute; focus by a `focus` listener on the surface.

| | before | after |
| --- | --- | --- |
| write → DOM commit | 3.80 ms | 3.80 ms (unchanged) |
| write → focus landed | never (12–30 frames of retries, or gave up) | 4.00 ms |
| animation frames the runtime spends | 0 | 0 |

The commit costs **under a quarter of one 16.7 ms frame**. Every family loop
schedules its first attempt with `requestAnimationFrame`, so its earliest
possible landing is the next frame boundary — always later than the commit — and
it then re-asserts for 12 more frames (~200 ms), or 30 for calendar (~500 ms).
The loops were never waiting on the commit; they were waiting on the frame clock.

**Keyed-row re-mint is already part of the same commit.** Calendar's
`VALUE_TRIES = 30` comment — "a month change replaces every keyed row, and the
rewrite lands several frames after the write" — is wrong. Measured: a handler
that replaces all three keys leaves the new rows in the DOM within the same
dispatch, **zero animation frames**. Row mint is not demand-loaded here, so this
is not the cold-gesture bug class.

What *is* true is narrower and is the open question below: the handler's own read
of the plural handle, on the statement after the write, still answers the **old**
rows (`inHandlerRead=2026-08-01,2026-08-02,2026-08-03` while the committed rows
are September).

## The follow-up: which loops go, which do not

**Delete outright** — replace the loop with a plain `target.focus()` in the
handler. Each of these focuses an element the handler already holds from a
handle, blocked only by `hidden` or `inert`, which is exactly what the shim
replays:

- `modal/modal-focus.ts` — `land()`, both callers (`focusIntoSurface` on the
  hidden surface, `focusBackToOpener` on the inert invoker).
- `tour/tour-focus.ts` — `land()`, both callers (`focusIntoCard`,
  `focusBackToTarget`).
- `menu/menu-walk.ts` — `focusItem()`.
- `select/option-focus.ts` — the `land()` retry at the end of the option walk.
  The pre-loop settling of `wanted` stays; only the frame loop goes.
- `colorpicker/colorpicker-math.ts` — `landFocus()`.
- `calendar/calendar-focus.ts` — `landFocus()` (the popup-content case only).

The re-assertion those loops do — never stopping on a hit, because "hiding the
surface the focus came from blurs it again a frame later" — is also unnecessary.
The `hide-and-return` witness (CSR and SSR) proves that returning focus to the
trigger while hiding the surface the focus sits in **holds**, still holding
100 ms later, with no re-assertion.

**Does NOT go yet** — `calendar/calendar-focus.ts` `landFocusOn(days, iso)`
(`VALUE_TRIES = 30`). It focuses a day the *commit has not minted yet*. The
handler writes the new month and then asks the plural day handle for the row
carrying the new date; that read answers the pre-commit rows, so there is no
element for `el.focus()` to be called on at all. An element-level shim cannot
help: the call never happens.

Closing it needs a decision this unit did not have, recorded as the unit's
blocking question:

- **(a) Mint keyed rows at the write** rather than in the flush subscription, so
  the handler's next-statement handle read answers the new rows. Reacting at
  write time means a graph-level hook in `packages/runtime/src/graph.ts`, which
  no keyed-repeat subscription can reach.
- **(b) Add a handle-level focus-by-predicate to `@markless/core`** — "focus,
  after this commit, the element this handle answers matching this test" — which
  is a new public API name and so an owner call, not an improvisation.

Until one is chosen, `landFocusOn` keeps its 30-frame loop, and the two
`write-then-focus` month-change rows (CSR and SSR) stay red as the standing
witness for whichever fix lands.

## Witness

`packages/vitest-browser/browser/write-then-focus/` — four fixtures, eight rows
(CSR and SSR each): hidden surface, inert invoker, keyed re-mint, and
hide-and-return. Every row waits on the **write** and then reads
`document.activeElement` synchronously; polling on focus itself would pass on a
retry loop and prove nothing.

Red on the untouched tip: 6 of 8 (hide-and-return was already green). Green now:
6 of 8, the two month-change rows excepted.
