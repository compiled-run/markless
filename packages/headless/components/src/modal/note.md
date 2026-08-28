# modal

Seven parts: QDS's six (`root`, `trigger`, `content`, `title`, `description`, `close`) plus
`backdrop`, the role added by the 2026-08-23 ruling. The anatomy is
`<modal.backdrop><modal.content/></modal.backdrop>` - the backdrop wraps the content rather than
sitting beside it, which is the deliberate deviation from the Radix/Base UI sibling shape.

The accessibility approach is Base UI's: `role="dialog"` on an ordinary element, not the native
`<dialog>` and not the top layer. The mechanism is the bare `overlay` attribute. There is no import
surface and no options.

## How the halves divide

The backdrop carries `overlay`, the `hidden` gating, and the dismissal reports. The content carries
`role`, `aria-modal="true"`, the naming references and `tabindex="-1"`.

`aria-modal` is **authored, not toggled**. The behaviour reads it off the enlisted element's subtree
at the moment the backdrop enlists, and that read is what takes the rest of the page out of reach
and locks the scroll. Toggling it would race the same DOM update that flips `hidden`.

What the family owns, because the behaviour deliberately does none of it: what closes, and where
focus goes. Both live in ordinary handlers.

## Dismissal policy

Two paths reach the same policy, and they are not interchangeable.

**The `dismiss` event** arrives on the backdrop with `detail.reason`. The behaviour reports Escape,
and reports an outside press when the target is outside the *enlisted element* - which, because the
backdrop is the enlisted element, means outside the layer entirely. `Node.contains()` counts an
element as containing itself, so a press on the layer itself is never reported here.

**A press on the layer itself** is therefore the family's own job, and it is the case the ruling
actually calls "outside-press": a press targeting the backdrop, not a content descendant. It is a
two-phase guard - armed on `pointerdown` whose target is the layer, read on `pointerup`. A drag that
starts on a control inside the dialog and releases on the layer must not close it, and a click's
target is the common ancestor of the two, so a click-only test would close on exactly that drag.

The guard's armed set lives in `modal-press.ts`, not in graph state. A state write starts a dispatch
that lands after the handler returns, while both halves of the guard run inside one gesture; the
first implementation used `state()` and the flag read back stale every time. The layer is identified
by its own `element()` handle rather than `event.currentTarget`, which is null in a lazily loaded
handler (the same fact tabs, tree, navbar, select and otp all record).

`alert` refuses both outside-press paths and answers only Escape.

## The trigger's aria

`aria-haspopup="dialog"`, `aria-expanded` and `aria-controls` are all present. The previous
implementation carried a comment claiming "Base UI, Radix and Kobalte all omit expanded here too";
that claim is false on the evidence - Base UI's `popupConformanceTests` asserts both `aria-expanded`
and `aria-controls` on a dialog trigger, and asserts them again in its multiple-trigger cases.

One `modal.trigger` per root, per the ruling. Every other opener is the consumer flipping their own
open state, which `scenarios/controlled.tsrx` is.

## Focus

The family moves focus in two places and both call `focus()` once (`modal-focus.ts`). Neither target
can take it on the call itself - the surface is still `hidden` when the opening handler runs, and the
invoker is still `inert` when the closing one does - so both calls are refused and the runtime
replays them once the dispatch's writes reach the DOM (`marklessEndFocusCommit` in
`packages/web/src/resume-events.ts`). The family polls no frames.

**The surface takes the opening focus, not its first control.** Naming the first focusable would
mean asking the DOM for the surface's focusable descendants, and the owner's ban on DOM selectors
covers exactly that. `modal.content` carries `tabindex="-1"` so it can hold the cursor. An alert is
the ruled exception: it prefers its close control, which is a part and therefore has a handle.

Containment needs no family code. The behaviour marks every subtree beside the chain down to the
enlisted element `inert`, and sequential navigation skips inert subtrees, so a Tab off the last
control has nothing outside the dialog to land on.

Focus restoration targets the trigger. The programmatic half of the ruling - "programmatically
opened -> the element focused at the moment open flipped" - is **not implemented**: a prop-driven
flip runs no family handler, and there is no hook that fires when a bound attribute lands. Recorded
below as an open question rather than approximated.

## Finding 1 - a close button three levels deep never runs its click record

**Five of 41 browser rows fail on this, deterministically, and it is not fixable inside this
family's files.**

`modal.close` sits at `root > backdrop > content > close`. In five rows its `onClick` record never
runs: the dialog stays showing, `ui-open` stays on the root, and a probe field written as the very
first statement of the handler is never set. The same rows pass when run alone.

Measured, and each of these ruled out a cause:

- Escape works in the identical state - the backdrop's `onDismiss` record runs and closes the dialog
  through the same `modal.setOpen(false)` call. So the instance and the method are fine.
