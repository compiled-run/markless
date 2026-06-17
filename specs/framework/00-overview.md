# Framework Overview

High-level product contract and index. Use this as the entry point before loading a narrower spec.

**Original title:** Arcade TSRX Framework — Design

**Date:** 2026-06-12
**Status:** Approved direction; production implementation started. See
`../state.md` for current worktree progress.
**Tagline:** A resumable UI framework for async-first apps.
**Package:** `arcade`

## Summary

A new JavaScript framework whose SSR output is fully resumable (Qwik-level:
zero app execution on load, closures lazy-loaded on first interaction) without
any author-facing markers (no `$`, no `.value`, no `track()`, no `&` lazy
destructuring). CSR remains a normal browser render mode: `render()` creates a
live runtime container from an app bundle and target element, without requiring
SSR payload scripts or the resumer. The framework achieves this split by
supporting exactly one authoring language: **TSRX** (https://tsrx.dev — `.tsrx`
files, `@{}` component blocks, first-class `@if`/`@for`, co-located `<style>`).
Because the framework owns the language via a TSRX codegen plugin, the compiler
sees every component, every state creation site, every closure, and every async
boundary structurally — which is what makes marker-free resumability, async
dataflow, and a plain-value state API tractable.

The central model is: UI structure is a tree-shaped graph, but state dependencies
are a general directed graph. Current web frameworks often force that general
graph through tree-shaped tools: provider ancestry, hook call order, component
subscriptions, rerender boundaries, and hydration boundaries. This framework
does the opposite: the dataflow graph is the boundary. Components project graph
nodes into DOM; events write back into graph nodes; async work derives graph
nodes from awaited data; resumability serializes graph state and edges rather
than re-entering component trees.

JSX/TSX is explicitly **not** supported.

## Goals

1. **Full SSR resumability with normal CSR.** In SSR, component bodies execute
   during initial render and never during browser resume. Initial render
   serializes state, the reactivity graph, and listener wiring into a resumable
   container; a tiny inline browser resumer wakes up only the code a user
   actually triggers. In CSR, `render(App, { target })` executes component
   bodies in the browser, creates a live runtime container, and must work without
   SSR payload scripts or the resumer.
2. **Zero markers.** No `$` suffixes, no `.value`, no `Tracked<T>` boxes, no
   special destructuring syntax, no reactive collection subclasses
   (`RippleArray`-style). The reactive surface is plain values and plain mutation.
3. **No VDOM, no re-renders.** Solid-style fine-grained architecture: templates
   compile to real DOM operations; each dynamic DOM update is its own
   subscription.
   "Signal" is an implementation detail of compiled output, never API vocabulary.
4. **TSRX-only.** State and reactivity are language features of `.tsrx` files,
   surfaced through compiler-rewritten imports from `arcade`, not a
   runtime library usable from arbitrary TS.
5. **First-class async.** Async dataflow is a compiler-tracked graph feature, not
   an effect/task/resource wrapper. Pending/error UI is expressed with TSRX
   boundaries, and async dependencies are serializable and resumable.

## Non-Goals

- TSX/JSX support, now or later.
- Reactivity in plain `.ts` files. Plain TS receives values via function calls,
  never live reactive references. (This is the boundary that lets the compiler
  guarantee the no-marker property.)
- Qwik-style serialization of arbitrary lexical scopes (see Capture Rule).

## Architecture Overview

Four implementation areas:

1. **Compiler** — first implemented in JS/TS on `@tsrx/core` as a TSRX codegen
   plugin (the framework is a TSRX compile target, alongside React/Solid/Vue
   targets). Responsible for: rewriting state reads and writes, compiling
   templates to DOM instructions, extracting closures into lazily-loadable
   symbols, splitting async derivations into key functions and run functions,
   compiling async boundaries, computing capture sets, and emitting diagnostics
   when the capture or async tracking rules are violated. A future OXC/native
   backend may replace parser/lowering internals only behind the same pass
   artifacts and behavior tests.
2. **Runtime** — a small fine-grained reactive core (graph state, object state,
   async node state, cancellation/versioning, DOM update helpers, CSR render
   entry, initial render entry, and browser resume entry). The in-memory graph
   shape is private and is not a VDOM. Never exposed as user vocabulary.
