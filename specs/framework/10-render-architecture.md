# Render Architecture

CSR render, SSR initial render, browser resume, preload planning, and build
integration must present one component artifact model while keeping their
runtime phases separate. This file owns the public render shape and the
build/runtime contract that makes it work.

The key rule is simple: a `.tsrx` component module exports a compiled component
artifact. The core public architecture is artifact-first: app code passes that
artifact to framework render functions. App code does not write separate
client-entry, server-entry, render-shell, or resume-entry modules to make one
component work.

## Public Module Shape

For a single-root `.tsrx` app module, the normal architecture is:

```ts
import App from './App.tsrx';
import { render } from '@markless/core';

render(App, { target: document.getElementById('app')! });
```

```ts
import App from './App.tsrx';
import { renderToString } from '@markless/core';

const html = renderToString(App);
```

`App` is the compiled TSRX artifact, not a browser component constructor that
will be re-executed during resume. Framework render functions own the
environment-specific orchestration around that artifact.
App render code imports `render()` and `renderToString()` from `"@markless/core"`, not
from `.tsrx` modules, `@markless/core`, or runtime deep imports.

When a `.tsrx` file exports multiple top-level components and no unambiguous app
root can be selected, app code must pass the intended compiled artifact to the
framework renderer explicitly. The compiler must not emit generic render helpers
that silently choose one.

## Forbidden App Ceremony

The following are not valid app-authored requirements for the normal render
model:

- `entry-client.ts` for SSR resume
- `entry-server.ts` wrappers whose only purpose is calling `renderToString`
- `render-shell.ts` wrappers around the app module
- `?resume` imports in user config or app code
- browser `resume()` calls in app code
- Vite `ssrLoadModule` usage in app-authored render logic
- manually imported browser resume modules or scripts
- manifest parsing in app code

Host frameworks and tests may have adapters, dev servers, or preview handlers,
but those adapters call the framework renderer with the compiled `.tsrx`
artifact. They do not reintroduce a second app authoring model.

## CSR Architecture

CSR starts from an empty target. `render(App, { target })` executes the
component body in the browser because CSR must create the DOM and live graph
from scratch.

The CSR renderer owns:

- creating the initial real DOM from the compiled template
- creating the live graph state for that component tree
- attaching event delegation or direct event listeners according to the compiled
  CSR plan
- resolving lazy symbols through the generated symbol resolver
- subscribing graph-backed DOM updates
- consuming artifact preload metadata through a browser preload sink such as
  `document.head`
- returning the runtime container for cleanup or tests when needed

CSR must not depend on SSR payload scripts, a resumable container boundary,
`markless/state`, `markless/view`, or the inline SSR resumer. A CSR app must work
when the HTML document contains only the target element and the client bundle.

CSR may share runtime primitives with SSR resume after setup: graph state,
symbol resolution, event dispatch, scheduler, DOM journal, element locators, and
cleanup. It must not share the browser resume shortcut that skips component
execution, because there is no server-rendered DOM or serialized graph to
resume.

## SSR Architecture

SSR starts by executing component bodies on the server during initial render.
`renderToString(App)` returns a complete resumable container or a structured
result that includes that container. Browser startup must not execute component
bodies again.

The SSR renderer owns:

- running the compiled initial render
- composing HTML for the whole component tree
- composing one container-scoped state payload for the whole component tree
- composing one container-scoped view payload for the whole component tree
- including event records for host events in child components as well as the
  root component
- including DOM update records for graph-backed text, attribute, property,
  class, branch, repeat, async-boundary, and behavior updates across the whole
  tree
- including compact symbol resolver metadata that maps every event, behavior,
  DOM update, async runner, and sync-policy symbol to finalized browser-loadable
  module rows
- consuming artifact preload metadata to emit or return preload tags for the host
  shell
- injecting the inline resumer when the payload contains browser triggers
- omitting the inline resumer for fully static SSR output

SSR output is not allowed to rely on browser-side HTML parsing, marker comments
invented after the TSRX view plan, or a client component render pass to recover
missing structure. If the compiler needs anchors or locators for structural
control flow, they must be part of the locator/payload plan and proved by
fixtures. They must not become an ad hoc VDOM or render-output reconciliation
layer.

## Fragment Root Ownership (accepted 2026-07-02)

Fragment-rooted components have no single root element, so the render range
is owned by the environment container: in SSR the resumable container div, in
CSR the mount target. `render(App, { target })` mounts the compiled document
fragment first (DOM expands it into the target), then creates the runtime
with the target as the container root; `CsrRenderContainer.root` therefore
means the container root, which is the mount target for fragment-rooted
components and the created root element otherwise. Fragment-relative
dom-order locators shift +1 when the target joins the walk, mirroring the
SSR container offset. Only fragments whose top-level children are all plain
host elements render; dynamic fragment shapes await the comment-anchor work.

