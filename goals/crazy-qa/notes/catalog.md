# Crazy QA — Catalog (populated during /goal execution)

Each entry MUST cite a real compiler/runtime run. Schema is set by Judge task T003.

## Batch 1 — State reads/writes & lvalues

Run context (T004, 2026-07-04): all "Observed" values below are verbatim from a temporary probe test
`packages/compiler/test/crazy-qa-b1-probe.test.ts` (one test per scenario calling the real
`buildSemanticGraph` / `lowerStateAccess` / `compileTsrxModule` entrypoints, deleted after the runs
per T003 §6), executed with `pnpm exec vp test packages/compiler/test/crazy-qa-b1-probe.test.ts`
(28 tests passed). Re-verify entries also reran the cited existing files in one command:
`pnpm exec vp test packages/compiler/test/state-lowering.test.ts packages/compiler/test/state-lowering-update.test.ts packages/compiler/test/state-lowering-delete.test.ts packages/compiler/test/semantic-alias-collector.test.ts packages/compiler/test/semantic-diagnostics.test.ts packages/compiler/test/semantic-expression-collector.test.ts`
— 6 files, 37 tests, all passed.

Browser CLI status: `pnpm exec vp test --project browser packages/vitest-browser/browser/harness.test.ts`
was executed once and PASSED (1 test, 1.19s) — the CLI inferred in T001 is now confirmed. However, no
existing browser fixture covers the B1 runtime claims and this task may not add fixture files, so every
runtime-behavior claim in this batch is flagged `BM-deferred-to-B8`. All snippets assume
`import { state } from '@markless/core';` inside `export function App() @{ ... }` exactly as shown.

### S1.01 — console.log of a state reference (OWNER SEED a)
- Snippet:
  ```tsrx
  const x = state(5);
  console.log(x);
  <p>{x}</p>
  ```
- Probe layer: SG + SL + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b1-probe.test.ts`
  - Observed (SG/SL): `graphBindings[0] = {"id":"state:x","name":"x","kind":"state","declarationKind":"const","writable":true,"valueKind":"scalar","initialValue":5}`; `stateReads: []` — the `console.log(x)` read is not collected anywhere; `diagnostics: []` on both semanticGraph and stateLowering. The template read lowers correctly: `reads[0] = {"source":"x","graphNodeId":"state:x","path":[]}`.
  - Observed (FC emit): `compileTsrxModule` produced `console.log` presence `{"inModuleSource":false,"inCsrModuleSource":false,"inSsrModuleSource":false,"inSymbolModules":false}`. The emitted SSR module body is `async function marklessRenderSsr(props = {}) { let x = marklessSsrStateValue("state:x"); ... "<p>" + marklessSsrText(x) + "</p>" ... }` — the `console.log(x)` statement is dropped entirely from every emitted module. All five diagnostic arrays (semanticGraph, stateLowering, payloadArena, captureAnalysis, publicRenderModule) are `[]`.
- Spec check: specs/framework/03-state-graph.md §Implementation: compiler-owned graph state — "every read of that binding compiles to a graph read (`_get(count)`)... including reads inside closures, template expressions, ... and non-component helper functions". AGENTS.md core constraint: "Component bodies execute during initial render." The local spec is silent on the specific state-ref-escape/logging case; needs TSRX spec confirmation.
- Verdict: WARN
- Rationale: The canonical first debugging act currently violates JavaScript semantics silently: the statement is removed from all emitted modules, so the compiled output cannot log anything, with zero diagnostics (rubric rule 4: silent wrong/inert behavior is never acceptable). The legitimate reading (log the value once during initial render — exactly what plain JS body execution means in the no-hydration model) makes this WARN, not ERROR. The preferred end-state is dual: (1) restore body-statement execution during initial render so the log actually happens (behavior fix; could later upgrade this entry toward ALLOW), and (2) a WARN that teaches the render-once semantics, because a junior expects the log to re-fire on updates.
- Required diagnostic:
  - Code: MARKLESS_STATE_RENDER_ONLY_READ (new)
  - Severity: warning — Phase: semantic-graph
  - Title: State read runs only during initial render
  - Message: `console.log(x)` reads `x` while the component body runs during initial render. It logs the value of `x` at that moment and never runs again when `x` changes.
  - Why: Component bodies execute once during initial render; browser resume replays graph writes and DOM updates, never the body.
  - Suggestion(s): To observe every change of `x`, log inside the event handler that writes `x` (before: `console.log(x);` in the body — after: `onClick={() => { x++; console.log(x); }}`). Keep the body log for one-time render inspection.
  - docsUrl: https://markless.dev/errors/MARKLESS_STATE_RENDER_ONLY_READ
  - Escape hatch (WARN only): `// markless-allow MARKLESS_STATE_RENDER_ONLY_READ: intentional render-time log` on the statement line silences exactly this site.
- Impl-note: two owning sites — (1) public-render-module emit (and the semantic-graph collector feeding it) drops non-template body statements today; restoring faithful body execution is the behavior half; (2) collect-expressions/collect-state for the WARN. Backlog item.
- Runtime follow-up: BM-deferred-to-B8 (confirm in browser dev pipeline that nothing prints today, and what prints after the behavior fix).
- B8 resolution (T015): RESOLVED — `pnpm exec vp test --project browser packages/vitest-browser/browser/crazy-qa-b8-probe.test.ts` (real chromium, temporary fixture crazy-qa-b8-log-seed.tsrx, `vi.spyOn(console, 'log')` installed before CSR render): rendered text `"5"`, `markerLogCallCount: 0`, `totalLogCallCount: 0` — nothing prints today. The behavior fix has not landed, so the after-fix half stays open with the backlog item.

### S1.02 — state(obj.x) plain object path initializer (OWNER SEED b)
- Snippet:
  ```tsrx
  const obj = { x: 5 };
  const n = state(obj.x);
  <p>{n}</p>
  ```
- Probe layer: SG + SL
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b1-probe.test.ts`
  - Observed: `graphBindings[0] = {"id":"state:n","name":"n","kind":"state","declarationKind":"const","writable":true,"valueKind":"unknown"}` (no static `initialValue`, no `dependencies` key — no spurious dependency on `obj`); `stateReads: []`; `diagnostics: []` in both passes; template read lowers positively: `reads[0] = {"source":"n","graphNodeId":"state:n","path":[]}`.
- Spec check: specs/framework/03-state-graph.md §Implementation: compiler-owned graph state — "Dynamic values are still validated at runtime serialization. Semantic analysis can classify the origin and path; it does not pretend to know the concrete value."
- Verdict: ALLOW
- Rationale: Dominant real-world init idiom (`useState(props.x)` analog, prep §1). The positive artifact facts required by T003 §4.4 are present: a real graph binding is created, the template read subscribes to it, and no spurious reactive dependency on `obj` is recorded — initializer is a one-time snapshot as intended. Rubric rule 3: never warn on the dominant idiom.
- Required diagnostic: n/a.
- Impl-note: none.
- Runtime follow-up: BM-deferred-to-B8 (runtime-serialization validation of the snapshot value belongs to the B8/SER tier).
- B8 resolution (T015): RESOLVED, and the runtime story is WORSE than the B1 verdict assumed — `pnpm exec vp test packages/compiler/test/crazy-qa-b8-probe.test.ts`: the planned payload cell for `state(obj.x)` is `{"graphNodeId":"state:n","valueKind":"unknown","value":{"version":1,"root":{"$type":"undefined"},"records":[]}}` and the SSR module declares `marklessSsrStateValues = new Map([])`; browser run (crazy-qa-b8-init-family.tsrx, SSR+resume): `<output data-n>` renders `""`. The snapshot value NEVER reaches the payload or the page — the dominant idiom renders empty. No serialization validation ever runs because the initializer never executes in any emitted module. This is S1.03's planned-`undefined` bug-class extended to the dominant idiom (owner-escalation candidate; the ALLOW verdict on the semantics stands, the delivery is broken).

### S1.03 — state(a) where a is itself graph state
- Snippet:
  ```tsrx
  let a = state(1);
  let b = state(a);
  <p>{a} {b}</p>
  ```
- Probe layer: SG + SL + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b1-probe.test.ts`
  - Observed: `b` becomes `{"id":"state:b","name":"b","kind":"state","declarationKind":"let","writable":true,"valueKind":"unknown"}` with no `dependencies` and no read of `a` collected for the initializer; `diagnostics: []` everywhere. FC planned payload (`protocolState`) serializes `state:a` as `{"root":1}` but `state:b` as `{"root":{"$type":"undefined"}}` — the snapshot of `a`'s value 1 is NOT in the planned payload; all five diagnostic arrays `[]`.
- Spec check: specs/framework/03-state-graph.md §Surface API (`state(initial)` — reactive value) is silent on a graph binding used as another state's initializer; local spec silent, needs TSRX spec confirmation. Prep research §1 (state-argument shapes) documents this as the "link two states" misfire.
- Verdict: WARN
- Rationale: Two problems, one silent. Semantically, the dev usually wants a live link, but `state(a)` can only be a one-time snapshot (independent cells; no dependency edge exists in the artifacts) — sometimes intentional (copy-initial-value), so WARN with escape hatch, not ERROR. Behaviorally, today even the snapshot is not delivered by the compile-time payload plan (`b` is planned as `undefined`), which is silent wrong behavior under rubric rule 4.
- Required diagnostic:
  - Code: MARKLESS_STATE_INIT_FROM_STATE (new)
  - Severity: warning — Phase: semantic-graph
  - Title: state() initializer copies another state value once
  - Message: `state(a)` copies the value of `a` one time when `b` is created. `b` starts from that snapshot and does not follow later updates to `a`.
  - Why: Every state() call creates an independent graph cell; an initializer is a one-time value, not a dependency edge in the graph.
  - Suggestion(s): If `b` should stay derived from `a`, use `const b = computed(() => a);`. Keep `state(a)` only when you want an independent copy of the current value.
  - docsUrl: https://markless.dev/errors/MARKLESS_STATE_INIT_FROM_STATE
  - Escape hatch (WARN only): `// markless-allow MARKLESS_STATE_INIT_FROM_STATE: intentional one-time copy` on the declaration line.
- Impl-note: collect-state (initializer classification + WARN); payload-arena planning (the planned `undefined` snapshot is a distinct bug-class backlog item — snapshot value must reach the payload or be produced at initial render).
- Runtime follow-up: BM-deferred-to-B8 (what value `b` actually holds after initial render and after resume).
- B8 resolution (T015): RESOLVED — browser run (crazy-qa-b8-init-family.tsrx, SSR+resume): the served state script carries `{"graphNodeId":"state:b",...,"root":{"$type":"undefined"}}` verbatim and `<output data-b>` renders `""` at initial render and stays `""` after resume — `b` holds `undefined`, not even the one-time snapshot of `a` (which renders `"1"` beside it).

### S1.04 — nested state(state(5))
- Snippet:
  ```tsrx
  const x = state(state(5));
  <p>{x}</p>
  ```
- Probe layer: SG + SL + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b1-probe.test.ts`
  - Observed: exactly one binding `{"id":"state:x","name":"x","kind":"state","declarationKind":"const","writable":true,"valueKind":"unknown"}`; the inner `state(5)` call produces no binding, no record, and no diagnostic. FC planned payload: `state:x` root is `{"$type":"undefined"}`; all five diagnostic arrays `[]`.
- Spec check: specs/framework/03-state-graph.md §Async derivation ("compiler-rewritten framework APIs, not runtime reactive values"; "runtime stubs fail loudly if called directly without compilation"). Local spec silent on nested creation specifically; needs TSRX spec confirmation.
- Verdict: ERROR
- Rationale: No legitimate reading exists: a graph cell holds serializable data, and a state() call is a compiler construct with no value form that can live inside another cell. Today it compiles silently to a cell whose planned initial value is `undefined`, and the un-rewritten inner call would reach the fail-loud runtime stub — a runtime crash for a compile-time-detectable mistake (rubric rule 1 + rule 4).
- Required diagnostic:
  - Code: MARKLESS_STATE_NESTED_CREATION (new)
  - Severity: error — Phase: semantic-graph
  - Title: state() cannot be the initial value of another state()
  - Message: `state(state(5))` declares graph state whose initial value is another state() call. `x` cannot store graph state as its value.
  - Why: A graph cell serializes plain data across the resume boundary; a state() call declares a cell and has no serializable value form.
  - Suggestion(s): Before: `const x = state(state(5));` — After: `const x = state(5);`.
  - docsUrl: https://markless.dev/errors/MARKLESS_STATE_NESTED_CREATION
- Impl-note: collect-state (detect framework-API call expressions inside a state()/computed() argument). Backlog item.
- Runtime follow-up: BM-deferred-to-B8 (confirm the inner uncompiled call throws `FrameworkApiRuntimeError` at initial render today).
- B8 resolution (T015): RESOLVED — the expected throw does NOT happen: browser CSR render of crazy-qa-b8-nested-state.tsrx returned `{"rendered":"","failure":null}` — the inner `state(5)` never executes because body statements are dropped from every emitted module (S1.01 class), so the fail-loud stub is unreachable and `x` silently renders empty. The ERROR verdict's compile-time diagnostic remains the required fix.

### S1.05 — state() with no initial value / state(undefined)
- Snippet:
  ```tsrx
  let x = state();
  let y = state(undefined);
  <p>{x} {y}</p>
  ```
- Probe layer: SG + SL + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b1-probe.test.ts`
  - Observed: both bindings created with `valueKind: "unknown"`, no diagnostics in any pass; template reads lower to `{"source":"x","graphNodeId":"state:x","path":[]}` (same for `y`). FC planned payload represents the missing value explicitly: `state:x` root is `{"$type":"undefined"}` with `records: []`.
- Spec check: specs/framework/03-state-graph.md §Surface API — `state(initial)` prose does not require an argument; local spec silent on omitted initial values; needs TSRX spec confirmation. Serialization tiers are a serializer contract (B8).
- Verdict: ALLOW
- Rationale: Omitting an initial value is ordinary JavaScript, and the artifacts prove positive handling: a cell exists, reads subscribe, and the payload plan encodes `undefined` explicitly (`{"$type":"undefined"}`) rather than dropping the cell. No surprising semantics are introduced, so the meta-contract's diagnostic clause is not triggered.
- Required diagnostic: n/a.
- Impl-note: none.
- Runtime follow-up: BM-deferred-to-B8 (serializer round-trip of `undefined` through a real SSR/resume pass — SER tier).
- B8 resolution (T015): RESOLVED — `pnpm exec vp test packages/serializer/test/crazy-qa-b8-probe.test.ts`: `serializeGraphValue(undefined)` → `{"version":1,"root":{"$type":"undefined"},"records":[]}`, `deserializeGraphValue` returns `undefined` exactly. Browser (crazy-qa-b8-init-family.tsrx, SSR+resume): `let u = state()` renders `""`, and a resumed click writing `u = 'set'` updates the binding to `"set"` — the undefined-started cell is fully writable after resume.

### S1.06 — state(fetchDefaults()) opaque call initializer
- Snippet:
  ```tsrx
  function fetchDefaults() { return { theme: 'light' }; } // module scope
  // in App:
  const x = state(fetchDefaults());
  <p>{x.theme}</p>
  ```
- Probe layer: SG + SL
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b1-probe.test.ts`
  - Observed: `graphBindings[0] = {"id":"state:x","name":"x","kind":"state","declarationKind":"const","writable":true,"valueKind":"unknown"}`; no diagnostics; the path read lowers positively: `reads[0] = {"source":"x.theme","graphNodeId":"state:x","path":["theme"]}`.
- Spec check: specs/framework/03-state-graph.md §Implementation: compiler-owned graph state — "Dynamic values are still validated at runtime serialization... it does not pretend to know the concrete value returned by an opaque function."
- Verdict: ALLOW
- Rationale: The spec names this exact case: semantic analysis classifies origin and path (proven — `x.theme` lowers to a path-granular read even though the value is opaque) and defers value validation to runtime serialization. Blocking opaque initializers would break every real app.
- Required diagnostic: n/a.
- Impl-note: none.
- Runtime follow-up: BM-deferred-to-B8 (runtime serialization validation/diagnostic for an unserializable return value — SER tier).
- B8 resolution (T015): RESOLVED — no runtime serialization validation can ever fire for an opaque initializer today, because the initializer never executes (compile probe: the call appears in no emitted module) and the payload plans `{"$type":"undefined"}` (same run family as S1.02/S1.03). The serializer-tier diagnostic itself exists and reran green for function values (packages/serializer/test/serializer.test.ts:136, `MARKLESS_SERIALIZE_UNSUPPORTED_VALUE` — rerun pass), but state initializers cannot reach it. See also S8.02: live host objects (WebSocket) bypass even that diagnostic.

### S1.07 — non-state object read by template, mutated in handler (OWNER SEED c)
- Snippet:
  ```tsrx
  const obj = { x: 5 };
  <p onClick={() => { obj.x = 6; }}>{obj.x}</p>
  ```
- Probe layer: SG + SL
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b1-probe.test.ts`
  - Observed: compile FAILS with `stateLowering.diagnostics[0]`: code `MARKLESS_STATE_UNRESOLVED_WRITE`, severity `error`, title `Cannot resolve graph write target`, message `Cannot write to "obj.x" because it does not resolve to graph state.`, why `Only state() bindings and supported graph paths can be mutated across a resume boundary.`, suggestion `Write to a state() binding, a path inside object state, or move non-graph mutation into normal local code.`, docsUrl `https://markless.dev/errors/MARKLESS_STATE_UNRESOLVED_WRITE`. Also observed: the template read of `obj.x` produces a `templateReads` record but NO lowered read and NO diagnostic (`SL reads: []`) — a plain-object template read is a one-time snapshot with no subscription.
- Spec check: specs/framework/03-state-graph.md §State lvalue meta-contract — "If the target is unresolved, ambiguous, read-only, or would require surprising semantics, compilation fails with a diagnostic."
- Verdict: ALREADY-CORRECT
- Rationale: The "why didn't my mutation re-render" trap cannot happen silently: the handler write to a non-state object is a compile error with consequence → why → fix → link, quoting `obj.x`. First-contact polish note: the message could additionally say that `{obj.x}` in the template renders a one-time snapshot, and the first suggestion for this shape could be the direct rewrite `const obj = state({ x: 5 })` — message-quality only, not a gap.
- Required diagnostic: n/a (ships today; see message-quality note above).
- Impl-note: state-lowering write resolution. No existing test pins this exact first-contact shape — worth a fixture when diagnostics work is unblocked (non-blocking note for T900).
- Runtime follow-up: BM-deferred-to-B8 (read-only sibling: confirm `{obj.x}` with no write renders the snapshot and never updates).
- B8 resolution (T015): RESOLVED, and the read-only sibling does NOT render a snapshot — it CRASHES: browser run (crazy-qa-b8-snapshot-reads.tsrx, `const obj = { x: 5 };` with `{obj.x}` in the template): CSR render throws `ReferenceError: obj is not defined` and the SSR command fails with the same `ReferenceError: obj is not defined` — the emitted modules interpolate `obj.x` while dropping the `const obj` declaration (the S3.12/S4.05 undeclared-local emit class, fourth confirmed instance). The compile-error protection this entry credits covers only the WRITE half.

### S1.08 — aliased write through a function parameter
- Snippet:
  ```tsrx
  const menu = state({ open: false });
  function bump(o) { o.open = true; }
  <button onClick={() => bump(menu)}>{menu.open}</button>
  ```
- Probe layer: SG + SL
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b1-probe.test.ts`
  - Observed: compile FAILS with `MARKLESS_STATE_UNRESOLVED_WRITE`, message `Cannot write to "o.open" because it does not resolve to graph state.` (same why/suggestion/docsUrl shape as S1.07, span on `o.open`). Also observed: passing `menu` as a call argument lowers a whole-binding read `{"source":"menu","graphNodeId":"state:menu","path":[]}`; the helper name `bump` is collected as a stateRead source and silently dropped by lowering (no diagnostic — inert but harmless since compilation already fails).
- Spec check: specs/framework/03-state-graph.md §State lvalue meta-contract — the write target `o.open` is unresolved/ambiguous at the parameter boundary ⇒ diagnostic is the specified outcome.
- Verdict: ALREADY-CORRECT
- Rationale: Tracking graph writes through arbitrary call arguments would require interprocedural aliasing the resume model cannot serialize; erroring is spec-correct and loud. Message-quality note: the why does not say the cause is a function parameter (the compiler cannot know `o` is `menu` at the write site) and could suggest writing `menu.open = true` inline or using a `shared()` method — polish only, shape bar (consequence/why/fix/link, user names) is met.
- Required diagnostic: n/a (ships today).
- Impl-note: state-lowering write resolution.
- Runtime follow-up: none.

### S1.09 — write inside a template expression {count++} (OWNER SEED c, template variant)
- Snippet:
  ```tsrx
  let count = state(0);
  <p>{count++}</p>
  ```
- Probe layer: SG + SL + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b1-probe.test.ts`
  - Observed: compiles CLEAN — no diagnostic in any pass. The write is collected and fully lowered: `SL writes[0] = {"source":"count","graphNodeId":"state:count","path":[],"operation":"update","prefix":false,"updateOperator":"++"}`; `templateReads[0].source = "count++"`. FC then silently drops the binding from the render plan: `publicRenderPlan` has `staticTextWrites: []`, `symbolModules: []` (no dom-update symbol at all), `publicRenderPlan.diagnostics: []`.
- Spec check: specs/framework/03-state-graph.md §No effects, no tasks — "The entire graph is demand-driven from the DOM... compiler-generated DOM update symbols are the only effects in the system"; §Scoping model — "updates... never re-enter the component body during browser resume".
- Verdict: ERROR
- Rationale: Silent wrong behavior on both ends (rubric rule 4): the compiler records a real graph write sourced from a DOM read site, then emits a render plan with no text wiring and no diagnostic — the hole renders nothing reactive and the authored increment is unaccounted for. There is no legitimate reading: a template hole is a demand-driven DOM read, and a write inside it would re-trigger the very DOM update that evaluates it (self-waking effect, which this framework's core invariant forbids).
- Required diagnostic:
  - Code: MARKLESS_STATE_WRITE_IN_TEMPLATE (new)
  - Severity: error — Phase: semantic-graph
  - Title: Cannot write state inside a template expression
  - Message: `{count++}` writes to `count` while rendering its value. A template expression is a DOM read; writing `count` there would re-trigger the same DOM update that is rendering it.
  - Why: DOM updates are the only effects in the demand-driven graph; a write inside a DOM read creates a self-waking cycle that cannot resume.
  - Suggestion(s): Render the value and move the write to an event site. Before: `<p>{count++}</p>` — After: `<p>{count}</p>` plus `onClick={() => count++}` (or wherever the mutation belongs).
  - docsUrl: https://markless.dev/errors/MARKLESS_STATE_WRITE_IN_TEMPLATE
- Impl-note: collect-expressions (template expression walk) records the write without noting its template-read origin; state-lowering or the collector should reject writes whose site is a template read. Highest-priority B1 backlog item together with S1.13/S1.18 (silent class).
- Runtime follow-up: none (compile-time verdict; render-plan drop proven at FC).

### S1.10 — update expressions and compound assignment
- Snippet:
  ```tsrx
  let count = state(0);
  count++; // body level
  <button onClick={() => { count++; ++count; count += 2; }}>{count}</button>
  ```
- Probe layer: SL
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b1-probe.test.ts`
  - Observed: all four writes lower with exact operator metadata, e.g. `{"source":"count","graphNodeId":"state:count","path":[],"operation":"update","prefix":false,"updateOperator":"++"}`, `{...,"prefix":true,"updateOperator":"++"}`, `{...,"operation":"assign","assignmentOperator":"+=","valueSource":"2"}`; the body-level `count++` also lowers; `diagnostics: []`.
  - Existing test: packages/compiler/test/state-lowering-update.test.ts:5 and packages/compiler/test/state-lowering.test.ts:154 — rerun result: pass (part of the 6-file re-verify command, 37 passed).
- Spec check: specs/framework/03-state-graph.md §State lvalue meta-contract — `count++` named as the supported example; fixture-locked surface.
- Verdict: ALREADY-CORRECT
- Rationale: The basic counter contract works exactly as specced with operator/prefix metadata preserved for JavaScript-visible semantics, and it is pinned by existing fixture tests.
- Required diagnostic: n/a.
- Impl-note: state-lowering, update-expression resolution.
- Runtime follow-up: none.

### S1.11 — const graph binding reassignment
- Snippet:
  ```tsrx
  const count = state(0);
  <button onClick={() => { count++; }}>{count}</button>
  ```
- Probe layer: SL
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b1-probe.test.ts`
  - Observed: `MARKLESS_STATE_CONST_REASSIGNMENT`, severity `error`, title `Cannot reassign a const graph binding`, message `Cannot update "count" because it was declared with const. JavaScript const binding semantics are preserved for state().`, why `state() removes marker syntax, but it does not change JavaScript binding rules. A const binding cannot be reassigned during resume or initial render.`, suggestion `Use let for scalar state you reassign, or mutate a property path on object state such as menu.open.`, docsUrl `https://markless.dev/errors/MARKLESS_STATE_CONST_REASSIGNMENT`. The read still lowers (button text subscribes).
  - Existing test: packages/compiler/test/state-lowering.test.ts:875 — rerun result: pass.
- Spec check: specs/framework/03-state-graph.md §State lvalue meta-contract — `frozenCount++; // diagnostic: const reassignment` is the spec's own example.
- Verdict: ALREADY-CORRECT
- Rationale: Exactly the specced outcome, and the message is a model of the owner constraint — it teaches confidently ("state() removes marker syntax, but it does not change JavaScript binding rules") with consequence → why → fix → link, quoting `count`.
- Required diagnostic: n/a.
- Impl-note: state-lowering, lvalue resolution.
- Runtime follow-up: none.

### S1.12 — computed member access menu[key] read/write
- Snippet:
  ```tsrx
  const menu = state({ open: false });
  const key = 'open';
  <button onClick={() => { menu[key] = true; const v2 = menu[key]; }}>{menu.open}</button>
  ```
- Probe layer: SL
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b1-probe.test.ts`
  - Observed: both directions error. `MARKLESS_STATE_DYNAMIC_PATH_READ`: `Cannot read "menu[key]" because graph read paths must be statically resolvable.` (why: "The resumable state graph records path-level subscriptions in the payload. A dynamic property expression cannot be represented as a stable graph subscription by the current compiler pass."). `MARKLESS_STATE_DYNAMIC_PATH_WRITE`: `Cannot write to "menu[key]" because graph write paths must be statically resolvable.` Suggestions name the fixes ("statically named property path, a literal array index, ..."). The static `{menu.open}` template read still lowers to `path: ["open"]`.
  - Existing test: packages/compiler/test/state-lowering.test.ts:512 (write) and :579 (read) — rerun result: pass.
- Spec check: specs/framework/03-state-graph.md §State lvalue meta-contract — dynamic/ambiguous targets ⇒ diagnostic; supported surface is fixture-locked.
- Verdict: ALREADY-CORRECT
- Rationale: Dynamic paths cannot be stable payload subscriptions, and both read and write fail loudly with quality messages quoting `menu[key]`. Caveat for a future ALLOW-expansion (not a defect): here `key` is a `const` string literal, so constant propagation could make this path statically resolvable; the diagnostic's own suggestion already names the literal-path rewrite.
- Required diagnostic: n/a.
- Impl-note: state-lowering, dynamic path detection.
- Runtime follow-up: none.

### S1.13 — optional-chain write and optional delete
- Snippet:
  ```tsrx
  // (a) menu?.settings.open = true;   (b) delete menu?.a;   (c) delete menu.a;
  const menu = state({ a: 1 });
  <button onClick={() => { delete menu?.a; }}>{menu.a}</button>
  ```
- Probe layer: SL (plus parse for variant a)
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b1-probe.test.ts`
  - Observed (a): `buildSemanticGraph` THROWS from the parser: `SyntaxError: Optional chaining cannot appear in left-hand side (6:26)` — phase parse (external @tsrx/core); this shape is invalid JavaScript everywhere.
  - Observed (b): SILENT DROP — `delete menu?.a` produces `stateWrites: []` at semantic-graph, `SL writes: []`, and `diagnostics: []` in both passes; the optional delete is never collected, so the shipped `MARKLESS_STATE_OPTIONAL_CHAIN_WRITE` diagnostic is unreachable for real source.
  - Observed (c, control): plain `delete menu.a` collects and lowers correctly: `SL writes[0] = {"source":"menu.a","graphNodeId":"state:menu","path":["a"],"operation":"delete"}` with no diagnostics.
  - Existing tests: packages/compiler/test/state-lowering.test.ts:720 (optional `items?.push` via synthetic artifact ⇒ `MARKLESS_STATE_OPTIONAL_CHAIN_WRITE`, message `Cannot write to "items" through optional chaining because graph writes must have definite targets.`) and packages/compiler/test/state-lowering-delete.test.ts:54 (optional delete via synthetic artifact ⇒ same code) — rerun result: pass. Both prove the LOWERING handles optional writes; neither runs the collector on real optional-delete source.
- Spec check: specs/framework/03-state-graph.md §State lvalue meta-contract — surprising semantics (runtime short-circuit) ⇒ diagnostic; delete/optional forms are fixture-locked surface.
- Verdict: ERROR
- Rationale: Variant (b) is the finding: real-source optional deletes silently vanish — the state mutation neither lowers nor errors (rubric rule 4), while the synthetic-artifact test suite creates false confidence that the case is covered. The required diagnostic already EXISTS and has the right message; the collector just never produces the record that triggers it. Variant (a)'s parser throw is acceptable observed behavior for malformed syntax (T003 §4.3) but lacks the Markless diagnostic shape (no code/why/docsUrl).
- Required diagnostic:
  - Code: MARKLESS_STATE_OPTIONAL_CHAIN_WRITE (reuse — already shipped, currently unreachable for optional delete)
  - Severity: error — Phase: state-lowering
  - Title: Cannot write graph state through optional chaining (shipped title: "Cannot write graph state through optional chaining")
  - Message: Cannot write to `menu` through optional chaining because graph writes must have definite targets. (shipped wording, quoting the user's binding)
  - Why: Optional chaining can skip the mutation at runtime; the graph write artifact cannot preserve that short-circuit across resume. (shipped wording)
  - Suggestion(s): Delete through the definite path: `delete menu.a`, guarding with a plain `if (menu) { ... }` when needed.
  - docsUrl: https://markless.dev/errors/MARKLESS_STATE_OPTIONAL_CHAIN_WRITE
- Impl-note: collect-expressions — collect `delete <graph>?.<path>` (and optional member writes generally) with `optional: true` so the existing lowering diagnostic fires. For (a): `external-boundary` — wrap the @tsrx/core SyntaxError into the structured diagnostic shape at the compiler artifact boundary (message-quality only; never queue work in ../native-tsrx).
- Runtime follow-up: none.

### S1.14 — rest alias write: remaining path vs excluded path
- Snippet:
  ```tsrx
  const menu = state({ open: false, theme: 'light' });
  const { open, ...rest } = menu;
  <button onClick={() => { rest.theme = 'dark'; rest.open = true; }}>{rest.theme}</button>
  ```
- Probe layer: SL
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b1-probe.test.ts`
  - Observed: the alias is recorded with exclusions: `aliases[1] = {"name":"rest","target":"menu","excludedPaths":[["open"]],"declarationKind":"const"}`. The remaining-path write lowers to the source object: `SL writes[0] = {"source":"rest.theme","graphNodeId":"state:menu","path":["theme"],"operation":"assign","valueSource":"'dark'"}`. The excluded-path write errors: `MARKLESS_STATE_REST_ALIAS_EXCLUDED_PATH`, message `Cannot write to "rest.open" because "open" was excluded when "rest" was created.`, why `Object rest destructuring creates an alias for the remaining graph paths only...`, suggestion `Write through the original graph path, or use the explicit destructured alias for the excluded property.`.
  - Existing tests: packages/compiler/test/state-lowering.test.ts:646 and packages/compiler/test/semantic-alias-collector.test.ts:9 — rerun result: pass.
- Spec check: specs/framework/03-state-graph.md §Destructuring — "Rest/spread of a reactive source produces live forwarding fields rather than a value snapshot"; writes through aliases follow the meta-contract.
- Verdict: ALREADY-CORRECT
- Rationale: Both directions behave exactly as specced and are proven live: the rest alias forwards writes to `menu.theme` (live forwarding, not snapshot) and excluded paths fail loudly with a message that explains the exclusion in the user's own names.
- Required diagnostic: n/a.
- Impl-note: semantic-graph alias collector + state-lowering.
- Runtime follow-up: none.

### S1.15 — destructure with default from state object
- Snippet:
  ```tsrx
  const menu = state({ open: false });
  const { open = false } = menu;
  <p>{open}</p>
  ```
- Probe layer: SG
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b1-probe.test.ts`
  - Observed: `MARKLESS_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED`, severity `error`, phase `semantic-graph`, title `Graph destructuring defaults are not supported yet`, message `Cannot create graph alias "open" from "menu.open" with a default value.`, why `A destructuring default must run only when the property value is undefined. The current graph alias artifact can represent a graph path, but not a fallback expression without changing JavaScript semantics.`, suggestion `Use an explicit computed() for fallback logic, or read the graph path directly without a destructuring default.`; `aliases: []` (no partial alias is left behind). Note: the subsequent `{open}` template read lowers to nothing without its own diagnostic — acceptable only because the module already failed compilation.
  - Existing tests: packages/compiler/test/semantic-diagnostics.test.ts:595 and packages/compiler/test/semantic-alias-collector.test.ts:156 — rerun result: pass.
- Spec check: specs/framework/03-state-graph.md §Destructuring — alias bindings from reactive sources; the default-value form would change JavaScript semantics, matching the meta-contract's "surprising semantics" clause.
- Verdict: ALREADY-CORRECT
- Rationale: Honest capability boundary, loudly reported, with the semantics-preserving reason stated ("not supported yet" names it as capability, not policy) and a concrete rewrite.
- Required diagnostic: n/a.
- Impl-note: semantic-graph alias collector.
- Runtime follow-up: none.

### S1.16 — array mutation: push, sort(cmp), variable index write
- Snippet:
  ```tsrx
  const items = state([1]);
  <button onClick={() => { items.push(2); items.sort((left, right) => left - right); const i = 0; items[i] = 5; }}>{items.length}</button>
  ```
- Probe layer: SL
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b1-probe.test.ts`
  - Observed: method mutations lower as call writes with arguments preserved: `{"source":"items","graphNodeId":"state:items","path":[],"operation":"call","method":"push","argumentSources":["2"]}` and `{...,"method":"sort","argumentSources":["(left, right) => left - right"]}`; `items.length` lowers to `path:["length"]`. The variable index write errors: `MARKLESS_STATE_DYNAMIC_PATH_WRITE`, message `Cannot write to "items[i]" because graph write paths must be statically resolvable.` (suggestion names "a literal array index").
  - Existing tests: packages/compiler/test/semantic-expression-collector.test.ts:270 (dynamic computed method not lowered), :322 (static literal method lowered), :438 (optional collection calls marked) — rerun result: pass.
- Spec check: specs/framework/03-state-graph.md §Objects and collections — "`items.push(x)` are graph writes with path-level invalidation semantics".
- Verdict: ALREADY-CORRECT
- Rationale: The everyday mutations (push, comparator sort) lower with full fidelity including the comparator source, and the un-plannable variable index fails loudly per the meta-contract. Same const-literal caveat as S1.12: `i` is `const 0`, so constant folding is a possible future ALLOW-expansion; the suggestion already teaches the literal-index fix.
- Required diagnostic: n/a.
- Impl-note: semantic-graph expression collector + state-lowering.
- Runtime follow-up: none.

### S1.17 — clone-to-mutate: JSON round-trip and shallow spread
- Snippet:
  ```tsrx
  const menu = state({ open: false });
  const copy = JSON.parse(JSON.stringify(menu)); // sibling: const copy = { ...menu };
  <p onClick={() => { copy.open = true; }}>{copy.open}</p>
  ```
- Probe layer: SL + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b1-probe.test.ts`
  - Observed: BOTH variants fail compile with `MARKLESS_STATE_UNRESOLVED_WRITE`, message `Cannot write to "copy.open" because it does not resolve to graph state.` (full shipped shape as in S1.07). FC facts for the JSON variant: `captureAnalysis.extractedSymbols[0] = {"symbolId":"symbol:0","kind":"event-handler","source":"() => { copy.open = true; }"}` with `captureAnalysis.diagnostics: []`. Also observed: the clone reads (`JSON.stringify(menu)`, `{ ...menu }`) produce no read record and no diagnostic, and the `{copy.open}` template read produces no subscription and no diagnostic — a read-only clone compiles clean as a one-time snapshot.
- Spec check: specs/framework/03-state-graph.md §State lvalue meta-contract (unresolved write ⇒ diagnostic) and §Objects and collections (identity is part of the state graph contract — clones are new identities outside the graph).
- Verdict: ALREADY-CORRECT
- Rationale: The React-trained clone-then-mutate habit cannot silently disconnect: the write to the clone is a compile error. The read-only clone (rendering a snapshot) compiling clean is a legitimate reading. Message-quality note: for this shape the ideal suggestion would say the quiet part — "you don't need a clone; write `menu.open = true` directly, the graph tracks paths" — polish only.
- Required diagnostic: n/a (ships today).
- Impl-note: state-lowering write resolution. captureAnalysis accepting the `copy` capture without comment is unexercised here because compilation already failed — capture rules get their own scrutiny in B7 (S7.12).
- Runtime follow-up: BM-deferred-to-B8 (read-only clone variant: confirm snapshot renders and never updates; structuredClone sibling S8.07).
- B8 resolution (T015): RESOLVED — same crash class as S1.07's read-only sibling: the crazy-qa-b8-snapshot-reads.tsrx fixture renders `{copy.open}` and `{snap.open}` alongside `{obj.x}`; both CSR and SSR die on the first undeclared local (`ReferenceError: obj is not defined`) because clone declarations are dropped from the emitted modules while their reads are interpolated. A read-only clone does not render a snapshot today — it prevents the page from rendering at all. structuredClone sibling catalogued as S8.07 (Batch 8).

### S1.18 — identity comparison and swap of state bindings
- Snippet:
  ```tsrx
  let a = state({ n: 1 });
  let b = a;
  <button onClick={() => { if (a === b) { console.log('same'); } [a, b] = [b, a]; }}>{a === b ? 'same' : 'diff'}</button>
  ```
- Probe layer: SL + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b1-probe.test.ts`
  - Observed: `let b = a` creates NOTHING — `aliases: []`, no graph binding for `b`, no diagnostic. Handler reads of `b` are collected as stateRead sources but silently dropped by lowering (`SL reads` contains only `{"source":"a","graphNodeId":"state:a","path":[]}`). FC planned payload has no cell for `b` (only `state:a`, serialized with identity records `{"root":{"$ref":0},"records":[{"id":0,"type":"object","fields":[["n",1]]}]}`). The swap DOES error: `MARKLESS_STATE_UNRESOLVED_WRITE`, message `Cannot write to "[a, b]" because it does not resolve to graph state.`. The template expression `a === b ? 'same' : 'diff'` compiles with only `a` lowered.
- Spec check: specs/framework/03-state-graph.md §Destructuring (destructured aliases are compiler-known; whole-binding aliases are not mentioned — local spec silent, needs TSRX spec confirmation) and §Objects and collections (object identity is a graph contract).
- Verdict: ERROR
- Rationale: `let b = a` silently severs the graph: every later read of `b` and the `a === b` comparison fall outside the graph with no diagnostic (rubric rule 4 — silent wrong behavior). Ordinary JavaScript reasoning ("just alias the variable") produces a template that can render stale or semantically meaningless comparisons. The swap half already fails loudly (correct), which makes the silent alias half more surprising, not less. A possible richer end-state is compiler support for whole-binding aliases (the §Destructuring model generalized), but until a fixture proves that, silence must become a diagnostic.
- Required diagnostic:
  - Code: MARKLESS_STATE_BINDING_ALIAS_UNSUPPORTED (new)
  - Severity: error — Phase: semantic-graph
  - Title: Cannot copy a graph binding into a plain variable
  - Message: `let b = a` copies the graph binding `a` into a plain variable. Reads of `b` will not update when `a` changes, and `a === b` does not compare graph state.
  - Why: Graph state lives in compiler-known cells; a whole-binding copy has no cell, path, or subscription, so its reads and writes fall outside the resumable graph.
  - Suggestion(s): Read `a` directly; destructure the paths you need (`const { n } = a;`); or derive with `const b = computed(() => a);` when you want a linked value.
  - docsUrl: https://markless.dev/errors/MARKLESS_STATE_BINDING_ALIAS_UNSUPPORTED
- Impl-note: semantic-graph alias collector (collect-aliases handles destructuring patterns only; a plain identifier initializer from a graph binding is invisible). Alternative end-state: extend collect-aliases to record whole-binding aliases — choose via fixture when the backlog item is unblocked.
- Runtime follow-up: none (compile-time verdict; payload facts proven at FC).

### Batch 1 summary

| Scenario | Verdict | Probe kind | Backlog? |
| --- | --- | --- | --- |
| S1.01 | WARN | new-probe | yes (behavior fix + MARKLESS_STATE_RENDER_ONLY_READ) |
| S1.02 | ALLOW | new-probe | no |
| S1.03 | WARN | new-probe | yes (MARKLESS_STATE_INIT_FROM_STATE + payload snapshot bug) |
| S1.04 | ERROR | new-probe | yes (MARKLESS_STATE_NESTED_CREATION) |
| S1.05 | ALLOW | new-probe | no |
| S1.06 | ALLOW | new-probe | no |
| S1.07 | ALREADY-CORRECT | new-probe | no (message-quality note only) |
| S1.08 | ALREADY-CORRECT | new-probe | no (message-quality note only) |
| S1.09 | ERROR | new-probe | yes (MARKLESS_STATE_WRITE_IN_TEMPLATE) |
| S1.10 | ALREADY-CORRECT | both | no |
| S1.11 | ALREADY-CORRECT | both | no |
| S1.12 | ALREADY-CORRECT | both | no |
| S1.13 | ERROR | both | yes (collector gap: optional delete → existing OPTIONAL_CHAIN_WRITE; external-boundary wrap for parse throws) |
| S1.14 | ALREADY-CORRECT | both | no |
| S1.15 | ALREADY-CORRECT | both | no |
| S1.16 | ALREADY-CORRECT | both | no |
| S1.17 | ALREADY-CORRECT | new-probe | no (message-quality note only) |
| S1.18 | ERROR | new-probe | yes (MARKLESS_STATE_BINDING_ALIAS_UNSUPPORTED or whole-binding alias support) |

Verdict counts: ALLOW 3, ALREADY-CORRECT 9, WARN 2, ERROR 4.

## Batch 6 — Control flow & children

Run context (T006, 2026-07-04): compiler "Observed" values are verbatim from a temporary probe test
`packages/compiler/test/crazy-qa-b6-probe.test.ts` (one test per scenario calling the real
`buildSemanticGraph` / `lowerStateAccess` / `compileTsrxModule` entrypoints, deleted after the runs per
T003 §6), executed with `pnpm exec vp test packages/compiler/test/crazy-qa-b6-probe.test.ts` (15 tests
passed). Runtime "Observed" values are verbatim real-browser DOM captured by a temporary browser probe
`packages/vitest-browser/browser/crazy-qa-b6-probe.test.ts` plus six temporary fixtures
`packages/vitest-browser/browser/fixtures/crazy-qa-b6-*.tsrx` (all deleted after the runs), executed with
`pnpm exec vp test --project browser packages/vitest-browser/browser/crazy-qa-b6-probe.test.ts`
(final run: 5 tests passed with every assertion pinned to the observed DOM string; a first run printed the
facts through deliberate assertion failures). Re-verify entries reran the cited existing files:
`pnpm exec vp test packages/compiler/test/public-render-plan.test.ts packages/compiler/test/state-lowering.test.ts packages/compiler/test/semantic-graph.test.ts`
(3 files, 44 tests, all passed) and
`pnpm exec vp test --project browser packages/vitest-browser/browser/constructs-csr.test.ts packages/vitest-browser/browser/constructs-ssr.test.ts packages/vitest-browser/browser/render-csr.test.ts packages/vitest-browser/browser/render-ssr.test.ts`
(4 files, 36 passed + 2 `test.fails` known-red children-projection tests). TSRX MCP was unavailable this
session; spec checks cite the local split specs (fallback per AGENTS.md), and entries say so where the
local spec is silent. Browser probes were CSR-mode only; SSR/resume siblings of the runtime findings are
flagged BM-deferred-to-B8. All snippets assume `import { state } from '@markless/core';` inside
`export function App() @{ ... }` unless shown otherwise.

Batch-level structural finding (cited per entry below): `collectKeyedRepeat`
(packages/compiler/src/passes/semantic-graph/collect-repeat.ts:11-50) silently returns `null` — no
record, no diagnostic — whenever the `key` clause is missing or the key expression is not a static path
rooted at the item alias (`itemKeyPath` requires `segments[0] === itemName`). The public-render plan only
diagnoses repeats that HAVE records (gates), so every key-less/bad-key loop's entire content silently
disappears from emitted HTML with zero diagnostics, while recorded-but-unsupported repeats fail loudly.
Branch gating has the mirror-image hole: unsupported branch gates produce NO diagnostic at all (S6.15).

### S6.01 — identity-destroying key: `key Math.random()`
- Snippet:
  ```tsrx
  let rows = state([{ id: 1, label: 'one' }, { id: 2, label: 'two' }]);
  <ul>
    @for (const r of rows; key Math.random()) {
      <li>{r.label}</li>
    }
  </ul>
  ```
- Probe layer: SG + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b6-probe.test.ts`
  - Observed: `keyedRepeats: []` — the loop produces NO repeat record at all; `sgDiagnostics: []`, `slDiagnostics: []`, `repeatGates: []`, `planKeyedRepeats: 0`, `planDiagnostics: []`. The emitted SSR html expression is `... + "<ul>" + "</ul>"` — the entire list body is silently dropped from rendered output. On the "AST can provide a good experience" claim: the compiler currently knows NOTHING about this key expression — `Math.random()` appears in no artifact, and there is no stability analysis; the record is discarded before the key is stored because `itemKeyPath('r', 'Math.random()')` fails the item-root check.
- Spec check: specs/framework/01-tsrx-host-contract.md §Loop identity — "the `key` clause as the stable identity root for repeated local graph scopes"; a per-evaluation-random key cannot be a stable identity root. TSRX MCP unavailable; TSRX owns only the clause syntax (§TSRX Baseline), the identity semantics are this host's.
- Verdict: ERROR
- Rationale: Two failures, both silent (rubric rule 4). Ideal tier: no legitimate reading exists for a key that re-identifies every item on every evaluation — keyed identity is the root for per-item state, events, and DOM reuse across resume, and a random key severs all of it. Current tier: the loop content silently vanishes from the page with zero diagnostics because the unparseable key drops the record before any gate can fire. The AST proves instability trivially here (a call expression not derived from `r` or the index), so this is exactly the case the goal's AST-advantage claim covers — and today the AST fact is discarded.
- Required diagnostic:
  - Code: MARKLESS_REPEAT_KEY_UNSTABLE (new)
  - Severity: error — Phase: semantic-graph
  - Title: @for key must identify the item stably
  - Message: `key Math.random()` gives each row of `rows` a different identity every time it is evaluated. Row state, event wiring, and DOM reuse follow the key, so no row of `rows` could ever be matched with itself.
  - Why: The key is the stable identity root for a repeated graph scope across reorder, insert, delete, and resume; a value that is not derived from the item or its position cannot identify anything.
  - Suggestion(s): Key by a stable field of `r` — before: `@for (const r of rows; key Math.random())`, after: `@for (const r of rows; key r.id)` — or key by position with `@for (const r of rows; index i; key i)` when state should follow the slot.
  - docsUrl: https://markless.dev/errors/MARKLESS_REPEAT_KEY_UNSTABLE
- Impl-note: collect-repeat (packages/compiler/src/passes/semantic-graph/collect-repeat.ts) — `itemKeyPath` returning `null` must produce a diagnostic-carrying record instead of silently skipping the repeat; public-render gating then stays loud. Part of the batch-level silent-drop backlog item.
- Runtime follow-up: none (compile-time verdict; the silent drop is proven at FC).

### S6.02 — index-as-key: `index i; key i` (first-contact moment)
- Snippet:
  ```tsrx
  let rows = state([{ id: 1, label: 'one' }, { id: 2, label: 'two' }]);
  <ul>
    @for (const r of rows; index i; key i) {
      <li>{r.label}</li>
    }
  </ul>
  ```
- Probe layer: SG + FC (+ existing-fixture BM)
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b6-probe.test.ts`
  - Observed: identical silent drop to S6.01 — `keyedRepeats: []`, `sgDiagnostics: []`, `repeatGates: []`, `planKeyedRepeats: 0`, `planDiagnostics: []`, SSR emits `"<ul>" + "</ul>"` (empty list, nothing else). The spec-blessed positional-keying form renders NOTHING today. Control variant `@for (const r of rows; index i; key r.id)` in the same run produced the full record `{"id":"repeat:0","parentHostNodeId":"h0","itemName":"r","indexName":"i","collectionSource":"rows","collectionGraphNodeId":"state:rows","collectionPath":[],"keySource":"r.id","keyPath":["id"],"rowHostNodeId":"h1"}` with gate `{"repeatId":"repeat:0","supported":true}` — so the drop is specifically the key-is-index shape (`itemKeyPath('r', 'i')` fails the item-root check and discards the record).
  - Existing test (partial coverage): packages/vitest-browser/browser/fixtures/rows-index.tsrx uses `index i; key item.id` (index CLAUSE, not index-as-key); constructs-csr.test.ts:144 and constructs-ssr.test.ts:140 — rerun result: pass (rows render `['0Alpha','1Beta']`). No existing test covers `key i`.
- Spec check: specs/framework/01-tsrx-host-contract.md §Loop identity — unkeyed loops "must either provide a stable domain key or explicitly key by position (`index i; key i`) when state should follow the slot rather than the item". The spec names this exact syntax as the sanctioned positional opt-in.
- Verdict: WARN
- Rationale: Dual end-state, S1.01-style. Behavior half: `index i; key i` is spec-sanctioned syntax that today silently renders an empty list (rubric rule 4 — highest-priority class); the compiler must support positional keying. Diagnostic half: index-as-key is the default junior move (prep §4, first-contact moment) and it means something most juniors do not intend — identity follows the SLOT, so per-row state/DOM stays at position 0 when rows reorder, the classic React key-warning trap. That is probably-a-mistake-sometimes-intentional, the definition of WARN; the spec's own "when state should follow the slot" clause is the legitimate intentional use, so the diagnostic teaches the slot-vs-item distinction once and is suppressible per site. It must never fire as an error on the sanctioned form.
- Required diagnostic:
  - Code: MARKLESS_REPEAT_KEY_IS_INDEX (new)
  - Severity: warning — Phase: semantic-graph
  - Title: Keying by index makes row identity follow the position
  - Message: `key i` identifies each row of `rows` by its position, not by its data. If `rows` reorders, inserts, or deletes, any row-local state, event wiring, and DOM reuse stay with the slot number — row 0 stays row 0 even when a different item moves into it.
  - Why: The key is the identity root for a repeated graph scope; a positional key pins that scope to the slot, which is only correct when state genuinely belongs to the position.
  - Suggestion(s): Key by a stable field of the item when state belongs to the item — before: `@for (const r of rows; index i; key i)`, after: `@for (const r of rows; key r.id)`. Keep `key i` when state should follow the slot.
  - docsUrl: https://markless.dev/errors/MARKLESS_REPEAT_KEY_IS_INDEX
  - Escape hatch (WARN only): `// markless-allow MARKLESS_REPEAT_KEY_IS_INDEX: state follows the slot intentionally` on the `@for` header line silences exactly this site.
- Impl-note: collect-repeat — `itemKeyPath` must also accept the index alias as a key root (record it as positional identity) instead of discarding the record; the WARN rides the recorded key kind. Same owning module as S6.01.
- Runtime follow-up: BM-deferred-to-B8 (once `key i` renders at all, verify slot-identity semantics across a reorder in the browser).
- B8 resolution (T015): BLOCKED on backlog fix S6.02 (`index i; key i` still renders an empty list — the slot-identity reorder claim stays unobservable until positional keying renders at all).

### S6.03 — duplicate key values at runtime
- Snippet:
  ```tsrx
  let rows = state([
    { category: 'fruit', label: 'apple' },
    { category: 'fruit', label: 'pear' },
    { category: 'veg', label: 'kale' },
  ]);
  <ul>
    @for (const r of rows; key r.category) {
      <li class="row">{r.label}</li>
    }
  </ul>
  <button data-flip onClick={() => rows.reverse()}>Flip</button>
  ```
- Probe layer: SG + BM
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b6-probe.test.ts` (compile) and `pnpm exec vp test --project browser packages/vitest-browser/browser/crazy-qa-b6-probe.test.ts` (real chromium, temporary fixture crazy-qa-b6-dup-keys.tsrx)
  - Observed (compile): full record `{"id":"repeat:0",...,"keySource":"r.category","keyPath":["category"],...}`, `sgDiagnostics: []`, gate `supported: true`, `planDiagnostics: []` — key uniqueness is runtime data, invisible statically.
  - Observed (browser, CSR): initial render of THREE data rows produced TWO DOM rows: `<ul><li class="row">pear</li><li class="row">kale</li></ul>` — `apple` is silently dropped (the later duplicate `fruit` row replaced it). After clicking Flip (`rows.reverse()`): `<ul><li class="row">kale</li><li class="row">apple</li></ul>` — now `pear` is gone and `apple` appears. No error, no warning; which rows exist changes arbitrarily with iteration order.
- Spec check: specs/framework/01-tsrx-host-contract.md §Loop identity — one key = one "logical item" with one graph scope; two items sharing a key have no defined identity. Local spec is silent on the duplicate case specifically; needs TSRX spec confirmation (TSRX MCP unavailable this session).
- Verdict: ERROR
- Rationale: Silent data loss in rendered output (rubric rule 4): real data is rarely unique on convenient fields, and the current behavior is last-write-wins row replacement that reshuffles which records the user sees on every mutation. There is no legitimate reading of two rows with the same identity — the runtime must fail loud when it detects the collision (the compiler cannot: values are runtime data), naming the key path and the colliding value.
- Required diagnostic:
  - Code: MARKLESS_REPEAT_KEY_DUPLICATE (new)
  - Severity: error — Phase: runtime (repeat row materialization, initial render and flush)
  - Title: Two rows share the same @for key
  - Message: Two items of `rows` produced the same key `"fruit"` from `r.category`. Rows with the same key cannot be told apart, so one of them would silently replace the other.
  - Why: The key is each row's identity across reorder, insert, delete, and resume; duplicate identities make row state and DOM ownership ambiguous.
  - Suggestion(s): Key by a field that is unique per item (`key r.id`), or make the key compound where the data allows it. If the data has no unique field, key by position with `index i; key i`.
  - docsUrl: https://markless.dev/errors/MARKLESS_REPEAT_KEY_DUPLICATE
- Impl-note: runtime keyed-repeat row map (packages/web runtime repeat materialization keys rows by key value and currently overwrites on collision) plus the SSR repeat renderer — both sides must detect the collision. Compile side unchanged.
- Runtime follow-up: BM-deferred-to-B8 (SSR/resume sibling: what server HTML ships for duplicate keys and whether resume mismatches; CSR behavior proven this batch).
- B8 resolution (T015): RESOLVED — `pnpm exec vp test --project browser packages/vitest-browser/browser/crazy-qa-b8-probe.test.ts` (temporary fixture crazy-qa-b8-dup-keys.tsrx, same shape): the SERVER ships all THREE rows (`<li class="row">apple</li><li class="row">pear</li><li class="row">kale</li>`) while CSR rendered two (B6 fact) — a served-vs-mounted divergence on the same data. Resume does not mismatch, but clicking Flip (`rows.reverse()`) after resume leaves the DOM byte-identical with zero errors — the duplicate-key list is silently frozen on the SSR/resume path.

### S6.04 — `@for` with no key clause at all
- Snippet:
  ```tsrx
  let rows = state([{ id: 1, label: 'one' }]);
  <ul>
    @for (const r of rows) {
      <li>{r.label}</li>
    }
  </ul>
  ```
- Probe layer: SG + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b6-probe.test.ts`
  - Observed: does NOT throw — the external @tsrx/core parser accepts a key-less `@for` (no parse-phase caveat needed). Then the same silent drop as S6.01: `keyedRepeats: []`, `sgDiagnostics: []`, `templateReads: ["r.label"]` (the body IS walked), `repeatGates: []`, `planDiagnostics: []`, and the SSR html expression is `... + "<ul>" + "</ul>"` — the entire unkeyed list silently disappears from rendered output with zero diagnostics.
- Spec check: specs/framework/01-tsrx-host-contract.md §Loop identity — "Unkeyed `@for` is positional. That is acceptable for static/stateless output, but any loop body that creates resumable graph identity must either provide a stable domain key or explicitly key by position... The compiler should diagnose interactive or stateful unkeyed loops and point at the `@for` header."
- Verdict: ERROR
- Rationale: The spec mandates a diagnostic for exactly this case (the loop reads reactive `rows`, so rows can reorder and the body's text bindings are graph-backed identity), and it names the required fix wording. Today the omission is punished by silently rendering nothing (rubric rule 4) — worse than both specified outcomes (positional render for static output, diagnostic for stateful loops). The ideal end-state is two-tier per spec: diagnose graph-backed unkeyed loops as below; let genuinely static unkeyed loops render positionally (that half is a capability backlog item, not a diagnostic).
- Required diagnostic:
  - Code: MARKLESS_REPEAT_KEY_REQUIRED (new)
  - Severity: error — Phase: semantic-graph (span on the `@for` header, per spec)
  - Title: This @for needs a key
  - Message: `@for (const r of rows)` repeats reactive state without a key. When `rows` changes, the rows of this list have no identity to update, reorder, or resume by.
  - Why: A keyed loop item keeps its state, events, and DOM attached to the same logical item across reorder, insert, and delete; without a key there is no stable identity root.
  - Suggestion(s): Add a stable domain key — after: `@for (const r of rows; key r.id)` — or key by position with `@for (const r of rows; index i; key i)` when state should follow the slot.
  - docsUrl: https://markless.dev/errors/MARKLESS_REPEAT_KEY_REQUIRED
- Impl-note: collect-repeat (`keyNode` missing currently returns `null` silently at collect-repeat.ts:17); same silent-drop backlog family as S6.01/S6.02. The positional-render-for-static-output half belongs to the public-render plan.
- Runtime follow-up: none (compile-time verdict; the silent drop is proven at FC).

### S6.05 — non-iterable collection: `@for` over `state(undefined)`
- Snippet:
  ```tsrx
  let rows = state(undefined);
  <ul>
    @for (const item of rows; key item.id) {
      <li class="row">{item.name}</li>
    } @empty {
      <li class="empty">No items yet</li>
    }
  </ul>
  <button data-load onClick={() => rows = [{ id: 'a', name: 'Alpha' }]}>Load</button>
  ```
- Probe layer: SG + BM
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b6-probe.test.ts` (compile) and `pnpm exec vp test --project browser packages/vitest-browser/browser/crazy-qa-b6-probe.test.ts` (real chromium, temporary fixtures crazy-qa-b6-undef-rows.tsrx + control crazy-qa-b6-empty-rows-load.tsrx)
  - Observed (compile): clean — full repeat record, gate `supported: true`, `sgDiagnostics: []`, and the payload plans the missing value explicitly: `protocolStateCells[0].value = {"version":1,"root":{"$type":"undefined"},"records":[]}`.
  - Observed (browser, CSR): initial render does NOT crash — it shows the `@empty` branch: `<ul><li class="empty">No items yet</li></ul>` (undefined treated as empty; good). BUT after clicking Load (`rows = [{ id: 'a', name: 'Alpha' }]`) the DOM is UNCHANGED: still `<li class="empty">No items yet</li>` — the loaded data never renders, silently. Control run with `let rows = state([])` and the identical buttons: Load → `<li class="row">Alpha</li>`; then `rows.push({ id: 'b', name: 'Beta' })` → `Alpha` + `Beta` rows — both whole-binding reassignment and push update correctly from an array start. The list is permanently dead only when the state STARTS undefined.
  - Existing test (partial coverage): packages/vitest-browser/browser/fixtures/rows-empty.tsrx (empty-array start, no collection mutation) via constructs-csr.test.ts:136 and constructs-ssr.test.ts:132 — rerun result: pass.
- Spec check: specs/framework/03-state-graph.md §Implementation ("Dynamic values are still validated at runtime serialization") and specs/framework/01-tsrx-host-contract.md §TSRX Baseline (`@for` + `@empty` are TSRX-owned shapes). Local spec is silent on non-iterable collections; needs TSRX spec confirmation (TSRX MCP unavailable this session).
- Verdict: WARN
- Rationale: The authored pattern is legitimate and common (API data arrives late), and half the story is right: undefined renders the `@empty` branch instead of crashing. The finding is the other half: an undefined START silently and permanently disables the list — data assigned later never renders while the identical writes work from `state([])` (rubric rule 4; behavior-bug backlog like S1.03's payload half). WARN, not ERROR, because `state(undefined)` collections have a clearly intended reading the framework already half-supports; the compiler can see the statically-undefined initializer and teach the reliable form until the runtime wiring is fixed.
- Required diagnostic:
  - Code: MARKLESS_REPEAT_COLLECTION_UNINITIALIZED (new)
  - Severity: warning — Phase: semantic-graph
  - Title: @for repeats state that starts with no collection
  - Message: `rows` starts as `undefined` but `@for (const item of rows; ...)` repeats it. The list renders its `@empty` content until `rows` holds an array.
  - Why: The repeat subscribes to the collection cell at initial render; a collection that starts without a value renders empty and must re-materialize when the array arrives.
  - Suggestion(s): Start with an empty array — before: `let rows = state(undefined);`, after: `let rows = state([]);` — the `@empty` block still renders until data arrives.
  - docsUrl: https://markless.dev/errors/MARKLESS_REPEAT_COLLECTION_UNINITIALIZED
  - Escape hatch (WARN only): `// markless-allow MARKLESS_REPEAT_COLLECTION_UNINITIALIZED: undefined means not-yet-loaded here` on the declaration line.
- Impl-note: two owning sites — (1) the browser runtime repeat wiring (packages/web): a repeat whose collection resolves undefined at first materialization never wakes again; this behavior fix is the primary backlog item, after which the WARN may relax; (2) collect-state/collect-repeat for the statically-visible `state(undefined)`/`state()` initializer WARN.
- Runtime follow-up: BM-deferred-to-B8 (SSR/resume sibling of the dead-list bug; CSR proven this batch).
- B8 resolution (T015): RESOLVED — SSR sibling confirmed (temporary fixture crazy-qa-b8-undef-rows.tsrx): server serves `<li class="empty">No items yet</li>`; after resume, clicking Load (`rows = [{ id: 'a', name: 'Alpha' }]`) leaves the DOM unchanged (`<li class="empty">No items yet</li>`) with zero errors — the undefined-started list is permanently dead on the SSR/resume path too.

### S6.06 — nested `@for` reusing the same alias name
- Snippet:
  ```tsrx
  let groups = state([{ id: 'g1', label: 'Group', items: [{ id: 'i1', label: 'Item' }] }]);
  <ul>
    @for (const r of groups; key r.id) {
      <li>
        {r.label}
        <ul>
          @for (const r of r.items; key r.id) { <li>{r.label}</li> }
        </ul>
      </li>
    }
  </ul>
  ```
- Probe layer: SG + SL + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b6-probe.test.ts`
  - Observed: both loops record with the SAME `itemName: "r"`: outer `{"id":"repeat:0",...,"collectionSource":"groups","collectionGraphNodeId":"state:groups",...}`, inner `{"id":"repeat:1","parentHostNodeId":"h2","itemName":"r","collectionSource":"r.items","collectionPath":[],"keySource":"r.id","keyPath":["id"],"rowHostNodeId":"h3"}` — the inner record has NO `collectionGraphNodeId` (the alias-shadowed `r.items` does not resolve) and the two `templateReads` are the indistinguishable pair `["r.label","r.label"]`. `sgDiagnostics: []`, `slDiagnostics: []`. The render plan fails LOUD: gate `{"repeatId":"repeat:0","supported":false,"reason":"nested-repeat-unsupported"}` and `planDiagnostics[0]` = `MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT`, severity `error`, title `@for is not rendered by the public render path yet`, message `The @for rows are not compiler-proven (reason: nested-repeat-unsupported), so the render module drops the list content.`, why `The public render module only emits compiler-proven output. Content inside an unsupported construct would silently disappear from rendered HTML, so the compiler reports it instead.`, suggestion `Reshape the rows into a single host element with directly readable item bindings.`, docsUrl `https://markless.dev/errors/MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT`.
- Spec check: specs/framework/01-tsrx-host-contract.md §TSRX Baseline — lexical scope inside control-flow blocks is TSRX-owned, so shadowing is legal authoring; §Loop identity for the per-scope identity model. Local spec is silent on nested-repeat support status; the diagnostic itself declares it a capability boundary.
- Verdict: ALREADY-CORRECT
- Rationale: Nested repeats are an honest, loudly-reported capability boundary (S1.15 precedent): the diagnostic states the consequence, the why, a fix direction, and a docs link, and nothing silently misbehaves. The shadowing question is therefore moot today — but the artifacts show it will NOT be moot later: both records carry `itemName: "r"`, the inner collection loses its graph resolution, and the two `r.label` reads are textually identical. Impl-note carries that forward.
- Required diagnostic: n/a (ships today). Message-quality note: for a nested list the suggestion "Reshape the rows into a single host element" does not name the actual boundary (one level of `@for` for now); polish only.
- Impl-note: public-render plan repeat gating (loud today). For the future nested-repeat implementation: semantic-graph repeat/expression records need scope-qualified item identity (which `r` is which) before nested rows can lower; collect-repeat currently resolves the inner collection against graph bindings only, so the alias-shadowed `r.items` arrives unresolved.
- Runtime follow-up: none.

### S6.07 — assignment in condition: `@if (open = true)`
- Snippet:
  ```tsrx
  let open = state(false);
  <section>
    @if (open = true) { <p>Always?</p> }
  </section>
  ```
- Probe layer: SG + SL + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b6-probe.test.ts`
  - Observed: does NOT throw — the external @tsrx/core parser accepts it (no parse-phase caveat). Compiles with ZERO diagnostics in every pass. `branchSites[0] = {"id":"branch-site:0","kind":"if","armCount":1,"testSource":"open = true","anchorOrder":0}`; `stateWrites: []` and `stateReads: []` — the write inside the branch test is never collected, and no read subscription is collected either (`branchArms[0].testRead: null`, contrast S6.08 where `testRead` is `{"graphNodeId":"state:tab","path":[]}`). The branch gate says `supported: true`. The SSR emit pastes the test source into a ternary unparenthesized: `... + (open = true ? marklessSsrBranchArm(...) + ... "<p>" + "Always?" + "</p>" : marklessSsrBranchArm(...)) + ...` — by JavaScript precedence that is `open = (true ? armA : armB)`, so at initial render the emitted code assigns the arm-A HTML STRING to the local `open` snapshot variable. The graph cell `state:open` still holds `false` in the payload while the page shows the arm.
- Spec check: specs/framework/03-state-graph.md §No effects, no tasks — a branch test is a demand-driven DOM read; a write inside it is the self-waking-effect class. specs/framework/03-state-graph.md §State lvalue meta-contract — surprising semantics ⇒ diagnostic.
- Verdict: ERROR
- Rationale: The classic `=` for `===` typo is triple-silent-wrong today (rubric rule 4): the graph write is dropped (never collected), the branch loses its read subscription (testRead null — it can never re-evaluate), and the emitted code executes the assignment with DIFFERENT precedence semantics than the author's source (a local gets an HTML string). No legitimate reading exists: a write inside a branch test would re-trigger the DOM update evaluating it — the same self-waking cycle as S1.09, so this reuses that entry's proposed code rather than minting a new one.
- Required diagnostic:
  - Code: MARKLESS_STATE_WRITE_IN_TEMPLATE (reuse — proposed in S1.09; a branch test is a template expression)
  - Severity: error — Phase: semantic-graph
  - Title: Cannot write state inside a template expression
  - Message: `@if (open = true)` assigns to `open` while deciding which branch to render. A branch test is a read; writing `open` there would re-trigger the very update that is evaluating it. If you meant a comparison, write `===`.
  - Why: DOM updates are the only effects in the demand-driven graph; a write inside a branch test creates a self-waking cycle that cannot resume.
  - Suggestion(s): Compare instead of assigning — before: `@if (open = true)`, after: `@if (open === true)` (or simply `@if (open)`). Move real writes to an event site.
  - docsUrl: https://markless.dev/errors/MARKLESS_STATE_WRITE_IN_TEMPLATE
- Impl-note: collect-branches records `testSource` verbatim without walking the test expression (no write/read collection — collect-expressions never visits branch tests with writes); state-lowering therefore never sees the write. Separate emit-hardening note: the public-render SSR/CSR emit must parenthesize the branch test (`(open = true) ? ...`) — today the pasted source changes meaning under JS precedence for ANY non-atomic test expression.
- Runtime follow-up: none (compile-time verdict; the wrong emit is proven at FC).

### S6.08 — `@switch` with no `@default` and a non-matching value
- Snippet:
  ```tsrx
  let tab = state('zzz');
  <section>
    <button data-to-a onClick={() => tab = 'a'}>A</button>
    <button data-away onClick={() => tab = 'zzz'}>Z</button>
    @switch (tab) {
      @case 'a': { <p class="arm-a">Arm A</p> }
    }
  </section>
  ```
- Probe layer: SG + FC + BM
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b6-probe.test.ts` (compile) and `pnpm exec vp test --project browser packages/vitest-browser/browser/crazy-qa-b6-probe.test.ts` (real chromium, temporary fixture crazy-qa-b6-switch-nomatch.tsrx)
  - Observed (compile): `branchSites[0] = {"id":"branch-site:0","kind":"switch","armCount":1,"testSource":"tab","anchorOrder":0}`; gate `supported: true`; `branchArms[0]` carries `testRead: {"graphNodeId":"state:tab","path":[]}`, `arms: [[{"text":"<p class=\"arm-a\">Arm A</p>"}]]`, `armTests: ["a"]`. The SSR emit has an explicit empty no-match fallback: `((marklessSwitchValue) => (marklessSwitchValue === ('a') ? ... "<p class=\"arm-a\">" + "Arm A" + "</p>" : ""))(tab)`.
  - Observed (browser, CSR): initial no-match renders empty between the branch anchors (`<!--markless:branch:branch-site:0--><!--/markless:branch:branch-site:0-->`); click A → `<p class="arm-a">Arm A</p>` appears inside the anchors; click Z (back to `'zzz'`) → the arm is removed again. Full round trip correct, no errors.
  - Existing tests (partial coverage): packages/compiler/test/semantic-graph.test.ts:534 (@switch branch scopes) — rerun result: pass; packages/vitest-browser/browser/constructs-csr.test.ts:98 and constructs-ssr.test.ts:94 (@switch WITH @default) — rerun result: pass. No existing test covered the no-match case; the browser facts above are from the temporary probe.
- Spec check: specs/framework/01-tsrx-host-contract.md §TSRX Baseline — `@switch` shape is TSRX-owned; §Conditional identity — removed arms dispose branch-local scope. Rendering nothing for no-match matches JavaScript `switch` fall-through-to-nothing semantics.
- Verdict: ALLOW
- Rationale: Partial switches are normal authoring and the positive facts prove correct handling end to end: an explicit `""` no-match fallback in the emitted SSR expression, a recorded `testRead` subscription, and a real-browser no-match → match → no-match round trip. No diagnostic is warranted — an exhaustiveness requirement would fight ordinary TypeScript habits. Non-blocking note for T900: the no-match round trip deserves a permanent fixture test (currently proven only by this batch's temporary probe).
- Required diagnostic: n/a.
- Impl-note: none.
- Runtime follow-up: BM-deferred-to-B8 (SSR/resume sibling: server-rendered no-match then first-click resume; CSR proven this batch).
- B8 resolution (T015): RESOLVED — SSR sibling correct (temporary fixture crazy-qa-b8-switch-nomatch.tsrx): server renders empty branch anchors (`<!--markless:branch:branch-site:0--><!--/markless:branch:branch-site:0-->`) for the no-match value; first resumed click shows `Arm A`; a second click back to the non-matching value removes it — full no-match → match → no-match round trip after resume, no errors. The ALLOW verdict now has both render-path proofs.

### S6.09 — React-style children inspection (`children.length`, `children.map`)
- Snippet:
  ```tsrx
  export function Card({ children }) @{
    const count = children.length;
    <section data-count={count}>{children}</section>
  }
  ```
- Probe layer: FC
- Probe kind: re-verify
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b6-probe.test.ts`
  - Observed: `planDiagnostics[0]` = code `MARKLESS_CHILDREN_OPAQUE`, severity `error`, phase `public-render`, title `children cannot be inspected or transformed`, message `children is an opaque template projection: place it with {children}, wrap it, or pass it through — mapping, counting, indexing, or mutating it is not supported.`, why `The compiler owns children projection; there is no render-output array to inspect, so React-style children access would silently misbehave.`, suggestion `Render {children} directly or move per-item rendering to the parent.`, docsUrl `https://markless.dev/errors/MARKLESS_CHILDREN_OPAQUE`.
  - Existing tests: packages/compiler/test/public-render-plan.test.ts:372 (children.map), :401 (children.length), :417 (plain `{children}` placement stays undiagnosed) — rerun result: pass (file rerun in the 3-file re-verify command, 44 tests).
- Spec check: specs/framework/01-tsrx-host-contract.md §Children and projection — "it cannot inspect, map, clone, diff, count, or mutate the child structure", including the spec's own draft diagnostic text, which the shipped message matches and improves.
- Verdict: ALREADY-CORRECT
- Rationale: The React habit is caught exactly as the spec demands, loudly, with consequence → why → fix → link quoting `children` (the user's own binding), and plain placement is proven undiagnosed by an existing test. Adjacent caveat recorded for honesty (not this verdict): runtime projection of ELEMENT children is known-red by design deferral — packages/vitest-browser/browser/constructs-csr.test.ts:239 and constructs-ssr.test.ts:241 are `test.fails` entries ("hosts inside projected element children keep caller-coordinate locators... resume throws Mismatched resume locator", deferred projection-metadata design). Both reran as expected-fail this batch.
- Required diagnostic: n/a (ships today).
- Impl-note: public-render plan (packages/compiler/src/passes/public-render/diagnostics.ts:37).
- Runtime follow-up: none for the diagnostic; the deferred projection-metadata design is already tracked by the known-red tests.

### S6.10 — state binding passed as a child component prop
- Snippet:
  ```tsrx
  import { Child } from './child.tsrx';
  export function App() @{
    let count = state(0);
    <main>
      <Child value={count} />
      <button data-inc onClick={() => count++}>+</button>
    </main>
  }
  ```
- Probe layer: SG + SL + FC (+ existing-fixture BM)
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b6-probe.test.ts`
  - Observed (imported child): `componentEdges[0].props[0] = {"name":"value","source":"count","kind":"graph-reference","graphNodeId":"state:count","graphBindingKind":"state","path":[],...}` — the prop is recorded as a live graph reference, not a value snapshot. The SSR emit carries it into composition: `await marklessSsrRenderChild(marklessSsrChildren, __marklessSsrComponent0, { value: count }, { hostPrefix: "c0:", symbolPrefix: "c0:", ..., graphProps: [{"name":"value","graphNodeId":"state:count","path":[]}] })`. Child-side, the prop read lowers through the graph: `slReads` contains `{"source":"value","graphNodeId":"prop:props","path":["value"]}`. All diagnostic arrays `[]`.
  - Observed (same-module sibling, silent-wrong finding): when `Child` is declared in the SAME module as `App`, the edge is still recorded but the emitted SSR html for App is `"<main>" + ...button... + "</main>"` — the `<Child value={count} />` element is DROPPED from the output entirely with `planDiagnostics: []`. Only imported children compose; same-module children silently vanish (S4.08's render-helper family will meet this again; recorded here because the run showed it).
  - Existing tests (partial coverage): packages/vitest-browser/browser/fixtures/dashboard.tsrx (`<StatusBadge active={streaming} />` — imported child, graph prop, prop-driven @if) via constructs-csr.test.ts:258 ("a child component @if driven by a parent prop flips on click") and constructs-ssr.test.ts:268 — rerun result: pass, in a real browser. packages/compiler/test/state-lowering.test.ts:828 (prop reads lower, prop writes read-only) — rerun result: pass.
- Spec check: specs/framework/01-tsrx-host-contract.md §Children and projection ("A parent that renders {children} owns only the projection site, not the child graph") and specs/framework/03-state-graph.md §Scoping model — the prop is a graph edge, not a copied value.
- Verdict: ALLOW
- Rationale: The pervasive state-plumbing idiom is handled with positive artifact proof (graph-reference prop record + `graphProps` in the composition call + child-side graph-lowered read) AND real-browser reactivity proof via the rerun dashboard tests. Rubric rule 3: never warn on the dominant idiom. The same-module drop observed alongside is a separate silent-wrong finding — carried as a backlog candidate on this entry (either compose same-module children or emit the existing MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT loudly), not a strike against the scenario's own verdict.
- Required diagnostic: n/a for the scenario. For the same-module sibling: reuse MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT (severity error, phase public-render) so the dropped child is loud until same-module composition is supported.
- Impl-note: component composition lives in public-render module emit (component-factories.ts resolves imported components only; same-module component references fall through silently). Backlog candidate for the sibling finding.
- Runtime follow-up: BM-deferred-to-B8 (child re-render granularity claims beyond the dashboard fixture's prop-driven branch).
- B8 resolution (T015): UNOBSERVABLE WITHOUT HARNESS WORK — finer-than-branch re-render granularity needs render/update-count instrumentation the browser harness does not expose (no probe API for which records re-fired), and adding one would be config/source work outside this tranche. The prop-driven branch reactivity remains proven by the dashboard fixture reruns cited above.

### S6.11 — child mutates its props: `props.value = 5`
- Snippet:
  ```tsrx
  export function Child(props) @{
    <p onClick={() => { props.value = 5; }}>{props.value}</p>
  }
  ```
- Probe layer: SL
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b6-probe.test.ts`
  - Observed: `slDiagnostics[0]` = code `MARKLESS_STATE_READ_ONLY_WRITE`, severity `error`, phase `state-lowering`, title `Cannot write to a read-only graph binding`, message `Cannot write to "props.value" because prop bindings are read-only.`, why `Props are owned by the parent graph projection. Mutating a child prop binding would create resume state that has no stable owner.`, suggestion `Write to state owned by the parent graph, or pass an event handler/shared graph method that performs the update at the owner.`, docsUrl `https://markless.dev/errors/MARKLESS_STATE_READ_ONLY_WRITE`. The read still lowers (`{"source":"props.value","graphNodeId":"prop:props","path":["value"]}`) and `slWrites: []` — no phantom write record.
  - Existing test: packages/compiler/test/state-lowering.test.ts:828 (destructured-prop alias variant, `label = 'Updated'`) — rerun result: pass. This probe adds the identifier-props variant (`props.value`); both shapes hit the same diagnostic.
- Spec check: specs/framework/03-state-graph.md §State lvalue meta-contract — read-only target ⇒ diagnostic; §Scoping model — updates belong to the graph owner.
- Verdict: ALREADY-CORRECT
- Rationale: Exactly the specced outcome for the React props-mutation habit, in both authoring shapes (identifier props and destructured alias), with a message that names the ownership model and the two real fixes, quoting `props.value`.
- Required diagnostic: n/a (ships today).
- Impl-note: state-lowering, write resolution over prop bindings.
- Runtime follow-up: none.

### S6.12 — component with an early return before the template
- Snippet:
  ```tsrx
  export function Empty() @{
    const ok = false;
    if (!ok) return;
    <p class="late">hi</p>
  }
  ```
- Probe layer: SG + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b6-probe.test.ts`
  - Observed: compiles CLEAN — `sgDiagnostics: []`, `planDiagnostics: []`; `components: [{"name":"Empty"}]`, `hostNodes: [{"id":"h0","tagName":"p"}]`, `rootTemplateHtml: "<p class=\"late\">hi</p>"`. The emitted SSR render function contains NO trace of `ok` or the return: `const html = marklessSsrHost(...) + "<p class=\"late\">" + "hi" + "</p>";` unconditionally. Plain JavaScript says this function returns before the template (renders nothing); the compiled component ALWAYS renders it — the guard is silently deleted and its meaning inverted.
- Spec check: specs/framework/01-tsrx-host-contract.md §Conditional identity — conditional rendering is expressed as `@if` branch scopes; statement-level control flow has no branch-anchor representation. AGENTS.md core constraint: "Component bodies execute during initial render" (the guard should at minimum execute). Local spec is silent on early returns specifically; needs TSRX spec confirmation (TSRX MCP unavailable this session).
- Verdict: ERROR
- Rationale: Silent wrong behavior with the author's intent inverted (rubric rule 4): the guard-clause habit means "render nothing unless ok", and the compiled output renders always, with zero diagnostics. There is no legitimate reading the current output preserves — statement-flow conditional rendering cannot be represented as resumable branch anchors, so the compiler must say so and name the `@if` rewrite, rather than deleting the statement (same body-statement-deletion root cause the Judge escalated on S1.01).
- Required diagnostic:
  - Code: MARKLESS_COMPONENT_EARLY_RETURN (new)
  - Severity: error — Phase: semantic-graph
  - Title: A component cannot return before its template
  - Message: `Empty` returns before `<p class="late">` when `!ok`. The template is not statement flow, so an early return cannot decide whether it renders — as compiled today the template would render regardless of the return.
  - Why: Conditional rendering must be a branch scope with resumable anchors; a return statement leaves no anchor for resume to insert or remove content by.
  - Suggestion(s): Express the condition as a branch — before: `if (!ok) return; <p class="late">hi</p>`, after: `@if (ok) { <p class="late">hi</p> }`.
  - docsUrl: https://markless.dev/errors/MARKLESS_COMPONENT_EARLY_RETURN
- Impl-note: semantic-graph component walk (collect-components/index walk) ignores return statements entirely; tied to the S1.01 body-statement escalation — whichever way body-statement semantics land, a pre-template `return` must become a diagnostic, not a deletion.
- Runtime follow-up: none (compile-time verdict; the inverted emit is proven at FC).

### S6.13 — `state()` created inside a keyed `@for` row
- Snippet:
  ```tsrx
  let rows = state([{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }]);
  <ul>
    @for (const r of rows; key r.id) {
      let expanded = state(false);
      <li onClick={() => expanded = !expanded}>{expanded ? 'open' : 'closed'}{r.label}</li>
    }
  </ul>
  ```
- Probe layer: SG + SL + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b6-probe.test.ts`
  - Observed: `expanded` becomes ONE flat graph cell with no row scope: `graphBindings[1] = {"id":"state:expanded","name":"expanded","kind":"state","declarationKind":"let","writable":true,"valueKind":"scalar","initialValue":false}` (no repeat-scope field), and the payload plans ONE shared cell for all rows: `protocolStateCells[1] = {"graphNodeId":"state:expanded",...,"value":{"version":1,"root":false,"records":[]}}`. The handler write lowers globally: `slWrites[0] = {"source":"expanded","graphNodeId":"state:expanded","path":[],"operation":"assign","valueSource":"!expanded"}`. No pass diagnoses the per-row creation; the module fails loudly only at the render plan for a DIFFERENT reason: gate `{"repeatId":"repeat:0","supported":false,"reason":"single-row-root-required"}` (the row body is a statement + an element) with `planDiagnostics[0]` = `MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT`, message `The @for rows are not compiler-proven (reason: single-row-root-required), so the render module drops the list content.`, suggestion `Reshape the rows into a single host element with directly readable item bindings.`.
- Spec check: specs/framework/01-tsrx-host-contract.md §Loop identity — "A keyed loop item keeps its component instances, local `state()`, `computed()` nodes... attached to the same logical item across reorder, insert, and delete" — per-item local state is spec-promised. specs/framework/03-state-graph.md §Scoping model — components/scopes create local graph scopes.
- Verdict: ERROR
- Rationale: Per-item row state is a spec-promised capability the graph model does not have yet, and today's artifacts actively mis-model it: one shared `state:expanded` cell for every row, a globally-lowered write, and a payload that could never distinguish rows. Compilation does fail loudly, but for an unrelated structural reason whose suggestion ("reshape the rows into a single host element") would have the author delete their state, not fix it. Until per-item scopes land, `state()` in a keyed row needs its own honest capability diagnostic; when they land, this entry's ideal upgrades to ALLOW.
- Required diagnostic:
  - Code: MARKLESS_STATE_REPEAT_ROW_SCOPE_UNSUPPORTED (new)
  - Severity: error — Phase: semantic-graph
  - Title: Per-row state() is not supported yet
  - Message: `expanded` is created by `state()` inside `@for (const r of rows; key r.id)`. Each keyed row needs its own `expanded`, but the graph currently gives every row the same single cell.
  - Why: A keyed loop item owns a per-item graph scope; a state cell shared by all rows would make one row's write open every row after resume.
  - Suggestion(s): Keep the state in the parent keyed by the row id — before: `let expanded = state(false);` inside the row, after: `let expandedIds = state({});` in the component body with `onClick={() => expandedIds[r.id] = !expandedIds[r.id]}` — until per-row state ships.
  - docsUrl: https://markless.dev/errors/MARKLESS_STATE_REPEAT_ROW_SCOPE_UNSUPPORTED
- Impl-note: collect-state records repeat-body `state()` calls with no `keyedRepeatScopeIds` context (bindings have no scope field at all); payload arena plans it as one flat cell. The full fix is the per-item scope model from spec 01; the diagnostic is the honest boundary until then. Note the suggested workaround writes `expandedIds[r.id]`, a dynamic path — S1.12 shows dynamic paths error today, so the interim suggestion depends on the repeat-item context work; the diagnostic text should track what actually compiles when implemented.
- Runtime follow-up: none (the render plan already refuses the shape; nothing runs).

### S6.14 — recursive component: `Tree` rendering `<Tree />`
- Snippet:
  ```tsrx
  export function Tree({ node }) @{
    <li>
      {node.name}
      <ul>
        @for (const c of node.children; key c.id) { <Tree node={c} /> }
      </ul>
    </li>
  }
  ```
- Probe layer: FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b6-probe.test.ts`
  - Observed: compiles and TERMINATES (no recursion blow-up — positive fact): self-edge recorded `componentEdges[0] = {"id":"component-edge:0","parentComponentName":"Tree","childComponentName":"Tree",...,"props":[{"name":"node","source":"c","kind":"opaque",...}],"keyedRepeatScopeIds":["repeat:0"]}`; the repeat record resolves the collection through props: `{"id":"repeat:0",...,"collectionSource":"node.children","collectionGraphNodeId":"prop:props","collectionPath":["node","children"],"keySource":"c.id","keyPath":["id"]}`. `sgDiagnostics: []`. The render plan fails LOUD: gate `{"repeatId":"repeat:0","supported":false,"reason":"unsupported-row-binding"}` with `planDiagnostics[0]` = `MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT`, message `The @for rows are not compiler-proven (reason: unsupported-row-binding), so the render module drops the list content.`, suggestion `Reshape the rows into a single host element with directly readable item bindings.`.
- Spec check: specs/framework/01-tsrx-host-contract.md §Loop identity — "If a child component or element supplies its own key, that authored key becomes the child identity within the keyed loop item" — component rows inside keyed loops are a specced concept; §TSRX Baseline — components as ordinary functions (recursion is ordinary).
- Verdict: ERROR (impl-note: message-quality fix only; the rejection itself is an honest capability boundary)
- Rationale: Recursion per se is handled sanely (terminating compile, correct self-edge with repeat scope, prop classified opaque). The loud repeat rejection is honest — but for THIS shape the shipped suggestion fails the fix bar: "Reshape the rows into a single host element with directly readable item bindings" tells the author of `<Tree node={c} />` — the #1 list idiom and the only way to write a tree — to delete their component. Per the rubric (a diagnostic that fires but fails the shape bar keeps an ERROR verdict with a message-quality impl-note), this entry is ERROR scoped to the message, with component-per-row support (S3.10's family) as the capability backlog behind it.
- Required diagnostic:
  - Code: MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT (reuse — shipped; suggestion needs a component-row variant)
  - Severity: error — Phase: public-render
  - Title: @for is not rendered by the public render path yet (shipped title)
  - Message: (shipped message is adequate: consequence + reason + drop warning)
  - Why: (shipped why is adequate)
  - Suggestion(s): For component rows, the suggestion must name the real boundary — e.g. "Rows that render a component (`<Tree node={c} />`) are not supported by the render path yet; render host-element rows, or lift the component's markup into the row until component rows ship." Never suggest reshaping away the component.
  - docsUrl: https://markless.dev/errors/MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT
- Impl-note: public-render repeat gating (keyed-repeats.ts / eligibility) — reason-specific suggestions; capability backlog: component row roots (and with them recursive components) in the repeat plan.
- Runtime follow-up: BM-deferred-to-B8 (once component rows render at all, verify recursive depth and per-level identity in the browser).
- B8 resolution (T015): BLOCKED on backlog fix S6.14 (component rows are still rejected by the render plan with `unsupported-row-binding`; recursive depth/identity stays unobservable until component rows render).

### S6.15 — same component in both `@if` arms
- Snippet:
  ```tsrx
  import { Card } from './card.tsrx';
  export function App() @{
    let on = state(true);
    <main>
      <button data-flip onClick={() => on = !on}>Flip</button>
      @if (on) { <Card label="A" /> } @else { <Card label="B" /> }
    </main>
  }
  ```
- Probe layer: FC + BM
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b6-probe.test.ts` (compile) and `pnpm exec vp test --project browser packages/vitest-browser/browser/crazy-qa-b6-probe.test.ts` (real chromium, temporary fixtures crazy-qa-b6-branch-cards.tsrx + crazy-qa-b6-card.tsrx)
  - Observed (compile): identity is separated at the graph level — two edges with distinct branch scopes: `componentEdges[0].branchScopeIds = ["branch:0"]` (label "A"), `componentEdges[1].branchScopeIds = ["branch:1"]` (label "B"). But the render plan gates the branch OFF silently: `branchGates: [{"branchSiteId":"branch-site:0","supported":false,"reason":"arm-content-unsupported"}]`, `branchArms: []`, and `planDiagnostics: []` — NO diagnostic, unlike unsupported repeats (S6.06/S6.13/S6.14 all get MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT). The SSR emit renders the active arm through composition — `(on ? (await marklessSsrRenderChild(..., { label: "A" }, { hostPrefix: "c0:", ... })) : (await marklessSsrRenderChild(..., { label: "B" }, { hostPrefix: "c0:", ... })))` — with BOTH arms sharing the same `hostPrefix: "c0:"`. (Same-module Card variant is worse: both arms emit `""` — the branch content vanishes from the page entirely, still zero diagnostics.)
  - Observed (browser, CSR): initial render `<main><button ...>Flip</button><article class="card">A</article></main>` — note there are NO branch anchor comments for this branch (contrast S6.08's `<!--markless:branch:...-->`). After clicking Flip: DOM UNCHANGED — still `<article class="card">A</article>` while the graph write set `on` to false. The branch with component arms never updates, silently, forever.
  - Existing tests (partial coverage): packages/vitest-browser/browser/fixtures/branch.tsrx (plain `<p>` arms) via render-csr.test.ts:23 and render-ssr.test.ts:27 — rerun result: pass (element-arm branches DO flip); fragment-branch.tsrx via constructs-csr.test.ts:228 — rerun result: pass. No existing test puts a component inside an arm.
- Spec check: specs/framework/01-tsrx-host-contract.md §Conditional identity — "@if branches create branch-local graph scopes... When the branch becomes active again, it creates fresh branch-local graph state from the current parent values"; the distinct per-arm `branchScopeIds` match the spec, but the identity contract cannot be exercised while the branch never flips.
- Verdict: ERROR
- Rationale: Silent-wrong at its worst (rubric rule 4): a completely ordinary shape — a component inside an `@if` arm — renders its initial arm and then freezes forever, with zero diagnostics at compile time and zero errors at runtime; the author's state write succeeds while the screen lies. The compiler even KNOWS the branch is unsupported (`arm-content-unsupported` gate) and stays quiet — the exact inconsistent-loudness class the T005 Judge escalated on S1.18, here between repeat gating (loud) and branch gating (silent). The identity half of the scenario (fresh per-arm instances, spec 01) is correctly modeled in the graph artifacts but is unverifiable at runtime until arms update at all.
- Required diagnostic:
  - Code: MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT (reuse — shipped for repeats; must also fire for unsupported branch gates)
  - Severity: error — Phase: public-render
  - Title: @if is not updated by the public render path yet
  - Message: The arms of `@if (on)` contain a component (`<Card />`), which the render path cannot update yet, so the branch renders its initial arm and never changes when `on` changes.
  - Why: The public render module only emits compiler-proven updates. A branch that renders but cannot flip would silently freeze the page, so the compiler must report it instead.
  - Suggestion(s): Move the condition inside the component (`<Card label={on ? "A" : "B"} />`), or put host elements in the arms, until component arms are supported.
  - docsUrl: https://markless.dev/errors/MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT
- Impl-note: public-render plan branch gating — `arm-content-unsupported` (and the other branch-gate reasons) produce no diagnostic while every unsupported repeat gate does; one diagnostic emission path should own both gate families. Same-module arm content additionally hits the S6.10-sibling silent component drop. Capability backlog behind it: component arms in the branch plan (then the spec 01 fresh-instance identity contract needs a browser fixture).
- Runtime follow-up: BM-deferred-to-B8 (after component arms update at all: fresh-vs-retained instance identity across a flip, per spec 01 §Conditional identity).
- B8 resolution (T015): BLOCKED on backlog fix S6.15 (branches with component arms are still gated off silently and never flip; instance-identity semantics stay unobservable until component arms update).

### Batch 6 summary

| Scenario | Verdict | Probe kind | Backlog? |
| --- | --- | --- | --- |
| S6.01 | ERROR | new-probe | yes (MARKLESS_REPEAT_KEY_UNSTABLE + collect-repeat silent-drop fix) |
| S6.02 | WARN | both | yes (support `key i` + MARKLESS_REPEAT_KEY_IS_INDEX) |
| S6.03 | ERROR | new-probe | yes (runtime MARKLESS_REPEAT_KEY_DUPLICATE; last-wins row loss today) |
| S6.04 | ERROR | new-probe | yes (MARKLESS_REPEAT_KEY_REQUIRED per spec 01; positional static render later) |
| S6.05 | WARN | both | yes (runtime dead-list-after-undefined-start fix + MARKLESS_REPEAT_COLLECTION_UNINITIALIZED) |
| S6.06 | ALREADY-CORRECT | new-probe | no (impl-note: scope-qualified item identity before nested repeats) |
| S6.07 | ERROR | new-probe | yes (reuse MARKLESS_STATE_WRITE_IN_TEMPLATE for branch tests + parenthesize emitted tests) |
| S6.08 | ALLOW | both | no (non-blocking: permanent no-match fixture test) |
| S6.09 | ALREADY-CORRECT | re-verify | no (projection-metadata design already tracked as known-red tests) |
| S6.10 | ALLOW | both | yes (sibling finding: same-module child components silently dropped from emit) |
| S6.11 | ALREADY-CORRECT | both | no |
| S6.12 | ERROR | new-probe | yes (MARKLESS_COMPONENT_EARLY_RETURN; guard silently deleted + inverted) |
| S6.13 | ERROR | new-probe | yes (MARKLESS_STATE_REPEAT_ROW_SCOPE_UNSUPPORTED; single shared cell mis-model) |
| S6.14 | ERROR | new-probe | yes (message-quality fix only: component-row suggestion; capability: component rows) |
| S6.15 | ERROR | both | yes (branch gates must diagnose like repeat gates; component arms freeze silently) |

Verdict counts: ALLOW 2, ALREADY-CORRECT 3, WARN 2, ERROR 8.

## Batch 2 — computed/async

Run context (T007, 2026-07-04): all compiler "Observed" values below are verbatim from a temporary probe
test `packages/compiler/test/crazy-qa-b2-probe.test.ts` (one test per scenario plus one control, calling
the real `buildSemanticGraph` / `lowerStateAccess` / `compileTsrxModule` entrypoints, deleted after the
runs per T003 §6), executed with `pnpm exec vp test packages/compiler/test/crazy-qa-b2-probe.test.ts`
(16 tests passed; probe facts written to a scratchpad log outside the repo and read back, because vp test
suppresses console output). Re-verify entries reran the cited existing files in one command:
`pnpm exec vp test packages/compiler/test/semantic-diagnostics.test.ts packages/compiler/test/state-lowering.test.ts`
— 2 files, 24 tests, all passed. Browser usage: no temporary fixtures were needed this batch — the
verdict-decisive facts are static emitted-module facts (an undeclared identifier and an empty SSR module
are JavaScript facts, not runtime claims). The existing async fixture coverage was rerun instead:
`pnpm exec vp test --project browser packages/vitest-browser/browser/constructs-csr.test.ts packages/vitest-browser/browser/constructs-ssr.test.ts`
(32 passed + 2 `test.fails` known-red children-projection tests), which includes the async-details.tsrx
async computed round trip in a real browser. TSRX MCP was unavailable this session; spec checks cite the
local split specs (fallback per AGENTS.md), and entries say so where the local spec is silent. All
snippets assume `import { state, computed } from '@markless/core';` inside `export function App() @{ ... }`
unless shown otherwise.

Batch-level structural finding (cited per entry below): **sync computeds are dropped from every emitted
artifact.** `packages/compiler/src/passes/payload-arena.ts:25-26` filters payload computed records to
`binding.async === true` only, and no other pass emits the derive function of a sync computed: for the
spec's own hello-world control `let count = state(2); const doubled = computed(() => count * 2); <p>{doubled}</p>`
the probe observed `payloadComputed: []`, the string `count * 2` absent from symbolModules, both render
modules, and the resolver module (`deriveInAnyEmit: false`), a CSR module that reads the binding without
ever declaring it (`marklessCsrRootFromHtml("<p>" + marklessCsrText(doubled) + "</p>")` with
`csrDeclaresDoubled: false` — a guaranteed ReferenceError by JavaScript semantics), an EMPTY SSR module
(`ssrModuleSourceLength: 0`, `rootExportName: null`), and zero diagnostics in every pass
(`planDiagnostics: []`). The async path is the working one: async computeds get payload records,
`async-computed-runner` + `async-boundary-update` symbols, and real-browser proof (S2.10). The
framework's most novel contract (async boundaries) is its best-built path this batch; the mundane sync
derive is the silent hole. Affects S2.05, S2.06, S2.07, S2.11, S2.13.

### S2.01 — async computed template read with no @try boundary
- Snippet:
  ```tsrx
  const user = computed(async ({ signal }) => {
    const response = await fetch('/api/user', { signal });
    return await response.json();
  });
  <p>{user.name}</p>
  ```
- Probe layer: SG
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b2-probe.test.ts`
  - Observed: `MARKLESS_ASYNC_BOUNDARY_REQUIRED`, severity `error`, phase `semantic-graph`, title `Async computed reads need an async boundary`, message `Cannot read async computed "user.name" outside @try/@pending/@catch. Wrap the read in an async boundary.`, why `Async computed values can be pending or rejected during initial render and resume. The runtime needs an explicit TSRX async boundary to render pending and error UI.`, suggestion `Wrap this template read in @try with @pending and @catch branches, or read a sync computed that is already guarded by an async boundary.`, docsUrl `https://markless.dev/errors/MARKLESS_ASYNC_BOUNDARY_REQUIRED`, span on `user.name`. The binding is fully modeled: `{"id":"computed:user","kind":"computed","writable":false,"async":true,"asyncCapable":true,"dependencies":[]}`.
  - Existing test: packages/compiler/test/semantic-diagnostics.test.ts:388 — rerun result: pass.
- Spec check: specs/framework/03-state-graph.md §Async derivation and TSRX boundaries — "A template read of an async computed must be dominated by an async boundary. Missing boundaries are compile-time diagnostics in v1."
- Verdict: ALREADY-CORRECT
- Rationale: The forgotten-boundary case — the most novel contract's first-contact moment — fails loudly with exactly the specced outcome, quoting `user.name`, and the why teaches the model confidently: the value can be pending or rejected during initial render AND resume, so the compiler demands the UI say what renders then. No apology, no marker syntax, consequence → why → fix → link.
- Required diagnostic: n/a (ships today).
- Impl-note: collect-async (collectAsyncBoundaryDiagnostics over templateReads without an `asyncBoundaryId`).
- Runtime follow-up: none.

### S2.02 — reactive read after await inside an async computed
- Snippet:
  ```tsrx
  const settings = state({ locale: 'en' });
  const user = computed(async ({ signal }) => {
    const response = await fetch('/api/user', { signal });
    return formatUser(response, settings.locale);
  });
  @try { <p>{user.name}</p> } @pending { <p>Loading</p> } @catch (error) { <p>{error.message}</p> }
  ```
- Probe layer: SG
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b2-probe.test.ts`
  - Observed: `MARKLESS_ASYNC_POST_AWAIT_READ`, severity `error`, title `Reactive reads after await are not resumable`, message `Cannot read "settings.locale" after await in async computed "user". Snapshot the value before awaiting.`, why `Async computed dependency keys are captured before the first await. Reading graph state after suspension would make revalidation and resume depend on hidden async timing.`, suggestion `Read the graph value before the first await, or split post-await formatting into a separate sync computed().`, span on `settings.locale`. Artifact note: the post-await read is nonetheless still recorded in the binding's `dependencies` (`{"source":"settings.locale","graphNodeId":"state:settings","path":["locale"]}`) — harmless today because compilation fails, but the dependency collector does not distinguish pre/post-await; only the diagnostic does.
  - Existing test: packages/compiler/test/semantic-diagnostics.test.ts:346 — rerun result: pass (including its negative assertion that the pre-await `route.params.userId` read is NOT flagged).
- Spec check: specs/framework/03-state-graph.md §Async derivation — "Reactive reads before the first `await` form the dependency key... Reactive reads after the first `await` are a compile-time diagnostic. Snapshot the value before awaiting, or split the logic into an async computed plus a sync computed" — the shipped suggestion is the spec's own two fixes verbatim.
- Verdict: ALREADY-CORRECT
- Rationale: The natural async style is caught exactly as specced, with the dependency-key model taught in one sentence and both sanctioned rewrites offered. Non-blocking impl-note: align `collectGraphDependencies` with the post-await rule so the artifact and the diagnostic tell the same story once anything downstream consumes async dependency keys.
- Required diagnostic: n/a (ships today).
- Impl-note: collect-async (collectAsyncComputedPostAwaitReads); dependency/pre-await alignment note above.
- Runtime follow-up: none.

### S2.03 — sync computed reading an async computed (transitive boundary)
- Snippet:
  ```tsrx
  const user = computed(async ({ signal }) => { ... });
  const userName = computed(() => user.name.toUpperCase());
  <p>{userName}</p>
  ```
- Probe layer: SG
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b2-probe.test.ts`
  - Observed (unboundaried): `userName` binding is `{"async":false,"asyncCapable":true,"dependencies":[{"source":"user.name","graphNodeId":"computed:user","path":["name"]}]}` — async-capability propagates through the dependency edge — and the diagnostic fires: `MARKLESS_ASYNC_BOUNDARY_REQUIRED`, message `Cannot read async-capable computed "userName" outside @try/@pending/@catch. Wrap the read in an async boundary.` (note the message correctly says "async-capable computed", distinguishing transitive from direct).
  - Observed (control, wrapped in `@try`): `sgDiagnostics: []` and the template read carries the boundary: `templateReads[0] = {"hostNodeId":"h0","source":"userName",...,"asyncBoundaryId":"boundary:0"}`.
  - Existing test: packages/compiler/test/semantic-diagnostics.test.ts:422 — rerun result: pass.
- Spec check: specs/framework/03-state-graph.md §Async derivation — "Sync computeds may depend on async computeds. They become async-pending-capable transitively and must still be read under an async boundary."
- Verdict: ALREADY-CORRECT
- Rationale: Layered derivation — the spec's own recommended split pattern (async fetch + sync format) — is modeled with a real propagation fixpoint (`propagateAsyncComputedCapability`) rather than a syntactic check, the boundaried form compiles clean with the boundary recorded on the read, and the unboundaried form fails loudly with wording that names the transitivity.
- Required diagnostic: n/a (ships today).
- Impl-note: collect-async (propagateAsyncComputedCapability + collectAsyncBoundaryDiagnostics).
- Runtime follow-up: BM-deferred-to-B8 (runtime pending propagation through the sync layer belongs to the async runtime tier).
- B8 resolution (T015): BLOCKED on backlog fix S2.11 (sync computeds do not render at all — their template reads emit undeclared identifiers and empty SSR modules — so pending propagation THROUGH a sync computed cannot reach a browser until sync-derive emission ships).

### S2.04 — writing to a computed
- Snippet:
  ```tsrx
  let count = state(2);
  const doubled = computed(() => count * 2);
  <button onClick={() => { doubled = 10; }}>{doubled}</button>
  ```
- Probe layer: SL
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b2-probe.test.ts`
  - Observed: `MARKLESS_STATE_READ_ONLY_WRITE`, severity `error`, phase `state-lowering`, title `Cannot write to a read-only graph binding`, message `Cannot write to "doubled" because computed() values are read-only.`, why `computed() creates derived graph state. Mutating it would make the serialized graph ambiguous after resume.`, suggestion `Write to the source state that the computed value derives from, or make a separate state() value for mutable data.`, docsUrl `https://markless.dev/errors/MARKLESS_STATE_READ_ONLY_WRITE`; `slWrites: []` — no phantom write record.
  - Existing test: packages/compiler/test/state-lowering.test.ts:790 — rerun result: pass.
- Spec check: specs/framework/03-state-graph.md §State lvalue meta-contract — "`computed()` and props are read-only in v1. Writes to them, including writes through aliases, are diagnostics."
- Verdict: ALREADY-CORRECT
- Rationale: Exactly the specced outcome with both real fixes named (write to the source, or make separate state), quoting `doubled`. The resume-grounded why (serialized graph would be ambiguous) is the right teaching.
- Required diagnostic: n/a (ships today).
- Impl-note: state-lowering, write resolution over computed bindings.
- Runtime follow-up: none.

### S2.05 — side-effecting computed: `count++` inside the derive
- Snippet:
  ```tsrx
  let count = state(1);
  const doubled = computed(() => { count++; return count * 2; });
  <p>{doubled}</p>
  ```
- Probe layer: SG + SL + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b2-probe.test.ts`
  - Observed: compiles CLEAN — zero diagnostics in every pass. The write inside the derive is collected and FULLY LOWERED as an ordinary graph write: `slWrites[0] = {"source":"count","graphNodeId":"state:count","path":[],"operation":"update","prefix":false,"updateOperator":"++"}`, while the same binding records `doubled` depending on `count`: `dependencies: [{"source":"count","graphNodeId":"state:count","path":[]}]` — the artifacts literally model a node that writes its own dependency. FC facts: only one planned symbol (`{"id":"symbol:0","kind":"dom-update"}` for `doubled`), `payloadComputed: []`, and neither `count++` nor `count * 2` appears in any emitted module (batch-level sync-computed drop); SSR module source is empty.
- Spec check: specs/framework/03-state-graph.md §No effects, no tasks — "a computed is **pull-based** (runs when read) while an effect is **push-based**... That push property is exactly what breaks resumability (eager self-waking code)"; §State lvalue meta-contract — surprising semantics ⇒ diagnostic.
- Verdict: ERROR
- Rationale: No legitimate reading exists: a derive that writes graph state is the effect the framework's core invariant deliberately removed, and here it writes the very cell it depends on — the artifacts record a self-waking loop (`doubled` reads `count`, `doubled` writes `count`) with zero diagnostics (rubric rule 4). The React-effect habit this comes from (prep §8) deserves the framework's most confident teaching, not silence. Same self-waking class as S1.09/S6.07, at the computed site.
- Required diagnostic:
  - Code: MARKLESS_STATE_WRITE_IN_COMPUTED (new; sibling of the S1.09-proposed MARKLESS_STATE_WRITE_IN_TEMPLATE)
  - Severity: error — Phase: semantic-graph
  - Title: A computed cannot write graph state
  - Message: `computed(() => { count++; ... })` writes to `count` while deriving `doubled` — and `doubled` derives from `count`, so producing the value would re-trigger its own derivation.
  - Why: A computed is a demand-driven read in the graph; the only effects in the system are compiler-generated DOM updates, so a write inside a derive is a self-waking cycle that cannot resume.
  - Suggestion(s): Keep the derive pure — before: `const doubled = computed(() => { count++; return count * 2; });` — after: `const doubled = computed(() => count * 2);` plus `count++` at the event site that actually changes `count`.
  - docsUrl: https://markless.dev/errors/MARKLESS_STATE_WRITE_IN_COMPUTED
- Impl-note: collect-state calls collectExpressionReads on the computed body, which collects writes with no site context (same root cause as S1.09's template-site gap); the collector or state-lowering must reject writes whose site is a computed derive. Part of the write-site-context backlog family.
- Runtime follow-up: none (compile-time verdict; the emit drop is proven at FC and owned by S2.11's structural entry).

### S2.06 — `state()` created inside a computed body
- Snippet:
  ```tsrx
  const total = computed(() => { const tmp = state(0); return tmp + 1; });
  <p>{total}</p>
  ```
- Probe layer: SG + SL + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b2-probe.test.ts`
  - Observed: compiles CLEAN — zero diagnostics. `tmp` becomes a full top-level graph binding as if declared in the component body: `{"id":"state:tmp","name":"tmp","kind":"state","declarationKind":"const","writable":true,"valueKind":"scalar","initialValue":0}`, and FC plans a REAL payload cell for it: `protocolStateCells[0] = {"graphNodeId":"state:tmp","name":"tmp","valueKind":"scalar","value":{"version":1,"root":0,"records":[]}}` with the CSR module hoisting it to render scope (`let tmp = marklessCsrStateValue("state:tmp")`). Meanwhile `total`'s `dependencies: []` — the derive's read of `tmp` is NOT a dependency (the binding did not exist when the computed's dependencies were collected), so `total` could never invalidate when `tmp` changes.
- Spec check: specs/framework/03-state-graph.md §Implementation — graph bindings are "owned by the nearest stable TSRX graph scope"; §Surface API/scoping — a derive re-runs on demand and is not a stable creation scope. The spec's "may be created anywhere in a call tree rooted in a component" (03:222) sanctions helper functions, not re-running reactive computations; local spec is silent on the derive case specifically — needs TSRX spec confirmation (TSRX MCP unavailable this session).
- Verdict: ERROR
- Rationale: The "hooks in callbacks" placement habit (prep §8) is silently mis-modeled twice: plain JavaScript says `state(0)` runs on every derive execution (a fresh cell per run — no stable identity), but the compiler hoists it to one permanent component cell; and the derive's own read of that cell is dropped from the dependency graph, so the artifacts describe a `total` that never recomputes. Both facts are wrong, both are silent (rubric rule 4).
- Required diagnostic:
  - Code: MARKLESS_STATE_CREATION_IN_COMPUTED (new)
  - Severity: error — Phase: semantic-graph
  - Title: state() cannot be created inside a computed
  - Message: `state(0)` creates `tmp` inside the computed that derives `total`. A computed body re-runs whenever the graph needs its value, so `tmp` would be recreated on every derivation and could never keep a value of its own.
  - Why: Graph state needs a stable owner scope to serialize and resume; a derive is a demand-driven computation, not a stable scope.
  - Suggestion(s): Declare the state in the component body and derive from it — before: `const total = computed(() => { const tmp = state(0); return tmp + 1; });` — after: `const tmp = state(0); const total = computed(() => tmp + 1);`.
  - docsUrl: https://markless.dev/errors/MARKLESS_STATE_CREATION_IN_COMPUTED
- Impl-note: collect-state's collectVariableDeclaration runs during the generic body walk with no am-I-inside-a-derive context; the walk state needs a current-computed marker (same site-context family as S2.05). B7's S7.05/S7.06 (helper/conditional creation) will meet the same walk-context need.
- Runtime follow-up: none (compile-time verdict; payload facts proven at FC).

### S2.07 — nested `computed(() => computed(...))`
- Snippet:
  ```tsrx
  let count = state(1);
  const outer = computed(() => computed(() => count));
  <p>{outer}</p>
  ```
- Probe layer: SG + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b2-probe.test.ts`
  - Observed: compiles CLEAN — zero diagnostics. The inner `computed(() => count)` produces NO binding and NO record of any kind; only `outer` exists, with `functionSource: "() => computed(() => count)"` (the un-rewritten inner framework call baked into the derive source) and `dependencies: [{"source":"count","graphNodeId":"state:count","path":[]}]` (dependency collection walked through the nested arrow). `payloadComputed: []`, `payloadDiagnostics: []`.
- Spec check: specs/framework/03-state-graph.md §Implementation — "Imported `state()` / `computed()` calls in variable declarators become graph bindings"; calls outside declarators are unspecified. §Async derivation — "runtime stubs fail loudly if called directly without compilation": the inner call would reach the fail-loud stub if the derive ever executed.
- Verdict: ERROR
- Rationale: Same class as S1.04 (nested creation): a computed's value must be serializable graph data, and a `computed()` call has no value form that can be another computed's result. Today the mistake is doubly deferred — invisible at compile time, then a runtime `FrameworkApiRuntimeError` (or, currently, unreachable because sync derives are never emitted at all) — for a mistake the AST proves in the declarator (rubric rule 1 + rule 4).
- Required diagnostic:
  - Code: MARKLESS_STATE_NESTED_CREATION (reuse — proposed in S1.04 for framework-API calls inside a state()/computed() argument)
  - Severity: error — Phase: semantic-graph
  - Title: A framework API call cannot be a graph value
  - Message: `computed(() => computed(() => count))` creates a computed whose value would be another computed() call. `outer` derives a value; it cannot derive graph nodes.
  - Why: computed() declares a graph node at compile time; it has no runtime value form that a cell or derive result can hold.
  - Suggestion(s): Derive the value directly — before: `const outer = computed(() => computed(() => count));` — after: `const outer = computed(() => count);`.
  - docsUrl: https://markless.dev/errors/MARKLESS_STATE_NESTED_CREATION
- Impl-note: collect-state (detect framework-API call expressions inside state()/computed() arguments — one detector serves S1.04 and this entry).
- Runtime follow-up: none.

### S2.08 — computed created inside a keyed `@for` row
- Snippet:
  ```tsrx
  let rows = state([{ id: 'a', a: 1, b: 2 }, { id: 'b', a: 3, b: 4 }]);
  <ul>
    @for (const row of rows; key row.id) {
      const total = computed(() => row.a + row.b);
      <li>{total}</li>
    }
  </ul>
  ```
- Probe layer: SG + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b2-probe.test.ts`
  - Observed: `total` becomes ONE flat component-level binding with no row scope AND no inputs: `{"id":"computed:total","name":"total","kind":"computed",...,"dependencies":[],"functionSource":"() => row.a + row.b"}` — `row.a`/`row.b` resolve to nothing because the repeat item alias is invisible to dependency collection. The repeat record itself is fine (`keySource: "row.id"`, `keyPath: ["id"]`). No pass diagnoses the per-row creation; the module fails loudly only at the render plan for an unrelated structural reason: gate `single-row-root-required` (statement + element row body) with `MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT`, message `The @for rows are not compiler-proven (reason: single-row-root-required), so the render module drops the list content.`. `payloadComputed: []`.
- Spec check: specs/framework/01-tsrx-host-contract.md §Loop identity — "A keyed loop item keeps its component instances, local `state()`, `computed()` nodes... attached to the same logical item" — per-row computed() is spec-promised, exactly like S6.13's per-row state().
- Verdict: ERROR
- Rationale: The ubiquitous per-row derivation is mis-modeled the same way T006 proved for per-row `state()` (S6.13: single shared cell), and worse: where S6.13's shared cell at least kept its write lowering, this computed loses even its inputs — a derive with `dependencies: []` could never re-run. The loud failure that does occur blames an unrelated shape and its suggestion ("reshape the rows into a single host element") would have the author delete the derivation. Silent mis-model + misleading loudness (rubric rule 4).
- Required diagnostic:
  - Code: MARKLESS_STATE_REPEAT_ROW_SCOPE_UNSUPPORTED (reuse — proposed in S6.13; one code owns per-row state() AND computed() until per-item scopes ship)
  - Severity: error — Phase: semantic-graph
  - Title: Per-row computed() is not supported yet
  - Message: `total` is created by `computed()` inside `@for (const row of rows; key row.id)`. Each keyed row needs its own `total` derived from its own `row`, but the graph currently gives every row one shared node with no inputs.
  - Why: A keyed loop item owns a per-item graph scope; a derive shared by all rows cannot subscribe to any single row's values, so it could never update.
  - Suggestion(s): Derive inline in the row template (`<li>{row.a + row.b}</li>`), or derive a per-row field on the collection in the component body, until per-row graph scopes ship.
  - docsUrl: https://markless.dev/errors/MARKLESS_STATE_REPEAT_ROW_SCOPE_UNSUPPORTED
- Impl-note: same owning modules as S6.13 (collect-state has no keyed-repeat scope context; collect-async's collectGraphDependencies resolves against graph bindings only, so repeat item aliases vanish). The dependency half is new evidence this batch: per-item scope work must also give repeat aliases dependency resolution.
- Runtime follow-up: none (the render plan already refuses the shape; nothing runs).

### S2.09 — self-referential computed
- Snippet:
  ```tsrx
  const a = computed(() => a ? 1 : 2);
  <p>{a}</p>
  ```
- Probe layer: SG
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b2-probe.test.ts`
  - Observed: compiles CLEAN — zero diagnostics in semantic-graph and state-lowering. The binding is `{"id":"computed:a","name":"a",...,"dependencies":[],"functionSource":"() => a ? 1 : 2"}` — the self-read inside the derive is silently NOT recorded (the binding did not exist yet when its own dependencies were collected), so the artifacts describe a derive with no inputs whose source still references `a`.
- Spec check: specs/framework/03-state-graph.md §Async derivation (dependency model) and the shipped `MARKLESS_SHARED_DEFINITION_CYCLE` precedent (specs/framework/03-state-graph.md shared-definition cycle rule) — cycles are diagnosed for shared() but nothing owns computed cycles; local spec is silent on computed self-reference; needs TSRX spec confirmation (TSRX MCP unavailable this session).
- Verdict: ERROR
- Rationale: No legitimate reading exists: a derived value cannot be defined in terms of itself. This is a typo/refactor artifact (the author meant another binding), and today it compiles to a dependency-less derive whose emitted source would read its own uninitialized binding — silence at the exact moment a name-level check could catch a name-level mistake (rubric rules 1 and 4). The framework already treats definition cycles as errors for shared(); computeds deserve the same, including multi-node cycles (a→b→a) once dependency edges exist for the checker to walk.
- Required diagnostic:
  - Code: MARKLESS_COMPUTED_DEPENDENCY_CYCLE (new; sibling of MARKLESS_SHARED_DEFINITION_CYCLE)
  - Severity: error — Phase: semantic-graph
  - Title: A computed cannot depend on itself
  - Message: `computed(() => a ? 1 : 2)` reads `a` — the value it is defining. `a` cannot be derived from `a`.
  - Why: A derive is a pull-based graph node; a cycle in its dependencies means there is no order in which the graph can produce the value.
  - Suggestion(s): Reference the source binding you meant to derive from, or rename one of the two values if this was a shadowing typo.
  - docsUrl: https://markless.dev/errors/MARKLESS_COMPUTED_DEPENDENCY_CYCLE
- Impl-note: collect-state collects a computed's dependencies before pushing its own binding, so self-reads resolve to nothing and vanish; the cycle check needs the declarator's own name in scope during collection (self-cycle) plus a post-collection walk over dependency edges (longer cycles).
- Runtime follow-up: none.

### S2.10 — async computed ignoring `signal` entirely
- Snippet:
  ```tsrx
  const data = computed(async () => {
    const response = await fetch('/api/data');
    return await response.json();
  });
  @try { <p>{data.title}</p> } @pending { <p>Loading</p> } @catch (error) { <p>failed</p> }
  ```
- Probe layer: SG + FC (+ existing-fixture BM)
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b2-probe.test.ts`
  - Observed: compiles CLEAN with the full async machinery planned despite the unused signal: binding `{"id":"computed:data","async":true,"asyncCapable":true}`; planned symbols `{"id":"symbol:1","kind":"async-computed-runner","graphNodeId":"computed:data",...}` and `{"id":"symbol:2","kind":"async-boundary-update","boundaryId":"boundary:0","graphNodeId":"computed:data"}`; payload boundary record `{"id":"boundary:0","kind":"async-boundary","startAnchor":{"strategy":"dom-order-comment","index":0},"endAnchor":{...,"index":1},"asyncReads":[{"source":"data.title","graphNodeId":"computed:data","path":["title"]}]}`; `planDiagnostics: []`.
  - Existing test (partial coverage): packages/vitest-browser/browser/fixtures/async-details.tsrx (async computed with pending→done round trip and revalidation, though that fixture DOES read `signal.aborted`) via constructs-csr.test.ts:159 and constructs-ssr.test.ts:157 — rerun result: pass in a real browser (32 passed + 2 known-red projection tests in the two files). No existing test covers a signal-less async computed at runtime.
- Spec check: specs/framework/03-state-graph.md §Async derivation — "stale work is aborted when possible; **stale promise resolutions are ignored even if the underlying operation cannot abort**" — the spec designs for exactly the dev who never wires cancellation.
- Verdict: ALLOW
- Rationale: Most devs won't use the signal, and the framework already promises correctness without it: staleness is enforced by version-ignoring at the runtime, with the signal as an optimization hook. The positive artifact facts are complete (runner symbol, boundary-update symbol, payload boundary with anchored async reads), and warning here would fire on the dominant idiom (rubric rule 3).
- Required diagnostic: n/a.
- Impl-note: none.
- Runtime follow-up: BM-deferred-to-B8 (the actual stale-resolution race — old slow response resolving after a dependency-key change — needs a signal-less browser fixture; the existing fixture only proves the signal-using path).
- B8 resolution (T015): RESOLVED — the spec's stale-ignore promise holds without a signal: temporary fixture crazy-qa-b8-stale-race.tsrx (`computed(async () => ...)`, no parameter; delay 250ms for the slow key, 25ms otherwise), CSR run in a minimal-context probe file: initial settle `start-result`; after clicking slow then fast 60ms apart, the binding shows `fast-result` when the fast run settles AND still shows `fast-result` 400ms later after the stale slow resolution lands (`{"afterFastSettles":"fast-result","afterSlowSettles":"fast-result"}`) — version-ignoring works signal-free. HARNESS CAVEAT (owner-flag): the identical fixture never settles when run inside the full 34-test probe file — even with every other test skipped via `-t`, and sensitive to the test block's position with byte-identical content (bounded bisect ruled out imports, the SSR transform, direct @markless/web imports, and the failing cross-module fixture). Async-settle is context-fragile in a way nobody has characterized; recorded as an instability escalation, cause not isolated.

### S2.11 — conditional dependencies (`flag ? count : other`) and the sync-computed emit hole
- Snippet:
  ```tsrx
  let flag = state(true);
  let count = state(1);
  let other = state(2);
  const picked = computed(() => flag ? count : other);
  <p>{picked}</p>
  ```
- Probe layer: SG + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b2-probe.test.ts`
  - Observed (SG — the scenario's own question): the artifact records the full static superset of both branches: `dependencies: [{"source":"flag",...},{"source":"count",...},{"source":"other",...}]` — conservative, correct invalidation semantics (an inactive-branch change can over-invalidate but never under-invalidate). Zero SG/SL diagnostics.
  - Observed (FC — the batch-level finding, proven on this scenario AND on the side-effect-free control `computed(() => count * 2)`): `payloadComputed: []` (payload-arena.ts:25-26 keeps async computeds only); the derive source appears in NO emitted artifact (`deriveInAnyEmit: false` — `flag ? count : other` and `count * 2` absent from symbolModules, both render modules, and the resolver); the CSR module renders `marklessCsrRootFromHtml("<p>" + marklessCsrText(picked) + "</p>")` while `picked` is never declared in the module (`csrDeclaresDoubled: false` on the control) — a guaranteed ReferenceError; the SSR module is EMPTY (`ssrModuleSourceLength: 0`, `rootExportName: null`); `planDiagnostics: []` — zero diagnostics anywhere. No browser fixture exercises a sync computed (async-details.tsrx is the only computed fixture).
- Spec check: specs/framework/03-state-graph.md §Surface API — `computed(fn)` "Sync computeds re-derive from their dependencies when read" is the spec's second example after `state()` (`let double = computed(() => count * 2)` is the spec's own hello-world, 03:28).
- Verdict: ERROR
- Rationale: The conditional-dependency question itself is answered correctly at the artifact level (static superset). But the run proves the everyday sync computed — the spec's hello-world — currently compiles to modules that cannot execute (undeclared identifier in CSR) and to an empty SSR module, silently (rubric rule 4; S6.13 precedent for spec-promised capability mis-modeled). ERROR is the honest capability tier until derive emission ships: the render plan must refuse computed-backed template reads as loudly as it refuses unsupported repeats. The ideal end-state for this scenario is ALLOW (positive superset dependencies are already right); this entry upgrades when a sync computed renders at all.
- Required diagnostic:
  - Code: MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT (reuse — shipped for unsupported repeats; must also fire for sync-computed-backed template reads until the render path derives them)
  - Severity: error — Phase: public-render
  - Title: computed() is not rendered by the public render path yet
  - Message: `{picked}` reads the computed `picked`, which the render module cannot derive yet, so the emitted page could not produce its value.
  - Why: The public render module only emits compiler-proven output; a template read whose derive function reaches no emitted artifact would fail at render instead of compile.
  - Suggestion(s): Inline the derivation in the template (`{flag ? count : other}`), or read the source state directly, until sync computed rendering ships.
  - docsUrl: https://markless.dev/errors/MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT
- Impl-note: three owning sites for the capability fix — payload-arena.ts:25-26 (drop the async-only filter or plan sync derives elsewhere), symbol planning (a sync-derive symbol kind parallel to `async-computed-runner`), and public-render module emit (declare/derive the computed local; also explain why the SSR module silently emits empty for this shape). The diagnostic is the honest boundary until then. Highest-priority B2 backlog item.
- Runtime follow-up: none needed for the verdict (ReferenceError and empty module are static JS facts); BM confirmation of the CSR throw naturally lands with the B8 tier if useful.

### S2.12 — `try`/`catch` inside an async computed instead of `@catch`
- Snippet:
  ```tsrx
  const user = computed(async ({ signal }) => {
    try {
      const response = await fetch('/api/user', { signal });
      return await response.json();
    } catch {
      return { name: 'guest' };
    }
  });
  <p>{user.name}</p>
  ```
- Probe layer: SG
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b2-probe.test.ts`
  - Observed (as authored, no boundary): `MARKLESS_ASYNC_BOUNDARY_REQUIRED` fires on `user.name` (same verbatim shape as S2.01) — an internal catch does NOT exempt the read from the boundary rule; the binding stays `async: true, asyncCapable: true`. The try/catch shape itself produced no diagnostic of its own.
  - Observed (variant: catch block returns `{ name: fallback.name }` where `fallback` is state, boundary present): `MARKLESS_ASYNC_POST_AWAIT_READ` fires on `fallback.name` — the catch block is after the first await, so graph reads inside it are correctly caught by the post-await rule (message quotes `fallback.name` and `user`).
- Spec check: specs/framework/03-state-graph.md §Async derivation — "`@try` / `@pending` / `@catch` is the only v1 UI mechanism for observing async pending/error state"; internal error handling produces a VALUE, it does not remove pendingness during flight.
- Verdict: ALREADY-CORRECT
- Rationale: The competing-error-handling pattern is arbitrated exactly right: handling errors inside the derive is legal (it changes what value resolves), the boundary is still required (the value is still pending while in flight — the internal catch cannot render a spinner), and graph reads smuggled into the catch block still hit the post-await rule. Message-quality note (polish only): when the async body contains its own try/catch, the boundary message could add one clause — "handling errors inside the function changes the value, but the read is still pending while it runs" — to preempt "but I already caught it" confusion; the current why is accurate regardless.
- Required diagnostic: n/a (ships today).
- Impl-note: collect-async; no structural gap found.
- Runtime follow-up: BM-deferred-to-B8 (that an internal catch resolves the boundary to `@try` content rather than `@catch` at runtime — value-vs-error routing — is untested; compile side proven).
- B8 resolution (T015): RESOLVED with a NEW silent-wrong finding — value-vs-error routing is unreachable because a `try`/`catch` INSIDE the derive silently kills the boundary: compile probe verbatim — with the internal try/catch the payload boundary is `{"id":"boundary:0",...,"asyncReads":[]}` (no runner link, no `updateSymbolId`) while the same derive without try/catch plans `asyncReads:[{"source":"user.name",...,"runnerSymbolId":"symbol:1"}]` + `updateSymbolId` — the runner module itself IS emitted faithfully in both cases. Browser: the fixture shows `@pending` "Loading" forever on SSR AND CSR (150ms and 500ms waits, zero rejections). One statement of ordinary defensive error handling, zero diagnostics, permanently-pending UI. Backlog candidate: async-read collection must not lose reads whose derive contains try/catch (or must fail loud); the ALREADY-CORRECT verdict here covers the boundary-requirement diagnostics, not this hole — escalated in the Batch 8 summary.

### S2.13 — template as a value: `state(<p>hi</p>)` / `computed(() => <p>{n}</p>)` (cross-filed from B4 family)
- Snippet:
  ```tsrx
  const view = state(<p>hi</p>);
  <section>{view}</section>
  // sibling:
  let n = state(1);
  const view2 = computed(() => <p>{n}</p>);
  <section>{view2}</section>
  ```
- Probe layer: SG + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b2-probe.test.ts`
  - Observed: NOT a parse throw (the T002/T003 parse-phase expectation was wrong — the external @tsrx/core parser accepts templates in expression position here). Both variants compile with ZERO diagnostics in every pass. `state(<p>hi</p>)` produces `{"id":"state:view",...,"valueKind":"unknown"}` whose FC payload cell is `{"graphNodeId":"state:view",...,"value":{"version":1,"root":{"$type":"undefined"},"records":[]}}` — the template value silently becomes `undefined` in the payload — and the CSR module renders it as text: `marklessCsrText(view)`. The computed variant records `{"id":"computed:view",...,"dependencies":[{"source":"n",...}],"functionSource":"() => <p>{n}</p>"}` — raw TSRX template syntax baked into a derive source string that no JavaScript emit could ever execute — plus the batch-level sync-computed drop (no payload record, no emitted derive).
- Spec check: T003 rubric §2 names this class verbatim: "template-as-value where no VDOM value exists" is an ERROR category. specs/framework/01-tsrx-host-contract.md — templates compile to host structure, locators, and anchors; there is no render-output value (no-VDOM core constraint, AGENTS.md).
- Verdict: ERROR
- Rationale: The `useState(<JSX/>)` habit (prep §3) has no legitimate reading in a framework with no VDOM: there is no value a template can serialize into a graph cell, and today both variants compile silently into meaninglessness (an `undefined` payload cell rendered as text; a derive whose source is unparseable-as-JS TSRX). This is the rubric's own named ERROR class, currently shipping as silence (rubric rule 4).
- Required diagnostic:
  - Code: MARKLESS_TEMPLATE_AS_VALUE (new)
  - Severity: error — Phase: semantic-graph
  - Title: A template is not a value
  - Message: `state(<p>hi</p>)` stores a template as the value of `view`. Templates compile into page structure; `view` can only hold data, so there is no value here to store, update, or serialize.
  - Why: The graph serializes data cells across the resume boundary and templates compile to DOM structure with locators — there is no render-output object that could live in a cell.
  - Suggestion(s): Store the data and keep the template in the tree — before: `const view = state(<p>hi</p>); <section>{view}</section>` — after: `const message = state('hi'); <section><p>{message}</p></section>`; for conditional structure use `@if`/`@switch`, or extract a component.
  - docsUrl: https://markless.dev/errors/MARKLESS_TEMPLATE_AS_VALUE
- Impl-note: collect-state (detect template-expression nodes inside state()/computed() arguments — same declarator-argument detector family as S1.04/S2.07). B4's S4.05/S4.06 (template stored in a plain local, imperative template arrays) will need the same template-as-value ownership; one code should serve all sites.
- Runtime follow-up: none (compile-time verdict; payload facts proven at FC).

### S2.14 — `await` directly in a template expression
- Snippet:
  ```tsrx
  @try {
    <p>{await loadGreeting()}</p>
  } @pending {
    <p>Loading</p>
  } @catch (error) {
    <p>failed</p>
  }
  ```
- Probe layer: SG (observed at parse)
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b2-probe.test.ts`
  - Observed: `buildSemanticGraph` THROWS from the parser: `SyntaxError: Cannot use keyword 'await' outside an async function (6:6)` — phase parse (external @tsrx/core). No Markless diagnostic shape (no code, no why, no suggestion, no docsUrl) reaches the author.
- Spec check: specs/framework/03-state-graph.md §Async derivation — the sanctioned shape is `computed(async ({ signal }) => ...)` read under `@try`; a component body is not an async function, so template-level `await` has no home in the model. The parser's JavaScript reasoning is accurate.
- Verdict: ERROR (impl-note: external-boundary, message-quality fix only — the rejection itself is correct)
- Rationale: No legitimate reading exists (the ideal tier is ERROR and the input IS rejected loudly today), but this is a first-contact async moment — the author is one concept away from the right pattern, and the raw SyntaxError teaches JavaScript instead of the framework: nothing tells them the framework's answer to "I want to await in my UI" is an async computed plus the boundary they already wrote. Per rubric rule 7, the verdict keeps ERROR with a message-quality impl-note; per T003 §4.3 the fix is Markless-side wrapping at the compiler artifact boundary only.
- Required diagnostic:
  - Code: MARKLESS_ASYNC_BOUNDARY_REQUIRED (reuse — the boundary family owns the teaching; emitted by the Markless-side wrapper that translates this parse failure, or a dedicated template-await detector if the parser ever yields an AST here)
  - Severity: error — Phase: parse (external @tsrx/core), surfaced with the Markless diagnostic shape
  - Title: await cannot run inside a template expression
  - Message: `{await loadGreeting()}` awaits inside the template. A template expression is a synchronous read; the component body is not an async function, so `await` cannot appear here.
  - Why: Async work is derived graph state — an async computed runs the await, and the @try/@pending/@catch boundary you already have renders its pending and error states.
  - Suggestion(s): Move the await into an async computed and read it — before: `<p>{await loadGreeting()}</p>` — after: `const greeting = computed(async ({ signal }) => loadGreeting());` with `<p>{greeting}</p>` inside the existing `@try`.
  - docsUrl: https://markless.dev/errors/MARKLESS_ASYNC_BOUNDARY_REQUIRED
- Impl-note: external-boundary — wrap the @tsrx/core SyntaxError into the structured diagnostic shape at the compiler artifact boundary (same wrapper backlog item as S1.13a); never queue work in ../native-tsrx.
- Runtime follow-up: none.

### Batch 2 summary

| Scenario | Verdict | Probe kind | Backlog? |
| --- | --- | --- | --- |
| S2.01 | ALREADY-CORRECT | both | no |
| S2.02 | ALREADY-CORRECT | both | no (non-blocking: post-await reads still land in `dependencies`) |
| S2.03 | ALREADY-CORRECT | both | no |
| S2.04 | ALREADY-CORRECT | both | no |
| S2.05 | ERROR | new-probe | yes (MARKLESS_STATE_WRITE_IN_COMPUTED; write-site context) |
| S2.06 | ERROR | new-probe | yes (MARKLESS_STATE_CREATION_IN_COMPUTED; hoisted cell + lost dependency) |
| S2.07 | ERROR | new-probe | yes (reuse MARKLESS_STATE_NESTED_CREATION from S1.04) |
| S2.08 | ERROR | new-probe | yes (reuse MARKLESS_STATE_REPEAT_ROW_SCOPE_UNSUPPORTED from S6.13, extended to computed + repeat-alias dependency resolution) |
| S2.09 | ERROR | new-probe | yes (MARKLESS_COMPUTED_DEPENDENCY_CYCLE) |
| S2.10 | ALLOW | both | no |
| S2.11 | ERROR | new-probe | yes (sync-computed emit hole: payload/symbol/render emission or loud gate; highest-priority B2 item) |
| S2.12 | ALREADY-CORRECT | new-probe | no (message-quality note only) |
| S2.13 | ERROR | new-probe | yes (MARKLESS_TEMPLATE_AS_VALUE; shared with B4 template-as-value family) |
| S2.14 | ERROR | new-probe | yes (external-boundary wrap, message-quality fix only) |

Verdict counts: ALLOW 1, ALREADY-CORRECT 5, WARN 0, ERROR 8.

## Batch 3 — Events + sync policy

Run context (T009, 2026-07-04): all compiler "Observed" values below are verbatim from a temporary probe
test `packages/compiler/test/crazy-qa-b3-probe.test.ts` (one test per scenario plus controls, calling the
real `buildSemanticGraph` / `lowerStateAccess` / `planPayloadArena` / `planSymbolResolver` /
`analyzeCaptures` / `compileTsrxModule` entrypoints, deleted after the runs per T003 §6), executed with
`pnpm exec vp test packages/compiler/test/crazy-qa-b3-probe.test.ts` (15 tests passed; probe facts written
to a scratchpad log outside the repo and read back, because vp test suppresses console output). Re-verify
entries reran the cited existing files in one command:
`pnpm exec vp test packages/compiler/test/semantic-diagnostics.test.ts packages/compiler/test/sync-policy.test.ts packages/compiler/test/imported-helper-event-symbols.test.ts`
— 3 files, 21 tests, all passed. Browser usage: no temporary fixtures were needed — S3.10's runtime claim
is covered by the existing `rows-choose.tsrx` fixture (exactly the per-row-handler shape), rerun with
`pnpm exec vp test --project browser packages/vitest-browser/browser/constructs-csr.test.ts packages/vitest-browser/browser/constructs-ssr.test.ts`
(32 passed + 2 `test.fails` known-red children-projection tests); S3.08's and S3.11's runtime questions
are mooted by static emitted-module facts (statements absent from the emitted symbol module cannot
execute — the runtime dispatches exclusively through `loadSymbol` over these modules,
packages/web/src/resume.ts:813). TSRX MCP and grep MCP were unavailable this session; spec checks cite the
local split specs (fallback per AGENTS.md), and entries say so where the local spec is silent. All
snippets assume `import { state } from '@markless/core';` inside `export function App() @{ ... }` unless
shown otherwise.

Batch-level structural finding (cited per entry below): **event-handler symbol modules are synthesized
from lowered write records only.** `emitEventHandlerModule`
(packages/compiler/src/passes/symbol-modules.ts:146-199) builds the emitted module exclusively from the
symbol's `writes` (via `emitEventWrite` + a `supportedValueSource` whitelist of literal / event-field /
graph-read / local / imported-call value shapes). Every other authored statement — bare helper calls,
`await`, `preventDefault()`/`stopPropagation()`, `setTimeout`, guards around writes — is deleted from the
executable path with zero diagnostics; a handler with no emittable writes emits `void context;`. This is
even the asserted contract: symbol-modules.test.ts:1585 pins that `() => { if (clamp(total, 10)) total = 1; }`
emits the write UNCONDITIONALLY (guard deleted, import omitted), and :1638-1694 pins that a write whose
value calls a local helper emits `void context;`. The browser runtime executes only these emitted modules
(`loadSymbol(symbolId)`, packages/web/src/resume.ts:811-813), and every existing browser event fixture
(arm-events, input-echo, counter, rows-choose) uses handlers whose bodies are exactly graph writes, so no
test ever caught it. Also batch-relevant: NO browser fixture exercises a sync policy end to end (`grep
preventDefault packages/vitest-browser/browser/fixtures/*.tsrx` is empty), so the runtime half of the
sync-policy contract is browser-unproven (BM-deferred-to-B8). Affects S3.02, S3.03, S3.04, S3.05, S3.08,
S3.11.

B8 resolution (T015) of the batch-level sync-policy flag: RESOLVED with one positive and two new negatives
(`pnpm exec vp test --project browser packages/vitest-browser/browser/crazy-qa-b8-probe.test.ts`, temporary
fixture crazy-qa-b8-sync-policy.tsrx — a checkbox whose onClick is `(e) => { if (locked.on) { e.preventDefault(); count++; } }`
with graph state `locked`; policy extracted at compile as `{"when":{"type":"graph-truthy","graphNodeId":"state:locked","path":["on"]},"actions":["preventDefault"]}`,
write lazy in symbol:0). (1) POSITIVE — SSR first interaction: the checkbox stays `checked: false` while the
lazy write lands (`count: "1"`) — preventDefault is applied synchronously before the lazy symbol loads, end
to end in a real browser (inline resumer `y(record.syncPolicy, e)` + resume.ts:796/:1826). (2) NEGATIVE —
the fixture is event-only (no branches/repeats/handles/boundaries), and the event-only path NEVER sets
`__asyncResumeRuntimeStarted` (source-module.ts:177 sets it only in the needsFullResume branch), so EVERY
event re-enters the inline resumer, which evaluates graph-truthy conditions against the STATIC served
payload script (render-to-string.ts:220-269): after a resumed click sets `locked.on = false`, the next
checkbox click is STILL prevented (`checked: false`, `count: "2"`) — sync policy is permanently stale on
event-only pages. (3) NEGATIVE — CSR is nondeterministic: in 3 of 5 full-file runs the checkbox handler
never dispatched at all (`checked` toggled freely, `count` stayed `"0"`, zero rejections); in 2 of 5 runs it
behaved correctly with live-graph policy (`checked: false`, `count: "1"`, then unlock → `checked: true`).
The `count: "2"` values also re-confirm the batch emit finding: the authored guard around `count++` is
deleted from the lazy symbol, so the write runs even when `locked.on` is false.

### S3.01 — sync policy guard via helper call (unextractable)
- Snippet:
  ```tsrx
  const allow = state(false);
  <form>
    <button onClick={(e) => {
      if (canSubmit(allow, e)) {
        e.preventDefault();
      }
    }}>Save</button>
  </form>
  ```
- Probe layer: SG
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b3-probe.test.ts`
  - Observed: `MARKLESS_SYNC_POLICY_UNEXTRACTABLE`, severity `error`, phase `sync-policy`, title `Cannot extract synchronous event policy`, message `Cannot extract a synchronous preventDefault policy for onClick because the guard is not limited to graph state, event fields, props, and constants.`, why `preventDefault() and stopPropagation() must run before lazy handler symbols load. The compiler can only emit a synchronous policy when the condition is fully represented in the resumable graph/event data plane.`, suggestion `Move the browser-critical condition into graph state and simple event-field comparisons, or remove preventDefault()/stopPropagation() from the lazy handler.`, docsUrl `https://markless.dev/errors/MARKLESS_SYNC_POLICY_UNEXTRACTABLE`, span on `e.preventDefault()`. The event record is modeled (`hasSyncPolicyCandidate: true`, `syncPolicy` absent) and the guard's graph read still lowers (`slReads[0] = {"source":"allow","graphNodeId":"state:allow","path":[]}`).
  - Existing test: packages/compiler/test/semantic-diagnostics.test.ts:305 — rerun result: pass.
- Spec check: specs/framework/04-events-symbols-behaviors.md §Event handler arrays and sync policy — a policy "may not import code, call arbitrary user functions"; "If the cancellation/propagation condition cannot be proven from graph state, constants/props, and event fields, compilation fails with a diagnostic rather than silently emitting a handler whose default action is too late to matter." specs/framework/07-diagnostics.md names "unextractable sync event policy" as a required compile-time diagnostic.
- Verdict: ALREADY-CORRECT
- Rationale: The specced loud failure for a genuinely unprovable guard (arbitrary helper call), with the full consequence → why → fix → link shape and the timing model taught in one sentence ("must run before lazy handler symbols load"). The suggestion names the two sanctioned rewrites.
- Required diagnostic: n/a (ships today).
- Impl-note: collect-elements.ts:217-221 (candidate-but-no-policy check) + collect-sync-policy.ts (extraction).
- Runtime follow-up: none.

### S3.02 — graph write before the policy call
- Snippet:
  ```tsrx
  let count = state(0);
  <button onClick={(e) => { count++; e.preventDefault(); }}>{count}</button>
  ```
- Probe layer: SG + FC
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b3-probe.test.ts`
  - Observed (T002 snippet, unguarded): `MARKLESS_SYNC_POLICY_UNEXTRACTABLE` fires (same full shape as S3.01) even though there is NO guard at all — the extractor only scans `IfStatement`s (collect-sync-policy.ts:83-97), so an unconditional `e.preventDefault()` never extracts and the message blames a guard that does not exist. Control (bare `onSubmit={(e) => e.preventDefault()}`, the canonical form idiom): same error, and the emitted symbol module is `export function symbol_0(context) { void context; }` — the preventDefault is also deleted from the executable path (batch-level emit finding). Ordering variant (write BEFORE `e.preventDefault()` inside a `menu.open && e.key === 'Escape'` guard): compiles CLEAN — policy extracted exactly (`{"when":{"type":"and","conditions":[{"type":"graph-truthy","graphNodeId":"state:menu","path":["open"]},{"type":"event-equals","field":"key","value":"Escape"}]},"actions":["preventDefault"]}`), the write stays lazy in the symbol (`{"source":"menu.open","path":["open"],"operation":"assign","valueSource":"false"}`), zero diagnostics — statement order inside the guard is irrelevant to extraction, as it should be.
  - Existing test: packages/compiler/test/sync-policy.test.ts:131 — rerun result: pass.
- Spec check: specs/framework/04-events-symbols-behaviors.md §Event handler arrays and sync policy — the compiler "tries to extract the smallest equivalent sync policy from the surrounding condition"; "State writes remain in the lazy handler chunk." An unconditional action's condition is trivially `true`, which IS provable from constants; the spec's own policy grammar has `constant-truthy`.
- Verdict: ALLOW
- Rationale: The ordering claim is proven positively (guarded write-before-policy extracts identically to write-after; writes stay lazy). The unguarded shape — including the single most common form handler on the web, `onSubmit={(e) => e.preventDefault()}` — must also just work: its policy is the trivially-true `constant-truthy` case the extractor already supports as a guard operand, so refusing it fails the dominant idiom (rubric rule 3). Today it fails loudly but with a factually wrong message (there is no guard) and the emitted symbol silently drops the call.
- Required diagnostic: n/a (ideal is extraction; the current error is the gap, not the ideal).
- Impl-note: collect-sync-policy.ts `extractSyncPolicyFromBody` (:83-97) must treat top-level action calls as a branch with `when: {type:'constant-truthy', value:true}`; until then the UNEXTRACTABLE message needs a no-guard variant. Backlog item (unconditional sync-policy extraction).
- Runtime follow-up: BM-deferred-to-B8 (no browser fixture exercises any sync policy end to end; the runtime applies actions at packages/web/src/resume.ts:1835 but nothing browser-proves it).
- B8 resolution (T015): RESOLVED — see the B8 batch-note resolution above: SSR first-interaction preventDefault is browser-proven (checkbox stays unchecked while the lazy write lands), but the event-only path re-evaluates the policy from the static payload forever (writes never unlock it) and CSR dispatch of the policied event is nondeterministic (3 of 5 runs never fired). Node-side runtime tests packages/web/test/resume.test.ts:732/:781 (constant and branch policies before lazy symbols) reran green in the same batch.

### S3.03 — local named handler alias
- Snippet:
  ```tsrx
  let count = state(0);
  const handle = (e) => { e.preventDefault(); count++; };
  <form onSubmit={handle}>
    <button>Go</button>
  </form>
  ```
- Probe layer: SG + FC
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b3-probe.test.ts`
  - Observed: the event records the bare alias (`handlerSources: ["handle"]`, `handlerParameters: [[]]`) and `hasSyncPolicyCandidate: false` — the `e.preventDefault()` inside `handle` is INVISIBLE to policy extraction (no policy, no UNEXTRACTABLE; the candidate walk only sees the inline attribute expression). The `count++` lowers globally (`slWrites[0]` update record) but the symbol's `writes: []` — the write is not scoped into the handler symbol. Compilation does fail loudly, from a different pass: `MARKLESS_CAPTURE_UNSUPPORTED_VALUE`, severity `error`, phase `capture-analysis`, title `Cannot capture local function in lazy symbol`, message `Cannot capture "handle" in lazy event-handler symbol "symbol:0" because local function values cannot cross a resume boundary.`, why `Lazy symbols run after browser resume. Captures must be graph references, element handles, props/shared values, module imports, or serializable constants.`, suggestion `Move the helper to module scope, inline the derivation, or represent durable data with state()/computed().`. FC: the emitted symbol module is `export function symbol_0(context) { void context; }`.
  - Existing test: packages/compiler/test/sync-policy.test.ts:219 (handler arrays) — rerun result: pass.
- Spec check: specs/framework/04-events-symbols-behaviors.md §Event handler arrays and sync policy — extraction "uses the TSRX semantic graph: ... its value is a normal function AST"; a local `const handle = (e) => ...` referenced once IS a normal function AST the compiler already holds. Local spec is silent on alias resolution for handler references specifically; needs TSRX spec confirmation (TSRX MCP unavailable this session).
- Verdict: ALLOW
- Rationale: The universal authoring style (prep §10: named handlers) should just compile — the compiler has the full arrow AST in the same component scope and can treat `onSubmit={handle}` exactly like the inline form (symbol source = the function, policy extraction through the alias, writes scoped by the function's span). Today it fails loudly but wrongly: the capture error frames normal code as a resume violation, its first suggestion ("move the helper to module scope") leads straight into S3.04's inert-emit hole, and the `preventDefault()` inside the alias is silently lost to policy extraction before the loud error even fires (the silent half is what rubric rule 4 exists for — it must not survive an alias fix that pacifies capture analysis).
- Required diagnostic: n/a (ideal is support; the capture error keeps overall loudness until then).
- Impl-note: collect-elements.ts event collection + collect-sync-policy.ts `handlerExpressions` resolve only inline expressions; alias resolution through the existing semantic alias map is the fix (one resolver serves symbol planning, policy extraction, and write scoping). Backlog item.
- Runtime follow-up: none (compilation fails loudly today; nothing runs).

### S3.04 — imported handler reference
- Snippet:
  ```tsrx
  import { onRowClick } from './handlers';
  <button onClick={onRowClick}>Row</button>
  ```
- Probe layer: FC
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b3-probe.test.ts`
  - Observed: the PLAN is correct — event record (`handlerSources: ["onRowClick"]`), symbol plan `{"id":"symbol:0","kind":"event-handler","source":"onRowClick","moduleImports":[{"localName":"onRowClick","importedName":"onRowClick","source":"./handlers","kind":"named"}]}`, zero diagnostics in every pass (semanticGraph, stateLowering, payload, captureAnalysis all `[]`). But the EMITTED symbol module is `export function symbol_0(context) { void context; }` with `diagnostics: []` — `onRowClick` is never imported and never called in the executable path. The handler is silently inert.
  - Existing test: packages/compiler/test/imported-helper-event-symbols.test.ts:5 — rerun result: pass (it asserts `planSymbolResolver` output only, not emit).
- Spec check: specs/framework/04-events-symbols-behaviors.md §Symbol loading and event wiring — authored event props compile to view records with "ordered handler symbol IDs" and the resolver imports the symbol; imported handlers are the model's core use case. Captures rule (same section) explicitly allows "module imports".
- Verdict: ERROR
- Rationale: Silent inert lowering with no diagnostic (rubric rule 4, highest-priority class): the plan promises a working imported handler (correct `moduleImports`, capture analysis approves) and emit ships a no-op, so a click does nothing in a resumed page with zero compile-time or runtime signal. The batch-level writes-only emit synthesis is the root cause. Until real emission (import + call with the event argument) ships, the emitter must gate loudly instead of shipping dead handlers.
- Required diagnostic:
  - Code: MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED (new; the honest gate for handler bodies the emitter cannot represent — shared with S3.08)
  - Severity: error — Phase: capture-analysis (symbol-emit audit; emitted alongside the symbol-modules pass artifacts)
  - Title: This event handler cannot run in the browser yet
  - Message: `onClick={onRowClick}` plans a lazy symbol for `onRowClick`, but the generated browser module cannot call it yet, so clicking would do nothing.
  - Why: The browser runs generated symbol modules after resume; a handler the generator cannot express would ship as a silent no-op.
  - Suggestion(s): Write the handler inline with graph writes (`onClick={() => { ... }}`) until imported handler emission ships.
  - docsUrl: https://markless.dev/errors/MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED
- Impl-note: symbol-modules.ts `emitEventHandlerModule` (:146-199) — the real fix is emitting `import { onRowClick } from './handlers';` + `onRowClick(context.event)` (the plan already carries everything needed); the diagnostic is the honest boundary until then. Highest-priority B3 backlog item together with S3.08 (writes-only emit hole).
- Runtime follow-up: none (the emitted no-op is a static JavaScript fact; the runtime dispatches only through these modules).

### S3.05 — detached preventDefault reference
- Snippet:
  ```tsrx
  let count = state(0);
  <a href="/next" onClick={(e) => { const pd = e.preventDefault; pd(); count++; }}>Next</a>
  ```
- Probe layer: SG + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b3-probe.test.ts`
  - Observed: compiles CLEAN — `hasSyncPolicyCandidate: false` (the candidate detector requires a `MemberExpression` callee, collect-sync-policy.ts:57-64; the detached `pd()` has an identifier callee and the `e.preventDefault` member read is not a call), so no policy, no UNEXTRACTABLE, zero diagnostics in every pass. The emitted symbol module keeps ONLY the write: `context.graph.update({ graphNodeId: "state:count", ... })` — `const pd = e.preventDefault; pd();` is deleted from the executable path.
- Spec check: specs/framework/04-events-symbols-behaviors.md §Event handler arrays and sync policy — "compilation fails with a diagnostic rather than silently emitting a handler whose default action is too late to matter." This case ships exactly the forbidden outcome: a handler whose default action is silently never cancelled (the anchor navigates away).
- Verdict: ERROR
- Rationale: Silent wrong behavior on both ends (rubric rule 4): the author wrote a cancellation, the compiler neither extracts it nor diagnoses it, and the emitted handler drops it entirely — on an `<a href>`, the page navigates before the lazy `count++` can matter. The spec's own contract names this exact silence as the thing the diagnostic exists to prevent; the detector just cannot see a detached method reference.
- Required diagnostic:
  - Code: MARKLESS_SYNC_POLICY_UNEXTRACTABLE (reuse — the detached reference is an unextractable policy, not a new failure class)
  - Severity: error — Phase: sync-policy
  - Title: Cannot extract synchronous event policy
  - Message: `const pd = e.preventDefault; pd();` detaches preventDefault from the event, so the compiler cannot prove when the default action is cancelled for onClick.
  - Why: preventDefault() and stopPropagation() must run before lazy handler symbols load; a detached reference hides which action runs and under what condition.
  - Suggestion(s): Call it directly on the event parameter — before: `const pd = e.preventDefault; pd();` — after: `e.preventDefault();`.
  - docsUrl: https://markless.dev/errors/MARKLESS_SYNC_POLICY_UNEXTRACTABLE
- Impl-note: collect-sync-policy.ts `firstSyncPolicyActionCall` (:49-68) must also treat a non-call `MemberExpression` read of `preventDefault`/`stopPropagation` on the event parameter as a candidate (fail-closed), which routes this through the existing UNEXTRACTABLE path. Backlog item.
- Runtime follow-up: none (the dropped statements are static emit facts).

### S3.06 — non-function event prop: `onClick={count++}`
- Snippet:
  ```tsrx
  let count = state(0);
  <button onClick={count++}>{count}</button>
  ```
- Probe layer: SG + SL + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b3-probe.test.ts`
  - Observed: compiles CLEAN — zero diagnostics in every pass. The expression is treated as a handler: event record `{"handlerSources":["count++"],"handlerCount":1,"handlerParameters":[[]]}`, the write lowers as a normal graph write, and FC emits artifacts IDENTICAL to the proper `onClick={() => count++}` control: same `staticEventControls` (`[{"eventName":"click","hostNodeId":"h0","symbolIds":["symbol:0"]}]`) and the same emitted symbol (`context.graph.update({ graphNodeId: "state:count", ... return Number(value) + 1; })`).
- Spec check: specs/framework/04-events-symbols-behaviors.md §Event handler arrays and sync policy — "Event and behavior props accept either one expression or an array of expressions" where entries are handlers/function ASTs; a number is neither. JavaScript semantics: `onClick={count++}` evaluates the expression once at render (a render-time write) and passes `0`, not a function.
- Verdict: ERROR
- Rationale: The classic junior typo for `() => count++` is silently rewritten into the code the author probably meant — which is precisely the sigil-free model's line NOT to cross: `state()` declares graph state and the compiler owns reads/writes through it, but it must not change what a JavaScript expression means. A render-time write-and-pass-a-number becomes a per-click increment with zero diagnostics; the accident works until the author writes `onClick={handler()}` or `onClick={flag}` and trusts the same silence. Same eager-expression class as S1.09 (write in a template hole), at the event-prop site.
- Required diagnostic:
  - Code: MARKLESS_EVENT_HANDLER_NOT_A_FUNCTION (new; sibling of S1.09's MARKLESS_STATE_WRITE_IN_TEMPLATE)
  - Severity: error — Phase: semantic-graph
  - Title: Event props need a function
  - Message: `onClick={count++}` passes the result of `count++`, not a function. The expression would run once while rendering, and the click would receive a number.
  - Why: An event prop compiles to a lazy handler symbol that runs on the browser event; only a function (or an array of functions) can be that handler.
  - Suggestion(s): Wrap it — before: `onClick={count++}` — after: `onClick={() => count++}`.
  - docsUrl: https://markless.dev/errors/MARKLESS_EVENT_HANDLER_NOT_A_FUNCTION
- Impl-note: collect-elements.ts `collectAttribute` event branch (:210-236) accepts any expression shape; it needs a function/array-of-functions shape check before recording handlers. Backlog item.
- Runtime follow-up: none (compile-time verdict; emit equivalence proven at FC).

### S3.07 — `state()` created inside an event handler
- Snippet:
  ```tsrx
  <button onClick={() => { let draft = state(''); draft = 'hello'; }}>New</button>
  ```
- Probe layer: SG + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b3-probe.test.ts`
  - Observed: compiles CLEAN — zero diagnostics. `draft` is hoisted to a full top-level graph binding (`{"id":"state:draft","name":"draft","kind":"state","declarationKind":"let","writable":true,"valueKind":"scalar","initialValue":""}`) with a REAL planned payload cell (`{"graphNodeId":"state:draft","name":"draft","valueKind":"scalar","value":{"version":1,"root":"","records":[]}}`), exactly as S2.06 proved for computed bodies. The emitted symbol module drops the creation and keeps the write to the shared cell: `context.graph.write({ graphNodeId: "state:draft", path: [], value: 'hello' })`.
- Spec check: specs/framework/03-state-graph.md §Implementation — graph bindings are "owned by the nearest stable TSRX graph scope"; a handler body re-runs per event and is not a stable creation scope. The spec's "may be created anywhere in a call tree rooted in a component" (03:222) sanctions initial-render helpers, not per-event re-execution; local spec silent on the handler case specifically — needs TSRX spec confirmation (TSRX MCP unavailable this session).
- Verdict: ERROR
- Rationale: The "hooks in callbacks" placement habit (prep §8) is silently mis-modeled the same way as S2.06 (confirmed kinship): plain JavaScript says `state('')` runs on every click (a fresh value each time), but the compiler hoists it to ONE permanent component cell that exists before any click, is serialized into every payload, and is shared by all clicks. Both readings the author could have meant are violated, silently (rubric rule 4).
- Required diagnostic:
  - Code: MARKLESS_STATE_CREATION_IN_HANDLER (new; sibling of S2.06's MARKLESS_STATE_CREATION_IN_COMPUTED — one walk-site-context detector serves both)
  - Severity: error — Phase: semantic-graph
  - Title: state() cannot be created inside an event handler
  - Message: `state('')` creates `draft` inside an onClick handler. A handler runs once per event, so `draft` would be recreated on every click and could never keep a value between events.
  - Why: Graph state needs a stable owner scope to serialize and resume; an event handler is per-event behavior, not a stable scope.
  - Suggestion(s): Declare the state in the component body and write to it from the handler — before: `onClick={() => { let draft = state(''); draft = 'hello'; }}` — after: `let draft = state('');` in the body with `onClick={() => draft = 'hello'}`.
  - docsUrl: https://markless.dev/errors/MARKLESS_STATE_CREATION_IN_HANDLER
- Impl-note: collect-state's declaration walk has no am-I-inside-a-handler context (identical root cause to S2.06's am-I-inside-a-derive; B7's S7.05/S7.06 will need the same walk-site marker). Backlog item in the write-site-context family.
- Runtime follow-up: none (compile-time verdict; payload facts proven at FC).

### S3.08 — async handler: sync policy + post-await write
- Snippet:
  ```tsrx
  import { save } from './api';
  let count = state(0);
  <form onSubmit={async (e) => { e.preventDefault(); await save(); count++; }}>
    <button>Save</button>
  </form>
  ```
- Probe layer: SG + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b3-probe.test.ts`
  - Observed: `MARKLESS_SYNC_POLICY_UNEXTRACTABLE` fires (unconditional-action hole, same as S3.02's control) — the loud part blames a nonexistent guard. The symbol PLAN is right: `moduleImports: [{"localName":"save",...,"source":"./api"}]`, the post-await `count++` recorded in `writes` with no post-await distinction (no handler analog of MARKLESS_ASYNC_POST_AWAIT_READ fires, and none is needed for writes). But the EMITTED symbol module is ONLY `context.graph.update({ graphNodeId: "state:count", ... })` — no `save` import, no `await save()`, no `preventDefault()`. If the author silences the policy error by removing `e.preventDefault()`, the shipped handler increments `count` immediately and NEVER CALLS `save()`, with zero diagnostics.
- Spec check: specs/framework/04-events-symbols-behaviors.md §Event handler arrays and sync policy — the policy "may not ... await async work", so preventDefault must extract to the sync plane while the rest stays lazy (exactly this shape is why extraction exists); §Symbol loading — captures allow module imports, so the async body is representable. specs/framework/03-state-graph.md flush/journal semantics own the post-await write; nothing forbids it in a handler.
- Verdict: ERROR
- Rationale: The standard form-submit shape — the first async thing every junior wires — cannot ship correctly today, and its failure is the worst kind: half loud-but-misleading (a guard error with no guard), half silent (the emitted handler drops the await AND the imported call, then runs the "after save" write unconditionally and immediately; rubric rule 4). The ideal end state is full support: unconditional policy extracted synchronously, the async body emitted as authored, the post-await write flushing through the journal. Until emission can represent the body, the emitter must gate loudly.
- Required diagnostic:
  - Code: MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED (reuse — proposed in S3.04; one gate owns every handler body the writes-only emitter cannot represent)
  - Severity: error — Phase: capture-analysis (symbol-emit audit)
  - Title: This event handler cannot run in the browser yet
  - Message: The onSubmit handler awaits `save()` before writing `count`. The generated browser module can currently express only the graph writes, so `save()` would never run and `count` would update immediately.
  - Why: The browser runs generated symbol modules after resume; emitting only the writes would silently reorder and drop the author's logic.
  - Suggestion(s): Keep handler bodies to graph writes and extracted sync policy until full handler emission ships; move `save()` behind an async computed if the result should be derived state.
  - docsUrl: https://markless.dev/errors/MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED
- Impl-note: two owning sites — symbol-modules.ts `emitEventHandlerModule` (the writes-only synthesis is the batch-level structural finding; full-body emission with import re-emission is the fix) and collect-sync-policy.ts (S3.02's unconditional extraction). Highest-priority B3 backlog item.
- Runtime follow-up: none (the emitted module IS the runtime behavior; browser probing would only re-observe the absence of `save()`).

### S3.09 — module-const guard: `MODE === 'strict'`
- Snippet:
  ```tsrx
  const MODE = 'strict'; // module scope
  <input onKeyDown={(e) => { if (MODE === 'strict') e.preventDefault(); }} />
  ```
- Probe layer: SG
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b3-probe.test.ts`
  - Observed: the constant IS collected (`syncPolicyConstants: [{"name":"MODE","value":"strict"}]`) yet `MARKLESS_SYNC_POLICY_UNEXTRACTABLE` fires — `extractSyncCondition` handles `BinaryExpression` only as event-field-vs-literal (collect-sync-policy.ts:144-161), so a constant-vs-literal comparison never folds even though both sides are compile-time known. The message claims the guard "is not limited to graph state, event fields, props, and constants" — factually wrong for this input (it is exactly a constant and a literal). The truthy forms of the same family all extract to `{"type":"constant-truthy","value":true}` (existing rich coverage).
  - Existing test: packages/compiler/test/sync-policy.test.ts:184/:269/:304/:339/:374/:409 — rerun result: pass (module-scope, literal, object-property, computed, array-index constants and negated graph guards all extract).
- Spec check: specs/framework/04-events-symbols-behaviors.md §Event handler arrays and sync policy — the policy "may read only already-resumed framework graph state, serializable constants/props, and simple event fields"; `MODE === 'strict'` reads one serializable constant and one literal.
- Verdict: ALLOW
- Rationale: Config-driven policy guards are ordinary and spec-sanctioned; the constants plane already exists and is well tested for truthy operands (six extraction forms rerun green). Folding a pure constant-vs-literal equality into `constant-truthy` is the same one step the extractor already performs for computed constants like `(2 > 1) && !false` — the compiler should just handle it rather than erroring with a message that misdescribes the author's code.
- Required diagnostic: n/a (ideal is extraction).
- Impl-note: collect-sync-policy.ts `extractSyncCondition` BinaryExpression branch — when neither side is an event field, try `syncPolicyConstantValue`/literal on BOTH sides and fold `===`/`==` to `constant-truthy`. Backlog item (small, isolated).
- Runtime follow-up: BM-deferred-to-B8 (shared with S3.02: no browser fixture exercises sync policy end to end).
- B8 resolution (T015): RESOLVED — shared flag closed by the S3.02/batch-note B8 resolution (graph-guarded preventDefault browser-proven on SSR first interaction; event-only staleness and CSR nondeterminism recorded there apply to any policy this scenario's constant fold would produce).

### S3.10 — per-row handler capturing the repeat alias
- Snippet:
  ```tsrx
  let tabs = state([{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }]);
  let selected = state('a');
  <ul>
    @for (const t of tabs; key t.id) {
      <li><button onClick={() => selected = t.id}>{t.label}</button></li>
    }
  </ul>
  ```
- Probe layer: FC + BM
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b3-probe.test.ts`
  - Observed: the write lowers with the alias in the value (`{"source":"selected","graphNodeId":"state:selected","path":[],"operation":"assign","valueSource":"t.id"}`), capture analysis raises nothing for `t` (`captureDiagnostics: []`), the repeat gate is compiler-proven (`{"repeatId":"repeat:0","supported":true}`, `planDiagnostics: []`), and the emitted symbol module materializes the row alias through a dedicated locals plane: `context.graph.write({ graphNodeId: "state:selected", path: [], value: context.locals?.t?.id })`. Contrast with S2.08: event WRITES resolve the repeat alias via `context.locals`, while computed dependency collection still cannot see the same alias — the blindness is per-consumer, not global.
  - Existing test: packages/vitest-browser/browser/constructs-csr.test.ts:117 and constructs-ssr.test.ts:113 (rows-choose.tsrx — the identical per-row `onClick={() => chosen = entry.code}` shape; clicking row 2 yields `beta`) — rerun result: pass in a real browser, CSR and SSR+resume.
- Spec check: specs/framework/04-events-symbols-behaviors.md §Symbol loading and event wiring — "Captures are materialized by the runtime from graph references, serializable constants, props/shared references, and element locators"; specs/framework/01-tsrx-host-contract.md §Loop identity — keyed items own their per-item interaction identity.
- Verdict: ALREADY-CORRECT
- Rationale: The #1 list interaction shape is proven at both required levels: positive compile artifacts (alias-aware emitted write through `context.locals`, supported gate, clean capture analysis) AND existing real-browser tests in both render modes showing the clicked row's own value landing in graph state. This is the working half of the repeat-alias story whose broken half S2.08 catalogued for computed dependencies.
- Required diagnostic: n/a.
- Impl-note: none for events; S2.08's impl-note (repeat aliases invisible to `collectGraphDependencies`) remains the computed-side gap, now sharpened: the `context.locals` materialization proves per-row data CAN reach lazy symbols, so the computed side lacks only collection, not runtime plumbing.
- Runtime follow-up: none (browser-proven via existing fixtures this batch).

### S3.11 — event object escaping into setTimeout
- Snippet:
  ```tsrx
  <button onClick={(e) => setTimeout(() => e.currentTarget.focus(), 0)}>Focus soon</button>
  ```
- Probe layer: SG + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b3-probe.test.ts`
  - Observed: compiles CLEAN — zero diagnostics in every pass (`hasSyncPolicyCandidate: false`, `captureDiagnostics: []`), and the emitted symbol module is `export function symbol_0(context) { void context; }` — the entire `setTimeout(() => e.currentTarget.focus(), 0)` body is deleted from the executable path (no writes to synthesize; batch-level emit finding). Nothing is scheduled, nothing focuses, nothing warns.
- Spec check: specs/framework/04-events-symbols-behaviors.md §DOM element handles — `element()` exists precisely for "focus registries ... and cross-event DOM access"; the spec's own SearchBox example is `onClick={() => input?.focus()}` through a handle. DOM semantics (not framework-specific): `event.currentTarget` is `null` once dispatch completes, so reading it inside a timer callback is a latent bug even in vanilla JS.
- Verdict: WARN
- Rationale: Two layers. Today's behavior is silent inert emit (rubric rule 4 forces WARN/ERROR) — owned by the batch-level emit hole (S3.08's backlog restores authored bodies). Once bodies run as authored, the escape itself is the enduring question: `e.currentTarget` after a tick is deterministically `null` (the AST proves the reference sits inside a function passed to `setTimeout`), yet escaping the event to read plain fields later (`e.clientX`, `e.key`) is legitimate — sometimes-intentional is exactly the WARN tier. The framework has a confident better answer to teach: name the element with `element()` instead of chasing the event object.
- Required diagnostic:
  - Code: MARKLESS_EVENT_TARGET_ESCAPE (new)
  - Severity: warning — Phase: semantic-graph
  - Title: e.currentTarget is null after the handler returns
  - Message: `e.currentTarget.focus()` runs inside setTimeout, after the onClick dispatch has finished — by then `e.currentTarget` is null, so the focus call would throw.
  - Why: The browser clears `currentTarget` when event dispatch completes; only an element handle names the element durably across ticks and resume.
  - Suggestion(s): Use an element handle — before: `onClick={(e) => setTimeout(() => e.currentTarget.focus(), 0)}` — after: `let btn = element<HTMLButtonElement>();` with `<button el={btn} onClick={() => setTimeout(() => btn?.focus(), 0)}>`.
  - docsUrl: https://markless.dev/errors/MARKLESS_EVENT_TARGET_ESCAPE
  - Escape hatch (WARN only): `// markless-allow MARKLESS_EVENT_TARGET_ESCAPE: reading plain event fields later is intended` on the handler line silences exactly this site (for escapes that read fields other than currentTarget/target, the detector should not fire at all).
- Impl-note: detector belongs in collect-elements/collect-expressions (event-parameter reference inside a nested function passed to a scheduling call, narrowed to `currentTarget`/`target` member reads); the inert-emit half is S3.08's structural backlog, not a separate item.
- Runtime follow-up: none today (the emitted no-op is a static fact); after the emit fix, BM-deferred-to-B8 for the lazy-dispatch timing story (whether first-interaction symbol loading itself completes dispatch before the handler body runs).
- B8 resolution (T015): BLOCKED on backlog fix (the S3.08 handler-body emit fix has not landed; the post-fix lazy-dispatch timing story — shared with S3.05's detached-reference case — remains a non-probe by design).

### S3.12 — spread of a handlers object: `<input {...handlers} />`
- Snippet:
  ```tsrx
  let count = state(0);
  let text = state('');
  const handlers = { onClick: () => { count++; }, onInput: (e) => { text = e.target.value; } };
  <section>
    <input {...handlers} />
    <p>{count} {text}</p>
  </section>
  ```
- Probe layer: SG + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b3-probe.test.ts`
  - Observed: zero diagnostics in every pass, and the handlers vanish threefold. (1) Semantic graph: `events: []`, `payloadViewEvents: []`, no event-handler symbols — spread attributes never reach event collection (collect-elements.ts `collectAttribute` returns early without an attribute name), yet the writes INSIDE the object literal are collected as ordinary component writes (`slWrites` has both `count` update and `text = e.target.value` — the latter referencing an `e` that no plane owns) and dom-update symbols are planned for `count`/`text`, values nothing can ever change. (2) Render emit: both render modules build `marklessCsrSpreadAttributes({ ...(handlers) }, null)` / SSR equivalent while declaring only `let count`/`let text` — `handlers` is an UNDECLARED identifier in the emitted modules (guaranteed ReferenceError by JavaScript semantics, same class as B2's sync-computed CSR hole). (3) Even past that, the shared spread helper hard-skips event keys by design: `if (!/^[A-Za-z_][\\w.:-]*$/.test(key) || /^on[A-Z]/.test(key) || key === "attach" || key === "el" || key === "children") continue;`.
- Spec check: specs/framework/04-events-symbols-behaviors.md §Symbol loading and event wiring — "The compiler and bundler own event discovery"; events must be static view records, so runtime-spread handlers have no home in the model (the helper's on*-skip is the correct runtime posture). Local spec is silent on diagnosing authored handler spreads; needs TSRX spec confirmation (TSRX MCP unavailable this session).
- Verdict: ERROR
- Rationale: The wrapper-component habit (spread a props/handlers bag) dies silently three ways: no event is discovered, the emitted module crashes on an undeclared identifier with zero diagnostics (rubric rule 4), and the runtime helper would discard the handlers anyway. The model genuinely cannot support runtime event spreads (compile-time event discovery is the resumability contract), so the ideal is a loud, teaching rejection whenever the compiler can see on* keys flowing into a spread — here it statically sees the object literal.
- Required diagnostic:
  - Code: MARKLESS_EVENT_SPREAD_UNSUPPORTED (new)
  - Severity: error — Phase: semantic-graph
  - Title: Event handlers cannot be spread onto an element
  - Message: `{...handlers}` spreads `onClick` and `onInput` onto `<input>`. Events compile to static view records, so handlers inside a spread are discarded — the input would never react.
  - Why: The compiler owns event discovery so the browser can resume without scanning markup; a runtime spread hides which events exist from the compiler.
  - Suggestion(s): Write the event props directly — before: `<input {...handlers} />` — after: `<input onClick={handlers.onClick} onInput={handlers.onInput} />` (or inline the two handlers); keep the spread for plain attributes only.
  - docsUrl: https://markless.dev/errors/MARKLESS_EVENT_SPREAD_UNSUPPORTED
- Impl-note: collect-elements.ts needs a spread-attribute branch that resolves the spread source through the alias map and errors when the resolved object (or its literal) carries `on*`/`attach`/`el` keys; the undeclared-`handlers` render-module emit is a distinct bug-class backlog item (public-render module must declare or reject locals it interpolates — same family as B2's sync-computed emit hole); the stray `e.target.value` write collection is the S1.08/S2.05 site-context family.
- Runtime follow-up: none (the undeclared identifier is a static JavaScript fact).

### Batch 3 summary

| Scenario | Verdict | Probe kind | Backlog? |
| --- | --- | --- | --- |
| S3.01 | ALREADY-CORRECT | both | no |
| S3.02 | ALLOW | both | yes (unconditional sync-policy extraction as constant-truthy true; no-guard message variant) |
| S3.03 | ALLOW | both | yes (handler alias inlining + policy extraction through aliases; capture-error suggestion currently leads into S3.04's hole) |
| S3.04 | ERROR | both | yes (MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED gate or real imported-handler emission; plan-only test coverage) |
| S3.05 | ERROR | new-probe | yes (reuse MARKLESS_SYNC_POLICY_UNEXTRACTABLE; detached-reference candidate detection) |
| S3.06 | ERROR | new-probe | yes (MARKLESS_EVENT_HANDLER_NOT_A_FUNCTION) |
| S3.07 | ERROR | new-probe | yes (MARKLESS_STATE_CREATION_IN_HANDLER; walk-site-context family with S2.06) |
| S3.08 | ERROR | new-probe | yes (writes-only handler emit drops await/imports/policy — highest-priority B3 item, shared with S3.04) |
| S3.09 | ALLOW | both | yes (fold constant-vs-literal equality in sync policy guards) |
| S3.10 | ALREADY-CORRECT | both | no (S2.08's computed-side alias gap already filed) |
| S3.11 | WARN | new-probe | yes (MARKLESS_EVENT_TARGET_ESCAPE; inert-emit half owned by S3.08's item) |
| S3.12 | ERROR | new-probe | yes (MARKLESS_EVENT_SPREAD_UNSUPPORTED + undeclared-local render emit bug) |

Verdict counts: ALLOW 3, ALREADY-CORRECT 2, WARN 1, ERROR 6.

## Batch 7 — Module/scope & shared

Run context (T010, 2026-07-04): all "Observed" values below are verbatim from a temporary probe test
`packages/compiler/test/crazy-qa-b7-probe.test.ts` (one test per scenario plus controls, calling the real
`buildSemanticGraph` / `lowerStateAccess` / `planPayloadArena` / `planSymbolResolver` / `analyzeCaptures`
/ `compileTsrxModule` entrypoints, deleted after the runs per T003 §6), executed with
`pnpm exec vp test packages/compiler/test/crazy-qa-b7-probe.test.ts` (17 tests passed; probe facts written
to a scratchpad log outside the repo and read back, because vp test suppresses console output). Re-verify
entries reran the cited existing files in one command:
`pnpm exec vp test packages/compiler/test/semantic-diagnostics.test.ts packages/compiler/test/semantic-module-scope-collector.test.ts packages/compiler/test/semantic-graph.test.ts packages/compiler/test/capture-analysis.test.ts packages/compiler/test/state-lowering.test.ts`
— 5 files, 56 tests, all passed. Browser usage: none — every B7 claim is a compile-time artifact or
static emitted-module fact; no runtime claim was verdict-decisive. Cross-module harness search (S7.07
precondition): `compileTsrxModule` takes exactly one `{ filename, source }` (packages/compiler/src/compile-module.ts:35);
the bundler compiles each id independently (packages/bundler/src/transform.ts:25 calls `compileTsrxModule`
per module inside the plugin `transform` hook); no compiler/bundler test or fixture compiles a linked
multi-module graph, and no bundler fixture imports a `state()` binding from a sibling `.tsrx` module —
**no multi-module compile helper exists**, so S7.07's cross-module runtime claim is recorded per-module
and flagged `needs bundler-level probe — unobserved`. TSRX MCP and grep MCP were unavailable this session;
spec checks cite the local split specs (fallback per AGENTS.md), and entries say so where the local spec
is silent. All snippets assume `import { state, shared } from '@markless/core';` inside
`export function App() @{ ... }` unless shown otherwise.

Batch-level structural findings (cited per entry below): (1) **collect-state's declaration walk has no
site context**, confirming and extending S2.06/S3.07: a `state()` declarator inside a plain helper
function (S7.05), an `if` block (S7.06), or a `for` body (S7.06) is hoisted to an unconditional top-level
component graph binding with a REAL planned payload cell and zero diagnostics — the walk records WHAT was
declared but never WHERE. (2) **Every write to a plain (non-graph) local in a `.tsrx` component body is a
compile error today**: the S7.06 control proved that `let total = 0; for (let i = 0; i < 3; i++) { total += i; }`
with NO state creation fails with two `MARKLESS_STATE_UNRESOLVED_WRITE` diagnostics (`"i"`, `"total"`)
whose own suggestion says to "move non-graph mutation into normal local code" — the exact thing that
errored. This over-broad write rejection masks the placement findings (S7.06's only diagnostic is the
accidental loop-counter misfire) and accidentally blocks escapes (S7.08 errors for the wrong reason);
if it is ever relaxed to allow plain local mutation, S7.08's registry escape becomes fully silent.

### S7.01 — module-scope state()
- Snippet:
  ```tsrx
  export const count = state(0); // module scope

  export function Counter() @{
    <button onClick={() => count++}>{count}</button>
  }
  ```
- Probe layer: SG + SL
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b7-probe.test.ts`
  - Observed: `MARKLESS_STATE_MODULE_SCOPE`, severity `error`, phase `semantic-graph`, title `state() and computed() cannot be created at module scope`, message `Cannot create "count" with state() at module scope.`, why `Module-scope graph state would be shared across requests and has no per-document serialization payload.`, suggestion `Move state() or computed() creation into a component or declare request/container/page state with shared().`, docsUrl `https://markless.dev/errors/MARKLESS_STATE_MODULE_SCOPE`. `graphBindings: []` (no phantom binding). The handler's `count++` additionally errors `MARKLESS_STATE_UNRESOLVED_WRITE` (`Cannot write to "count" because it does not resolve to graph state.`) — consistent, since no binding was created.
  - Existing tests: packages/compiler/test/semantic-diagnostics.test.ts:164 (exact-shape, two diagnostics with spans) and packages/compiler/test/semantic-module-scope-collector.test.ts:9 — rerun result: pass.
- Spec check: specs/framework/03-state-graph.md:224-228 — "Creation at **module scope** is a compile-time diagnostic in v1: module-scope state would be shared across requests on the host runtime and has no home in the per-document serialization payload." The shipped why is the spec sentence nearly verbatim.
- Verdict: ALREADY-CORRECT
- Rationale: The singleton-state habit fails loudly with the spec's own reasoning and the sanctioned rewrite (`shared()`) named first. Minor polish note only: the follow-on `MARKLESS_STATE_UNRESOLVED_WRITE` on `count++` is derivative noise once the creation already errored — suppressing cascade diagnostics for bindings that failed creation would sharpen the first-contact experience.
- Required diagnostic: n/a (ships today).
- Impl-note: collect-module-scope (collectModuleScopeGraphCreation).
- Runtime follow-up: none.

### S7.02 — shared definition cycle A↔B
- Snippet:
  ```tsrx
  export const session = shared(() => { const cartInstance = cart(); const s = state({ user: null }); return { ...s }; });
  export const cart = shared(() => { const sessionInstance = session(); const c = state({ items: [] }); return { ...c }; });
  ```
- Probe layer: SG
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b7-probe.test.ts`
  - Observed: `MARKLESS_SHARED_DEFINITION_CYCLE`, severity `error`, phase `semantic-graph`, title `Shared definitions cannot depend on each other circularly`, message `Cannot create shared definition cycle "session -> cart -> session".`, why `shared() instances are created from graph context during initial render and resume. A cycle would require one shared instance before its own dependency graph can be created.`, suggestion `Break the shared() dependency cycle by passing plain data between definitions or by moving the shared read into an event method that runs after instance creation.`, docsUrl `https://markless.dev/errors/MARKLESS_SHARED_DEFINITION_CYCLE`. Positive artifact facts: both definitions carry `dependencies` records with spans, and factory return properties are modeled (`{"kind":"graph","name":"user","source":"...s","graphNodeId":"shared:src/shared-cycle.tsrx#session/state:s","path":["user"]}`).
  - Existing test: packages/compiler/test/semantic-diagnostics.test.ts:215 — rerun result: pass.
- Spec check: specs/framework/03-state-graph.md:549-550 — "The compiler can see shared-definition dependencies and should reject circular definition graphs with a diagnostic that prints the cycle." The shipped message prints the cycle exactly as specced.
- Verdict: ALREADY-CORRECT
- Rationale: The composition foot-gun the spec names, rejected with the cycle printed in the user's own definition names and both sanctioned rewrites offered (plain data between factories, or read-at-event-time).
- Required diagnostic: n/a (ships today).
- Impl-note: collect-shared (collectSharedDefinitionDependencies + reportSharedDefinitionCycles).
- Runtime follow-up: none.

### S7.03 — bare state() with no import / LOCAL function named state
- Snippet:
  ```tsrx
  // (a) no import at all:            const x = state(5);
  // (b) user-defined local function:
  function state(value) { return value * 2; }
  export function App() @{
    const x = state(5);
    <p>{x}</p>
  }
  ```
- Probe layer: SG
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b7-probe.test.ts`
  - Observed (a, forgotten import): `MARKLESS_FRAMEWORK_IMPORT_REQUIRED`, severity `error`, title `Framework API must be imported`, message `Cannot use state() until it is imported from markless.`, why `state() is a compiler-rewritten markless API. The import makes ownership explicit for TypeScript, editors, junior developers, and AI agents.`, suggestion ``Add `import { state } from '@markless/core';` to this .tsrx file.``, docsUrl `https://markless.dev/errors/MARKLESS_FRAMEWORK_IMPORT_REQUIRED`; `graphBindings: []`.
  - Observed (b, shadowing local function): the SAME diagnostic fires with the SAME message and suggestion — the compiler does NOT distinguish a user-defined local `state` function from a forgotten import (`getFrameworkApiForCall` checks only the imports map; no scope resolution). Following the suggestion would shadow the user's own function and change their program. Additionally observed: `graphBindings` contains `{"id":"prop:value","name":"value","kind":"prop","declarationKind":"const","writable":false,"valueKind":"object"}` — the helper's parameter `value` was collected as a component PROP graph binding, polluting the artifact with a binding from a non-component plain function.
  - Existing test: packages/compiler/test/semantic-diagnostics.test.ts:242 (three-API exact-shape) — rerun result: pass.
- Spec check: specs/framework/03-state-graph.md:246-248 — "Bare calls with the same names are rejected with a diagnostic that asks the author to import the API from `@markless/core`." specs/framework/07-diagnostics.md:96-97 lists bare non-imported calls as required diagnostics. The spec mandates rejection for BOTH variants; it does not license the wrong message or the prop pollution for (b).
- Verdict: ERROR
- Rationale: Variant (a) is the specced outcome and ships in model shape (ALREADY-CORRECT on its own). Variant (b) keeps the mandated rejection but fails the shape bar (rubric rule 7): the message asserts an import is missing when the author deliberately defined a local `state` function, and the suggested fix would silently shadow that function. The `prop:value` artifact pollution is a real collector bug (a plain module function's parameter became a prop graph binding), independent of message quality.
- Required diagnostic (for variant b; reuse):
  - Code: MARKLESS_FRAMEWORK_IMPORT_REQUIRED (reuse — shadow-aware message variant)
  - Severity: error — Phase: semantic-graph
  - Title: Framework API must be imported
  - Message: `state(5)` calls your local function `state`, but in `.tsrx` files `state` is a compiler-recognized markless API name. Rename the local function, or import the framework API from `@markless/core`.
  - Why: The compiler recognizes `state`/`computed`/`element`/`shared` by name in `.tsrx` reactive scopes so that graph ownership stays unambiguous for readers and tools.
  - Suggestion(s): Rename the helper (before: `function state(value) { ... }` — after: `function doubleValue(value) { ... }`), or, if graph state was intended, delete the helper and add `import { state } from '@markless/core';`.
  - docsUrl: https://markless.dev/errors/MARKLESS_FRAMEWORK_IMPORT_REQUIRED
- Impl-note: message-quality fix in collect-state/collect-module-scope (detect an in-scope local declaration named like a framework API before emitting the import-asking wording); separate bug: collect-components treats the plain helper `function state(value)` as a component-like scope and records `prop:value` — the component detector needs to exclude non-TSRX plain functions.
- Runtime follow-up: none.

### S7.04 — TSRX submodules
- Snippet:
  ```tsrx
  module server {
    export function loadData() { return 'from-server'; }
  }
  import { loadData } from server;
  ```
- Probe layer: SG
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b7-probe.test.ts`
  - Observed: two diagnostics, both `MARKLESS_SUBMODULE_UNSUPPORTED`, severity `error`, title `TSRX submodules are not supported by this host yet`. Block: `The submodule block "module server { ... }" has no server/client boundary semantics in markless yet; its code runs wherever this module runs.` Import: `The identifier-source import "import ... from server;" has no submodule resolution in markless yet; nothing is split out of the client bundle.` Shared why: `TSRX defines submodule syntax but defers boundary semantics to the host. Until markless implements splitting, treating this as supported would silently ship server-intended code to the client.` Suggestion: `Move the code into a separate module with a string import specifier, or wait for the submodule host boundary decision in specs/framework/08-deferred-decisions.md.` The rest of the module still compiles into artifacts (`state:label` binding exists).
  - Existing test: packages/compiler/test/semantic-graph.test.ts:461 — rerun result: pass.
- Spec check: TSRX owns submodule syntax; the host boundary decision is deferred in specs/framework/08-deferred-decisions.md (the diagnostic's own suggestion cites it). TSRX MCP unavailable this session — local-spec fallback per AGENTS.md.
- Verdict: ALREADY-CORRECT
- Rationale: An honest capability boundary at its best: both the block and the identifier-source import are caught separately, the why names the concrete danger (server-intended code silently shipping to the client), and the suggestion gives both the workaround and the pending decision document.
- Required diagnostic: n/a (ships today).
- Impl-note: semantic-graph submodule detection; `external-boundary`-adjacent (TSRX syntax, markless host semantics).
- Runtime follow-up: none.

### S7.05 — state() created in a plain helper function (custom-hook habit)
- Snippet:
  ```tsrx
  function useCounter() {
    let c = state(0);
    return c;
  }
  export function App() @{
    const count = useCounter();
    <button onClick={() => count++}>{count}</button>
  }
  ```
- Probe layer: SG + SL + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b7-probe.test.ts`
  - Observed: zero semantic-graph diagnostics. The helper's declaration is hoisted to a full top-level component binding `{"id":"state:c","name":"c","kind":"state","declarationKind":"let","writable":true,"valueKind":"scalar","initialValue":0}` with a REAL planned payload cell (`{"graphNodeId":"state:c","name":"c","valueKind":"scalar","value":{"version":1,"root":0,"records":[]}}`), but the component's `const count = useCounter()` creates NOTHING (`aliases: []`, no binding, no local binding) — the return-value link from the call to `state:c` is severed. Compilation then fails on the handler: `MARKLESS_STATE_UNRESOLVED_WRITE`, `Cannot write to "count" because it does not resolve to graph state.` — misleading for an author who followed the spec's helper allowance. `{count}` produces no lowered read; the emitted event-handler symbol module is `export function symbol_0(context) {\n\tvoid context;\n}` (inert). Alternate-shape control (helper local named `inner` ≠ component local `count`) reproduced identically — no name-collision magic.
- Spec check: specs/framework/03-state-graph.md:222-224 — "`state()`/`computed()` may be created anywhere in a call tree rooted in a component or shared instance — including helper functions in non-component `.tsrx` files." The custom-hook habit is SPEC-SANCTIONED; the implementation mis-models it.
- Verdict: ERROR
- Rationale: A spec-vs-implementation conflict, half silent: the cell is created and serialized into every payload (walk-site-context family, same root cause as S2.06/S3.07), while the author's actual handle (`count`) falls outside the graph and the only diagnostic blames the wrong thing. Ideal end-state per spec is ALLOW (track the alias through the helper's return value). Until that exists, the honest outcome is a loud capability gate at the creation site, S1.15-style ("not supported yet"), never a hoisted phantom cell plus a misleading write error.
- Required diagnostic (capability gate until call-tree aliasing ships):
  - Code: MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED (new; walk-site-context family — see T900 note below)
  - Severity: error — Phase: semantic-graph
  - Title: Returning state() from a helper is not supported yet
  - Message: `useCounter()` creates `c` with state() and returns it, but the compiler cannot yet connect `count` in `App` to that graph cell. Reads and writes of `count` would fall outside the graph.
  - Why: Every graph cell needs a compiler-known owner and alias path to serialize and resume; the current pass does not track cells through helper return values.
  - Suggestion(s): Declare the state in the component and pass it to helpers — before: `const count = useCounter();` — after: `let count = state(0);` (helpers may read and write `count` directly; reactivity crosses `.tsrx` function boundaries).
  - docsUrl: https://markless.dev/errors/MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED
- Impl-note: collect-state's declaration walk lacks a current-function context (S2.06/S3.07's identical root cause); the spec's end-state needs return-value alias tracking in collect-aliases. T900 option: unify MARKLESS_STATE_CREATION_IN_COMPUTED / _IN_HANDLER / this code / S7.06's code into one placement/site-context code with site-specific messages — one walk-site marker serves all of them.
- Runtime follow-up: none (compile-time verdict; payload and emitted-module facts proven at FC).

### S7.06 — conditional and loop state() creation ("but my condition is static")
- Snippet:
  ```tsrx
  let flag = state(true);
  if (flag) {
    const extra = state(0);
  }
  for (let i = 0; i < 3; i++) {
    const item = state(i);
  }
  <p>{flag}</p>
  ```
- Probe layer: SG + SL + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b7-probe.test.ts`
  - Observed: zero placement diagnostics. Both creations are hoisted to unconditional top-level bindings — `state:extra` (`initialValue: 0`) and `state:item` (`valueKind: "unknown"`) — and BOTH get planned payload cells (`state:extra` root `0`; `state:item` root `{"$type":"undefined"}`), as if declared once at component top level: the `if` guard and the per-iteration semantics are erased from every artifact. The CSR module declares all three unconditionally (`let flag = ...; let extra = ...; let item = ...`). The ONLY diagnostic is an accidental one: `MARKLESS_STATE_UNRESOLVED_WRITE` on the loop counter (`Cannot write to "i" because it does not resolve to graph state.`). Control run (same loop, NO state creation inside): `let total = 0; for (let i = 0; i < 3; i++) { total += i; }` fails with the SAME two unresolved-write errors on `i` and `total` — plain local JavaScript mutation in a component body is a compile error today regardless of state placement.
- Spec check: specs/framework/03-state-graph.md:245-246 — graph bindings are "owned by the nearest stable TSRX graph scope"; :224-226 — the payload is per-document and every cell must have a home in it. An `if` arm evaluated once during initial render and a `for` body that runs three times are not stable graph scopes; the local spec is silent on the conditional/loop creation case specifically — needs TSRX spec confirmation (TSRX MCP unavailable this session).
- Verdict: ERROR
- Rationale: The rules-fighting family's core case, and today it is silently mis-modeled: plain JavaScript says `extra` exists only when `flag` is truthy and `item` is a fresh cell per iteration, but the artifacts record one unconditional cell each, serialized into every payload. To the "but my condition is static" pushback the graph model has a concrete answer: the payload arena must know every cell at compile time to plan the per-document payload, and a conditionally- or repeatedly-created cell has no stable identity across requests — a request where `flag` is false still ships and resumes a cell the author believes does not exist, and three loop iterations cannot share one cell without silently changing program meaning. The loop-counter misfire (and the control) is a separate over-broad rejection of ordinary local code that currently masks this hole.
- Required diagnostic:
  - Code: MARKLESS_STATE_CREATION_SITE_UNSTABLE (new; T900 may unify with MARKLESS_STATE_CREATION_IN_COMPUTED / _IN_HANDLER / S7.05 — same walk-site-context detector)
  - Severity: error — Phase: semantic-graph
  - Title: state() needs a stable creation site
  - Message: `state(0)` creates `extra` inside `if (flag) { ... }`. Graph cells are planned into the payload at compile time, so `extra` would exist in every request's payload whether or not `flag` is true — even when your condition never changes at runtime.
  - Why: The payload arena must know every cell before rendering to serialize and resume the document; a cell created inside a branch or loop has no stable identity across requests or iterations.
  - Suggestion(s): Declare the cell unconditionally and branch on the value — before: `if (flag) { const extra = state(0); }` — after: `const extra = state(0);` with `@if (flag) { ... }` around the UI that uses it. For per-item state, key the repeat (`@for (... ; key item.id)`) so each row owns its local graph scope.
  - docsUrl: https://markless.dev/errors/MARKLESS_STATE_CREATION_SITE_UNSTABLE
  - (Loop variant message: `state(i)` creates `item` inside a `for` body; three iterations would recreate one shared cell three times.)
- Impl-note: collect-state declaration walk needs branch/loop site context (the same current-site marker as S2.06/S3.07/S7.05). Distinct backlog item: state-lowering's rejection of ALL plain-local writes (`i++`, `total += i` — proven by the control) contradicts its own suggestion text ("move non-graph mutation into normal local code") and must be resolved deliberately: either plain-local mutation is allowed (then S7.08 needs its own escape guard) or the message must stop recommending it.
- Runtime follow-up: none (compile-time verdict; payload facts proven at FC).

### S7.07 — cross-module state: export from module A, import in module B
- Snippet:
  ```tsrx
  // counter.tsrx (module A)
  export const count = state(0);
  // App.tsrx (module B)
  import { count } from './counter.tsrx';
  export function App() @{
    <button onClick={() => count++}>{count}</button>
  }
  ```
- Probe layer: SG + SL + FC (per-module only — see gap flag)
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b7-probe.test.ts`
  - Observed (module A): `MARKLESS_STATE_MODULE_SCOPE` (verbatim shape in S7.01) — the export side always fails compilation.
  - Observed (module B, write variant): `count` is recorded only as a module import (`{"localName":"count","importedName":"count","source":"./counter.tsrx","kind":"named"}`), never a graph binding; `count++` errors `MARKLESS_STATE_UNRESOLVED_WRITE` (`Cannot write to "count" because it does not resolve to graph state.`).
  - Observed (module B, READ-ONLY variant `<p>{count}</p>`): compiles totally CLEAN — zero diagnostics in every pass. The emitted SSR module keeps the raw import and interpolates it once: `import { count } from "./counter.tsrx";` … `"<p>" + marklessSsrText(count) + "</p>"` with `marklessSsrStateValues = new Map([])` — a dead one-time snapshot of whatever the import evaluates to, no graph cell, no subscription.
  - Cross-module claim: **needs bundler-level probe — unobserved.** No multi-module compile helper exists (see run context); what the bundler does when module A's compile carries error diagnostics, and what module B's snapshot read actually renders end-to-end, was not observed and is not claimed.
- Spec check: specs/framework/03-state-graph.md:224-228 — module-scope creation is the diagnostic; :227-228 — "Request, container, and page state is declared with `shared()` definitions instead", and collect-shared already resolves shared definitions imported from other `.tsrx` modules (resolveSharedDefinitionCall handles imported definitions) — `shared()` IS the sanctioned cross-module mechanism.
- Verdict: ERROR
- Rationale: The write path fails loudly at both ends (A: module scope; B: unresolved write), but the read-only half is silent-wrong (rubric rule 4): an author re-exporting "app state" gets a module that compiles clean and renders a dead snapshot through an import whose defining module can never compile. Module B's compiler can SEE the `.tsrx` import source; the ideal is a loud diagnostic at the import-read site pointing at `shared()`, mirroring how imported shared definitions are already resolved.
- Required diagnostic:
  - Code: MARKLESS_STATE_CROSS_MODULE_IMPORT (new)
  - Severity: error — Phase: semantic-graph
  - Title: Graph state cannot be imported across modules
  - Message: `{count}` reads `count` imported from `./counter.tsrx`. State created in another module cannot join this component's graph — the read would render a one-time value that never updates.
  - Why: Each document's payload plans its cells per component/shared scope at compile time; a raw module import carries a value, not a graph cell.
  - Suggestion(s): Name the dataflow with shared() — in counter.tsrx: `export const counter = shared(() => { const s = state({ count: 0 }); return { ...s }; });` — in App.tsrx: `const c = counter();` then read `c.count`. Imported shared() definitions already resolve across modules.
  - docsUrl: https://markless.dev/errors/MARKLESS_STATE_CROSS_MODULE_IMPORT
- Impl-note: collect-expressions/state-lowering can flag reactive-position reads of named `.tsrx` module imports that are not shared definitions or components; requires care not to flag legitimate imported constants/helpers (only reads in template/graph positions of imports from `.tsrx` sources whose export is not a known-resolvable kind). Bundler-level behavior (diagnostic surfacing for module A, end-to-end render of module B) is a B8/bundler backlog probe.
- Runtime follow-up: BM-deferred-to-B8 (bundler-level: what a dev server actually shows for module A's diagnostics and module B's snapshot render — unobserved).
- B8 resolution (T015): RESOLVED for the vite dev pipeline the browser harness runs on (temporary fixtures crazy-qa-b8-cross-counter.tsrx / crazy-qa-b8-cross-reader.tsrx, dynamic import in chromium): importing module B fails at module load with `SyntaxError: The requested module '/browser/fixtures/crazy-qa-b8-cross-counter.tsrx?import' does not provide an export named 'count'` — the plugin compiles module A into a module WITHOUT the authored export, so module B never renders its dead snapshot, and the `MARKLESS_STATE_MODULE_SCOPE` diagnostic text never reaches the browser (the author sees a generic missing-export SyntaxError instead). Dev-server overlay/HMR presentation of the diagnostic remains a bundler/witness-level probe outside this harness.

### S7.08 — module-level registry array holding a state ref
- Snippet:
  ```tsrx
  const registry = []; // module scope
  export function App() @{
    const menu = state({ open: false });
    registry.push(menu);
    <button onClick={() => { menu.open = true; registry.push(menu); }}>{menu.open}</button>
  }
  ```
- Probe layer: SG + SL + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b7-probe.test.ts`
  - Observed: BOTH pushes (render-body and handler) error `MARKLESS_STATE_UNRESOLVED_WRITE`: `Cannot write to "registry" because it does not resolve to graph state.` — compilation fails; no silent escape today. The graph-state parts still lower correctly (`menu.open` write `path:["open"]`, whole-binding read of `menu` as the call argument). FC facts: `registry` appears in NO emitted module (`registryInSsr: false`, `registryInCsr: false`, absent from symbol modules); `captureAnalysis.diagnostics: []`.
- Spec check: specs/framework/03-state-graph.md:224-226 — module-scope state "would be shared across requests on the host runtime and has no home in the per-document serialization payload"; a module-scope registry holding graph refs is the same cross-request escape wearing a different shape.
- Verdict: ERROR
- Rationale: The right tier fires today but for the accidental reason: the S7.06 control proves `registry.push(...)` errors because ALL plain-local/module mutations error, not because anything detects the state-ref escape. The message misdescribes the situation (the author is not trying to write graph state; they are leaking a graph ref into cross-request module memory), and its suggestion ("move non-graph mutation into normal local code") recommends the thing that errors. If plain-local mutation is ever allowed (as that suggestion implies is intended), this pattern becomes a fully silent cross-request leak — so the escape needs its own guard, recorded now.
- Required diagnostic:
  - Code: MARKLESS_STATE_MODULE_ESCAPE (new)
  - Severity: error — Phase: semantic-graph
  - Title: Graph state cannot escape into module-scope storage
  - Message: `registry.push(menu)` stores the graph state `menu` in `registry`, which lives at module scope. `registry` outlives this document and is shared across requests, so it would hold state from other users' renders.
  - Why: Graph cells are per-document and serialized into that document's payload; module-scope storage lives for the host process and never serializes.
  - Suggestion(s): Name the dataflow with shared() when multiple pieces need the same graph (`export const menus = shared(() => { const s = state({ items: [] }); return { ...s }; })`), or keep the registry inside the component's own object state (`const ui = state({ registry: [] })`).
  - docsUrl: https://markless.dev/errors/MARKLESS_STATE_MODULE_ESCAPE
- Impl-note: needs a detector for graph-binding references flowing into module-scope bindings (call arguments/assignments whose target resolves to a module-scope declaration) — resolvable from the semantic graph's module-scope declarations plus lowered whole-binding reads. Paired with S7.06's plain-local-write resolution: whichever way that goes, this escape must stay loud.
- Runtime follow-up: none (compile-time verdict; emitted-module absence proven at FC).

### S7.09 — renamed import `import { state as createState }`
- Snippet:
  ```tsrx
  import { state as createState } from '@markless/core';
  export function App() @{
    let x = createState(1);
    <button onClick={() => x++}>{x}</button>
  }
  ```
- Probe layer: SG + SL
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b7-probe.test.ts`
  - Observed: zero diagnostics in both passes. Positive artifact facts: `graphBindings[0] = {"id":"state:x","name":"x","kind":"state","declarationKind":"let","writable":true,"valueKind":"scalar","initialValue":1}`; the template read lowers (`{"source":"x","graphNodeId":"state:x","path":[]}`) and the handler write lowers with operator metadata (`{"source":"x","graphNodeId":"state:x","path":[],"operation":"update","prefix":false,"updateOperator":"++"}`).
- Spec check: specs/framework/03-state-graph.md:232-234 — the compiler knows creation sites "whose callee resolves to an import from `@markless/core`"; resolution is by import binding, so a local rename is ordinary ES modules (collectImports maps localName → imported API name).
- Verdict: ALLOW
- Rationale: Ordinary ES-module usage handled exactly as the spec's import-resolution model promises, proven by positive artifacts (binding + read + write, no diagnostics). Nothing to warn about; renaming is how real codebases resolve name collisions.
- Required diagnostic: n/a.
- Impl-note: none (imports.ts collectImports already keys by local name).
- Runtime follow-up: none.

### S7.10 — aliasing the framework function itself: `const makeState = state`
- Snippet:
  ```tsrx
  import { state } from '@markless/core';
  export function App() @{
    const makeState = state;
    let x = makeState(5);
    <button onClick={() => x++}>{x}</button>
  }
  ```
- Probe layer: SG + SL
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b7-probe.test.ts`
  - Observed: the creation site is completely silent — `graphBindings: []`, `localBindings: []`, `aliases: []`, zero semantic-graph diagnostics: `const makeState = state` and `makeState(5)` produce no record of ANY kind. `x` is not graph state, so the template `{x}` records a templateRead that lowers to nothing (no subscription, no diagnostic), and the only error anywhere is the derivative `MARKLESS_STATE_UNRESOLVED_WRITE` on `x++` (`Cannot write to "x" because it does not resolve to graph state.`) — misleading, since the author believes `x` IS state. A read-only variant would compile fully clean.
- Spec check: specs/framework/03-state-graph.md:213-215 — "The compiler recognizes these APIs through their imported bindings"; :232-234 — creation sites are calls "whose callee resolves to an import from `@markless/core`". An alias severs the recognition the whole model depends on; the local spec is silent on diagnosing the alias itself — needs TSRX spec confirmation (TSRX MCP unavailable this session).
- Verdict: ERROR
- Rationale: The wrapper-library instinct has no working reading: a compiler-rewritten API has no first-class function value, so `makeState(5)` can never create a cell, and today the mistake is invisible at the site that caused it (rubric rule 4 — the read-only form is fully silent; the write form blames the wrong line). The AST proves the alias trivially: the initializer identifier resolves to the framework import.
- Required diagnostic:
  - Code: MARKLESS_FRAMEWORK_API_ALIAS_UNSUPPORTED (new)
  - Severity: error — Phase: semantic-graph
  - Title: Framework APIs cannot be aliased or passed as values
  - Message: `const makeState = state` copies the framework API `state` into a plain variable. `makeState(5)` would not create graph state — the compiler only rewrites calls made through the imported name.
  - Why: state() is compiled away into graph cells; it has no runtime function value that an alias could call.
  - Suggestion(s): Call the imported API directly — before: `const makeState = state; let x = makeState(5);` — after: `let x = state(5);`. For a reusable initialization pattern, wrap the VALUE, not the API (`const defaults = () => ({ open: false }); const menu = state(defaults());`).
  - docsUrl: https://markless.dev/errors/MARKLESS_FRAMEWORK_API_ALIAS_UNSUPPORTED
- Impl-note: collect-state (a declarator/expression whose value position references a framework-API imported binding without calling it — the same imports map already answers the question); also covers passing `state` as a call argument.
- Runtime follow-up: none (compile-time verdict; body statements are dropped from emitted modules per S1.01, so even the fail-loud runtime stub is unreachable).

### S7.11 — shared() with unknown scope string `'session'`
- Snippet:
  ```tsrx
  export const session = shared(() => {
    const s = state({ user: null });
    return { ...s };
  }, { scope: 'session' });
  ```
- Probe layer: SG
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b7-probe.test.ts`
  - Observed: zero diagnostics, and the typo'd option is SILENTLY DROPPED — the collected definition has NO `scope` field at all, while the same-run control with `{ scope: 'request' }` records `"scope": "request"`. The author believes they declared session-scoped state; the artifact says they declared default-scoped state. (`sharedScopeFromOptions` returns undefined for any value outside `'request' | 'container' | 'page'`, packages/compiler/src/passes/semantic-graph/collect-shared.ts:489-506.) The public TypeScript type (`SharedScope = 'request' | 'container' | 'page'`, packages/core/src/framework-api.ts:5) would flag this in a TS-checked editor, but the compile pipeline itself accepts and discards it.
- Spec check: specs/framework/03-state-graph.md §Shared state names request/container/page as the scope vocabulary (":455 request-scoped initial-render instance"; T001 §1 records the same option signature); the local spec does not define behavior for unknown scope strings — silence is not license to drop options.
- Verdict: ERROR
- Rationale: A typo class with no legitimate reading: `'session'` is not a scope, and the silent drop changes lifetime semantics without a trace (rubric rule 4). TypeScript catches it only for authors running strict TS in the editor; the `.tsrx` compiler is the enforcement line the framework owns.
- Required diagnostic:
  - Code: MARKLESS_SHARED_SCOPE_INVALID (new)
  - Severity: error — Phase: semantic-graph
  - Title: Unknown shared() scope
  - Message: `shared(..., { scope: 'session' })` declares `session` with scope `'session'`, which is not a shared scope. The valid scopes are `'request'`, `'container'`, and `'page'`.
  - Why: The scope decides which graph context owns the instance and where it serializes; an unknown scope cannot be planned into any payload.
  - Suggestion(s): Per-user-visit state is request scope — before: `{ scope: 'session' }` — after: `{ scope: 'request' }`.
  - docsUrl: https://markless.dev/errors/MARKLESS_SHARED_SCOPE_INVALID
- Impl-note: collect-shared sharedScopeFromOptions — return a diagnostic instead of undefined for a literal outside the vocabulary (and for non-literal scope expressions, which are silently dropped the same way today).
- Runtime follow-up: none.

### S7.12 — handler capturing a non-serializable local
- Snippet:
  ```tsrx
  let count = state(0);
  const controller = new AbortController();
  <button onClick={() => { controller.abort(); count++; }}>{count}</button>
  ```
- Probe layer: FC (captureAnalysis)
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b7-probe.test.ts`
  - Observed: `MARKLESS_CAPTURE_UNSUPPORTED_VALUE`, severity `error`, phase `capture-analysis`, title `Cannot capture local class instance in lazy symbol`, message `Cannot capture "controller" in lazy event-handler symbol "symbol:0" because local class instance values cannot cross a resume boundary.`, why `Lazy symbols run after browser resume. Captures must be graph references, element handles, props/shared values, module imports, or serializable constants.`, suggestion `Represent durable data with state()/computed(), hoist serializable helpers to module scope, or move DOM-backed setup into a host element behavior with attach.`, docsUrl `https://markless.dev/errors/MARKLESS_CAPTURE_UNSUPPORTED_VALUE`. The local is classified first (`localBindings[0] = {"name":"controller","kind":"class-instance"}`) and both symbols are still extracted with sources.
  - Existing tests: packages/compiler/test/capture-analysis.test.ts:64-795 (rich real-source family: local functions, function aliases, non-serializable constants, Date allowance, spread/destructure paths, shadowing negatives, class instances, DOM nodes) — rerun result: pass (whole file in the 5-file re-verify run). Shared spread-return partial: packages/compiler/test/state-lowering.test.ts:346 and :384 — rerun result: pass (factory reads/writes and `return { ...s, ... }` return properties resolve to shared-scoped graph ids such as `shared:src/session.tsrx#session/state:data` with `diagnostics: []`, the spec 03:388 ergonomic contract).
- Spec check: specs/framework/07-diagnostics.md:56-61 — MARKLESS_CAPTURE_UNSUPPORTED_VALUE is the spec's own worked example; :96 lists capture-rule violations as required diagnostics. specs/framework/03-state-graph.md:386-390 — the shared spread-return contract.
- Verdict: ALREADY-CORRECT
- Rationale: The devs-close-over-everything trap is the framework's best-covered boundary: real-source detection with value-kind classification, the full consequence → why → fix → link shape quoting `controller`, shadowing negatives to prevent false positives, and the `attach` escape route named for DOM-backed setup. The shared `return { ...s, methods }` idiom the spec calls out as the ergonomic payoff is pinned by passing lowering tests.
- Required diagnostic: n/a (ships today).
- Impl-note: capture-analysis pass (analyzeCaptures over extracted symbols + semantic local bindings).
- Runtime follow-up: none.

### Batch 7 summary

| Scenario | Verdict | Probe kind | Backlog? |
| --- | --- | --- | --- |
| S7.01 | ALREADY-CORRECT | both | no (cascade-noise polish note only) |
| S7.02 | ALREADY-CORRECT | both | no |
| S7.03 | ERROR | both | yes (shadow-aware IMPORT_REQUIRED message + prop:value artifact pollution bug) |
| S7.04 | ALREADY-CORRECT | both | no |
| S7.05 | ERROR | new-probe | yes (MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED gate or spec's call-tree aliasing; walk-site-context family) |
| S7.06 | ERROR | new-probe | yes (MARKLESS_STATE_CREATION_SITE_UNSTABLE; plus the plain-local-write over-rejection decision) |
| S7.07 | ERROR | new-probe | yes (MARKLESS_STATE_CROSS_MODULE_IMPORT; bundler-level probe gap) |
| S7.08 | ERROR | new-probe | yes (MARKLESS_STATE_MODULE_ESCAPE — currently blocked only by the accidental plain-local-write rejection) |
| S7.09 | ALLOW | new-probe | no |
| S7.10 | ERROR | new-probe | yes (MARKLESS_FRAMEWORK_API_ALIAS_UNSUPPORTED) |
| S7.11 | ERROR | new-probe | yes (MARKLESS_SHARED_SCOPE_INVALID; silent option drop) |
| S7.12 | ALREADY-CORRECT | both | no |

Verdict counts: ALLOW 1, ALREADY-CORRECT 4, WARN 0, ERROR 7.

T900 note: S2.06 (MARKLESS_STATE_CREATION_IN_COMPUTED), S3.07 (MARKLESS_STATE_CREATION_IN_HANDLER), S7.05, and S7.06 are one root cause — collect-state's declaration walk has no site context. A single unified placement code (e.g. MARKLESS_STATE_CREATION_SITE_UNSUPPORTED with site-specific messages for computed/handler/helper/branch/loop) implemented as one walk-site marker is the cheaper end-state; the per-site codes above record the required message content either way.

## Batch 4 — Bindings/templates

Run context (T012, 2026-07-04): all compiler "Observed" values below are verbatim from a temporary probe
test `packages/compiler/test/crazy-qa-b4-probe.test.ts` (one test per scenario plus three controls,
calling the real `buildSemanticGraph` / `lowerStateAccess` / `compileTsrxModule` entrypoints and
executing emitted SSR modules through the same data-URL import pattern as
packages/compiler/test/compile-module.test.ts:394-444, deleted after the runs per T003 §6), executed
with `pnpm exec vp test packages/compiler/test/crazy-qa-b4-probe.test.ts` (19 tests passed; probe facts
written to a scratchpad log outside the repo and read back, because vp test suppresses console output).
Executed-SSR html strings are node-side executions of the emitted module (the compiler test suite's own
harness pattern), cited as static emitted-artifact facts, not browser claims. Re-verify entries reran the
cited existing files: `pnpm exec vp test packages/compiler/test/compile-module.test.ts` — 60 tests, all
passed — and the browser rerun
`pnpm exec vp test --project browser packages/vitest-browser/browser/constructs-csr.test.ts packages/vitest-browser/browser/constructs-ssr.test.ts`
— 32 passed + 2 `test.fails` known-red children-projection tests (same baseline as the T009 run). That
browser rerun covers the spread-class.tsrx fixture (S4.01: spread attributes + literal-after-spread
precedence + conditional class flip, CSR constructs-csr.test.ts:50-65 and SSR constructs-ssr.test.ts:46-61)
and the dynamic-tag.tsrx fixture (S4.03: constructs-csr.test.ts:169-176, constructs-ssr.test.ts:170-177).
TSRX MCP and grep MCP were unavailable this session; spec checks cite the local split specs (fallback per
AGENTS.md), and entries say so where the local spec is silent. All snippets assume
`import { state } from '@markless/core';` inside `export function App() @{ ... }` unless shown otherwise.

Batch-level structural findings (cited per entry below):

1. **The render-module emitter roots at `components[0]` and chooses silently.** `emitPublicRenderModule`
sets `rootComponentName = input.semanticGraph.components[0]?.name`
(packages/compiler/src/passes/public-render/module.ts:29), and `getComponentFunction`
(packages/compiler/src/ast/tsrx.ts:22-25) counts EVERY top-level `FunctionDeclaration` as a component —
plain helpers included (only variable-declared arrows get the JSXCodeBlock-body filter, tsrx.ts:36). A
module whose first function is a non-exported component emits THAT component as the app root (S4.07
renders Card, S4.08 renders renderBadge; the exported App is never emitted); a module whose first
function is a template-less helper emits NOTHING — `moduleSource`, `csrModuleSource`, and
`ssrModuleSource` are all `""` with `publicRenderDiagnostics: []` (S4.10). specs/framework/10-render-architecture.md:38-41
says the opposite verbatim: "app code must pass the intended compiled artifact to the framework renderer
explicitly. The compiler must not emit generic render helpers that silently choose one." Note the plan
pass disagrees with the module pass: `findComponent` in passes/public-render/plan.ts:1543-1561 PREFERS
exported components, so plan and emit can root at different components in the same compile.
2. **Template holes are reactive only for plain graph reads.** An identifier/path read lowers and gets a
dom-update symbol (S4.09, S4.11 class, S411-control style identifier), but ternaries, IIFEs, spreads, and
object literals in template position are emitted verbatim into the render module and never lowered:
`stateLowering.reads` stays empty and `protocolView.domUpdates` stays empty, so no update symbol exists
for the resume runtime to wake — render-once is a static emitted fact, with zero diagnostics (S4.01/S4.02
spreads, S4.03 dynamic tag name, S4.04 including its plain-ternary control, S4.11 style object).
3. **Attribute emit stringifies non-primitive values.** `marklessSsrAttribute(name, value)` renders
`String(value)`: an object-valued attribute and an object style binding both ship `"[object Object]"`
(S4.09, S4.11); a function value is stringified source text (S4.12b `onclick="() =&gt; count++"`).
4. **Bonus payload fact (serializer-tier, flagged for B8):** boolean-`false` object fields are dropped
from serialized initial state cells: `state({ id: 'm', open: false })` plans the cell record
`{"id":0,"type":"object","fields":[["id","m"]]}` (S4.02) and `state({ open: false })` plans
`{"id":0,"type":"object","fields":[]}` (S4.09) — `open` is absent, so a resumed graph would restore
`menu` without the field. Both-truthy control S4.01 keeps both fields ([["class","mid"],["id","r1"]]).

### S4.01 — literal class before and after a spread (ordering/precedence)
- Snippet:
  ```tsrx
  const rest = state({ class: 'mid', id: 'r1' });
  <div class="a" {...rest} class="b">Hi</div>
  ```
- Probe layer: FC + BM
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b4-probe.test.ts`
  - Observed: no parse throw; zero diagnostics in every pass. The emitted SSR module builds
    `marklessSsrSpreadAttributes({ class: "a", ...(rest), class: "b" }, null)` — plain JavaScript
    object-literal semantics, so the LAST entry wins per key. Executed SSR html:
    `<div class="b" id="r1">Hi</div>` — the first literal `class="a"` AND the spread's `class: 'mid'`
    are both silently dropped. `templateReads: []` and `stateLowering.reads: []` — the spread is not
    lowered as a read of `rest`, and `protocolView.domUpdates: []` (the reactivity half is S4.02's
    finding). Payload cell keeps both truthy fields: `[["class","mid"],["id","r1"]]`.
  - Existing test (both): packages/compiler/test/compile-module.test.ts:749 (spread SSR html,
    literal-after-spread `title="Final"` asserted at :767) — rerun: pass (60 tests).
    Browser: packages/vitest-browser/browser/constructs-csr.test.ts:50-65 and
    constructs-ssr.test.ts:46-61 (spread-class.tsrx: `id="hero"`, `role="note"`, `hidden` absent,
    literal-after-spread `title="Final"`, conditional class flip on click) — rerun: pass
    (32 passed + 2 expected-fail baseline).
- Spec check: local specs are silent on attribute merge order (specs/framework/01-tsrx-host-contract.md:127
  names the spread attribute path only for scoped-style classes); TSRX MCP unavailable — fallback per
  AGENTS.md. The shipped contract is pinned by tests: "Literal attributes after the spread win over
  spread entries" (constructs-csr.test.ts:58 comment) and compile-module.test.ts:767.
- Verdict: ALREADY-CORRECT
- Rationale: The precedence question has a deterministic, JavaScript-native answer (object-literal
  last-wins), it is asserted at both the artifact level and in real CSR/SSR browser runs, and the reruns
  pass. Duplicate LITERAL attributes folding silently is recorded under S4.12; spread reactivity is
  recorded under S4.02 — the ordering contract itself is correct and proven.
- Required diagnostic: n/a.
- Impl-note: emit in passes/public-render/module.ts (`marklessSsrSpreadAttributes` /
  `marklessCsrSpreadAttributes` object-literal merge).
- Runtime follow-up: none (browser rerun executed this batch).

### S4.02 — spreading a state object into attributes: `<div {...menu}>`
- Snippet:
  ```tsrx
  const menu = state({ id: 'm', open: false });
  <div {...menu}>x</div>
  ```
- Probe layer: SG + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b4-probe.test.ts`
  - Observed: zero diagnostics in every pass. `graphBindings[0] = {"id":"state:menu",...,"valueKind":"object","initialValue":{"id":"m","open":false}}`.
    The emitted SSR module declares `let menu = marklessSsrStateValue("state:menu");` and renders
    `marklessSsrSpreadAttributes({ ...(menu) }, null)`; executed SSR html: `<div id="m">x</div>`
    (`open: false` skipped by the spread helper's boolean handling). But `templateReads: []`,
    `stateLowering.reads: []`, `protocolView.domUpdates: []`, `extractedSymbols: []` — the spread is
    never lowered as a read of `menu` and NO dom-update symbol exists, so no write to `menu` can ever
    update the spread attributes (static emitted fact: the resume runtime wakes only from payload
    records). Payload cell drops the false field: `{"id":0,"type":"object","fields":[["id","m"]]}`
    (batch finding 4).
- Spec check: specs/framework/10-render-architecture.md §SSR renderer owns — "DOM update records for
  graph-backed text, attribute, property, class ... updates across the whole tree"; a graph-backed
  attribute spread produces no update records at all. Local spec silent on spread semantics as such;
  TSRX MCP unavailable (fallback noted).
- Verdict: WARN
- Rationale: Kinship proven by this run: the same collect-elements spread early-return that S3.12 found
  (spread attributes never reach attribute/event collection) — but it DIVERGES from S3.12's
  undeclared-identifier crash because `menu` is a graph binding the emitter declares, so initial render
  works and only reactivity dies. It is also the S1.01 escape family: a read that exists in the emitted
  JavaScript but is invisible to the graph (render-only read, no subscription). Spreading a static
  attribute bag is legitimate and works today (the shipped spread-class.tsrx fixture spreads state and
  its tests assert only initial attributes) — sometimes-intentional is the WARN tier; silent reactivity
  loss on the state-backed case forces WARN over ALLOW (rubric rule 4).
- Required diagnostic:
  - Code: MARKLESS_SPREAD_STATIC_SNAPSHOT (new)
  - Severity: warning — Phase: semantic-graph
  - Title: Spread attributes render once
  - Message: `{...menu}` copies the attributes of `menu` during initial render. When `menu` changes
    later, these attributes do not update.
  - Why: The compiler plans a DOM-update record for each graph-backed binding it can see; a spread hides
    which attributes exist, so no update records are planned for it.
  - Suggestion(s): Bind the attributes that change individually — before: `<div {...menu}>` — after:
    `<div id={menu.id} data-open={menu.open}>` (keep the spread for attributes that never change).
  - docsUrl: https://markless.dev/errors/MARKLESS_SPREAD_STATIC_SNAPSHOT
  - Escape hatch (WARN only): `// markless-allow MARKLESS_SPREAD_STATIC_SNAPSHOT: initial attributes
    only` on the element line silences exactly this site.
- Impl-note: collect-elements.ts spread-attribute branch (same site as S3.12's
  MARKLESS_EVENT_SPREAD_UNSUPPORTED backlog item — one spread-resolution pass should own both); the
  false-field payload drop is a serializer/payload-arena item flagged to B8 (batch finding 4).
- Runtime follow-up: none for the reactivity claim (absence of dom-update records is a static payload
  fact); BM-deferred-to-B8 (whether resume restores `menu.open` at all, given the dropped false field).
- B8 resolution (T015): RESOLVED — resume does NOT restore `menu.open` (temporary fixture
  crazy-qa-b8-false-field.tsrx, `state({ open: false, label: 'menu' })`): the served state script is
  verbatim `{"id":0,"type":"object","fields":[["label","menu"]]}` and a resumed click copying `menu.open`
  into a text binding renders `""` (undefined), identically on CSR. Tier located: the drop is INSIDE
  `@markless/serializer` — `serializeGraphValue({open:false,label:'menu'})` returns
  `fields:[["label","menu"]]` and the decoded object has `hasOpen: false`; precision probe: `false`, `0`,
  `''`, and `null` object fields are ALL dropped (`{f:false,t:true,n:0,s:'',z:null,u:undefined}` →
  `fields:[["t",true],["u",{"$type":"undefined"}]]`) — every falsy field except `undefined` silently
  vanishes from serialized state (owner-escalation; batch finding 4 upgraded from payload-plan to
  serializer-core).

### S4.03 — dynamic-tag abuse shapes: root position, member/call tags, string-const `<Tag>`
- Snippet:
  ```tsrx
  let tag = state('em');
  <{tag}>Hi</{tag}>                     // (a) state-driven tag at the component ROOT
  // (b) const cfg = { tag: 'em' }; <{cfg.tag}>Hi</{cfg.tag}>  (root)
  // (c) <{pickTag()}>Hi</{pickTag()}>  — call-expression tag
  // (d) const Tag = flag ? 'a' : 'button'; <Tag>Hi</Tag>
  ```
- Probe layer: SG + FC + BM
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b4-probe.test.ts`
  - Observed (a, root): semantic graph is fine (`hostNodes: [{"id":"h0","tagName":"*"}]`, locator
    `{"hostNodeId":"h0","strategy":"dom-order","index":0,"tagName":"*"}`), but `moduleSource`,
    `csrModuleSource`, and `ssrModuleSource` are ALL `""` with `publicRenderDiagnostics: []` — a
    root-position dynamic tag silently emits NO render module at all. (b, root) identical silent
    no-emit. Control (a nested in `<section>`, the fixture shape): SSR emits
    `((marklessDynamicTag) => marklessDynamicTag ? ... : "")(marklessSsrDynamicTagName(tag))` and
    executes to `<section><em class="card">Hi</em></section>` — but `stateLowering.reads: []` and
    `domUpdates: []`, so changing `tag` never re-renders the element (render-once tag, batch finding 2).
    (c) parse throw, quoted verbatim: `SyntaxError: Dynamic element names must be an identifier, member
    expression, static string, or runtime expression; calls, spreads, string concatenation, string
    interpolation, and static null, undefined, boolean, number, object, and array literals are not valid
    tag names. (9:3)` — phase parse (external @tsrx/core). (d) `<Tag>` is collected as a child COMPONENT
    edge (`{"id":"component-edge:0","parentComponentName":"App","childComponentName":"Tag","props":[],"children":{"childCount":1}}`),
    `hostNodes: []`, and the emitted SSR module body is `const html = "";` — executed SSR html is `""`.
    The string-const `Tag` never renders anything, with zero diagnostics.
  - Existing test (both): dynamic-tag.tsrx fixture — packages/vitest-browser/browser/constructs-csr.test.ts:169-176
    and constructs-ssr.test.ts:170-177 (nested `<{tag}>` renders `ARTICLE`) — rerun: pass. Those tests
    assert only the INITIAL tag; no test covers tag change, root position, or `<Tag>`.
- Spec check: specs/framework/01-tsrx-host-contract.md:19 — TSRX owns "dynamic tags/components
  (`<{expr}>`)" as baseline syntax. specs/framework/10-render-architecture.md:38-41 — the compiler "must
  not emit generic render helpers that silently choose" a root; an empty-string module with no diagnostic
  is the same silent-choice failure. MARKLESS_PUBLIC_RENDER_ROOT_UNSUPPORTED already exists
  (passes/public-render/diagnostics.ts:61) and does not fire here. MARKLESS_DYNAMIC_TAG_INVALID exists
  only as a RUNTIME throw inside the emitted helper (module.ts:172).
- Verdict: ERROR
- Rationale: Three silent dead-ends in one family: a root dynamic tag and a member-expression root both
  compile to NO render module with empty diagnostics (silent-wrong, rubric rule 4); `<Tag>` backed by a
  local string renders empty html silently — the classic dynamic-component habit from React
  (`const Tag = cond ? 'a' : 'button'`) produces a blank app with no teaching. The parser's rejection of
  call-expression tags (c) is correct and loud, but it is a raw SyntaxError without the Markless
  diagnostic shape (external-boundary message-quality note, same wrapper backlog as S2.14).
- Required diagnostic:
  - Code: MARKLESS_PUBLIC_RENDER_ROOT_UNSUPPORTED (reuse — it exists for exactly this boundary and
    currently stays silent for dynamic-tag and component-edge roots)
  - Severity: error — Phase: public-render
  - Title: This component root cannot be rendered yet
  - Message: The root of `App` is a dynamic tag `<{tag}>`, so no render output could be produced.
    Wrap it in a plain host element, or the compiled app renders nothing.
  - Why: The render module needs one stable host root to anchor locators for resume; a root whose tag is
    decided at runtime has no anchor to plan.
  - Suggestion(s): Wrap the dynamic element — before: `<{tag}>Hi</{tag}>` — after:
    `<section><{tag}>Hi</{tag}></section>`. For (d): `Tag` is a string, not a component — write
    `<{Tag}>Hi</{Tag}>` to use it as a dynamic tag.
  - docsUrl: https://markless.dev/errors/MARKLESS_PUBLIC_RENDER_ROOT_UNSUPPORTED
- Impl-note: passes/public-render/module.ts `publicRenderRoot`/`firstComponentRoot` return null for
  these roots and the caller emits `""` without a diagnostic (module.ts:54-55); the `<Tag>`
  string-const-as-component resolution belongs to collect-elements/collect-components (alias map knows
  `Tag` is a string); (c) is `external-boundary` — wrap the @tsrx/core SyntaxError into the Markless
  diagnostic shape at the compiler artifact boundary only (same item as S2.14/S1.13a); never queue work
  in ../native-tsrx. Tag-change reactivity (nested case) is batch finding 2's backlog.
- Runtime follow-up: BM-deferred-to-B8 (what render()/renderToString() do when handed a module whose
  emitted sources are all empty strings).
- B8 resolution (T015): RESOLVED (shared run with S4.10; temporary fixtures crazy-qa-b8-root-dynamic-tag.tsrx
  and crazy-qa-b8-empty-module.tsrx, both compile-verified all-empty this batch): the compiled module still
  exports `{default, payloadView, resumeContainerEvent}` but the default is an EMPTY OBJECT (`defaultKeys: []`);
  `render()` throws `TypeError: component.renderCsr is not a function` and `renderToString` (via the SSR
  command) fails with `Error: Failed to load url .../[object%20Object] ... Does the file exist?` — internal
  errors on every entrypoint, no MARKLESS diagnostic at compile or runtime.

### S4.04 — IIFE in a template hole: `{(() => { if (a) return 'x'; return 'y'; })()}`
- Snippet:
  ```tsrx
  let a = state(true);
  <p>{(() => { if (a) return 'x'; return 'y'; })()}</p>
  ```
- Probe layer: SG + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b4-probe.test.ts`
  - Observed: zero diagnostics in every pass. The hole is collected as one opaque text read:
    `templateReads[0] = {"hostNodeId":"h0","source":"(() => { if (a) return 'x'; return 'y'; })()","target":{"kind":"text"}}`
    — but `stateLowering.reads: []` (the read of `a` INSIDE the IIFE is never lowered) and
    `protocolView.domUpdates: []`. The SSR module inlines the IIFE verbatim
    (`marklessSsrText((() => { if (a) return 'x'; return 'y'; })())` with
    `let a = marklessSsrStateValue("state:a")`) and executes to `<p>x</p>` — correct once, then inert
    forever. CONTROL: the plain ternary `<p>{a ? 'x' : 'y'}</p>` behaves IDENTICALLY
    (`stateLowering.reads: []`, `domUpdates: []`, html `<p>x</p>`) — this is not an IIFE-specific hole;
    every composite text expression is render-once (batch finding 2).
- Spec check: specs/framework/10-render-architecture.md §SSR renderer owns — "DOM update records for
  graph-backed text ... updates across the whole tree". specs/framework/03-state-graph.md
  §Implementation: compiler-owned graph state — every read of a state binding compiles to a graph read
  "including reads inside closures, template expressions". Both mandates are unmet for composite text
  expressions.
- Verdict: ERROR
- Rationale: The spec's own contract says template reads of `a` subscribe; today the subscription exists
  only for bare identifier/path holes, and everything else — including the ubiquitous, machine-generated
  IIFE pattern (prep §6) AND the everyday ternary — silently renders once with zero diagnostics
  (rubric rule 4; same silent-emit-hole class as B2's S2.11). The ideal end state is compiler-handled
  dependency collection for composite template expressions; until that ships, the compiler must gate
  loudly instead of shipping frozen text.
- Required diagnostic:
  - Code: MARKLESS_TEMPLATE_EXPRESSION_STATIC (new; the loud gate until composite lowering ships)
  - Severity: error — Phase: state-lowering
  - Title: This expression reads state but never updates
  - Message: This text reads `a`, but only plain reads like `{a}` update the page today. The expression
    renders its initial value and never changes when `a` changes.
  - Why: Each template read compiles to a graph subscription with a DOM-update record; composite
    expressions are not lowered yet, so no subscription exists to wake this text.
  - Suggestion(s): Hoist the logic into a derived value — before:
    `<p>{(() => { if (a) return 'x'; return 'y'; })()}</p>` — after:
    `const label = computed(() => a ? 'x' : 'y');` with `<p>{label}</p>` (note: sync-computed emission
    has its own open hole, S2.11 — these two items should land together).
  - docsUrl: https://markless.dev/errors/MARKLESS_TEMPLATE_EXPRESSION_STATIC
- Impl-note: collect-expressions.ts collects the hole as opaque source; state-lowering never descends
  into it. The real fix is composite-expression dependency lowering (shares machinery with S2.11's
  sync-computed emit); the gate is the interim. Highest-priority B4 item together with batch finding 1.
- Runtime follow-up: none (absence of dom-update records is a static payload fact).

### S4.05 — template stored in a local: `const header = <h1>Hi</h1>; ... {header}`
- Snippet:
  ```tsrx
  const header = <h1>Hi</h1>;
  <section>{header}</section>
  ```
- Probe layer: SG + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b4-probe.test.ts`
  - Observed: NOT a parse throw (matching S2.13's observation that @tsrx/core accepts templates in
    expression position — the T002 parse-phase expectation was wrong there too; no divergence). Zero
    diagnostics in every pass. The stored `<h1>` is collected as a REAL host node
    (`hostNodes: [{"id":"h0","tagName":"h1"},{"id":"h1","tagName":"section"}]`) and ships a REAL
    locator (`{"hostNodeId":"h0","strategy":"dom-order","index":0,"tagName":"h1"}`) for DOM that never
    renders. The hole is an opaque text read (`templateReads[0].source = "header"`), and the emitted SSR
    module renders `marklessSsrText(header)` WITHOUT ever declaring `header` — executing it throws,
    quoted verbatim: `ReferenceError: header is not defined`.
- Spec check: T003 rubric §2 names "template-as-value where no VDOM value exists" as an ERROR category;
  specs/framework/01-tsrx-host-contract.md — templates compile to host structure, locators, and anchors,
  never to a runtime value. Cross-reference S2.13: same family, and this entry REUSES S2.13's proposed
  code exactly as its impl-note anticipated ("B4's S4.05/S4.06 will need the same template-as-value
  ownership; one code should serve all sites").
- Verdict: ERROR
- Rationale: Same template-as-value class as S2.13, one binding-shape over: instead of a silent
  `undefined` payload cell (S2.13's `state(<p>hi</p>)`), a plain local produces a guaranteed
  `ReferenceError` in the emitted module (the S3.12 undeclared-local emit bug-class) PLUS a shipped
  locator for a phantom `<h1>` — payload metadata pointing at DOM that cannot exist. No VDOM value
  exists for `header` to hold; the prep §5 habit needs a loud teaching rejection at the declaration.
- Required diagnostic:
  - Code: MARKLESS_TEMPLATE_AS_VALUE (reuse from S2.13 — same code, new site: plain local declarator)
  - Severity: error — Phase: semantic-graph
  - Title: A template is not a value
  - Message: `const header = <h1>Hi</h1>` stores a template in `header`. Templates compile into page
    structure; `header` can only hold data, so there is no value here to place with `{header}`.
  - Why: Templates compile to DOM structure with locators for resume — there is no render-output object
    that could live in a variable.
  - Suggestion(s): Put the template in the tree — before: `const header = <h1>Hi</h1>;
    <section>{header}</section>` — after: `<section><h1>Hi</h1></section>`; extract a component
    (`function Header() @{ <h1>Hi</h1> }` used as `<Header />`) if it repeats.
  - docsUrl: https://markless.dev/errors/MARKLESS_TEMPLATE_AS_VALUE
- Impl-note: collect-state/collect-elements — the element walk collects any template node it meets, even
  inside a declarator initializer, so the host/locator plan and the value plan disagree; the S2.13
  declarator-argument detector family extends to plain `const`/`let` initializers. The undeclared-local
  render emit is the same bug-class item filed under S3.12.
- Runtime follow-up: none (the ReferenceError is a static JavaScript fact, executed in-node this batch).

### S4.06 — imperative template assembly: `rows.push(<li>{r}</li>)`
- Snippet:
  ```tsrx
  const rows = [];
  for (const r of ['a', 'b']) rows.push(<li>{r}</li>);
  <ul>{rows}</ul>
  ```
- Probe layer: SG + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b4-probe.test.ts`
  - Observed: ONE diagnostic fires, for the wrong reason, quoted verbatim:
    `{"code":"MARKLESS_STATE_UNRESOLVED_WRITE","severity":"error","phase":"state-lowering","title":"Cannot resolve graph write target","message":"Cannot write to \"rows\" because it does not resolve to graph state.","why":"Only state() bindings and supported graph paths can be mutated across a resume boundary.","suggestions":[{"message":"Write to a state() binding, a path inside object state, or move non-graph mutation into normal local code."}],"docsUrl":"https://markless.dev/errors/MARKLESS_STATE_UNRESOLVED_WRITE"}`
    — the suggestion recommends "move non-graph mutation into normal local code", which is exactly what
    the author wrote (B7 batch finding 2: the plain-local-write over-rejection). Meanwhile the pushed
    `<li>` is collected as a real host node with a shipped locator
    (`hostNodes: [{"id":"h0","tagName":"li"},{"id":"h1","tagName":"ul"}]`), the push argument is recorded
    as `stateWrites[0].argumentSources = ["<li>{r}</li>"]` (raw TSRX source as a value string), and the
    emitted SSR module renders `marklessSsrText(rows)` without declaring `rows` — executed:
    `ReferenceError: rows is not defined`.
- Spec check: T003 rubric §2 — template-as-value ERROR category (cross-reference S2.13; this entry reuses
  S2.13's code — no divergence); specs/framework/01-tsrx-host-contract.md — templates compile to
  structure. The @for construct (spec 01:33-58) is the sanctioned way to repeat structure.
- Verdict: ERROR
- Rationale: The prep §5 imperative-assembly habit dies three ways today: a misdirected
  MARKLESS_STATE_UNRESOLVED_WRITE whose own suggestion points back at the code as written, a phantom
  `<li>` locator in the payload, and a guaranteed ReferenceError in the emitted module — none of which
  teaches "templates are not array items". The ideal is the template-as-value rejection AT the push
  site, naming @for as the fix. NOTE: if B7's plain-local-write over-rejection is ever relaxed, the
  only diagnostic here disappears and this becomes fully silent until the render crash — the
  template-as-value code must land first or together.
- Required diagnostic:
  - Code: MARKLESS_TEMPLATE_AS_VALUE (reuse from S2.13/S4.05 — same code, new site: call-argument)
  - Severity: error — Phase: semantic-graph
  - Title: A template is not a value
  - Message: `rows.push(<li>{r}</li>)` passes a template as a value. Templates compile into page
    structure; `rows` can only hold data, so `{rows}` cannot place them.
  - Why: Templates compile to DOM structure with locators for resume — there is no render-output object
    to collect into an array.
  - Suggestion(s): Let @for own the repetition — before: `const rows = []; for (const r of data)
    rows.push(<li>{r}</li>); <ul>{rows}</ul>` — after: `<ul>@for (const r of data; key r) { <li>{r}</li> }</ul>`.
  - docsUrl: https://markless.dev/errors/MARKLESS_TEMPLATE_AS_VALUE
- Impl-note: same declarator/argument template detector family as S2.13/S4.05 (collect-state /
  collect-expressions call-argument site); sequencing dependency on B7's plain-local-write decision
  recorded above.
- Runtime follow-up: none (the ReferenceError is a static JavaScript fact, executed in-node this batch).

### S4.07 — component invoked as a plain call: `{Card({ title })}`
- Snippet:
  ```tsrx
  function Card({ title }) @{ <h2>{title}</h2> }
  export function App() @{
    <section>{Card({ title: 'Hello' })}</section>
  }
  ```
- Probe layer: SG + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b4-probe.test.ts`
  - Observed: zero diagnostics in every pass. `components: [{"name":"Card"},{"name":"App"}]`; the call
    is an opaque text read (`templateReads[1].source = "Card({ title: 'Hello' })"`). The emitted SSR
    module renders CARD as the app root — its body is `const { title } = props ?? {}; ... "<h2>" +
    marklessSsrText(title) + "</h2>"` — and the EXPORTED App is never emitted anywhere. Executed SSR
    html: `<h2></h2>` (Card with undefined title; App's `<section>` is gone). A dom-update symbol is
    even planned for the phantom root: `domUpdates[0] = {"hostNodeId":"h0","source":"title","graphNodeId":"prop:props","path":["title"],"target":{"kind":"text"},"symbolId":"symbol:0"}`.
    Both host locators (h2 AND section) ship in `protocolView.locators` while only the h2 renders.
- Spec check: specs/framework/10-render-architecture.md:38-41, verbatim: "When a `.tsrx` file exports
  multiple top-level components and no unambiguous app root can be selected, app code must pass the
  intended compiled artifact to the framework renderer explicitly. The compiler must not emit generic
  render helpers that silently choose one." specs/framework/01-tsrx-host-contract.md:12 — components are
  "ordinary TypeScript functions returning TSRX", which is exactly why the call parses; the host profile
  gives the call no render meaning (prep §7 identity trap).
- Verdict: ERROR
- Rationale: Two independent silent failures proven in one run: (1) `Card({...})` in a hole renders
  nothing and warns nothing — the classic React-trained identity trap; (2) batch finding 1 — the module
  emitter roots at `components[0]` and silently emits the NON-exported Card as the app while discarding
  the exported App, directly violating the spec's no-silent-choice mandate. Both need loud rejection.
- Required diagnostic:
  - Code: MARKLESS_COMPONENT_CALL_IN_TEMPLATE (new)
  - Severity: error — Phase: semantic-graph
  - Title: Components are used as tags, not called
  - Message: `Card({ title: 'Hello' })` calls `Card` like a function. `Card` compiles into page
    structure, so the call returns nothing to place here.
  - Why: A component invocation is compiled structure with its own graph scope and locators; a runtime
    call has no render output in the no-VDOM model.
  - Suggestion(s): Use the component as a tag — before: `{Card({ title: 'Hello' })}` — after:
    `<Card title={'Hello'} />`.
  - docsUrl: https://markless.dev/errors/MARKLESS_COMPONENT_CALL_IN_TEMPLATE
- Impl-note: detector in collect-expressions/collect-components (callee resolves to a known component in
  the same module — the components list already exists when holes are walked). The root-selection half
  is batch finding 1 (module.ts:29 `components[0]` vs plan.ts:1543 export-preferring `findComponent` —
  the two passes must share ONE root-selection rule that errors on ambiguity per spec 10:38-41).
- Runtime follow-up: none (which component was emitted is a static module-source fact, executed in-node).

### S4.08 — render helper returning a template: `{renderBadge(count)}`
- Snippet:
  ```tsrx
  function renderBadge(n) @{ <span>{n}</span> }
  export function App() @{
    let count = state(1);
    <p>{renderBadge(count)}</p>
  }
  ```
- Probe layer: SG + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b4-probe.test.ts`
  - Observed: zero diagnostics in every pass. `components: [{"name":"renderBadge"},{"name":"App"}]` —
    the helper IS a component by shape (`@{` body), and batch finding 1 applies verbatim: the emitted
    SSR module roots at renderBadge (`const { n } = props ?? {}; ... "<span>" + marklessSsrText(n) +
    "</span>"`), executed SSR html `<span></span>` (undefined n), and the exported App — including its
    `count` payload cell wiring — is never emitted. `graphBindings` records BOTH `prop:n` and
    `state:count`; `domUpdates[0]` targets the helper's span text (`{"source":"n","graphNodeId":"prop:n",...,"symbolId":"symbol:0"}`).
    The call itself is an opaque text read (`templateReads[1].source = "renderBadge(count)"`) — the
    `count` argument is never lowered as a read.
- Spec check: specs/framework/01-tsrx-host-contract.md:12 — "components as ordinary TypeScript functions
  returning TSRX": by TSRX's own definition `renderBadge` IS a component, so the requested
  helper-vs-component distinction is: there is no third kind — a lowercase name does not make it a
  render function. specs/framework/10-render-architecture.md:38-41 no-silent-choice mandate (violated,
  batch finding 1). TSRX MCP unavailable — fallback to local spec noted.
- Verdict: ERROR
- Rationale: Same double failure as S4.07 — the call in the hole renders nothing (identity trap, prep
  §7) and the emitter silently roots at the helper. The verdict T002 asked for: `renderBadge` is not a
  distinct "render helper" concept; any `@{`-bodied function is a component and must be used as a tag.
  The diagnostic teaches that confidently instead of inventing a helper category.
- Required diagnostic:
  - Code: MARKLESS_COMPONENT_CALL_IN_TEMPLATE (reuse from S4.07 — same detector, helper-named message)
  - Severity: error — Phase: semantic-graph
  - Title: Components are used as tags, not called
  - Message: `renderBadge(count)` calls the component `renderBadge` like a function. Its template
    compiles into page structure, so the call returns nothing to place here.
  - Why: A component invocation is compiled structure with its own graph scope and locators; a runtime
    call has no render output in the no-VDOM model.
  - Suggestion(s): Use it as a tag — before: `<p>{renderBadge(count)}</p>` — after:
    `<p><renderBadge n={count} /></p>` (rename to `Badge` for convention if desired).
  - docsUrl: https://markless.dev/errors/MARKLESS_COMPONENT_CALL_IN_TEMPLATE
- Impl-note: same detector and root-selection items as S4.07 (batch finding 1).
- Runtime follow-up: none (static module-source facts, executed in-node).

### S4.09 — un-read state ref as an attribute value: `<div data-x={menu}>`
- Snippet:
  ```tsrx
  const menu = state({ open: false });
  <div data-x={menu}>x</div>
  ```
- Probe layer: SG + FC + SER
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b4-probe.test.ts`
  - Observed: zero diagnostics in every pass. UNLIKE S1.01's uncollected `console.log(x)` read
    (divergence stated explicitly), this escape IS collected and lowered:
    `templateReads[0] = {"hostNodeId":"h0","source":"menu","target":{"kind":"attribute","name":"data-x"}}`,
    `stateLowering.reads[0] = {"source":"menu","graphNodeId":"state:menu","path":[]}`, and a dom-update
    symbol is planned (`domUpdates[0] = {...,"target":{"kind":"attribute","name":"data-x"},"symbolId":"symbol:0"}`).
    The failure is the VALUE: the SSR module renders `marklessSsrAttribute("data-x", menu)` and executes
    to `<div data-x="[object Object]">x</div>` (batch finding 3). The payload cell also drops the false
    field: `{"id":0,"type":"object","fields":[]}` (batch finding 4).
- Spec check: specs/framework/03-state-graph.md:258 — "Dynamic values are still validated at runtime
  serialization"; no local spec section defines object-to-attribute serialization (TSRX MCP unavailable
  — fallback noted). specs/framework/05-resumability-payload.md owns value tiers for CELLS, not
  attribute emission — the attribute path has no serialization contract at all today.
- Verdict: WARN
- Rationale: The plumbing is graph-correct (read lowered, update symbol planned — the S3.12-style
  discovery hole does NOT apply here, divergence from that failure class stated), but the rendered value
  is meaningless `[object Object]` text with zero diagnostics — silent-wrong output (rubric rule 4).
  WARN rather than ERROR because a path read one level down (`data-x={menu.open}`) is the dominant
  legitimate shape and objects with intentional string conversion exist; the compiler statically knows
  `menu`'s initializer is a plain object literal and should say what the attribute will actually contain.
- Required diagnostic:
  - Code: MARKLESS_ATTRIBUTE_OBJECT_VALUE (new)
  - Severity: warning — Phase: semantic-graph
  - Title: This attribute renders "[object Object]"
  - Message: `data-x={menu}` writes the whole `menu` object into an attribute. Attributes hold text, so
    the page shows `data-x="[object Object]"`, not the data inside `menu`.
  - Why: Attribute bindings serialize to plain text in HTML and DOM updates; only the graph cell keeps
    the structured value across resume.
  - Suggestion(s): Bind the field you mean — before: `<div data-x={menu}>` — after:
    `<div data-x={menu.open}>`; or serialize deliberately with a derived string value.
  - docsUrl: https://markless.dev/errors/MARKLESS_ATTRIBUTE_OBJECT_VALUE
  - Escape hatch (WARN only): `// markless-allow MARKLESS_ATTRIBUTE_OBJECT_VALUE: custom toString is
    intended` on the element line silences exactly this site.
- Impl-note: collect-expressions attribute-target reads where the resolved binding's `valueKind` is
  `object`/`array` (statically known from collect-state); emit-side String() coercion is batch finding 3.
- Runtime follow-up: BM-deferred-to-B8 (what the planned data-x dom-update symbol writes after a
  `menu` write — expected the same `[object Object]`, unproven; plus the dropped-false-field resume
  question shared with S4.02).
- B8 resolution (T015): RESOLVED — both halves (temporary fixture crazy-qa-b8-attr-object.tsrx, SSR+resume):
  the served attribute is `data-x="[object Object]"` and after a resumed click writes `menu.label = 'changed'`
  the dom-update path rewrites the attribute to the same `"[object Object]"` (verbatim, zero errors) — the
  update symbol is live but can only ever produce the same meaningless text. The false-field resume half is
  resolved on S4.02's B8 line (serializer-tier drop of every falsy field except undefined).

### S4.10 — statement-shaped try/catch IIFE in a hole (with a plain helper above the component)
- Snippet:
  ```tsrx
  function risky() { return 'ok'; }
  export function App() @{
    <p>{(function () { try { return risky(); } catch { return '?'; } })()}</p>
  }
  ```
- Probe layer: SG + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b4-probe.test.ts`
  - Observed: zero diagnostics in every pass — and NO render module exists at all: `moduleSource`,
    `csrModuleSource`, and `ssrModuleSource` are all `""` with `publicRenderDiagnostics: []`. Cause is
    batch finding 1: `components: [{"name":"risky"},{"name":"App"}]` — the template-less helper `risky`
    is counted as a component (ast/tsrx.ts:22-25 counts every top-level FunctionDeclaration), the module
    emitter roots at `components[0]`, finds no template root in `risky`, and silently emits nothing.
    Declaring one plain helper function above the component killed the entire app with zero diagnostics.
    The hole itself was collected as an opaque text read
    (`templateReads[0].source = "(function () { try { return risky(); } catch { return '?'; } })()"`,
    `stateLowering.reads: []`) — the S4.04 render-once class, had anything been emitted.
- Spec check: specs/framework/10-render-architecture.md:38-41 — "The compiler must not emit generic
  render helpers that silently choose one" (here it silently chose a NON-component and produced
  nothing); MARKLESS_PUBLIC_RENDER_ROOT_UNSUPPORTED exists (passes/public-render/diagnostics.ts:61) and
  does not fire.
- Verdict: ERROR
- Rationale: The headline B4 finding: module-level code organization — a helper function above the
  component, universal JavaScript style — silently deletes the app's render output. No legitimate
  reading exists for "compiles clean, renders nothing". The IIFE-in-hole half is S4.04's item; the
  statement-shaped-logic answer for authors (try/catch around a render value) is the same
  `computed()`-hoist suggestion recorded there.
- Required diagnostic:
  - Code: MARKLESS_PUBLIC_RENDER_ROOT_UNSUPPORTED (reuse — fire it instead of emitting empty sources)
  - Severity: error — Phase: public-render
  - Title: No renderable component root was found
  - Message: The compiled module rendered nothing because root selection picked `risky`, which has no
    template. The component `App` was never emitted.
  - Why: The render module anchors one root component's structure and locators for resume; selecting a
    template-less function leaves nothing to anchor.
  - Suggestion(s): Root selection should prefer the exported `@{`-bodied component (App) — this is a
    compiler fix, not an authoring fix; authors should not need to reorder declarations.
  - docsUrl: https://markless.dev/errors/MARKLESS_PUBLIC_RENDER_ROOT_UNSUPPORTED
- Impl-note: two-part fix owned by batch finding 1 — (a) `getComponentFunction` (ast/tsrx.ts:22-25) must
  apply the same template-body filter to FunctionDeclarations that it already applies to arrows
  (tsrx.ts:36 JSXCodeBlock check), so helpers stop being components; (b) emitPublicRenderModule
  (module.ts:29) must use export-preferring root selection shared with plan.ts:1543 and diagnose
  ambiguity instead of choosing `components[0]`.
- Runtime follow-up: BM-deferred-to-B8 (shared with S4.03: framework render entrypoints handed an
  all-empty compiled module).
- B8 resolution (T015): RESOLVED — shared run recorded on S4.03's B8 line: the all-empty compiled module's
  default export is an empty object; `render()` throws `TypeError: component.renderCsr is not a function`,
  `renderToString` fails with `Failed to load url .../[object%20Object]` — no MARKLESS diagnostic anywhere.
  This exact fixture (helper above the component) additionally killed the S5.08 behavior fixture until the
  factory was moved below the component (`renderToString(App) requires a compiled TSRX artifact.`), re-confirming
  batch finding 1 against a second authoring shape.

### S4.11 — conditional class + object style bindings
- Snippet:
  ```tsrx
  let active = state(true);
  let c = state('red');
  <div class={active ? 'on' : 'off'} style={{ color: c }}>x</div>
  ```
- Probe layer: FC + BM
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b4-probe.test.ts`
  - Observed (class half — correct): `templateReads[0] = {"hostNodeId":"h0","source":"active","target":{"kind":"class","trueValue":"on","falseValue":"off"}}`,
    `stateLowering.reads[0] = {"source":"active","graphNodeId":"state:active","path":[]}`, dom-update
    planned (`domUpdates[0] = {...,"target":{"kind":"class","trueValue":"on","falseValue":"off"},"symbolId":"symbol:0"}`),
    executed SSR html carries `class="on"`. (style-object half — broken): `templateReads[1] =
    {"hostNodeId":"h0","source":"{ color: c }","target":{"kind":"style"}}` is recorded, but `c` is NEVER
    lowered (`stateLowering.reads` has only `active`), NO dom-update exists for the style, and the SSR
    module emits `marklessSsrAttribute("style", { color: c })` — executed html:
    `style="[object Object]"` (batch findings 2+3). CONTROL: the identifier style binding
    `style={c}` with `c = state('color: red')` is FULLY correct — read lowered, dom-update planned
    (`{"target":{"kind":"style"},"symbolId":"symbol:0"}`), executed html `style="color: red"`.
  - Existing test (both): the conditional-class binding is browser-proven by spread-class.tsrx
    (`class={picked ? 'chip picked' : 'chip plain'}` flips on click) — constructs-csr.test.ts:50-65 and
    constructs-ssr.test.ts:46-61 — rerun: pass (32 passed + 2 expected-fail baseline). No existing test
    covers the object style shape.
- Spec check: specs/framework/10-render-architecture.md §SSR renderer owns — DOM update records for
  "class" updates (met) and "attribute/property" updates (style-object: not met). Local specs never
  define an object style binding syntax (TSRX MCP unavailable — fallback noted): the supported style
  contract observable from artifacts is string-valued (`target.kind: "style"` with a string source).
- Verdict: ERROR
- Rationale: The everyday case splits exactly down the middle: conditional class is ALREADY-CORRECT
  quality (artifact + browser proven), while the React-trained object style — the single most common
  style idiom devs will carry in — ships literal `[object Object]` css and never updates, silently
  (rubric rule 4). Either the compiler lowers object styles (they are statically analyzable property
  maps — the ideal) or it rejects the shape loudly; shipping garbage text is not an option.
- Required diagnostic:
  - Code: MARKLESS_STYLE_OBJECT_UNSUPPORTED (new; the loud gate until object-style lowering ships)
  - Severity: error — Phase: semantic-graph
  - Title: style does not take an object yet
  - Message: `style={{ color: c }}` passes an object, so the element renders
    `style="[object Object]"` and never updates when `c` changes.
  - Why: Style bindings compile to string-valued DOM-update records; an object literal has no planned
    lowering, so neither the text nor the subscription exists.
  - Suggestion(s): Bind a style string — before: `style={{ color: c }}` — after:
    `style={'color: ' + c}` (each graph read in the string lowers and updates), or set static styles in
    a scoped `<style>` block.
  - docsUrl: https://markless.dev/errors/MARKLESS_STYLE_OBJECT_UNSUPPORTED
- Impl-note: collect-expressions records the style target but does not descend into object-literal
  values (same composite-expression lowering gap as S4.04/batch finding 2 — object styles are the
  strongest candidate for compiler-handled support since the property map is fully static);
  string-coercion emit is batch finding 3.
- Runtime follow-up: none for the inertness claim (no dom-update record is a static payload fact);
  class-flip runtime behavior browser-proven via the rerun.

### S4.12 — duplicate and mistyped attributes: `<div id="a" id="b">`, `claass`, lowercase `onclick`
- Snippet:
  ```tsrx
  <div id="a" id="b">Hi</div>
  // sibling: let count = state(0);
  <button claass="x" onclick={() => count++}>Hi</button>
  ```
- Probe layer: SG + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b4-probe.test.ts`
  - Observed: NO parse throw — the T002/T012 parse-phase expectation did not materialize; @tsrx/core
    accepts duplicate attributes and any attribute name (so no external-boundary flag applies). Zero
    diagnostics in every pass for both variants. (a) The direct render module embeds the duplicate
    verbatim: `const marklessPublicRootTemplate = "<div id=\"a\" id=\"b\">Hi</div>";` and executed SSR
    html is `<div id="a" id="b">Hi</div>` — invalid HTML shipped as-is. (b) `claass="x"` passes through
    as a static attribute. Lowercase `onclick={() => count++}` is NOT an event: `events: []`,
    `extractedSymbols: []` — instead it becomes an attribute binding
    (`templateReads[0] = {"hostNodeId":"h0","source":"() => count++","target":{"kind":"attribute","name":"onclick"}}`)
    whose SSR emit is `marklessSsrAttribute("onclick", () => count++)`, executing to
    `onclick="() =&gt; count++"` — the handler's source text serialized into a live inline-handler
    attribute. The write inside is still collected (`stateLowering.writes[0] = {"source":"count",...,"operation":"update","updateOperator":"++"}`)
    and `count` gets a real payload cell, wiring state for an event that can never fire through markless.
- Spec check: local specs are silent on duplicate/unknown attribute names (TSRX MCP unavailable —
  fallback noted; https://tsrx.dev/specification is the authority for attribute grammar). Event
  discovery contract: specs/framework/04-events-symbols-behaviors.md §Symbol loading and event wiring —
  "The compiler and bundler own event discovery"; the on[A-Z] convention is what separates events from
  attributes (isEventAttribute, @tsrx/core), so a case typo silently changes the semantic category.
- Verdict: ERROR
- Rationale: Copy-paste duplicates have no legitimate reading — the AST statically proves the same
  attribute name twice on one element, and the shipped output is invalid HTML whose winning value the
  author cannot see (SSR text keeps both; a DOM parse keeps the FIRST while a setAttribute path keeps
  the LAST — a latent CSR/SSR divergence). The lowercase `onclick` typo is worse: a function value
  aimed at an event silently becomes stringified source in the markup, with the state graph half-wired
  behind it. Unknown-but-valid names like `claass` stay ALLOW territory (HTML is open; data-*/custom
  attributes are legitimate) — no typo-guessing diagnostic is proposed.
- Required diagnostic:
  - Code: MARKLESS_ATTRIBUTE_DUPLICATE (new)
  - Severity: error — Phase: semantic-graph
  - Title: Duplicate attribute on one element
  - Message: `id` appears twice on this `<div>` (`id="a"` and `id="b"`). Only one can win, and
    server-rendered and client-rendered output disagree about which.
  - Why: The emitted HTML and the DOM update path resolve duplicates differently, so the page's identity
    attributes would depend on how it was rendered.
  - Suggestion(s): Keep one — before: `<div id="a" id="b">` — after: `<div id="b">`.
  - docsUrl: https://markless.dev/errors/MARKLESS_ATTRIBUTE_DUPLICATE
- Impl-note: collect-elements attribute walk sees every attribute in order — a per-element name set is
  sufficient. The function-valued-attribute sibling (`onclick={fn}`) should extend S4.09's
  attribute-value family with a case-aware suggestion ("did you mean `onClick`?" — the compiler
  statically sees a function value on an `on*`-lowercase name; kinship with S3.06's
  MARKLESS_EVENT_HANDLER_NOT_A_FUNCTION mirror case: there a non-function on an event name, here a
  function on a non-event name).
- Runtime follow-up: BM-deferred-to-B8 (which duplicate id a real browser DOM exposes per render path,
  and what a real click does with the stringified `onclick` attribute).
- B8 resolution (T015): RESOLVED (temporary fixture crazy-qa-b8-dup-attrs.tsrx): BOTH render paths expose
  `id="a"` (first wins) — `<div id="a" data-dup="">Hi</div>` verbatim in CSR and SSR — because both paths
  reach the live DOM through an HTML parse (renderServerHTML injection and the CSR fragment parse), so the
  latent setAttribute last-wins divergence did not materialize in either shipped path. The stringified
  handler ships live: `<button claass="x" data-low="" onclick="() =&gt; count++">Hi</button>`; a real click
  evaluates `() => count++` as an expression statement — a silent no-op (no error, no dispatch, no state
  change). Verdict unchanged.

### Batch 4 summary

| Scenario | Verdict | Probe kind | Backlog? |
| --- | --- | --- | --- |
| S4.01 | ALREADY-CORRECT | both | no (duplicate-literal fold recorded under S4.12; spread reactivity under S4.02) |
| S4.02 | WARN | new-probe | yes (MARKLESS_SPREAD_STATIC_SNAPSHOT; shared spread-resolution pass with S3.12; false-field payload drop → B8) |
| S4.03 | ERROR | both | yes (fire PUBLIC_RENDER_ROOT_UNSUPPORTED instead of silent empty emit; `<Tag>` string-const resolution; external-boundary wrap for the call-tag SyntaxError) |
| S4.04 | ERROR | new-probe | yes (MARKLESS_TEMPLATE_EXPRESSION_STATIC gate or composite-expression lowering — shares machinery with S2.11; highest-priority B4 item with finding 1) |
| S4.05 | ERROR | new-probe | yes (reuse MARKLESS_TEMPLATE_AS_VALUE from S2.13; phantom-locator + undeclared-local emit bug-class from S3.12) |
| S4.06 | ERROR | new-probe | yes (reuse MARKLESS_TEMPLATE_AS_VALUE; must land before/with B7's plain-local-write relaxation) |
| S4.07 | ERROR | new-probe | yes (MARKLESS_COMPONENT_CALL_IN_TEMPLATE; root-selection unification — batch finding 1) |
| S4.08 | ERROR | new-probe | yes (reuse MARKLESS_COMPONENT_CALL_IN_TEMPLATE; batch finding 1) |
| S4.09 | WARN | new-probe | yes (MARKLESS_ATTRIBUTE_OBJECT_VALUE; String() emit coercion — batch finding 3) |
| S4.10 | ERROR | new-probe | yes (helper-counted-as-component + components[0] rooting — batch finding 1's concrete fix pair) |
| S4.11 | ERROR | both | yes (MARKLESS_STYLE_OBJECT_UNSUPPORTED gate or object-style lowering; class half already correct) |
| S4.12 | ERROR | new-probe | yes (MARKLESS_ATTRIBUTE_DUPLICATE; function-valued lowercase on* attribute sibling via S4.09's family) |

Verdict counts: ALLOW 0, ALREADY-CORRECT 1, WARN 2, ERROR 9.

T900 note (B4): batch finding 1 (silent `components[0]` rooting + helpers counted as components,
spec 10:38-41 violation — S4.07/S4.08/S4.10 and the root half of S4.03) and batch finding 2 (composite
template expressions never lower — S4.02/S4.04/S4.11 and the nested dynamic-tag inertness in S4.03) are
the two root causes behind seven of the nine ERRORs; fixing those two mechanisms retires most of this
batch's backlog in one pass each.

## Batch 5 — Behaviors + locators

Run context (T013, 2026-07-04): all compiler "Observed" values below are verbatim from a temporary probe
test `packages/compiler/test/crazy-qa-b5-probe.test.ts` (one test per scenario plus controls, calling the
real `buildSemanticGraph` / `compileTsrxModule` entrypoints, deleted after the runs per T003 §6), executed
with `pnpm exec vp test packages/compiler/test/crazy-qa-b5-probe.test.ts` (16 tests passed; probe facts
written to a scratchpad log outside the repo and read back, because vp test suppresses console output).
Re-verify commands: `pnpm exec vp test packages/compiler/test/semantic-diagnostics.test.ts` — 11 tests,
all passed (covers the cited :560/:466/:524 shipped shapes) — and the browser rerun
`pnpm exec vp test --project browser packages/vitest-browser/browser/constructs-csr.test.ts packages/vitest-browser/browser/constructs-ssr.test.ts`
— 32 passed + 2 `test.fails` known-red children-projection tests (same baseline as the T009/T012 runs).
That browser rerun covers the attach-behavior.tsrx fixture (S5.08's cited PARTIAL coverage: inline-arrow
attach activates against the real host, CSR constructs-csr.test.ts:205, SSR constructs-ssr.test.ts:203)
and the element-handle.tsrx fixture (plain `box.focus()` through a resumed handler focuses the real input,
constructs-csr.test.ts:217, constructs-ssr.test.ts:219). TSRX MCP and grep MCP were unavailable this
session; spec checks cite the local split specs (fallback per AGENTS.md) — `attach`, `el`, and `element()`
are markless-owned framework APIs, so specs/framework/04-events-symbols-behaviors.md is the primary
authority. All snippets assume `import { state, element } from '@markless/core';` inside
`export function App() @{ ... }` unless shown otherwise.

Batch-level structural findings (cited per entry below):

1. **Optional-chain handle calls are silently deleted from handler emit; plain calls work.** Authored
`h.focus()` in a handler emits `context.getElementHandle("h")?.focus();` (S5.10b), but authored
`h?.focus()` — the spec's own SearchBox idiom (specs/framework/04:20 `onClick={() => input?.focus()}`) —
is deleted from the emitted symbol with zero diagnostics (S5.04b, S5.10). The emit inserts `?.` itself,
so the authored optional chain is a pure emit-coverage hole in the S3.08 writes-only family.
2. **The el= validator resolves only same-component local `element()` names.** `graphBindingMap` lookup
by source text means a prop-forwarded handle (`el={props.handle}`, S5.05) and a module-scope handle
(S5.06) both fail as `"...is an unknown value, not an element() handle"` — even though
specs/framework/04:39-41 says passing handles through context, arrays, and helpers is valid, and even
though the S5.06 handle IS `element()`.
3. **Handle-into-state is guarded only at the `state()` initializer.** collect-state's
`findElementHandleStateValue` catches `state(input)` (S5.03a), but the write path `menu.node = input`
lowers clean and the emitted handler writes `context.graph.read("element:input")` into serialized state
`state:menu.node` with zero diagnostics in any pass (S5.03b).
4. **Behavior plumbing is right for imported factories and wrong around local ones.** Payload behavior
records carry both `inputValues` and `inputGraphReads` for a `state()` input (S5.08), and an imported
factory emits a complete behavior module (S5.08-alt). But a local named factory plans a behavior symbol
that `protocolView` references (`symbolId: "symbol:0"`) while `canEmitBehaviorModule` (symbol-modules.ts:415,
requires `moduleImport` or inline function source) emits NO module — silent at compile time. And B7
finding 2's plain-local-write over-rejection fires INSIDE the factory's behavior body
(`node.dataset.x = ...` → MARKLESS_STATE_UNRESOLVED_WRITE), indicting the spec's own §Element behaviors
authoring shape.

### S5.01 — attach on a component, not a host
- Snippet:
  ```tsrx
  function ChartWrapper() @{ <canvas /> }
  export function Dashboard() @{
    const config = state({ color: 'red' });
    <section><ChartWrapper attach={chart(config)} /></section>
  }
  ```
- Probe layer: SG
- Probe kind: re-verify
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b5-probe.test.ts` (same source as the cited test)
  - Observed: `MARKLESS_ATTACH_HOST_ELEMENT_REQUIRED`, severity `error`, phase `semantic-graph`, title
    `attach can only be bound to host elements`, message `Cannot bind attach={chart(config)} on component
    <ChartWrapper>. attach installs DOM behavior and needs a concrete host element owner.`, why `Element
    behaviors are resumed by locating the owning DOM element. A component is not a DOM locator and may
    render zero, one, or many host nodes.`, suggestion `Move attach={...} to a host element such as
    <canvas>, or make the component forward behavior to a known host element in its own TSRX body.`,
    docsUrl `https://markless.dev/errors/MARKLESS_ATTACH_HOST_ELEMENT_REQUIRED`. Positive artifact fact:
    `behaviors: []` — no phantom behavior record survives the rejection.
  - Existing test: packages/compiler/test/semantic-diagnostics.test.ts:560 (exact-shape assertion incl.
    span on `chart(config)` and `graph.behaviors` emptiness) — rerun result: pass.
- Spec check: specs/framework/04-events-symbols-behaviors.md:115-117 — "`attach` is host-element-only.
  Components can expose higher-level wrappers, but `attach` passed directly to a component is a diagnostic
  unless that component's compiler output explicitly forwards it to a host element."
- Verdict: ALREADY-CORRECT
- Rationale: The spec names this exact diagnostic and it ships in full consequence → why → fix → link
  shape, quoting the author's own `attach={chart(config)}` and `<ChartWrapper>`. The suggestion names both
  sanctioned rewrites (move to a host element, or forward inside the component). Note: the spec's
  "unless that component's compiler output explicitly forwards it" escape is not implemented — no
  forwarding mechanism exists yet — but rejecting until it does is the honest capability posture.
- Required diagnostic: n/a (ships today).
- Impl-note: collect-elements.ts:197-206 (attach on non-host branch, before any hostNodeId requirement).
- Runtime follow-up: none.

### S5.02 — same handle on two elements / invalid el value
- Snippet:
  ```tsrx
  const menu = state({ open: false });
  let input = element<HTMLInputElement>();
  <section>
    <input el={menu} />
    <button el={input}>One</button>
    <button el={input}>Two</button>
  </section>
  ```
- Probe layer: SG
- Probe kind: re-verify
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b5-probe.test.ts` (same source as the cited test)
  - Observed: two diagnostics. (1) `MARKLESS_ELEMENT_HANDLE_REQUIRED`, severity `error`, phase
    `semantic-graph`, title `el expects an element() handle`, message `Cannot bind el={menu} because
    "menu" is state(), not an element() handle.`, why `DOM elements are host resources. el can only bind
    element() handles so resume can recover the current DOM locator without serializing a DOM node.`,
    suggestion `Create a handle with element<T>() and bind that handle with el={handle}. Keep DOM-backed
    resources in attach={...}.`, `elementLocator: "h1"`. (2) `MARKLESS_ELEMENT_HANDLE_DUPLICATE`, severity
    `error`, title `element() handle is bound more than once`, message `Cannot bind element handle "input"
    to multiple live host elements.`, why `A resumed element handle must resolve to one current DOM
    locator. Binding one handle to multiple live elements would make lazy event code ambiguous.`,
    suggestion `Create a separate element() handle for each host element, or move repeated element access
    into keyed state and behavior records.`, `elementLocator: "h3"` (the SECOND `el={input}` site — the
    first binding stays valid).
  - Existing test: packages/compiler/test/semantic-diagnostics.test.ts:466 (exact-shape assertion for
    both diagnostics with spans) — rerun result: pass.
- Spec check: specs/framework/04-events-symbols-behaviors.md:25-26 — "`el={handle}` binds that handle to
  exactly one host element in the current graph scope."
- Verdict: ALREADY-CORRECT
- Rationale: Both copy-paste failure shapes are caught at the exact offending span with the resume-model
  reasoning stated plainly ("one current DOM locator"), the kind of the wrong value named in the user's
  own words ("menu" is state()), and concrete rewrites. The duplicate diagnostic even points at the
  second binding, preserving the author's first intent.
- Required diagnostic: n/a (ships today).
- Impl-note: collect-elements.ts collectElementHandleDiagnostics (post-walk validation over
  elementHandleBindings + graphBindingMap).
- Runtime follow-up: none.

### S5.03 — element handle stored in state (initializer AND write path)
- Snippet:
  ```tsrx
  let input = element<HTMLInputElement>();
  const saved = state(input);              // (a) initializer — covered
  const menu = state({ node: null });
  <button onClick={() => { menu.node = input; }}>save</button>  // (b) later write — uncovered
  ```
- Probe layer: SG + SL + FC
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b5-probe.test.ts`
  - Observed (a, initializer): `MARKLESS_STATE_ELEMENT_HANDLE_UNSERIALIZABLE`, severity `error`, phase
    `semantic-graph`, title `element() handles cannot be stored in state`, message `Cannot store element
    handle "input" in state "saved" because element handles are DOM locators, not serializable graph
    data.`, why `state() values are serialized into markless/state and resumed without running component
    bodies. An element() handle resolves through DOM locator metadata and must stay outside serialized
    graph state.`, suggestion `Keep element handles in element() bindings and bind them with el={handle}.
    Store serializable ids, flags, or data in state() instead.`, `statePath: "saved"`, `source: "input"`.
  - Observed (b, write path): ZERO diagnostics in every pass (`semanticGraph/stateLowering/payloadArena/
    captureAnalysis/publicRenderPlan` all `[]`). The write lowers as ordinary graph data:
    `slWrites[0] = {"source":"menu.node","graphNodeId":"state:menu","path":["node"],"operation":"assign","valueSource":"input"}`,
    and the emitted handler symbol is `export function symbol_0(context) { context.graph.write({ graphNodeId:
    "state:menu", path: ["node"], value: context.graph.read("element:input") }); }` — the element handle
    value flows into serialized graph state at the first click, exactly what (a)'s diagnostic forbids.
  - Existing test: packages/compiler/test/semantic-diagnostics.test.ts:524 (exact-shape assertion for
    variant a) — rerun result: pass.
- Spec check: specs/framework/04-events-symbols-behaviors.md:39-40 — "`state()` cannot hold DOM nodes,
  and `element()` handles are not serialized as data." specs/framework/03-state-graph.md serialization
  contract (state cells are per-document serialized data). The spec forbids the VALUE class, not just the
  initializer syntax.
- Verdict: ERROR
- Rationale: Variant (a) ships in model shape (would be ALREADY-CORRECT alone). Variant (b) is the same
  violation through the everything-object habit — silent (rubric rule 4) and strictly worse at runtime:
  the write commits a handle-resolved value into a serialized cell that the next payload cannot represent.
  The lowering artifact already contains everything a detector needs (`valueSource: "input"` resolving to
  an `element`-kind graph binding), so the initializer guard should extend to write records.
- Required diagnostic:
  - Code: MARKLESS_STATE_ELEMENT_HANDLE_UNSERIALIZABLE (reuse — write-path variant)
  - Severity: error — Phase: state-lowering
  - Title: element() handles cannot be stored in state
  - Message: `menu.node = input` stores element handle `input` inside state `menu`. Element handles are
    DOM locators, not serializable graph data — `menu` could no longer be serialized or resumed.
  - Why: state() values are serialized into markless/state and resumed without running component bodies;
    a DOM-backed handle has no serialized form.
  - Suggestion(s): Store serializable data instead — before: `menu.node = input` — after: keep `input` in
    its element() binding and store an id or flag (`menu.hasTarget = true`), reading the handle where the
    DOM work happens.
  - docsUrl: https://markless.dev/errors/MARKLESS_STATE_ELEMENT_HANDLE_UNSERIALIZABLE
- Impl-note: state-lowering write resolution — when a write's `valueSource` resolves to a graph binding
  of kind `element`, emit the reused diagnostic (mirror of collect-state's findElementHandleStateValue,
  batch finding 3).
- Runtime follow-up: BM-deferred-to-B8 (what the live graph and the next serialization pass actually do
  after a resumed click commits `context.graph.read("element:input")` into `state:menu.node`).
- B8 resolution (T015): RESOLVED — the committed value is `undefined`, not a handle (temporary fixture
  crazy-qa-b8-handle-into-state.tsrx, SSR+resume): after clicking Save (`menu.node = box`) then Check
  (`menu.tag = menu.node`), the text binding renders `""` with zero errors — `context.graph.read("element:box")`
  resolves no graph cell, so `undefined` silently lands in state. Nothing DOM-backed ever reaches the graph,
  which makes the next-serialization question moot at runtime today: the failure mode is silent data
  absence (the author believes they saved a node), not an unserializable cell. The write-path diagnostic
  this entry requires is still the fix.

### S5.04 — element() never bound with el= (leftover after refactor)
- Snippet:
  ```tsrx
  let box = element<HTMLDivElement>();
  <div>no binding</div>                                  // (a) never bound, never read
  // (b) never bound but read: <button onClick={() => box?.scrollIntoView()}>go</button>
  ```
- Probe layer: SG + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b5-probe.test.ts`
  - Observed (a): zero diagnostics in every pass. The binding exists
    (`graphBindings[0] = {"id":"element:box","name":"box","kind":"element","declarationKind":"let","writable":false}`)
    but nothing is planned: `elementHandleBindings: []`, `payloadArena.view.elementHandles: []`,
    `protocolView.elementHandles: []`. Control (bound `el={box}`): payload and protocolView both carry
    `{"hostNodeId":"h0","handleId":"element:box","name":"box"}`.
  - Observed (b): zero diagnostics; the handler is extracted
    (`source: "() => box?.scrollIntoView()"`) but its emitted symbol module is
    `export function symbol_0(context) { void context; }` — INERT (batch finding 1's optional-chain
    deletion), and `payloadElementHandles: []` means even a corrected emit would resolve `box` to
    undefined forever.
- Spec check: specs/framework/04-events-symbols-behaviors.md:25-29 — a handle resolves through "the
  handle's serialized DOM locator"; without an `el=` binding no locator is ever recorded, so every read
  is `undefined` by contract. Local spec is silent on diagnosing unbound handles.
- Verdict: WARN
- Rationale: Variant (a) is dead code — correctly inert artifacts, no model violation; that half is lint
  territory and needs no framework diagnostic. Variant (b) is the real refactor leftover: the compiler
  can statically see a handle that is created, read by a lazy symbol, and bound nowhere in the module —
  a permanent no-op. Sometimes-intentional readings exist (a handle bound only in a variant under
  construction), so WARN with a per-site hatch, not ERROR. The inert-emit half of (b) is owned by batch
  finding 1 / S3.08's structural backlog, not this code.
- Required diagnostic:
  - Code: MARKLESS_ELEMENT_HANDLE_UNBOUND (new)
  - Severity: warning — Phase: semantic-graph
  - Title: element() handle is never bound with el=
  - Message: `box` is created with element() but no element binds it with `el={box}`, so
    `box?.scrollIntoView()` in onClick reads a handle that is always undefined — the call never runs.
  - Why: A handle resolves to a DOM element only through the locator recorded by its el= binding; with no
    binding there is nothing to resolve after resume.
  - Suggestion(s): Bind the handle to its host element — before: `<div>` — after: `<div el={box}>` — or
    delete the leftover `element()` declaration.
  - docsUrl: https://markless.dev/errors/MARKLESS_ELEMENT_HANDLE_UNBOUND
  - Escape hatch (WARN only): `// markless-allow MARKLESS_ELEMENT_HANDLE_UNBOUND: bound in a sibling
    variant still under construction` on the declaration line silences exactly this site. Fire only when
    the unbound handle is actually read or escapes; pure-unused declarations stay lint territory.
- Impl-note: collect-elements post-walk validation already builds the handle/binding maps
  (collectElementHandleDiagnostics) — the inverse check (element-kind binding with reads but no
  elementHandleBindings entry) fits beside MARKLESS_ELEMENT_HANDLE_DUPLICATE.
- Runtime follow-up: none (the inert symbol module and empty locator plan are static facts).

### S5.05 — el={props.handle}: handle forwarded from a parent
- Snippet:
  ```tsrx
  export function Field(props) @{
    <input el={props.handle} />
  }
  export function App() @{
    let h = element<HTMLInputElement>();
    <Field handle={h} />
  }
  ```
- Probe layer: SG + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b5-probe.test.ts`
  - Observed: `MARKLESS_ELEMENT_HANDLE_REQUIRED`, severity `error`, message `Cannot bind
    el={props.handle} because "props.handle" is an unknown value, not an element() handle.` (same why/
    suggestion as S5.02's shipped shape), `elementLocator: "h0"`. Artifacts: `graphBindings` carry BOTH
    `{"id":"prop:props",...,"valueKind":"object"}` and `{"id":"element:h",...}` — the parent's handle and
    the child's props are each modeled, but the el= validator's name lookup of `"props.handle"` finds no
    graph binding, so `payloadElementHandles: []` (no locator planned anywhere).
- Spec check: specs/framework/04-events-symbols-behaviors.md:39-41 — "Passing element handles through
  component context, arrays, and helpers is valid when the values remain inside `.tsrx` compiler-owned
  code." The ref-forwarding habit is SPEC-SANCTIONED; the implementation rejects it with a message that
  asserts the value is not a handle.
- Verdict: ERROR
- Rationale: A spec-vs-implementation conflict in the S7.05 pattern: the ideal end-state per spec is
  ALLOW (track the handle through the prop to the child's el= site). Until that plumbing exists, the
  mandated rejection is right in TIER but fails the shape bar — "is an unknown value, not an element()
  handle" tells an author who followed the spec that their handle is not a handle, and the suggestion
  ("Create a handle with element<T>()...") describes exactly what they already did. Honest capability
  gate wording is required (rubric rule 7: message-quality fix keeps the ERROR verdict).
- Required diagnostic (capability gate until prop-handle tracking ships):
  - Code: MARKLESS_ELEMENT_HANDLE_PROP_UNSUPPORTED (new; or a message variant of
    MARKLESS_ELEMENT_HANDLE_REQUIRED)
  - Severity: error — Phase: semantic-graph
  - Title: Handles passed through props are not supported yet
  - Message: `el={props.handle}` binds a handle that arrives through `props`, but the compiler cannot yet
    connect it to the `element()` declaration in the parent. The locator for `<input>` would never be
    recorded.
  - Why: Every el= binding must resolve to one compiler-known element() owner so resume can record and
    recover the DOM locator; prop-forwarded handles are not tracked across the component edge yet.
  - Suggestion(s): Declare the handle in the component that renders the host element — before:
    `<input el={props.handle} />` — after: `let field = element<HTMLInputElement>();` with
    `<input el={field} />` in Field, exposing imperative needs (focus, measure) through events or attach.
  - docsUrl: https://markless.dev/errors/MARKLESS_ELEMENT_HANDLE_PROP_UNSUPPORTED
- Impl-note: collect-elements collectElementHandleDiagnostics resolves handle names only through
  graphBindingMap by source text (batch finding 2); the spec's end-state needs prop-edge handle tracking
  in collect-components/collect-aliases. Cross-family: S7.05's helper-return alias gap (same
  "compiler-known owner" root need).
- Runtime follow-up: none (compile-time rejection; nothing reaches the payload).

### S5.06 — module-scope element() shared by two components
- Snippet:
  ```tsrx
  const box = element<HTMLDivElement>();  // module scope

  export function First() @{ <div el={box}>a</div> }
  export function Second() @{ <p el={box}>b</p> }
  ```
- Probe layer: SG
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b5-probe.test.ts`
  - Observed: NO module-scope diagnostic — unlike `state()`/`computed()` (S7.01's
    MARKLESS_STATE_MODULE_SCOPE), a module-scope `element()` is not caught by collect-module-scope.
    `graphBindings: []` (no binding is created for `box`), so BOTH el= sites fire
    `MARKLESS_ELEMENT_HANDLE_REQUIRED` with message `Cannot bind el={box} because "box" is an unknown
    value, not an element() handle.` (spans on each binding, `elementLocator: "h0"` and `"h1"`);
    `payloadElementHandles: []`.
- Spec check: specs/framework/03-state-graph.md:224-228 — the module-scope rejection rationale ("shared
  across requests... no home in the per-document serialization payload") applies verbatim to a handle
  whose locator must be per-document. specs/framework/04:25-26 — one handle, one host element "in the
  current graph scope"; a module-scope handle shared by two components has no single scope. Local spec
  names only state()/computed() at module scope; the element() case is unnamed.
- Verdict: ERROR
- Rationale: The singleton-ref habit is correctly rejected in TIER (a module-scope handle would be shared
  across requests and bound to multiple live elements), but by ACCIDENT and with wrong teaching: the
  author is told their `element()` handle "is an unknown value, not an element() handle" — the same
  gaslighting shape as S5.05, while the real reason (module scope) goes unnamed. The S7.01 family already
  ships the exact right diagnostic for state(); element() needs its mirror so the first-contact message
  names the actual mistake.
- Required diagnostic:
  - Code: MARKLESS_ELEMENT_MODULE_SCOPE (new; mirror of MARKLESS_STATE_MODULE_SCOPE)
  - Severity: error — Phase: semantic-graph
  - Title: element() handles cannot be created at module scope
  - Message: Cannot create element handle `box` at module scope. A module-scope handle would be shared by
    every component instance and every request, so `el={box}` in `First` and `Second` could never resolve
    to one element.
  - Why: An element handle resolves through a per-document DOM locator owned by one host element in one
    component scope; module scope has neither a document nor a single owner.
  - Suggestion(s): Move the element() declaration into each component that renders the host element —
    before: module-scope `const box = element…` — after: `let box = element<HTMLDivElement>();` inside
    `First` (and a separate handle inside `Second`).
  - docsUrl: https://markless.dev/errors/MARKLESS_ELEMENT_MODULE_SCOPE
- Impl-note: collect-module-scope covers state/computed creation only; extending it to `element` (and
  suppressing the misleading downstream ELEMENT_HANDLE_REQUIRED cascade, S7.01's cascade-noise note) is
  one collector branch. Cross-ref: S7.01 module-scope family.
- Runtime follow-up: none.

### S5.07 — reading the handle during render: `<div el={h}>{h.textContent}</div>`
- Snippet:
  ```tsrx
  let h = element<HTMLDivElement>();
  <div el={h}>{h.textContent}</div>
  ```
- Probe layer: SG + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b5-probe.test.ts`
  - Observed: zero diagnostics in every pass, and the handle read is wired as if it were reactive graph
    data: `templateReads[0].source = "h.textContent"`, lowered read
    `{"source":"h.textContent","graphNodeId":"element:h","path":["textContent"]}`, and a planned dom-update
    `{"hostNodeId":"h0","source":"h.textContent","graphNodeId":"element:h","path":["textContent"],"target":{"kind":"text"},"symbolId":"symbol:0"}`
    — a DOM update symbol subscribed to an element-handle "graph node" that is never serialized state.
    Worse, both emitted render modules interpolate `h` WITHOUT DECLARING IT: the SSR html line is
    `... + "<div>" + marklessSsrText(h.textContent) + "</div>"` and the CSR root is
    `marklessCsrRootFromHtml("<div>" + marklessCsrText(h.textContent) + "</div>")`, with no
    `let/const/var h` anywhere in either module — a guaranteed ReferenceError on first render (the
    S3.12/S4.05 undeclared-local emit bug class).
- Spec check: specs/framework/04-events-symbols-behaviors.md:26-28 — "During initial render, and after
  the element is removed, reading the handle produces `undefined`." A handle is "not reactive data"
  (04:25); render output must come from graph state, never from a locator that has no element yet.
- Verdict: ERROR
- Rationale: No legitimate reading exists: by spec the value is always `undefined` at render time, so
  `{h.textContent}` can never show text — and today's compile is silently wrong twice over (phantom
  dom-update symbol on a non-state node, undeclared identifier crash in both render modules; rubric
  rule 4). The framework has a confident teaching answer: content comes from state, handles are for
  browser-triggered imperative work.
- Required diagnostic:
  - Code: MARKLESS_ELEMENT_HANDLE_RENDER_READ (new)
  - Severity: error — Phase: semantic-graph
  - Title: element() handles cannot be read during render
  - Message: `{h.textContent}` reads element handle `h` while the component body renders. During initial
    render `h` is undefined — the DOM element does not exist yet — so this text can never appear.
  - Why: Handles resolve to DOM elements only inside browser-triggered code (event handlers, attach,
    onVisible); rendered output must come from graph state the server can serialize.
  - Suggestion(s): Render from state — before: `<div el={h}>{h.textContent}</div>` — after: keep the
    content in `state()`/`computed()` and render that (`<div el={h}>{label}</div>`), using `h` only
    inside handlers or behaviors.
  - docsUrl: https://markless.dev/errors/MARKLESS_ELEMENT_HANDLE_RENDER_READ
- Impl-note: collect-expressions/state-lowering treat `element`-kind bindings as readable graph paths in
  template position; the detector is a kind check at the template-read site. The undeclared-`h` render
  emit is the S3.12/S4.05 bug-class backlog item (render module must declare or reject locals it
  interpolates).
- Runtime follow-up: none (the undeclared identifier is a static JavaScript fact).

### S5.08 — attach={draggable(menu)}: graph state into a behavior factory
- Snippet:
  ```tsrx
  function draggable(target) {
    return (node) => { node.dataset.x = String(target.x); return () => {}; };
  }
  export function App() @{
    const menu = state({ x: 0 });
    <div attach={draggable(menu)}>drag me</div>
  }
  ```
- Probe layer: SG + FC + BM (existing fixture rerun)
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b5-probe.test.ts`
  - Observed (core plumbing, positive): behavior record
    `{"hostNodeId":"h0","source":"draggable(menu)","functionSource":"draggable","inputSources":["menu"]}`;
    payload behavior carries BOTH `"inputValues":[{"x":0}]` and
    `"inputGraphReads":[{"inputIndex":0,"source":"menu","graphNodeId":"state:menu","path":[]}]`;
    protocolView adds `"symbolId":"symbol:0"`; a behavior symbol is planned
    (`{"id":"symbol:0","kind":"behavior",...}`). `captureAnalysis.diagnostics: []` — the state()-input
    case passes the capture/serialization plane proven in S7.12 (graph references are legal captures).
  - Observed (defect 1): `MARKLESS_STATE_UNRESOLVED_WRITE`, severity `error`, message `Cannot write to
    "node.dataset.x" because it does not resolve to graph state.`, suggestion `Write to a state() binding,
    a path inside object state, or move non-graph mutation into normal local code.` — fired on the
    behavior implementation's own DOM write inside the module-level factory, and duplicated into
    payloadArena diagnostics. The suggestion recommends the exact thing that errored (B7 finding 2's
    over-rejection reaching behavior bodies).
  - Observed (defect 2): `behaviorModules: []` — despite the planned symbol and the protocolView
    `symbolId` reference, NO behavior module is emitted for the local named factory
    (canEmitBehaviorModule, symbol-modules.ts:415-421, requires `moduleImport` or inline function
    source). Silent at compile time.
  - Observed (alternate shape, imported factory `import { spin } from './spin.ts'` with `state(3)`
    input): zero diagnostics everywhere; full behavior module emitted:
    `import { spin } from "./spin.ts"; ... export function symbol_0(context) { const inputs =
    context.behaviorInputs ?? new Array(1).fill(undefined); const behavior = spin(...inputs); return
    behavior(context.element); }`.
  - Existing coverage rerun: attach-behavior.tsrx (inline-arrow attach) via
    packages/vitest-browser/browser/constructs-csr.test.ts:205 and constructs-ssr.test.ts:203 — rerun
    result: pass (real-browser attach activation on first host interaction).
- Spec check: specs/framework/04-events-symbols-behaviors.md:52-66 — the spec's own §Element behaviors
  example IS a same-file local factory (`function chart(config) {...}` above the component); 04:86-94 —
  the factory call compiles to `behavior: chart / input: config / owner: current host element`; 04:117-120
  — behavior inputs use the same capture and serialization rules as event handlers.
- Verdict: ERROR
- Rationale: The natural way to parameterize behaviors works end-to-end ONLY when the factory is
  imported. Authoring it the way the spec's own example does produces (1) a false-positive
  UNRESOLVED_WRITE pointing inside the behavior body — normal imperative DOM code the model explicitly
  sanctions there — and (2) a payload that references behavior `symbol:0` for which no module exists,
  with zero compile-time diagnostics (rubric rule 4; runtime can only fail closed on an unknown symbol).
  The input-planning plane itself (inputValues + inputGraphReads) is proven correct.
- Required diagnostic (capability gate until local-factory emission ships):
  - Code: MARKLESS_BEHAVIOR_SYMBOL_EMIT_UNSUPPORTED (new; kin of S3.04's imported-handler emit gate)
  - Severity: error — Phase: payload (symbol-module emission)
  - Title: This behavior factory cannot be emitted as a lazy symbol yet
  - Message: `attach={draggable(menu)}` plans a lazy behavior symbol, but `draggable` is a local function
    that the symbol module cannot import — the behavior would never install in the browser.
  - Why: Behavior symbols load as separate modules after resume; they can reference the factory only
    through a module import or an inline function copied into the symbol.
  - Suggestion(s): Export the factory and import it (move `draggable` to `./draggable.ts` and
    `import { draggable } from './draggable.ts'`), or inline it: `attach={(node) => { ... }}`.
  - docsUrl: https://markless.dev/errors/MARKLESS_BEHAVIOR_SYMBOL_EMIT_UNSUPPORTED
- Impl-note: defect 1 is B7 finding 2's plain-local-write over-rejection (state-lowering walk has no
  behavior-body/module-helper context) — same backlog item, now proven to indict the spec's own
  authoring shape; defect 2 belongs to symbol-modules (either emit local factories by exporting them from
  the authored module, or gate loudly). Whether an ILLEGAL behavior input (e.g. a class instance) gets
  S7.12's MARKLESS_CAPTURE_UNSUPPORTED_VALUE was not observed this batch — backlog probe note.
- Runtime follow-up: BM-deferred-to-B8 (the runtime consequence of the missing behavior module for a
  local named factory — expected fail-closed MARKLESS_SYMBOL_UNKNOWN on first interaction — was not run).
- B8 resolution (T015): RESOLVED — fail-closed, but as a PLAIN error, not the expected structured code
  (temporary fixture crazy-qa-b8-behavior-missing.tsrx, local factory BELOW the component, compile-verified:
  zero diagnostics, behavior symbol:2 planned+referenced, `symbolModules` contains only symbol:0/1): first
  interaction on the host raises an unhandled rejection `Error: Unknown async symbol symbol:2` (the generated
  direct loader's reject, source-module.ts:224 — no MARKLESS_SYMBOL_UNKNOWN code exists anywhere in packages/),
  the behavior never installs (`data-pulse` stays null), while the co-located click handler still runs
  (`taps` → "1"). Bonus re-confirmation: authoring the factory ABOVE the component (the spec's own shape)
  hits batch-finding-1 root selection first — `renderToString(App) requires a compiled TSRX artifact.` —
  the whole module dies before the behavior question can even be asked.

### S5.09 — one handle inside a keyed @for
- Snippet:
  ```tsrx
  let h = element<HTMLLIElement>();
  const rows = state([{ id: 1 }, { id: 2 }]);
  <ul>
    @for (const r of rows; key r.id) {
      <li el={h}>{r.id}</li>
    }
  </ul>
  ```
- Probe layer: SG + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b5-probe.test.ts`
  - Observed: NO handle diagnostic — semanticGraph/stateLowering/payloadArena/captureAnalysis all `[]`.
    The statically-single binding passes duplicate validation, and the payload plans a FLAT handle record
    `{"hostNodeId":"h1","handleId":"element:h","name":"h"}` in `payloadArena.view.elementHandles` AND
    `protocolView.elementHandles` — one locator record for what renders as N `<li>` elements (contrast:
    branch-arm handles correctly ride `armRecords`, compile-module.test.ts:1351-1387). The only diagnostic
    is the render plan's generic gate: `MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT`, severity `error`,
    phase `public-render`, title `@for is not rendered by the public render path yet`, message `The @for
    rows are not compiler-proven (reason: unsupported-row-binding), so the render module drops the list
    content.`, suggestion `Reshape the rows into a single host element with directly readable item
    bindings.` Control (same repeat WITHOUT `el={h}`): zero diagnostics in every pass — the el= binding
    IS the trigger for `unsupported-row-binding`.
- Spec check: specs/framework/04-events-symbols-behaviors.md:25-26 — one handle binds "exactly one host
  element"; the shipped MARKLESS_ELEMENT_HANDLE_DUPLICATE why ("must resolve to one current DOM locator")
  is the real reason a repeat-row handle cannot work. The suggestion text the duplicate diagnostic
  already ships — "move repeated element access into keyed state and behavior records" — is the sanctioned
  rewrite for exactly this scenario.
- Verdict: ERROR
- Rationale: Loud today, but for the wrong reason and with a phantom artifact: the author who binds one
  handle in a list is told their ROW SHAPE is unsupported ("Reshape the rows into a single host element")
  — following that suggestion would not fix the one-handle-many-elements ambiguity — while the payload
  still plans a flat locator record for a host that renders N times. The right teaching already exists
  verbatim in MARKLESS_ELEMENT_HANDLE_DUPLICATE; it should own this site at semantic-graph phase
  (rubric rule 7: right tier, message/ownership fix).
- Required diagnostic:
  - Code: MARKLESS_ELEMENT_HANDLE_DUPLICATE (reuse — repeat variant)
  - Severity: error — Phase: semantic-graph
  - Title: element() handle is bound more than once
  - Message: `el={h}` sits inside `@for (const r of rows; ...)`, so every row would bind element handle
    `h` to another live `<li>`. A handle must resolve to one current DOM locator.
  - Why: A resumed element handle must resolve to one current DOM locator; binding one handle to every
    repeated row would make lazy event code ambiguous.
  - Suggestion(s): Create the handle per row inside keyed state, or move repeated element access into
    keyed state and behavior records (`attach` receives each row's element directly).
  - docsUrl: https://markless.dev/errors/MARKLESS_ELEMENT_HANDLE_DUPLICATE
- Impl-note: collect-elements/collect-repeat — an el= binding whose host sits inside a repeat body is
  statically detectable during the walk (repeat context is already tracked for rows); the flat
  payload/protocolView handle record for a repeated host is the artifact half to remove. The render
  plan's `unsupported-row-binding` gate (plan.ts:951) stays as defense in depth.
- Runtime follow-up: none (the plan-level rejection means nothing reaches a browser today; the correct
  semantic-graph diagnostic is a compile-time matter).

### S5.10 — handle escape into setTimeout + conditional existence (the autofocus idiom)
- Snippet:
  ```tsrx
  let open = state(false);
  let h = element<HTMLInputElement>();
  setTimeout(() => h?.focus(), 0);          // (a) body escape
  <section>
    @if (open) { <input el={h} /> }         // (c) conditional existence
    <button onClick={() => { open = true; h?.focus(); }}>Open</button>  // (b) handler focus
  </section>
  ```
- Probe layer: SG + FC + BM (existing fixture rerun)
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b5-probe.test.ts`
  - Observed (a, body setTimeout): zero diagnostics in every pass, and the statement is silently DELETED
    — neither emitted render module contains `setTimeout` (S1.01's body-statement drop class; S3.11's
    escape family).
  - Observed (b, handler): the emitted handler symbol is `export function symbol_0(context) {
    context.graph.write({ graphNodeId: "state:open", path: [], value: true }); }` — the `open = true`
    write survives, `h?.focus()` is silently deleted. Discriminator probe S5.10b: authored PLAIN
    `h.focus()` emits `context.getElementHandle("h")?.focus();` before the write — so handle method calls
    ARE supported in handler emit, and the deletion is specific to the authored OPTIONAL CHAIN
    (batch finding 1). The spec's own SearchBox example uses `input?.focus()` (04:20) and is therefore
    inert today.
  - Observed (c, conditional existence — correct): the arm-scoped handle rides
    `protocolView.branches[0].armRecords[0].elementHandles =
    [{"hostNodeId":"h1","handleId":"element:h","name":"h","hostPath":[0]}]` with the flat
    `protocolView.elementHandles: []`, and `h` captured by the handler produces zero capture diagnostics
    (element handles are legal captures, S7.12 plane).
  - Existing coverage rerun: element-handle.tsrx (plain `box.focus()` in a resumed handler focuses the
    real input, `document.activeElement` asserted) via packages/vitest-browser/browser/
    constructs-csr.test.ts:217 and constructs-ssr.test.ts:219 — rerun result: pass.
- Spec check: specs/framework/04-events-symbols-behaviors.md:14-22 (SearchBox `input?.focus()` is the
  spec's own idiom), 04:26-29 ("During initial render... reading the handle produces `undefined`"; the
  resumer resolves the locator "when a lazy event or visibility handler runs in the browser"), 04:122-141
  (`onVisible` is the sanctioned element-scoped browser trigger). AGENTS.md model constraint: component
  bodies execute during initial render, never during browser resume — so a body-scheduled timer can never
  perform browser DOM work.
- Verdict: ERROR
- Rationale: Both authored halves die silently today (rubric rule 4). The body half (a) has no legitimate
  reading: the body runs only during initial render, where `h` is `undefined` by spec, and never runs in
  the browser — the autofocus attempt is structurally impossible, and the framework's confident answer is
  an element-scoped trigger (`onVisible`). The handler half (b) is the opposite: fully sanctioned by the
  spec's own example, broken purely by the optional-chain emit hole — the S3.08 writes-plus family
  narrowed to a precise discriminator this batch's runs prove (plain call emitted, `?.` call deleted).
- Required diagnostic (body half; the handler half is an emit fix, not a diagnostic):
  - Code: MARKLESS_ELEMENT_HANDLE_RENDER_READ (reuse from S5.07 — body-escape message variant)
  - Severity: error — Phase: semantic-graph
  - Title: element() handles cannot be read during render
  - Message: `setTimeout(() => h?.focus(), 0)` schedules from the component body, which runs only during
    initial render — `h` is undefined there and the browser never re-runs the body, so this focus can
    never happen.
  - Why: Handles resolve to DOM elements only inside browser-triggered code; body code runs once during
    initial render and is never replayed after resume.
  - Suggestion(s): Use an element-scoped browser trigger — before: `setTimeout(() => h?.focus(), 0)` in
    the body — after: `<input el={h} onVisible={(node) => node.focus()} />` (or focus from the event that
    reveals the input).
  - docsUrl: https://markless.dev/errors/MARKLESS_ELEMENT_HANDLE_RENDER_READ
- Impl-note: the `?.`-deletion is owned by the event-handler emit (symbol-modules event-handler
  statement coverage — S3.08's structural backlog item; the emitter already produces
  `context.getElementHandle(...)?.` itself, so supporting authored optional chains is emit-normalization,
  not new semantics). The body-escape detector shares S5.07's handle-read-site kind check plus S3.11's
  scheduling-call escape shape. Arm-record handle planning (c) needs no work.
- B8 resolution (T015): RESOLVED — POSITIVE (temporary fixture crazy-qa-b8-arm-handle.tsrx, SSR+resume,
  plain `box.focus()` per the S5.10b discriminator): while the arm is out, clicking Focus is a silent no-op
  on the handle (`getElementHandle` → undefined; `document.activeElement` stays BODY) while the sibling
  write still lands (`status` → "focused"); after clicking Open flips the arm in, a subsequent Focus click
  RESOLVES the arm-scoped handle and focuses the newly revealed input (`document.activeElement === input[data-late]`,
  `focusedLateInput: true`, zero rejections). Arm-record handle planning works at runtime; the authored
  `?.`-deletion emit hole remains the only blocker for the spec's own idiom.
- Runtime follow-up: BM-deferred-to-B8 (whether a resumed click that flips the @if arm can then resolve
  the arm-scoped handle and focus the newly revealed input — the plain-call fixture proves only an
  always-present host).

### Batch 5 summary

| Scenario | Verdict | Probe kind | Backlog? |
| --- | --- | --- | --- |
| S5.01 | ALREADY-CORRECT | re-verify | no (spec's component-forwarding escape unimplemented — deferred-decision note only) |
| S5.02 | ALREADY-CORRECT | re-verify | no |
| S5.03 | ERROR | both | yes (extend STATE_ELEMENT_HANDLE_UNSERIALIZABLE to the write path via valueSource kind check) |
| S5.04 | WARN | new-probe | yes (MARKLESS_ELEMENT_HANDLE_UNBOUND; inert-emit half owned by the S3.08/finding-1 item) |
| S5.05 | ERROR | new-probe | yes (MARKLESS_ELEMENT_HANDLE_PROP_UNSUPPORTED gate or spec's prop-handle tracking) |
| S5.06 | ERROR | new-probe | yes (MARKLESS_ELEMENT_MODULE_SCOPE mirror + cascade suppression; S7.01 family) |
| S5.07 | ERROR | new-probe | yes (MARKLESS_ELEMENT_HANDLE_RENDER_READ + undeclared-local render emit bug class from S3.12/S4.05) |
| S5.08 | ERROR | both | yes (plain-write over-rejection inside behavior bodies — B7 finding 2, now indicting the spec's own example; MARKLESS_BEHAVIOR_SYMBOL_EMIT_UNSUPPORTED gate or local-factory emission; illegal-behavior-input capture probe) |
| S5.09 | ERROR | new-probe | yes (ELEMENT_HANDLE_DUPLICATE repeat variant at semantic-graph; remove flat handle record for repeated hosts) |
| S5.10 | ERROR | both | yes (optional-chain handle-call emit hole — spec's own SearchBox idiom is inert; RENDER_READ body-escape variant) |

Verdict counts: ALLOW 0, ALREADY-CORRECT 2, WARN 1, ERROR 7.

T900 note (B5): batch finding 1 (authored `?.` on handles deleted by handler emit — S5.04b/S5.10, breaks
the spec's own SearchBox example and is likely a one-line emit-coverage fix inside S3.08's item) and batch
finding 2 (el= validator resolves only same-component local names — S5.05/S5.06, two gaslighting
"unknown value" messages from one lookup) are the highest-leverage pair. The handle-into-state write gap
(S5.03b) and the behavior local-factory gap (S5.08) are one guard extension and one emit gate
respectively. Element handles' correct plumbing (arm records, payload input records, imported factories,
plain-call emit, real-browser focus) is otherwise the best-proven corner of this audit.

## Batch 8 — Runtime/serialization/resume

Run context (T015, 2026-07-04): the FINAL batch — real-runtime observation only. Commands:
`pnpm exec vp test --project browser packages/vitest-browser/browser/crazy-qa-b8-probe.test.ts` (temporary
probe, 34 tests in real headless chromium against 22 temporary crazy-qa-b8-*.tsrx fixtures, all deleted
after the runs; facts relayed verbatim via console as `B8FACT` lines across five full runs plus one
reduced async-only configuration of the same file for S2.10/S2.12 minimal-context facts);
`pnpm exec vp test packages/compiler/test/crazy-qa-b8-probe.test.ts` (compile-side setup facts, 14 tests,
facts dumped to a scratchpad JSON outside the repo);
`pnpm exec vp test packages/serializer/test/crazy-qa-b8-probe.test.ts` (verdict-decisive serializer-tier
facts, 5 tests). Re-verify (one command, 4 files, 76 tests, all passed):
`pnpm exec vp test packages/web/test/payload-scripts.test.ts packages/web/test/resume.test.ts packages/serializer/test/serializer.test.ts packages/compiler/test/semantic-expression-collector.test.ts`.
Browser baseline (constructs-csr + constructs-ssr) reran green at batch start and at receipt time
(32 passed + 2 known-red `test.fails` projection tests). TSRX MCP and grep MCP were unavailable this
session; spec checks cite the local split specs (fallback per AGENTS.md). Every BM-deferred-to-B8 flag
from T014's inventory carries an in-place "B8 resolution (T015)" line on its original entry; nothing was
duplicated here.

Batch-level structural findings (cited per entry below):

1. **Serializer drops every falsy object field except `undefined`.** `serializeGraphValue({f:false,t:true,n:0,s:'',z:null,u:undefined})`
   returns `fields:[["t",true],["u",{"$type":"undefined"}]]` — `false`, `0`, `''`, and `null` fields
   silently vanish from serialized state, so resumed objects are missing exactly the fields most likely to
   gate UI (`open: false`, `count: 0`, `error: null`). Proven end to end: `state({open:false,...})` served
   `fields:[["label","menu"]]` and a resumed read of `menu.open` rendered `""`.
2. **The event-only resume path is a parallel, weaker runtime.** It never sets
   `__asyncResumeRuntimeStarted` (bundler source-module.ts:177 sets it only for needsFullResume), so every
   event re-enters the inline resumer, whose graph-guarded sync policies evaluate against the STATIC served
   payload forever; its decode validates only `version` (event-only-resume.ts:186), so tampered payloads
   produce NaN UI instead of MARKLESS_PAYLOAD_INVALID; its locator mismatch is a plain
   `Error: Mismatched resume locator h0.` instead of the structured RuntimeResumeError; and its graph has
   no `call` operation, so Date/collection method writes throw `TypeError: context.graph.call is not a function`
   (the full runtime graph has `call`, packages/runtime/src/graph.ts:620).
3. **Non-literal state initializers never reach the payload.** Every non-literal initializer observed —
   `state(obj.x)`, `state(a)`, `state(new Date(...))`, `state(state(5))`, `new WebSocket(...)` inside an
   object — plans `{"$type":"undefined"}` and renders `""` after SSR+resume, with zero diagnostics
   (S1.03's planned-undefined class, now proven to cover the dominant idioms at runtime).
4. **Async-settle is context-fragile in the browser harness.** The same async-computed fixture settles in
   a small probe file and never settles inside the 34-test probe file — even with every sibling test
   skipped via `-t`, and sensitive to the test block's position with byte-identical file content. A bounded
   bisect ruled out imports, the SSR transform, direct @markless/web imports, and the failing cross-module
   fixture; the cause is not isolated. CSR dispatch of the sync-policy fixture was similarly
   nondeterministic (3 of 5 runs never dispatched). Escalated as an instability finding.

### S8.01 — state() called from plain runtime .ts
- Snippet:
  ```tsrx
  // plain .ts test file, not .tsrx
  import { state } from '@markless/core';
  state(5);
  ```
- Probe layer: BM
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test --project browser packages/vitest-browser/browser/crazy-qa-b8-probe.test.ts`
  - Observed: throws `FrameworkApiRuntimeError`, code `MARKLESS_FRAMEWORK_API_RUNTIME_CALL`, message
    `markless state() must be compiled from a .tsrx file before it can run.`, why `state() is an markless
    framework API that must be rewritten by the .tsrx compiler before runtime execution.`, suggestion
    `Import this API from markless inside a .tsrx file processed by the compiler. Do not call it from plain
    runtime JavaScript.`, docsUrl `https://markless.dev/errors/MARKLESS_FRAMEWORK_API_RUNTIME_CALL` —
    verbatim from a real chromium run.
- Spec check: specs/framework/03-state-graph.md §Async derivation — "runtime stubs fail loudly if called
  directly without compilation"; AGENTS.md no-sigil model (state() IS the semantic boundary, so the
  runtime boundary must be loud).
- Verdict: ALREADY-CORRECT
- Rationale: The spec-mandated fail-loud stub ships with the full consequence → why → fix → link shape and
  teaches the model confidently. Grammar nit only ("an markless"). Note the S1.04 interplay: inside .tsrx,
  dropped body statements mean this stub is unreachable even for un-rewritten inner calls — the loudness
  exists only for genuinely-plain-JS callers, which is exactly this scenario.
- Required diagnostic: n/a (ships today; message-quality nit: "an markless" → "a markless").
- Impl-note: packages/core/src/framework-api.ts:68.
- Runtime follow-up: none.

### S8.02 — live WebSocket in state
- Snippet:
  ```tsrx
  let session = state({ socket: new WebSocket('wss://example.test/live'), label: 'live' });
  <output data-label>{session.label}</output>
  ```
- Probe layer: SER + FC
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b8-probe.test.ts` and
    `pnpm exec vp test packages/serializer/test/crazy-qa-b8-probe.test.ts`
  - Observed (compile): zero diagnostics in every pass; the binding's `initialValue` is `{"label":"live"}`
    (socket dropped statically); the planned payload cell carries
    `fields:[["socket",{"$type":"undefined"}],["label","live"]]`; `new WebSocket` appears in NO emitted
    module — the socket is never constructed anywhere in the compiled app.
  - Observed (serializer tier, live instance): `serializeGraphValue({session:{socket: new WebSocket('ws://127.0.0.1:9')}})`
    returns `ok: true` with the socket record `{"id":2,"type":"object","fields":[]}` — a live WebSocket
    silently serializes as an EMPTY OBJECT, with NO `MARKLESS_SERIALIZE_UNSUPPORTED_VALUE` (the diagnostic
    exists and fires for function values, serializer.test.ts:136 — rerun pass). Sibling probe: a plain app
    class instance (`new Chart()` with a method) also serializes `ok: true` as `{"fields":[["size",3]]}` —
    prototype and methods silently stripped.
- Spec check: specs/framework/03-state-graph.md:363 names this exact case as unsupported-in-state;
  specs/framework/05-resumability-payload.md value tiers require unsupported runtime resources to be
  diagnosed, and the app-value-class tier requires class restore, not silent plain-object flattening.
- Verdict: ERROR
- Rationale: The spec's own named example produces silent triple corruption: the authored socket never
  even constructs (body/initializer drop), the payload plans `undefined`, and — decisive for the SER tier
  this scenario owns — a live host object reaching the serializer becomes `{}` with `ok: true`. The
  unsupported-value detector catches functions but not host/runtime class instances, so the exact case the
  spec names bypasses the diagnostic that exists for it. No legitimate reading of `{}`-ification exists.
- Required diagnostic:
  - Code: MARKLESS_SERIALIZE_UNSUPPORTED_VALUE (reuse — extend the detector, not the vocabulary)
  - Severity: error — Phase: serialization
  - Title: Cannot serialize graph state value
  - Message: Cannot serialize the value at `session.socket` because a WebSocket is a live browser
    connection, not durable graph state. Resuming would restore an empty object where the socket was.
  - Why: Serialization is for durable graph state; host and runtime resources cannot be reconstructed
    from a payload during resume.
  - Suggestion(s): Keep live resources in attach={...} behaviors and store serializable connection data
    (URL, status flags) in state instead.
  - docsUrl: https://markless.dev/errors/MARKLESS_SERIALIZE_UNSUPPORTED_VALUE
- Impl-note: packages/serializer/src/value.ts — the object branch must distinguish plain objects
  (`Object.prototype`/null prototype) from class/host instances; class instances need either the specced
  app-value-class restore tier or this diagnostic, never silent flattening. The compile-side
  initializer-never-runs half is batch finding 3 / S1.01's body-drop backlog.
- Runtime follow-up: none (the serializer fact is the runtime fact; nothing else executes).

### S8.03 — identity aliasing across resume
- Snippet:
  ```tsrx
  const u = { id: 1 };
  let t = state({ a: u, b: u }); // t.a === t.b must hold after resume (spec 03:344)
  ```
- Probe layer: SER + BM
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test --project browser packages/vitest-browser/browser/crazy-qa-b8-probe.test.ts`
  - Observed: a hand-built payload with `fields:[["a",{"$ref":1}],["b",{"$ref":1}]]` resumed through the
    real `resumeFromPayloadScripts` in chromium yields `graph.read('state:t')` with
    `{"aliasPreserved":true,"cyclePreserved":true,"id":1}` — `t.a === t.b` holds after a real resume.
  - Existing test: packages/serializer/test/serializer.test.ts:4 (author/assignee aliasing through
    serialize → deserialize) — rerun result: pass.
- Spec check: specs/framework/03-state-graph.md:344 — object identity inside a cell is part of the state
  contract ("t.a === t.b after resume").
- Verdict: ALREADY-CORRECT
- Rationale: The `$ref` record scheme preserves aliasing through the full serialize → payload script →
  resume-graph path, proven at both the serializer unit tier and a real browser resume. Caveat shared with
  S8.04: this holds only for values that REACH the payload — a compile-time initializer with aliasing still
  plans `$type: undefined` (batch finding 3), so today the contract is exercised mainly by runtime-written
  values and hand-built payloads.
- Required diagnostic: n/a.
- Impl-note: none for the serializer; delivery of authored initial values is batch finding 3's backlog.
- Runtime follow-up: none.

### S8.04 — cycles in state
- Snippet:
  ```tsrx
  const user = { id: 1 };
  user.manager = user;
  let t = state({ user }); // spec 03:352: supported
  ```
- Probe layer: SER + BM
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test --project browser packages/vitest-browser/browser/crazy-qa-b8-probe.test.ts`
  - Observed: the same hand-built-payload resume as S8.03 carried a self-referential record
    (`["manager",{"$ref":1}]` inside record 1): after real browser resume `t.a.manager === t.a` is `true`
    (`cyclePreserved: true`).
  - Existing test: packages/serializer/test/serializer.test.ts:4 (`user.manager = user` cycle plus Date/
    RegExp/URL/BigInt/Set/Map identity) — rerun result: pass.
- Spec check: specs/framework/03-state-graph.md:352 — cycles supported.
- Verdict: ALREADY-CORRECT
- Rationale: Cyclic identity round-trips through serialize → resume in a real browser. Two recorded
  caveats (not strikes): (1) batch finding 3 — no compile-time path can put a cyclic initial value INTO a
  payload today (initializers plan `$type: undefined`), so cycles are reachable only via runtime writes and
  server-attached values; (2) static code fact — the inline resumer's miniature payload decoder
  (render-to-string.ts:222-256, used only for graph-guarded sync policies) has NO cycle memo and would
  recurse infinitely on a cyclic cell; unreachable today for the same finding-3 reason, but it becomes a
  live landmine the moment authored cyclic state ships. Both belong to the same backlog family.
- Required diagnostic: n/a.
- Impl-note: inline-resumer `j()` needs a seen-map before finding 3 lands (packages/web/src/render-to-string.ts:222).
- Runtime follow-up: none.

### S8.05 — Object.freeze(menu) then a graph write
- Snippet:
  ```tsrx
  const menu = state({ open: false });
  Object.freeze(menu);
  <button data-toggle onClick={() => menu.open = true}>t</button>
  @if (menu.open) { <p class="on">on</p> }
  ```
- Probe layer: SL + FC + BM
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b8-probe.test.ts` (compile) and
    `pnpm exec vp test --project browser packages/vitest-browser/browser/crazy-qa-b8-probe.test.ts`
    (temporary fixture crazy-qa-b8-freeze.tsrx, SSR+resume)
  - Observed (compile): zero diagnostics; `Object.freeze` appears in NO emitted module
    (`freezeInModule/Csr/Ssr` all false); the write lowers normally
    (`{"source":"menu.open","graphNodeId":"state:menu","path":["open"],"operation":"assign","valueSource":"true"}`).
  - Observed (browser): after resume, clicking toggle flips the branch in (`<p class="on">on</p>` appears,
    zero errors) — the freeze is silently discarded and the write succeeds.
- Spec check: specs/framework/03-state-graph.md §State lvalue meta-contract — "read-only ... ⇒ diagnostic";
  plain JavaScript semantics: a strict-mode write to a frozen object throws, sloppy-mode silently no-ops —
  under EITHER reading the author declared immutability and the compiled app mutates anyway.
- Verdict: WARN
- Rationale: The defensive-freeze habit is silently inverted: the author's immutability declaration is
  deleted from every emitted module (S1.01 body-statement drop class) and the graph write proceeds. Both
  plain-JS readings are violated without a sound. WARN rather than ERROR because freezing is sometimes a
  dev-only guard the author intends to be inert in production — but that intent must be opt-in, not the
  silent default. The compiler statically sees `Object.freeze(<graph binding>)`.
- Required diagnostic:
  - Code: MARKLESS_STATE_FREEZE_IGNORED (new)
  - Severity: warning — Phase: semantic-graph
  - Title: Object.freeze on graph state has no effect
  - Message: `Object.freeze(menu)` freezes graph state `menu`, but the compiler owns writes to `menu` and
    they do not go through the frozen object — `menu.open = true` still updates the page.
  - Why: Graph state lives in serialized cells that the runtime rebuilds on resume; freezing the render-time
    object cannot protect the cell.
  - Suggestion(s): Remove the freeze, or model immutability explicitly (declare `const menu` and avoid
    write sites; a future read-only state option is the durable answer).
  - docsUrl: https://markless.dev/errors/MARKLESS_STATE_FREEZE_IGNORED
  - Escape hatch (WARN only): `// markless-allow MARKLESS_STATE_FREEZE_IGNORED: dev-only guard, writes are
    intentional` on the freeze line silences exactly this site.
- Impl-note: collect-expressions/collect-state — a call whose callee is `Object.freeze` with a graph-binding
  argument is statically visible.
- Runtime follow-up: none (browser-proven this batch).

### S8.06 — Proxy-wrapped state write
- Snippet:
  ```tsrx
  const menu = state({ open: false });
  const p = new Proxy(menu, {});
  <button data-toggle onClick={() => p.open = true}>t</button>
  ```
- Probe layer: SL
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b8-probe.test.ts`
  - Observed: compile FAILS loudly — `MARKLESS_STATE_UNRESOLVED_WRITE`, severity `error`, title `Cannot
    resolve graph write target`, message `Cannot write to "p.open" because it does not resolve to graph
    state.`, why `Only state() bindings and supported graph paths can be mutated across a resume boundary.`,
    suggestion `Write to a state() binding, a path inside object state, or move non-graph mutation into
    normal local code.`, docsUrl `https://markless.dev/errors/MARKLESS_STATE_UNRESOLVED_WRITE` (duplicated
    into payloadArena diagnostics, as everywhere in this family).
- Spec check: specs/framework/03-state-graph.md §State lvalue meta-contract — unresolved/ambiguous write
  target ⇒ diagnostic. A Proxy wrapper is a new identity outside the graph, same class as clones (S1.17).
- Verdict: ALREADY-CORRECT
- Rationale: The devtools/validation-wrapper habit cannot silently disconnect: the write through the proxy
  alias is a compile error with the full shape, quoting `p.open`. Message-quality note (polish only): for a
  statically-visible `new Proxy(<graph binding>, ...)` initializer the message could say the quiet part —
  graph state cannot be proxy-wrapped, the compiler already tracks reads/writes — mirroring S1.17's note.
- Required diagnostic: n/a (ships today).
- Impl-note: state-lowering write resolution; same alias-classification site as clones.
- Runtime follow-up: none (compilation fails; nothing runs).

### S8.07 — structuredClone(menu) then read/write the clone
- Snippet:
  ```tsrx
  const menu = state({ open: false });
  const snap = structuredClone(menu);
  <p data-snap>{snap.open}</p>            // read-only
  // write variant: onClick={() => snap.open = true}
  ```
- Probe layer: SL + FC + BM
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b8-probe.test.ts` (compile) and
    `pnpm exec vp test --project browser packages/vitest-browser/browser/crazy-qa-b8-probe.test.ts`
    (temporary fixture crazy-qa-b8-snapshot-reads.tsrx)
  - Observed (write variant, compile): fails loudly with `MARKLESS_STATE_UNRESOLVED_WRITE` — message
    `Cannot write to "snap.open" because it does not resolve to graph state.` (full S1.17 shape).
  - Observed (read-only variant, compile): zero diagnostics; `templateReads` records `snap.open`,
    `slReads: []`, and the emitted SSR module interpolates `marklessSsrText(snap.open)` while `snap` is
    NEVER DECLARED (`structuredClone` appears nowhere in the module; only `menu` is declared — as `{}`,
    the false field already dropped).
  - Observed (browser): CSR render throws `ReferenceError: obj is not defined` and the SSR command fails
    identically (the fixture's first undeclared clone local; `copy`/`snap` are the same class) — the
    read-only clone CRASHES the whole page instead of rendering a snapshot.
- Spec check: specs/framework/03-state-graph.md §State lvalue meta-contract (clone writes) and §Objects
  and collections (clones are new identities outside the graph). specs/framework/10-render-architecture.md
  — emitted modules must be executable; interpolating undeclared locals violates it.
- Verdict: ERROR
- Rationale: The modern clone API splits into a correct half and a crash half: writes to the clone fail
  loudly exactly like S1.17 (ALREADY-CORRECT alone), but the legitimate read-only clone — which S1.17's
  verdict blessed as "compiles clean as a one-time snapshot" — actually emits a guaranteed ReferenceError
  with zero compile diagnostics (fourth confirmed instance of the S3.12/S4.05/S1.07 undeclared-local emit
  class, now browser-proven to kill CSR AND SSR). Silent-crash is rubric rule 4's top tier.
- Required diagnostic:
  - Code: MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT (reuse — until body-local declarations are emitted,
    a template read of a dropped body local must be refused loudly, not interpolated)
  - Severity: error — Phase: public-render
  - Title: This template reads a local the render module cannot provide
  - Message: `{snap.open}` reads `snap`, which is created by `structuredClone(menu)` in the component
    body. The render module does not run body statements, so the page would crash with "snap is not
    defined".
  - Why: Component bodies execute during initial render only in compiled form; a template read must come
    from graph state, props, or emitted declarations.
  - Suggestion(s): Read the state directly (`{menu.open}` — the graph already tracks paths, no clone
    needed), or derive with computed() when a transformed snapshot is genuinely wanted.
  - docsUrl: https://markless.dev/errors/MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT
- Impl-note: same backlog item as S4.05's undeclared-local emit class — public-render module emit must
  either emit body-local declarations it can prove or diagnose the read; the write-path guard needs no work.
- Runtime follow-up: none (crash observed in both render paths this batch).

### S8.08 — post-resume setTimeout write from a handler
- Snippet:
  ```tsrx
  let count = state(0);
  <button data-later onClick={() => { setTimeout(() => { count++; }, 50); }}>later</button>
  <output data-count>{count}</output>
  ```
- Probe layer: SL + FC + BM
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b8-probe.test.ts` (compile) and
    `pnpm exec vp test --project browser packages/vitest-browser/browser/crazy-qa-b8-probe.test.ts`
    (temporary fixture crazy-qa-b8-settimeout.tsrx, SSR+resume)
  - Observed (compile): zero diagnostics; the nested write is collected as a PLAIN handler write (update
    `++` on `state:count`, no scheduling context) and the emitted symbol runs it unconditionally and
    immediately: `export function symbol_0(context) { context.graph.update({ graphNodeId: "state:count",
    ... return Number(value) + 1; }); }` — the `setTimeout` wrapper and the 50ms delay are DELETED.
  - Observed (browser): after resume, clicking the button updated the binding to `"1"` in 13ms — measured
    faster than the authored 50ms delay (`{"countAfterClick":"1","elapsedMs":13,"authoredDelayMs":50}`) —
    the deferred write executes immediately.
- Spec check: specs/framework/04-events-symbols-behaviors.md §Event handler arrays — handler bodies are the
  author's JavaScript; specs/framework/03-state-graph.md flush/journal semantics say WHEN a write commits,
  not that the compiler may reschedule it. No reading of the spec allows moving a write across a timer.
- Verdict: ERROR
- Rationale: The escaped-closure write (prep §10's escape family) is silently REORDERED IN TIME: the author
  scheduled a write for later; the shipped app runs it now, unconditionally, and never schedules anything.
  This is the sharpest instance of the B3 writes-only emit finding — not just dropping side statements but
  rewriting the temporal semantics of the write itself, browser-proven. Debounce/undo/toast patterns built
  on timers would all silently misbehave.
- Required diagnostic:
  - Code: MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED (reuse — S3.08's gate owns every handler body the
    writes-only emitter cannot represent; a write inside a nested scheduled function is exactly that)
  - Severity: error — Phase: capture-analysis (symbol-emit audit)
  - Title: This event handler cannot run in the browser yet
  - Message: The onClick handler schedules `count++` with setTimeout, but the generated browser module can
    only express the write itself — `count` would update immediately on click instead of 50ms later.
  - Why: The browser runs generated symbol modules after resume; emitting only the write silently changes
    when the author's code runs.
  - Suggestion(s): Keep handler bodies to direct graph writes until full handler emission ships; move
    time-based behavior into an attach={...} behavior that owns its own timers and writes state when they
    fire.
  - docsUrl: https://markless.dev/errors/MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED
- Impl-note: symbol-modules `emitEventHandlerModule` — writes collected from nested function scopes must
  not be hoisted into the synchronous emit (detection: write record whose enclosing function differs from
  the handler); same structural backlog as S3.08.
- Runtime follow-up: none (timing measured in a real browser this batch).

### S8.09 — tampered payload script
- Snippet:
  ```tsrx
  // served counter page; before first interaction the markless/state script is tampered:
  // (a) version: 999   (b) cells: "tampered"
  ```
- Probe layer: SER + BM
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test --project browser packages/vitest-browser/browser/crazy-qa-b8-probe.test.ts`
    (existing counter.tsrx fixture, script textContent tampered after injection, before first click)
  - Observed (version tamper, event-only path): first click raises an unhandled rejection
    `Error: Unsupported markless/state payload version.` and the counter stays `"0"` — fail-closed, but a
    PLAIN Error, not the structured `MARKLESS_PROTOCOL_VERSION_MISMATCH` shape the full decoder ships.
  - Observed (structure tamper `cells: "tampered"`, event-only path): NO error at all — the click
    dispatches, `undefined + 1` flows through the update, and the page renders `"NaN"` in the counter
    button (`{"buttonText":"NaN","rejections":[]}`) — a tampered payload silently produces corrupt UI.
  - Existing tests (full decode path): packages/web/test/payload-scripts.test.ts:819/:847/:1012/:1119
    (malformed state/view/sync-policy payloads rejected), :1140-:1158 (structured `MARKLESS_PAYLOAD_INVALID`
    with docsUrl), :1171-:1192 (structured `MARKLESS_PROTOCOL_VERSION_MISMATCH` with expected/actual
    versions) — rerun result: all pass.
- Spec check: specs/framework/05-resumability-payload.md + specs/framework/07-diagnostics.md — payload
  decode must validate and fail closed with the structured payload diagnostics (the full-path tests pin
  exactly that contract).
- Verdict: ERROR
- Rationale: The validated decoder exists and is well-tested, but the event-only resume path — the DEFAULT
  path for every page without branches/repeats/handles/boundaries, i.e. most simple pages — bypasses it
  entirely: `readPayloadJson` checks only `version` (event-only-resume.ts:183-188). Structure tampering
  therefore produces silent NaN UI instead of `MARKLESS_PAYLOAD_INVALID`, and even the version check loses
  the structured shape. Fail-closed integrity must not depend on which runtime tier the compiler picked
  (batch finding 2).
- Required diagnostic:
  - Code: MARKLESS_PAYLOAD_INVALID (reuse — route the event-only path through the existing validator)
  - Severity: error — Phase: runtime (payload decode)
  - Title: (shipped title from the serializer validator)
  - Message: (shipped structured message — the fix is WIRING, not wording)
  - Why: A payload that fails validation cannot describe the page; dispatching events against it produces
    corrupt state and DOM.
  - Suggestion(s): event-only decode should call `decodePayloadScripts` (already exported by
    @markless/serializer) instead of a bare JSON.parse + version check.
  - docsUrl: https://markless.dev/errors/MARKLESS_PAYLOAD_INVALID
- Impl-note: packages/web/src/event-only-resume.ts:183-188 (`readPayloadJson`); batch finding 2's
  parallel-runtime parity item.
- Runtime follow-up: none (both tampers executed in a real browser this batch).

### S8.10 — DOM mutated between SSR and resume
- Snippet:
  ```tsrx
  // served page; before first interaction a third-party script inserts
  // <div>extension-injected</div> as the async container's first child
  ```
- Probe layer: BM
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test --project browser packages/vitest-browser/browser/crazy-qa-b8-probe.test.ts`
  - Observed (full-resume fixture, crazy-qa-b8-freeze.tsrx): first click raises
    `RuntimeResumeError: Resume locator h0 expected <section> at DOM order index 1 but found <div>.`, code
    `MARKLESS_RESUME_LOCATOR_MISMATCH` — structured, fail-closed, nothing updates.
  - Observed (event-only fixture, counter.tsrx): first click raises a PLAIN
    `Error: Mismatched resume locator h0.` — fail-closed (button stays `"0"`) but without the structured
    code/why/suggestions the full runtime ships.
  - Existing tests: packages/web/test/resume.test.ts:973 (structured mismatch error for DOM-order
    locators) and :1015 (missing async boundary anchors) — rerun result: pass.
- Spec check: specs/framework/06-resume-runtime.md locator contract + specs/framework/07-diagnostics.md —
  resume must fail closed on locator mismatch with the structured runtime diagnostic (the shipped
  full-path shape matches: consequence, why, suggestion, docsUrl — pinned at resume.test.ts:973).
- Verdict: ERROR (impl-note: message-quality/parity fix only — behavior is correctly fail-closed on both paths)
- Rationale: Both runtime tiers refuse to act on a page whose DOM no longer matches the payload — the
  correct no-hydration answer to extension-mutated DOM. The gap is diagnostic parity (rubric rule 7): the
  event-only tier's `Mismatched resume locator h0.` quotes an internal host id with no consequence, why,
  fix, or link, failing the shape bar that the full tier already meets. Same batch-finding-2 wiring class
  as S8.09.
- Required diagnostic:
  - Code: MARKLESS_RESUME_LOCATOR_MISMATCH (reuse — the full runtime's structured error, emitted from the
    event-only materializer too)
  - Severity: error — Phase: runtime (resume locator materialization)
  - Title/Message/Why/Suggestions: the shipped full-runtime shape (resume.ts:1749) verbatim.
  - docsUrl: https://markless.dev/errors/MARKLESS_RESUME_LOCATOR_MISMATCH
- Impl-note: event-only-resume.ts locator materialization throws ad-hoc Errors; share the structured error
  constructors with resume.ts.
- Runtime follow-up: none (both tiers executed in a real browser this batch).

### S8.11 — built-in (Date/Map) mutation across resume
- Snippet:
  ```tsrx
  let stamp = state(new Date('2026-01-15T00:00:00.000Z'));
  <button data-set onClick={() => { stamp.setMonth(2); }}>set</button>
  ```
- Probe layer: SL + SER + BM
- Probe kind: both
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test packages/compiler/test/crazy-qa-b8-probe.test.ts` (compile) and
    `pnpm exec vp test --project browser packages/vitest-browser/browser/crazy-qa-b8-probe.test.ts`
    (temporary fixture crazy-qa-b8-date.tsrx, SSR+resume)
  - Observed (compile): zero diagnostics; `stamp.setMonth(2)` lowers as a method-call write
    (`{"operation":"call","method":"setMonth","argumentSources":["2"]}`); BUT the payload cell for the Date
    state is `{"$type":"undefined"}` (batch finding 3 — the Date value never reaches the payload).
  - Observed (browser): after resume, copying `stamp` into a text binding renders `""` (stamp is
    undefined); clicking set raises an unhandled rejection `TypeError: context.graph.call is not a function`
    — the event-only graph implements only read/write/update (event-only-resume.ts:206-240) while the
    call operation exists only on the full runtime graph (packages/runtime/src/graph.ts:620/:166).
  - Existing tests: packages/compiler/test/semantic-expression-collector.test.ts:383 (Date setter calls
    lower as graph writes) and packages/serializer/test/serializer.test.ts:4/:108 (Date and Map round-trip
    with identity) — rerun result: pass.
- Spec check: specs/framework/03-state-graph.md §Objects and collections — Dates/Maps/Sets are first-class
  serializable state and their mutation methods are graph writes; specs/framework/05-resumability-payload.md
  built-in tier (the serializer side honors it — the compile plan and the event-only runtime do not).
- Verdict: ERROR
- Rationale: Every tier is individually half-built and the composition is a crash: the serializer
  round-trips Dates/Maps perfectly, the lowering records the setter call correctly, but (1) the authored
  Date never reaches the payload (planned `undefined`, finding 3) and (2) the emitted call-operation write
  targets a graph API that the event-only runtime does not have, throwing TypeError on the first
  interaction of any simple page that mutates a built-in. Silent-then-crash with zero compile diagnostics.
- Required diagnostic: none new — this is two capability fixes: batch finding 3 (initializer values into
  payload plans) and batch finding 2 (event-only graph needs `call`, or call-operation pages must be gated
  to needsFullResume by the bundler's transform.ts:98 check).
- Impl-note: bundler transform.ts:98 needsFullResume must account for call-operation writes until the
  event-only graph gains `call`; payload-arena owns the undefined-initializer half.
- Runtime follow-up: none (crash observed in a real browser this batch).

### S8.12 — double resume / resume against a CSR root
- Snippet:
  ```tsrx
  // (a) resumeFromPayloadDocument called a second time on an already-resumed served page
  // (b) resumeFromPayloadDocument aimed at a CSR-rendered container (no payload scripts)
  ```
- Probe layer: BM
- Probe kind: new-probe
- Current behavior (OBSERVED):
  - Command: `pnpm exec vp test --project browser packages/vitest-browser/browser/crazy-qa-b8-probe.test.ts`
  - Observed (a): after a served counter page resumed and clicked once (`"1"`), a second manual
    `resumeFromPayloadDocument` on the same container SUCCEEDS silently (`secondResumeFailure: null`) and
    installs a second, parallel dispatch wiring: the next click incremented the real counter to `"2"` AND
    invoked the second runtime's stub `loadSymbol("symbol:0")` (`stubSymbolsLoaded:["symbol:0"]`) — two
    runtimes now dispatch every event against one DOM, with zero errors. The inline resumer's own re-entry
    guard (`__asyncResumeRuntimeStarted`) is set only by the needsFullResume module path
    (source-module.ts:177) and does not protect the public API.
  - Observed (b): fail-closed and structured — `RuntimePayloadError: Missing markless/state payload
    script.`, code `MARKLESS_PAYLOAD_INVALID` — a CSR root without payload scripts is refused loudly.
- Spec check: specs/framework/06-resume-runtime.md — one container resumes once into one runtime (the
  runtime owns the container's event wiring and graph); nothing sanctions two concurrent runtimes on one
  container. specs/framework/07-diagnostics.md fail-closed contract covers (b), which ships correctly.
- Verdict: ERROR
- Rationale: (b) is model behavior. (a) has no legitimate reading: double-wiring one container means
  double symbol loads and, once symbols perform non-idempotent writes, double mutations — today it is
  silent because the duplicate runtime happily coexists. The app-shell integration mistake this scenario
  models (calling resume from two entry points) must be detected at the container, exactly like the inline
  resumer already does for its own path.
- Required diagnostic:
  - Code: MARKLESS_RESUME_ALREADY_RESUMED (new)
  - Severity: error — Phase: runtime (resume entry)
  - Title: This container was already resumed
  - Message: resumeFromPayloadDocument was called again on a container that already has a live resume
    runtime. A second runtime would dispatch every event twice.
  - Why: Resume attaches the container's event wiring and graph once; a container has exactly one resume
    runtime for its payload.
  - Suggestion(s): Resume each served container once from one entry point; if re-resume-after-teardown is
    intended, dispose the previous runtime first (runtime disposal is the API to reach for, not a second
    resume).
  - docsUrl: https://markless.dev/errors/MARKLESS_RESUME_ALREADY_RESUMED
- Impl-note: packages/web/src/payload.ts `resumeFromPayloadDocument`/`resumeFromPayloadScripts` — mark the
  root (same mechanism as `__asyncResumeRuntimeStarted`, or a WeakSet) and fail loud on re-entry; the
  event-only path already keys containers in a WeakMap (event-only-resume.ts:117) and can share the guard.
- Runtime follow-up: none (both halves executed in a real browser this batch).

### Batch 8 summary

12 scenarios: 4 ALREADY-CORRECT (S8.01 runtime stub, S8.03 identity aliasing, S8.04 cycles, S8.06 proxy
write), 1 WARN (S8.05 freeze-ignored), 7 ERROR (S8.02 WebSocket-to-`{}` serialization, S8.07 read-only
clone crash, S8.08 time-rewritten setTimeout write, S8.09 event-only tamper bypass, S8.10 event-only
locator message parity, S8.11 built-in mutation crash, S8.12 silent double resume). All 29 deferred flags
from the T014 inventory are resolved or explicitly dispositioned in place (see each entry's "B8 resolution
(T015)" line; 6 blocked-on-backlog, 1 unobservable-without-harness-work, the rest run-backed).

Owner-escalation highlights, all run-backed this batch: (1) the serializer drops EVERY falsy object field
except undefined (`false`/`0`/`''`/`null` gone; `menu.open` unrestorable) — batch finding 1; (2) the
event-only resume tier is a parallel weaker runtime (stale sync policy forever, version-only payload
validation producing NaN UI from tampered payloads, unstructured errors, no `graph.call`) — batch finding
2, feeding S8.09/S8.10/S8.11 and the B3 sync-policy resolution; (3) non-literal state initializers never
reach the payload — `state(obj.x)`, the dominant idiom, renders empty after SSR+resume — batch finding 3,
feeding S1.02/S1.03/S1.06/S8.02/S8.11; (4) a try/catch inside an async derive silently empties the
boundary's asyncReads and the page shows @pending forever (S2.12 resolution — new silent-wrong class);
(5) live host objects and class instances serialize to `{}`/plain objects with `ok: true` (S8.02);
(6) async-settle and CSR sync-policy dispatch are nondeterministic/context-fragile in the browser harness
(batch finding 4 — instability escalation, cause not isolated after a bounded bisect).
