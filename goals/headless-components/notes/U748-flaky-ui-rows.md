# U748 — two intermittent ui rows

Two rows were reported intermittent under the full `--project ui` lane. One
reproduced and is fixed at the cause; the other did not reproduce in two full
lane runs here and is left with its evidence.

## Measurements in this worktree

Tip: `feat/headless-ui-pilot` at `a3c73458`, merged fast-forward onto a worktree
cut from `main`, then `pnpm install --offline --frozen-lockfile` and `pnpm build`.

Full lane, before any change:

- run 1 — `Tests  2585 passed | 23 expected fail | 18 skipped (2626)`, 451.82s. Both rows green.
- run 2 — `Tests  1 failed | 2584 passed | 23 expected fail | 18 skipped (2626)`, 453.93s. The popover row red.

The machine was otherwise idle (18 cores, load average ~2.4 with only the lane
running), which is likely why the colorpicker row stayed green here while the
cockpit saw it red in 2 of 3 runs.

## Row 2 — popover served open, Escape closes it (fixed)

`packages/headless/components/src/popover/popover.browser.ts` line 376, failing
at line 383:

```
AssertionError: expected false to be true // Object.is equality
Caused by: Error: Matcher did not succeed in time.
```

That is `await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true)`:
the served-open surface never hid, so the Escape reached nothing at all. It was
lost, not merely late.

### First wrong fact

`runInlineResumerOverlayPrimer` in `packages/web/src/inline/resumer.ts` declined
to prime whenever `root.__marklessDelegatedDispatch` was set, on the stated
reasoning that an earlier gesture having woken the page means "the behaviour is
installed and owns the keyboard". It does not. `__marklessDelegatedDispatch` is
set synchronously the moment a wake *starts*; the overlay behaviour installs an
`import()` later, and until it lands there is no document keydown listener. An
Escape arriving in that window was taken by neither side.

The row walks straight into it. `el(Close).focus()` is enough to start the wake:
the close button carries a `click` record, so the resumer's own focus prime
(`primeEventNames` includes `focusin`) calls `forward({ event: 0 })`, which sets
the flag before importing anything. The `await userEvent.keyboard('{Escape}')`
that follows is a driver round trip later — fast enough to beat the import when
the machine is quiet, not when the lane is loaded. That is the whole intermittency,
and it is why the two neighbouring rows never flake: the placement row makes no
gesture at all, and the first-click row carries its own dispatch into the queue.

### Fix

The primer now keys on whether the behaviour is actually installed, and stays
armed until it is:

- `packages/web/src/overlay-handoff.ts` — new `OverlayInstalledRoot` handoff type.
- `packages/web/src/fns/overlay.ts` — `installOverlayBehavior` marks the root
  before its own gates, since every one of them means nothing further is coming.
- `packages/web/src/inline/resumer.ts` — the primer disarms on that mark rather
  than on the first gesture, and takes an Escape while a wake is merely in flight.

No family source changed; no settle, retry, longer timeout or `test.fails` was
added anywhere.

### Witness

`packages/vitest-browser/browser/escape-during-wake/` — a served-open surface
beside one focusable control that carries a click record. Focus starts the wake
synchronously and the Escape is dispatched in the same task, so the ordering is
certain rather than lucky: red before the fix, green after, in 1.7s with no load
needed. Its second row pins the other half of the same primer (an untouched page
still takes the very first Escape) so the window cannot be widened by dropping it.

## Row 1 — colorpicker typed hex (not reproduced)

`packages/headless/components/src/colorpicker/colorpicker.browser.ts` line 521,
`CSR: a typed hex commits on Enter and is re-read in every part`. Green in both
full lane runs above, so there is no captured assertion text and no first wrong
fact to name. Nothing was changed for it.

Reading of the paths involved, for whoever picks it up:

- The named poll (`aria-valuenow` on the hue thumb) is an attribute write, which
  `control-edit-hold` cannot suppress — the hold only guards `value`/`checked`
  property writes. So a held write is not on its own an explanation for that
  line failing; the two reads that follow it (line 532 `ValueLabel` text, line
  533 `aria-invalid`, both read once rather than polled) are the more likely
  subjects and would need the real assertion text to tell apart.
- `marklessNoteControlEdits` saves the previously installed note and restores it
  on release. Overlapping dispatches releasing out of LIFO order therefore leave
  a stale note installed indefinitely: the outer release sees a note that is not
  its own and returns without restoring, then the inner one reinstalls the older
  map. A later write judged against that stale note is held when it should land.
  This is unproven against the row and was left alone.

Next step: capture the assertion text from a loaded full lane before changing
anything.

## Open item

`packages/web/test/render.test.ts` pins `OVERLAY_PRIMER_BYTES = 1498`, the
inline-resumer source cost of the primer. The fix moves it to **1448** — a
50-byte reduction. That file is outside this unit's file contract, so the anchor
was not re-anchored here; `pnpm exec vitest run --project node packages/web` is
`1 failed | 652 passed (653)` on exactly that row and nothing else.