3. **Serialization and render/resume protocol** — CSR `render()` creates a live
   runtime container directly from the app bundle and target element. SSR
   initial render runs component bodies once, renders HTML, awaits demanded async
   nodes in v1 non-streaming mode, wraps the output in a resumable container, and
   serializes the resumability payload (state values, async snapshots,
   subscription graph, listener→symbol map) into compact private data scripts.
   The SSR output includes a tiny inline browser resumer scoped to that
   container. The resumer attaches container-scoped event listeners and
   visibility observers, then lazy-loads app symbols only on interaction,
   visibility, or another explicit trigger. No hydration pass, no component
   execution during browser resume.
4. **Build integration** — a Rolldown plugin base re-exported by
   `arcade/rolldown`, with framework adapters such as Vite consuming that base
   plugin. Extracted
   symbols become code-split entry points, and production builds emit a
   generated compact symbol resolver table with finalized chunk specifiers. Any
   manifest-like metadata is for adapters, preload graphs, diagnostics,
   devtools, or cached initial-render fragments; the default browser symbol
   loading path consumes the resolver table and payload data, not
   `arcade-manifest.json`.

Do not split the framework into separate "server" and "client" products or
packages. The authoring model is one unified render/resume model: CSR render,
initial render, and browser resume are environment-specific phases of the same
runtime, graph, and symbol protocol. Implementation entry points may be
environment-specific, but there is no standalone `server` package and no public
two-sided deployment model for app authors to manage.

Container vocabulary is shared across CSR and SSR:

- A **CSR container** is created live by `render(App, { target })`. It owns the
  root target, graph instance, event delegation scope, symbol resolver, shared
  state scope, and cleanup/unmount boundary. It does not require pre-existing
  special markup, `arcade/state`, `arcade/view`, or the resumer script. Component
  bodies execute because CSR must create the DOM and graph from an empty target.
- An **SSR resumable container** is emitted by `renderToString(App, options)`.
  It owns the rendered DOM boundary, container-scoped payload scripts, symbol
  resolver metadata, shared state scope IDs, and the inline resumer bootstrap.
  This is the microfrontend/island boundary that lets multiple independently
  rendered containers coexist on a page. Browser resume must not rerun component
  bodies because the DOM and graph payload already exist.

App authors should not normally call a browser `resume()` API. In SSR, the
resumer is part of the HTML returned by `renderToString()`. Low-level resume
helpers are internal adapter/test utilities until a concrete public use case
requires exposing them. A fully static SSR container with no browser triggers
should emit no resumer script.

Monorepo libraries are implementation boundaries first, not public API
guarantees. The repo may contain internal packages such as protocol, core,
runtime, serializer, compiler, Rolldown, Vite, and test utilities, but v1 should
expose only the main package and explicitly curated re-exports. `protocol` and
`compiler` may become independently consumable once implementation tests prove
their contracts; until then, do not document or rely on deep package APIs as
public framework surface.

The proof implementation lives under `poc/packages/*` and proof fixtures live
under `poc/fixtures/proofs/*`. That POC tree is executable evidence that the
design is possible, but it is not the production source tree. Real framework
implementation begins in root `packages/*` using the same boundaries.

Initial internal production package map:

- `packages/arcade` — public package for `arcade`; curated authoring, runtime,
  and adapter re-exports.
- `packages/core` — internal authoring API implementation used by `arcade`;
  compiler-rewritten framework APIs and public types.
- `packages/protocol` — private shared contracts: graph IDs, symbol IDs,
  payload schema types, manifest types, diagnostics, and protocol/version
  constants.
- `packages/runtime` — graph state, computed/async nodes, scheduler, DOM
  mutation journal, sync policy execution, DOM locator resolution, symbol
  resolver integration, CSR render, initial render, and browser resume.
- `packages/serializer` — tiered value serializer and compact payload
  encode/decode, talking to runtime through snapshot interfaces.
- `packages/compiler` — TSRX semantic graph, lowering passes, capture analysis,
  symbol extraction, artifact planning, and diagnostics.
- `packages/bundler` — Qwik-bundler-shaped build package containing the
  Rolldown-first plugin, virtual modules, symbol chunks, compact resolver table
  finalization, optional manifest/bundle-graph metadata, and Vite adapter
  dev/HMR/HTML integration.
- `packages/test-utils` — fixture harnesses, artifact assertions,
  serializer/resume helpers, browser helpers, and witness integration helpers.
