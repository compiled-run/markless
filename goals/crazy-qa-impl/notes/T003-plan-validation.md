# T003 — Judge: Plan Validation, Owner-Ruling Re-scopes, P0 Order

Judge decision for goal `crazy-qa-impl`. Date: 2026-07-04. Decision: **plan validated + re-scoped**.
Source surfaces re-verified during this review: state-lowering.ts:125 unresolved-write path,
WalkState context fields (semantic-graph/types.ts:49-69), symbol-resolver.ts regex handle
collection (~374), symbol-modules canEmitBehaviorModule (~415), serializer value.ts truthiness
drops (316-321/349/370/385) + plain-object fallback (376).

## Re-scoped packages (Owner Rulings applied)

### B905 (card T105) — TWO SLICES
- **Slice 1 (gate)**: add `currentCreationSite: 'computed'|'handler'|'helper'|'branch'|'loop'|null`
  to WalkState (types.ts:49-69), plumbed in semantic-graph/index.ts. One unified
  MARKLESS_STATE_CREATION_SITE_UNSTABLE (site-variant messages; computed/handler/branch/loop are
  NOT owner-ruled capabilities — permanent errors) + REMOVABLE MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED
  for S7.05 only. Suppress phantom top-level binding AND planned payload cell at all 5 sites.
  Files: semantic-graph/{collect-state,types,index,diagnostics}.ts + compiler tests.
  Limit: 260 added lines (170 tests).
- **Slice 2 (capability, ruling 1; AFTER T112/B912 alias machinery)**: same-module helper-return
  alias tracking — `const count = useCounter()` resolves to the helper-created graph node;
  reads/writes/payload/handler emit all work; remove the S7.05 gate; prove catalog S7.05 shape
  (alternate-named) end-to-end incl. payload cell + working handler write.
  Adds: collect-aliases.ts, state-lowering.ts, payload-arena.ts. Limit: 300 (180 tests).
- **T200 CAVEAT for owner**: spec 03:222 sanctions helper creation in OTHER .tsrx files; no
  multi-module compile harness exists. Slice 2 = same-module helpers + loud cross-module gate.
  Owner ratifies at the P0 boundary whether that meets ruling 1 or approves harness work.

### B908 (card T108) — TWO UNITS, capability-direct, design note FIRST (post-B903)
- **Unit A (handler emit integrity)**: replace writes-only synthesis in emitEventHandlerModule
  with authored-body emission per the design note — imported handlers emit import+call (S3.04);
  async handlers preserve await ordering, save() runs before post-await writes (S3.08);
  setTimeout-deferred writes stay deferred (S8.08); event-object escapes → MARKLESS_EVENT_TARGET_ESCAPE
  WARN (S3.11); genuinely unrepresentable bodies → MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED —
  never a void-context no-op. Pinned assertions revised (symbol-modules.test.ts:1585, :1638-1694;
  ruling 2 signed off; Fable reviews those diffs line-by-line). Limit: 450 (250 tests).
- **Unit B (handle calls + behavior factories)**: AST-based handle-call collection replaces the
  regex (symbol-resolver.ts ~374; fixes deleted `h?.focus()`, S5.10); local behavior factories
  EMIT (ruling 1) — canEmitBehaviorModule inlines the local factory source (arrow inline path is
  the template); MARKLESS_BEHAVIOR_SYMBOL_EMIT_UNSUPPORTED reserved for factories capturing
  unemittable values. Capability-in-one-slice is safe here: no cross-edge tracking needed.
  Limit: 300 (180 tests).
- Sequenced AFTER T113 so behavior-body plain writes compile under the relaxed policy.

### B913 (card T113) — TWO SLICES (ruling 3)
- **Slice 1 (message fix — IMMEDIATELY after T101)**: rewrite the MARKLESS_STATE_UNRESOLVED_WRITE
  suggestion (state-lowering.ts ~125) — it currently recommends the exact thing that errors.
  Limit: 30 (15 tests). Ruling exemption from micro-slice policy.
