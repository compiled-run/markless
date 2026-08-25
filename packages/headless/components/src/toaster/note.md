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

`toaster.root` renders NO rows of its own (owner ruling, 2026-08-24). The region
is the live region and the container; the messages are the consumer's own markup,
written out of the parts above, exactly like every other family in this library.
There is no easy path and no `visible` prop — how many messages show is decided by
what the consumer's own repeat iterates, and `toaster.shown(queue, n)` is the cap
they write against.

Removing those default rows also removed the library's ONLY
`{children}`-beside-a-construct shape (the census study's Fixture B/C source).
Every remaining part projects its children with no construct next to them.

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
  `toasts.queue = toaster.say(toasts.queue, 'Saved', { id: 'save' })`. Every row
  in the suite that raises a message goes through that shape. It is a workaround
  kept visible, not the shipped surface.

A namespace-level function that RESOLVES THE INSTANCE ITSELF is not an escape
hatch: `export function toast()` written that way is DROPPED from the compiled
module — `SyntaxError: does not provide an export named 'pushToast'`. That is what
makes `toaster.toast()` unavailable as a bare namespace call.

A namespace-level PURE function over a value the caller already holds is fine, and
is how `say`, `drop` and `shown` ship. A bare `toaster.shown(toasts.queue, 2)` in a
repeat header compiles but dies at SSR render with `toasts` unbound; `limits.tsrx`
routes the call through a `computed()`, which binds correctly — which
corrects an earlier reading here that grouped `toaster.shown()` with
`toaster.toast()` as unavailable. The difference is resolving an instance, not
being a namespace call.

## What else the compiler forced — measured on this tip

1. **A page-scoped factory takes no prop seeds.** `toaster.visible = visible` is
   `MARKLESS_SHARED_SEED_UNKNOWN_FIELD`; seeds are written when a widget root
   seeds its parts, and a page-wide factory never gets one. This is why `visible`
   was a prop of `toaster.root` read by a component-local `computed()` rather than
   a cell. Both props are gone now: the root renders no rows, so `visible` had
   nothing left to cap and the consumer's own repeat decides. A per-root
   `duration` was never shippable either — it would have to reach the enqueue,
   which only the graph can carry, and per-message `duration` covers that ground.
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
5. **A COMPONENT ROW NEVER MINTS CLIENT-SIDE.** (Corrected: served component rows
   RENDER — measured across projection, plain hosts, and widget-local arrays; the
   earlier "renders nothing" reading measured growth from an empty queue while the
   then-live empty-arm defect made present rows look blank.) This supersedes the earlier
   reading here, "a consumer's own `@for` inside `toaster.root` renders nothing" —
   projection is not the cause. Measured with two repeats over the same queue on
   one page: a repeat of plain `<li>` markup inside `toaster.root`'s projected
   children RENDERS; a repeat of `toaster.item` inside a plain `<ol>` that
   projects nothing renders NOTHING; and a repeat of a trivial local component
   with no `shared()` of its own, also in a plain `<ol>`, renders NOTHING. So the
   wall is the component in the repeat — not the projected slot, not the widget
   scope, and not the `{children}`-beside-a-construct shape that was measured
   alongside it. No diagnostic in any form. **This is now the family's blocking
   wall:** with the default rows gone, the written-out parts are the only path,
   and it is the exact shape this blocks.

   Narrowed further since: `scenarios/one-message.tsrx` writes the same parts out
   with no `@for` around them, and every one of them renders, on the client and in
   the served HTML alike — `ui-tone`, the stacking style, the self-closed
   `itemtitle` / `itemdescription` / `itemicon` serving the record's own words, and
   a written-into `itemtitle` serving its children. So the repeat is the only thing
   between this family and a working consumer page; the parts are finished.
6. **A repeat body may hold only one element.** Two siblings inside `@for` is
   `MARKLESS_PARSE_ERROR` ("Expected '</' to close the JSX element, but found
   '@'"). Measured while probing point 5.
7. **A construct cannot be the direct child of a component tag**
   (`MARKLESS_PARSE_ERROR`), so every scenario wraps its loop in a
   `<div role="presentation">` — the same shape select ships.
8. **The default export must be the first component in a `.tsrx` module.**
   A module whose default export is declared after another component renders the
   other one. Cost an hour of a wrong reading during the probes.

## The mint, and why this family no longer reaches it

The landed tier-1 mint (`mintableRowTemplate` in
`packages/compiler/src/passes/protocol-view.ts`) carries a row template only when
every slot in the row is TEXT read off the repeated item — no dynamic attributes,
no nested constructs, no child components.

The default rows were written to fit inside exactly that, which is why `icon` is
minted into the record at enqueue rather than derived in the row: the mint can
carry a text slot but not a computed attribute. With those rows removed, the
family's only path is `toaster.item` inside a consumer's repeat — a child
component, which the mint does not accept. So this family reaches no mint at all
now, and `ui-tone`, `ui-front` and the `--index` / `--offset` stacking data (which
the default rows could never have carried) are the things it renders instead.

`icon` stays on the record regardless: `toaster.itemicon` reads it off the item's
instance, so it is still a fact the queue carries rather than a lookup in a part.

## Behaviour that is implemented and unreachable

`toast()`, `pause()` and `resume()` are written and correct as far as the family
module can drive them: one interval for the whole stack (per-message timers would
have to be owned, cancelled and rebuilt across a resume, and a minted row never
ran a body that could start one), `holdAll` / `releaseAll` shifting every
deadline by the paused span, and `Infinity` stored as `dueAt: 0` so a message
that never leaves carries no deadline into the payload. None of it is reachable
from a consumer page until the cross-module method wall above is closed.
