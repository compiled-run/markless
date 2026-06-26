# Implementation State

This file tracks implementation progress in the current worktree. It is a
progress ledger, not a framework behavior contract. The source of truth remains
`specs/framework-design.md` and the split specs under `specs/framework/`.

Use this file for status questions such as "what has been completed?" or "what
is still missing?" Do not use it to introduce new framework semantics. If this
ledger and a split spec disagree, fix the ledger or reopen the owning split
spec deliberately.

Status entries have the scope named by their section. A completed spec or
tooling entry means the current worktree contains the documented file/config and
the relevant formatting, inventory, or build evidence. A completed
implementation entry means the current worktree contains implementation and
focused coverage for that slice. None of these entries imply the broader feature
family is complete unless the remaining-work section says so explicitly.

## Full Spec Implementation Distance

The current worktree is in the early production-implementation phase. It has
real package scaffolding, pass-owned compiler modules, compiler artifacts,
focused diagnostics, runtime graph pieces, payload helpers, and initial adapter
surfaces. It is not close to full framework completion yet because the vertical
render/resume contract is not proven end to end.

Completed slices are concentrated in:

- workspace/package scaffolding and vite-plus tooling
- compiler module ownership and pass graph validation
- semantic graph collection for early state, event, alias, async, shared
  definition/instance, and capture inputs
- focused state-lowering diagnostics and graph write forms including assignment,
  update, collection calls, and static property deletes
- payload arena and symbol resolver planning artifacts
- template DOM update target metadata through payload/protocol and a runtime helper
  that maps those targets to structural DOM journal entries
- compiler-planned public CSR render artifacts for supported keyed repeats, including cached generated row templates, direct empty-repeat clears, and early-exit DOM-order locator lookup; quick JFB evidence now improves CPU geomean to 0.78x of the prior retained sample, `03_update10th1k_x16` moved 43.3ms -> 26.5ms, `05_swap1k` moved 45.7ms -> 26.6ms, rebuild-ci size is 13,146 raw / 4,626 compressed, and generated symbol-cache, same-key prepass, direct Map key deletion, direct item/DOM path emission, row-map replacement on clear, and first-render class-scan skip alternatives were rejected after measurement
- runtime graph scheduling, awaitable active flushes, invalidation,
  collection-method calls, and partial resume wiring
- pure-value serializer support for identity/cycles and the accepted built-in
  value set
- a CSR-only `packages/vitest-browser` package with a pure `render()` helper,
  cleanup/unmount handling, `asFragment()` support, optional Vitest browser page
  registration, root vite-plus pack entries, and focused package tests against a
  DOM-like host; this is package/helper evidence, not yet real browser-mode
  timing coverage
- a POC event-only inline resumer under
  `poc/fixtures/proofs/resumer-script` proving an already-rendered container can
  ship compact `arcade/view` event data, install one delegated listener, execute
  no app code before interaction, import exactly one lazy symbol on click, update
  DOM/state, and stay under the 700 B gzip event-only budget
- early public package re-exports and Rolldown/Vite adapter shells, including
  virtual module exposure for current simple event-handler update symbols,
  DOM update symbol modules, and transform
  manifests, a unit-tested in-memory manifest hook, an opt-in build manifest
  asset hook, a unit-tested compact
  symbol-table resolver module, a fixture-backed Vite library build, and a
  direct Rolldown build that load the generated payload, resolver, manifest, and
  current generated symbol virtual modules while recording bundle-derived chunk
  filenames and final emitted chunk specifiers in the generated resolver's
  compact exported symbol table for those current generated symbols; the
  generated resolver no longer emits an app-sized `switch (id)` path, default
  `arcade-manifest.json` emission is removed, and callers must opt in with
  `emitManifestJson` when they need the full JSON metadata asset;
  repeated transforms for the same `.tsrx` module now drop stale generated
  virtual modules before registering fresh artifacts, and the Vite adapter's
  structural `configureServer` / `handleHotUpdate` hooks invalidate generated
  virtual module graph nodes for changed `.tsrx` files and emit a custom
  dev-server update payload listing the changed module plus generated virtual
  module IDs, including server-originated hot updates routed through the
  configured Vite client environment name; `transformIndexHtml` injects an inert
  dev-only marker tag and a
  requestable virtual dev-client module in Vite dev HTML contexts, and a real
  Vite dev-server fixture proves that HTML transform, the virtual client request,
  and a `.tsrx` source transform run through Vite; that client listens for the
  custom update payload before redispatching it as a cancelable browser
  `CustomEvent`, and if no consumer prevents default it asks Vite HMR to
  invalidate the client module; the Vite adapter also defaults app builds to
  `build.modulePreload = false` so the framework bundle-graph/resolver-table path owns
  preload decisions; package-local Witness boxes under `packages/bundler/boxes`
  now run the Vite dev-server pipeline for the `vite-csr` fixture, edit a
  `.tsrx` file, record the `arcade:update` custom hot payload for the
  client environment without a Vite update payload, prove a real browser page
  receives the cancelable custom event without navigating, and prove the CSR
  production build emits `build/bundle-graph.json`, omits default
  `arcade-manifest.json`, and emits generated event-handler/DOM-update lazy chunks
  without leaking dev-HMR
  client strings; the CSR production build is also served through Vite preview
  and proves client-created DOM can load the generated payload/resolver/symbol
  pipeline for a counter click with no console errors or failed requests; a
  package-local SSR build Witness box proves the Vite/Rolldown build emits both
  client and `ssr` environments and that the built server entry contains the
  counter DOM plus canonical `arcade/state` and `arcade/view` payload scripts; a
  package-local SSR preview Witness box runs the fixture's Vite app-build path,
  starts Vite preview, verifies the preview response contains server-produced
  counter DOM plus canonical payload scripts, and proves the browser entry
  resumes that DOM for a `0` to `1` counter update without box-side HTML
  rewriting; the vite-plus fixture now has a real app entry and package-local
  Witness preview receipt proving a vite-plus config can build the
  bundle graph, omit default `arcade-manifest.json`, and serve the browser page
  through Vite preview;
  `buildStart` clears accumulated transform manifests and generated virtual
  modules before a new build/dev cycle

The critical path to "full spec implementation" still requires:

- template/view lowering and final emit that consume the current artifacts
- TSRX control-flow identity metadata for keyed `@for` lists, branch-local
  `@if`/`@switch` scopes, unkeyed stateful-loop diagnostics, branch/list locator
  streams, and disposal behavior
- children/projection metadata and diagnostics, including opaque `children`
  projection records, projection disposal behavior, and React-style child
  inspection/manipulation diagnostics
- dynamic tag/component and scoped-style host semantics, including dynamic
  `<{expr}>` lowering, host/component ownership decisions, style scoping, style
  composition metadata, and diagnostics for unsupported dynamic cases
- authored template-comment and statement-container lexical-scope host metadata,
  including comment-aware locator planning so generated async anchors are not
  confused with authored comments
- broaden the early CSR `render(App, { target })` runtime entry beyond the
  current direct public-render fast path for supported static/keyed-repeat
  shapes into a complete browser render path that executes general generated
  component/render artifacts, creates a full live container, and proves browser
  event/DOM behavior without requiring `arcade/state`, `arcade/view`, or the
  resumer script
- broaden the early SSR `renderToString(App, options)` runtime entry beyond the
  current package-level payload/resumer shell so it executes generated compiler
  render artifacts, awaits demanded async work, serializes real
  graph/view/symbol/async snapshots into container-scoped payloads, generates
  production-sized feature-sliced inline resumers for interactive containers,
  and consumes canonical payload scripts as data rather than treating payload
  rendering as the whole render pipeline
- browser resume that performs concrete DOM replacement/mutation behavior for
  all planned binding and async-boundary cases
- broaden the CSR-only `packages/vitest-browser` helper from its current
  DOM-like package tests into targeted Vitest browser-mode runtime DOM mechanics
  where SSR/initial-render output is not under test, including event timing, DOM
  journal application, `IntersectionObserver`, element handle lookup, and
  microtask behavior
- full `onVisible` visibility-event support beyond the current host-agnostic
  observer hook and structural global `IntersectionObserver` adapter coverage,
  including current value read semantics, generated-build integration, real
  browser observer timing, and cleanup on real host removal
- lazy `element()` handle materialization for browser symbols, including
  handle-id/name lookup, browser current-DOM resolution, initial-render absence,
  and real browser removed-locator `undefined` semantics
- complete generated symbol resolver integration beyond the current compact
  table proof for generated DOM-update and simple event-handler update chunks:
  behavior build chunks, build-integrated async-runner chunks, broader event
  write forms, generated exports, and resolver tables derived from final build
  output for all symbol kinds rather than fixture-supplied symbol tables
- `shared()` support beyond the current same-module semantic definition/instance
  records and authored API type surface, including cross-module definition
  identity, request/container/page graph-context resolution,
  dependency/cycle diagnostics, payload records, and cross-runtime patch behavior
- broader build-pipeline proof beyond the current direct Rolldown, Vite library
  build, repeated-transform artifact cleanup, build-start cleanup, structural
  hot-update invalidation/custom-payload/dev-client fixtures, one Vite
  dev-server transform fixture, package-local Witness dev/browser HMR receipts,
  one CSR production-build bundle-graph/no-default-manifest/no-dev-HMR-leakage receipt,
  one CSR preview client-click receipt, one SSR built-server-entry build
  receipt, one SSR built-server-entry preview browser resume-click receipt, and
  one vite-plus build/preview receipt,
  including real DOM hot replacement beyond the fixture's custom-event consumer,
  production SSR serving beyond the current fixture host,
  behavior/build-integrated async-runner chunks,
  broader non-binding symbol support beyond simple event-handler update chunks,
  and final resolver table handoff coverage beyond the current generated build
  fixture paths
- component/browser and resumability end-to-end tests proving no component body
  execution on browser resume
- broad diagnostic coverage for unsupported state, capture, async, event, and
  serializer cases beyond the current package/artifact-level diagnostics

In practical terms, the project has proven several important compiler/runtime
subcontracts, but the product-level invariant is still unproven until the
initial-render -> serialized payload -> browser-resume -> lazy-symbol interaction
path is covered by fixtures and browser tests.

## Current Snapshot

- The split framework spec index exists in `specs/framework-design.md`, with
  detailed ownership files under `specs/framework/`.
- The pnpm/vite-plus workspace scaffolding exists through root `package.json`,
  `pnpm-workspace.yaml`, `pnpm-lock.yaml`, and `vite.config.ts`.
- Root scripts are thin vite-plus aliases. The current `vite.config.ts` uses one
  flat pack entry map for `arcade`, runtime, serializer, compiler, bundler, and
  `vitest-browser` entries, and the Node test project includes package tests
  plus top-level script tests. It does not yet model package-local publish
  output or browser/witness test projects.
- Production framework package folders currently exist for `arcade`, `runtime`,
  `serializer`, `compiler`, `bundler`, `typescript-plugin`, and
  `vitest-browser`.
- There is no production `packages/core`, `packages/protocol`,
  `packages/test-utils`, or `packages/server` manifest. Authoring APIs live in
  `packages/arcade`, protocol/payload contracts live in `packages/serializer`,
  and short repo-only helpers live under top-level `scripts/test-utils` or
  package-local test support.
- The root workspace includes `demos/*`; the previous top-level
  `benchmarks/js-framework-benchmark` fixture now lives under
  `demos/js-framework-benchmark`, and the music-player CSR/SSR playgrounds now
  live under `demos/music-player` and `demos/music-player-ssr`.
- The current package inventory has package manifests for those seven framework
  package folders, the TypeScript plugin package, the two music-player demos,
  and the existing fixture packages.
- The current split-spec inventory has `00` through `10` under
  `specs/framework/`.
- `packages/compiler` has the initial production pass-boundary layout with
  shared artifact/diagnostic modules, AST/source helpers, graph-path helpers, a
  pass registry, pass graph validation, a compile orchestrator, pass-owned
  modules, semantic collector modules, and pass-level tests.
- `packages/compiler/src/index.ts` is a curated export surface rather than the
  home for pass implementation logic.
- The compiler module split plan is documented in
  `specs/framework/09-compiler-module-split-plan.md`.

## Evidence Anchors

Use these anchors when auditing whether a status entry still reflects the
current worktree. They are evidence pointers only; behavior requirements remain
in the split specs.

- Workspace/tooling shape: `package.json`, `pnpm-workspace.yaml`,
  `pnpm-lock.yaml`, and `vite.config.ts`.
- Compiler pass boundaries: `packages/compiler/src/index.ts`,
  `packages/compiler/src/compile-module.ts`,
  `packages/compiler/src/pass-graph.ts`,
  `packages/compiler/src/pass-registry.ts`, `packages/compiler/src/artifacts.ts`,
  `packages/compiler/src/diagnostics.ts`, `packages/compiler/src/ast/*`,
  `packages/compiler/src/artifact-helpers/*`,
  `packages/compiler/src/passes/*`, and `packages/compiler/test/*`.
- Semantic collector split: `packages/compiler/src/passes/semantic-graph/*` and
  the focused semantic collector tests under `packages/compiler/test/`.
- Runtime payload/resume boundaries: `packages/runtime/src/index.ts`,
  `packages/runtime/src/dom-journal.ts`, `packages/runtime/src/graph.ts`,
  `packages/runtime/src/payload.ts`, `packages/runtime/src/resume.ts`, and
  `packages/runtime/test/*`.
- Resumer POC boundary: `poc/fixtures/proofs/resumer-script/README.md`,
  `poc/fixtures/proofs/resumer-script/src/resumer-source.mjs`,
  `poc/fixtures/proofs/resumer-script/src/size-report.mjs`,
  `poc/fixtures/proofs/resumer-script/src/verify.mjs`,
  `poc/fixtures/proofs/resumer-script/browser/index.html`, and
  `poc/fixtures/proofs/resumer-script/resumer-script.box.ts`.
- Serializer boundaries: `packages/serializer/src/index.ts`,
  `packages/serializer/src/protocol.ts`,
  `packages/serializer/src/value.ts`,
  `packages/serializer/src/protocol-state.ts`,
  `packages/serializer/src/payload-scripts.ts`, and
  `packages/serializer/test/*`.
- Authoring API and protocol/test utility surfaces:
  `packages/arcade/src/framework-api.ts`,
  `packages/arcade/test/framework-api.test.ts`,
  `packages/serializer/src/protocol.ts`,
  `packages/serializer/test/protocol.test.ts`,
  `scripts/test-utils/payload.ts`, `scripts/test-utils/payload.test.ts`, and
  `scripts/benchmarks/jsfb-baseline.test.ts`.
- Curated public surface and build adapters: `packages/arcade/src/index.ts`,
  `packages/arcade/src/vite.ts`, `packages/arcade/src/rolldown.ts`,
  `packages/bundler/src/rolldown.ts`, `packages/bundler/src/vite/index.ts`,
  and their package tests.

## Completed Work Recorded In This Tree

### Workspace And Specs

- The split framework spec index exists in `specs/framework-design.md`.
- `specs/framework-design.md` explicitly points to this progress ledger.
- The production compiler split target is documented in
  `specs/framework/09-compiler-module-split-plan.md`.
- Implementation-facing split specs use `tsrx` code fences for TSRX examples;
  the archived design thread remains historical and is not normalized as current
  contract text.
- Current-contract split specs prefer `initial render`, `browser resume`, and
  `render/resume` terminology over generic SSR/server phrasing, except where a
  deferred topic is explicitly named as Streaming SSR.
- The deferred high-level build order now points compiler work at pass-boundary
  artifacts before any end-to-end demo path, matching the implementation
  sequencing guardrail.
- Deferred native-compiler and compiler-substrate language now say the first
  compiler implementation uses JS/TS on `@tsrx/core`, matching the
  production-started status without reopening OXC/native work.
- Diagnostic examples use implemented stable codes and docs URL shapes such as
  `ARCADE_CAPTURE_UNSUPPORTED_VALUE` and `https://arcadejs.com/errors/...`
  instead of placeholder diagnostic names or domains.
- The diagnostics split spec includes the diagnostic phases currently appearing
  in package source/tests: structured compiler artifacts use `semantic-graph`,
  `sync-policy`, `state-lowering`, and `capture-analysis`; serializer value
  results use `serialization`; and the generated symbol resolver's unknown
  symbol error metadata uses `resume`; runtime payload decode/version failures
  use `payload`; runtime locator materialization failures use `resume`; and
  direct framework API execution plus compiler pass-graph validation
  failures use `runtime`.
- The thin internal support packages have focused package tests for current
  narrow surfaces: `core` framework API stubs fail loudly with structured
  `ARCADE_FRAMEWORK_API_RUNTIME_CALL` metadata when run without the TSRX compiler,
  including the authored `shared(factory, options?)` call shape; `protocol`
  exports the current protocol version and payload TypeScript shapes; and
  `test-utils` provides canonical payload script wrapper assertions, JSON
  decoding, selected protocol record-count summaries, and a decoded
  human-readable payload debug dump.
- The root workspace uses pnpm and vite-plus through `package.json`,
  `pnpm-workspace.yaml`, `pnpm-lock.yaml`, and `vite.config.ts`.
- The current vite-plus pack configuration emits ESM and declaration outputs for
  `core`, `protocol`, `serializer`, `compiler`, `runtime`, `rolldown`, `vite`,
  `arcade`, `arcade/vite`, and `test-utils`.

### Compiler Boundaries

- `packages/compiler` has a pass-owned source layout with shared artifacts,
  diagnostics, AST helpers, graph-path helpers, pass registry, pass graph
  validation, generic pass execution, a default portable human-readable artifact
  dump formatter, and compile orchestration outside the package entry file.
- `packages/compiler/src/index.ts` re-exports the compiler surface and does not
  contain AST walking, graph mutation, pass registry construction, pass graph
  validation, or compile orchestration bodies.
- The default pass registry currently declares ten pass IDs and artifact
  boundaries: `tsrx-semantic-graph`, `state-lowering`, `payload-arena`,
  `symbol-resolver`, `capture-analysis`, `protocol-state`, `protocol-view`,
  `payload-scripts`, `symbol-modules`, and `symbol-resolver-module`.
  Focused pass-boundary tests prove the registry declares the resolver inputs it
  actually consumes, including `stateLowering` for symbol planning and
  `symbolResolverModuleInput` for generated resolver module emission.
- Pass-owned modules exist for semantic graph collection, state lowering,
  payload arena planning, symbol resolver planning, capture analysis, protocol
  state planning, protocol view planning, payload script rendering, lazy symbol
  module emission for current DOM update and async-computed runner symbols, and
  symbol resolver module emission.
- Semantic graph collection is split into collector modules for module-scope
  diagnostics, components, elements, state/computed/element bindings, shared
  definition/instance records, aliases, async boundaries, sync policy, and
  expression read/write collection.
- Focused module-boundary tests cover the compiler split and semantic collector
  ownership.
- `compileTsrxModule` validates the default pass graph and orchestrates the
  current source-to-artifacts path by manually calling the pass-owned modules in
  registry order.
