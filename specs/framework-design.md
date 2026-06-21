# Arcade TSRX Framework — Design

This file has been split into implementation-facing specs under
[specs/framework](./framework/00-overview.md).

After opening this index, read [00-overview.md](./framework/00-overview.md),
then load only the ownership file relevant to the work in front of you. The
pre-split full document is preserved at
[archive/design-thread.md](./framework/archive/design-thread.md).

## How To Use This File

This file is the navigation index for the current framework contract. It is not
the full spec and it should not accumulate implementation details. When work
touches a concrete behavior, update the narrow split spec that owns that
behavior and keep this file limited to cross-cutting orientation.

Source order:

1. Use this file to find the owning split spec.
2. Read [00-overview.md](./framework/00-overview.md) for the product contract.
3. Read the narrow split spec for the behavior being changed.
4. Use [state.md](./state.md) only to answer what has already been completed in
   this worktree.

## Implementation State

- [state.md](./state.md) tracks current implementation progress and caveats. It
  is a progress ledger, not the behavior contract; the split framework specs
  remain the source of truth.
- The current worktree has begun production implementation, but product-level
  completion must be checked in `state.md` and verified against the actual
  source tree.
- Use `state.md` to answer "what has been completed in this worktree?" Do not
  infer completion from this design index alone.
- Use the "Full Spec Implementation Distance" section in `state.md` for a
  current gap summary before planning the next implementation slice.
- Status entries in `state.md` should remain tied to concrete source files,
  tests, or command output. If there is no current evidence, record the item as
  remaining work instead of completed work.
- Verification entries in `state.md` should state their scope. A narrow
  formatting check, architecture scan, or focused unit test is useful evidence
  only for the slice it actually covers.
- Treat recorded verification as receipts from this worktree, not permanent
  green status. Rerun the relevant command before using it to claim a current
  implementation slice is still complete.

## Compiler Boundary

TSRX owns the authoring syntax and structural control-flow semantics. The
framework compiler consumes TSRX parser/codegen-plugin artifacts and adds the
`@arcade/core` host semantics: graph references, state lowering, capture
diagnostics, symbol extraction, payload planning, and render/resume protocol
wiring.

The compiler is the primary implementation vehicle for marker-free resumability.
Runtime packages execute the graph, serializer, and resume protocol artifacts,
but they do not recover semantics by hydrating component trees or reconciling a
VDOM.

## Split Spec Index

- [00-overview.md](./framework/00-overview.md) — product contract, package
  map, build model, and portability rules.
- [01-tsrx-host-contract.md](./framework/01-tsrx-host-contract.md) — TSRX host
  semantics and projection model.
- [02-compiler-pipeline.md](./framework/02-compiler-pipeline.md) — pass
  pipeline, artifact contracts, extraction boundaries, and capture diagnostics.
- [03-state-graph.md](./framework/03-state-graph.md) — state/computed/shared
  semantics and graph behavior.
- [04-events-symbols-behaviors.md](./framework/04-events-symbols-behaviors.md)
  — event extraction, sync policy, element handles, behaviors, and symbols.
- [05-resumability-payload.md](./framework/05-resumability-payload.md) —
  serializer tiers, payload scripts, and protocol contents.
- [06-runtime-resumer.md](./framework/06-runtime-resumer.md) — runtime graph,
  initial render, browser resume, scheduler, and DOM mutation behavior.
- [07-diagnostics.md](./framework/07-diagnostics.md) — diagnostic shape,
  phases, and required user-facing errors.
- [08-deferred-decisions.md](./framework/08-deferred-decisions.md) — accepted
  deferred topics and high-level build order.
- [09-compiler-module-split-plan.md](./framework/09-compiler-module-split-plan.md)
  — concrete production compiler split target and migration order.
