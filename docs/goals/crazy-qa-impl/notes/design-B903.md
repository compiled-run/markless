# Design — B903: Component Bodies Execute At Initial Render

Fable design note for goal `crazy-qa-impl` (T002). Date: 2026-07-04.
Evidence base: T002 Scout receipt (emit-pipeline map, file:line verified); audit catalog S1.01,
S6.12, S1.03/S1.05 family; specs/framework/00-overview.md:41-42,89,121 and
10-render-architecture.md:64,91,153,261-264.

## Status of the question

This is **spec restoration, not a design choice**. The ratified specs already mandate:
component bodies execute during initial render (SSR and CSR) and never during browser resume.
Today's emitter contradicts that: both root finders (plan.ts:1472-1494; module.ts:1237-1259)
keep only the first template root, and the module emitter builds render functions from exactly
three sources (prop destructure, state-binding locals at module.ts:372-378, template HTML) —
no non-template statement is ever emitted. The design decisions below are about **how** bodies
execute, what remains unrepresentable, and how the coupled tasks consume this model.

## D1 — Order-preserving single-block emission

Replace the two-block emit (destructure + stateLocalLines) with ONE pass over the component
body's statements **in authored order**, interleaving at the region the Scout identified
(after destructureProps, before root/html construction):

- `state()` declarations → emitted at their authored position as graph-registered locals (D3).
- `computed()` declarations → authored-position locals; sync evaluation is B910's slice and
  lands on this scaffold.
- `element()` / handler / attach declarations → existing record extraction unchanged; the
  authored local also exists naturally in the executing body.
- **Every other statement — plain locals, expression statements (`console.log(x)`), `if`/loops,
  `try/catch` — is emitted verbatim, in order.** The body the developer wrote is the body that
  runs.
- The template return becomes the root/html construction at its authored position.

CSR and SSR emit the same body (SSR stays async; the async-computed inline runner at
module.ts:257 is the precedent). Per spec 00:121, an SSR'd-then-resumed page runs the body
exactly once (server); a CSR page runs it once (browser). **Resume is untouched**: resume.ts
consumes only `{root, graph, view, loadSymbol}` — the no-hydration contract needs no code
change, and that must stay true in review.

## D2 — Fail-closed residual gate

Anything the lowering pass must rewrite but cannot is a loud error, never a silent drop:
`MARKLESS_RENDER_BODY_UNSUPPORTED` (consequence → why → fix → link). With verbatim emission the
unrepresentable class is small — primarily state-aliasing shapes that B912 already diagnoses
(`let b = a`). The gate exists so future gaps self-report; it is NOT a license to gate
convenience cases.

## D3 — state() initializers evaluate at render time (B902 falls out of this)

`state(expr)` evaluates `expr` **in body order at initial render**. Emitted shape (naming
illustrative): `let count = marklessStateCreate("state:count", <expr>)` — registers the
evaluated value into the live graph (CSR) or into the payload state under construction (SSR).
Consequences:

- `state(obj.x)`, `state(a)`, `state(new Date(...))` — the dominant idioms the audit proved
  broken — work naturally: SSR evaluates, payload serializes the snapshot, resume restores.
- Compile-time literal folding (collect-state.ts:541-555) becomes an optimization only; it is
  no longer the semantic. protocol-state.ts:17 carries the folded value when statically known;
  otherwise the cell is marked render-filled and SSR evaluation supplies it.
- module.ts:484-490 must stop dropping unknown-valueKind cells (Scout-verified compounding bug).
- Scout correction adopted: the `$type: undefined` originates at protocol-state.ts:17 +
  serializer value.ts:215 — NOT payload-arena. B902's package cites accordingly.

## D4 — Plain locals in templates (B904 consumes this)

With bodies executing, plain locals exist in render scope: template reads of them become legal
**render-once** reads. They are not reactive — post-render writes to plain locals do not
re-render, and the existing write-in-template / non-graph-read diagnostics continue to teach
that boundary. B904's job shrinks to: declare what now exists, and keep a loud gate only for
locals that genuinely cannot be in scope at read time.

## D5 — Early returns and conditional roots (S6.12, bounded)

B903 ships: (a) statements before the first template root execute verbatim — including guard
clauses that return null/undefined (a component may legitimately render nothing; the plan must
represent the returned-early case rather than inverting it); (b) components with **multiple
template returns or a conditional template root** get a loud `MARKLESS_COMPONENT_ROOT_CONDITIONAL`
error naming the second return site. Full conditional-root planning (branch records at the root)
is a separate capability — record it at T200 for owner prioritization. Silent inversion dies
either way.

## D6 — One root finder

The duplicated finders (plan.ts:1472-1494, module.ts:1237-1259) unify into the single shared
helper that B906 (which lands BEFORE B903 in the T003 order) already touches for export-aware
rooting. B903 builds on B906's unified finder; plan and module can never again disagree about
the root or about which statements precede it.

## D7 — Blast radius and pinned shapes

compile-module.test.ts exact-HTML assertions (:628, :702, :933, :957, :1044, :1176) should stay
green — existing fixtures' bodies contain only declarations the new emit reproduces. Module-
SHAPE assertions (:624, :1163-1164, :1254-1257 toContain/empty-string checks) will change with
the emit structure: those revisions are pinned-shape changes, listed explicitly in the worker's
receipt and reviewed line-by-line (B908 discipline). Any exact-HTML change is a stop-and-report,
not a test edit.

## D8 — Out of scope, permanently

- Reactivity of plain locals (writes never re-render; the graph is the reactivity boundary).
- Body execution at resume (no-hydration is the product).
- Cross-module composition concerns (B917/B919 territory).

## Coupling contract for downstream packages

- **B904**: locals exist; declare-or-gate per D4.
- **B902**: render-time initializer evaluation per D3; payload plan gains render-filled cells.
- **B910**: sync computeds emit on the D1 scaffold at authored positions.
- **B913 slice 2**: plain-local writes are writes to real variables in a real executing body;
  the relaxation's semantics are D1's, its guards are B911/B912's.
- **B908 design note**: handler emit must match D1's fidelity bar — authored code survives;
  writes-only synthesis dies.