- `compileTsrxModule` currently returns pass artifacts, protocol payloads,
  canonical payload scripts, a `symbolModules` artifact for current generated
  event-handler graph writes, DOM update symbols, imported behavior function
  symbols, and async-computed runner symbols, a generated symbol resolver module
  string, and a resolver manifest object. It does not return a final emitted JavaScript module for
  component execution, state access rewriting, build-integrated async-runner
  chunks, broad event write forms, local/non-imported behavior symbols, or
  complete build-ready extracted symbol chunks.

### Semantic Graph And Diagnostics

- Semantic graph collection records components, host elements, events, state
  bindings, computed bindings, element handles, same-module shared definitions,
  shared-definition dependency edges, same-module shared factory graph bindings,
  shared factory return properties for graph-backed spreads/properties and
  methods, component-local shared instance calls, template reads, graph
  reads/writes, aliases, async boundaries, and sync policy candidates. Shared
  factory graph bindings, reads, writes, and aliases carry the owning shared
  definition ID so state-lowering can resolve same-named component-local and
  shared-factory graph nodes independently.
- Semantic graph collection records the first component parameter as a read-only
  `prop` binding when it is an identifier or object pattern; object-pattern props
  produce aliases rooted at `props`.
- Semantic graph diagnostics cover module-scope graph state creation,
  unextractable sync policies, post-`await` reactive reads, async computed reads
  outside async boundaries, sync computeds that transitively depend on async
  computeds, unsupported graph destructuring defaults, same-module shared
  definition cycles, invalid/duplicate element handle bindings, element handles
  stored in `state()`, and `attach` on components.
- The current implemented stable diagnostic code inventory is
  `ARCADE_STATE_MODULE_SCOPE`, `ARCADE_ASYNC_POST_AWAIT_READ`,
  `ARCADE_ASYNC_BOUNDARY_REQUIRED`, `ARCADE_ELEMENT_HANDLE_REQUIRED`,
  `ARCADE_ELEMENT_HANDLE_DUPLICATE`, `ARCADE_ATTACH_HOST_ELEMENT_REQUIRED`,
  `ARCADE_SYNC_POLICY_UNEXTRACTABLE`, `ARCADE_STATE_UNRESOLVED_WRITE`,
  `ARCADE_STATE_DYNAMIC_PATH_READ`, `ARCADE_STATE_DYNAMIC_PATH_WRITE`,
  `ARCADE_STATE_OPTIONAL_CHAIN_WRITE`, `ARCADE_STATE_REST_ALIAS_EXCLUDED_PATH`,
  `ARCADE_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED`,
  `ARCADE_STATE_ELEMENT_HANDLE_UNSERIALIZABLE`, `ARCADE_STATE_READ_ONLY_WRITE`,
  `ARCADE_STATE_CONST_REASSIGNMENT`, `ARCADE_SHARED_DEFINITION_CYCLE`,
  `ARCADE_CAPTURE_UNSUPPORTED_VALUE`, `ARCADE_SERIALIZE_UNSUPPORTED_VALUE`,
  `ARCADE_SYMBOL_UNKNOWN`, `ARCADE_PAYLOAD_INVALID`,
  `ARCADE_PROTOCOL_VERSION_MISMATCH`, `ARCADE_RESUME_LOCATOR_MISSING`,
  `ARCADE_RESUME_LOCATOR_MISMATCH`, `ARCADE_FRAMEWORK_API_RUNTIME_CALL`, and
  `ARCADE_COMPILER_PASS_GRAPH_INVALID`.
- That inventory combines different current mechanisms: compiler passes return
  structured diagnostic objects, the pure serializer returns
  `ARCADE_SERIALIZE_UNSUPPORTED_VALUE` diagnostics in its result object, the
  protocol-state payload wrapper throws `ProtocolStateSerializationError`
  objects that preserve those diagnostics with cell binding/name context, and the
  generated symbol resolver attaches `ARCADE_SYMBOL_UNKNOWN` metadata to a thrown
  `Error` for unknown symbol IDs. Runtime payload helpers throw
  `RuntimePayloadError` objects with stable code, phase, docs URL, payload type,
  payload script selector, suggestions, and expected/actual version metadata for
  protocol-version mismatches. Runtime resume locator materialization throws
  `RuntimeResumeError` objects with stable code, phase, docs URL, DOM-order
  locator metadata, host node or boundary ID, suggestions, and expected/actual
  tag names for tag mismatches. Core framework APIs throw
  `FrameworkApiRuntimeError` objects with stable code, runtime phase, docs URL, and
  api name metadata when called without the TSRX compiler. Pass-graph
  validation throws `CompilerPassGraphError` objects with stable code, runtime
  phase, invalid-graph reason, pass ID, artifact keys, docs URL, and suggestions.
- Semantic graph async collection records async boundary ownership, catches
  post-`await` graph reads in async computed bodies, and propagates
  async-capable status through sync computeds that depend on async computeds.
- Semantic graph element/behavior collection records `el` handle bindings and
  host-element `attach` behavior source records, including behavior function source
  plus authored input expression sources for supported identifier/member and
  call forms, while rejecting `el` bindings that do not target `element()`
  handles, duplicate live handle bindings, and `attach` on components.
- Semantic graph collection records non-framework module imports for named,
  default, and namespace import specifiers so later lazy symbol modules can
  re-import authored module-level values instead of depending on serialized
  closures.
- Semantic graph element collection currently classifies static lowercase tag
  names as host elements and static uppercase tag names as components for host
  node records and `attach` diagnostics.
- Semantic graph sync-policy extraction records selected graph-state/event-field
  guard policies for synchronous `preventDefault()` / `stopPropagation()`
  actions and reports `ARCADE_SYNC_POLICY_UNEXTRACTABLE` when a browser-critical
  action cannot be represented in the current policy IR. Current policy
  condition variants cover graph truthiness, event-field equality,
  serializable constant truthiness for literals, static object/array reads, and
  selected pure computed constant expressions, `and`/`or`/`not` composition, and
  literal event comparison values. Handler arrays with multiple extractable
  policies preserve each `{ when, actions }` branch instead of dropping later
  browser-critical actions.
- Collector modules cover module-scope diagnostics, component/host collection,
  element attributes, state/computed/element bindings, shared definitions and
  same-module instance calls, aliases/destructuring, async boundaries, sync event
  policy extraction, and expression reads/writes.
- Alias collection supports array destructuring artifacts by mapping positional
  bindings such as `firstItem` to graph paths such as `items.0` when the TSRX
  semantic artifact supplies array pattern elements.

### Capture Analysis

- Semantic graph collection records local function values in `localBindings`.
- `capture-analysis` reports `ARCADE_CAPTURE_UNSUPPORTED_VALUE` when a lazy symbol
  captures a local function value.
- Semantic graph collection propagates unsupported local binding kinds through
  simple aliases, so `capture-analysis` reports the alias name when a lazy
  symbol captures a local function alias.
- Semantic graph collection records local class instance values and local DOM
  node values from document lookups or document-created elements in
  `localBindings`; `capture-analysis` reports
  `ARCADE_CAPTURE_UNSUPPORTED_VALUE` for those captures.
- Semantic graph collection records local object/array constants containing
  functions, class instances, or DOM nodes as non-serializable constants, and
  `capture-analysis` reports `ARCADE_CAPTURE_UNSUPPORTED_VALUE` when lazy symbols
  capture them.
- Semantic graph collection source allow-lists spec-listed serializable built-in
  constructors such as `Date`, `RegExp`, `Map`, `Set`, `URL`, `ArrayBuffer`, and
  typed arrays instead of reporting them as local class instances. Focused tests
  currently prove this positive path for `Date`.
- Semantic graph collection inspects serializable built-in constructor
  arguments, so built-ins such as `Map` are reported as non-serializable
  constants when their contents include functions, class instances, or DOM
  nodes.
- Semantic graph collection treats identifiers that resolve to existing
  unsupported local bindings as non-serializable contents when inspecting
  object/array constants and serializable built-in constructor arguments.
- Semantic graph collection propagates non-serializable local constants through
  object/array spread forms, including the current TSRX parser shorthand shape
  for object spread.
- Semantic graph collection propagates unsupported local binding kinds through
  object and array destructuring patterns, so destructured aliases of
  non-serializable constants are diagnosed when captured by lazy symbols.
- Semantic graph collection classifies unsupported values destructured directly
  from inline object and array initializers, so local function/class/DOM or
  non-serializable constant values are diagnosed without requiring an
  intermediate local binding.
- `capture-analysis` ignores unsupported local binding names that appear only
  inside string literals, member property names, object property keys, object
  method keys, top-level lazy symbol parameters, or top-level lazy symbol body
  declarations.
- Focused coverage exists in
  `packages/compiler/test/capture-analysis.test.ts`.

### State, Payload, Symbols, And Protocol

- State lowering resolves plain graph reads/writes, prop reads, array
  destructuring aliases represented in semantic graph artifacts, parser-collected
  nested array/object destructuring aliases from TSRX source, shared-factory
  graph reads and writes through shared-definition-scoped graph binding IDs,
  component shared-instance property reads/writes through graph-backed shared
  factory return properties, dynamic-path read/write diagnostics for shared
  instance property access,
  computed-write diagnostics, prop-write diagnostics, and const graph binding
  reassignment diagnostics.
- Current prop handling proves compiler-artifact read semantics only: the first
  component parameter becomes a synthetic read-only prop binding
  (`prop:<name>` for identifier parameters or `prop:props` plus aliases for
  object patterns), prop aliases lower to that binding, and writes to props
  report `ARCADE_STATE_READ_ONLY_WRITE`.
- State lowering read-only diagnostics use binding-kind-specific explanations,
  so prop writes point at parent graph ownership instead of reusing
  computed-specific guidance.
- Semantic graph expression collection records update operator and
  prefix/postfix metadata for `++x`, `x++`, `--x`, and `x--` style graph writes,
  and state lowering preserves that metadata for later final emit to keep
  JavaScript expression value semantics intact.
- State lowering reports `ARCADE_STATE_DYNAMIC_PATH_WRITE` when a write targets a
  known graph root through a non-static bracket path such as `items[index]`,
  keeping unsupported lvalue forms distinct from fully unresolved writes.
- State lowering reports `ARCADE_STATE_DYNAMIC_PATH_READ` when a read targets a
  known graph root through a non-static bracket path, preventing dynamic graph
  subscriptions from silently disappearing.
- State lowering reports `ARCADE_STATE_REST_ALIAS_EXCLUDED_PATH` when a write targets
  a property path that object-rest destructuring explicitly excluded from the
  alias, keeping rest-alias mistakes distinct from generic unresolved writes.
- Semantic graph expression collection recognizes mutating collection calls such
  as `items.push(...)`, `cache.set(...)`, and `selected.add(...)`, plus Date
  setter calls such as `currentDate.setTime(...)`, as graph writes while
  preserving argument reads.
- Semantic graph expression collection no longer treats dynamic computed method
  lookups such as `items[push](nextItem)` as static collection writes; those
  calls remain read artifacts for later dynamic-path diagnostics.
- Semantic graph expression collection marks optional collection calls such as
  `items?.push(nextItem)` and optional deletes such as `delete menu?.open`; state
  lowering reports `ARCADE_STATE_OPTIONAL_CHAIN_WRITE` instead of emitting graph
  writes whose artifacts could not preserve optional-chain short-circuit
  semantics.
- Semantic graph expression collection records static object-property
  `delete menu.open` forms as `delete` graph writes without treating the deleted
  property value as a graph read.
- State lowering resolves `delete` write artifacts to static graph paths so the
  runtime can preserve JavaScript property-delete behavior with path-granular
  invalidation.
- Payload arena planning separates graph state from view wiring metadata.
- Payload arena planning materializes async boundary records with generated
  start/end DOM-order comment anchor locators, keeping boundary wiring as view
  metadata rather than render-output or VDOM state.
- Payload arena planning records the async-capable computed reads protected by
  each async boundary, so `arcade/view` can connect boundary anchors to demanded
  graph data without re-walking TSRX source.
- Payload arena planning records shared-definition state metadata with definition
  IDs, exported names, literal scopes, dependency edges, graph-backed return
  properties, methods, and owned graph node IDs, so downstream state payload
  planning can keep shared graph identity separate from component-local cells.
- Payload arena and protocol view planning currently normalize template reads
  into source-bearing DOM update records with `hostNodeId`, `source`,
  `graphNodeId`, `path`, text, plain-attribute, common DOM property, class, or
  style target metadata, and an optional DOM update `symbolId`. Focused
  payload/protocol tests prove repeated reads of the same graph path on one host
  are kept distinct when their DOM targets differ and receive distinct DOM update
  symbol IDs. The runtime now has a focused `createDomUpdateEntry` helper that
  maps those DOM update targets to `setText`, `setAttr`, or `setProp` journal
  entries, and lazy DOM update symbols receive the current subscription value plus
  the protocol DOM update record in their resume symbol context. They do not yet
  carry range target metadata or final compiler-emitted render/update code beyond
  the lazy symbol journal object slice.
- Payload arena and protocol view planning carry element handle locator records,
  host behavior records with behavior function/input source metadata, and
  behavior symbol IDs into the current `arcade/view` payload shape. Behavior
  records now include `inputValues` when every input can be materialized from a
  simple literal or static `state()` initial-value graph path without running
  authored behavior code, plus `inputGraphReads` rows for graph-backed state or
  computed behavior inputs. Computed, opaque, dynamic, and partially
  materialized behavior inputs still omit `inputValues`.
- Resume runtime tests can recover a DOM element by host node ID through the
  current `getElement(hostNodeId)` API, and lazy symbol context now exposes
  authored `element()` handle lookup by handle ID or local handle name. Missing
  or unmatched handle locators resolve to `undefined`, and explicit host
  disposal removes matching handle ID/name lookups and invalidates the disposed
  host's `getElement(...)` lookup in the current fake-DOM runtime path. Focused
  runtime tests now also prove that host lookup and element handle lookup return
  `undefined` when the previously materialized host element is no longer present
  under the resume root subtree.
- Symbol resolver planning assigns source-bearing lazy symbol records from
  current event, binding, behavior, and async-computed-runner artifacts. Resolver
  module emission owns dynamic import dispatch for the supplied chunk/export
  table. Event semantic artifacts now preserve handler parameter names so the
  resolver can attach event-owned value sources to the correct planned handler
  symbol. The `symbol-modules` pass now emits source strings for planned DOM
  update symbols that consume resume DOM update context and return concrete
  `setText`, `setAttr`, or `setProp` journal objects without importing runtime
  helpers, and it emits event-handler modules for the current
  lowered `++`/`--` graph-update path through `context.graph.update`, compound
  assignments, including logical `&&=`, `||=`, and `??=`, with supported RHS
  values through `context.graph.update`, simple literal, event-parameter field,
  graph-read, simple conditional graph-read, simple binary/logical graph-read,
  simple array-literal, and simple object-literal `=` assignments through
  `context.graph.write`, static property deletes through `context.graph.delete`,
  and collection calls with zero arguments, simple literal arguments, simple
  event-parameter field arguments, or lowered graph-read arguments through
  `context.graph.call`.
  Simple event-parameter field assignments and collection-call arguments such as
  `event.currentTarget.value` lower through
  `context.event?.currentTarget?.value`. Simple graph-read assignment values and
  collection-call arguments such as `menu.title` lower through
  `context.graph.read("state:menu", ["title"])`, conditional graph-read
  assignment values such as
  `menu.open ? profile.step : total`, simple binary/logical graph-read
  assignment values such as `total + profile.step` or
  `menu.open && profile.enabled`, and grouped/nested graph-read assignment
  values such as `(total + profile.step) * profile.scale` compose those reads in
  the generated write value. Simple array literal assignment values such as
  `[nextItem, "fallback"]`, `[...nextItems, nextItem]`, and `[, nextItem]`
  compose supported element, spread, and hole values in the generated write
  value. Simple object literal assignment values such as
  `{ title: menu.title, step: profile.step }` compose supported static-key
  property values in the generated write value. Object spread assignment values
  such as `{ ...settings, title: menu.title }` compose supported spread values
  and static-key property values in the generated write value. Computed-key
  object literal assignment values such as `{ [menu.title]: profile.step }`
  compose supported key and property values in the generated write value. Static
  call assignment values such as `Math.max(total, profile.step)` compose
  supported argument values when the callee is a static identifier/member path,
  and imported helper call assignment values such as
  `clamp(total, profile.step)` re-emit matching ESM imports in generated event
  modules when the helper is referenced as an identifier rather than only in
  string/comment text. Namespace-imported helper calls such as
  `math.clamp(total, profile.step)` also re-emit their namespace import, while
  imports used only by currently un-emitted handler guards are not re-emitted by
  generated write modules. Bare local/non-imported helper call assignment values
  and unimported member helper roots are not emitted as generated writes, keeping
  local function capture diagnostics from turning into undefined lazy-module
  calls. Resolver write matching now keeps unrelated writes to the same graph
  target/method or neighboring compound/plain assignment form out of other
  handler symbols.
  Assignment emission is still limited to simple literal RHS values, simple
  event-parameter property reads, simple lowered graph-read RHS values, and
  prefix unary `!`, `+`, `-`, `~`, conditional `?:`, binary/logical operators,
  or balanced grouping around those supported RHS values, plus array literals
  whose elements or spread operands are supported RHS values and whose holes can
  be preserved, and object literals whose static-key property values are
  supported RHS values, whose computed keys are supported RHS values, and whose
  spread values are supported RHS values, plus static call
  expressions whose callee is a static identifier/member path and whose
  arguments are supported RHS values for `=`, plus supported compound
  assignment operators.
  Collection-call emission is limited to zero-argument calls, simple literal
  arguments, simple event-parameter property-read arguments, simple lowered
  graph-read arguments, and spread arguments whose operand is one of those
  supported value sources. It does not materialize captured values, broad derived
  expressions beyond prefix unary `!`, `+`, `-`, `~`, conditional `?:`,
  binary/logical operators, or balanced grouping over supported value sources,
  object literal methods,
  local/non-imported function call re-emission, unsupported imported-call forms,
  unsupported call arguments, arbitrary computed assignment values outside the
  supported static-call subset, or otherwise nonliteral/non-graph values yet. For
  imported behavior functions and inline behavior function expressions,
  `symbol-modules` emits a behavior wrapper that calls the imported or inline
  function with deferred `context.behaviorInputs` and then runs the returned
  behavior with `context.element`. Inline behavior function expressions are
  grouped before deferred input invocation so arrow-function factories preserve
  JavaScript call precedence. Imported behavior functions re-emit the matching
  ESM import, while bare local/non-imported behavior identifiers are left
  un-emitted to avoid undefined generated lazy-module calls. Async computed
  runner symbols now carry authored function source and simple dependency
  metadata through semantic graph, payload arena, symbol resolver, and generated
  async-runner modules; those modules materialize static dependency roots from
  `context.graph.read` / `context.read`, preserve the authored source string, and
  call the async function with `{ key, signal, read }`, while protocol
  `arcade/state` keeps only serializable computed identity. Broader nonliteral
  assignment, bare local/non-imported named behavior, and nonliteral argument-bearing
  collection-call source-to-module extraction are not implemented yet. The
  Rolldown/Vite adapter path can now derive compact resolver table rows for
  current generated event-handler and DOM update virtual modules, and the
  current Vite fixture build proves the
  transformed `.tsrx` entry imports generated payload/resolver/manifest virtual
  modules so those generated symbol modules reach build output. The in-memory
  manifest hook records bundle-derived file names for generated resolver,
  payload, manifest, and current generated symbol virtual modules, plus finalized
  `{ symbolId, exportName, virtualModuleId, fileName }` rows for generated
  symbols when their virtual modules appear in bundle output; the same full
  metadata is emitted as `arcade-manifest.json` only when `emitManifestJson` is
  explicitly enabled.
  The emitted public module manifests omit the internal pre-build symbol rows
  used to derive those finalized rows. The client bundle hook now rewrites
  generated resolver table module URLs from `virtual:arcade:symbol:*` IDs to
  final relative chunk specifiers, fails closed if a table symbol cannot be
  mapped, and compacts duplicate final URLs after generated facade cleanup. The
  generated resolver loader source is constant-size over the table data and uses
  `import(/* @vite-ignore */ url).then((mod) => mod[exportName])` instead of an
  app-sized switch. Behavior and async-runner resolver rows still come from
  caller-supplied symbol tables rather than real build output for all symbol
  kinds.
