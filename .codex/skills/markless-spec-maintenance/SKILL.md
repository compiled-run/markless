---
name: markless-spec-maintenance
description: 'Use when updating, splitting, reviewing, or reconciling the Markless framework design specs under specs/framework* or the specs/state.md progress ledger. Applies the current decisions without over-scoping implementation: TSRX-only, no hydration, no VDOM, graph-state resumability, compiler artifact pipeline, JS/TS on @tsrx/core first, runtime-agnostic ESM, Rolldown/Vite-only build tooling, and explicit deferred decisions.'
---

# Markless Spec Maintenance

## Source Order

1. Start with [specs/framework-design.md](../../../specs/framework-design.md) as the index.
2. Read only the relevant split spec files under [specs/framework](../../../specs/framework).
3. Treat [archive/design-thread.md](../../../specs/framework/archive/design-thread.md) as historical context, not the current implementation contract.
4. Keep deferred or intentionally unresolved topics in [08-deferred-decisions.md](../../../specs/framework/08-deferred-decisions.md).
5. Use [specs/state.md](../../../specs/state.md) only for completed-work status and caveats, not behavior requirements.

## Maintenance Rules

- Preserve the major decisions unless the user explicitly reopens them:
    - TSRX-only, no TSX/JSX support.
    - No hydration and no component execution on client resume.
    - No VDOM, no render-output reconciliation, no client component rerender path.
    - State is a graph data plane; lazy symbols are the behavior/code plane.
    - Dynamic imports are owned by the symbol resolver, not event props.
    - Sync event policy handles browser-immediate behavior before lazy imports.
    - First compiler implementation uses JS/TS with `@tsrx/core`; OXC/native work is deferred.
    - Do not use the sibling `../native-tsrx` repository: do not inspect it, edit it, run commands in it, or make Markless work depend on changes there.
    - Shared packages are runtime-agnostic ESM and avoid Node-only APIs.
    - Build scripts and optimization use Rolldown or Vite only.
- Do not specify low-level runtime storage shapes unless the user asks. Specify behavioral contracts instead.
- Do not define exact compiler output prematurely. Prefer human-readable artifacts, pass boundaries, diagnostics, and fixtures.
- Make implementation-facing additions concrete enough for tests: accepted behavior, unsupported cases, diagnostics, and validation strategy.

## File Map

- `00-overview.md`: product contract, architecture, portability, build boundaries.
- `01-tsrx-host-contract.md`: TSRX host semantics and projection model.
- `02-compiler-pipeline.md`: pass pipeline, artifact contracts, extraction/capture, tests.
- `03-state-graph.md`: state/computed/shared semantics and serialization-facing state rules.
- `04-events-symbols-behaviors.md`: element handles, `attach`, events, sync policy, symbol resolver.
- `05-resumability-payload.md`: serializer tiers, compact data scripts, payload contents.
- `06-runtime-resumer.md`: graph behavior, scheduler, flush, resume.
- `07-diagnostics.md`: compiler/runtime diagnostic shape and examples.
- `08-deferred-decisions.md`: known later decisions and build order.
- `09-compiler-module-split-plan.md`: concrete production compiler split target and migration order.
- `../state.md`: implementation progress ledger and caveats, not contract.

## Checklist

- Update the narrowest spec file that owns the decision.
- Keep wording direct and testable.
- Cross-link by filename only when it helps navigation.
- Run `git diff --check`.
- Do not commit unless the user asks.
