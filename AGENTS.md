# Arcade Project Rules

This repo is currently specification-first. When implementation starts, this file
is the Codex-facing always-on guidance for building the TSRX resumable framework.

## Source Of Truth

- Read `specs/framework-design.md` first, then the relevant split spec under
  `specs/framework/`.
- Use `specs/state.md` only as an implementation progress ledger. It records
  completed work and caveats, not framework behavior requirements.
- Treat `specs/framework/archive/design-thread.md` as historical context, not the
  current implementation contract.
- Project-local task skills live under `.codex/skills/`. Use
  `$arcade-implementation` for implementation work and
  `$arcade-spec-maintenance` for spec edits when available.

## Maintainer Kanban Board

- When acting as an ArcadeJS maintainer on feature work, keep the canonical
  GoalBuddy kanban board current. Board truth lives in the relevant
  `docs/goals/<slug>/state.yaml`; generated `.goalbuddy-board/` files are only
  the visual view.
- Before changing feature code, identify the board task that owns the work. If a
  feature-sized change has no board, create or request a GoalBuddy board instead
  of tracking the work only in chat.
- Update `state.yaml` whenever feature work changes status: starting or
  finishing a task, changing `active_task`, adding or reordering follow-up work,
  blocking or unblocking a task, or discovering new required verification.
- Do not stop or hand off feature work without recording the current status,
  receipts/evidence, verification results, and the next task or explicit blocker
  in the board. If a local visual board is live, refresh/regenerate it after
  changing `state.yaml` when the tool is available.

## Core Framework Constraints

- TSRX-only. Do not add TSX/JSX support or reactive behavior in plain `.ts`
  files.
- No hydration. Component bodies execute during initial render, not during
  browser resume.
- No VDOM. Runtime graph data is state/dataflow and DOM locator metadata, not a
  virtual element tree or render-output reconciliation layer.
- Do not create a standalone `server` package. Initial render and browser
  resume are two phases of one unified runtime/render model, not separate
  framework products or authoring models.
- Treat monorepo libraries as internal implementation boundaries until tests
  prove what should be public. Most consumers should use the main package and
  curated re-exports; do not publish or document deep package APIs prematurely.
- First compiler implementation is JS/TS on `@tsrx/core`. OXC/native work is
  deferred until the framework behavior and artifact contracts are proven.
- Do not use the sibling `../native-tsrx` repository for this project: do not
  inspect it, edit it, run commands in it, or make Arcade work depend on changes
  there. Treat `@tsrx/core` as an external dependency boundary; when a parser
  artifact is missing, keep Arcade tests at the compiler artifact boundary,
  document the caveat, or ask the user before any dependency work.
- Core packages are runtime-agnostic ESM. Avoid `node:*`, `fs`, `path`,
  `process`, `Buffer`, and Node-only assumptions in shared compiler/runtime code.
  Use host adapters for file access, module resolution, hashing, environment
  state, and dev-server integration.
- Prefer Web APIs plus `pathe` for filesystem-like path handling and `ufo` for
  URL/pathname/query handling.
- Build scripts and production optimization must use Rolldown or Vite only. Do
  not add standalone esbuild, terser, Rollup, SWC, webpack, Babel build
  pipelines, or similar secondary transformers/minifiers.

## Naming For Contributors And Agents

- Prefer names a junior developer can understand from the local file and the
  current task. Use concrete nouns from the user-facing concept (`imports`,
  `frameworkApi`, `payload`, `locator`) over internal shorthand or abstract
  labels that require project history.
- Compiler helper files and functions should make the ownership and reason
  visible. If a name still needs framework context, add a short comment near the
  helper that explains what it reads, why it exists, and what callers should do
  with the result.
- Avoid introducing new terms such as "intrinsic", "authored primitive", or
  similar compiler jargon in source names unless the spec section and diagnostic
  already use that exact term for users.

## Pnpm / Vite-Plus Monorepo Shape

This framework will be a **pnpm workspace** and vite-plus monorepo with multiple
libraries. `package.json`, `pnpm-workspace.yaml`, and the pnpm lockfile own the
workspace/dependency source of truth; vite-plus is the preferred command and
tooling surface for build, test, check, format, and lint.

Use QDS and qwik-bundler as shape references for the root vite-plus config,
multi-lib pack configuration, and plugin/fixture organization:

- `/Users/jacksm5pro/dev/open-source/qwik-design-system/vite.config.ts`
- `/Users/jacksm5pro/dev/open-source/qwik-bundler/vite.config.ts`

Expected shape:

- root `package.json` owns scripts, package-manager metadata, and shared dev
  dependencies
- root `pnpm-workspace.yaml` owns workspace package globs
- root `pnpm-lock.yaml` is the committed dependency lockfile once dependencies
  are installed
- root `vite.config.ts` owns pack, test, lint, format, and staged configuration
  through vite-plus
- current proof implementation lives under `poc/packages/*`; do not extend it
  when beginning production framework work unless the task is explicitly a POC
  maintenance task
