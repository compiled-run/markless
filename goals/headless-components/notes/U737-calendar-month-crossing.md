# U737 — calendar month-crossing tab stop: what turned the row red

## What was actually red

`pnpm test:sr` failed on `calendar.sr.ts > "the tab stop follows the day the
keyboard walks onto, across a month crossing"` with `Error: Expect test to fail`.

The row was not asserting and failing. It was pinned `test.fails` on 2026-08-26
in b781bd27 ("calendar month-crossing tab-stop row pinned with the three CSR
rows"), reason: *"Red until the client's month rewrite reaches the day the same
handler wrote."* The framework then fixed that defect, the row started passing,
and vitest reports a passing `.fails` row as a failure. Red here means the pin
went stale, not that behaviour regressed.

## Bisect

The test file has been untouched since the pin, so the same command bisects
cleanly: **green = still broken** (expected fail satisfied), **red = fixed**.

| commit | result |
| --- | --- |
| `52dc458b^1` (08e9a1df) | 1 expected fail — defect present |
| `52dc458b` merge | 1 failed, "Expect test to fail" — defect gone |

`52dc458b` brings in exactly one commit:

**`22e3e5ba` — fix(web): a handler's focus survives the commit that re-inserts
the row it landed on**, touching `packages/web/src/resume-events.ts` (the
dispatch's focus hold) and `packages/web/src/render-csr.ts`. It widened the hold
to cover a focus call the target *took*, not only one a hidden or inert target
refused, and lands the hold at the end of the commit only when the document fell
back to `<body>`.

The calendar's `focus(iso)` handler calls `landFocusOn` (`calendar-focus.ts`),
which focuses the day button synchronously inside the handler; the month rewrite
then re-inserts that same button. Before `22e3e5ba` the re-insertion reset the
page to `<body>`. After it, the focus survives — which is exactly what the row
observes.

Nothing to fix in the framework. The fix is to stop pinning a row that passes.

## Changed

- `calendar.sr.ts` — dropped `test.fails` and the stale reason from the
  month-crossing row. All 9 sr rows pass.
- `calendar.browser.ts` — dropped `test.fails` from **`CSR: an arrow off the end
  of the month crosses into the next one`**, which was red the same way under
  `--project ui` (also in the verification set).

No timeout widened, no retry added, no assertion relaxed.

## Still pinned, and why it is a different defect

Two CSR rows stay `test.fails`, and their reason was rewritten because the old
one is now disproved:

- `CSR: PageDown crosses the month and takes the focus with it` — measured
  `AssertionError: expected null to be '2026-09-14'`. The title *does* reach
  September; `document.activeElement` is `<body>`.
- `CSR: Shift with the page keys steps a year` — measured `expected 'August
  2027' to be 'August 2025'`. The first Shift+PageDown lands, then the next two
  presses do nothing.

Mechanism, and why the arrow row flipped green while these did not: the shown
42-cell grid for August 2026 runs Jul 26 – Sep 5, so **`2026-09-01` is already
rendered as a trailing day**. `landFocusOn` finds a handle for it, focuses it,
and `22e3e5ba` keeps that focus across the commit. **`2026-09-14` is not in that
grid at all** — `dayWithValue` returns `undefined`, no `focus()` is ever called,
and the commit that swaps the grid leaves the page on `<body>`. The second
failure follows from the first: with focus on `<body>`, later page keys reach no
handler.

So the remaining gap is not "the rewrite does not reach the day the handler
wrote". It is: **a crossing that lands outside the currently shown grid has no
element to focus at handler time, and the family does not re-land focus after
the commit that mints it.** Fixing it means landing focus on a day the commit is
about to mint, which is a family-plus-runtime question and was left outside this
unit's contract.