- A consumer's own button inside the same content works. In the form row `form-submit`'s handler
  runs and writes page state, and the `modal.close` click immediately after does not.
- Not the `el={modal.closeEl}` handle: removing it changed nothing (and cost the alert focus row).
- Not the family's focus retry loops: disabling them entirely left the failure identical.
- Not an ancestor click record on the backdrop shadowing the descendant: moving the layer's
  dismissal from `onClick` to `onPointerup`, leaving the backdrop with no click record at all,
  changed nothing, and renaming the pointer handlers changed nothing either.
- Not a slow lazy module load: a 6-second poll fails exactly as a 1-second poll does.
- Not a stale locator: one `[data-testid="close"]` in the document, attached, not inert.

The draft this unit started from had `close` one level shallower (`root > content > close`) and its
equivalent rows passed. Adding the ruled `backdrop` wrapper is what pushed the part deeper. That
places this in the same class as Finding 2 below - a part's identity changing with projection depth.

Failing rows: `CSR: the dialog opens from the keyboard...`, `CSR: tabbing off the last control...`,
`CSR: a form inside the surface saves...`, `SSR: the first open after resume...`, `SSR: opening
twice after resume...`. All five are left in the suite as the reproduction.

## Finding 2 - a naming part nested inside `modal.content` mints an id the reference does not spell

Carried forward unchanged from the draft, and untouched by the overlay ruling. `modal.content` reads
`aria-labelledby={modal.titleEl}`; `modal.title` binds the same handle. The reference renders without
the projection-depth segment the element's own id carries, so the dialog has no accessible name.
Pinned by `CSR/SSR: a dialog with no naming parts carries references that resolve to nothing`, which
is written to fail the day the condition becomes expressible.

## Finding 3 - a native form submit inside the surface navigates the page

A consumer's `onSubmit` handler calling `event.preventDefault()` lands too late: a handler symbol
runs after the native dispatch has finished. A `<form>` with a `type="submit"` button inside
`modal.content` therefore navigates - measured as the test iframe reloading to `?title=`, which took
the whole suite down with `Cannot connect to the iframe`.

`scenarios/form.tsrx` keeps the `<form>` element and uses a `type="button"` save control instead, so
the row proves the dialog shape rather than the submit. Any family with a form inside an overlay has
this problem; it belongs to the framework, not to modal.

## Finding 4 - a dialog served already open never enlists

The behaviour enlists an element that *becomes* shown - a transition out of `hidden` - and
deliberately never enlists one that was shown at first render, which is what will make a future
inline mode free. A served `<modal.root open>` therefore renders correct modal markup and gets none
of the mechanics: the background is not inert, the page is not locked, and Escape reaches nothing.

Pinned by `SSR: a dialog served open renders modal markup but never enlists`, which asserts what
actually happens so the day it changes is visible.

## Deviations from QDS, recorded

**`closeOnOutsideClick` is not shipped.** The ruled prop set is `open`, `alert`, `onChange`, and the
standing order is that deviations happen only when a constraint forces one. Outside-press policy is
the family's, and `alert` is the ruled way to turn it off.

**`level` is not shipped.** QDS threads it only to gate a scroll-lock release; the behaviour counts
its own locks and background marks, so there is nothing left to gate.

**The naming references are unconditional.** See Finding 2.

## Open questions for the framework

1. **Finding 1** - the dead click record on a part three levels under the root. This is the blocking
   one, and it is a dispatch or instance-resolution question, not a family workaround.
2. **A hook for a prop-driven state landing.** No family can react to a consumer flipping a bound
   value. This no longer blocks programmatic focus restore - the overlay behaviour reads
   `document.activeElement` at enlist and the family restores to that reading - but it still blocks
   anything a family would want to DO at the moment a consumer opens it.
3. **`OverlayDismissReason` cannot be imported.** `@markless/ui` does not depend on `@markless/web`,
   so `modal-types.ts` restates the reason vocabulary that `packages/web/src/fns/overlay.ts` owns.
   `modal-focus.ts` now restates a second web-owned fact the same way - the
   `__marklessOverlayFocusOrigin` property that `packages/web/src/overlay-handoff.ts` documents.
   Declaring the dependency is a decision about whether `@markless/ui` becomes web-only.
4. **`dismiss` has no slot in the intrinsic element types.** `onDismiss` on a `<div>` does not
   type-check, so `modal-types.ts` augments `GlobalEventHandlersEventMap` to add it. The event is
   the framework's, not modal's, so the declaration belongs in
   `packages/typescript-plugin/src/markless-tsrx.d.ts` beside the `overlay` attribute it pairs with.
5. **`alertdialog` has no vocabulary slot.** `Conveys.role` is `keyof Vocabulary`, so the alert
   screen-reader row reads the reader's word out of the raw phrase instead.