- Symbol resolver module emission fails closed for unknown symbol IDs with
  `ARCADE_SYMBOL_UNKNOWN`, `resume` phase, the missing `symbolId`, and a stable docs
  URL on the thrown error object.
- Symbol resolver module emission now exports a compact tuple-style symbol table
  with protocol version, optional build/resolver identity, module URL table,
  export-name table, and symbol-ID row record supplied to the compiler by the
  current fixture/adapter boundary.
- Protocol view planning links payload arena records to lazy symbol IDs.
- Protocol view planning links each async boundary read to the generated
  async-computed-runner symbol ID, so visible/demanded boundaries can resolve
  async work through the symbol resolver.
- Protocol state planning now includes serializable async computed dependency
  graph paths and async computed snapshot records while still omitting authored
  async runner source from `arcade/state`.
- Protocol state planning now carries shared-definition metadata from the payload
  arena into `arcade/state` with version counters initialized to `0` and protocol
  return-property records stripped of source spans. Runtime payload validation
  accepts and checks those shared-definition records when present. Runtime graph
  creation from decoded state payloads now retains those shared-definition
  records and can read or write graph-backed shared return properties through
  the owned graph cells. Shared graph writes now increment the retained shared
  definition version and enqueue plain-data shared patch records shaped like the
  private runtime patch protocol. The resume runtime drains those patches after
  lazy handler graph flushes and dispatches them through an injected dispatcher
  or a private `async:shared-patch` browser event on the root container. Runtime
  graph patch folding applies newer received patch records back through exposed
  shared return-property paths without re-emitting them, and the resume runtime
  installs a private shared-patch listener for containers with shared
  definitions.
- Payload script planning emits canonical JSON `arcade/state` and `arcade/view`
  data scripts and concatenates them into the current render-shell artifact.
  This is not the compact private arena encoding from the payload spec.

### Runtime, Serializer, And Build Adapters

- The runtime graph supports path-granular invalidation, microtask flush
  scheduling, direct sync computed lazy recomputation after path-granular
  invalidation, async computed request versioning, abort-signal wiring, stale
  fulfilled/rejected async completion suppression, same-key async invalidation
  skips, committed rejected async snapshots, standalone initial async-demand
  pending flush, restored non-idle async computed snapshots, lazy restart for
  restored pending async snapshots on demand, and collection of
  subscriber-produced DOM mutation journal entries.
- The runtime package exposes a structural DOM journal applier for caller-resolved
  DOM-like targets. Focused coverage proves ordered `setText`, `setAttr`, and
  `setProp` application, removal for nullish/false attributes, and
  `runCleanup` callbacks in journal order. It can apply `removeRange`,
  `insertRange`, and retained-anchor `moveRange` contents directly to
  caller-resolved DOM-like anchor nodes with structural `parentNode` /
  `childNodes` / `insertBefore` / `removeChild` operations. `insertRange` can
  also route private async-boundary snapshot fragments, including rejected
  snapshots, through a host `renderAsyncSnapshot` adapter before inserting the
  returned concrete nodes. It does not yet prove those ranges against real
  browser DOM nodes. The runtime
  also exposes a helper that maps protocol DOM update targets for text, attribute,
  property, class, and style updates to concrete journal entries. Resume DOM update
  subscriptions pass the current graph value and protocol DOM update record to lazy
  DOM update symbols, so generated symbols have the runtime data needed to consume
  that helper. Resume async-boundary subscriptions now emit structural
  `removeRange` / `insertRange` journal entries for pending and fulfilled async
  snapshots without importing async runner symbols, and compiler-shaped async
  read value paths are preserved as fragment metadata while the subscription
  listens to the whole async snapshot. The compiler does not yet emit those
  generated DOM update symbols, and the range entries are not yet applied to real
  browser DOM nodes.
- The runtime graph can return either the previous or next value from graph
  updates, giving generated update-expression code a target for preserving
  postfix and prefix JavaScript value semantics.
- The runtime graph has a supported collection-call path for Array, Map, Set,
  and Date graph paths, preserving JavaScript method return values while
  invalidating the mutated graph path.
- The runtime graph snapshots Date timestamps around supported Date setter calls
  and skips invalidation when the timestamp does not change, while still
  preserving the JavaScript setter return value.
- The runtime graph preserves `Map.delete` / `Set.delete` boolean return values
  and skips path invalidation when those calls return `false`, because no
  collection entry was removed.
- The runtime graph skips `Map.clear()` / `Set.clear()` path invalidation when
  the collection is already empty, while still preserving the JavaScript method
  return value.
- The runtime graph skips `Set.add(value)` path invalidation when the value is
  already present, while still preserving the JavaScript method return value.
- The runtime graph skips `Map.set(key, value)` path invalidation when the key
  already maps to the same value, while still preserving the JavaScript method
  return value.
- The runtime graph skips `Array.pop()` path invalidation when the array is
  already empty, while still preserving the JavaScript method return value.
- The runtime graph skips `Array.shift()` path invalidation when the array is
  already empty, while still preserving the JavaScript method return value.
- The runtime graph skips `Array.push()` / `Array.unshift()` path invalidation
  when no values are added, while still preserving the JavaScript method return
  value.
- The runtime graph widens graph writes to an array `length` property to dirty
  the array path, so subscribers to indexes removed by truncation rerun alongside
  subscribers to `length`.
- The runtime graph distinguishes sparse array holes from own `undefined`
  indexed values when deciding whether array content mutators changed a graph
  path.
- The runtime graph rejects unsupported collection method calls such as
  non-mutating `map`, preventing runtime callers from marking graph paths dirty
  for methods the compiler will not lower as writes.
- The runtime graph applies object-property deletes at static graph paths,
  preserving the JavaScript delete return value while invalidating the deleted
  graph path.
- The runtime graph skips object-property delete invalidation when no own
  property is removed, while still preserving the JavaScript `delete` return
  value.
- The resume runtime materializes current view records by recursively walking
  fake-DOM `childNodes` for element nodes, matching DOM-order indexes and
  case-insensitive tag names, then registers delegated DOM events, evaluates sync
  event policy before lazy symbol loading, dispatches delegated events from
  nested targets to owner element records, registers async view DOM updates as
  graph subscriptions, and invalidates explicit disposed-host locators plus
  their delegated event records. Missing DOM-order element locators and
  tag-mismatched locators now fail loudly with structured `RuntimeResumeError`
  metadata.
- Compiler/protocol tests preserve ordered event handler `symbolIds` for handler
  arrays, and the resume source iterates matched event symbol IDs in protocol
  order. Focused runtime tests execute multiple handler symbols for one event,
  stop at the first rejected handler, leave earlier committed graph writes in
  place, ignore ordinary handler return values, and flush committed graph work
  through a `try`/`finally` path before rethrowing the handler failure. They
  also prove a rejected lazy symbol load is reported to the runtime app-level
  error hook with event host/name/symbol context, skips later handlers, preserves
  earlier writes, flushes, and rethrows the original resolver failure.
- The resume runtime treats `visible` event records as visibility observer
  records instead of delegated DOM events. Focused Node fake-DOM coverage proves
  one injected observer per resumed root, fallback to a structural
  `globalThis.IntersectionObserver` when no observer factory is injected,
  one-shot lazy symbol loading in authored order on first intersection, ignored
  non-visible observer entries, unobserve after first fire, unobserve on explicit
  host disposal before first intersection, ignored post-disposal observer
  entries, returned cleanup storage, and reverse cleanup on explicit host
  disposal.
- For element behaviors, compiler/protocol tests preserve behavior source
  records, behavior function/input source metadata, matching module import
  metadata for imported behavior functions, simple literal/static-state
  `inputValues`, and symbol IDs in authored/view order. The `symbol-modules`
  pass emits imported behavior function modules with deferred behavior input
  slots. The resume runtime records behavior payloads without loading app
  behavior code during startup, and its explicit `activateBehaviors(hostNodeId)`
  trigger imports behavior symbols in payload/authored order, passes optional
  serialized or graph-read `inputValues` as `context.behaviorInputs`, cleans up
  prior behavior installs before reruns, and stores cleanup callbacks for host
  disposal. Active behavior hosts now subscribe to graph-backed behavior input
  reads and rerun after those graph inputs change in the Node fake-DOM runtime
  path, while graph changes before explicit activation do not import app
  behavior code. The delegated event and visibility observer paths now treat
  ordinary events and `onVisible` as automatic behavior triggers for the same
  host without importing behavior code at startup, and the trigger path skips
  duplicate installs once a behavior host is active. No package source currently
  wires declared policy triggers to `activateBehaviors`, serializes
  computed/opaque/dynamic behavior input values, or proves behavior input reruns
  against real browser DOM removal/timing.
- The resume runtime materializes `arcade/view` async boundary records by
  recursively walking fake-DOM comment nodes, matching raw DOM-order comment
  indexes, and exposing the boundary-side table for later async
  demand/revalidation work.
- The payload-driven resume path now creates lazy async computed runtime graph
  nodes from `arcade/state` dependency metadata plus `arcade/view` runner symbol
  IDs. Startup still imports no app symbols; the async runner symbol is imported
  only when the computed is demanded, receives `{ key, signal, read }` in its
  symbol context, and its return value commits as graph data rather than a DOM
  journal entry. Fulfilled async computed snapshots in `arcade/state` seed the
  runtime graph before revalidation, avoid an initial runner import/refetch, and
  revalidate through the runner only after the dependency key changes. Pending
  async computed snapshots seed the runtime graph without a startup import, then
  restart through the runner on first demand and advance from the serialized
  request version. The resume runtime no longer treats async computed runner
  symbols as async-boundary DOM update symbols; boundary snapshot changes produce
  structural range journal entries instead.
- Runtime payload helpers parse caller-supplied JSON `arcade/state` and
  `arcade/view` script strings by exact wrapper match plus `JSON.parse`, check
  the required top-level state/view payload fields, including the state
  `computed` array, and shared protocol version,
  validate serialized graph value envelopes in state cell values and async
  computed snapshot `key` / `value` / `error` fields, including supported
  graph-root slot shapes, built-in wire formats, typed-array record names,
  array-buffer byte payload ranges, typed-array / DataView buffer refs and byte
  ranges, duplicate record IDs, and dangling `$ref` slots, while requiring
  record IDs, `$ref` slots, and async snapshot request versions to be
  non-negative integers,
  deserialize serialized state cell values into runtime graph cells, and return
  decoded view records.
- Runtime payload helpers can also read canonical `arcade/state` and `arcade/view`
  script text from a document-like `querySelector` host, then reuse the same
  script decoder and payload-driven resume path.
- Payload wrapper, JSON, structural shape, document lookup, and protocol-version
  failures now throw `RuntimePayloadError` instances. Focused runtime tests
  assert `ARCADE_PAYLOAD_INVALID` metadata for payload-script wrapper failures and
  `ARCADE_PROTOCOL_VERSION_MISMATCH` metadata with expected/actual versions for
  protocol mismatches. These errors do not yet include build/resolver hash
  mismatch metadata beyond the protocol version.
- The runtime exposes a payload-driven resume helper that decodes caller-supplied
  payload script strings, creates the runtime graph from serialized
  `arcade/state` cell values and lazy async computed dependency records,
  materializes the `arcade/view` resume runtime, and starts delegated event wiring
  plus locator/behavior/async-boundary side tables against a caller-supplied
  DOM-like root. A companion helper now reads the payload scripts from a
  document-like `querySelector` host before taking the same resume path; this
  does not yet prove startup in a real browser document.
- The runtime exposes early `render(App, { target })` and
  `renderToString(App, options)` entries. Focused package tests prove CSR creates
  a live container without payload scripts or an inline resumer, static SSR emits
  container-scoped payload scripts without a resumer, interactive SSR emits one
  nonce-bearing inline resumer, and the default inline event resumer keeps
  sync-policy code out of event-only output, applies event/constant/logical
  sync-policy actions and serialized graph-state `graph-truthy` reads before
  importing its resume module when the payload needs that feature, including the
  serializer's built-in graph record shapes, imports that module only after
  interaction, continues to dispatch later matching interactions through the same
  browser module cache while the inline listener owns the event, and skips itself
  once the imported resume adapter marks the container runtime-owned. This render
  shell still proves those paths only against DOM-like package tests, not real
  browser default-action timing or generated build output.
- The POC resumer fixture under `poc/fixtures/proofs/resumer-script` proves a
  deliberately tiny event-only bootstrap shape outside the production package
  pipeline. Its current measured source is 679 B raw, 465 B minified, and 346 B
  gzip. It uses a compact `arcade/view` table of event names, event rows, module
  specifiers, and export names, executes no app symbol before interaction, and
  imports the click symbol only after a real browser click in the Witness box.
  This is size and behavior evidence for the production target; it is not yet the
  production `renderToString()` integration or generated bundler output.
- The current compiler protocol-state pass serializes semantic graph `state()`
  cell `initialValue` entries through the pure serializer. Those values come
  from syntax-evaluated literals, object expressions, array expressions, and
  simple unary expressions, not from executing component bodies or capturing a
  runtime graph snapshot. When the semantic evaluator cannot reduce an
  initializer or nested initializer expression, the current source passes
  `undefined` into the serializer, which encodes it as an explicit undefined
  slot.
- The pure-value `serializeGraphValue` / `deserializeGraphValue` path preserves
  identity/cycles and supports primitives, plain objects/arrays, `Date`,
  `RegExp`, `URL`, `BigInt`, `Map`, `Set`, `ArrayBuffer`, `DataView`, and the
  current typed-array source table; direct unsupported values report the state
  path.
- The main package exposes the current curated source-entry surface, including
  framework APIs, the payload-driven resume helper, the Rolldown adapter, and
  the `./vite` Vite adapter subpath. Current adapter tests cover unit-level
  `.tsrx` transform metadata, in-memory resolver/payload/generated-symbol
  /manifest virtual module resolution and loading, transform manifest objects,
  in-memory manifest metadata from accumulated transform manifests, direct
  Vite transform/resolveId/load/generateBundle hook forwarding, a direct
  Rolldown build, and a temporary Vite library build that load the generated
  payload, resolver, manifest, and current generated event-handler/DOM-update
  symbol virtual modules while recording their emitted chunk filenames plus
  finalized generated-symbol manifest rows; default builds emit
  `build/bundle-graph.json` but not `arcade-manifest.json`, and the generated
  resolver's compact exported symbol table uses final relative chunk specifiers
  for the current generated symbol chunks and no longer emits an app-sized
  `switch (id)` loader.
  Focused adapter
  tests also simulate an HMR-style module update by retransforming the same
  `.tsrx` file and proving stale generated DOM-update virtual modules no longer
  resolve or load after the binding is removed, and a structural
  `handleHotUpdate` test proves generated virtual module graph nodes are
  invalidated and returned with the changed `.tsrx` module. A focused
  `configureServer` / `handleHotUpdate` test proves the adapter emits a custom
  `arcade:update` dev-server payload containing the changed module ID
  and generated virtual module IDs, and a custom-environment test proves
  server-originated hot updates send through the configured Vite client
  environment rather than assuming the literal `client` environment name. A
  focused Vite config test proves normal app builds default
  `build.modulePreload` to `false` while library and SSR builds keep their
  caller-supplied defaults. A focused `transformIndexHtml` / virtual
  module test proves Vite dev HTML contexts receive an inert
  `arcade:dev` marker tag plus a virtual dev-client module that listens
  for that Vite custom event and redispatches it as a browser `CustomEvent`;
  build/no-server contexts receive neither tag. Package-local Witness boxes now
  live under `packages/bundler/boxes`: one runs the `vite-csr` dev-server
  pipeline, edits `src/root.tsrx`, and writes a receipt whose client environment
  outcome records `hmr: 'none'` plus the `arcade:update` framework hot
  message; one opens a real browser page, tracks the cancelable
  `arcade:update` browser event, and proves no navigation/reload while
  the fixture consumes the event; and one runs a production Vite build, proving
  the emitted CSR bundle graph, generated chunks, absent default
  `arcade-manifest.json`, and absence of dev-HMR strings in production
  artifacts. A fourth package-local box serves that CSR
  production build through Vite preview and proves client-created DOM can load
  the generated payload/resolver/symbol pipeline for a counter click without
  console errors or failed requests. A fifth package-local box builds the
  `vite-ssr` fixture, proves the build emits both `client` and `ssr`
  environments, and asserts the built server entry contains the counter DOM plus
  `arcade/state` and `arcade/view` payload scripts. A sixth package-local box
  imports that built server entry, writes its generated HTML into the preview
  index for the box run, serves the built client chunks through Vite preview,
  and proves the browser entry resumes existing server-produced DOM for the same
  `0` to `1` click update.
  Focused base-plugin and Vite-wrapper tests prove `buildStart` clears generated
  virtual modules plus accumulated transform manifests before a new build/dev
  cycle, so stale virtual modules do not resolve/load and no stale manifest
  metadata or opt-in manifest asset is emitted after cleanup.

## Remaining Major Work

- Continue state-lvalue coverage beyond the current focused cases, including
  additional array write forms, nested aliases, collection-method edge cases,
  delete edge cases, and remaining invalid write diagnostics.
- Implement `shared()` beyond the current framework API runtime stub/re-export
  surface, same-module semantic graph records, and shared-definition payload
  metadata, including cross-module stable definition identity beyond explicit
  named `.tsrx` import specifiers, request/container/page graph-context
  handling, scoped runtime graph-instance lifecycle, browser resume of shared
  instances beyond direct graph-backed property reads/writes,
  shared state snapshots, and cross-runtime conflict policy for synchronized
  shared patches.
- Preserve the compiler pass-boundary split as new behavior lands; future
  compiler additions should name the touched pass ID, consumed/produced
  artifacts, owning module, and focused artifact test.
- Broaden generic pass execution beyond the current in-memory executor and
  portable artifact dump formatter into file/CLI artifact dump tooling,
  disabled/reordered pass execution, and contributor-facing artifact inspection
  workflows.