- production package folders are `packages/arcade`, `packages/core`,
  `packages/protocol`, `packages/runtime`, `packages/serializer`,
  `packages/compiler`, `packages/bundler`, `packages/test-utils`, and
  `packages/vitest-browser`
- `packages/arcade` owns the public `arcade` package and curated re-exports.
  `packages/core` owns the internal implementation boundary for compiler-
  rewritten authoring APIs. The other packages are internal implementation
  boundaries until tests prove what should become public
- do not create `packages/server`
- package/library builds are represented as multiple vite-plus `pack` configs,
  similar to QDS's `buildOrder`
- framework packages live as multiple libs/packages rather than one large package
- prefer vite-plus commands directly: `vp pack`, `vp test`, `vp check`,
  `vp fmt`, `vp lint`, and `vp config`
- pnpm scripts should be thin repo-boundary aliases that invoke vite-plus
  commands rather than replacing them with custom script stacks
- use vite-plus test projects for Node/unit integration and browser/component
  testing where appropriate
- use `vite-plus/test/browser-playwright` for Vitest browser-mode provider wiring
- use vite-plus-managed formatting/linting tooling, including oxfmt/oxlint-style
  behavior exposed through `vp fmt`, `vp lint`, and `vp check`

Do not introduce another primary workspace package manager. The
monorepo/package-manager model is pnpm, and the root workspace source of truth
is `package.json` plus `pnpm-workspace.yaml` unless this spec is deliberately
reopened.

Do not add separate Jest, standalone Vitest CLI conventions, Prettier, ESLint,
Biome, tsup, tsdown, or custom build script stacks unless the spec is explicitly
reopened. The repo's default tooling entry point is vite-plus.

The QDS config is a reference for the monorepo/vite-plus shape, not permission
to copy Node-specific helpers into shared framework packages. The runtime-
agnostic rule still applies to compiler/runtime/render-resume code.

## Test-Driven Development

Everything is test-driven. For behavior changes and bug fixes, write or update
the closest focused test first, run it, and confirm it fails for the expected
reason before implementing.

Use the red-green-refactor loop:

1. Add the failing test that describes the missing behavior.
2. Run the narrowest command that proves the failure.
3. Implement the smallest code change that makes the test pass.
4. Rerun the focused test.
5. Broaden verification only when the change touches shared behavior.

Do not skip the failing-test step for implementation work. If the task is
spec-only, formatting-only, generated metadata, or genuinely impossible to test
first, say why in the final response.

Tests should assert observable behavior or artifact contracts, not incidental
implementation details. Compiler tests should prefer pass artifacts and
diagnostics over giant generated-bundle snapshots unless the final emit is the
thing under test.

## Implementation Sequencing

Start implementation with pass-boundary TDD, not an end-to-end browser demo.
Each layer should produce a human-readable artifact that the next layer consumes.
This keeps the compiler/runtime contract inspectable and prevents architecture
from disappearing into generated code or browser-only behavior.

Preferred first sequence:

1. TSRX semantic graph: prove the compiler can identify components, host nodes,
   bindings, event props, `state()` sites, writes, async reads, and DOM locator
   ownership.
2. State lowering: prove plain-looking reads and writes such as `count++`,
   `obj.x = y`, template reads, and closure reads lower through graph access.
3. Payload arena planning: prove graph cells, view records, event records, sync
   policy records, symbol IDs, and locators can be represented without runtime
   DOM code.
4. Symbol resolver planning: prove lazy event handlers, bindings, behaviors,
   and async run functions become symbol IDs whose dynamic imports are owned by
   the generated resolver.
5. Runtime graph: prove reads, writes, subscriptions, computed invalidation,
   async state, and flush journal semantics against the planned payload shapes.
6. Browser resume: decode payloads, locate nodes, attach delegated events, run
   sync policy, resolve symbols, write graph state, and flush concrete DOM
   mutations.

Do not skip earlier pass artifacts just to make a demo work. End-to-end fixtures
are valuable after the pass contracts exist.

### Compiler Pass Boundary Guardrail

Compiler maintainability is a product requirement. A new contributor should be
able to find the pass that owns a behavior, read its input/output artifacts, run
its focused tests, and make a change without understanding the whole compiler.

Before adding or expanding compiler behavior in `packages/compiler`, inspect the
current compiler module layout, pass registry, and pass-level tests. The
mini-compiler architecture from `specs/framework/02-compiler-pipeline.md` is
mandatory: the production compiler should be organized around pass-owned modules
and typed artifacts, not one growing `index.ts`, one broad AST visitor, or one
mutable compiler context shared by unrelated passes.

If compiler behavior is still concentrated in a large orchestrator/barrel file,
stop and make the next compiler change a pass-boundary extraction or pass module
split before adding more semantics. `index.ts` may re-export. The orchestrator
may validate and run the pass graph. Semantic graph collection, state lowering,
async dependency extraction, sync event policy extraction, capture analysis,
template/view lowering, payload arena planning, symbol resolver planning, and
final emit should each have visible ownership and focused artifact tests.

