# 12. Arm Rendering: Update Escalation Ladder, Arm-Relative Coordinates, Out-of-Order Streaming

Status: DRAFT (ratified design, implementation in progress — docs/goals/arm-rendering)
Ratified with owner: 2026-07-07. Source discussion: dashboard-migration goal,
15-need ledger; Qwik OOOS research (local ../qwik source read).

## Motivation

Async boundary arms (`@try` / `@pending` / `@catch` blocks) previously had no
client-side render path when they contained components, and in-arm records
lived in page-absolute DOM-order coordinates. Every observed failure class of
the dashboard migration traced to those two facts: dead in-arm interactions,
compose offset surgery for in-arm children, and a navigation architecture
detour (document.write swaps) taken to avoid client arm rendering.

## D1. The update escalation ladder

The compiler always selects the SMALLEST update tier it can statically prove.
Range replacement is the last resort, never the default.

| Tier | Mechanism | Component execution | Used for |
|---|---|---|---|
| 1 | value slots (text/attribute graph subscriptions) | no | most state changes |
| 2 | keyed row ops | no | repeat mutations |
| 3 | branch range flips (static parts + slots) | no | @if/@switch, incl. inside arms |
| 4 | arm commit (`commitArm`) | YES | transitions: mount, async settle, error |
| 5 | route swap | YES | tier 4 at page scale |

Steady-state interactions run at the vanilla-JS floor (the tiers ARE the
textContent/replaceChildren calls a hand-writer would make, selected at
compile time). Component execution is paid exactly once per appearance of
content. The destructive edge of range replacement is confined to moments
where destruction is semantically meaningless; `commitArm` captures/restores
focus and scroll.

Doctrine note: executing components during a tier-4/5 render is INITIAL
render happening in the browser, which the unified render/resume model allows.
"No hydration" forbids re-executing components over existing server HTML; it
does not forbid rendering new content client-side.

## D2. Escalation is never silent

If tier 3 cannot handle a flip (e.g. the @if contains a component), the
compiler escalates AND emits a diagnostic with a restructure suggestion. The
sharp edge (a toggle wiping sibling DOM state) may only exist where a
diagnostic already said so. Silent failure is a defect class.

## D3. Arm-relative coordinate spaces

All records inside an async boundary arm (locators, events, behaviors, nested
branch sites) index relative to the boundary's start anchor. Arms become
closed, movable, replaceable, streamable units; the anchor pair is the only
coupling to the page. Enables per-boundary lazy record loading; retires
events-in-arm misalignment and in-arm compose offset arithmetic.

## D4. Author vocabulary in diagnostics

"Arm", "boundary", "tier", "anchor" are contributor vocabulary. Diagnostics
speak the author's words: "@try block", "@pending content", "this @if
contains <Shell>". Every diagnostic fixture asserts its message text.

## D5. Streaming mechanism (from Qwik OOOS, minus the VDOM tax)

Keep: settled content streams as inert `<template>` + a tiny inline executor
that commits it. Delete (possible because graph state addresses cells by id,
not position): vnode grafting, cross-segment ref tables, reveal dance
(display toggling), result-parent/placeholder indirection, backpatch maps,
serialization ordering locks.

Shape: server flushes pending arms in place and keeps the response open; a
settling boundary appends
`<template m:arm="boundary:N">html</template>` +
`<script type="markless/arm">arm records</script>` +
`<script>__mArm("boundary:N")</script>` — the executor routes through the
same `commitArm` primitive the client tiers use.

## D6. Sequencing and defaults (amended 2026-07-07, owner ruling)

Client-side primitive first (tiers 3-4, commitArm); streaming after it proves
out. Streaming additionally requires incremental snapshot serialization.
Ordering groups (parallel/sequential/reverse) are a deferred nicety.

STREAMING IS THE DEFAULT SSR POSTURE. Blocking the whole page on every async
boundary defeats @try's purpose; the router server entry streams by default and
blocking render is the explicit opt-out. Safe because streaming degrades
gracefully: a buffering proxy delivers one complete document whose inert
templates commit on parse — early paint is lost, correctness never.

Three-layer opt-in semantics (no configuration creep — structure and timing
decide):
1. Entry: streaming default; `render: 'blocking'`-style option opts out.
2. Boundary: an authored @pending arm IS the boundary's streaming declaration
   (it is the waiting UI). A @try without @pending (if the grammar permits one)
   HOLDS the stream — the structural deferStream equivalent.
3. Per-request: a first-flush deadline renders fast-settling boundaries inline
   (no pending flash, no template bytes); only boundaries still pending at
   flush time stream out of order. Latency decides, not configuration.

## D7. Navigation

The router routes CLIENT-SIDE: dispatchRouteUpdate -> renderCsr -> boundaries
settle via commitArm. The document.write/server-HTML-swap navigation
(2026-07-07, superseded) and its machinery — swap-pending flag, rendered-route
meta, before-document-swap teardown — are deleted when tier 4 lands. The Link
component owns SPA navigation; plain-anchor hash special-casing is removed
once component-in-row lands and apps can use Link everywhere.
