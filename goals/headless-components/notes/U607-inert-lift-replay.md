# The captured opener was never handed out through the runtime

Gap 1 of the U606 memo: a dialog opened programmatically hands focus back to
nothing. Two candidate causes were named; both were measured, and only one is
real.

## The two candidates, measured

A witness page pair was built for the measurement and kept:
`packages/vitest-browser/browser/write-then-focus/inert-lift-page.tsrx` and
`inert-lift-handle-page.tsrx`. They are the same page twice - a button takes
focus, presses itself open, the overlay marks the background `inert`, and a
close button inside the surface hides it and asks for focus back. The only
difference is how the closing handler spells "where focus was":

| Page | Spelling | On the tip |
| --- | --- | --- |
| `inert-lift-page` | the raw node the behaviour left on the surface as `__marklessOverlayFocusOrigin` | **red**, CSR and SSR |
| `inert-lift-handle-page` | an ordinary `element()` handle read | **green**, CSR and SSR |

That split settles both questions at once.

**The inert lift does NOT happen after the replay.** The handle page is refused
for exactly the same reason - its origin carries `inert` when `focus()` is
called, which the row asserts before pressing close - and it lands anyway. So by
the time `marklessEndFocusCommit` runs, the overlay's mark is already off. The
ordering holds for a structural reason, not by luck: the behaviour lifts the mark
from a `MutationObserver` callback, and that callback is queued at the moment the
flush writes the `hidden` attribute, while the `await input.flushRuntimeGraph()`
continuation in `resume-events.ts` is queued at or after that same moment.
Microtasks run first-in-first-out, so the lift is always drained first.

**The captured opener was reached through a path nothing wrapped.** The focus
shim in `packages/web/src/fns/element-handle.ts` is installed per element, by
`marklessHandleFocusReader`, on the elements a dispatch's handle reader hands
out. `__marklessOverlayFocusOrigin` is a raw node the overlay behaviour stored at
enlist (`packages/web/src/fns/overlay.ts`), so the element the closing handler
focuses had no shim, its refusal was never recorded, and there was nothing for
the commit to replay. `document.activeElement` stayed `body`.

## The fix

`packages/web/src/fns/element-handle.ts` only. Handing out a handle now also
hands out that element's captured focus origin:

```ts
function reachThroughRuntime(target: HandleElement | undefined): void {
	installFocusShim(target);
	reachCapturedFocusOrigin(target);
}
```

The surface IS a handle read - `focusBackToOpener(modal.triggerEl,
modal.backdropEl, ...)` reads `modal.backdropEl` in the closing handler, and the
witness page reads its `surfaceEl` the same way - so the moment the family asks
for the surface is the moment the runtime can reach what the surface is
carrying. `packages/web/src/fns/overlay.ts` is untouched; the property name is
never spelled as a literal, it comes from the `OverlayFocusOriginHost` type in
`packages/web/src/overlay-handoff.ts`.

Reaching the origin runs on **every** read, not once beside the shim. The
surface's handle is normally read in the dispatch that opens it, which is before
anything enlisted and so before there is any origin to reach;
`installFocusShim` returns early on an element it has already shimmed, so
folding the two together would skip the only read that matters.

## What the runtime now guarantees

A focus refused inside a dispatch is replayed after every DOM effect that
dispatch's flush causes, the overlay's inert lift included, whether the target
came from a handle read or from the overlay's captured origin. What it still
does not cover: an element reached by neither route - a node from a raw
`querySelector` in consumer code, say - is not watched, and a refusal that
belongs to a *later* dispatch than the one that reveals the target is a
different gap (U606 memo, gap 2, the `select` row).

## Lanes

| Lane | Result |
| --- | --- |
| `pnpm typecheck` | clean |
| `browser`: write-then-focus, focus-primed, cold-trigger-press | 22 passed |
| `packages/web/test` | 558 passed (78 files + the 5 new rows) |
| `ui`: popover, tour | 64 passed |
| `vp lint --deny-warnings` | 0 warnings, 0 errors |
| `ui`: modal | 42 passed, **2 "Expect test to fail"** |

The two modal rows are the point. `CSR/SSR: a dialog opened programmatically
restores focus to the pre-open element` are `test.fails` pins in
`packages/headless/components/src/modal/modal.browser.ts`; they now pass, so the
runner reports `Error: Expect test to fail` and the modal lane exits non-zero.
That file was out of contract for this unit, so the pins are still standing and
still inverted - **unpinning them is the follow-up**, and until it happens the
modal lane is red for this reason and no other.

## Pins left behind

- `packages/web/test/inert-lift-replay/inert-lift-replay.test.ts` - five rows
  against `element-handle.ts` directly, with a fake element that refuses focus
  the way an inert one does. Three of them go red the moment
  `reachCapturedFocusOrigin` stops being called (verified by disabling the call);
  the other two guard the edges that must not change - a refusal outside any
  dispatch is not replayed, and an origin detached before the commit is left
  alone.
- The four browser rows in `write-then-focus.test.ts`. Its `afterEach` grew an
  overlay drain: these rows enlist a modal, and the scroll-lock count and
  background marks are document-wide, so a row that failed mid-open would
  otherwise poison every later row in the file.