- Finish template/view lowering and final emit beyond the early payload and
  resolver artifacts, including range DOM update target metadata, build-ready
  emitted DOM update chunks from the current symbol module artifact, broader
  event write module emission, behavior and async-runner module emission, and
  generated DOM operation wiring for those DOM updates.
- Implement TSRX control-flow identity support beyond the current generic AST
  walk, including keyed loop scope records, positional/unkeyed loop diagnostics
  for stateful or interactive bodies, branch-local graph scope records, branch
  disposal diagnostics, branch/list payload locators, and runtime disposal of
  branch/list-owned graph state, DOM updates, events, async work, and behaviors.
- Implement children/projection support beyond current prop aliases, including
  opaque projection artifacts, projection-site payload metadata, pass-through and
  wrapping behavior, disposal semantics, and diagnostics for inspecting, mapping,
  cloning, counting, or mutating `children`.
- Implement TSRX dynamic tag/component and scoped-style handling beyond current
  static tag-name collection, including dynamic `<{expr}>` artifacts,
  host/component ownership decisions, style-scope and style-composition records,
  payload/runtime metadata, and focused diagnostics.
- Implement authored template-comment and statement-container lexical-scope
  support beyond current generic AST traversal, including preservation or skip
  rules for authored comments, comment-aware locator planning, statement-scope
  artifacts, and tests where authored comments interact with generated async
  boundary anchors.
- Implement symbol source extraction and chunk/export generation beyond current
  planned symbol IDs and fixture-supplied symbol tables, including event handler
  writes beyond generated update/literal-assignment/static-delete/literal-argument
  collection-call modules, behavior, and async-runner source-to-module extraction
  plus resolver manifests derived from real build output.
- Broaden payload/protocol coverage beyond the current simple DOM-order locator
  and data-script wrappers, including branch/list/fragment locator streams,
  compact production encoding, and resolver tables derived from real build
  chunks.
- Broaden sync event policy coverage beyond the current graph-state/event-field
  and selected constant guard cases, including IR/runtime support for prop
  guards, imported constants, serializable constant forms outside the current
  literal/unary/logical/binary/conditional subset, more unsupported-policy
  diagnostics, and real browser default-action timing.
- Broaden event-handler array runtime behavior beyond current Node fake-DOM
  ordered/rejected-handler and rejected-`loadSymbol` hook coverage, including
  normal error-boundary routing, handler-body error-hook assertions,
  handler-array sync policy behavior, and real browser default-action/flush
  timing.
- Broaden `onVisible` visibility-event behavior beyond current Node fake-DOM
  observer and structural global `IntersectionObserver` coverage, including
  generated-build integration, real browser observer timing, and real-browser
  cleanup timing after host removal.
- Broaden diagnostics beyond current package object shapes, including docs pages
  for every stable code, human code frames, editor/dev-server overlays, runtime
  error-hook routing, version/hash mismatch metadata, and coverage for required
  diagnostics that are not yet implemented.
- Broaden element handle and behavior coverage beyond current compiler/payload
  artifacts and Node fake-DOM handle lookup, including initial-render
  `undefined` semantics, real browser locator mismatch/removal behavior,
  computed/opaque behavior input value serialization, declared policy behavior
  activation triggers, real-browser behavior input reruns, and real DOM removal
  cleanup.
- Continue async boundary work beyond the current resume-runtime demand slice,
  including initial-render awaiting, generated pending/fulfilled/rejected branch
  DOM replacement between anchors, branch cleanup, rejected/error rendering policy,
  emitted async runner modules, and build-manifest integration that connects
  generated runner symbols to real chunks.
- Broaden the early CSR `render(App, { target })` runtime entry from the current
  package-level fake-DOM surface into the normal browser render path that
  executes generated component/render artifacts, creates a full live container,
  and proves browser event/DOM behavior without SSR payload scripts or a resumer.
- Broaden the early SSR `renderToString(App, options)` runtime entry beyond the
  current package-level payload/resumer shell by connecting it to generated
  compiler render artifacts, awaiting demanded async work, serializing real
  graph/view/symbol/async snapshots, generating feature-sliced production inline
  resumers, and proving browser resume coverage around the unified
  runtime/protocol model.
- Broaden fixture-backed build behavior beyond the current direct Rolldown,
  Vite library build, Vite CSR build, and package-local Witness dev/browser
  HMR/build/preview receipts, SSR built-server-entry build and browser
  resume-click receipts, and in-memory hook tests, including production SSR
  server-environment serving beyond the preview-index harness, behavior
  and async-runner symbol chunk generation/finalized manifest rows, broader
  non-binding symbol support beyond simple event-handler update chunks, resolver
  source/manifest derivation from emitted chunk filenames beyond the current
  generated build fixture paths, and real DOM hot replacement beyond the
  fixture-level custom-event consumer.
- Add or extend local `@async/witness` capabilities whenever a required resume
  mechanic cannot be observed by current Witness APIs, and keep Witness as the
  canonical harness for resume mechanics instead of moving those proofs into
  jsdom or Vitest browser-mode SSR workarounds.
- Broaden `packages/vitest-browser` beyond the current CSR helper package into
  real Vitest browser-mode projects covering targeted real-browser DOM/runtime
  mechanics where SSR/initial-render output is not the behavior under test,
  including event timing, DOM journal application, `IntersectionObserver`,
  element handle lookup, and microtask behavior.
- Finish production packaging/build metadata beyond the current flat root
  `dist/` output, including package-local export wiring, package build ordering,
  dependency externalization policy, and the final public/internal package split.
- Keep short repo-only test helpers in package-local test support or
  top-level `scripts/test-utils`. Promote them into a new package only after
  real package/browser/pipeline tests prove a reusable consumer surface.
- Add component/browser and eventual resumability end-to-end tests that prove no
  component execution on browser resume.

## Verification Ledger

Verification entries are scoped evidence. A focused compiler/runtime test proves
the slice named by the test, and a spec-only format or whitespace check proves
only the edited documentation files. Do not use a narrow command as evidence for
broader product completion.

Recorded commands are receipts from the worktree at the time they were run, not
permanent green status. Before claiming a slice is currently complete, rerun the
latest narrow command that covers that slice or record why a stronger source of
evidence now supersedes it.

Current `vp test` receipts use the root vite-plus Node test project
(`environment: 'node'`) and include `packages/*/test/**/*.test.ts`; at this
ledger update, that is 48 package test files and 292 tests. Treat those results
as package/unit-integration evidence. They do not prove browser-mode component
tests, real browser resume, broad witness HMR/build-pipeline behavior beyond the
package-local CSR dev/browser HMR, production-build, preview client-click, SSR
built-server-entry build, and SSR built-server-entry browser resume-click
receipts, or end-to-end
no-component-execution-on-resume behavior.

The production package implementation and split spec files are now tracked on
the current `impl` branch. `git diff --check` proves whitespace only for the
current tracked modifications; use `vp fmt --check`, `vp check`, focused tests,
and explicit file scans when verification needs to include the broader tracked
package/source set. The current untracked `dist/` directory is generated
pack-output evidence, not source-of-truth implementation state.

Historical focused implementation receipts retained for context:

- `pnpm exec vp test packages/compiler/test/symbol-modules.test.ts packages/compiler/test/compile-module.test.ts`
- `pnpm exec vp test packages/compiler/test/symbol-modules.test.ts`
- `pnpm exec vp test packages/runtime/test/runtime-graph.test.ts`
- `pnpm exec vp test packages/runtime/test/runtime-graph.test.ts packages/compiler/test/semantic-expression-collector.test.ts packages/compiler/test/compile-module.test.ts`
- `pnpm exec vp check packages/compiler/src/passes/symbol-modules.ts packages/compiler/test/symbol-modules.test.ts packages/compiler/test/compile-module.test.ts specs/state.md`
- `pnpm exec vp pack`
- `pnpm exec vp test`
- `pnpm exec vp test packages/runtime/test/payload-scripts.test.ts`
- `pnpm exec vp test packages/runtime/test/payload-scripts.test.ts packages/runtime/test/runtime-graph.test.ts`
- `pnpm exec vp test packages/runtime/test/resume.test.ts`
- `pnpm exec vp test packages/runtime/test/payload-scripts.test.ts packages/runtime/test/runtime-graph.test.ts packages/runtime/test/resume.test.ts`
- `pnpm exec vp check packages/runtime/src/payload.ts packages/runtime/src/resume.ts packages/runtime/test/payload-scripts.test.ts specs/state.md`
- `pnpm exec vp pack`
- `pnpm exec vp test`
- `git diff --check`
- diff guardrail scan over the touched runtime/spec files for prohibited runtime/build terms
- `pnpm exec vp test packages/compiler/test/symbol-modules.test.ts packages/compiler/test/compile-module.test.ts`
- `pnpm exec vp check packages/compiler/src/passes/symbol-modules.ts packages/compiler/test/symbol-modules.test.ts packages/compiler/test/compile-module.test.ts`
- `pnpm exec vp pack`
- `pnpm exec vp test`
- `pnpm exec vp test packages/compiler/test/payload-arena.test.ts packages/compiler/test/protocol-view.test.ts packages/runtime/test/payload-scripts.test.ts packages/runtime/test/behaviors.test.ts`
- `pnpm exec vp test packages/compiler/test/payload-arena.test.ts packages/compiler/test/protocol-view.test.ts packages/runtime/test/payload-scripts.test.ts packages/runtime/test/behaviors.test.ts packages/compiler/test/compile-module.test.ts packages/compiler/test/symbol-resolver.test.ts packages/runtime/test/resume.test.ts packages/test-utils/test/payload-helpers.test.ts`
- `pnpm exec vp check packages/compiler/src/artifacts.ts packages/compiler/src/passes/payload-arena.ts packages/compiler/test/payload-arena.test.ts packages/compiler/test/protocol-view.test.ts packages/protocol/src/index.ts packages/runtime/src/payload.ts packages/runtime/src/resume.ts packages/runtime/test/payload-scripts.test.ts packages/runtime/test/behaviors.test.ts specs/state.md`
- `pnpm exec vp pack`
- `pnpm exec vp test`
- `pnpm exec vp test packages/compiler/test/payload-arena.test.ts packages/compiler/test/protocol-view.test.ts`
- `pnpm exec vp test packages/compiler/test/payload-arena.test.ts packages/compiler/test/protocol-view.test.ts packages/compiler/test/compile-module.test.ts packages/runtime/test/payload-scripts.test.ts packages/runtime/test/behaviors.test.ts`
- `pnpm exec vp check packages/compiler/src/artifacts.ts packages/compiler/src/passes/payload-arena.ts packages/compiler/test/payload-arena.test.ts packages/compiler/test/protocol-view.test.ts specs/state.md`
- `pnpm exec vp pack`
- `pnpm exec vp test`
- `pnpm exec vp test packages/compiler/test/symbol-resolver.test.ts packages/compiler/test/symbol-modules.test.ts packages/compiler/test/compile-module.test.ts`
- `pnpm exec vp check packages/compiler/src/passes/symbol-modules.ts packages/compiler/src/passes/symbol-resolver.ts packages/compiler/test/symbol-modules.test.ts packages/compiler/test/symbol-resolver.test.ts packages/compiler/test/compile-module.test.ts specs/state.md`
- `pnpm exec vp pack`
- `pnpm exec vp test`
- `git diff --check`
- `pnpm exec vp test packages/compiler/test/semantic-alias-collector.test.ts packages/compiler/test/state-lowering.test.ts`
- `pnpm exec vp test packages/compiler/test/state-lowering.test.ts`
- `pnpm exec vp test packages/compiler/test/*.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-expression-collector.test.ts packages/compiler/test/state-lowering-delete.test.ts packages/runtime/test/runtime-graph.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-expression-collector.test.ts packages/compiler/test/state-lowering-update.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-expression-collector.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-expression-collector.test.ts packages/compiler/test/state-lowering.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-expression-collector.test.ts packages/compiler/test/state-lowering-delete.test.ts`
- `pnpm exec vp test packages/runtime/test/runtime-graph.test.ts`
- `pnpm exec vp test packages/runtime/test/*.test.ts`
- `pnpm exec vp test`

Historical spec/progress maintenance and build receipts retained for context:

- `pnpm exec vp check package.json pnpm-lock.yaml pnpm-workspace.yaml vite.config.ts packages specs/framework-design.md specs/state.md`
- `git diff --check`
- architecture/path scans
- `pnpm exec vp pack`

Latest POC resumer receipts:

- `node poc/fixtures/proofs/resumer-script/src/verify.mjs`
- `node poc/fixtures/proofs/resumer-script/src/size-report.mjs`
  (`rawBytes: 679`, `minifiedBytes: 465`, `gzipBytes: 346`,
  `targetBytes: 700`)
- `pnpm exec witness resumer-script --json`
  (`.witness/receipts/2026-06-16T03-51-05.612Z/receipt.json`)
- `rg -n "hydrate|hydration|VNode|vnode|virtual DOM|virtual-dom|packages/server"`
  over `poc/fixtures/proofs/resumer-script` (no matches)
- `git diff --check`

Latest implementation/build receipts for current package slices:

These commands were rerun during the implementation and ledger-update sequence
after the current package files were created or changed. They remain scoped
receipts, not permanent green status; rerun the relevant command before using it
as evidence for a new source change.

