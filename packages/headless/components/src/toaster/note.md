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

## Why the region is not a list

The region was an `<ol>` and a row an `<li>` until 2026-08-25. Both are now plain
`<div>`s, because a consumer's repeat has to sit inside a wrapper element (point 7
below) and `<ol>` may hold nothing but `<li>`, `<script>` and `<template>`. The
`<ol>` therefore shipped invalid the moment a consumer wrote the only markup the
family has: axe's `list` rule ("`<ul>` and `<ol>` must only directly contain
`<li>`, `<script>` or `<template>` elements", serious) was red on both conformance
rows for as long as the family has been in the battery.

A wrapper that is a list item is not available either: an `<li>` holding the
repeated `<li>`s is a nested list item with no list around it, and an `<li
role="presentation">` is axe's `list` rule again by its `roleNotValid` message.
`role="list"` plus `role="listitem"` across the wrapper was rejected as building
the family's semantics on a re-parenting that real readers implement unevenly.

What is lost is the "list, 3 items" a reader says on entering the region. What
carries the family's accessibility is untouched: the live region and its
`aria-live` / `aria-atomic` / `aria-relevant` contract, each row's title and
description, the named dismiss button, and the hover/focus pause of WCAG 2.2.2.
No screen-reader row in `toaster.sr.ts` asserted list structure, so nothing was
re-pinned; the announced shape loses only the list wrapper itself.

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
5. **CLOSED — a component row now mints client-side.** The wall recorded here
   ("a component row never mints") is gone: `toaster.item` inside a consumer's
   `@for` raises, lands inside the region, stacks and dismisses. Eleven of the
   twelve pinned rows in the suite were waiting on it and are now plain `test`.
   Two smaller measurements replaced it, both recorded at the row that pins them:

   - **One page module per browser test file.** A compiled page installs its
     row-minting loader into a single unqualified global (`__marklessRowMint`,
     written by `packages/bundler/src/source-module.ts`), capturing that module's
     own render-data id. Import two page modules into one test file and only the
     last one loaded can mint; every other page throws
     `MARKLESS_PRERENDER_DATA_COMPONENT_MISSING: <OwnerName>`. That is why the
     suite is three files rather than one.
   - **A minted row's `computed()` cells are one flush stale.** The row is
     evaluated before the page-scoped queue it reads is live, so
     `positionOf(queue, item.id)` answers -1: `stackingStyle` clamps that to
     `--index: 0` and `ui-front` is left off the row that IS at the front. The
     cells correct on the next graph flush, by which time the row minted in that
     flush is stale in its turn.
6. **A repeat body may hold only one element.** Two siblings inside `@for` is
   `MARKLESS_PARSE_ERROR` ("Expected '</' to close the JSX element, but found
   '@'"). Measured while probing point 5.
7. **A construct cannot be the direct child of a DOTTED component tag**
   (`MARKLESS_PARSE_ERROR`: "Expected '</' to close the JSX element, but found
   '@'"), so every scenario wraps its loop in a `<div role="presentation">` — the
   same shape select ships. Measured more precisely on 2026-08-25: the parser
   accepts `@for` directly inside `<ToasterRoot>` — a tag spelled as a plain
   imported identifier — and refuses it inside `<toaster.root>`. The wall is the
   member-expression tag name, not component tags as such;
   `packages/vitest-browser/browser/fixtures/toaster-mint-page.tsrx` has been
   compiling the identifier form all along. The family's markup is not built on
   that escape: `toaster.root` is the spelling the library documents, and a region
   whose validity depends on which import spelling a consumer picked would be a
   trap. It is why the region is a `<div>` rather than an `<ol>`.
8. **The default export must be the first component in a `.tsrx` module.**
   A module whose default export is declared after another component renders the
   other one. Cost an hour of a wrong reading during the probes.

## The mint this family reaches

The tier-1 template mint (`mintableRowTemplate` in
`packages/compiler/src/passes/protocol-view.ts`) carries a row only when every
slot in it is TEXT read off the repeated item — no dynamic attributes, no nested
constructs, no child components. That is why `icon` is minted into the record at
enqueue rather than derived in the row.

This family's only path is `toaster.item` inside a consumer's repeat, which that
template mint does not accept. It is the COMPONENT-row mint that carries it, and
that mint has landed: a row raised after load paints, lands inside the region,
stacks and dismisses through its own close button. `ui-tone` and the
`--index` / `--offset` stacking data ride along; `ui-front` and a second row's
`--index` are the one flush behind recorded in point 5 above.

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