## Browser Resume Architecture

Browser resume is automatic for an SSR resumable container. The inline resumer
is emitted by `renderToString(App)` and runs when the HTML is executed in the
browser.

On startup, the inline resumer may:

- locate its nearest resumable container
- read compact container payload scripts
- materialize DOM locator side tables
- install container-scoped delegated listeners or observers for features present
  in the payload
- keep constant-size metadata needed to resolve the first trigger

On startup, the inline resumer must not:

- import app chunks
- run component bodies
- run event handlers
- run behavior symbols
- run async runner symbols
- parse build metadata
- scan event attributes
- plan symbols from DOM
- diff or reconcile DOM
- decode unused feature blocks

On first interaction or another explicit trigger, the resumer matches the real
DOM target against the container view payload, resolves ordered symbol rows, and
imports the needed symbols through finalized module URLs. The resolver owns the
dynamic import. Runtime imports may use `import(/* @vite-ignore */ url)` when the
specifier comes from finalized build output.

Event dispatch after resume is graph-first. The handler writes graph state;
the scheduler invalidates graph subscribers; DOM update symbols patch concrete
DOM nodes. Nothing re-renders, and no component body executes in the browser
resume path.

## Build Architecture

The build integration must create every browser-loadable symbol needed by SSR
without requiring an app-authored client entry. A `.tsrx` artifact used by
`renderToString(App)` is also a source of browser symbol chunks. That
relationship is owned by the framework plugin.

The Vite/Rolldown integration must:

- compile the SSR `.tsrx` entry for server initial render
- compile or otherwise register the same `.tsrx` graph as a browser symbol
  source
- include imported child `.tsrx` components in the browser symbol graph when
  their handlers, behaviors, DOM updates, async runners, or sync policies are
  reachable from the SSR container
- emit finalized browser chunks for those symbols
- rewrite resolver tables to browser-loadable chunk specifiers before the SSR
  renderer embeds or references them
- keep this browser symbol build separate from a CSR app render entry unless the
  app actually requested CSR
- avoid pulling the full CSR render runtime into event-only SSR output

The framework may use internal virtual modules, hidden build roots, or build
environment coordination to satisfy this contract. Those are implementation
details. They must not appear in app code or app config as `entry-client`,
`?resume`, or manual resume-module imports.

The default browser resume path consumes container payload data and generated
resolver metadata. It must not require build metadata at browser startup.
Bundle graphs remain build/test/preload/devtools artifacts.

## Preload Architecture

The compiler/bundler produces preload metadata for the compiled `.tsrx` artifact
from the view graph, event records, symbol graph, async runners, and finalized
bundler chunk URLs. That metadata is data for framework renderers. It is not
app-authored code, and it is not an SSR payload.

The CSR renderer may use artifact preload metadata to warm lazy chunks that are
outside the initial CSR startup closure. It inserts `<link rel="modulepreload">`
tags into `document.head`, calls a host-provided preload sink, or skips preload
hints when the host does not support them. CSR preloading must not require SSR
payload scripts, a resumable container, the inline resumer, or a separate
client entry.

The SSR renderer may use artifact preload metadata while producing HTML. It can
emit `<link rel="modulepreload">` tags before the resumable container, return a
head/preload fragment alongside the HTML, or hand preload entries to a host
adapter that owns the final document shell.

Preloading never adds `<script>` tags and never executes app modules. It only
warms the browser module cache for later `import()` calls. App code still runs
only through CSR render, the inline SSR resumer, or lazy symbol resolution.

Preload support must be feature-paid. Static SSR must not grow a browser startup
script just because preload metadata exists, event-only SSR must not pull the
full CSR runtime into startup code to produce preload hints, and CSR must not
eagerly preload every lazy symbol when the startup chunk already contains the
needed code.

## Compiled Artifact Contract

The transformed `.tsrx` app module exports a compiled app artifact for framework
renderers. The artifact is the public render handle. It is not the authored
component function, and it is not a VDOM root.

The artifact must provide renderer-consumable metadata for:

- the selected root component
- the CSR initial-render plan
- the SSR initial-render plan
- graph state factories and initial serializable state
- view locators and DOM update subscriptions
- event, behavior, async runner, and sync-policy symbol records
- a generated symbol resolver table whose rows are finalized by the bundler
- artifact preload metadata
- imported child `.tsrx` component artifacts