- `packages/vitest-browser` — CSR-only Vitest browser-mode support for targeted
  real-browser DOM/runtime mechanics. It should provide framework-specific
  browser render helpers, cleanup, and Vitest browser `page` integration modeled
  after the CSR surface of `/Users/jacksm5pro/dev/open-source/vitest-browser-qwik`.
  It must not become the canonical SSR/resume proof harness.

There is no `packages/server`.

The repository/package-manager model is a pnpm workspace. The root
`package.json`, `pnpm-workspace.yaml`, and `pnpm-lock.yaml` own dependency
resolution and workspace package membership. Vite-plus remains the preferred
tooling surface, so pnpm scripts should be thin aliases for `vp pack`,
`vp test`, `vp check`, `vp fmt`, `vp lint`, and related vite-plus commands.

The build architecture is Rolldown-first, not Vite-first. The base Rolldown
plugin owns compiler transforms, virtual modules, emitted symbol chunks,
compact resolver table finalization, optional manifest metadata, diagnostics,
and browser/initial-render/library build modes. The Vite plugin is an adapter
that wraps the Rolldown plugin with
Vite-specific environment detection, dev-server transforms, HMR, HTML/dev-tag
injection, build orchestration, and public extension APIs. This mirrors the
`qwik-bundler` structure: a reusable `rolldown` entry point is the core, and
`vite` is one consumer of it.

Default production JavaScript chunks emitted by the framework build integration
use neutral bundler vocabulary: client chunks are written under
`build/chunk-[hash].js`, and server-side non-entry chunks use
`chunk-[hash].js`. The generated resolver table and any optional
manifest/bundle-graph metadata carry symbol meaning; production chunk filenames
should not expose compiler terms such as symbol kinds. The browser runtime must
not need `arcade-manifest.json` to recover that meaning.

Build scripts and production optimization must go through Rolldown or Vite.
Do not add standalone esbuild, terser, Rollup, SWC, webpack, Babel build
pipelines, or similar secondary transformers/minifiers. If Vite or Rolldown use
an internal tool as an implementation detail, that is owned by them; this
framework's build surface depends only on Vite/Rolldown APIs.

## Runtime And Build Portability

Core framework code is runtime-agnostic ESM. The compiler, runtime graph,
serializer, render/resume protocol, payload tools, and shared build
helpers must not require a specific JavaScript host as the execution environment.
Server runtimes, edge workers, and browser-hosted tooling should be able to run
the same framework semantics through thin host adapters.

The implementation rules are:

- no `node:*` imports, `fs`, `path`, `process`, `Buffer`, or `node:crypto` in
  shared framework packages
- file access, module resolution, environment variables, hashing, timers beyond
  standard globals, and dev-server integration are host capabilities injected by
  the build/runtime adapter
- prefer Web-standard APIs (`URL`, `URLSearchParams`, `TextEncoder`,
  `Uint8Array`, `ReadableStream`, `AbortController`, `crypto.subtle` when
  available) and portable libraries for gaps
- prefer runtime-agnostic path/URL helpers such as the unjs packages `pathe` and
  `ufo` over Node's `path` or `url` modules
- generated code uses standard ESM and `import()`; the symbol resolver receives
  already-normalized URLs/specifiers from build integration's finalized resolver
  table/bundle metadata rather than doing environment-specific path math at
  runtime or parsing `arcade-manifest.json` in browser startup
- Node/Vite/Rolldown-specific behavior lives only in adapter packages or clearly
  isolated integration modules, never in the semantic compiler/runtime core

This is a design constraint, not just packaging polish. If framework behavior
differs between supported hosts because core code depended on host-specific APIs,
that is a framework bug.

## Split Spec Index

- [TSRX Host Contract](./01-tsrx-host-contract.md)
- [Compiler Pipeline](./02-compiler-pipeline.md)
- [State Graph](./03-state-graph.md)
- [Events, Symbols, And Behaviors](./04-events-symbols-behaviors.md)
- [Resumability Payload](./05-resumability-payload.md)
- [Runtime Render/Resume](./06-runtime-resumer.md)
- [Diagnostics](./07-diagnostics.md)
- [Deferred Decisions](./08-deferred-decisions.md)
- [Compiler Module Split Plan](./09-compiler-module-split-plan.md)
- [Archived design thread](./archive/design-thread.md)

The split files are the implementation-facing specs. The archive preserves the design conversation as a single document for historical context.
