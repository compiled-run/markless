# U606 — the frame-retry loops come out of family source

Ruling applied: `SPEC.md` "Timing" — family source never polls frames. The runtime
now holds a focus the browser refused inside a dispatch and replays it once that
dispatch's write has committed (U600), so a family that reveals something and then
focuses it can just call `focus()`.

## What changed

| File | Was | Now |
| --- | --- | --- |
| `src/modal/modal-focus.ts` | `land()` helper, 12-frame retry | helper deleted; `close.focus()`, `content?.focus()`, `target?.focus()` at the three call sites |
| `src/tour/tour-focus.ts` | `land()` helper, 12-frame retry | helper deleted; `cards[at]?.focus()`, `target.focus()`, `capturedOpener(...)?.focus()` |
| `src/select/option-focus.ts` | `focusOpeningOption` 12-frame retry | `wanted?.focus()` |
| `src/colorpicker/colorpicker-math.ts` | `landFocus` 12-frame retry | `landFocus` is now `target?.focus()` |
| `src/calendar/calendar-focus.ts` | `landFocus` 12-frame retry, `landFocusOn` 30-frame wait | `landFocus` is `target?.focus()`; **`landFocusOn` kept** |

`src/menu/**` was out of contract and is untouched. The doc comments that existed
only to explain the retry are gone with it.

### Why `landFocusOn` stays

The 30-frame wait in `landFocusOn` is not waiting on a refused focus. A month
change replaces every day row, and the runtime mints the replacements during the
flush rather than on the write, so the day carrying the wanted date does not exist
yet when the handler that changed the month returns — there is no element to hold a
refusal against. Moving that mint to the write is being done separately; when it
lands, this loop goes too.

## Lane result

`vp test --project ui` over modal, tour, select, colorpicker and calendar:
**232 passed, 3 expected fail (235).** `pnpm typecheck`, `pnpm test:sr`
(255 passed, 9 expected fail, 4 skipped) and `pnpm exec vp lint --deny-warnings`
are all clean.

Baseline check before the purge: modal + select were 98/98 green with the loops in
place, so both pins below are caused by removing a loop, not pre-existing.

## The two rows that went red, and what was actually measured

Both were measured by instrumenting the call site to record the target's state at
the instant `focus()` was called and again after the flush. The instrumentation was
removed afterwards; the numbers below are what it printed.

### 1. `modal.browser.ts` — `CSR/SSR: a dialog opened programmatically restores focus to the pre-open element`

Call site: `focusBackToOpener` in `src/modal/modal-focus.ts`, the
`capturedOpener(surface)` branch (the dialog was opened from consumer code, not by
pressing the family's trigger, so the only record of where focus was is the reading
the overlay behaviour took at enlist).

At the moment the closing handler calls `focus()`:

    { testid: "opener", tagName: "BUTTON", connected: true,
      inert: true,            <- the target itself still carries the mark
      hidden: false, offsetParent present, box non-zero,
      activeElement before: body,  activeElement after focus(): body }

After the flush: `inert` is off the background, and `document.activeElement` is
still `body`. So the target's state at the call is **inert** — the browser refuses
focus into an inert subtree — and the refusal is never replayed once the mark comes
off. Whether the U600 shim did not classify an inert refusal as holdable, or held it
and replayed it before the overlay behaviour lifted the mark, is not distinguishable
from the family side; both are runtime-side.

The neighbouring trigger-opened rows still pass, so this is specific to the captured
opener path.

### 2. `select.browser.ts` — `CSR: Enter and Space open the popup and land on the first option`

Call site: `focusOpeningOption` in `src/select/option-focus.ts`.

At the moment it calls `focus()` on the `apple` option:

    { testid: "apple", connected: true, inert: false,
      hidden attribute: false,
      getBoundingClientRect().width === 0,   <- no box: the listbox is still hidden
      tabindex: "-1",
      activeElement before: trigger, activeElement after focus(): trigger }

300ms later, focus is still on the trigger.

The mechanism is the one already recorded in `src/select/note.md` item 4: Enter and
Space are deliberately absent from the family's opening set, because
`preventDefault()` from a deferred handler cannot suppress the native click. The
button's own activation opens the popup — **one dispatch after** the keydown handler
that asks for the landing. So the refused focus and the write that reveals the
target are in two different dispatches, and holding a refusal for the length of
*its own* dispatch cannot bridge that. The arrow-key, Home and End rows go through
the same function and pass, because there the opening write and the focus ask share
one dispatch.

This is the harder of the two: it is not "replay after the flush", it is "carry a
refusal across into a later dispatch that reveals the target".

## Pins

Both rows are `test.fails` with a comment naming the mechanism in plain words. They
turn red the day the runtime closes the gap, which is the point.