- **Slice 2 (guarded relaxation — ONLY after T111/B911 + T112/B912 merged)**: plain non-graph
  local writes in component/handler/behavior bodies compile clean (intuitive bar: the S7.06
  control `let total = 0; for (...) total += i` works). **Judge ruling on the posed question:
  the S7.08 MARKLESS_STATE_MODULE_ESCAPE guard moves from B919 INTO this slice** (load-bearing
  for a P0 policy change; needs B912's module-scope declarations + whole-binding-alias reads).
  Board consequence: T119/B919 drops S7.08 to regression-verify-only. Slice 2 regression-runs
  B911's TEMPLATE_AS_VALUE fixtures. Unintuitive edges stay loud errors. Limit: 320 (200 tests).

### B918 (card T118, stays P1) — TWO SLICES
- **Slice 1 (guard completeness + honest interim gate)**: T900 package as written (S5.03b write
  path, S5.04 WARN, S5.06 module-scope mirror + cascade suppression, S5.07 render-read, S5.09
  repeat-duplicate + flat-record removal) + S5.05 interim gate MARKLESS_ELEMENT_HANDLE_PROP_UNSUPPORTED
  with honest wording ("not supported yet" — never "is not an element() handle"). Limit: 380 (250 tests).
- **Slice 2 (capability, ruling 1)**: prop-edge handle tracking — collect-components records
  handle-typed prop values on the component edge; el= validation resolves el={props.x} through
  the edge; payload-arena plans the locator on the child host under the parent-owned handle id;
  gate removed. Prove on the imported-child shape FIRST (same-module children are dropped until
  T117/B917); add the same-module S5.05 proof after T117. Limit: 280 (160 tests).

## P0 execution order (dependency-justified)

| # | Card | Task | Why | Insertion limit |
|---|------|------|-----|-----------------|
| 1 | T101 | B901 serializer correctness | Independent silent data corruption; unblocks B902; pipeline shakedown | 160 (120 tests) |
| 2 | T113s1 | B913 message fix | Owner: "immediately"; message-only | 30 (15 tests) |
| 3 | T106 | B906 root selection | Independent; every later fixture authored more freely once rooting is honest | 280 (170 tests) |
| 4 | T103 | B903 body execution | AFTER Fable design note; constrains B904/B902/B910/B913 | 400 (220 tests) |
| 5 | T104 | B904 undeclared locals | Converges with B903 (residual loud gate) | 200 (130 tests) |
| 6 | T102 | B902 initializer delivery | Deps satisfied by B901+B903; fixes state(obj.x) | 300 (180 tests) |
| 7 | T107 | B907 repeat record drop | Independent; placed to keep B903 chain contiguous | 320 (190 tests) |
| 8 | T105s1 | B905 gate slice | WalkState creation-site marker; phantom cells die | 260 (170 tests) |
| 9 | T110 | B910 composite lowering + sync computeds | After B903/B904 (shares machinery) | 450 (250 tests) |
| 10 | T111 | B911 template-as-value | Guard prerequisite #1 for relaxation | 200 (140 tests) |
| 11 | T112 | B912 write/alias collection | Guard prerequisite #2; unblocks B905 slice 2 | 340 (220 tests) |
| 12 | T113s2 | B913 relaxation + S7.08 guard | Only now; guards exist | 320 (200 tests) |
| — | T105s2 | B905 capability slice | Between T113s2 and T108 (needs B912) | 300 (180 tests) |
| 13 | T108 | B908 handler/behavior emit | After T113; design note post-B903 | A: 450 (250) / B: 300 (180) |
| 14 | T109 | B909 runtime parity | Last P0; design note first; distrust single green runs (B923) | 420 (240 tests) |

## Design-note sequencing (load-bearing)

- **design-B903.md comes FIRST** — Fable writes it while T101/T113s1/T106 execute (they are
  body-semantics-independent). No dispatch of T103/T104/T102/T110/T113s2 before it exists.
- **design-B908.md** written after B903 lands, immediately before T108.
- **design-B909.md** immediately before T109; must put the T900 stop_if question to the owner:
  harden the event-only tier vs gate it to full resume (vs delete).
- Design notes are PM work products — they overlap worker execution, no board slots.

## First worker packet

Rendered and saved at `notes/packets/b901-packets.json` (B901, TDD-red-first, insertion limit 160,
result contract embedded). Dispatch: `crew run docs/goals/crazy-qa-impl/notes/packets/b901-packets.json --run-id b901`.

## Risks (PM tracking)

1. Codex auth revoked — no dispatch until owner `codex login` + dry-run repeat.
2. Cross-module helper-state (spec 03:222) not fully covered by B905s2 — owner ratifies at T200.
3. B918s2 capability fixture depends on B917 for the same-module shape — imported-child first.
4. S7.08 guard move requires the T119 card edit (applied by PM alongside this note).
5. B908 pinned-assertion revisions: line-by-line Fable review is the only defense.
6. B923 nondeterminism: T109/T120 receipts need run distributions (N of M), never single runs.
7. ~4.5k added lines budgeted across P0; recalibrate at T105 if first two tasks trend >20% over.
8. Design notes are commit-worthy — force-add them like the catalog (b6b8986 precedent).
