# Compiler Pipeline

Mini-compiler architecture, artifact contracts, extraction boundaries, and capture diagnostics.

### Compiler implementation pipeline

The compiler implementation must be an explicit artifact pipeline, not one
monolithic AST visitor. Each compiler feature owns one pass or a small set of
passes that can be developed, tested, disabled, and debugged independently.

Think of the compiler as a set of cooperating mini compilers. Each mini compiler
has a narrow domain, its own intermediate representation or artifact shape, and
a clear boundary with the rest of the pipeline. The state compiler should not
need to know how the view payload is encoded; the sync event policy compiler
should not need to know final chunk filenames; the symbol resolver planner should
not need to re-walk source code to rediscover captures. They exchange typed
artifacts through the orchestrator.

Every pass has:

1. a stable pass ID and human-readable description
2. declared input artifact keys (`consumes`)
3. declared output artifact keys (`produces`)
4. a typed pass context containing only source files, compiler options,
   declared input artifacts, and diagnostic sinks
5. a separately runnable test fixture surface

The orchestrator validates the pass graph before running it. Missing inputs,
duplicate producers for the same artifact, dependency cycles, or undeclared
artifact reads are compiler bugs and fail loudly. Pass order may be derived from
`consumes`/`produces`, but observable behavior must not depend on hidden mutation
between unrelated passes.

Passes communicate through typed artifacts, not private shared state. A pass may
append diagnostics and produce declared artifacts; it must not reach into another
pass's internals, mutate another pass's output in place, or couple itself to the
final emitted JavaScript shape. When a later optimization needs more data, the
owning pass adds or versions an artifact instead of creating an ad hoc side
channel.

This is a stability rule for the compiler. Adding or changing a feature should
mean adding/changing the smallest relevant pass and artifact contract, not
rewiring the whole compiler. For example, state read/write lowering, async
dependency-key extraction, sync event policy extraction, capture analysis,
template/view lowering, payload arena planning, symbol resolver planning, and
final code generation are separate responsibilities even if an early prototype
runs some of them in one physical module.

Developer tooling must be able to dump artifacts after each pass in a
human-readable form. Tests should target both individual pass artifacts and
end-to-end emitted output, so a regression in event policy extraction does not
have to be diagnosed from a full generated bundle snapshot.

### Production compiler contribution boundary

Maintainability and contributor experience are compiler requirements. A new
contributor should be able to open `packages/compiler`, find the pass that owns
the behavior they are changing, read that pass's input/output artifact types, run
its focused fixture tests, and understand the change without mentally executing
the whole compiler.

Once `packages/compiler` exists, new compiler behavior must not keep
accumulating in one large source file, one hidden AST visitor, or one mutable
"compiler state" object shared by unrelated passes. The public package entry may
re-export APIs. The orchestrator may validate and run the pass graph. They must
not absorb pass implementation details.

Each production compiler pass or small pass family should have visible ownership
in source layout and tests:

- a pass module with a narrow domain and a stable pass ID
- declared `consumes` and `produces` artifact keys in the pass registry
- typed input and output artifact contracts
- diagnostics whose `phase`, `passId`, and `artifactKeys` identify that pass
- focused fixture tests that assert input artifacts to output
  artifacts/diagnostics
- optional shared helpers only when they sit behind artifact contracts

Before adding a new compiler feature or expanding an existing one, check whether
the owning pass already has that shape. If behavior is still buried inside a
large orchestrator/barrel file, first split the owning pass boundary or add the
missing pass module as part of the change. A temporary single-file prototype is
acceptable only while proving the first vertical slice. It must not become the
place where later semantic graph, state lowering, async extraction, sync policy,
capture, template/view, payload, resolver, or final emit behavior is added.

Raw TSRX/JavaScript AST traversal belongs in the semantic graph pass and other
explicit syntax-analysis passes. Downstream passes should consume artifacts such
as `semanticGraph`, `stateLowering`, or `payloadArena`, not re-walk source code
or reach into walker-local state. If a downstream pass needs more information,
the upstream pass should add or version an artifact.

The preferred production shape is:

- `index` / public entry modules: curated package surface and re-exports only
- pass registry / orchestrator: pass IDs, `consumes` / `produces`, graph
  validation, execution order, and artifact dump wiring
- pass-owned modules: one focused domain per pass or small pass family
- shared artifact types: typed contracts between passes, not private mutable
  state
- fixture tests: readable input artifacts to output artifacts/diagnostics for
  each pass

If a later implementation discovers that two pass domains must share logic,
extract a shared helper behind the artifact contract. Do not merge the pass
domains back into one broad visitor or one "compiler context" that every pass
mutates.

See `09-compiler-module-split-plan.md` for the concrete production module split
target and migration order.

### Initial compiler substrate

The first implementation uses JavaScript/TypeScript with `@tsrx/core` as the
parser, semantic, and codegen-plugin substrate. This is an initial
implementation strategy, not a permanent architectural limit: prove the
framework behavior first, then replace compiler internals later if needed.

The compiler package is runtime-agnostic ESM. It should not import Node modules
for paths, files, URL handling, crypto, or process state. Path/URL normalization
should use portable helpers such as `pathe` and `ufo`; file access, module
resolution, hashing, environment data, and dev-server capabilities come from the
host adapter. The same compiler passes must be able to run under supported
server runtimes, edge runtimes, or a browser-hosted test harness without changing
framework semantics.

The first compiler should focus on the framework contracts:

- TSRX semantic graph artifacts
- state read/write rewriting
- template/view lowering
- sync event policy extraction
- lazy symbol extraction and capture analysis
- payload arena planning
- symbol resolver planning
- human-readable diagnostics