- `pnpm exec vp test packages/bundler/test/rolldown.test.ts packages/bundler/test/vite.test.ts`
- `pnpm exec vp test packages/bundler/test/rolldown.test.ts packages/bundler/test/vite.test.ts packages/bundler/test/witness.test.ts`
- `pnpm exec vp pack`
- `pnpm exec vp test`
- `pnpm exec vp test packages/compiler/test/state-lowering.test.ts packages/compiler/test/symbol-modules.test.ts packages/compiler/test/compile-module.test.ts`
- `pnpm exec vp test packages/compiler/test/*.test.ts packages/bundler/test/rolldown.test.ts packages/bundler/test/vite.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-graph.test.ts packages/compiler/test/payload-arena.test.ts packages/compiler/test/protocol-view.test.ts packages/compiler/test/symbol-resolver.test.ts packages/runtime/test/payload-scripts.test.ts packages/runtime/test/behaviors.test.ts packages/runtime/test/resume.test.ts packages/test-utils/test/payload-helpers.test.ts packages/protocol/test/protocol.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-graph.test.ts packages/compiler/test/symbol-resolver.test.ts packages/compiler/test/symbol-modules.test.ts`
- `pnpm exec vp test packages/runtime/test/behaviors.test.ts packages/runtime/test/payload-scripts.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-graph.test.ts packages/compiler/test/symbol-resolver.test.ts packages/compiler/test/symbol-modules.test.ts packages/compiler/test/compile-module.test.ts`
- `pnpm exec vp test packages/compiler/test/symbol-modules.test.ts packages/compiler/test/compile-module.test.ts`
- `pnpm exec vp test packages/compiler/test/symbol-modules.test.ts packages/compiler/test/compile-module.test.ts packages/compiler/test/symbol-resolver.test.ts`
- `pnpm exec vp test packages/compiler/test/symbol-modules.test.ts packages/compiler/test/compile-module.test.ts packages/compiler/test/state-lowering.test.ts packages/compiler/test/symbol-resolver.test.ts`
- `pnpm exec vp test packages/compiler/test/symbol-resolver.test.ts packages/compiler/test/symbol-modules.test.ts packages/compiler/test/compile-module.test.ts`
- `pnpm exec vp check packages/compiler/src/artifacts.ts packages/compiler/src/passes/symbol-resolver.ts packages/compiler/src/passes/symbol-modules.ts packages/compiler/test/symbol-resolver.test.ts packages/compiler/test/symbol-modules.test.ts packages/compiler/test/compile-module.test.ts specs/state.md`
- `pnpm exec vp pack`
- `pnpm exec vp test`
- `pnpm exec vp test packages/compiler/test/*.test.ts`
- `pnpm exec vp test packages/compiler/test/capture-analysis.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-*.test.ts`
- `pnpm exec vp test packages/compiler/test/state-lowering.test.ts packages/compiler/test/state-lowering-update.test.ts packages/compiler/test/state-lowering-delete.test.ts packages/compiler/test/semantic-expression-collector.test.ts`
- `pnpm exec vp test packages/compiler/test/module-split.test.ts packages/compiler/test/pass-pipeline.test.ts`
- `pnpm exec vp test packages/compiler/test/payload-arena.test.ts packages/compiler/test/symbol-resolver.test.ts packages/compiler/test/protocol-view.test.ts packages/compiler/test/symbol-resolver-emit.test.ts packages/compiler/test/compile-module.test.ts packages/runtime/test/payload-scripts.test.ts packages/serializer/test/payload-scripts.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-sync-policy-collector.test.ts packages/compiler/test/sync-policy.test.ts packages/compiler/test/semantic-diagnostics.test.ts packages/runtime/test/resume.test.ts packages/runtime/test/payload-scripts.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-diagnostics.test.ts packages/compiler/test/payload-arena.test.ts packages/compiler/test/protocol-view.test.ts packages/compiler/test/symbol-resolver.test.ts packages/runtime/test/behaviors.test.ts packages/runtime/test/resume.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-diagnostics.test.ts packages/compiler/test/semantic-graph.test.ts packages/compiler/test/semantic-collector-boundaries.test.ts packages/compiler/test/payload-arena.test.ts packages/compiler/test/protocol-view.test.ts packages/compiler/test/symbol-resolver.test.ts packages/runtime/test/runtime-graph.test.ts packages/runtime/test/resume.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-graph.test.ts packages/compiler/test/semantic-alias-collector.test.ts packages/compiler/test/state-lowering.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-graph.test.ts packages/compiler/test/semantic-collector-boundaries.test.ts packages/compiler/test/payload-arena.test.ts packages/compiler/test/protocol-view.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-graph.test.ts packages/compiler/test/semantic-diagnostics.test.ts packages/compiler/test/payload-arena.test.ts`
- `pnpm exec vp test packages/compiler/test/protocol-view.test.ts packages/runtime/test/resume.test.ts`
- `pnpm exec vp test packages/compiler/test/symbol-resolver.test.ts packages/compiler/test/symbol-resolver-emit.test.ts packages/compiler/test/compile-module.test.ts packages/bundler/test/rolldown.test.ts packages/bundler/test/vite.test.ts`
- `pnpm exec vp test packages/compiler/test/protocol-view.test.ts packages/compiler/test/symbol-resolver.test.ts packages/runtime/test/resume.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-diagnostics.test.ts packages/compiler/test/payload-arena.test.ts packages/compiler/test/protocol-view.test.ts packages/runtime/test/behaviors.test.ts packages/runtime/test/payload-scripts.test.ts`
- `pnpm exec vp test packages/serializer/test/payload-scripts.test.ts packages/runtime/test/payload-scripts.test.ts packages/test-utils/test/payload-helpers.test.ts packages/compiler/test/compile-module.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-diagnostics.test.ts packages/compiler/test/semantic-diagnostic-constructors.test.ts packages/compiler/test/state-lowering.test.ts packages/compiler/test/state-lowering-delete.test.ts packages/compiler/test/capture-analysis.test.ts packages/compiler/test/symbol-resolver-emit.test.ts packages/serializer/test/serializer.test.ts`
- `pnpm exec vp test packages/runtime/test/resume.test.ts packages/runtime/test/payload-scripts.test.ts packages/runtime/test/behaviors.test.ts packages/runtime/test/dom-updates.test.ts`
- `pnpm exec vp test packages/runtime/test/runtime-graph.test.ts packages/runtime/test/resume.test.ts`
- `pnpm exec vp test packages/compiler/test/compile-module.test.ts packages/compiler/test/pass-pipeline.test.ts packages/bundler/test/rolldown.test.ts packages/bundler/test/vite.test.ts`
- `pnpm exec vp test packages/compiler/test/symbol-resolver-emit.test.ts packages/compiler/test/semantic-diagnostic-constructors.test.ts`
- `pnpm exec vp test packages/compiler/test/payload-arena.test.ts packages/compiler/test/protocol-view.test.ts packages/compiler/test/symbol-resolver.test.ts packages/compiler/test/compile-module.test.ts packages/runtime/test/dom-updates.test.ts packages/runtime/test/resume.test.ts`
- `pnpm exec vp test packages/compiler/test/compile-module.test.ts packages/serializer/test/payload-scripts.test.ts packages/serializer/test/serializer.test.ts`
- `pnpm exec vp test packages/runtime/test/runtime-graph.test.ts`
- `pnpm exec vp test packages/compiler/test/sync-policy.test.ts`
- `pnpm exec vp test packages/protocol/test/*.test.ts`
- `pnpm exec vp test packages/runtime/test/resume.test.ts`
- `pnpm exec vp test packages/runtime/test/resume.test.ts packages/runtime/test/payload-scripts.test.ts packages/runtime/test/behaviors.test.ts`
- `pnpm exec vp test packages/runtime/test/*.test.ts`
- `pnpm exec vp test`
- `pnpm exec vp test packages/vitest-browser/test/render.test.ts`
- `pnpm exec vp test packages/runtime/test/resume.test.ts packages/runtime/test/payload-scripts.test.ts packages/runtime/test/behaviors.test.ts packages/runtime/test/dom-updates.test.ts`
- `pnpm exec vp test packages/serializer/test/serializer.test.ts`
- `pnpm exec vp test packages/arcade/test/public-surface.test.ts packages/bundler/test/rolldown.test.ts packages/bundler/test/vite.test.ts`
- `pnpm exec vp test packages/core/test/framework-api.test.ts packages/protocol/test/protocol.test.ts packages/test-utils/test/payload-helpers.test.ts`
- `pnpm exec vp test packages/bundler/test/vite.test.ts`
- `pnpm exec vp test packages/bundler/test/rolldown.test.ts packages/bundler/test/vite.test.ts packages/arcade/test/public-surface.test.ts`
- `pnpm exec vp test packages/compiler/test/symbol-resolver.test.ts packages/compiler/test/symbol-modules.test.ts packages/compiler/test/compile-module.test.ts packages/bundler/test/*.test.ts packages/arcade/test/public-surface.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-graph.test.ts`
- `pnpm exec vp test packages/core/test/framework-api.test.ts packages/compiler/test/semantic-graph.test.ts packages/compiler/test/state-lowering.test.ts packages/compiler/test/state-lowering-delete.test.ts packages/compiler/test/state-lowering-update.test.ts`
- `pnpm exec vp test packages/compiler/test/*.test.ts packages/core/test/framework-api.test.ts`
- `pnpm exec vp pack`
- `pnpm exec vp test`
- `pnpm exec vp test packages/compiler/test/semantic-graph.test.ts packages/compiler/test/semantic-diagnostics.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-graph.test.ts packages/compiler/test/semantic-diagnostics.test.ts packages/compiler/test/semantic-*.test.ts packages/compiler/test/module-split.test.ts packages/compiler/test/pass-pipeline.test.ts`
- `pnpm exec vp test packages/compiler/test/*.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-graph.test.ts packages/compiler/test/state-lowering.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-*.test.ts packages/compiler/test/state-lowering*.test.ts packages/compiler/test/graph-paths.test.ts packages/compiler/test/payload-arena.test.ts packages/compiler/test/protocol-view.test.ts packages/compiler/test/compile-module.test.ts`
- `pnpm exec vp check packages/compiler/src/artifacts.ts packages/compiler/src/artifact-helpers/graph-paths.ts packages/compiler/src/passes/semantic-graph/types.ts packages/compiler/src/passes/semantic-graph/collect-aliases.ts packages/compiler/src/passes/semantic-graph/collect-async.ts packages/compiler/src/passes/semantic-graph/collect-expressions.ts packages/compiler/src/passes/semantic-graph/collect-shared.ts packages/compiler/src/passes/semantic-graph/collect-state.ts packages/compiler/src/passes/semantic-graph/index.ts packages/compiler/src/passes/state-lowering.ts packages/compiler/test/semantic-graph.test.ts packages/compiler/test/state-lowering.test.ts`
- `pnpm exec vp test packages/compiler/test/*.test.ts`
- `pnpm exec vp pack`
- `pnpm exec vp test`
- `pnpm exec vp test packages/compiler/test/semantic-graph.test.ts packages/compiler/test/state-lowering.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-*.test.ts packages/compiler/test/state-lowering*.test.ts packages/compiler/test/graph-paths.test.ts packages/compiler/test/payload-arena.test.ts packages/compiler/test/protocol-view.test.ts packages/compiler/test/compile-module.test.ts`
- `pnpm exec vp check packages/compiler/src/artifacts.ts packages/compiler/src/artifact-helpers/graph-paths.ts packages/compiler/src/passes/semantic-graph/types.ts packages/compiler/src/passes/semantic-graph/collect-aliases.ts packages/compiler/src/passes/semantic-graph/collect-async.ts packages/compiler/src/passes/semantic-graph/collect-expressions.ts packages/compiler/src/passes/semantic-graph/collect-shared.ts packages/compiler/src/passes/semantic-graph/collect-state.ts packages/compiler/src/passes/semantic-graph/index.ts packages/compiler/src/passes/state-lowering.ts packages/compiler/test/semantic-graph.test.ts packages/compiler/test/state-lowering.test.ts specs/state.md`
- `pnpm exec vp test packages/compiler/test/*.test.ts`
- `pnpm exec vp pack`
- `pnpm exec vp test`
- `pnpm exec vp test packages/compiler/test/state-lowering.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-graph.test.ts packages/compiler/test/state-lowering.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-*.test.ts packages/compiler/test/state-lowering*.test.ts packages/compiler/test/graph-paths.test.ts packages/compiler/test/payload-arena.test.ts packages/compiler/test/protocol-view.test.ts packages/compiler/test/compile-module.test.ts`
- `pnpm exec vp check packages/compiler/src/artifacts.ts packages/compiler/src/artifact-helpers/graph-paths.ts packages/compiler/src/passes/semantic-graph/types.ts packages/compiler/src/passes/semantic-graph/collect-aliases.ts packages/compiler/src/passes/semantic-graph/collect-async.ts packages/compiler/src/passes/semantic-graph/collect-expressions.ts packages/compiler/src/passes/semantic-graph/collect-shared.ts packages/compiler/src/passes/semantic-graph/collect-state.ts packages/compiler/src/passes/semantic-graph/index.ts packages/compiler/src/passes/state-lowering.ts packages/compiler/test/semantic-graph.test.ts packages/compiler/test/state-lowering.test.ts specs/state.md`
- `pnpm exec vp test packages/compiler/test/*.test.ts`
- `pnpm exec vp pack`
- `pnpm exec vp test`
- `pnpm exec vp test packages/runtime/test/payload-scripts.test.ts`
- `pnpm exec vp test packages/runtime/test/resume.test.ts`
- `pnpm exec vp test packages/runtime/test/runtime-graph.test.ts packages/runtime/test/payload-scripts.test.ts packages/runtime/test/resume.test.ts`
- `pnpm exec vp check packages/runtime/src/graph.ts packages/runtime/src/resume.ts packages/runtime/test/resume.test.ts packages/runtime/test/payload-scripts.test.ts specs/state.md`
- `pnpm exec vp test`
- `pnpm exec vp pack`
- `git diff --check`
- `rg -n "hydrate|hydration|VNode|vnode|virtual DOM|virtual-dom|packages/server|from 'node:|from \"node:|require\\('node:|require\\(\"node:" packages/compiler/src packages/protocol/src packages/serializer/src packages/runtime/src packages/compiler/test packages/runtime/test specs/state.md`
- `pnpm exec vp test packages/compiler/test/semantic-graph.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-*.test.ts packages/compiler/test/state-lowering*.test.ts packages/compiler/test/graph-paths.test.ts`
- `pnpm exec vp test packages/compiler/test/payload-arena.test.ts packages/compiler/test/protocol-view.test.ts packages/compiler/test/protocol-state.test.ts packages/compiler/test/compile-module.test.ts`
- `pnpm exec vp test`
- `pnpm exec vp pack`
- `(from packages/bundler) pnpm exec witness "csr build: bundle graph describes tsrx symbols without default manifest" --json`
- `(from packages/bundler) pnpm exec witness "csr preview: built app loads through vite preview" --json`
- `(from packages/bundler) pnpm exec witness "ssr build: Rolldown server entry renders payload shell" --json`
- `(from packages/bundler) pnpm exec witness "ssr preview: built server entry shell resumes counter click" --json`
- `(from packages/bundler) pnpm exec witness "vite-plus preview: built app loads arcade output" --json`
- `(from packages/bundler) pnpm exec witness --json` (latest receipt:
  `packages/bundler/.witness/receipts/2026-06-16T00-37-49.165Z/receipt.json`)
- `pnpm exec vp test packages/bundler/test/*.test.ts packages/arcade/test/public-surface.test.ts`
- `pnpm exec vp test packages/bundler/test/fixture-builds.test.ts`
- `(from repo root) pnpm --filter @arcade/bundler exec witness run ssr-preview --mode preview`
  (receipt:
  `packages/bundler/.witness/receipts/2026-06-16T16-19-07.583Z/receipt.json`;
  records startup script requests `(none)`, post-click requested lazy chunks,
  largest runtime-heavy post-click chunk at 43,623 raw / 12,500 gzip
  bytes, and all post-click async scripts at 45,658 raw / 13,486 gzip bytes)
- `pnpm exec vp test packages/runtime/test/event-resume.test.ts packages/runtime/test/module-split.test.ts packages/arcade/test/public-surface.test.ts packages/bundler/test/fixture-boundaries.test.ts`
- `pnpm exec vp test packages/bundler/test/fixture-builds.test.ts`
- `(from repo root) pnpm --filter @arcade/bundler exec witness run ssr-preview --mode preview`
  (receipt:
  `packages/bundler/.witness/receipts/2026-06-16T16-31-44.234Z/receipt.json`;
  records startup script requests `(none)`, post-click requested lazy chunks,
  largest runtime-heavy post-click chunk at 8,258 raw / 3,154 gzip
  bytes, and all post-click async scripts at 10,293 raw / 4,140 gzip bytes)
- `pnpm exec vp pack`; focused compiler/bundler/runtime/arcade tests; local js-framework-benchmark quick comparisons against `vanillajs-keyed` and `vanillajs-3-keyed`; `npm run rebuild-ci -- keyed/arcade` passed smoke, memory, size, keyed, and CSP checks

Current spec/ledger-maintenance receipts:

These checks were rerun or directly refreshed while updating the design index and
progress ledger. They cover documentation whitespace/formatting, package
formatting/lint coverage through `vp check`, inventory facts, and guardrail
scans. They do not refresh implementation test or pack receipts unless those
commands are listed in the implementation/build section above.

- `git diff --check`
- `pnpm exec vp check packages/compiler/src/artifacts.ts packages/compiler/src/artifact-helpers/graph-paths.ts packages/compiler/src/passes/semantic-graph/types.ts packages/compiler/src/passes/semantic-graph/collect-aliases.ts packages/compiler/src/passes/semantic-graph/collect-async.ts packages/compiler/src/passes/semantic-graph/collect-expressions.ts packages/compiler/src/passes/semantic-graph/collect-shared.ts packages/compiler/src/passes/semantic-graph/collect-state.ts packages/compiler/src/passes/semantic-graph/index.ts packages/compiler/src/passes/state-lowering.ts packages/compiler/test/semantic-graph.test.ts packages/compiler/test/state-lowering.test.ts specs/state.md`
- guardrail scan over the touched compiler source/test files for Node-only
  imports, hydration/VDOM markers, `packages/server`, and disallowed build-tool
  references had no matches; the broader scan including this ledger only hit
  expected ledger text.
- `pnpm exec vp fmt --check .gitignore packages/compiler/src/artifacts.ts packages/compiler/src/passes/symbol-resolver.ts packages/compiler/src/compile-module.ts packages/compiler/src/passes/symbol-modules.ts packages/compiler/test/symbol-modules.test.ts packages/compiler/test/symbol-resolver.test.ts packages/bundler/test/rolldown.test.ts packages/bundler/boxes/csr-build.box.ts specs/state.md`
- `pnpm exec vp fmt --check specs/framework-design.md specs/state.md specs/framework/*.md`
- `pnpm exec vp check package.json pnpm-lock.yaml pnpm-workspace.yaml vite.config.ts packages specs/framework-design.md specs/state.md specs/framework/*.md`
- code-fence scan over current implementation-facing specs confirmed no `tsx`
  or `jsx` fence labels remain outside the historical archive.
- terminology scan over current split specs confirmed generic current-contract
  SSR/server-rendering references were replaced with initial-render or
  render/resume wording; explicit Streaming SSR deferred-decision text remains.
- build-order scan confirmed no current split spec asks for a CSR-first compiler
  demo path.
- status-wording scan confirmed current native/compiler-substrate language says
  first compiler implementation rather than first prototype; remaining
  prototype references are explicit temporary-prototype guardrails.
- architecture scan over `packages` and the edited spec files for accidental
  Node-only APIs, hydration/VDOM/client-rerender paths, `packages/server`, and
  TSX/JSX references; hits were expected non-goal/contrast text or local
  implementation identifiers such as DOM node variables and `ArrayBuffer`.
- diagnostic code scan compared implemented `ARCADE_*` diagnostics against the
  diagnostics split spec and replaced placeholder example code/domain text with
  implemented stable diagnostic shapes.
- diagnostic inventory audit confirmed 27 implemented `ARCADE_*` codes across
  semantic graph, state lowering, capture analysis, serializer unsupported-value,
  generated unknown-symbol resolver paths, and runtime payload decode/version
  paths, resume locator paths, direct framework API runtime-call paths, and compiler
  pass-graph validation paths, and aligned the diagnostics spec phase list with
  the implemented `semantic-graph` phase.
- diagnostic-scope audit confirmed current diagnostics coverage includes
  package/artifact-level object shapes for compiler passes, serializer
  unsupported-value failures, generated unknown-symbol resume errors, runtime
  payload/resume errors, framework API runtime errors, and compiler
  pass-graph validation errors.
- diagnostic-docs audit confirmed current package source and tests use hard-coded
  `https://arcadejs.com/errors/...` URL shapes, while the repo currently has
  no docs, site, route, or error-page artifact for those URLs. Current evidence
  proves URL shape only, not published documentation.
- semantic-collector audit confirmed current semantic graph coverage is
  concentrated in eight focused `semantic-*.test.ts` files plus pass-boundary
  tests for module split and pass graph validation.
- async-boundary audit confirmed current coverage is focused on compiler
  diagnostics for post-`await` reads and missing async boundaries, payload/view
  runner symbol wiring, runtime async request versioning/stale suppression, and
  Node fake-DOM boundary runner dispatch for pending/fulfilled status changes.
- runtime-async-status audit confirmed the graph source has pending, fulfilled,
  and rejected async snapshot paths and applies version/abort guards before
  fulfilled and rejected commits. Focused runtime tests now assert
  pending/fulfilled snapshots, stale fulfilled/rejected completion suppression,
  and a committed rejected snapshot after a pending demand has flushed.
- runtime-async-demand audit confirmed initial async-computed demand sets the
  node to pending, marks the async binding dirty, and schedules the same
  microtask flush path used by graph writes. Focused runtime tests now cover
  standalone demanded async computed auto-flush and same-key invalidation skips.
- async-boundary DOM audit confirmed current resume tests use a boundary runner
  symbol that returns `setText` journal entries for pending/fulfilled status; no
  package source or test applies pending, fulfilled, or catch branch DOM
  replacement between async boundary anchors.
- state-lowering audit confirmed current coverage is focused on semantic
  expression collection plus state-lowering artifact tests for assignment RHS
  source metadata, update metadata, selected static collection-call artifacts
  (`push`, `Map.set`, `Set.add`, and static computed method literals), static
  deletes, selected aliases, and selected diagnostics; runtime graph tests
  separately cover broader Array/Map/Set method behavior.
- sync-event-policy audit confirmed current coverage is focused on compiler
  policy IR for graph-state truthiness, event-field equality, `and`/`or`/`not`
  composition, serializable literal constant truthiness, static property reads on
  serializable const object literals, static array-index reads on serializable
  const array literals, selected computed serializable const expressions,
  module-scope serializable const declarations, one unextractable-policy
  diagnostic shape, handler-array policy branches, and Node fake-DOM runtime
  evaluation before lazy symbol dispatch.
- sync-policy prop/constant audit confirmed current compiler, protocol, and
  runtime condition IR supports graph truthiness, event-field equality, and
  serializable constant truthiness for component-local and module-scope literal
  const declarations, static property/index reads on const object/array literals,
  and selected pure computed const expressions. Focused compiler/runtime coverage proves
  `const allowEscape = true`, `const shortcut = { allowEscape: true }`,
  `const shortcut = [2 > 1]`, and `const allowEscape = (2 > 1) && !false`
  guards flowing through semantic graph, payload/protocol view records, and
  resume sync-policy execution, plus a module-scope `const allowEscape = true`
  guard flowing through the compiler artifact/payload path. It does not cover
  prop reads, imported constants, or computed constant forms outside the current
  literal/unary/logical/binary/conditional subset in synchronous policy guards.
- onVisible audit confirmed event collection uses the generic `on*` attribute
  path from `@tsrx/core`, producing a `visible` event name for runtime records.
  The resume runtime now keeps `visible` records out of delegated DOM event
  listeners and wires them through one injected observer hook per resumed root in
  the Node fake-DOM test path, with fallback to a structural
  `globalThis.IntersectionObserver` when no observer factory is injected. Focused
  runtime coverage proves one-shot visibility triggering, lazy symbol loading in
  authored order, ignored non-intersecting entries, unobserve after first
  intersection, returned cleanup storage, reverse cleanup on explicit host
  disposal, unobserve on explicit host disposal before first intersection, and
  ignored post-disposal observer entries. Focused runtime coverage also proves
  visible symbols receive current graph reads at first intersection without
  subscribing or rerunning after later graph writes, and that an injected
  structural removal observer routes removed host subtrees through cleanup for
  visible and behavior cleanups. It does not prove generated-build integration,
  real-browser removal timing, or real browser observer timing.
