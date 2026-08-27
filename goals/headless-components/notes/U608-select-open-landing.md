# Select: Enter and Space land on an option, asked for in the dispatch that opens

Closes gap 2 of `U606-loop-purge.md`. The pinned row
`CSR: Enter and Space open the popup and land on the first option` in
`packages/headless/components/src/select/select.browser.ts` is now a plain `test`.

## The gap, stated as a dispatch ordering

Enter and Space are deliberately not in the trigger's opening key set. A deferred
handler's `preventDefault()` runs after the browser has already taken the button's
default action, so opening from the keydown as well would have the native click
toggle the popup straight back shut. Enter and Space therefore reach the popup
through the button's own activation.

That left the landing in the wrong dispatch. The keydown handler called
`focusOpeningOption`, but the popup was still closed at that instant: the listbox
carries `hidden` until the open cell reaches the DOM, an option inside it has no
box, and `focus()` on a boxless element is refused. The runtime replays a refused
focus ask within the dispatch that made it, once the writes of that dispatch have
flushed. It does not carry an ask across into a later dispatch, and the click that
actually opens the popup is a later dispatch. So the ask was made, refused, and
dropped.

## The fix

Ask in the dispatch that opens. The trigger's `onClick` handler now:

1. reads whether this click is the opening one (`select.open !== true`) before writing,
2. writes the open cell as before,
3. and, when the click is keyboard-synthesised, calls the same
   `focusOpeningOption(select.optionEls, select.optionLabelEls, '', false)` the
   arrow-key path calls in its own dispatch.

The open write and the focus ask are now in one dispatch, so the per-dispatch replay
bridges them. No `requestAnimationFrame`, no timer, no DOM query, no new state cell.

The keydown handler's activation-key branch is gone with it: with the landing moved
to the click, `isActivationKey` guarded a branch that did nothing, so Enter and Space
now fall out of the keydown's condition entirely and `if (!isActivationKey) setOpen(true)`
is a plain `setOpen(true)`.

## Telling a keyboard click from a pointer click

`event.detail === 0`. A click synthesised from Enter or Space on a button carries no
click count; a real pointer click carries at least 1. It is a plain field on the
click event, so no DOM query and no cross-dispatch flag is involved.

A keyboard-intent flag set by the keydown and consumed by the click was the other
option named in the packet, and it was rejected: this family's own source records
that a lazily loaded handler symbol can run *after* the native dispatch, so the
keydown handler is not guaranteed to have set the flag before the click handler
reads it. `event.detail` needs no ordering guarantee at all.

Consequence worth knowing: a programmatic `trigger.click()` also reports
`detail === 0` and now lands the focus too. Every existing browser row that opens
that way stays green, and treating a scripted activation the way a keyboard
activation is treated is the more defensible of the two readings.

Pointer clicks keep today's behaviour: `detail >= 1`, no landing, focus stays on
the trigger.

## Guards on the landing

- Only on the opening click. A click that closes the popup does not land anything.
- Only when the select is not disabled, so a refused `setOpen` cannot be followed by
  a focus ask into a listbox that stayed hidden.
- The search argument is `''` and `isFromEnd` is `false`, so the landing is the
  chosen option when there is one and the first option otherwise — the same rule
  ArrowDown and Home already follow.

## Verification

All four packet commands run in the worktree:

- `pnpm typecheck` — clean.
- `pnpm exec vp test --project ui packages/headless/components/src/select` — 54 passed,
  no expected-fail rows left in the file.
- `pnpm test:sr` — 31 files, 255 passed, 9 expected fail, 4 skipped. The select sr rows
  for keyboard open are green. The first run of this command failed one
  `radio-group.sr.ts` row on a poll timeout and passed on the re-run; that family is
  untouched by this change, and the failure is lane-load flake, not a regression.
- `pnpm exec vp lint --deny-warnings` — 0 warnings, 0 errors.

Also run, because the select battery lives outside the `src/select` path and the axe
requirement rides on it: `pnpm exec vp test --project ui
packages/headless/components/test-support/conformance.browser.ts` — 426 passed, zero
axe findings for every family including select.

## Not covered here

`select-transcript.ts` presses Enter to open in the real-reader lane, so the reader's
cursor now finds itself on an option rather than the trigger after that press. The row
only walks for the three option names afterwards, so it should be unaffected, but the
real-reader lanes are CI-only and were not run.
