# toaster — implementation notes

Built from the pilot charter rather than ported from QDS: this is the first
family with no upstream folder listing to follow. Sonner is the behaviour
reference only — stacking data, swipe dismissal, hover pause — never its visuals.

## Shape

Six parts: `toaster.root`, `.item`, `.itemtitle`, `.itemdescription`, `.itemclose`,
`.itemicon`. No `itemaction`: a consumer's action button is their own markup and
their own handler (owner ruling). Nothing ships styled — no stylesheet, no
`unstyled` attribute. Behaviour ships as data instead: `ui-toast`, `ui-toaster`,
`ui-tone`, `ui-front`, `ui-paused`, and the `--index` / `--offset` custom
properties on a written-out item.

One page-scoped `shared()`, `toasterState`, holds the queue. Page-scoped, not
widget-scoped, because a component that never renders the region still has to
reach the same queue — `basic.tsrx`'s `Elsewhere` button is that row, and it is
green.

`toaster.root` renders the messages itself when it is written with no children.
Those default rows are deliberately plain — static markup, text read from the
message, one close button — because that is exactly the shape this runtime can
build for itself after a resume. The SSR rows in the suite are the proof: a page
served with an empty stack grows a real, working row for a message raised by a
click after resume.

## The wall this family is blocked on

**A `shared()` method called from a handler in ANOTHER module is copied into that
handler's own module, where neither the family's imports nor the graph wiring
exist. The compile is clean; the failure is at dispatch, with no diagnostic.**

Measured here in this order, each error appearing after the previous one was
worked around:

1. `ReferenceError: toastId is not defined` — the copied body keeps the family's
   helper names, and a symbol module is built from the CALLING module's imports.
2. `TypeError: Cannot read properties of undefined (reading 'some')` — a read of
   `toaster.queue` through a local inside the copied body.
3. `TypeError: Cannot add property minted, object is not extensible` — a write
   straight to an instance field from the copied body, landing on a frozen plain
   object instead of the graph.

The same method called from a part inside `toaster.tsrx` works, which is why the
family's own parts (the row close button, the pause and resume handlers) use
methods and consumers cannot.

What that costs, exactly:

- The ruled imperative surface — `toaster.toast(title, { id, tone, description,
  duration })` returning an id — cannot be called by a consumer. The suite pins
  it (`the imperative surface a consumer is meant to call`).
- **Every clock hangs off that one call.** The ticker is started by `toast()`, so
  auto-dismiss, hover-pause and tab-pause are all unreachable from a consumer
  page. One pinned row carries all three rather than three thin pins.
- What consumers can do today is write the queue from their own handler:
  `toasts.queue = toaster.say(toasts.queue, 'Saved', { id: 'save' })`. Every
  green row in the suite goes through that shape. It is a workaround kept
  visible, not the shipped surface.

A namespace-level function is not an escape hatch either: `export function
toast()` that resolves the instance itself is DROPPED from the compiled module —
`SyntaxError: does not provide an export named 'pushToast'`. So `toaster.toast()`
and `toaster.shown()` as bare namespace calls are both unavailable, in every form
measured.

## What else the compiler forced — measured on this tip

1. **A page-scoped factory takes no prop seeds.** `toaster.visible = visible` is
   `MARKLESS_SHARED_SEED_UNKNOWN_FIELD`; seeds are written when a widget root
   seeds its parts, and a page-wide factory never gets one. `visible` is
   therefore a prop of `toaster.root` read by a component-local `computed()`, and
   a per-root `duration` prop is not shippable at all — it would have to reach
   the enqueue, which only the graph can carry. The prop is absent rather than
   dead: per-message `duration` covers the same ground.
2. **A destructuring default cannot be READ.** `visible = 3` in the parameter
   list plus `computed(() => ... visible)` is
   `MARKLESS_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED`. The prop is destructured
   without a default and the fallback is written at the read.
3. **An inlined method may not build an array inline.** A method that takes a
   parameter and writes `queue = [...queue, record]` — or even
   `queue.slice(1)` — is `MARKLESS_STATE_STALE_LOCAL_WRITE`. A zero-parameter
   method writing the same field is fine, and so is the same write authored
   directly in a handler. Every write here goes through a pure function in
   `toaster-queue.ts` for that reason.
4. **A behavior on a page-scoped root crashes the render.** `attach=` on
   `toaster.root` throws `TypeError: Cannot read properties of undefined
   (reading 'listSharedDefinitions')` from
   `packages/web/src/fns/instance-scope.ts:502` by way of
   `activateAuthoredBehaviors`. That is what the F8 hotkey was written as
   (`toaster-hotkey.ts` is still here, unwired), so the hotkey ships nowhere and
   the focus-restore rule that rode with it does not either.
5. **A consumer's own `@for` inside `toaster.root` renders nothing.** The custom
   path is pinned three rows deep. With the default rows in an `@else` arm the
   page threw `RuntimeResumeError: Resume locator h2 expected <div> at DOM order
   index 3`; with `{children}` rendered outside the construct the throw goes away
   and the rows simply never appear. No diagnostic either way.
6. **A construct cannot be the direct child of a component tag**
   (`MARKLESS_PARSE_ERROR`), so `custom.tsrx` wraps its loop in a
   `<div role="presentation">` — the same shape select ships.
7. **The default export must be the first component in a `.tsrx` module.**
   A module whose default export is declared after another component renders the
   other one. Cost an hour of a wrong reading during the probes.

## What the mint accepts, and what the default rows gave up for it

The landed tier-1 mint (`mintableRowTemplate` in
`packages/compiler/src/passes/protocol-view.ts`) carries a row template only when
every slot in the row is TEXT read off the repeated item. No dynamic attributes,
no nested constructs, no child components. So the default rows carry:

- static `ui-toast`, `ui-toasttitle`, `ui-toastdescription`, `ui-toasticon`,
  `ui-toastclose` markers, and a static `aria-label="Dismiss"`;
- text slots for the title, the description and the tone's own character, which
  is why `icon` is minted into the record at enqueue rather than derived in the
  row;
- one row event: the close button, whose handler writes the root's array.

What they do NOT carry, and cannot: `ui-tone` per row, `ui-front`, and the
`--index` / `--offset` stacking data. Those live on `toaster.item` in the custom
path, where a child component may carry dynamic attributes — and the custom path
gives up the mint in exchange, which is the honest trade rather than a bug.

## Behaviour that is implemented and unreachable

`toast()`, `pause()` and `resume()` are written and correct as far as the family
module can drive them: one interval for the whole stack (per-message timers would
have to be owned, cancelled and rebuilt across a resume, and a minted row never
ran a body that could start one), `holdAll` / `releaseAll` shifting every
deadline by the paused span, and `Infinity` stored as `dueAt: 0` so a message
that never leaves carries no deadline into the payload. None of it is reachable
from a consumer page until the cross-module method wall above is closed.