- event-handler-array audit confirmed protocol/compiler tests preserve ordered
  handler sources and event `symbolIds` for handler arrays, and the resume source
  iterates those IDs sequentially. Runtime fake-DOM coverage now proves multiple
  handlers on one event, stop at the first rejected handler, skipped later
  handlers, committed-write preservation for earlier handlers, ignored ordinary
  return values, dispatch `try`/`finally` flush before rethrowing, and app-level
  error-hook reporting for a rejected `loadSymbol` before the handler body runs.
  It still does not cover normal error-boundary routing, handler-body
  error-hook assertions, or browser default-action timing.
- element-handle runtime audit confirmed compiler/payload/protocol tests carry
  `elementHandles` records with `hostNodeId`, `handleId`, and local `name`, and
  runtime payload-resume tests expose `getElement(hostNodeId)` for host-node
  lookup. Runtime symbol context now exposes `getElementHandle(...)` for lazy
  symbols; focused Node fake-DOM coverage proves lookup by stable handle ID,
  lookup by local authored name, `undefined` for unmatched handle locators, and
  `undefined` for handle ID/name lookups after explicit host disposal. Focused
  resume-runtime coverage also proves explicit host disposal invalidates
  `getElement(hostNodeId)` and prevents that disposed host's delegated event
  record from dispatching. It does not prove initial-render absence, handles
  after real DOM removal, or browser document locator behavior.
- behavior-lifecycle audit confirmed compiler/protocol tests preserve behavior
  source records, behavior function/input source metadata, simple
  literal/static-state `inputValues`, graph-backed `inputGraphReads`, and symbol
  IDs in authored/view order.
  Current focused runtime coverage proves behavior payloads do not load app
  behavior code during startup, explicit
  `activateBehaviors(hostNodeId)` imports behavior symbols in order, passes
  optional payload or graph-read `inputValues` to symbol context, stores cleanup
  callbacks, cleans prior behavior installs in reverse order before reruns and on
  explicit host disposal, avoids loading behavior symbols for graph input changes
  before activation, reruns active behavior hosts when graph-backed behavior
  inputs change, activates same-host behaviors from ordinary event and
  `onVisible` triggers, and avoids duplicate behavior installs on repeated
  ordinary events after activation. No package source currently wires declared
  policy triggers to behavior activation, serializes computed/opaque/dynamic
  behavior input values, or proves input-change reruns against real browser DOM
  removal/timing.
- element/behavior audit confirmed current coverage is focused on compiler
  diagnostics and payload records for `el` / `attach`, behavior symbol planning,
  behavior function/input source metadata, and Node fake-DOM runtime behavior
  record/startup-no-load paths.
- capture-analysis audit confirmed current coverage is focused on semantic
  `localBindings` categories, planned symbol sources, selected alias/destructuring
  propagation, one positive `Date` serializable-constant case, `Map`
  non-serializable-content cases, and selected false-positive guards for strings,
  property keys, method keys, parameters, and top-level symbol body declarations.
- payload/symbol audit confirmed current coverage is focused on compiler
  `payload-arena`, `symbol-resolver`, `protocol-view`, `symbol-modules`,
  `symbol-resolver-module`, and `payload-scripts` artifacts, serializer JSON
  data-script wrappers, and runtime payload decoding/resume helpers against
  small Node fake-DOM fixtures.
- payload-script audit confirmed `renderPayloadScripts` serializes the current
  protocol state/view objects with `JSON.stringify`, escapes `<` inside the JSON,
  and wraps the results in canonical `arcade/state` / `arcade/view` script tags.
  It does not implement compact typed tables, compression, streaming, or private
  production arena encoding.
- payload-script wrapper audit confirmed serializer tests assert both opening
  and closing `arcade/state` / `arcade/view` tags, and the runtime parser requires
  the exact prefix and suffix before `JSON.parse`. The separate test-utils
  helper now also requires the exact prefix/suffix, parses canonical payload
  script JSON, can summarize decoded payload scripts for fixture assertions, and
  can project those scripts into a human-readable debug dump of state/view IDs,
  names, counts, symbols, and locator indexes.
- runtime-payload audit confirmed `decodePayloadScripts` validates the canonical
  script wrapper and shared protocol version after `JSON.parse`, while
  `createRuntimeGraphFromStatePayload` deserializes protocol state cell values
  into runtime graph cells only. Current runtime tests prove top-level
  structural validation for required state/view fields such as `cells` and
  `events`, plus nested validation for state cells and the current view record
  arrays: locators, events, DOM updates, behaviors, element handles, and async
  boundary records. Nested sync-policy validation now covers branch arrays,
  supported sync actions, and current condition variants. Payload decode,
  document lookup, structural validation, and protocol-version failures now use
  structured `RuntimePayloadError` metadata, including stable code, docs URL,
  payload type, script selector, suggestions, and expected/actual versions for
  protocol mismatches.
- diagnostic-surface audit confirmed current structured diagnostic coverage is
  concentrated in compiler pass artifacts, serializer result diagnostics, and
  generated resolver unknown-symbol metadata; protocol-state serialization
  failures, runtime payload decode/version failures, and resume locator
  materialization failures now have structured error surfaces, and core
  framework API runtime failures plus compiler pass-graph validation
  failures now expose structured metadata.
- runtime payload-resume audit confirmed `resumeFromPayloadScripts` composes
  payload decoding, runtime graph creation, `arcade/view` materialization, and
  delegated event/boundary startup for caller-supplied payload strings and a
  DOM-like root. It now also proves an async computed runner symbol is not loaded
  during startup, is loaded only when the async computed is demanded from the
  resumed graph, receives the current dependency key, `AbortSignal`, and graph
  `read`, commits its return value as async graph data without appending DOM
  journal entries, and is skipped for an already fulfilled async computed
  snapshot until dependency-key invalidation demands revalidation. It also proves
  serialized pending async computed snapshots stay startup-lazy but restart the
  runner on first graph demand, while resume-runtime tests separately prove
  structural async-boundary range journal entries for pending and fulfilled
  snapshots, including async reads with value paths such as `details.title`.
  `decodePayloadScriptsFromDocument` and
  `resumeFromPayloadDocument` add structural document-like `querySelector`
  coverage for locating canonical `arcade/state` / `arcade/view` script contents.
  They do not prove real DOM/browser startup behavior.
- locator-materialization audit confirmed current runtime source uses recursive
  `childNodes` walks over fake element/comment nodes, filters element locators by
  case-insensitive tag name, and reports structured `ARCADE_RESUME_LOCATOR_MISSING`
  / `ARCADE_RESUME_LOCATOR_MISMATCH` errors for missing DOM-order element locators,
  tag-mismatched element locators, and missing async boundary comment anchors.
  It does not use a browser-native `TreeWalker`, skip static runs,
  ignored/nested-region metadata, or branch/list anchor streams.
- package/spec inventory scan confirmed nine production package manifests, no
  `packages/server` manifest, and split spec files `00` through `09` under
  `specs/framework/`.
- path-reference audit normalized ledger source/spec paths to repo-root
  `specs/...` paths where they appear beside repo-root `packages/...` paths.
- evidence-anchor audit aligned compiler pass-boundary pointers with the current
  concrete compiler files, including `pass-graph.ts`, `pass-registry.ts`,
  `ast/*`, and `artifact-helpers/*`.
- compiler-pass-registry audit confirmed the default registry exposes nine pass
  IDs with declared `consumes` / `produces` boundaries, `compileTsrxModule`
  returns the validated pass graph, and current pass execution is still manually
  wired through pass-owned module calls.
- compiler-pass-graph audit confirmed `validateCompilerPassGraph` rejects
  duplicate pass IDs, missing artifacts, duplicate artifact producers, and
  dependency cycles with structured `CompilerPassGraphError` metadata, while
  successful validation still returns runnable ordering and artifact keys.
- non-compiler evidence-anchor audit aligned runtime, serializer, public-surface,
  and adapter pointers with current concrete entry files instead of broad source
  globs.
- test inventory scan confirmed 47 package test files currently match the root
  vite-plus Node test include, `packages/*/test/**/*.test.ts`.
- package-manifest audit confirmed the current framework package manifests are
  `private`, export source entry points under `./src/...`, and are not wired to
  generated `dist/` artifacts. Retired `packages/core`, `packages/protocol`,
  and `packages/test-utils` manifests are absent.
- workspace/build-config audit confirmed root scripts are thin vite-plus aliases,
  `pnpm-workspace.yaml` uses `packages/*`, package fixture globs, and
  `demos/*` as workspace package globs while keeping shared dependency versions
  in the default pnpm catalog, and the current `vite.config.ts` uses a flat
  source map for `vp pack` plus Node package/script test includes.
- pack-output audit confirmed `pnpm exec vp pack` currently cleans the untracked
  root `dist/` directory and emits 36 ESM/declaration files for the configured
  fourteen-entry source map plus hashed shared chunks. The command still reports
  dependency-bundling hints for packages such as `pathe`, `acorn`, and TSRX
  parser support dependencies.
- initial-render gap scan confirmed the runtime package currently exposes graph,
  payload, and resume-helper modules, but no runtime initial-render entry,
  document-scanning browser bootstrap, or initial-render package test.
- initial-render remaining-work audit clarified that payload-script rendering is
  not the initial-render runtime pipeline.
- final-emission audit confirmed current compiler/adapter output stops at
  artifact orchestration, payload script rendering, generated resolver strings,
  and Rolldown virtual module metadata. `transformTsrxModule` emits an
  `__arcade_module` export plus resolver, payload, current
  event-handler-symbol, DOM-update-symbol, and manifest virtual module IDs; it
  now statically imports the generated resolver/payload/manifest virtual modules
  so a Vite library build loads them, and the generated resolver can pull the
  current generated symbol virtual modules into build output. The build manifest
  hook now maps generated virtual module IDs to output file names when bundler
  metadata exposes them. The client bundle hook rewrites the generated resolver's
  compact table URLs from generated virtual module IDs to final relative chunk
  specifiers for the current generated symbol path, but it does not emit executable
  component code, lowered state access code beyond simple event-handler update
  modules, behavior/async modules, broad non-binding generated symbol chunks, or
  initial-render/browser resume
  entry code.
- template-binding audit confirmed current semantic/payload/protocol records for
  template reads now carry graph-path subscriptions, text or plain-attribute
  target metadata, common DOM property target metadata for `value`, `checked`,
  and `selected`, class/style target metadata, and optional binding symbol IDs.
  No package source yet classifies template reads as range binding metadata, and
  no current compiler artifact emits the generated DOM mutation code needed by
  final emit.
- bundler-adapter source/test audit confirmed current Rolldown coverage is a
  unit-level plugin shell whose `transform` compiles `.tsrx` modules with
  caller-supplied symbol tables, stores resolver, payload, generated-symbol,
  and manifest virtual module strings in an in-memory map, resolves and loads
  those produced virtual module IDs, derives compact resolver table rows for
  those generated virtual modules, skips re-transforming generated virtual module IDs, imports
  generated payload/resolver/manifest modules from the transformed entry, returns
  a transform manifest object, and exposes accumulated transform manifests plus
  any bundle-exposed generated virtual-module output filenames through the
  in-memory manifest hook; `generateBundle` emits `build/bundle-graph.json` by
  default and emits `arcade-manifest.json` only when `emitManifestJson` is
  explicitly enabled. For current generated event-handler and DOM-update symbols,
  it also records finalized symbol rows when the symbol's virtual module has an
  emitted file name, while the emitted public module manifests omit the internal
  pre-build symbol rows.
  Repeated transforms for the same `.tsrx` module drop the previous transform's
  virtual module IDs from the in-memory resolver before registering the new
  artifacts, preventing stale generated symbol virtual modules from surviving an
  HMR-style source update that removes a binding. The current Vite adapter wraps that shell and
  forwards `transform`, `resolveId`, `load`, and `generateBundle`; its
  structural `configureServer` / `handleHotUpdate` hooks capture a Vite dev
  server, invalidate any known generated virtual module graph nodes for the
  changed `.tsrx` file, return those nodes with the changed source module, and
  emit a custom `arcade:update` payload listing the changed module ID
  and generated virtual module IDs. Its `transformIndexHtml` hook injects an
  inert `arcade:dev` marker tag plus a requestable virtual dev-client
  module only for Vite dev HTML contexts; that virtual client listens for the
  custom Vite event and redispatches it as a cancelable browser `CustomEvent`.
  A focused executable virtual-client test proves the dispatcher invalidates the
  Vite HMR module only when no consumer calls `preventDefault()`. A temporary
  Vite dev-server fixture proves `transformIndexHtml` injects that marker and
  client URL, `transformRequest('/@arcade/dev-client')` serves the
  virtual client, and `transformRequest('/App.tsrx')` loads and transforms a
  `.tsrx` source file through Vite. One direct Rolldown build fixture and one
  temporary Vite library build fixture now prove real builds write the bundle
  graph by default, omit default `arcade-manifest.json`, include generated
  payload/resolver/current event-handler and DOM-update symbol code, record
  emitted file names plus finalized symbol rows for those generated virtual
  modules, rewrite the compact resolver table to use those generated symbols'
  final relative chunk specifiers, and keep internal pre-build symbol rows out of
  emitted module manifests. `buildStart` clears generated virtual modules plus
  accumulated transform manifests before a new build/dev cycle, preventing stale
  virtual module resolution/loading and stale manifest metadata/optional asset
  emission in focused tests.
  Package-local Witness boxes now prove Vite dev HMR payload delivery, real
  browser receipt of the cancelable `arcade:update` event without
  navigation, and a CSR production build with bundle-graph artifacts, no default
  `arcade-manifest.json`, plus no dev-HMR string leakage. The same CSR production build is now served
  through Vite preview and proves client-created DOM can load the generated
  payload/resolver/symbol pipeline for a counter click with no console errors or
  failed requests. A Vite SSR fixture now builds a server entry that contains
  counter DOM plus payload scripts, and a package-local SSR browser box imports
  that built entry, serves its generated HTML through Vite preview with the
  built client chunks, and proves the browser entry resumes that existing DOM
  through the generated resolver for a `0` to `1` click update. No fixture
  proves real DOM hot replacement beyond the fixture-level custom-event
  consumer, production SSR server-environment serving beyond the preview-index
  harness, behavior/async-runner chunks, broader event-handler write chunks
  beyond simple updates, or full resolver table rewriting coverage beyond the
  current generated build fixture paths.
- public-surface source/test audit confirmed `packages/arcade` owns framework
  APIs directly, re-exports `resumeFromPayloadScripts`, the Rolldown adapter,
  and its `./vite` adapter subpath through private source-entry package
  manifests; current tests import those source entries directly rather than
  proving installed package export resolution.
- authoring/protocol/test-helper audit confirmed coverage for structured
  runtime failure metadata for compiler-rewritten framework APIs, serializer-owned
  protocol version/type fixtures, canonical payload script wrapper assertions,
  JSON script decoding, selected protocol record-count summaries for cells,
  computed entries, locators, events, DOM updates, behaviors, element handles,
  and async boundaries, plus a decoded human-readable payload debug dump for
  fixture assertions. It still does not prove public API stability for internal
  packages, protocol migration/version negotiation, browser helpers, or witness
  integration helpers.
- shared-state audit confirms current `shared()` support covers the
  `arcade` framework API stub, the authored
  `shared(factory, options?)` call shape, the main package re-export,
  public-surface presence checks, diagnostic suggestion text, and semantic graph
  records for same-module exported shared definitions plus component-local
  instance calls with source-module definition IDs, explicit named `.tsrx`
  imported shared instance calls with stable source/export definition IDs,
  same-module shared
  definition dependencies, shared-definition cycle diagnostics, and
  factory-internal graph bindings/read-write lowering with shared-scoped graph
  IDs, plus graph-backed shared factory return properties and component
  shared-instance property read/write lowering through those return properties.
  Dynamic shared-instance property access now reports dynamic graph-path
  diagnostics instead of falling through to unresolved writes. Payload arena and
  protocol-state tests now prove shared-definition metadata records with owned
  graph node IDs, return properties, and initial version counters. Runtime
  payload tests prove decoded shared graph writes increment shared definition
  versions and collect plain-data shared patch records for exposed shared paths.
  Resume-runtime tests prove lazy event writes drain those shared patches after
  graph flush and dispatch a private browser shared-patch event from the root
  container, and remote shared-patch events fold newer records into the local
  graph without re-emitting them.
  It does not prove cross-module shared definition discovery beyond explicit
  named `.tsrx` import specifiers, imported shared return-property lowering,
  graph-context resolution, scoped instance creation, browser resume of shared
  instances beyond direct graph-backed property reads/writes, stale/competing
  cross-runtime conflict policy beyond version skips, or multi-container browser
  propagation.
- props/projection audit confirmed current component parameter support is limited
  to first-parameter synthetic `prop` graph bindings, object-pattern aliases,
  prop reads, and read-only prop-write diagnostics. This is a compiler-artifact
  path only; no current package source emits runtime getter-backed prop wiring,
  component-boundary prop propagation, children projection artifacts, projection
  payload metadata, or React-style child manipulation diagnostics.
- control-flow identity audit confirmed the semantic walker descends generic
  `childNodes()` for non-special AST nodes and gives only `TryStatement` a
  dedicated async-boundary context. No current focused fixture exercises authored
  TSRX `@if`, `@for`, or `@switch`, and no package source emits keyed loop
  identity records, branch-local graph scope records, unkeyed stateful-loop
  diagnostics, branch/list locator streams, or control-flow disposal metadata.
- dynamic-tag/style audit confirmed current element collection derives static
  host/component classification from identifier tag names and lowercase host
  names, and tests static component-vs-host `attach` diagnostics. The current split
  specs only list dynamic tags/components and scoped styles as TSRX baseline
  syntax; no package source emits dynamic tag/component artifacts, dynamic
  ownership diagnostics, style-scope records, style-composition records, or
  scoped-style payload metadata.
- authored-comment/scope audit confirmed current generic AST traversal ignores
  `leadingComments` / `trailingComments`, payload planning assigns generated
  async-boundary anchors to raw `dom-order-comment` indexes, and runtime resume
  materializes those indexes by walking every comment node under the root. No
  package source emits authored template-comment records, authored-comment skip
  metadata, comment-aware async-anchor offsets, or statement-container lexical
  scope artifacts.