The compiler may preserve named authored component exports for same-module
composition, diagnostics, tests, or internal build wiring. App render code must
still pass the compiled artifact to `render()` or `renderToString()`.

Renderer APIs choose the phase:

- CSR `render(App, { target })` consumes the CSR plan and executes component
  bodies because it must create DOM and graph state from an empty target.
- SSR `renderToString(App, options)` consumes the SSR plan and executes
  component bodies on the server once to produce HTML and payload data.
- Browser resume consumes the SSR payload and resolver metadata already emitted
  by `renderToString()`. It does not consume the CSR plan and does not execute
  component bodies.

## Component Tree Composition

Component composition is part of SSR payload planning. A parent rendering a child
component does not mean the child owns a separate resumable island by default.
The normal result is one container with one composed payload.

The compiler/bundler pipeline must preserve, compose, and offset child artifacts:

- host locators from children must resolve inside the final rendered DOM
- child event records must point at the composed host locators
- child graph node ids must be offset by the child's instance path, so two
  instances of one component own separate state, computed, element, and prop
  nodes (see `03-state-graph.md`, "Graph node identity")
- child DOM update records must subscribe to the correct graph references
- prop-backed child reads must connect to parent graph values or serialized prop
  cells without inventing a component rerender path
- callback props must lower to graph writes or lazy symbols that can update the
  parent graph without re-executing the parent component
- child symbol IDs must remain stable and resolvable after build chunking

This composition happens through compiler artifacts and resolver metadata, not
cross-file source-string analysis. The compiler may transform each `.tsrx`
module independently, but the build pipeline is responsible for joining module
artifacts into the app container graph.

### AST-Owned Composition

Component edges come from the TSRX AST, not source-string checks. A parent
element such as `<Player currentSong={currentSong} onNext={...} />` is a
`JSXElement` with a component-name opening element and `JSXAttribute` prop
records. A conditional such as `@if (isPlaying) { ... }` is a `JSXIfExpression`,
and a keyed list is a `JSXForExpression`. The semantic graph pass owns reading
those nodes and producing typed component-edge, branch, loop, prop, event, and
locator artifacts.

Downstream passes must consume those artifacts. They must not rediscover
component structure by scanning generated JavaScript, matching class names,
checking child indexes from one fixture, parsing HTML fragments, or searching for
known text. Source strings may be retained for emitted symbol modules,
diagnostics, and sourcemaps, but framework behavior decisions must come from AST
nodes and typed artifacts.

Each component edge records:

- the parent component scope and child component reference
- the TSRX source span for diagnostics
- prop bindings and whether each prop is a graph reference, serializable value,
  callback symbol, or opaque unsupported value
- nested children/projection metadata when the child receives `children`
- branch and keyed-loop scope ancestry
- the local DOM locator root for the child instance
- symbol IDs reachable through the child instance

### Multi-File App Composition

A music-player-shaped app has `App.tsrx` importing `Nav`, `Song`, `Player`, and
`Library`, with `Song` importing `YouTubePlayer` and `Library` importing
`LibrarySong`. That shape must compile as one composed app artifact for CSR and
SSR.

The build pipeline may compile each `.tsrx` module independently, but the app
artifact composition step must join them through import and component-edge
artifacts:

- parent graph state such as `currentSong`, `isPlaying`, and
  `playerCommandVersion` remains owned by the parent scope where `state()` was
  created
- child reads of those props subscribe to the parent graph references rather than
  copying values into a child rerender model
- child event props such as `onNext` or `onSelect` lower to lazy symbols that can
  write the parent graph without re-executing the parent or child component
- child local state, if any, receives identity from the component edge plus its
  branch or keyed-loop ancestry
- DOM locators are composed into one container-local locator space for SSR
  resume and one live container locator space for CSR
- symbol IDs remain stable after bundler chunking and can be resolved from the
  composed artifact without an app-authored client entry

Conditional and loop identity must follow the TSRX host contract:

- `@if` creates branch-local graph and locator scopes; state created inside an
  inactive branch is disposed with that branch
- keyed `@for` creates item-local graph and locator scopes based on the authored
  key expression
- unkeyed interactive or stateful loops are diagnostics unless the user
  explicitly keys by position
- fragments and statement containers follow TSRX's one-output structural rule
  instead of being normalized through an HTML parser

### Imperative Browser Resources

Browser-only resources such as a YouTube iframe controller, timers,
`MutationObserver`, media APIs, or third-party widgets are not serializable graph
state. SSR should emit inert host markup and serialized graph/view data. Browser
setup belongs in host element behavior, for example `attach={...}`, or in a host
adapter that is explicitly outside the graph payload.