Do not start by building or depending on an OXC, Rust, or native compiler
backend. OXC migration is deferred performance/integration work. It is allowed
only when it preserves the same pass artifact contracts, fixture outputs,
diagnostics, and runtime semantics. The artifact shapes should stay
implementation-neutral so a backend swap changes compiler internals, not the
framework model.

### TSRX semantic graph artifact

The first framework-owned pass after parsing produces a TSRX semantic graph. It
is not the lowered TSX output and it is not borrowed from another framework's
AST model. The artifact combines:

- TSRX structural nodes and relations: statement containers, nested `@{...}`
  scopes, `@if`, `@for`, `@switch`, `@try`, `@empty`, branch/fallback
  relations, source spans, and hierarchy
- normal JavaScript/TypeScript semantic analysis inside those TSRX scopes:
  lexical bindings, imports, declarations, aliases, destructuring paths,
  reads, writes, calls, literals, object/array expressions, and event
  attributes
- host-specific annotations: graph-state creation sites, computed bodies,
  DOM update expressions, event/behavior boundaries, capture candidates, and DOM
  locator ownership

The compiler must prefer this semantic artifact over ad hoc source-string
inspection. For example, an authored event prop is an element attribute whose
value is a normal function expression; a text binding is a TSRX expression child;
a `count++` is an `UpdateExpression`; `menu.open = false` is an
`AssignmentExpression` with a member path; an object literal passed to
`state()` is an object expression whose static keys and literal values are known
before lowering.

Semantic analysis decides what an expression _refers to_. Runtime serialization
still validates what a dynamic value _is_. The compiler can know that
`state({ open: false })` starts as a serializable object and can track later
path writes such as `menu.open = true`; it cannot prove that every value flowing
through a server fetch, third-party call, or opaque function remains
serializable. Those dynamic cases are checked by the serializer and reported
with state-path diagnostics.

### Extraction is the compilation model

Qwik requires `$` because it operates on arbitrary TS where extraction must be
opt-in. Here the boundaries are structural and the compiler already knows them.
Every one of the following is extracted into its own lazily-loadable symbol, with
no annotation:

- event handler expressions (`onClick={...}`, `onVisible={...}`), including
  each entry in event handler arrays
- element behavior expressions (`attach={...}` on host elements), including each
  entry in behavior arrays
- `computed()` bodies
- async computed run functions and async boundary branch DOM updates
- DOM update expressions (text/attribute updates — the system's only effects)
- component bodies (executed during initial render only)

### The Capture Rule (replaces the marker)

An extracted closure may capture only:

1. `state()` / `computed()` references — serialized as graph references, not values
2. `element()` handles — serialized as DOM locators, not DOM nodes
3. props and `shared()` instance references
4. module-level imports — re-imported by the emitted symbol module
5. serializable constants (JSON-compatible values, plus the framework's extended
   set: Date, RegExp, Map, Set, URL, BigInt, typed arrays, ArrayBuffer)

Capturing anything else — a local class instance, a raw function, a DOM node held
in a plain variable — is a **compile-time diagnostic** pointing at the exact
variable, explaining why it can't cross a resume boundary and what to do instead
(usually: make it state, make it an `element()` handle, hoist it to module scope,
derive it inside the closure, or move DOM-backed setup into a host element
behavior with `attach`). The diagnostic does the job Qwik's `$` does, but only fires
when something is actually unserializable instead of taxing every line.
Diagnostic quality is a first-class deliverable, not polish.

## Testing Strategy

- **Compiler:** pass-level artifact tests plus final-output snapshots per
  language feature (state rewrite, destructuring aliasing, async dependency-key
  extraction, post-await diagnostics, boundary lowering, extraction, sync event
  policy extraction, capture diagnostics). Each pass has fixtures for
  input artifacts → output artifacts/diagnostics; full compiler snapshots still
  cover input `.tsrx` → emitted JS + symbol resolver/manifest.
  The accepted state-lvalue surface is defined by these fixtures: each new
  assignment/update/destructuring/collection-method form must prove its semantic
  target, lowered graph operation, preserved JavaScript behavior, or diagnostic.
- **Runtime:** unit tests on the graph (dependency tracking, path-level
  subscriptions, lazy computed, async computed status/versioning/cancellation).
- **Resumability end-to-end:** perform initial render for a fixture app, load it
  in a headless browser with only the tiny framework resumer allowed to execute,
  assert zero app/component/symbol execution before interaction or visibility,
  assert initial-render-resolved async data does not refetch on resume, then
  interact and assert only the expected symbols were fetched and the DOM updated.
  This e2e harness is the core invariant check and gets built early, not last.
  Use `@arcadejs/witness` for any resume mechanic that must prove initially
  rendered HTML, payload scripts, generated chunks, Vite/Rolldown integration,
  browser-loaded symbols, or no component execution on browser resume. If the
  local Witness package cannot observe or assert a resume behavior the framework
  needs, add that capability to the local `@arcadejs/witness` repo first instead of
  creating an ad hoc one-off harness in this monorepo.
- **Vitest browser mode:** use a framework-owned `packages/vitest-browser`
  package for targeted CSR browser mechanics where SSR/initial-render output is
  not the point. Its initial scope is real-browser event timing, DOM journal
  application, `IntersectionObserver`, element handle lookup, microtask
  behavior, and similarly focused DOM/runtime checks. Model the package after
  the CSR `render` / cleanup / `page.extend` shape in
  `/Users/jacksm5pro/dev/open-source/vitest-browser-qwik`, but do not adopt its
  SSR transform plugin path as the resumability proof strategy.
