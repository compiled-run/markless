# Deferred Decisions

Known out-of-scope or later decisions. This file is not an implementation target list.

## Deferred Decisions

Deliberately out of scope for the first implementation plan, to be designed when
their prerequisites exist:

- Keeping imperative third-party state in sync after `onVisible` init (the
  `chart.update` problem), plus possible `onVisible` variants (idle trigger,
  `onHidden`).
- Async caching policy beyond "current dependency key", stale-while-revalidate
  UI, manual refresh/invalidation APIs, and prefetch policy.
- Writable `computed()` (optimistic state).
- Streaming SSR / out-of-order async boundary patching. The expected direction
  is documented below, but it remains out of scope for the first implementation
  plan.
- Server functions / RPC story. See "TSRX Submodule Host Boundary (Decision
  Draft)" below for the submodule-shaped slice of this decision.
- Scoped `<style>` blocks. See "Scoped Style Blocks (Decision Draft)" below.
- Devtools (graph visualization).
- Strict no-inline CSP mode for the resumer, including external bootstrap
  emission, hash/nonce automation beyond caller-provided `renderToString`
  nonces, and the tradeoff between extra requests and per-container
  specialization.
- OXC/Rust/native compiler backend or parser replacement. The first compiler
  implementation uses JS/TS with `@tsrx/core`; native migration comes only after
  the artifact contracts and behavior fixtures are proven.
- Standalone build/minify/transform stacks outside Rolldown or Vite. Do not add
  esbuild, terser, Rollup, SWC, webpack, Babel build pipelines, or similar tools
  as framework build dependencies unless this spec is deliberately reopened.

## Streaming SSR / Out-Of-Order Patching

Out-of-order streaming should extend the async boundary model instead of adding
a second authoring model. `@try` / `@pending` / `@catch` remains the semantic
async UI boundary. Streaming controls how pending, resolved, and rejected
boundary ranges are delivered; it does not expose streams to application source.

The expected author-facing coordination primitive is a compiler-known
`<Reveal>` host intrinsic:

```tsrx
<Reveal order="forwards" tail="pending">
  <ProfileSection />
  <InvoicesSection />
  <RecommendationsSection />
</Reveal>
```

`<Reveal>` is an initial-render runtime context, not a static cross-file
analysis feature. During initial render, compiled `@try` boundaries register
with the nearest active reveal context as their component bodies execute. The
renderer serializes the resulting group membership, order indexes, policy, async
boundary IDs, request versions, state deltas, view/wiring deltas, and DOM range
locators into the private render/resume protocol.

Reveal policy is scoped by nearest owner:

- `order="independent"` reveals each deferred boundary as soon as its current
  request version resolves.
- `order="forwards"` may start async work in parallel but reveals sibling
  boundaries in source/render registration order.
- `order="together"` reveals the group only when every member needed for the
  current pass is ready.
- `tail="pending" | "hidden" | "collapsed"` controls how unresolved later
  members appear while earlier members reveal.

Nested `<Reveal>` scopes own their inner boundaries and prevent those boundaries
from participating as separate members of an outer reveal group. A boundary
without `@pending` is blocking by default because there is no pending shell to
flush.

Native browser out-of-order HTML patching such as `<template for>` may become a
transport backend for emitted boundary segments when broadly available. It must
not become the framework source of truth. The source of truth remains the TSRX
semantic graph, async computed versions, reveal group records, state arena, and
view/wiring arena. Unsupported browsers and hosts can use a framework patch
transport or fall back to non-streaming initial render.

## Scoped Style Blocks (Decision Draft)

Status: awaiting owner decision. TSRX parses `<style>` blocks into CSS AST but
explicitly leaves scoping semantics to the host. Today the compiler drops
`<style>` content from rendered HTML and emits
`MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT`, so authors get a loud signal
instead of silent style loss. Accepting one option below moves the accepted
text into `01-tsrx-host-contract.md` and unlocks the first implementation
slice.

