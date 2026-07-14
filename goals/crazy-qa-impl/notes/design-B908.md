# Design — B908: Symbol-Module Emit Integrity

Fable design note for goal `crazy-qa-impl` (T108 gate). Date: 2026-07-05.
Written after B903 landed, per T003 sequencing: handler emit must match D1's
authored-code-fidelity bar. Evidence: audit catalog S3.04/S3.05/S3.08/S3.11/S8.08 (Batch 3/8),
S5.08/S5.10 (Batch 5); T011 source confirmation (symbol-modules.ts:146-185 writes-only synthesis,
pinned by symbol-modules.test.ts:1585/:1638-1694); T014 source confirmation (symbol-resolver.ts:374
regex handle-call collection; symbol-modules.ts:1652 emitter inserts `?.` itself).

## The defect class

Handler symbol modules are SYNTHESIZED from write records only: everything else the developer
wrote — helper calls, `await` ordering, `preventDefault()`, `setTimeout` deferral, guards —
is deleted from the executable path. This is the same fail-open deletion class B903 killed in
render bodies, now in the event plane. Owner ruling 2 signed off on revising the pinned tests
that assert the writes-only contract.

## D1 — Span-spliced authored-body emission (Unit A)

The handler symbol module emits the AUTHORED function body, not a synthesis. Mechanism:
**source-span splicing** — take the authored body source verbatim; replace exactly the spans the
state-lowering artifacts already identify (graph reads/writes) with their `context.graph`
operations; everything between the spans survives by construction.

Why splicing over re-synthesis: unknown constructs *survive verbatim* instead of vanishing.
Passthrough inside a handler is safe — the emitted module runs as real JS in the browser; the
danger was deletion, never execution. This inverts the failure mode the same way B903 did.

Consequences that fall out:
- Imported helper calls survive; the symbol module carries the imports whose local names appear
  free in the emitted body (conservative over-inclusion is fine — the bundler tree-shakes).
- `await` ordering preserved: async handlers stay async; `await save()` runs before post-await
  writes (S3.08). No more synthesized reordering.
- `setTimeout`-deferred writes stay deferred (S8.08): the callback is authored code; writes
  inside it splice to context.graph like any other span. Temporal semantics restored.
- `preventDefault()` stays in the authored body. B914 (P1) owns sync-policy extraction; the
  authored call re-running in the lazy symbol against a settled event is a no-op, not a bug.
  Do NOT try to solve sync policy in this slice.

## D2 — The capture boundary (Unit A)

Handlers closing over COMPONENT-BODY locals: those are render-scope values that do not exist at
resume time. Policy: a captured body-local read resolves through the existing capture plane
(inputValues / inputGraphReads — proven working in S7.12/S5.08 audits) when the value class
supports it; otherwise the handler emits MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED naming the
captured local and teaching state() — NEVER a `void context;` no-op module. B913s2's stale-local
diagnostic already covers the write direction.

## D3 — AST-based handle-call collection (Unit B)

The regex at symbol-resolver.ts:374 dies; handle-call collection walks the handler's AST.
Fixes authored `h?.focus()` deletion (S5.10) structurally, plus the whole fragile-mechanism
class the T014 Judge flagged (strings, comments, nested calls). The emitter keeps inserting
its own `?.` on resolution (symbol-modules.ts:1652 behavior is correct).

## D4 — Local behavior factories emit (Unit B, owner ruling 1)

`canEmitBehaviorModule` learns to inline a same-file factory FunctionDeclaration's source into
the behavior symbol module — the arrow-inline path is the existing template; capture analysis
already plans inputValues/inputGraphReads for factories. MARKLESS_BEHAVIOR_SYMBOL_EMIT_UNSUPPORTED
remains only for factories capturing genuinely unemittable values. The spec's own §Element
behaviors example must compile and install.

## D5 — Pinned-test revision protocol (owner ruling 2)

The writes-only assertions (symbol-modules.test.ts:1585, :1638-1694 area) are revised alongside
Unit A. Every revised assertion is listed file:line in the worker receipt and reviewed
line-by-line by Fable. Assertions about symbol module STRUCTURE (id wiring, export shape,
resolver registration) must survive unchanged — only the writes-only body expectations change.

## Out of scope

Sync-policy extraction refinement (B914). Event-only runtime dispatch (B909). Prop-handle
forwarding (B918). Cross-module factories (loud gate stays).