- symbol-extraction audit confirmed `planSymbolResolver` creates source-bearing
  planned symbols for event handlers, DOM updates, behaviors, and
  async-computed runners, including event handler parameter metadata, behavior
  function/input source metadata, and matching module import metadata for
  imported behavior functions, while `compileTsrxModule`, `transformTsrxModule`, the
  Rolldown adapter, and the Vite wrapper still accept caller-supplied
  `id`/`chunk`/`exportName` tables for resolver emission. The `symbol-modules`
  pass emits source strings for planned DOM update modules and simple
  event-handler `++`/`--` graph-update modules, literal assignment modules,
  simple event-parameter field assignment modules, simple graph-read assignment
  modules, simple binary/logical graph-read assignment modules,
  conditional graph-read assignment modules, grouped/nested graph-read
  assignment modules, array-literal assignment modules over supported element
  and spread value sources plus preserved holes, object-literal assignment
  modules over static keys, supported computed keys, supported spreads, and
  supported value sources, static-call assignment modules over supported
  argument values, generated event-module imports for referenced module-level
  helper calls, prefix unary
  `!`, `+`, `-`, and `~` assignment modules over supported value sources,
  compound assignment modules including logical `&&=`,
  `||=`, and `??=`, static delete modules, collection-call modules with zero
  arguments, simple literal arguments, simple event-parameter field arguments,
  lowered graph-read arguments, or spread arguments over supported values, and
  imported behavior function modules with deferred behavior input slots plus
  inline behavior function modules without imports, including inline behavior
  factory grouping before deferred input invocation. The pass also emits
  async-computed runner modules from planned runner source, with static
  dependency-root declarations over `context.graph.read` / `context.read` and a
  `{ key, signal, read }` runner invocation, while protocol state payloads omit
  that function source.
  The Rolldown and Vite adapters expose those modules as in-memory virtual
  modules. The Rolldown transform derives resolver rows for those generated
  virtual modules. No package source emits bare local/non-imported behavior
  identifiers into generated modules, and async-runner build/runtime integration
  is still limited to the current generated virtual-module path;
  event-handler module extraction is still limited to update, simple literal
  assignment, simple event-parameter field assignment, simple graph-read
  assignment, simple binary/logical graph-read assignment, grouped/nested
  graph-read assignment, conditional graph-read assignment, array-literal
  assignment over supported value sources, object-literal assignment over static
  keys, supported computed keys, supported spreads, and supported value sources,
  prefix unary `!`, `+`, `-`, and `~` assignment over supported value sources,
  static-call assignment with supported argument values, referenced module-level imports for generated event
  modules, compound assignment with supported RHS values, static delete, and
  simple collection writes with literal, event-parameter field, lowered
  graph-read, or supported spread arguments, and no build adapter derives
  resolver tables from real
  chunk output beyond the current generated symbol
  virtual-module path.
- runtime-graph journal audit confirmed current graph source accepts the full
  `DomJournalEntry` union, collects subscription-produced DOM journal entries,
  and exposes them through `takeJournal`. The resume runtime can also deliver
  journal entries from runtime-owned graph flushes and later scheduled graph
  flushes to an optional host DOM journal adapter without draining journals when
  no adapter is configured. Executable coverage currently exercises `setText`
  entries, one multi-entry subscription that appends ordered `setText`,
  `setAttr`, and `setProp` entries from a single DOM update run, one `setAttr`
  resume path, adapter delivery for a dispatch-owned `setAttr` flush, and
  adapter delivery for a scheduled DOM update `setText` flush. A structural DOM
  journal applier now covers ordered application of `setText`, `setAttr`, and
  `setProp` to caller-resolved DOM-like targets, including nullish/false
  attribute removal, plus `runCleanup` callbacks in journal order. The runtime
  helper for protocol DOM update targets now maps text, attribute, property,
  class, and style targets to `setText`, `setAttr`, or `setProp` entries. Focused
  DOM-update-resume coverage proves lazy DOM update symbols receive the current graph
  value and protocol DOM update target metadata and can return concrete journal
  entries through the runtime journal adapter. Current coverage also proves
  `removeRange`, `insertRange`, and retained-anchor `moveRange` contents can
  mutate DOM-like ranges between retained anchors. It still has no browser DOM,
  compiler-emitted binding module integration, or browser-ordering coverage.
- runtime-scheduler audit confirmed current graph source schedules microtask
  flushes through `queueMicrotask` with a `Promise.resolve().then(...)`
  fallback for ordinary writes, updates, mutated collection calls, object
  deletes, initial async-computed demand, and settled async computed completions.
  Focused automatic-flush coverage currently proves an idle-turn write batch and
  standalone async-computed demand; most collection, delete, computed, async
  invalidation, and resume tests still force `graph.flush()` directly.
- runtime sync-computed audit confirmed current runtime graph source lazily
  recomputes dirty sync computed nodes on read and marks dependent computed and
  async-computed nodes dirty when a computed node changes; focused tests
  directly exercise one state-path dependency, one computed-on-computed chain,
  and subscriber journal updates, but not generated binding integration.
- runtime collection-call audit confirmed the semantic expression collector and
  runtime share the current static mutating-method allow-list, while focused
  tests directly cover only selected representative methods and no-op cases:
  `push`, `unshift`, `pop`, `shift`, `Map.set`, `Map.delete`, `Map.clear`,
  `Set.add`, `Set.delete`, `Set.clear`, `Date.setTime`, and
  `Date.setUTCFullYear`.
- runtime-resume harness audit confirmed current resume and payload-resume tests
  run in Node against minimal DOM-like objects, not a real browser DOM or
  component/browser harness.
- serializer-scope audit confirmed current serializer coverage is focused on
  pure value built-ins, identity/cycles, typed-array backing-buffer identity and
  offsets, `DataView` backing-buffer identity and offsets, direct
  `serializeGraphValue` unsupported-function diagnostics, successful protocol
  state payload construction, and canonical `arcade/state` / `arcade/view` script
  wrappers. Source has encode/decode branches for the current typed-array
  family, while focused tests directly exercise `Uint8Array`, `Int16Array`, and
  `Uint16Array`.
- protocol-state input audit confirmed the compiler protocol-state pass reads
  each payload arena state cell's matching semantic graph binding and passes the
  binding's syntax-evaluated `initialValue` into
  `createProtocolStatePayload`. The serializer wrapper now converts
  `ARCADE_SERIALIZE_UNSUPPORTED_VALUE` results into `ProtocolStateSerializationError`
  objects that preserve the serializer diagnostic fields plus `graphNodeId` and
  `cellName`, so protocol-state construction failures keep structured diagnostic
  metadata.
- dynamic-initializer payload audit confirmed `initialValueKind` classifies only
  object expressions, array expressions, and literals, while
  `evaluateInitialStateValue` reduces literals, object/array expressions, and
  simple unary expressions. Other initializer forms currently become
  `undefined` before protocol-state serialization; no focused test exercises a
  dynamic initializer flowing into `arcade/state`.
- typed-array table audit confirmed the serializer source recognizes
  `Int8Array`, `Uint8Array`, `Uint8ClampedArray`, `Int16Array`, `Uint16Array`,
  `Int32Array`, `Uint32Array`, `Float32Array`, `Float64Array`, and guarded
  `BigInt64Array` / `BigUint64Array` branches. The current source also has a
  `DataView` branch. Focused tests cover representative typed-array round-trips
  rather than every listed class.
- serializer-tier audit confirmed current package source implements pure
  built-in value graph serialization and protocol-state wrapping only. It does
  not yet implement framework graph reference records, shared snapshot
  serialization, app-owned or third-party value class restoration, or compact
  production arena encoding from the payload spec tiers. The protocol-state
  wrapper does serialize async computed snapshot `key`, `value`, and `error`
  fields through the graph serializer.
- diagnostic-inventory audit confirmed the implemented stable code list in this
  ledger matches package source for compiler, serializer, and generated resolver
  diagnostics; it also confirmed `sync-policy` is an implemented/tested
  diagnostic phase through `ARCADE_SYNC_POLICY_UNEXTRACTABLE`.
- completion-scope wording audit confirmed status entries now distinguish
  spec/tooling evidence from implementation evidence and still keep product-level
  render/resume completion explicitly unproven.

## Known Caveats

- `dist/` is untracked generated output from `pnpm exec vp pack`; do not treat it
  as source.
- Package manifests are still internal/development oriented: all production
  packages are marked `private`, their `exports` fields point at `./src/...`
  entry points rather than generated `dist/` files, and the main package's
  `./vite` subpath also points at source. Current `vp pack` success proves the
  configured flat entry-map build emits ESM/declaration artifacts into root
  `dist/`; it does not prove publish-ready package metadata, package-local output
  wiring, package build ordering, dependency externalization policy, or final
  dependency chunking.
- The compiler has an early render-shell artifact path for payload scripts, but
  the runtime package does not yet contain a working initial-render entry. Treat
  payload-resume decoding as a resumed-runtime slice, not proof of the
  initial-render -> payload -> browser-resume pipeline.
- The current payload-driven resume helper can take explicit payload script
  strings or locate `arcade/state` / `arcade/view` scripts through a structural
  document-like `querySelector` host. It is not yet a browser bootstrap that
  proves startup in a real browser document.
- Current payload/symbol tests prove simple DOM-order element locators against
  recursive fake-DOM walks, raw comment-index async anchors, protocol state
  cell/computed metadata planning, protocol view wiring, source-bearing planned
  symbol records, symbol ID wiring, resolver module string emission from supplied
  chunk/export tables, fail-closed unknown-symbol metadata, canonical JSON
  data-script wrappers, required top-level state/view arena array validation,
  serialized async computed snapshot records, malformed serialized state cell and
  async snapshot graph-value envelopes, invalid
  typed-array serialized record names, duplicate serialized graph record IDs,
  dangling serialized graph `$ref`s, invalid serialized graph ID/ref numeric
  forms, invalid async snapshot request versions, non-negative integer protocol
  indexes for DOM-order locators, behavior graph-read input indexes, and
  async-boundary comment anchors, and Node fake-DOM payload decoding/resume
  helpers. They do not prove shared snapshot
  records, full protocol schema validation beyond exact script-wrapper, version
  checks, serialized graph value envelopes, and optional text / plain-attribute /
  common-property / class / style DOM update target shape checks, protocol
  computed entries becoming runtime computed/async nodes, range binding
  target metadata, compact production payload encoding, browser `TreeWalker`
  materialization, skip runs for static nodes, ignored/nested
  regions, branch/list/fragment locator materialization, symbol source
  extraction into emitted chunks, resolver tables generated by a real build
  manifest, generated symbol exports, browser-loaded dynamic imports, or a real
  initial-render payload. Current chunk/export tables are fixture inputs, not
  build-derived evidence.
- Current TSRX control-flow coverage proves ordinary nested element traversal,
  source-level generic `childNodes()` descent for non-special nodes, and
  async-boundary records for `TryStatement` parser output. It does not prove
  authored `@if`, `@for`, or `@switch` parsing fixtures; keyed `@for` identity;
  positional/unkeyed loop diagnostics; branch-local graph scope ownership;
  `@if`/`@switch` branch disposal; branch/list payload locators; or runtime
  cleanup of graph state, events, DOM updates, async work, and behaviors owned by
  removed control-flow ranges.
- Current sync-event-policy tests prove selected compiler IR extraction,
  `ARCADE_SYNC_POLICY_UNEXTRACTABLE` object shape for one unsupported guard, and
  runtime execution before lazy symbol dispatch against fake DOM events. They
  also prove handler arrays preserve multiple sync-policy branches and the resume
  runtime evaluates those branches independently before lazy symbol loading.
  Focused render-shell tests now prove the default inline event resumer applies
  event/constant/logical sync-policy actions and serialized graph-state
  `graph-truthy` reads before importing the resume module, including built-in
  graph record shapes serialized by the protocol-state helper. The resume runtime
  can skip sync-policy evaluation for the first imported event after the inline
  resumer has already applied it.
  They do not prove prop policy reads, imported constants, computed constant
  forms outside the current literal/unary/logical/binary/conditional subset, all
  unsupported guard diagnostics, real browser default-action timing,
  navigation/form cancellation timing, generated-build integration, or
  production-size optimization of graph-backed policy decoding.
- Current event-runtime coverage proves delegated DOM events and host-agnostic
  `onVisible` observer dispatch against Node DOM-like test doubles. It proves
  `visible` records are not registered as delegated DOM listeners, one injected
  observer hook observes visible hosts, a structural global
  `IntersectionObserver` fallback observes visible hosts when no factory is
  injected, visibility-triggered lazy symbols run once in authored order,
  pending visible hosts are unobserved on explicit host disposal, post-disposal
  observer entries are ignored, returned cleanups are stored, and explicit host
  disposal runs those cleanups in reverse order. It also proves visible symbols
  receive current graph reads at first intersection without subscribing or
  rerunning after later graph writes, and that a structural removal observer can
  dispose removed visible hosts and run visible/behavior cleanups in reverse
  order. It does not prove cleanup on real browser DOM removal, real browser
  observer timing, or generated-build integration.
- Current event-handler array coverage proves ordered handler source extraction,
  ordered handler parameter metadata, ordered `symbolIds` in compiler/protocol
  artifacts, and Node fake-DOM runtime behavior for multiple handlers on one
  event: sequential loading/execution, stop at the first rejected handler,
  skipped later handlers, preservation of earlier committed writes, ignored
  ordinary-event return values, and success-or-error dispatch flush timing.
  Focused resume-runtime coverage also proves a rejected lazy symbol load before
  a handler body runs reports to the app-level runtime error hook with
  event/symbol context, skips later handlers, preserves earlier committed writes,
  flushes, and rethrows the original resolver failure.
  Sync-policy branch coverage also proves handler-array
  cancellation/propagation policies are not collapsed to the first handler. It
  does not prove normal error-boundary routing, handler-body error-hook
  assertions, real browser default-action timing, or browser DOM application
  after the flush.
- Current element/behavior tests prove invalid and duplicate `el` diagnostics,
  `attach`-on-component diagnostics, element handle payload/protocol records,
  multiple behavior source records, behavior function/input source metadata, and
  symbol IDs in authored/view order, module import metadata for imported behavior
  functions, partial generated imported-behavior and inline behavior-function
  modules, host-node lookup through `getElement(hostNodeId)`, lazy-symbol
  `element()` handle lookup by handle ID/name, `undefined` for unmatched handle
  locators, and `undefined` for
  handle ID/name lookups after explicit host disposal or DOM-subtree detachment
  in package-level fake-DOM tests. They also prove explicit host disposal
  invalidates host-node lookup and delegated event records, and that behavior
  payload records do not load app code during startup. Focused
  runtime tests prove explicit behavior activation imports behavior symbols,
  passes optional serialized or graph-read payload `inputValues` to symbol
  context, reruns by cleaning prior behavior installs in reverse order, disposes
  active behavior cleanups, avoids loading behavior symbols for graph input
  changes before activation, skips explicit behavior activation without importing
  symbols when the materialized host is no longer present under the resume root
  subtree, and reruns active behavior hosts when graph-backed behavior inputs
  change without deadlocking on a nested graph flush, activates same-host
  behavior symbols from ordinary event and `onVisible` visibility triggers
  without startup imports, and avoids duplicate behavior installs on repeated
  ordinary event triggers after activation, and disposes active behavior cleanup
  when an injected structural removal observer reports the host subtree removed.
  Compiler payload/protocol tests prove initial behavior `inputValues` for
  simple literals and static `state()` initial-value graph paths, graph-backed
  `inputGraphReads` for state/computed inputs, and computed inputs with omitted
  `inputValues`. They do not prove initial-render absence, handles after real
  DOM removal, serialized behavior input values for computed, opaque, dynamic,
  or partially materialized inputs, declared policy behavior activation triggers,
  real-browser behavior reruns on input changes, real-browser removal timing, or
  browser-loaded behavior chunks.
- Current async computed/boundary tests prove selected compiler diagnostics,
  async-capable propagation, payload runner IDs, runtime request versioning,
  abort signals, stale fulfilled and rejected completion suppression, same-key
  async invalidation skips, committed rejected async snapshots, standalone
  initial async-demand auto-flush, payload-resume lazy async runner loading on
  demand, fulfilled async snapshot restore before browser refetch in the
  payload-resume fake-DOM path, pending snapshot restart on first demand in the
  payload-resume fake-DOM path, structural pending/fulfilled async-boundary
  range journal entries against fake-DOM anchors with value-path metadata, and
  that async runner return values commit as graph data instead of DOM journal
  entries. They do not prove
  initial-render awaiting, rejected snapshot resume, rejected branch rendering,
  rejected/error DOM range replacement, real browser DOM range application,
  branch cleanup, real browser timing, or
  build-generated async runner chunks.
- Current resume-runtime tests prove delegated event, sync policy, behavior,
  binding, async-boundary, payload-resume behavior, early CSR render, early SSR
  payload/resumer-shell output, inline event/constant/graph-backed sync-policy
  actions over serialized primitive/object/array/built-in state before default
  resumer imports, repeated inline event-resumer dispatch while the inline
  listener still owns the event, runtime dispatch after an already-applied inline
  sync policy, synchronous same-turn `loadSymbol` side effects for already
  materialized event dispatch, app-level error-hook reporting for rejected event
  symbol loads, synchronous behavior/visible cleanup registration, structural
  removal-observer cleanup for removed host subtrees,
  and fixture-adapter marking before runtime-owned handoff against DOM-like test
  doubles in the Node test project. They do not prove real browser
  DOM behavior, component/browser execution, layout/locator
  behavior in an actual document, generated component/render artifact execution,
  or no-component-execution-on-resume in a browser.
- Current runtime graph tests prove in-memory graph invalidation, scheduling,
  one direct sync-computed lazy recompute path, async request versioning,
  abort-signal wiring, stale fulfilled/rejected completion suppression, same-key
  async invalidation skip behavior, selected collection calls, Date setter calls
  with timestamp no-op invalidation behavior, static deletes, and
  subscriber-produced `setText` journal collection. Automatic microtask flush
  coverage proves an idle-turn write batch, direct `graph.flush()` waits for an
  already-active scheduled flush through journal delivery, and standalone
  initial async-computed demand; collection-call, delete, computed, and resume
  paths mostly rely on explicit `graph.flush()` calls in focused tests. Focused
  runtime tests prove computed-on-computed dependency chains re-run subscribers
  after source state
  changes. Runtime graph coverage now also proves `Array.splice()` preserves the
  removed-items return value, skips invalidation when called with no arguments,
  and invalidates once for a mutating replacement, and that direct
  `items.length = n` graph writes dirty the array path so removed-index
  subscriptions rerun. It also proves `copyWithin`, `fill`, `reverse`, and
  `sort` preserve their JavaScript return value, skip invalidation when array
  contents do not change, and invalidate when contents do change, including when
  a sparse array hole becomes an own `undefined` indexed value. Current
  resume-runtime tests add one `setAttr` journal path,
  host-adapter delivery for a dispatch-owned `setAttr` flush, and host-adapter
  delivery for a scheduled DOM update `setText` flush. Runtime graph coverage now
  proves one subscription can return an ordered multi-entry batch containing
  `setText`, `setAttr`, and `setProp`, and the runtime DOM journal applier
  proves those entry types mutate caller-resolved DOM-like targets in order.
  Runtime DOM journal coverage also proves protocol DOM update targets map to the
  expected concrete journal entries, and runtime DOM-update-resume coverage proves
  lazy DOM update symbols receive the current value plus DOM update target metadata
  before returning a concrete journal entry. It also proves `runCleanup`
  callbacks run in journal order, `removeRange` / `insertRange` can replace
  content between retained DOM-like anchors, and retained-anchor `moveRange`
  moves contents before a target anchor. It does not prove range entries against
  real browser DOM;
  that compiler-emitted binding modules apply the DOM journal to real browser
  nodes; generated DOM update-symbol integration for computed dependencies; or that
  journal ordering is correct under a browser event loop.