Non-negotiables that bind every option: CSS must ship without executing app
JavaScript (no-hydration model), shared packages stay runtime-agnostic ESM,
and stylesheet emission goes through the Rolldown/Vite CSS pipeline only.

- **Option A (recommended): compile-time scope class.** Each component with a
  `<style>` block gets a stable scope class derived from the build-hashed
  component identity (for example `mk-a1b2c3`). Every selector in the block is
  compiled to require the scope class (`.card` becomes `.card.mk-a1b2c3`), and
  every host element the component renders gains the scope class in emitted
  HTML (SSR string and CSR/direct paths alike). The compiled CSS is emitted as
  a virtual CSS module owned by the bundler so Vite/Rolldown handle bundling,
  dedupe, and delivery. Selectors that cannot be scope-compiled (for example
  `:global(...)`-style escapes, `@keyframes` name collisions) get focused
  diagnostics until they are specified.
- **Option B: attribute-based scoping.** Same compilation model but scoping
  through `[data-mk-a1b2c3]` attribute selectors instead of a class. Avoids
  colliding with author class semantics, costs slightly larger HTML and
  slightly slower selector matching; class merging logic is not needed but
  attribute stamping is.
- **Option C: runtime constructable stylesheets.** Rejected as primary: it
  requires JavaScript execution before styles apply, which breaks SSR-first
  no-hydration rendering.

First implementation slice once accepted: compiler collects the style block
into a `styleScope` artifact (scope id, compiled CSS text, selector
diagnostics), host elements gain the scope class in emitted HTML, and the
bundler emits the CSS through a virtual module — proven by a fixture test that
renders scoped HTML and emits the compiled stylesheet. Style composition
metadata (`style-composition` records across components) stays deferred.

## TSRX Submodule Host Boundary (Decision Draft)

Status: awaiting owner decision. TSRX parses `module server { ... }` blocks
and identifier-source imports (`import { loadData } from server;`), but this
host defines no boundary semantics. Today the constructs parse as plain
TypeScript namespaces with no splitting, no diagnostics, and no ledger entry —
the only fully untracked construct gap. Whatever is decided, the first slice
should make the current non-support loud.

- **Option A (recommended as the immediate step): fail-loud placeholder.**
  The compiler emits `MARKLESS_SUBMODULE_UNSUPPORTED` when a module contains a
  TSRX submodule block or identifier-source import, stating that server/client
  splitting is not implemented and code will run wherever the importing module
  runs. This is honest, small, and reversible; it does not choose the eventual
  semantics.
- **Option B: server-boundary contract.** `module server { }` contents never
  reach client chunks. Client-side references to server exports compile to
  async server-function calls through generated endpoints, with arguments and
  results crossing the serializer tiers, capture analysis extended to forbid
  non-serializable values at the boundary, and symbol-resolver-style codegen
  owning the endpoint wiring. This is the full "server functions / RPC story"
  and needs its own design pass (request identity, auth context, error
  routing, dev-server integration) before any code.
- **Option C: reject the construct.** Diagnose submodules as unsupported by
  this host permanently. Cheap, but forfeits a TSRX language feature the
  parser already ships.

Recommendation: accept Option A now (one diagnostic slice, TDD-able), record
Option B as the target semantics to be designed under the existing "server
functions / RPC" deferred decision, and revisit C only if B proves unwanted.

## Build Order (high level)

1. Reactive runtime core (graph + object state + async node status/versioning) —
   pure TS, testable standalone.
2. Compiler in JS/TS on `@tsrx/core`: pass-boundary artifacts for TSRX semantic
   graph collection, state rewriting, template/view lowering, and diagnostics
   before any end-to-end demo path.
3. Async computed lowering + `@try`/`@pending`/`@catch` boundary lowering.
4. Closure extraction + capture analysis + diagnostics.
5. Unified render/resume runtime + serialization; e2e resumability harness.