Future compiler PRs/goals should report:

- the pass ID touched or created
- the artifacts it consumes and produces
- the pass-owned module where the behavior lives
- the focused artifact fixture or test that proves the boundary

A green end-to-end fixture is useful evidence, but it is not enough to justify
bypassing pass-level artifacts.

## Proof Fixtures

The completed POC lives under `poc/`: proof fixtures under
`poc/fixtures/proofs/` and proof implementation packages under
`poc/packages/*`. These are executable specs and design evidence, not production
framework packages. When beginning real implementation, create or modify root
`packages/*` and use the POC as regression material. Do not hand-write large
final artifact JSON before the relevant pass exists; add expected artifacts one
pass at a time through failing tests.

Each proof should be started as its own GoalBuddy-prepared goal. First use the
GoalBuddy prompt/prep flow for the single proof, then run the generated `/goal`
command. Do not launch raw proof goals directly from memory. The generated goal
should scope ownership to exactly one `poc/fixtures/proofs/<name>/` directory, allow
shared index updates only when needed, and forbid framework-internal
implementation work unless the proof task explicitly asks for it.

Initial proof set:

- `resume-basic`: canonical vertical slice covering scalar `state()` counter,
  object path write, lazy event symbol, sync `preventDefault()` policy, async
  `computed()` with `@try`/`@pending`/`@catch`, one `attach={...}` behavior, and
  one `element()` / `el={...}` locator.
- `state-lvalues`: plain JavaScript mutation lowering, including `count++`,
  assignment, object paths, nested paths, array mutation expectations, aliases,
  and invalid writes.
- `sync-event-policy`: isolated extraction of synchronous
  `preventDefault()` / `stopPropagation()` policy from graph state and event
  fields, leaving writes in lazy symbols.
- `payload-locators`: DOM-order locators, branch anchors, keyed list item
  locators, text binding locators, behavior host locators, and element handle
  locators without per-node attributes or VDOM semantics.
- `symbol-resolver`: handler, binding, behavior, and async run symbols whose
  dynamic imports are owned by the generated resolver, plus unknown-symbol
  fail-closed behavior.
- `serializer-values`: serialization tiers, object identity/cycles, built-ins,
  app value class restore, unsupported DOM/runtime diagnostics, and secret-leak
  warning shape when applicable.
- `scheduler-journal`: batched writes, microtask flush, computed invalidation,
  concrete DOM mutation journal entries, async completion versioning, and no
  rollback after committed writes.
- `bundler-pipeline`: Vite/Rolldown/Witness proof for TSRX transforms, virtual
  modules, emitted chunks, manifest output, HMR artifact updates, and no
  Node-only assumptions in shared packages.

## Test Types

- **Unit tests:** use `vite-plus` / `vp test` once the package exists. Cover pure
  compiler passes, graph runtime behavior, serializer units, symbol resolver
  helpers, path/URL utilities, and diagnostics.
- **Integration tests:** use `vite-plus` / `vp test` for fixture-backed
  integration across the compiler, runtime graph, unified render/resume runtime,
  Rolldown plugin, and Vite adapter.
- **Component/browser tests:** use Vitest browser mode for component-level DOM,
  SSR/resume, event, and interaction behavior. Model the harness after
  `/Users/jacksm5pro/dev/open-source/vitest-browser-qwik`, adapted for this
  framework instead of Qwik.
- **Pipeline tests:** use the local witness package at
  `/Users/jacksm5pro/dev/open-source/witness` to inspect how the Vite/Rolldown
  pipeline behaved. Use witness receipts for HMR, server restarts, client reloads,
  build artifacts, manifest output, leaked server-only values, and edit-to-update
  behavior.

## Bundler And Fixture References

For bundling behavior, structure the framework plugins similarly to:

`/Users/jacksm5pro/dev/open-source/qwik-bundler`

Before changing `packages/bundler` or its fixture tests, inspect the applicable
`qwik-bundler` source/fixtures and use them as the reference shape for Rolldown
and Vite plugin architecture:

- `src/rolldown.ts` style entry for Rolldown-first plugin behavior.
- `src/vite/*` style adapter layer for Vite-specific dev/HMR/HTML integration.
- `src/build/*` style helpers for manifest, chunking, and build artifact logic.
- fixture-backed tests for real plugin behavior.

There is no router plugin for this framework. Do not copy router-specific
behavior or route-framework assumptions from `qwik-bundler`; use only the
bundler, Vite, Rolldown, fixture, and HMR structure that applies to the core
framework.

## Verification

- Start with the narrowest failing test command.
- Use `vp test` for unit/integration tests once vite-plus is configured.
- Use Vitest browser mode for component/browser behavior.
- Use witness boxes for pipeline and HMR behavior.
- Run `git diff --check` for spec or Markdown-only edits.
- Before finalizing, scan the diff for accidental hydration, VDOM, Node-only
  APIs, non-Rolldown/Vite build tooling, or untested behavior changes.
