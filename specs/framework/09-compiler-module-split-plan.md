# Compiler Module Split Plan

Implementation-facing plan for making `packages/compiler` match the
mini-compiler architecture from `02-compiler-pipeline.md`.

This file exists so implementation goals can point at a concrete refactor target
before adding more compiler semantics.

## Purpose

Compiler maintainability is a product requirement. A new contributor should be
able to:

- find the pass that owns a behavior
- read the artifacts that pass consumes and produces
- run a focused fixture test for that pass
- change that pass without understanding the whole compiler

The production compiler must not grow around one large `index.ts`, one broad AST
visitor, or one mutable compiler context shared by unrelated passes. `index.ts`
may re-export the curated package surface. The orchestrator may validate and run
the pass graph. Neither should contain pass implementation details.

## Initial Split Target

The production compiler split target is the minimum source shape that future
compiler behavior must preserve. The package entry file is a curated export
surface; pass behavior belongs in pass-owned modules and shared helpers whose
responsibilities are visible from the file tree.

Required source ownership:

- shared artifact and diagnostic types live outside the package entry file
- pass registry and pass graph validation live in their own modules
- `compileTsrxModule` orchestration lives outside pass implementation modules
- protocol state/view and payload script planning are pass-owned modules
- semantic graph collection and semantic diagnostics live under the semantic
  graph pass
- raw AST/source helper utilities do not encode framework graph semantics

The first implementation may keep behavior equivalent while moving files. Do not
use this split as permission to redesign emitted artifacts, add new semantics,
or bypass pass-level tests. If a future change moves compiler behavior back into
the entry file or a broad shared visitor, fix that boundary before adding more
semantics.

## Target Source Layout

Preferred production layout:

```txt
packages/compiler/src/
  index.ts
  compile-module.ts
  pass-registry.ts
  pass-graph.ts
  artifacts.ts
  diagnostics.ts

  ast/
    nodes.ts
    source.ts

  artifact-helpers/
    graph-paths.ts

  passes/
    semantic-graph/
      index.ts
      types.ts
      diagnostics.ts
      collect-module-scope.ts
      collect-components.ts
      collect-elements.ts
      collect-state.ts
      collect-aliases.ts
      collect-async.ts
      collect-sync-policy.ts
      collect-expressions.ts
    state-lowering.ts
    payload-arena.ts
    symbol-resolver.ts
    protocol-state.ts
    protocol-view.ts
    payload-scripts.ts
    symbol-resolver-module.ts
```

This is a target shape, not a requirement to create empty files. Add a file when
there is pass-owned behavior or a shared artifact contract for it to contain.

## File Responsibilities

- `index.ts`: curated public exports only. No AST walking, no graph mutation, no
  pass implementation bodies.
- `compile-module.ts`: top-level orchestration for `compileTsrxModule`.
- `pass-registry.ts`: default pass list, stable pass IDs, descriptions,
  `consumes`, and `produces`.
- `pass-graph.ts`: pass graph validation, dependency ordering, duplicate
  producer checks, missing artifact diagnostics, and cycle checks.
- `artifacts.ts`: shared input/output artifact types exchanged between passes.
- `diagnostics.ts`: shared diagnostic shape and helpers used by more than one
  pass. Pass-specific diagnostics stay with the owning pass when possible.
- `ast/`: syntax helpers and raw AST traversal utilities. These helpers should
  not encode framework graph semantics.
- `artifact-helpers/`: helpers that operate on pass artifacts, such as graph
  path resolution and alias maps.
- `passes/*`: pass-owned implementation. Each pass module owns one narrow domain
  and returns a human-readable artifact.

## Semantic Graph Pass Shape

The semantic graph pass is allowed to parse and walk TSRX/JavaScript AST. Raw
AST traversal should stay inside `passes/semantic-graph/` and other explicit
syntax-analysis passes.

The semantic graph pass should be internally split by collector domain:

- module-scope graph-state diagnostics
- component and prop collection
- host element and attribute collection
- state/computed/element binding collection
- alias and destructuring collection
- async boundary and async dependency diagnostics
- sync event policy extraction
- expression read/write collection

These collectors may share a pass-private `WalkState` and mutable graph builder
inside `passes/semantic-graph/`. That state must not leak to downstream passes.
Downstream passes consume `SemanticGraphArtifact`, not raw AST nodes or
walker-local state.

If state lowering, payload planning, symbol planning, or protocol emission needs
more syntax information, add or version the semantic graph artifact. Do not
re-walk source in downstream passes.

## Migration Order

Move or repair boundaries in small, behavior-preserving steps. The current
worktree records completed split work in `../state.md`; this sequence remains
the preferred order for future repairs if source ownership regresses. Each step
should keep or improve the focused tests for the moved boundary.

1. Extract shared artifact and diagnostic types into `artifacts.ts` and
   `diagnostics.ts`.
2. Extract `defaultCompilerPasses` into `pass-registry.ts`.
3. Extract `validateCompilerPassGraph` and related helpers into
   `pass-graph.ts`.
4. Extract `compileTsrxModule` into `compile-module.ts`.
5. Extract protocol-state, protocol-view, and payload-script planning into pass
   modules if they still live in the entry file.
6. Move `buildSemanticGraph` and its private helpers into
   `passes/semantic-graph/index.ts`.
7. Split `passes/semantic-graph/index.ts` into collector modules by domain.
8. Extract duplicated graph path and alias resolution into
   `artifact-helpers/graph-paths.ts`.
9. Reduce `index.ts` to curated exports and verify no pass implementation body
   remains there.

Do not combine this refactor with unrelated framework behavior. If a step needs
a semantic change, split that into a later TDD change after the module boundary
is clear.

## Acceptance Gates

A compiler split step is complete only when:

- the moved pass or helper has a clear owning module
- imports no longer depend on `index.ts` for internal artifact types
- pass IDs and `consumes` / `produces` remain stable unless deliberately changed
- existing focused pass tests still cover the moved behavior
- new or changed tests assert artifacts or diagnostics, not only final emitted
  bundles
- `index.ts` does not regain pass implementation logic through convenience
  re-exports
- `git diff --check` passes

For compiler behavior goals, the final response should name:

- the pass ID touched or created
- the artifacts it consumes and produces
- the pass-owned module where the behavior lives
- the focused artifact fixture or test that proves the boundary

## Non-Goals

- Do not create a second compiler API while splitting files.
- Do not introduce OXC, Rust, Babel, SWC, or another compiler backend.
- Do not add VDOM or client component re-execution paths.
- Do not move framework semantics into generic AST utilities.
- Do not make downstream passes depend on raw AST nodes just to avoid extending
  an artifact.
