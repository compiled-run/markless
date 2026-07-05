# T900 — Blocked Implementation Backlog (Crazy QA follow-up)

Status: **every task below is BLOCKED — awaiting explicit owner go-ahead.** Nothing here is
implemented; this note is the registration source for the PM. Derived per the T011 ruling from the
per-batch "Backlog?" columns and current-vs-ideal gaps (NOT verdict tier alone), grouped by ROOT
CAUSE per the T008/T011/T014 structural findings. Diagnostics follow the T003 shape (consequence →
why → fix → link), no sigils/markers ever. Sources: notes/catalog.md (105 entries, 8 batches),
batch receipts T004/T006/T007/T009/T010/T012/T013/T015, Judge audits T003/T005/T008/T011/T014,
state.yaml receipts.

Input inventory: 56 ERROR + 9 WARN verdicts, plus 6 ALLOW-with-current-gap items
(S1.02, S1.06, S3.02, S3.03, S3.09, S6.10) and 3 ALREADY-CORRECT-with-B8-gap items
(S1.07, S1.17, S2.12) — 74 scenario-mapped items total, each mapped to exactly one task in §2.

Priority tiers: **P0** framework-integrity / silent-wrong (incl. the spec's own examples broken);
**P1** loud-but-wrong or misleading diagnostics + capability gates; **P2** polish/warn-tier.
Sequencing rule (convergence argument): land the **fail-closed gates first** — every P0 task ships
its loud gate before (or with) its capability fix, so no silent-wrong class survives while the
deeper fix is in flight.

---

## 1. Backlog tasks

### B901 — Serializer value correctness: falsy-field drop + host/class-instance detection
- **Priority: P0** — **status: BLOCKED — awaiting explicit owner go-ahead**
- Objective: `@markless/serializer` silently drops every falsy object field except `undefined`
  (`false`/`0`/`''`/`null` vanish: `state({open:false})` serializes `fields: []`, so resumed UI
  gates like `menu.open`/`count: 0`/`error: null` are unrestorable — B8 finding 1, proven end to
  end on S4.02's fixture), and live host objects / app class instances serialize to `{}` / plain
  objects with `ok: true`, bypassing the existing `MARKLESS_SERIALIZE_UNSUPPORTED_VALUE` that
  already fires for functions (S8.02 — the spec's own named WebSocket example). Owning tier:
  serializer core (`serializeGraphValue` object branch).
- Scenarios closed: **S8.02**. Also closes B8 batch finding 1 / B4 batch finding 4 (falsy payload
  drop surfaced on S4.02/S4.09 payload lines) at the serializer tier.
- Required diagnostics: `MARKLESS_SERIALIZE_UNSUPPORTED_VALUE` (reuse — extend detector to
  host/runtime class instances, per the S8.02 block in the catalog). Falsy-field fix is a behavior
  fix, no new diagnostic.
- allowed_files: `packages/serializer/src/value.ts`, `packages/serializer/src/*` (record encoding
  as needed), `packages/serializer/test/*.ts`.
- verify: failing-first tests in `packages/serializer/test/serializer.test.ts` (or a new focused
  file): (1) `serializeGraphValue({f:false,t:true,n:0,s:'',z:null,u:undefined})` round-trips ALL
  fields; (2) `state({open:false,label:'menu'})` shape round-trips `open`; (3) a live
  WebSocket/class instance in a cell yields `MARKLESS_SERIALIZE_UNSUPPORTED_VALUE`, plain objects
  still pass. Run `pnpm exec vp test packages/serializer/test/`. Regression fixtures: S4.02 B8
  fixture shape (`crazy-qa-b8-false-field`), S8.02 snippet.
- stop_if: app-value-class restore tier (spec 05) is chosen over the diagnostic for class
  instances — that is a spec decision, get owner sign-off; any change to the payload record format
  version — owner sign-off; a consumer test pins the falsy-drop behavior — pinned-test contract
  revision needed, owner sign-off.

### B902 — Non-literal state-initializer delivery into payload plans
- **Priority: P0** — **status: BLOCKED — awaiting explicit owner go-ahead**
- Objective: every non-literal `state()` initializer (`state(obj.x)` — the dominant idiom,
  `state(a)`, `state(fetchDefaults())`, `state(new Date(...))`) plans `{"$type":"undefined"}` and
  renders empty after SSR+resume with zero diagnostics, because the initializer never executes in
  any emitted module (B8 finding 3; payload-arena plans only statically-known values). Owning
  passes: payload-arena planning + public-render module emit (initializer evaluation at initial
  render) + collect-state (initializer classification).
- Scenarios closed: **S1.02, S1.03, S1.06** (ALLOW/WARN verdicts stand; the delivery is the fix).
  Cross-refs (initializer halves only; primary owners noted in §2): S8.02 socket-construction half
  (B901), S8.11 Date-initializer half (B909), S8.03/S8.04 authored-cyclic-value delivery caveat.
- Required diagnostics: `MARKLESS_STATE_INIT_FROM_STATE` (new, WARN, per S1.03 block, with
  per-site escape hatch). Delivery itself is a behavior fix, no new diagnostic.
- allowed_files: `packages/compiler/src/passes/payload-arena.ts`,
  `packages/compiler/src/passes/public-render/*`,
  `packages/compiler/src/passes/semantic-graph/collect-state.ts`, `packages/compiler/test/*.ts`,
  `packages/vitest-browser/browser/fixtures/*.tsrx` + browser test files for SSR+resume proof.
- verify: failing-first compiler test: `state(obj.x)` payload cell carries the snapshot value (not
  `$type: undefined`); browser fixture (S1.02/S1.03 family, shape of `crazy-qa-b8-init-family`):
  `<output data-n>` renders `5` after SSR+resume; `state(a)` fires the WARN and delivers the
  snapshot. `pnpm exec vp test packages/compiler/test/` focused files + browser project run.
- stop_if: initializer evaluation requires running arbitrary component-body code server-side in a
  way that conflicts with the B903 body-statement decision — sequence after/with B903, owner
  sign-off on evaluation semantics; serializer-tier validation missing for the delivered value —
  requires B901 first.

### B903 — Component-body statement semantics (record-based render emit drops authored code)
- **Priority: P0** — **status: BLOCKED — awaiting explicit owner go-ahead**
- Objective: the public-render emitter builds modules from records only, silently DELETING every
  non-template body statement: `console.log(x)` never logs (S1.01, owner seed; browser-proven
  zero calls), a guard `if (!ok) return;` is deleted and its meaning inverted (S6.12),
  `Object.freeze(menu)` is discarded while writes proceed (S8.05). This contradicts AGENTS.md
  ("component bodies execute during initial render") and was the T005 Judge's first
  owner-escalation. Owning passes: public-render module emit (+ the semantic-graph component walk
  that ignores statements/returns). Ship the behavior fix (faithful body execution at initial
  render) or, where a statement cannot be represented (early return), a loud diagnostic — never
  deletion.
- Scenarios closed: **S1.01 (WARN + behavior fix), S6.12, S8.05**.
- Required diagnostics: `MARKLESS_STATE_RENDER_ONLY_READ` (new, WARN, escape hatch — S1.01);
  `MARKLESS_COMPONENT_EARLY_RETURN` (new, error — S6.12); `MARKLESS_STATE_FREEZE_IGNORED` (new,
  WARN, escape hatch — S8.05).
- allowed_files: `packages/compiler/src/passes/public-render/module.ts`,
  `packages/compiler/src/passes/public-render/plan.ts`,
  `packages/compiler/src/passes/semantic-graph/collect-state.ts`,
  `packages/compiler/src/passes/semantic-graph/collect-expressions.ts`,
  `packages/compiler/test/*.ts`, browser fixtures/tests for the S1.01 log proof.
- verify: failing-first: compiled S1.01 module contains the `console.log` statement and a browser
  CSR run observes exactly one log call; S6.12 compiles to `MARKLESS_COMPONENT_EARLY_RETURN`
  (not an unconditional render); S8.05 fires the freeze WARN. Rerun
  `pnpm exec vp test packages/compiler/test/compile-module.test.ts` + browser baseline.
- stop_if: **spec-vs-implementation decision needed** (§4 item 4): whether body statements execute
  verbatim at initial render is an owner architecture ruling — get sign-off before the behavior
  half; if faithful execution breaks the S7.06-control plain-local-write rejection interplay,
  sequence with B913.

### B904 — Undeclared-local render emit: declare or refuse interpolated body locals
- **Priority: P0** — **status: BLOCKED — awaiting explicit owner go-ahead**
- Objective: the render modules interpolate body locals whose declarations were dropped, shipping
  a guaranteed `ReferenceError` that kills CSR AND SSR with zero compile diagnostics — the
  confirmed 4-instance emit class (`{obj.x}` S1.07 read-only sibling; read-only clones S1.17;
  `structuredClone` S8.07; plus the S3.12 `handlers`, S4.05 `header`, S5.07 `h` instances owned
  primarily by B921/B911/B918). Owning pass: public-render module emit — it must either emit
  body-local declarations it can prove or emit a loud diagnostic for template reads of dropped
  locals; converges with B903 (if body statements execute, the declarations exist).
- Scenarios closed: **S1.07 (AC-with-gap), S1.17 (AC-with-gap), S8.07**.
- Required diagnostics: `MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT` (reuse — template-read-of-
  dropped-local variant per S8.07 block), until/unless B903 makes the locals real.
- allowed_files: `packages/compiler/src/passes/public-render/module.ts`,
  `packages/compiler/src/passes/public-render/plan.ts`,
  `packages/compiler/src/passes/public-render/diagnostics.ts`, `packages/compiler/test/*.ts`.
- verify: failing-first: S8.07 read-only snippet either renders the snapshot or fails compile with
  the reused diagnostic — never emits an undeclared identifier; executed-SSR harness (data-URL
  import pattern from `compile-module.test.ts:394`) proves no ReferenceError. Regression fixtures:
  S1.07/S1.17/S8.07 snippets (`crazy-qa-b8-snapshot-reads` shape).
- stop_if: overlaps B903's body-execution ruling — if the owner approves faithful body execution,
  re-scope this task to the residual gate; do not implement both halves divergently.

### B905 — state()/computed() creation-site context (unified placement codes)
- **Priority: P0** — **status: BLOCKED — awaiting explicit owner go-ahead**
- Objective: collect-state's declaration walk has no site context, so `state()`/`computed()`
  created inside a computed derive (S2.06), an event handler (S3.07), a plain helper the component
  calls (S7.05), or an `if`/`for` body (S7.06) is silently hoisted to one permanent top-level cell
  with a REAL payload cell — the walk-site-context family confirmed at 4 sites (T011). Implement
  ONE walk-site marker. **Per the T011 unified-code ruling**: one permanent
  `MARKLESS_STATE_CREATION_SITE_UNSTABLE` code with site-specific messages (computed / handler /
  branch / loop), plus a SEPARATE removable capability gate
  `MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED` for S7.05, because spec 03:222 sanctions helper
  creation (spec-vs-implementation conflict, §4 item 1) — the gate is removed when call-tree
  return-value alias tracking ships.
- Scenarios closed: **S2.06, S3.07, S7.05, S7.06**.
- Required diagnostics: `MARKLESS_STATE_CREATION_SITE_UNSTABLE` (new, error; site-variant messages
  carrying the recorded content of the per-site blocks MARKLESS_STATE_CREATION_IN_COMPUTED /
  _IN_HANDLER / the S7.06 branch+loop messages); `MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED` (new,
  error, removable capability gate — S7.05 block).
- allowed_files: `packages/compiler/src/passes/semantic-graph/collect-state.ts`,
  `packages/compiler/src/passes/semantic-graph/*` (walk-context plumbing),
  `packages/compiler/test/*.ts`.
- verify: failing-first tests per site (derive / handler / helper / if / for): diagnostic fires,
  NO phantom binding, NO payload cell; alternate-shaped fixtures per the hardcoding guardrail.
  Rerun `pnpm exec vp test packages/compiler/test/semantic-diagnostics.test.ts` +
  `state-lowering.test.ts`.
- stop_if: owner rules for spec 03:222 call-tree aliasing instead of the S7.05 gate — re-scope to
  alias tracking (bigger slice, needs re-approval); the S7.03 `prop:value` pollution fix (B915)
  conflicts in collect-components — coordinate, single writer.

### B906 — Root selection + component detection (components[0] silent rooting)
- **Priority: P0** — **status: BLOCKED — awaiting explicit owner go-ahead**
- Objective: `emitPublicRenderModule` roots at `components[0]` and `getComponentFunction` counts
  EVERY top-level FunctionDeclaration as a component, so one helper above `App` empties ALL module
  sources silently (S4.10), a non-exported first component becomes the app root while the exported
  App is discarded (S4.07/S4.08), root-position dynamic tags emit `""` (S4.03), and plan vs module
  emit can root at DIFFERENT components — a verbatim spec 10:38-41 violation (T014
  source-confirmed). Fix pair: (a) apply the JSXCodeBlock body filter to FunctionDeclarations so
  helpers stop being components; (b) one export-preferring root-selection rule shared by plan and
  module emit that DIAGNOSES ambiguity instead of choosing. Plus the component-call-in-template
  detector.
- Scenarios closed: **S4.03, S4.07, S4.08, S4.10**.
- Required diagnostics: `MARKLESS_PUBLIC_RENDER_ROOT_UNSUPPORTED` (reuse — fire instead of silent
  empty emit; S4.03/S4.10 blocks); `MARKLESS_COMPONENT_CALL_IN_TEMPLATE` (new — S4.07/S4.08
  blocks). External-boundary wrap of the S4.03(c) SyntaxError belongs to B922.
- allowed_files: `packages/compiler/src/ast/tsrx.ts`,
  `packages/compiler/src/passes/public-render/module.ts`,
  `packages/compiler/src/passes/public-render/plan.ts`,
  `packages/compiler/src/passes/public-render/diagnostics.ts`,
  `packages/compiler/src/passes/semantic-graph/collect-components.ts` (and collect-elements for
  string-const `<Tag>` resolution), `packages/compiler/test/*.ts`.
- verify: failing-first: helper-above-App compiles the exported App (S4.10); `{Card({...})}` fires
  COMPONENT_CALL_IN_TEMPLATE (S4.07/S4.08); root dynamic tag fires ROOT_UNSUPPORTED, never `""`
  with empty diagnostics (S4.03); plan and module emit assert the SAME root. Rerun
  `pnpm exec vp test packages/compiler/test/compile-module.test.ts packages/compiler/test/public-render-plan.test.ts`.
- stop_if: existing tests pin `components[0]` rooting — pinned-test contract revision needed, get
  owner sign-off; the `<Tag>` string-const-as-dynamic-tag support grows beyond a diagnostic —
  capability scope needs re-approval.

### B907 — collect-repeat silent record drop + key diagnostics + positional keying
- **Priority: P0** — **status: BLOCKED — awaiting explicit owner go-ahead**
- Objective: `collectKeyedRepeat` returns `null` — no record, no diagnostic — for any missing key
  or key not rooted at the item alias, so whole lists silently render EMPTY: key-less `@for`
  (S6.04, where spec 01 mandates a diagnostic), `key Math.random()` (S6.01), and the spec-blessed
  positional form `index i; key i` (S6.02, first-contact moment). Collectors must return
  diagnostic-carrying records instead of null (T008 source-confirmed: collect-repeat.ts:17/:22/:82
  null paths); positional keying must actually render.
- Scenarios closed: **S6.01, S6.02, S6.04**.
- Required diagnostics: `MARKLESS_REPEAT_KEY_UNSTABLE` (new, error — S6.01);
  `MARKLESS_REPEAT_KEY_IS_INDEX` (new, WARN with escape hatch, never fires as error on the
  sanctioned form — S6.02); `MARKLESS_REPEAT_KEY_REQUIRED` (new, error, span on the `@for` header
  per spec 01 — S6.04). Positional-keying render support is a behavior fix.
- allowed_files: `packages/compiler/src/passes/semantic-graph/collect-repeat.ts`,
  `packages/compiler/src/passes/public-render/keyed-repeats.ts`,
  `packages/compiler/src/passes/public-render/plan.ts`, `packages/compiler/test/*.ts`, browser
  fixture/test for the `key i` reorder semantics (unblocks the S6.02 B8-blocked claim).
- verify: failing-first: each of the three key shapes produces its diagnostic (or, for `key i`, a
  rendered list + WARN) and NEVER an empty `<ul>` with empty diagnostics; browser: `key i` renders
  and slot-identity holds across a reorder. Rerun semantic-graph + public-render-plan tests.
- stop_if: static-output unkeyed positional rendering (the spec's other half of S6.04) expands
  scope — record it, ship the diagnostic first; reordering semantics for `key i` need runtime work
  beyond the compiler — coordinate with B916.

### B908 — Symbol-module emit integrity (writes-only handler synthesis, behavior factories)
- **Priority: P0** — **status: BLOCKED — awaiting explicit owner go-ahead**
- Objective: `emitEventHandlerModule` synthesizes handler modules from lowered WRITE RECORDS only:
  imported handlers ship `void context;` no-ops (S3.04), async form handlers never call `save()`
  and run post-await writes immediately (S3.08), `setTimeout`-deferred writes execute NOW —
  temporal semantics rewritten, browser-measured (S8.08), authored `h?.focus()` — the spec's own
  SearchBox idiom — is deleted while plain `h.focus()` works (S5.10; root: regex-over-source-text
  handle-call collection, symbol-resolver.ts:374, a fragile mechanism class the T014 Judge
  escalated), event-object escapes are silently inert (S3.11), and local behavior factories plan a
  symbol NO module is emitted for, failing at first interaction with a plain
  `Unknown async symbol` error (S5.08 — the spec's own §Element behaviors example). Real fix: emit
  authored bodies (imports + calls + awaits + control flow) or gate LOUDLY; replace regex handle
  collection with AST-based collection.
- Scenarios closed: **S3.04, S3.08, S3.11 (WARN), S5.08, S5.10, S8.08**.
- Required diagnostics: `MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED` (new, error — the honest gate
  for every handler body the emitter cannot represent; message variants per S3.04/S3.08/S8.08
  blocks); `MARKLESS_BEHAVIOR_SYMBOL_EMIT_UNSUPPORTED` (new, error — S5.08 block; or local-factory
  emission); `MARKLESS_EVENT_TARGET_ESCAPE` (new, WARN with escape hatch, `currentTarget`/`target`
  only — S3.11 block); authored-`?.` emit and temporal ordering are behavior fixes.
- allowed_files: `packages/compiler/src/passes/symbol-modules.ts`,
  `packages/compiler/src/passes/symbol-resolver.ts`, `packages/compiler/src/passes/capture-analysis*`,
  `packages/compiler/src/passes/semantic-graph/collect-elements.ts` (S3.11 detector),
  `packages/compiler/test/symbol-modules.test.ts` (pinned revision), `packages/compiler/test/*.ts`,
  browser fixtures/tests for handler-body proof.
- verify: failing-first: imported handler emits import+call (or gate); async handler either runs
  `save()` before the write or gates; `setTimeout` write stays scheduled or gates; authored
  `h?.focus()` emits; S5.08 local factory emits a behavior module or gates; S3.11 fires the WARN.
  Browser: SearchBox-idiom focus works end to end. Rerun
  `pnpm exec vp test packages/compiler/test/symbol-modules.test.ts packages/compiler/test/imported-helper-event-symbols.test.ts`.
- stop_if: **pinned-test contract revision needed — get owner sign-off**: the writes-only emit is
  the ASSERTED contract (symbol-modules.test.ts:1585 pins unconditional guard-deleted writes;
  :1638-1694 pins `void context;`) — do not silently rewrite pinned expectations; behavior-body
  plain-write exemption depends on the B913 ruling — sequence accordingly.

### B909 — Event-only/full runtime parity + resume guards
- **Priority: P0** — **status: BLOCKED — awaiting explicit owner go-ahead**
- Objective: the event-only resume path is a parallel, weaker runtime (B8 finding 2): decode
  validates only `version`, so a tampered payload renders silent NaN UI instead of
  `MARKLESS_PAYLOAD_INVALID` (S8.09); locator mismatch throws a plain
  `Error: Mismatched resume locator h0.` instead of the structured
  `MARKLESS_RESUME_LOCATOR_MISMATCH` (S8.10); its graph has no `call`, so Date/collection method
  writes throw `TypeError: context.graph.call is not a function` at first interaction (S8.11);
  graph-guarded sync policies evaluate against the STATIC served payload forever (S3.02 B8
  resolution, closed here as the runtime half); and a second `resumeFromPayloadDocument` silently
  installs a second runtime that double-dispatches every event (S8.12). Also: the inline resumer's
  miniature decoder needs a cycle memo before B902 delivers authored cyclic values (S8.04 caveat).
- Scenarios closed: **S8.09, S8.10, S8.11, S8.12**. Runtime halves closed for: S3.02-B8 stale sync
  policy, S3.09-B8 (shared flag), S8.04 cycle-memo caveat. (S8.11's Date-initializer half rides
  B902.)
- Required diagnostics: `MARKLESS_PAYLOAD_INVALID` (reuse — wire event-only decode through
  `decodePayloadScripts`); `MARKLESS_RESUME_LOCATOR_MISMATCH` (reuse — share structured error
  constructors); `MARKLESS_RESUME_ALREADY_RESUMED` (new — S8.12 block). `graph.call` support or
  bundler `needsFullResume` gating for call-operation pages is a behavior fix.
- allowed_files: `packages/web/src/event-only-resume.ts`, `packages/web/src/payload.ts`,
  `packages/web/src/render-to-string.ts` (cycle memo, live-policy re-evaluation),
  `packages/web/src/resume.ts` (shared error constructors), `packages/bundler/src/transform.ts` +
  `packages/bundler/src/source-module.ts` (needsFullResume / `__asyncResumeRuntimeStarted`),
  `packages/web/test/*.ts`, browser fixtures/tests.
- verify: failing-first: tampered-structure payload fails closed with MARKLESS_PAYLOAD_INVALID on
  the event-only path; locator mismatch is structured on both tiers; Date `setMonth` after resume
  works or the page is gated to full resume; second resume call throws ALREADY_RESUMED; sync
  policy re-evaluates against the live graph after a resumed write (checkbox unlocks). Rerun
  `pnpm exec vp test packages/web/test/payload-scripts.test.ts packages/web/test/resume.test.ts` +
  browser probes per the S8.09/S8.11/S8.12 fixture shapes.
- stop_if: owner prefers deleting the event-only tier in favor of always-full-resume — that is an
  architecture decision, stop and report; the CSR sync-policy dispatch nondeterminism (B923)
  makes verification flaky — record and coordinate with B923 before trusting green runs.

### B910 — Composite template-expression lowering + sync-computed emission
- **Priority: P0** — **status: BLOCKED — awaiting explicit owner go-ahead**
- Objective: template holes are reactive ONLY for plain identifier/path reads; ternaries, IIFEs,
  and object styles are emitted verbatim and never lowered (render-once, zero diagnostics — B4
  finding 2), and sync computeds are dropped from EVERY emitted artifact (payload-arena.ts:25-26
  async-only filter): the spec's own hello-world `computed(() => count * 2)` compiles to a CSR
  module with an undeclared identifier and an EMPTY SSR module (S2.11, T008 source-confirmed).
  Fix: a sync-derive symbol kind + payload records + render-module declaration (S2.11), composite
  template-expression dependency lowering (S4.04, shares machinery), object-style lowering or a
  loud gate (S4.11 — class half already correct). Until each lands, gate loudly.
- Scenarios closed: **S2.11, S4.04, S4.11**. (Nested dynamic-tag render-once reactivity from
  S4.03's control is the same mechanism; S4.03 itself maps to B906.)
- Required diagnostics: `MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT` (reuse — sync-computed-
  backed template reads, S2.11 block); `MARKLESS_TEMPLATE_EXPRESSION_STATIC` (new, error, interim
  gate — S4.04 block); `MARKLESS_STYLE_OBJECT_UNSUPPORTED` (new, error, gate — S4.11 block; ideal
  is lowering the fully-static property map).
- allowed_files: `packages/compiler/src/passes/payload-arena.ts`,
  `packages/compiler/src/passes/symbol-resolver.ts` / symbol planning,
  `packages/compiler/src/passes/public-render/*`,
  `packages/compiler/src/passes/state-lowering*`,
  `packages/compiler/src/passes/semantic-graph/collect-expressions.ts`,
  `packages/compiler/test/*.ts`, browser fixture/test for a sync computed rendering + updating.
- verify: failing-first: hello-world sync computed renders `4` and updates on `count++` in a real
  browser (first-ever sync-computed browser fixture); `{a ? 'x' : 'y'}` either updates or gates;
  `style={{color:c}}` never ships `[object Object]`. Rerun compile-module + public-render-plan
  tests. Note: S4.04's suggestion depends on S2.11 — land the computed emission first or together
  (recorded sequencing dependency in both catalog blocks).
- stop_if: composite lowering explodes scope (arbitrary expressions) — ship the gates, record the
  lowering as follow-up; `MARKLESS_DYNAMIC_TAG_INVALID` runtime-throw semantics need changing —
  owner sign-off.

### B911 — Template-as-value rejection (no-VDOM boundary)
- **Priority: P0** — **status: BLOCKED — awaiting explicit owner go-ahead**
- Objective: templates stored as values compile silently into meaninglessness: `state(<p>hi</p>)`
  plans an `undefined` cell rendered as text and `computed(() => <p>{n}</p>)` bakes raw TSRX into
  a derive source (S2.13); `const header = <h1>…</h1>` ships a phantom locator + undeclared-local
  ReferenceError (S4.05); `rows.push(<li>…</li>)` dies behind a misdirected UNRESOLVED_WRITE
  (S4.06). One declarator/argument template detector, one code, all sites (T003 rubric names this
  ERROR class verbatim). TSRX-language note: the live spec confirms templates ARE assignable
  expression values at the language level — the rejection is a Markless host-profile rule and must
  therefore come from the compiler, loudly, never the parser.
- Scenarios closed: **S2.13, S4.05, S4.06**.
- Required diagnostics: `MARKLESS_TEMPLATE_AS_VALUE` (new, error — one code, site-variant messages
  per the three blocks: state/computed argument, plain local declarator, call argument).
- allowed_files: `packages/compiler/src/passes/semantic-graph/collect-state.ts`,
  `packages/compiler/src/passes/semantic-graph/collect-expressions.ts`,
  `packages/compiler/src/passes/semantic-graph/collect-elements.ts` (host/locator walk must not
  collect declarator-initializer templates), `packages/compiler/test/*.ts`.
- verify: failing-first per site: diagnostic fires; no phantom host node/locator survives; the
  emitted modules no longer interpolate the dead local. Rerun semantic-graph + compile-module
  tests.
- stop_if: **sequencing**: S4.06's only current diagnostic is the plain-local-write over-rejection
  — this task must land BEFORE or WITH any B913 relaxation (recorded in the S4.06 block); owner
  wants template-fragment values as a future capability — stop, that reopens the no-VDOM core
  constraint.

### B912 — Write/alias collection integrity (site-context for writes, optional deletes, whole-binding aliases)
- **Priority: P0** — **status: BLOCKED — awaiting explicit owner go-ahead**
- Objective: the expression collector records writes with no site context and misses whole shapes:
  `{count++}` compiles clean then vanishes from the render plan (S1.09); `@if (open = true)` is
  triple-silent-wrong including an emit precedence bug that assigns arm HTML to a local (S6.07);
  a computed derive that writes its own dependency records a self-waking loop silently (S2.05);
  `delete menu?.a` is never collected so the SHIPPED optional-chain diagnostic is unreachable for
  real source (S1.13); `let b = a` silently severs the graph while the adjacent swap errors loudly
  (S1.18). Owning passes: collect-expressions (write-site context + optional-member collection),
  collect-aliases (whole-binding aliases), public-render emit (parenthesize branch tests).
- Scenarios closed: **S1.09, S1.13, S1.18, S2.05, S6.07**.
- Required diagnostics: `MARKLESS_STATE_WRITE_IN_TEMPLATE` (new, error — S1.09; reused for branch
  tests per S6.07); `MARKLESS_STATE_WRITE_IN_COMPUTED` (new, error — S2.05);
  `MARKLESS_STATE_OPTIONAL_CHAIN_WRITE` (reuse — make reachable from real source, S1.13);
  `MARKLESS_STATE_BINDING_ALIAS_UNSUPPORTED` (new, error — S1.18; or whole-binding alias support
  chosen via fixture). Branch-test parenthesization is a behavior fix.
- allowed_files: `packages/compiler/src/passes/semantic-graph/collect-expressions.ts`,
  `packages/compiler/src/passes/semantic-graph/collect-aliases.ts`,
  `packages/compiler/src/passes/semantic-graph/collect-branches.ts` (test-expression walk),
  `packages/compiler/src/passes/state-lowering*`, `packages/compiler/src/passes/public-render/module.ts`
  (test parenthesization), `packages/compiler/test/*.ts`.
- verify: failing-first per scenario: each silent shape now errors; real-source optional delete
  reaches OPTIONAL_CHAIN_WRITE (replacing synthetic-artifact-only coverage — the T005
  false-confidence escalation); emitted branch tests are parenthesized for any non-atomic
  expression. Rerun state-lowering + semantic-expression-collector + semantic-alias-collector
  tests.
- stop_if: whole-binding alias SUPPORT (vs diagnostic) is chosen — bigger slice, owner sign-off;
  branch-test walking collides with B903's body-statement work — coordinate, single writer.

### B913 — Plain-local-write rejection policy (owner decision + guarded relaxation)
- **Priority: P0 (sequencing-critical policy)** — **status: BLOCKED — awaiting explicit owner go-ahead**
- Objective: EVERY write to a plain (non-graph) local in a component body is a compile error today
  (`let total = 0; total += i;` → MARKLESS_STATE_UNRESOLVED_WRITE whose own suggestion recommends
  "normal local code" — the exact thing that errors; B7 finding 2, T011 source-confirmed at
  state-lowering.ts:125). This over-rejection masks placement findings (S7.06), indicts the spec's
  own behavior-factory example (S5.08 defect 1), misdirects S4.06, and is the ONLY thing keeping
  S7.08's registry leak loud. Owner must rule: allow plain-local mutation (then B911's
  template-as-value and B919's MODULE_ESCAPE guards MUST land first), or keep the rejection and
  fix the contradictory suggestion text. Implement the ruling.
- Scenarios closed: none exclusively (policy/root-cause task; the scenario carriers S7.06, S5.08,
  S4.06, S7.08 map to B905/B908/B911/B919). Closes the S7.06-control structural finding.
- Required diagnostics: behavior/policy fix; at minimum rewrite the MARKLESS_STATE_UNRESOLVED_WRITE
  suggestion so it stops recommending the thing that errors.
- allowed_files: `packages/compiler/src/passes/state-lowering*`, `packages/compiler/test/*.ts`.
- verify: the S7.06 control (`let total = 0; for (…) { total += i; }`) either compiles clean (if
  relaxed) or errors with an honest, non-self-contradictory message; B919's MODULE_ESCAPE and
  B911's TEMPLATE_AS_VALUE tests stay green under whichever ruling.
- stop_if: **owner ruling missing — this task cannot start without it**; relaxation attempted
  before B911 + B919 land — stop (silent-leak regression).

### B914 — Sync-policy extraction + event-prop shape completeness
- **Priority: P1** — **status: BLOCKED — awaiting explicit owner go-ahead**
- Objective: the extractor only scans IfStatements, so the web's most common form handler —
  unconditional `onSubmit={(e) => e.preventDefault()}` — errors with a factually wrong message
  blaming a nonexistent guard (S3.02); constant-vs-literal guards (`MODE === 'strict'`) fail the
  same way despite both sides being compile-time known (S3.09); detached
  `const pd = e.preventDefault; pd()` is invisible and ships the exact silence the spec forbids
  (S3.05); local named handler aliases (`onSubmit={handle}`) lose their policy to a misleading
  capture error (S3.03); and `onClick={count++}` — a non-function — silently compiles as if the
  author wrote the arrow (S3.06, the sigil-free model's line not to cross). Owning passes:
  collect-sync-policy + collect-elements event branch (one alias resolver serves symbol planning,
  policy extraction, write scoping).
- Scenarios closed: **S3.02 (ALLOW-with-gap), S3.03 (ALLOW-with-gap), S3.05, S3.06, S3.09
  (ALLOW-with-gap)**.
- Required diagnostics: `MARKLESS_SYNC_POLICY_UNEXTRACTABLE` (reuse — detached-reference candidate
  detection routes through it, S3.05; plus a no-guard message variant until unconditional
  extraction lands); `MARKLESS_EVENT_HANDLER_NOT_A_FUNCTION` (new, error — S3.06). Unconditional
  `constant-truthy` extraction, constant-equality folding, and alias resolution are behavior
  fixes (ideal tier per the T011 retier ruling: S3.02/S3.03/S3.09 stay ALLOW).
- allowed_files: `packages/compiler/src/passes/semantic-graph/collect-sync-policy.ts`,
  `packages/compiler/src/passes/semantic-graph/collect-elements.ts`,
  `packages/compiler/test/sync-policy.test.ts`, `packages/compiler/test/*.ts`.
- verify: failing-first: bare onSubmit preventDefault extracts `{type:'constant-truthy'}` with the
  write staying lazy; `MODE === 'strict'` folds; detached reference errors; `onClick={count++}`
  errors; alias handler extracts policy + scopes writes like the inline form. Rerun
  `pnpm exec vp test packages/compiler/test/sync-policy.test.ts packages/compiler/test/semantic-diagnostics.test.ts`
  + the S3.02 browser sync-policy fixture shape as regression.
- stop_if: alias resolution requires the capture-analysis contract to change — coordinate with
  B908; runtime sync-policy staleness resurfaces — that half is B909's.

### B915 — Framework-API misuse detectors in the semantic graph
- **Priority: P1** — **status: BLOCKED — awaiting explicit owner go-ahead**
- Objective: framework-API values/creations that can never work are invisible at the site that
  caused them: `state(state(5))` / `computed(() => computed(...))` compile silently to
  undefined/unexecutable artifacts (S1.04, S2.07 — one declarator-argument detector serves both);
  a self-referential computed records a dependency-less derive (S2.09); `const makeState = state`
  severs API recognition silently (S7.10); a user-defined local function named `state` gets the
  wrong "add the import" message plus `prop:value` artifact pollution from a non-component helper
  (S7.03). Owning passes: collect-state (+ collect-module-scope message variant, collect-components
  pollution fix).
- Scenarios closed: **S1.04, S2.07, S2.09, S7.03, S7.10**.
- Required diagnostics: `MARKLESS_STATE_NESTED_CREATION` (new — S1.04/S2.07, one code);
  `MARKLESS_COMPUTED_DEPENDENCY_CYCLE` (new — S2.09, self-cycle + post-collection edge walk);
  `MARKLESS_FRAMEWORK_API_ALIAS_UNSUPPORTED` (new — S7.10);
  `MARKLESS_FRAMEWORK_IMPORT_REQUIRED` (reuse — shadow-aware message variant, S7.03). The
  `prop:value` pollution is a behavior fix in collect-components.
- allowed_files: `packages/compiler/src/passes/semantic-graph/collect-state.ts`,
  `packages/compiler/src/passes/semantic-graph/collect-module-scope.ts`,
  `packages/compiler/src/passes/semantic-graph/collect-components.ts`,
  `packages/compiler/test/*.ts`.
- verify: failing-first per scenario; shadowing-local variant asserts the rename-first suggestion
  and NO import-asking wording; plain helper params no longer become prop bindings. Rerun
  `pnpm exec vp test packages/compiler/test/semantic-diagnostics.test.ts`.
- stop_if: collect-components changes collide with B906's component-detection filter — coordinate,
  single writer.

### B916 — Keyed-repeat identity: per-row graph scopes + runtime row integrity
- **Priority: P1** — **status: BLOCKED — awaiting explicit owner go-ahead**
- Objective: the spec-promised per-item loop scope does not exist and is actively mis-modeled:
  `state()` in a keyed row becomes ONE shared cell for all rows (S6.13), a per-row `computed()`
  additionally loses its inputs because repeat item aliases are invisible to dependency collection
  (S2.08 — while event writes already resolve the same alias via `context.locals`, so only
  collection is missing); at runtime, duplicate key values silently drop rows last-wins with a
  served-vs-mounted divergence (S6.03), and a collection that STARTS `undefined` is permanently
  dead after data arrives on both CSR and SSR+resume paths (S6.05). Ship honest gates now;
  per-item scopes are the capability end-state.
- Scenarios closed: **S2.08, S6.03, S6.05, S6.13**.
- Required diagnostics: `MARKLESS_STATE_REPEAT_ROW_SCOPE_UNSUPPORTED` (new, error — one code owns
  per-row state() AND computed(), S6.13/S2.08 blocks); `MARKLESS_REPEAT_KEY_DUPLICATE` (new,
  runtime error at row materialization, both CSR and SSR renderers — S6.03);
  `MARKLESS_REPEAT_COLLECTION_UNINITIALIZED` (new, WARN with escape hatch — S6.05). The
  dead-after-undefined-start repeat wiring is a behavior fix in packages/web.
- allowed_files: `packages/compiler/src/passes/semantic-graph/collect-state.ts`,
  `packages/compiler/src/passes/semantic-graph/collect-repeat.ts`,
  `packages/compiler/src/passes/semantic-graph/collect-async.ts` (repeat-alias dependency
  resolution), `packages/compiler/src/passes/payload-arena.ts`, `packages/web/src/*` (repeat row
  materialization + SSR repeat renderer), `packages/compiler/test/*.ts`, `packages/web/test/*.ts`,
  browser fixtures/tests (dup-keys + undef-rows shapes).
- verify: failing-first: per-row creation gates (no shared cell, no flat payload cell); duplicate
  keys raise the runtime error naming key path + colliding value in a real browser instead of
  dropping rows; `state(undefined)` list revives on `rows = [...]` after resume + the WARN fires
  on the statically-visible initializer. Regression fixtures: S6.03/S6.05 browser shapes.
- stop_if: full per-item scope model (spec 01) attempted in this slice — capability scope needs
  its own approval; interim suggestion text depends on dynamic-path support (S6.13 note) — keep
  suggestions to what actually compiles.

### B917 — Public-render gate loudness parity + same-module composition
- **Priority: P1** — **status: BLOCKED — awaiting explicit owner go-ahead**
- Objective: unsupported REPEAT gates fail loud while unsupported BRANCH gates are silent — a
  component inside `@if` renders its initial arm and freezes forever with zero diagnostics
  (S6.15, the T008 inconsistent-loudness escalation); same-module child components are silently
  dropped from emit while imported children compose (S6.10 sibling finding,
  component-factories.ts resolves imports only); and reason-specific suggestions are wrong for
  component rows — `<Tree node={c} />` authors are told to delete their component (S6.14). One
  diagnostic emission path must own both gate families; suggestions must name the real boundary.
- Scenarios closed: **S6.10 (ALLOW-with-sibling-gap), S6.14, S6.15**.
- Required diagnostics: `MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT` (reuse — must also fire for
  branch gates, S6.15 block; component-row suggestion variant, S6.14 block; same-module child
  drop, S6.10 block). Same-module composition support is the capability end-state.
- allowed_files: `packages/compiler/src/passes/public-render/plan.ts`,
  `packages/compiler/src/passes/public-render/diagnostics.ts`,
  `packages/compiler/src/passes/public-render/keyed-repeats.ts`,
  `packages/compiler/src/passes/public-render/component-factories.ts`,
  `packages/compiler/test/*.ts`.
- verify: failing-first: every `supported: false` branch gate emits a diagnostic (assert over ALL
  gate reasons, not a blacklist); same-module `<Child />` either composes or errors — never
  vanishes; component-row rejection names the component boundary. Rerun public-render-plan +
  compile-module tests. Unblocks the S6.14/S6.15 B8-blocked runtime claims (fresh-instance
  identity fixture once arms update).
- stop_if: component arms/rows capability work exceeds the gate slice — ship loudness parity
  first, record capability follow-up.

### B918 — Element-handle guard completeness
- **Priority: P1** — **status: BLOCKED — awaiting explicit owner go-ahead**
- Objective: the handle model's guards cover only the narrow shapes: handle-into-state is guarded
  at the initializer but the write path commits `undefined` silently (S5.03b); an unbound-but-read
  handle is a permanent no-op with no warning (S5.04); prop-forwarded handles — spec-sanctioned
  (04:39-41) — are rejected with "is an unknown value, not an element() handle" gaslighting
  (S5.05, spec-vs-implementation conflict §4 item 2); module-scope `element()` escapes the
  module-scope collector and produces the same wrong message twice (S5.06); render-time handle
  reads wire a phantom dom-update AND ship an undeclared local (S5.07); one handle inside a keyed
  `@for` is rejected blaming the row shape while a flat locator record still ships (S5.09). Root:
  the el= validator resolves only same-component local names (B5 finding 2).
- Scenarios closed: **S5.03, S5.04 (WARN), S5.05, S5.06, S5.07, S5.09**. (S5.10 maps to B908; its
  body-escape diagnostic variant is shared with S5.07's code here.)
- Required diagnostics: `MARKLESS_STATE_ELEMENT_HANDLE_UNSERIALIZABLE` (reuse — write-path variant
  via valueSource kind check, S5.03); `MARKLESS_ELEMENT_HANDLE_UNBOUND` (new, WARN, fires only on
  read/escape — S5.04); `MARKLESS_ELEMENT_HANDLE_PROP_UNSUPPORTED` (new, error, removable
  capability gate until prop-edge handle tracking ships — S5.05);
  `MARKLESS_ELEMENT_MODULE_SCOPE` (new, error, mirror of STATE_MODULE_SCOPE + cascade suppression
  — S5.06); `MARKLESS_ELEMENT_HANDLE_RENDER_READ` (new, error, template-read + body-escape
  variants — S5.07/S5.10 blocks); `MARKLESS_ELEMENT_HANDLE_DUPLICATE` (reuse — repeat variant at
  semantic-graph + remove the flat handle record for repeated hosts — S5.09).
- allowed_files: `packages/compiler/src/passes/semantic-graph/collect-elements.ts`,
  `packages/compiler/src/passes/semantic-graph/collect-module-scope.ts`,
  `packages/compiler/src/passes/state-lowering*` (valueSource kind check),
  `packages/compiler/src/passes/payload-arena.ts` (flat handle record),
  `packages/compiler/test/*.ts`.
- verify: failing-first per scenario; S5.06/S5.05 messages never claim a real handle "is not an
  element() handle"; repeat-host handles produce the DUPLICATE teaching, not `unsupported-row-
  binding`. Rerun `pnpm exec vp test packages/compiler/test/semantic-diagnostics.test.ts`.
- stop_if: owner rules for spec 04:39-41 prop-handle tracking instead of the S5.05 gate — bigger
  slice, re-approval; illegal-behavior-input capture probe (S5.08 note) surfaces new findings —
  record, don't expand.

### B919 — Module-scope and cross-module state guards
- **Priority: P1** — **status: BLOCKED — awaiting explicit owner go-ahead**
- Objective: cross-request/cross-module escapes are silent or accidentally loud: a read-only
  import of another module's (always-failing) `state()` export compiles clean as a dead snapshot
  (S7.07 — B8: the vite pipeline surfaces it only as a generic missing-export SyntaxError);
  a module-scope registry holding a graph ref errors only because of the B913 over-rejection and
  becomes a fully silent cross-request leak the moment that is relaxed (S7.08); an unknown
  `shared()` scope string (`'session'`) is silently dropped, changing lifetime semantics without
  a trace (S7.11).
- Scenarios closed: **S7.07, S7.08, S7.11**.
- Required diagnostics: `MARKLESS_STATE_CROSS_MODULE_IMPORT` (new, error — S7.07);
  `MARKLESS_STATE_MODULE_ESCAPE` (new, error — S7.08; MUST exist before B913 relaxation);
  `MARKLESS_SHARED_SCOPE_INVALID` (new, error — S7.11, also for non-literal scope expressions).
- allowed_files: `packages/compiler/src/passes/semantic-graph/collect-expressions.ts`,
  `packages/compiler/src/passes/semantic-graph/collect-shared.ts`,
  `packages/compiler/src/passes/state-lowering*`, `packages/compiler/test/*.ts`.
- verify: failing-first per scenario; cross-module detector does NOT flag legitimate imported
  constants/helpers or imported shared() definitions (negative tests required); S7.08 stays loud
  under both B913 outcomes. Rerun semantic-diagnostics + semantic-module-scope-collector tests.
  Bundler-level presentation of module-A diagnostics (dev overlay) recorded as a follow-up probe,
  not in this slice.
- stop_if: cross-module detection needs a multi-module compile harness — none exists (T010);
  stop and report rather than building one inside this task without approval.

### B920 — Async-boundary read collection: try/catch silently kills the boundary
- **Priority: P1** — **status: BLOCKED — awaiting explicit owner go-ahead**
- Objective: one statement of ordinary defensive error handling — a `try`/`catch` INSIDE an async
  derive — silently empties the payload boundary's `asyncReads` (no runner link, no
  updateSymbolId) while the runner module itself emits fine, so the page shows `@pending` forever
  on SSR and CSR with zero diagnostics (S2.12 B8 resolution; the boundary-requirement diagnostics
  the entry's ALREADY-CORRECT verdict covers are untouched). Async-read collection must not lose
  reads whose derive contains try/catch — or must fail loud.
- Scenarios closed: **S2.12 (AC-with-B8-gap)**.
- Required diagnostics: behavior fix preferred (collect the reads); if gated, reuse
  `MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT` naming the try/catch limitation — never permanent
  pending.
- allowed_files: `packages/compiler/src/passes/semantic-graph/collect-async.ts`,
  `packages/compiler/src/passes/payload-arena.ts`, `packages/compiler/test/*.ts`, browser
  fixture/test for the pending→resolved round trip with an internal catch.
- verify: failing-first: derive-with-try/catch plans `asyncReads` + `updateSymbolId` identical to
  the catch-less control; browser: boundary resolves to `@try` content (value-vs-error routing —
  the originally deferred claim). Rerun semantic-diagnostics async tests.
- stop_if: browser verification hits the B923 async-settle instability — coordinate; do not trust
  a single green run for the settle claim.

### B921 — Attribute and spread value discipline
- **Priority: P1** — **status: BLOCKED — awaiting explicit owner go-ahead**
- Objective: the attribute plane accepts and ships garbage silently: spread handler bags produce a
  threefold silent death including an undeclared-identifier crash in both render modules (S3.12);
  state-object spreads render once with no update records (S4.02); object-valued attributes ship
  `[object Object]` — with a live dom-update symbol that can only ever rewrite the same garbage
  (S4.09); duplicate attributes ship invalid HTML and lowercase `onclick={fn}` serializes handler
  SOURCE into a live inline handler that no-ops on click (S4.12). One spread-resolution pass in
  collect-elements owns S3.12+S4.02; the String() emit coercion (B4 finding 3) backs S4.09/S4.12.
- Scenarios closed: **S3.12, S4.02 (WARN), S4.09 (WARN), S4.12**.
- Required diagnostics: `MARKLESS_EVENT_SPREAD_UNSUPPORTED` (new, error — S3.12);
  `MARKLESS_SPREAD_STATIC_SNAPSHOT` (new, WARN with escape hatch — S4.02);
  `MARKLESS_ATTRIBUTE_OBJECT_VALUE` (new, WARN with escape hatch — S4.09, with the case-aware
  "did you mean onClick?" function-value sibling for lowercase `on*` per S4.12's impl-note);
  `MARKLESS_ATTRIBUTE_DUPLICATE` (new, error — S4.12).
- allowed_files: `packages/compiler/src/passes/semantic-graph/collect-elements.ts`,
  `packages/compiler/src/passes/public-render/module.ts` (undeclared spread source + coercion),
  `packages/compiler/test/*.ts`.
- verify: failing-first per scenario: spread with `on*` keys errors; state spread warns; object
  attribute warns naming the rendered text; duplicate `id` errors; `onclick={() => count++}` gets
  the case-aware suggestion; no emitted module interpolates an undeclared spread source.
- stop_if: spread reactivity SUPPORT (planned update records for spreads) is chosen over the WARN
  — bigger slice, re-approval; collect-elements collisions with B914/B918 — coordinate, single
  writer per file.

### B922 — External-boundary SyntaxError wrapping (@tsrx/core parse throws)
- **Priority: P2** — **status: BLOCKED — awaiting explicit owner go-ahead**
- Objective: raw @tsrx/core SyntaxErrors reach authors with no Markless diagnostic shape (no code,
  why, fix, link): template-level `await` (S2.14 — one concept away from the async-computed
  pattern), optional-chain lvalues (S1.13a), call-expression dynamic tags (S4.03c). Wrap at the
  compiler artifact boundary ONLY (compile-module entry); never queue work in ../native-tsrx.
- Scenarios closed: **S2.14**. (S1.13a and S4.03c halves cross-ref B912/B906; the wrapper here
  serves all three parse sites.)
- Required diagnostics: `MARKLESS_ASYNC_BOUNDARY_REQUIRED` (reuse for the template-await teaching,
  S2.14 block); structured wrapping shape for the other parse throws per their blocks.
- allowed_files: `packages/compiler/src/compile-module.ts` (or a dedicated boundary module under
  `packages/compiler/src/`), `packages/compiler/test/*.ts`.
- verify: failing-first: each of the three parse inputs yields a structured diagnostic carrying
  the original parser message + Markless teaching; non-TSRX SyntaxErrors still surface verbatim.
- stop_if: wrapping requires parser API changes — stop (external dependency boundary per
  AGENTS.md).

### B923 — Browser-harness async-settle instability investigation
- **Priority: P1 (investigation)** — **status: BLOCKED — awaiting explicit owner go-ahead**
- Objective: async-computed settle is context-fragile in the browser harness: the identical
  fixture settles in a small probe file and never settles inside a 34-test file, even with all
  siblings skipped and sensitive to test-block position with byte-identical content; CSR
  sync-policy dispatch was nondeterministic 3-of-5 runs (B8 finding 4; T015 escalation:
  "potentially a real runtime bug masked as flakiness"). Bounded bisect already ruled out imports,
  the SSR transform, direct @markless/web imports, and the failing cross-module fixture.
  Deliverable: minimal reproduction + root-cause identification (harness vs runtime) + a report —
  NO product fix without a follow-up approved task.
- Scenarios closed: none (B8 finding 4 / T015 instability escalation).
- Required diagnostics: n/a (investigation).
- allowed_files: temporary probe files under `packages/vitest-browser/browser/` (deleted before
  receipt), scratchpad logs, one findings note under `docs/goals/crazy-qa/notes/`.
- verify: reproduction commands recorded with run distributions (N of M), not single runs;
  packages/ git-clean at receipt.
- stop_if: root cause lands in vitest/playwright internals — report upstream evidence, stop;
  a runtime bug is confirmed — stop and file the fix as its own task for owner approval.

---

## 2. Coverage matrix (every ERROR/WARN + gap-flagged scenario → exactly one task)

| Scenario | Verdict | Task | | Scenario | Verdict | Task |
| --- | --- | --- | --- | --- | --- | --- |
| S1.01 | WARN | B903 | | S4.02 | WARN | B921 |
| S1.02 | ALLOW-gap | B902 | | S4.03 | ERROR | B906 |
| S1.03 | WARN | B902 | | S4.04 | ERROR | B910 |
| S1.04 | ERROR | B915 | | S4.05 | ERROR | B911 |
| S1.07 | AC-gap | B904 | | S4.06 | ERROR | B911 |
| S1.09 | ERROR | B912 | | S4.07 | ERROR | B906 |
| S1.13 | ERROR | B912 | | S4.08 | ERROR | B906 |
| S1.17 | AC-gap | B904 | | S4.09 | WARN | B921 |
| S1.18 | ERROR | B912 | | S4.10 | ERROR | B906 |
| S1.06 | ALLOW-gap | B902 | | S4.11 | ERROR | B910 |
| S2.05 | ERROR | B912 | | S4.12 | ERROR | B921 |
| S2.06 | ERROR | B905 | | S5.03 | ERROR | B918 |
| S2.07 | ERROR | B915 | | S5.04 | WARN | B918 |
| S2.08 | ERROR | B916 | | S5.05 | ERROR | B918 |
| S2.09 | ERROR | B915 | | S5.06 | ERROR | B918 |
| S2.11 | ERROR | B910 | | S5.07 | ERROR | B918 |
| S2.12 | AC-gap | B920 | | S5.08 | ERROR | B908 |
| S2.13 | ERROR | B911 | | S5.09 | ERROR | B918 |
| S2.14 | ERROR | B922 | | S5.10 | ERROR | B908 |
| S3.02 | ALLOW-gap | B914 | | S6.01 | ERROR | B907 |
| S3.03 | ALLOW-gap | B914 | | S6.02 | WARN | B907 |
| S3.04 | ERROR | B908 | | S6.03 | ERROR | B916 |
| S3.05 | ERROR | B914 | | S6.04 | ERROR | B907 |
| S3.06 | ERROR | B914 | | S6.05 | WARN | B916 |
| S3.07 | ERROR | B905 | | S6.07 | ERROR | B912 |
| S3.08 | ERROR | B908 | | S6.10 | ALLOW-gap | B917 |
| S3.09 | ALLOW-gap | B914 | | S6.12 | ERROR | B903 |
| S3.11 | WARN | B908 | | S6.13 | ERROR | B916 |
| S3.12 | ERROR | B921 | | S6.14 | ERROR | B917 |
| S7.03 | ERROR | B915 | | S6.15 | ERROR | B917 |
| S7.05 | ERROR | B905 | | S8.02 | ERROR | B901 |
| S7.06 | ERROR | B905 | | S8.05 | WARN | B903 |
| S7.07 | ERROR | B919 | | S8.07 | ERROR | B904 |
| S7.08 | ERROR | B919 | | S8.08 | ERROR | B908 |
| S7.10 | ERROR | B915 | | S8.09 | ERROR | B909 |
| S7.11 | ERROR | B919 | | S8.10 | ERROR | B909 |
| | | | | S8.11 | ERROR | B909 |
| | | | | S8.12 | ERROR | B909 |

Totals check: 56 ERROR + 9 WARN + 6 ALLOW-with-gap + 3 AC-with-gap = 74 mapped items;
**zero orphans** (verified against every per-batch "Backlog?" column: all "yes" rows appear above;
all "no" rows are ALLOW/ALREADY-CORRECT without gaps or carry polish-only notes listed below).
Non-scenario structural items carried by tasks: serializer falsy drop (B901), plain-local-write
policy (B913), async-settle instability (B923), inline-resumer cycle memo (B909).

Deliberate exclusions (no backlog task; reasons):
- **Message-polish-only notes on ALREADY-CORRECT/ALLOW entries** — S1.07/S1.08/S1.17 suggestion
  wording, S2.02 post-await `dependencies` alignment, S2.12 boundary-message clause, S7.01 cascade
  noise, S8.01 "an markless" grammar nit, S8.06 proxy-initializer wording, S5.01 forwarding-escape
  deferred-decision note: polish, no wrong behavior; fold into whichever task touches the pass
  first (S7.01's cascade suppression is explicitly in B918's S5.06 scope).
- **Const-propagation ALLOW-expansions** (S1.12 `menu[key]` with const key, S1.16 `items[i]` with
  const index): current loud diagnostics are spec-correct; expansion is a future capability, not a
  defect.
- **Non-blocking permanent-fixture notes** (S6.08 switch no-match round trip, S1.07 first-contact
  write shape): regression fixtures only; attach to B917/B912 verify lists when those run.
- **S6.06 nested-repeat scope-qualified identity** and **S6.09 projection-metadata design**:
  already loud capability boundaries; S6.09 is tracked by known-red `test.fails` browser tests by
  design.
- **S2.10 signal-less staleness**: proven working (version-ignoring holds); its harness caveat is
  B923.
- **S8.03/S8.04**: ALREADY-CORRECT; their authored-initializer delivery caveat rides B902 and the
  inline-resumer cycle memo rides B909.

## 3. "Needs TSRX spec confirmation" resolutions

Source used: **live TSRX specification at https://tsrx.dev/specification** (TSRX MCP server not
available in this session's toolset; live spec fetched successfully 2026-07-04 — Draft dated
June 7, 2026; local split specs used as the host-profile authority per AGENTS.md). Decisive
finding for ALL 15 flags: the TSRX core spec defines **syntax, AST contract, and early errors
only** and explicitly defers to hosts (§6 Host-defined Semantics): "the runtime observation model
is not [fixed]", how functions returning TSRX lower, how lazy destructuring/reactivity is
realized, how dynamic tags resolve, and how submodules execute are all host-defined. `state()` /
`computed()` / keys-as-identity / graph scoping are Markless host-profile semantics, so none of
the 15 flagged verdicts is contradicted by TSRX. Per-item disposition (all verdicts STAND):

| Entry | Question | TSRX-language finding | Verdict stands? |
| --- | --- | --- | --- |
| S1.01 | state-ref escape / logging | Reactivity host-defined (§6); statements before the template output are legal syntax (§4.2 statement container) | Yes (WARN + behavior fix) |
| S1.03 | state(a) initializer | API semantics host-owned; TSRX silent | Yes (WARN) |
| S1.04 | nested state(state(5)) | Expression nesting is legal syntax; meaning host-owned | Yes (ERROR) |
| S1.05 | state() with no argument | Pure host API question; TSRX not implicated | Yes (ALLOW) |
| S1.18 | whole-binding alias `let b = a` | Ordinary ES assignment; graph semantics host-owned | Yes (ERROR) |
| S6.03 | duplicate runtime keys | AST records `key?: Expression \| null` only; identity semantics host-owned | Yes (ERROR, runtime) |
| S6.05 | @for over undefined | `@for`/`@empty` are core syntax; iteration behavior host-owned | Yes (WARN + fix) |
| S6.12 | early return before template | §4.2: "function exit remains an ordinary return statement" — legal syntax whose render meaning is host lowering; silent deletion is therefore a host defect, confirming the diagnostic requirement | Yes (ERROR) |
| S2.06 | state() in a derive | Host-owned creation scoping | Yes (ERROR) |
| S2.09 | self-referential computed | Host-owned dependency model | Yes (ERROR) |
| S3.03 | handler alias resolution | Attribute expression values are ordinary AST; extraction is host analysis | Yes (ALLOW-with-gap) |
| S3.07 | state() in a handler | Host-owned creation scoping | Yes (ERROR) |
| S3.12 | spread handler bags | JSX spread attributes are core syntax; event discovery host-owned ("compiler and bundler own event discovery" is a Markless rule TSRX permits) | Yes (ERROR) |
| S7.06 | conditional/loop creation | Host-owned creation scoping | Yes (ERROR) |
| S7.10 | `const makeState = state` | Ordinary ES; API recognition by imported binding is host design | Yes (ERROR) |

Bonus confirmations recorded while checking: templates ARE assignable/returnable/passable
expression values at the language level ("Native TSRX values can be assigned, returned, or passed
as props") — so the S2.13/S4.05/S4.06 no-parse-throw observations are correct language behavior
and the `MARKLESS_TEMPLATE_AS_VALUE` rejection must be host-side (B911); dynamic-tag lowering and
string-vs-component resolution are host-defined (B906); submodule restriction is explicitly
sanctioned ("Host profiles may restrict which submodule names are supported"), further validating
S7.04's ALREADY-CORRECT.

## 4. Spec-vs-implementation conflicts (owner decision required)

1. **S7.05 — helper creation** (spec 03:222): "state()/computed() may be created anywhere in a
   call tree rooted in a component" sanctions the custom-hook habit; the implementation hoists a
   phantom cell and blames the wrong line. T011 ruling: ship the removable
   `MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED` capability gate (B905) unless the owner directs the
   call-tree return-value aliasing capability instead. Decision: gate now vs. capability now.
2. **S5.05 — prop-handle forwarding** (spec 04:39-41): "Passing element handles through component
   context, arrays, and helpers is valid" — the implementation rejects `el={props.handle}` with a
   message asserting the handle is not a handle. Decision: capability (prop-edge handle tracking)
   vs. the B918 honest gate.
3. **S5.08 — local behavior factory** (spec 04:52-66): the spec's OWN §Element behaviors example
   is a same-file local factory; today it misfires UNRESOLVED_WRITE inside the behavior body and
   plans a behavior symbol no module emits (plain error at first interaction). Decision: local-
   factory emission vs. the B908 gate; also feeds the B913 plain-local-write ruling
   (behavior-body exemption).
4. **S1.01 — body execution** (AGENTS.md: "Component bodies execute during initial render"): the
   record-based emitter deletes all non-template body statements from every emitted module,
   proven at runtime (zero log calls). Decision: restore faithful body-statement execution at
   initial render (B903's behavior half) vs. redefine the model — either way the current silent
   deletion cannot stand.
5. **(Adjacent policy, T011-escalated) plain-local-write over-rejection**: every plain-local write
   in a component body errors today, while the diagnostic's own suggestion recommends "normal
   local code"; it is also the only guard on S7.08's leak and S4.06's assembly. Decision owns
   B913's sequencing (relax only after B911 + B919 land, or keep + fix the message).
6. **(Contract revision) writes-only handler emit is PINNED** (symbol-modules.test.ts:1585,
   :1638-1694): fixing B908 requires deliberately revising asserted test contracts — owner
   sign-off before the pinned expectations change.

## 5. Owner-escalation digest (consolidated from T005/T008/T011/T014 receipts + T015 headlines)

Framework-integrity (silent-wrong, run-backed):
1. Non-template body statements silently DELETED from all emitted modules — the class behind
   S1.01/S6.12/S8.05/S6.10-sibling and the reason runtime stubs are unreachable (T005 #1, T008 #6). → B903
2. Sync computeds dropped from every artifact: spec hello-world → CSR ReferenceError + empty SSR
   module, zero diagnostics; composite template expressions never lower (T008 #1, T014 #2). → B910
3. collect-repeat discards whole repeat records (incl. spec-blessed `index i; key i`) before any
   gate can fire — whole lists render empty; duplicate keys drop rows last-wins;
   `state(undefined)` collections permanently dead (T008 #2/#5). → B907/B916
4. Branch gates silent while repeat gates loud — component in `@if` freezes forever (T008 #3). → B917
5. Handler modules emit from write records only — imported handlers no-op, `save()` never called,
   detached preventDefault never cancels, setTimeout writes run immediately (partially PINNED
   contract) (T011 #1, T015). → B908
6. Silent `components[0]` rooting — one helper above App empties all module sources; plan and
   module emit can root at different components (spec 10:38-41 violation) (T014 #1). → B906
7. Serializer drops EVERY falsy object field except undefined (`menu.open` unrestorable); live
   host objects serialize to `{}` with `ok: true` (T014 #4, T015 #1/#5). → B901
8. Event-only resume tier is a parallel weaker runtime: version-only validation → NaN UI from
   tampered payloads, stale-forever sync policy, unstructured errors, no `graph.call`, silent
   double resume (T015 #2). → B909
9. Non-literal state initializers never reach the payload — `state(obj.x)`, the dominant idiom,
   renders empty after SSR+resume (T005 #3, T015 #3). → B902
10. try/catch inside an async derive silently empties the boundary — @pending forever (T015 #4). → B920
11. Spec's own SearchBox `h?.focus()` silently deleted; regex-over-source-text handle-call
    collection is a fragile mechanism class (T014 #5). → B908
12. Handle guard is initializer-only (`menu.node = input` commits silently); `{h.textContent}`
    joins the undeclared-local emit class (T014 #6). → B918/B904

Loud-but-wrong / model-consistency:
13. The web's most common form handler errors blaming a NONEXISTENT guard (T011 #2). → B914
14. `onClick={count++}` silently rewritten to a per-click handler — the compiler changed JS
    evaluation semantics with zero diagnostics (T011 #3). → B914
15. EVERY plain-local write errors today; relaxing it without dedicated guards makes S7.08's
    cross-request leak silent (T011 #4). → B913/B919
16. Walk-site-context missing at 4 confirmed sites; S7.05 is a spec conflict (T011 #5). → B905
17. shared() scopes silently filtered not validated; cross-module state import renders a dead
    snapshot cleanly; spread handlers → undeclared identifier in both render modules (T011 #6). → B919/B921
18. Inconsistent loudness (`let b = a` silent vs swap loud); synthetic-artifact tests prove
    diagnostics no real source can reach — false-confidence methodology gap (T005 #4/#5). → B912
19. `[object Object]` attributes; lowercase `onclick` serializes handler source into live markup;
    duplicate attributes ship invalid HTML (T014 #3). → B921
20. Browser-harness async-settle nondeterminism — possibly a real runtime bug masked as
    flakiness (T015 #6). → B923

## 6. Verification performed for this note (T900)

- Read: full catalog.md (all 8 batch sections + summaries), all 8 batch receipts' backlog
  sections via state.yaml receipts, T003/T014 audit notes, T005/T008/T011 owner_escalations in
  state.yaml.
- `grep -n "needs TSRX spec confirmation" notes/catalog.md` → 15 entries, all resolved in §3 with
  the recorded source (live spec fetch; MCP unavailable).
- Coverage matrix cross-checked against every batch summary's "Backlog? = yes" rows and verdict
  counts (56 E / 9 W / 6 ALLOW-gap / 3 AC-gap): zero orphans, exactly-one mapping.
- `git status --porcelain packages/` → empty (no source touched).