The preferred framework path is:

- CSR runs the behavior after the host element exists in the freshly rendered DOM
- SSR emits the behavior record and imports/runs the behavior symbol only in the
  browser when the resume protocol activates that behavior
- behavior inputs come from graph-backed attributes/properties or serialized
  constants
- behavior cleanup runs when the host node is removed by a branch, loop, or
  container disposal
- behavior code may write graph state through explicit event/callback paths, but
  it must not require component re-execution

Manual post-render scripts in playgrounds are allowed only as temporary adapter
code while the behavior path is being built. They must not become the framework
architecture for SSR interactivity.

### Pass Ownership

The production compiler should add or use pass-owned artifacts for this
architecture instead of growing `transform.ts` or a single broad visitor:

- `tsrx-semantic-graph`: discovers component declarations, component edges,
  child/projection use, control-flow nodes, host nodes, event attributes, state
  creation sites, reads, writes, and source spans from the TSRX AST
- `state-lowering`: turns graph reads and writes, including callback-prop writes,
  into graph access artifacts
- `payload-arena`: assigns graph cells, branch scopes, keyed-loop scopes, and
  locator ownership for the composed app
- `symbol-resolver`: assigns stable symbol IDs for events, behaviors, DOM
  updates, async runners, and sync policies
- `public-render-plan`: plans CSR DOM creation and graph subscriptions from
  compiler-proven artifacts
- `protocol-state` and `protocol-view`: emit serialized SSR payload data for the
  composed app container
- `public-render-module`: emits the compiled app artifact consumed by
  `render()` and `renderToString()`
- `symbol-modules` and `symbol-resolver-module`: emit lazy symbol chunks and the
  finalized resolver table

Any pass that needs data from another module consumes an artifact produced for
that module. Cross-file source-string analysis is not part of the architecture.

## Size Contract

SSR event-only output has a strict size budget. Adding browser-loadable symbols
for SSR must not mean shipping the CSR runtime at startup.

Required production targets:

- static SSR with no browser triggers: no inline resumer
- event-only SSR startup: 300-500 B gzip target, 700 B gzip hard budget for the
  specialized inline resumer
- event-only SSR startup: no full CSR render runtime in the entry script
- first interaction: load only the chunk closure needed for the triggered symbol
  and its static dependencies
- additional feature blocks such as sync policy, visibility, behavior cleanup,
  async boundary demand, or DOM journal support are paid only by containers that
  need them

Tests may set fixture-specific budgets, but those budgets must guard against
regressions instead of being raised to accommodate architecture drift.

## Verification Requirements

Render architecture work is not complete until the following are proved by
focused tests and fixture builds:

1. CSR app code can import a compiled artifact from `./App.tsrx`, pass it to
   `render` from `@markless/core`, and run without SSR payloads or a resumer.
2. SSR app code can import a compiled artifact from `./App.tsrx`, pass it to
   `renderToString` from `@markless/core`, and produce a resumable container
   without app-authored client/server entry wrappers.
3. SSR initial HTML contains composed state/view payloads for root and child
   components.
4. SSR browser startup executes the inline resumer but does not execute app
   chunks, component bodies, handlers, behavior symbols, or async runners.
5. The first interaction imports only the expected lazy symbol chunk closure and
   updates concrete DOM through graph subscribers.
6. Child component events work after SSR resume without hydration or component
   re-execution.
7. Browser symbol chunks for an SSR `.tsrx` entry are produced by framework build
   integration, not an app-authored client entry.
8. CSR and SSR preload behavior are both driven by artifact preload metadata,
   but CSR does not consume SSR payloads or SSR-specific output. Tests must
   prove the expected browser links or returned head fragments without
   app-authored preload wrappers.
9. Bundle-size tests prove that event-only SSR does not include full CSR runtime
   at startup.
10. The same artifact-first render shape works in dev, build, and preview.
11. Forbidden app ceremony remains absent from fixtures and playgrounds.
12. A multi-file music-player-shaped fixture proves parent state passed through
    child props, child event callbacks that write parent state, nested component
    DOM updates, `@if` branch updates, and behavior host records across CSR, SSR
    initial render, and browser resume.
13. Compiler tests prove component-edge and control-flow artifacts from the TSRX
    AST, including alternate-shaped fixtures that change names, classes, child
    ordering, and component file boundaries without changing behavior.

Witness-backed browser tests are required for claims about SSR resume behavior.
Unit tests, compile snapshots, or smoke tests that only inspect initial HTML are
useful but insufficient to claim interactive SSR works.