- Current state-lowering tests prove artifact lowering and diagnostics for
  selected graph reads/writes, assignment/update metadata, static collection
  calls, static deletes, optional graph writes, rest-alias exclusions,
  parser-collected nested array/object destructuring aliases, graph destructuring
  default diagnostics, read-only writes, and const reassignment. Current
  generated event-module tests prove
  lowered updates, simple literal assignments, simple event-parameter field
  assignments, simple graph-read assignments, simple binary/logical assignment
  values over graph reads, conditional graph-read assignment values,
  grouped/nested graph-read assignment values, array-literal assignment values
  over supported element values, supported spread values, and preserved holes,
  object-literal assignment values over static keys, supported computed keys,
  supported spread values, and supported property values, static-call assignment
  values over supported argument values, prefix unary `!`, `+`, `-`, and `~`
  assignment values over graph reads, imported helper static-call assignment
  modules with re-emitted imports including namespace imports, unsupported bare
  local helper and unimported member-helper static-call assignments that do not
  emit undefined lazy-module calls, selected compound assignments including
  logical `&&=`, static deletes, and collection calls with zero arguments, simple
  literal arguments, simple event-parameter field arguments, lowered graph-read
  arguments, or supported spread arguments, plus Date setter calls with lowered
  graph-read arguments, map to runtime graph APIs.
  They do not prove full final emitted JavaScript expression value/short-circuit
  semantics, local/non-imported function call re-emission, broad nonliteral
  assignment RHS evaluation, captured/derived/computed argument-bearing
  collection-call wiring into runtime `graph.call`, coverage for all alias and
  array mutation forms, or browser/runtime integration beyond focused runtime
  graph tests.
- Current props/projection coverage proves first-parameter synthetic prop
  DOM update collection, object-pattern prop aliases, `prop:props` read lowering,
  and read-only prop write diagnostics. It does not prove default/rest/nested
  parameter handling beyond the current object-pattern alias collector, runtime
  getter-backed props, parent graph re-read behavior, prop update propagation
  through component boundaries, `children` projection artifacts, projection
  payload records, projection disposal, pass-through projection behavior, or
  diagnostics for React-style child inspection/manipulation.
- Current dynamic tag/component/style coverage proves static identifier tag
  handling only: lowercase names become host node records, uppercase names stay
  component-like for `attach` diagnostics, and protocol locators preserve the static
  `tagName`. It does not prove dynamic `<{expr}>` lowering, dynamic
  host/component ownership diagnostics, style scoping/composition, style payload
  metadata, or runtime behavior for dynamically selected hosts/components.
- Current authored-comment and statement-scope coverage proves generated
  async-boundary `dom-order-comment` records and runtime materialization by raw
  comment index only. It does not prove authored TSRX comment preservation,
  comment-skipping or offset logic, statement-container lexical-scope artifacts,
  or locator behavior when authored comments appear before generated
  async-boundary anchors.
- Current `shared()` coverage proves the framework API stub throws when executed
  directly with the authored `shared(factory, options?)` shape, the main package
  re-exports the function and definition type, and the semantic graph records
  same-module exported shared definitions plus component-local instance calls
  with source-module definition IDs, explicit named `.tsrx` imported shared
  instance calls with stable source/export definition IDs, and literal scope
  options. It also proves
  same-module shared definition dependencies and a structured
  `ARCADE_SHARED_DEFINITION_CYCLE` diagnostic for direct shared dependency cycles,
  and shared factory state/computed bindings whose reads and writes lower
  through shared-scoped graph IDs. It also proves graph-backed shared factory
  return properties and component shared-instance property reads/writes lowering
  through those return properties, including dynamic-path diagnostics for
  shared-instance property access, plus shared-definition metadata in the payload
  arena and `arcade/state` protocol payload. Runtime graph creation from decoded
  state payloads retains shared-definition records and reads graph-backed shared
  return properties through owned graph cells; runtime graph writes can also
  target those graph-backed shared return properties, increment the retained
  shared definition version, collect versioned plain-data patch records, and
  dispatch those patches from the resume root after lazy handler flush. Runtime
  graph patch folding can apply newer received patch records without re-emitting
  them, and the resume runtime installs a private shared-patch listener for
  containers with shared definitions. It does not prove
  cross-module shared definition discovery beyond explicit named `.tsrx` import
  specifiers, imported shared return-property lowering, graph-context
  resolution, request/container/page scoped runtime instances, shared state
  snapshots, browser resume of shared instances beyond direct graph-backed
  property reads/writes, stale/competing cross-runtime conflict policy beyond
  version skips, multi-container browser propagation, or design-system widget
  graph instance identity.
- Current serializer tests prove selected pure built-in value round-trips,
  identity/cycles, typed-array backing-buffer identity and offsets for
  `Uint8Array`, `Int16Array`, and `Uint16Array`, `DataView` backing-buffer
  identity and offsets, pathful unsupported-function diagnostics from
  `serializeGraphValue`, structured diagnostic propagation through
  protocol-state wrapping, successful protocol-state wrapping, and canonical
  payload script tags. Compiler coverage proves literal and object `state()`
  initial values reaching `arcade/state` through `compileTsrxModule`. They do not
  prove dynamic or opaque `state()` initializer values, exhaustive typed-array
  class coverage, app-owned or third-party value class restoration, framework
  graph reference serialization, shared or async snapshot integration,
  initial-render payload construction, runtime graph snapshots after
  component-body execution, secret-leak/resource diagnostics, compact production
  wire encoding, or integration with a real initial-render payload.
- Current core/protocol/test-utils tests prove the framework API runtime failure
  path and `ARCADE_FRAMEWORK_API_RUNTIME_CALL` metadata, protocol version sharing
  across empty state/view payloads, canonical payload script wrapper checks
  including the closing tag, payload script JSON decoding, and selected
  protocol record counting for cells, computed entries, locators, events,
  DOM updates, behaviors, element handles, and async boundaries. They also prove a
  decoded human-readable payload debug dump with state/view IDs, names, symbol
  IDs, sync-policy presence, DOM update targets, and locator indexes.
  They do not prove public API stability for internal packages, protocol
  migration/version negotiation, browser helpers, or witness integration
  helpers.
- Current diagnostics coverage proves selected compiler/serializer/resolver
  diagnostic object shapes, stable codes, hard-coded docs URL shape, and the
  implemented `semantic-graph` / `sync-policy` / `state-lowering` /
  `capture-analysis` / `serialization` / `resume` phase names in package tests.
  It does not prove one unified diagnostic object for all thrown errors,
  end-user CLI output, editor integration, dev-server overlays,
  source-map/source range rendering, repo-owned or published error
  documentation, browser/runtime error routing, build-pipeline diagnostic
  propagation, runtime protocol/hash mismatch diagnostics, async result
  serialization diagnostics, or every required compile-time diagnostic in
  `specs/framework/07-diagnostics.md`.
- Current capture-analysis tests prove selected unsupported local binding
  categories against planned symbol source strings. They do not prove a complete
  lexical closure graph, exhaustive serializable built-in allow-list coverage,
  module import re-emission beyond imported behavior function modules,
  type/value flow analysis, final emitted chunk capture validation, or runtime
  serializer integration.
- Current compiler pass-boundary tests prove the pass ID list, selected
  `consumes` / `produces` boundaries, runnable order derivation, missing-artifact
  failures, duplicate-producer failures, dependency-cycle failures, source layout
  ownership, duplicate pass-ID validation, structured pass-graph failure
  metadata, generic pass execution in derived graph order with consumed-only
  input maps, declared-output validation, in-memory human-readable artifact
  dumps through the default formatter, the returned `compileTsrxModule` pass graph, and the first
  `symbolModules` event-handler, DOM update, imported behavior, and async
  computed runner source artifacts. They do not prove file/CLI artifact dump
  tooling, disabled/reordered pass execution, full artifact-focused coverage for
  every pass output, or build-ready emitted JavaScript snapshots for component
  code, broad state rewriting, local/non-imported behavior modules,
  build-integrated async runner chunks, and render/resume entry wiring.
- Current Rolldown/Vite adapter and public-surface tests exercise curated source
  re-exports, unit-level `.tsrx` transforms with fixture-supplied symbol tables,
  in-memory resolver/payload/generated-symbol/manifest virtual module
  resolution and loads, transform manifest objects, compact resolver table rows derived from
  current event-handler and DOM-update symbol virtual modules, direct Vite wrapper hook
  forwarding for transform, resolveId, load, and generateBundle, and one
  direct Rolldown build fixture and one fixture-backed Vite library build that
  write the bundle graph by default, omit default `arcade-manifest.json`, load
  generated payload/resolver/current event-handler and DOM-update symbol virtual
  modules, and record their emitted chunk filenames plus finalized
  generated-symbol rows without leaking internal pre-build symbol rows in the
  public module manifests. Those
  fixtures also prove the emitted resolver's compact exported symbol table uses
  final relative chunk specifiers for the current generated symbol chunks instead
  of generated virtual module IDs, uses `import(/* @vite-ignore */ url)` for the
  runtime load, and contains no generated `switch (id)` resolver. Focused repeated-transform tests
  prove stale generated symbol virtual modules stop resolving/loading after
  a `.tsrx` update removes the binding that produced them, and structural
  `handleHotUpdate` tests prove generated virtual module graph nodes are
  invalidated and returned with the changed source module. A focused
  `configureServer` / `handleHotUpdate` test proves the adapter emits a custom
  `arcade:update` payload with the changed module ID and generated
  virtual module IDs, and a custom-environment test proves server-originated
  hot updates use the configured client environment name. Focused Vite config
  tests prove normal app builds and SSR-mode client app builds default root
  `build.modulePreload` to `false`, client build environments also receive
  `modulePreload: false`, and library builds plus true `build.ssr` server builds
  are left alone. A focused `transformIndexHtml` /
  virtual module test proves dev-only inert marker tag injection plus a virtual
  client module that listens for the custom Vite event and redispatches it as a
  browser `CustomEvent`;
  executable virtual-client coverage proves the event is cancelable and the
  client falls back to `hot.invalidate()` only when no consumer prevents default.
  A temporary Vite dev-server fixture proves real `transformIndexHtml`,
  virtual-client `transformRequest`, and `.tsrx` source `transformRequest`
  behavior through Vite. Package-local Witness boxes now run that fixture's
  dev-server pipeline, edit the `.tsrx` source, record the
  `arcade:update` custom payload in the client environment's edit
  outcome, prove a real browser page receives the cancelable event without
  navigating, and prove the CSR production build emits the bundle graph and lazy
  chunks, omits default `arcade-manifest.json`, and forbids dev-HMR client
  strings in emitted text artifacts. The CSR production build is also served by Vite
  preview and proves client-created DOM can load the generated
  payload/resolver/symbol pipeline for a counter click with no console errors or
  failed requests. A Vite SSR fixture now builds a server entry that contains
  counter DOM plus payload scripts, exposes a fixture-only SSR host for dev and
  preview, and a package-local SSR preview box now uses the fixture's app-build
  path plus Vite preview response instead of rewriting the preview index before
  proving the browser entry resumes that existing DOM for the same click update.
  The same SSR preview box now records the post-interaction script request list,
  computes gzip sizes for those requested build artifacts, and fails if the
  current-regression interaction budget is exceeded: 2.175 KB gzip for the
  runtime-heavy chunk, 2.65 KB gzip for all post-click async scripts, or three
  post-click script requests. Focused
  fixture-build tests also rebuild the CSR, SSR, vite-plus, and direct Rolldown
  fixtures, assert default builds do not emit `arcade-manifest.json`, and enforce
  current-regression gzip ceilings for the eager entry runtime closure in
  CSR/vite-plus and all generated async scripts in SSR. The current ceilings
  are CSR 3 KB for the largest runtime-heavy chunk / 3.05 KB for the entry
  static script closure / 2 scripts, SSR 2.175 KB / 2.7 KB / 4 scripts, and
  vite-plus 2.95 KB for the largest runtime-heavy chunk / 3 KB for the entry
  static script closure / 2 scripts. Those tests also fail if generated runtime
  chunks retain Vite's empty dynamic-import preload helper and still report the
  event-only 300-500 B gzip target / 700 B gzip hard budget as the remaining
  spec target. CSR and vite-plus fixture size checks now read the built
  `index.html` module scripts and follow static imports from emitted JavaScript
  rather than `arcade-manifest.json`, so lazy fallback chunks remain visible in
  the build output without being counted as eager runtime bytes.
  Grep MCP research against Vite/Rolldown usage showed `@vite-ignore` is used
  for runtime/non-static imports and a Rolldown fixture documents static
  dynamic imports with `@vite-ignore` as having no import record. The current
  generated resolver uses `import(/* @vite-ignore */ url)` against finalized
  resolver table URLs; generated symbol virtual modules remain reachable because
  the transformed entry/build integration emits them as chunks before
  `generateBundle` rewrites the table strings to final relative specifiers.
  Generated DOM update
  symbols now emit concrete `setText`, `setAttr`, and `setProp` journal object
  literals directly, so they do not import either the broad runtime entry or the
  helper-only `@arcade/runtime/dom-update` subpath. Generated
  event-handler modules also omit their previous `authoredSource` export;
  behavior and async-runner symbols keep their source metadata because current
  focused tests still use it for those symbol kinds. The Vite CSR/vite-plus
  fixtures use the phase-specific `runtime/render` subpath so the broad runtime
  entry does not own those browser paths; that CSR entry now statically uses the
  narrow event-only resume container for the current event/DOM-update shape and
  dynamic-imports the full graph/resume/payload paths only for fallback cases.
  The event-only CSR path now imports `runtime/event-only-resume` instead of the
  broader `runtime/event-resume`; the focused fixture-build size tests forbid
  `runtime/src/event-resume.ts` in the CSR and vite-plus eager runtime origins.
  The SSR fixture render shell imports `runtime/render-to-string`, keeping the
  SSR payload rendering and inline resumer source out of the eager CSR render
  entry. The SSR fixture browser entry now imports the narrower
  `@arcade/runtime/event-only-resume` subpath for event-only payload
  dispatch instead of the full `runtime/resume` or broader `runtime/event-resume`
  path. The event-only resume helper reads the existing payload scripts,
  materializes DOM-order locators, dispatches the current event through the
  generated resolver, supports the current `graph.read`/`write`/`update` symbol
  surface, and applies setText/setAttr/setProp DOM journal entries without
  importing the full payload validator, serializer built-ins, `createResumeRuntime`,
  behavior/visibility/removal observers, async-boundary range journal support,
  shared-patch runtime, event-resume element handles, graph collection calls, or
  delete/subscription helpers. Current
  client bundle output also strips empty Vite dynamic-import preload wrappers
  from generated arcade runtime chunks after bundling, including empty
  wrappers around async fallback loaders. This preserves plain `import(...)`
  records during Vite/Rolldown resolution while removing the unused preload
  helper from emitted JS. Generated symbol-resolver table finalization now runs
  after Vite/Rolldown's tiny virtual-symbol facade cleanup, so table URLs point
  at the shared generated symbol chunk when facades are removed. The post-build
  cleanup removes those generated facade chunks from emitted JS, filters them
  out of the bundle graph and optional arcade manifest metadata, fails closed if
  any table symbol cannot be mapped, and compacts duplicate final module URLs in
  the resolver tuple. Current
  `.tsrx` source modules import `payloadState` and `payloadView` as named
  exports from the payload virtual module while preserving the default
  `payloadScripts` object for SSR, so CSR/vite-plus entries can consume the
  state/view objects without pulling `stateScript` and `viewScript` strings into
  the eager startup chunk. Current
  rebuilt fixture eager closures are still above the final event-only target for
  CSR and vite-plus but are bounded by regression tests: CSR's entry static
  closure is 7,733 raw bytes / 2,972 gzip bytes with a largest runtime-heavy
  chunk of 2,898 gzip bytes, vite-plus' entry static closure is 7,451 raw bytes
  / 2,921 gzip bytes with a largest runtime-heavy chunk of 2,847 gzip bytes,
  and SSR all generated async scripts remain 2,640 gzip bytes. The full emitted
  CSR async script set is currently 11,120 gzip bytes and the full emitted
  vite-plus async script set is 10,995 gzip bytes because full graph/resume/payload
  fallback chunks are emitted but lazy. The latest Witness SSR post-click path is
  smaller than the full SSR build artifact set: no startup scripts, three
  requested post-click async scripts, 6,628 raw bytes / 2,559 gzip bytes total,
  and the largest runtime-heavy interaction chunk is 5,661 raw bytes / 2,118
  gzip bytes. The fresh receipt is
  `packages/bundler/.witness/receipts/2026-06-16T17-27-41.293Z/receipt.json`.
  A fresh CSR preview receipt proves the rebuilt CSR fixture renders the
  client-created counter, updates it from `0` to `1`, and has no console errors
  or failed requests after the preload cleanup stopped leaving orphan Vite helper
  init calls in the emitted entry. The same receipt now records real browser
  script requests and budgets: startup requested two scripts at 7,733 raw
  bytes / 2,972 gzip bytes with a largest runtime-heavy chunk of 2,898 gzip
  bytes, while the first counter click requested one lazy symbol chunk at 633
  raw bytes / 349 gzip bytes and no runtime-heavy chunks:
  `packages/bundler/.witness/receipts/2026-06-16T18-17-52.935Z/receipt.json`.
  A vite-plus fixture now has a real app entry and a package-local preview box
  that proves a vite-plus config emits the bundle graph, omits default
  `arcade-manifest.json`, and serves browser output through Vite preview.
  Focused base-plugin and Vite-wrapper tests prove `buildStart` cleanup clears
  stale generated virtual modules and accumulated transform manifests.
  They do not prove installed package export resolution, publish-ready exports,
  production SSR serving beyond the current fixture host, behavior/async-runner chunks,
  broader event-handler write chunks beyond simple updates, real DOM hot
  replacement beyond the fixture-level custom-event consumer, or full
  installed-package build receipts.
- At this ledger update, the production package implementation under
  `packages/`, this progress ledger, and the compiler split plan are tracked on
  the current `impl` branch. Status entries still describe current worktree
  files and command receipts rather than permanent PR status; rerun the relevant
  checks before treating a commit or PR diff as current evidence. The untracked
  `dist/` directory is generated pack output and should not be treated as
  source state unless a future task explicitly decides to commit generated
  artifacts.
- `pnpm-workspace.yaml` deliberately keeps `../native-tsrx` out of this
  workspace, and `packages/compiler/package.json` resolves `@tsrx/core` through
  the catalog as an external dependency boundary. Do not inspect or modify that
  sibling repository for Arcade work. Parser-backed checks should continue
  to prove Arcade compiler artifact behavior against published `@tsrx/core`
  shapes instead of relying on sibling workspace parser artifacts.
- Markdown-only `vp check` can report formatting success and then fail before
  lint analysis because there are no lintable files. For spec-only maintenance,
  use `vp fmt --check` plus `git diff --check`; use broader `vp check` only when
  the target set includes lintable source files.
- The production framework implementation is not feature-complete. Current tests
  and scans prove early compiler, runtime, serializer, public-surface, and
  build-adapter slices, not the full render/resume framework.
- Update this file after meaningful implementation passes so "completed" status
  remains separate from design requirements.
