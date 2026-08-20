# Emission Codegen Migration

Campaign specification for replacing string-scanner code emission in
`packages/compiler` with AST construction plus a printer.

This file exists so the emission campaign's units can be cut against a written
contract instead of against the audit transcript. It states what the audit
proved, what it did not prove, which stages are unblocked, and what each stage
must satisfy before it is allowed to finish.

Read `02-compiler-pipeline.md` for the pass and artifact contract this campaign
works inside, and `09-compiler-module-split-plan.md` for the source ownership
rules a migrated emitter must still respect. This file adds no new compiler
semantics and changes no artifact contract.

## Purpose

Symbol-module emission currently builds emitted JavaScript by scanning and
splicing authored source text. Measured at `eb215072`,
`packages/compiler/src/passes/symbol-modules.ts` is 2,789 lines, of which:

- lines 1552-2731 (1,180 lines) synthesize emitted value expressions from source
  substrings: literal, array, object, call, parenthesized, unary, conditional,
  and binary forms, each with its own quote-aware, depth-aware splitter
- lines 2109-2731 (623 lines) are the pure string-scanning band, from
  `topLevelBinaryOperators` through `sourceReferencesIdentifier`
- lines 490-900 (411 lines) locate and splice event-handler bodies by span
  arithmetic over the authored text

Three costs follow from that shape. Operator precedence, quoting, and
parenthesization are hand-maintained, so each newly supported authored
expression form costs another scanner rather than another AST node. Extracted
modules carry no source map, because there is no structure to map from.
Emission cannot reuse the semantic information the analyzer already computes; it
re-derives capture and reference facts from text.

The owner directive authorizing this campaign, and its spec-first sequencing, is
recorded in the progress ledger under goal `yuku-tsrx-analyzer-migration`
(entry dated 2026-08-20, read via the state CLI). That directive also separates
this campaign from the analyzer migration's merge condition: the analyzer work
is judged on net production line count, this campaign is not.

## Evidence Base

Every capability claim below traces to a probe that was executed and whose
output was recorded. The audit ran in a session scratchpad —
`.../f3765bf8-04d0-4a91-969a-e9545e912b7d/scratchpad/codegen-audit/` — which is
ephemeral. Probe scripts and their `OUTPUT-*.txt` transcripts should be re-run
and re-recorded by the first unit of any stage that depends on them.

Probes were run against `yuku-codegen@0.9.0`, `yuku-analyzer@0.9.0`, and
`yuku-tsrx@0.1.1` — the same analyzer and TSRX versions `packages/compiler`
already depends on. `yuku-codegen` is not yet a dependency of any package in
this repository.

Recorded probes, and what each one licenses:

- `p1d-parens.mjs` / `OUTPUT-p1d-parens.txt` — printer-derived
  parenthesization.
- `p2-comments-format.mjs` / `OUTPUT-p2-comments-format.txt` — comment
  retention, comment filters, formatting knobs, blank lines, line width,
  unknown-option handling.
- `p3-sourcemap.mjs` / `OUTPUT-p3-sourcemap.txt` — source map presence, shape,
  granularity, and positional accuracy.
- `p4-transform.mjs` / `OUTPUT-p4-transform.txt` — AST mutation, synthesis,
  stale spans, stale semantic tables, free-variable analysis.
- `p5b-acceptance.mjs` / `OUTPUT-p5b-acceptance.txt` — the acceptance case:
  cut a handler out of a component, rewrite its captures to graph calls, print
  both modules, re-analyze the result.
- `p5d-tsrx-real.mjs` / `OUTPUT-p5d-tsrx.txt` — which printer accepts TSRX
  nodes, and what the TSRX printer does and does not emit.
- `p5f-analyzer-tsrx.mjs` / `OUTPUT-p5f-analyzer-tsrx.txt` — language
  inference for `.tsrx` paths and the TSRX semantic view.

Probe scripts `p0-surface.mjs`, `p1-roundtrip.mjs`, `p5a-jsx-tsrx.mjs`,
`p5c-comment-move.mjs`, and `p5e-tsrx-extract.mjs` exist in the audit directory
with no recorded output. They are not evidence. Where this specification depends
on a question those scripts ask, it says so explicitly and makes the answer a
gate the owning unit must prove for itself.

TSRX documentation check, per the specification workflow: no TSRX MCP server was
available in this session, so the documented fallback
`https://tsrx.dev/specification` was used. It enumerates the TSRX-exclusive node
types (`JSXCodeBlock`, `JSXStyleElement`, `JSXIfExpression`,
`JSXForExpression`, `JSXSwitchExpression`, `JSXTryExpression`,
`TSModuleDeclaration`, `TSModuleBlock`) and states no canonical printer or
source-map contract for TSRX syntax; it describes recovery of authored shape by
formatters, not generation. Probe `p5d` observed the first six of those node
types in a parsed TSRX module.

## What The Audit Establishes

**Precedence-safe printing.** With `preserveParens: false` the parsed tree
carries no `ParenthesizedExpression` nodes, and the printer still derives
correct parentheses: 30 of 30 cases pass, covering mixed arithmetic, nested
ternaries, arrow-returned object literals, sequence expressions, exponent left
operands, `await`/`yield`/`typeof` operands, `new` versus call, optional-chain
calls, nullish mixed with logical operators, expression-statement
disambiguation, class `extends` on a call, and spread of a conditional. This is
the capability that retires the hand-written precedence table at lines
2015-2107.

**Comments.** Comments survive only when both ends opt in: `attachComments`
at parse and `comments` at print. With `attachComments: false`, 12 parsed
comments produce 0 markers in output; with it true, all 12 survive. Filter modes
`all`/`some`/`line`/`block`/`none` behave as their names suggest.

**Source maps.** A map is emitted only when `sourceMap` is passed *with* a
`source`; `sourceMap: {}` yields a null map. The emitted map is version 3, names
its file and sources, and carries `sourcesContent`. Granularity is
expression-level: 29 segments over 10 generated lines, every segment carrying a
source position, and 27 of 29 segments' generated text prefix-matching the
source text they point at. The two disagreements are re-formatting artifacts —
a one-line method body was expanded across lines — where the mapping still lands
inside the enclosing source construct. Synthesized nodes with no spans print
without error and do not corrupt the map.

**Mutation and synthesis.** Replacing a node, removing a statement, wrapping an
expression in a synthesized call, and building a whole function declaration from
bare object literals all print correctly, including when the mutated nodes carry
stale or absent `start`/`end`. Minimal nodes are tolerated: omitting `raw`,
`async`, `generator`, and optional fields still prints, with quote style then
governed by the `quotes` option.

**Free-variable analysis.** `capturesOf` returns a function's free variables
with reference lists and a written flag — the fact the current implementation
re-derives with span arithmetic. On the acceptance case it returned four
captures (`count`, `step`, `label`, `formatLabel`), correctly separated into
graph-backed locals and module imports, yielding four reference nodes to rewrite
(three reads, one write).

**The acceptance case.** `p5b` performs the real transform: locate the handler,
ask for its captures, rewrite reads to `context.graph.read(id, path)` and the
write to `context.graph.write(id, path, value)` by reference-node identity,
assemble an extracted module with only the imports the handler still needs, drop
the handler from the component, and print both. The
locate-rewrite-assemble-print core is roughly 130 lines of AST work. The
emitted handler module is syntactically valid JavaScript, re-analysis finds no
stray references to the outer bindings, `console` is the only remaining free
name, and the print carries 18 source-map segments.

## What The Audit Does Not Establish

These are open questions, not defects. Each is assigned to the unit that needs
it, and no unit may assume an answer.

- **Determinism.** No recorded probe prints the same tree twice and compares
  bytes. The nearest recorded result is the TSRX printer reaching a fixpoint on
  reparse-and-reprint. Byte-stability of `yuku-codegen` over the node shapes
  this compiler builds is therefore unproven and must be proven per migrated
  site (see invariant 7).
- **Comment migration across a move.** `p2` proves comments survive a print of
  the program they were parsed from. It does not prove a comment follows a node
  moved into a newly synthesized `Program`. `p5c` asks exactly this and has no
  recorded output. The acceptance case's own output shows the handler's interior
  comment absent — because `p5b` parsed without `attachComments`, not because
  migration failed. The unit that migrates event-handler emission must settle
  this with its own test.
- **TSRX-source extraction end to end.** `p5e` asks whether the analyzer yields
  usable semantics on a real `.tsrx` module and whether the extracted handler
  then prints. It has no recorded output. Stage 1's premise — that extracted
  symbol sources are TSRX-free plain TypeScript by the time they are emitted —
  rests on the compiler's existing extraction boundary and must be asserted
  mechanically (invariant 3), not assumed from this probe.
- **Printing is normalizing, not preserving.** Round-tripping a module through
  parse and print is not identical to its source. Output bytes will change
  wherever emission changes hands.

Known upstream limits, recorded:

- Authored blank lines are not preserved: input blank-line runs of 3, 1, 1, 1
  print as none.
- There is no print-width or wrapping knob; the probe's longest emitted line was
  127 characters.
- Object-literal comments print with the following comma leading the next
  property (`a: 1 // trailing` then `, b: 2 }`), which is valid but not the
  layout a formatter would produce.
- Unknown printer options are accepted silently with no error, so a misspelled
  option is a silent no-op.
- `yuku-codegen` throws `unsupported ESTree node type: JSXCodeBlock` on a TSRX
  tree, and its `strip: true` path throws the same way.
- `tsrx.generate` prints TSRX and reaches a reparse fixpoint, but emits no
  source map, and its output collapses template structure onto shared lines.
- The analyzer infers `lang: "js"` from a `.tsrx` path, which mis-parses both
  TypeScript annotations and TSRX syntax unless `lang` is passed explicitly.
- `tsrx.analyze` exposes scope, symbol, reference, import, export, module-flag,
  and node-scope tables, but no `capturesOf` equivalent.
- Analyzer semantic tables go stale after mutation (symbol count unchanged after
  adding a binding), and a symbol-driven rename does not rewrite that symbol's
  references — the probe resolved 0 references through the symbol and reassigned
  only the declaration identifier.

## Staged Scope

### Stage 1 — Symbol-module emission

Unblocked. Scope is the emitters in
`packages/compiler/src/passes/symbol-modules.ts` and the string machinery they
call. The stage's premise is that by the time these emitters run, the sources
they emit are TSRX-free plain TypeScript — the exact shape the acceptance case
proved printable, with source maps, through `yuku-codegen`.

Stage 1 must deliver:

- `yuku-codegen` added as a `packages/compiler` dependency, pinned to an exact
  version as its sibling `yuku-*` dependencies are
- one module owning printer options and the graph-call AST builders, so option
  choices are stated once and asserted rather than spread across emitters
- migration of each emitter to build nodes and print, one emitter per unit
- source maps for extracted symbol modules
- deletion of the string-scanner band once, in the stage's final unit

Stage 1 must not: change artifact contracts, change which symbols are extracted,
introduce a second emission path, or add a runtime flag selecting between old
and new emission.

### Stage 2 — Public render and SSR module emission

Gated. `publicRenderModule.renderDataModuleSource` and `ssrModuleSource` are
built from trees that still contain TSRX nodes, which the generic printer
refuses. Stage 2 may not start until one of the following exists upstream:

- `yuku-codegen` prints TSRX node types, or
- a documented TSRX-to-TypeScript lowering the compiler can run before printing

and, independently, until `tsrx.generate` emits source maps — otherwise stage 2
would regress the source-map invariant relative to stage 1 for any site that
prints through the TSRX printer.

Until the gate clears, stage 2 has no units. The gate's status lives in the
upstream register below, not in a unit's judgment.

### Stage 3 — Frameless adoption

Gated on cosmetic upstream gaps. The frameless emitters produce source a human
reads, so blank-line preservation, a print-width or wrapping control, and
object-literal comment placement are adoption preconditions rather than nice to
have. Each is recorded above with its probe evidence. Stage 3 starts when those
three are addressed upstream, and inherits every stage 1 invariant unchanged.

## Invariants

These hold for every unit in every stage.

1. **Byte equality where bytes are pinned; behavior equality elsewhere.**
   `packages/compiler/test/emit-byte-equality.test.ts` compiles 13 fixtures plus
   1 imported dependency module and snapshots, per fixture,
   `renderDataModuleSource`, `ssrModuleSource`, the concatenated symbol-module
   sources, `symbolResolverModule`, and stable JSON for the plan, protocol
   state, protocol view, and payload scripts — 3,414 recorded lines. A migrated
   site must leave that snapshot untouched, or its change must be an explicitly
   owner-approved re-baseline.
2. **Re-baselining is a named step, never a side effect.** No unit may
   regenerate a golden snapshot to make its own change pass. A unit whose output
   differs stops and reports the diff; the re-baseline is dispatched separately
   with the owner's approval on that specific diff. A re-baseline unit changes
   goldens and nothing else.
3. **Source maps from day one.** Every extracted symbol module printed in
   stage 1 carries a source map. The printer emits a null map when `sourceMap`
   is passed without a `source`, so the emission module must pass the source
   explicitly and treat a null map as a hard failure, not an absent optional.
4. **No TSRX nodes reach the printer in stage 1, and this is asserted.** Before
   printing, the tree is scanned for TSRX node types and emission fails with a
   compiler diagnostic if any are found. An assertion is required because the
   failure mode without it is a thrown upstream error
   (`unsupported ESTree node type: JSXCodeBlock`) surfacing as a crash rather
   than a diagnostic.
5. **The scanner band deletes last.** Lines 2109-2731 —
   `topLevelBinaryOperators` through `sourceReferencesIdentifier` — are removed
   in stage 1's final unit, after parity is proven for every emission site that
   reaches them. No earlier unit deletes a scanner it merely stopped calling;
   dead-but-present code is the cheap state to be in while parity is still
   accumulating.
6. **Rewrites key on reference-node identity.** Capture rewriting uses the
   reference nodes `capturesOf` returns, as the acceptance case does. Symbol
   objects are not a rewrite handle: the probe showed a symbol-driven rename
   reaching 0 references. Semantic tables are not re-read after mutation; either
   collect the facts before mutating or re-analyze.
7. **Determinism is proven per site, not assumed.** Each migrated emitter's test
   prints its tree twice and asserts identical bytes, and asserts that reparsing
   and reprinting the emitted source is a fixpoint. This invariant exists
   because no recorded probe establishes printer determinism.
8. **Printer options have one owner and are asserted.** Unknown options are
   silently ignored upstream, so option names cannot be validated by observing
   behavior. The options module states each option and a test asserts the
   observable consequence of each one the compiler depends on.
9. **One emission path.** No feature flag, environment variable, or option
   selects between scanner emission and AST emission. A site is migrated or it
   is not.

## Acceptance Criteria

### Per migrated emission site (stage 1)

- the site builds nodes and prints; it calls no function in the scanner band
- `emit-byte-equality` snapshot unchanged, or the diff is carried to an
  owner-approved re-baseline unit and named in the receipt
- the site's focused test asserts the emitted artifact, not only a compiled
  bundle, per the pipeline spec's testing rule
- print-twice byte equality and reparse-reprint fixpoint both asserted
- emitted module re-analyzes with no unresolved reference to a binding that was
  supposed to be rewritten, as the acceptance case checks
- a source map is present, non-null, and names the authored file
- `pnpm exec tsc --noEmit -p tsconfig.json` clean; package tests green

### Stage 1 complete

- every emitter in `symbol-modules.ts` prints from nodes
- the scanner band is deleted and the file's line count is measured and recorded
  against the 2,789-line baseline
- no TSRX-node assertion has been relaxed or removed to make a site pass
- extracted symbol modules carry source maps across the full fixture set
- any golden re-baseline in the stage is traceable to a specific owner approval

### Stage 2 gate

- an upstream release prints TSRX node types, or a TSRX-to-TypeScript lowering
  exists and is documented, and
- `tsrx.generate` emits source maps, and
- a re-run of the `p5d` and `p5e` probes against that release is recorded as
  evidence before any stage 2 unit is cut

### Stage 3 gate

- authored blank lines are preserved by the printer
- a print-width or wrapping control exists
- object-literal comment placement produces conventional layout
- each verified by a re-run recorded probe, not by release notes alone

## Unit Decomposition Sketch

A sketch for cutting units, not a contract. The cockpit re-cuts as parity
evidence arrives.

1. **Foundation.** Add the `yuku-codegen` dependency; create the emission module
   owning printer options, the graph read/write node builders, the TSRX-node
   assertion, and the determinism helper the per-site tests use. No emitter
   migrates in this unit.
2. **Low-risk emitters, one per unit,** in ascending order of how much authored
   text they splice: `emitStateInitializerModule`,
   `emitSyncComputedDeriveModule`, `emitAsyncComputedRunnerModule`,
   `emitBehaviorModule`, `emitDomBindingModule`.
3. **Arm emitters,** which assemble from render data rather than authored text:
   `emitBranchUpdateModule` and `emitAsyncBoundaryUpdateModule` together.
4. **`emitSymbolModule`,** the general path, including the value-source cluster
   at lines 1552-2107 that it reaches.
5. **`emitEventHandlerModule`,** the largest and riskiest: the span-splicing
   band at lines 490-900, capture-slot substitution, and write lowering. This is
   the unit that must also settle comment migration across a move.
6. **Source-map wiring,** if not already carried by the foundation unit —
   threading the authored source and file name to every print site and asserting
   non-null maps across the fixture set.
7. **Owner-approved re-baseline,** if and only if a site produced a justified
   diff. Goldens only.
8. **Scanner-band deletion,** stage 1's final unit: remove lines 2109-2731,
   confirm no remaining caller, record the measured line delta.

## Non-Goals

- Do not introduce a second emission API, a compatibility shim, or a flag that
  selects between emission strategies.
- Do not add Babel, SWC, Prettier, or another printer alongside `yuku-codegen`.
- Do not change artifact contracts, pass IDs, `consumes`/`produces`, or which
  symbols are extracted while migrating emission.
- Do not re-walk source in an emitter to recover information an upstream pass
  should carry; extend the artifact instead, per the pipeline spec.
- Do not couple this campaign to the analyzer migration's net-line merge
  condition; the ledger records them as separate tracks.
- Do not treat line-count reduction as the goal. It is a consequence;
  correctness of emitted bytes and the arrival of source maps are the goal.

## Deferred

- Byte-equality policy for public-render and SSR output, which stage 2 will have
  to settle once TSRX printing exists and normalization changes those bytes.
- Whether the compiler should own a TSRX-to-TypeScript lowering itself if
  upstream TSRX printing does not arrive.
- Whether emitted source maps are surfaced through the bundler to end users, or
  remain a compiler-internal artifact for tests and diagnostics.
- Whether frameless and markless share one emission module or two once stage 3
  starts.

## Upstream Asks Register

Asks that block a stage, with the evidence that establishes each:

- **TSRX node printing in `yuku-codegen`** (or a documented TSRX-to-TypeScript
  lowering). Blocks stage 2. Evidence: `OUTPUT-p5d-tsrx.txt` — the generic
  printer throws on `JSXCodeBlock`, on both the normal and `strip: true` paths.
- **Source maps from `tsrx.generate`.** Blocks stage 2. Evidence:
  `OUTPUT-p5d-tsrx.txt` — map present: false, 0 segments over TSRX source.
- **Blank-line preservation.** Blocks stage 3. Evidence:
  `OUTPUT-p2-comments-format.txt`, probe 2e.
- **Print-width or wrapping control.** Blocks stage 3. Evidence:
  `OUTPUT-p2-comments-format.txt`, probe 2f.
- **Object-literal comment placement.** Blocks stage 3. Evidence:
  `OUTPUT-p2-comments-format.txt`, probe 2b.

Asks named by the campaign directive rather than derived from a probe, carried
here so they are tracked in one place:

- **Recovering parse**, required for the volar ladder. Not a gate for any stage
  in this specification; the ledger prices the work it unlocks separately.
- **Duplicate-binding detection on the Zig side.** Same status.

Additional gaps the audit observed, low priority and not gating:

- The analyzer infers `lang: "js"` for a `.tsrx` path
  (`OUTPUT-p5f-analyzer-tsrx.txt`), so callers must pass `lang` explicitly.
- `tsrx.analyze` has no `capturesOf` equivalent
  (`OUTPUT-p5f-analyzer-tsrx.txt`), which stage 2 would need if it analyzes
  TSRX trees directly rather than post-extraction TypeScript.
- Unknown printer options are silently ignored
  (`OUTPUT-p2-comments-format.txt`, probe 2g); an error or warning would make
  invariant 8 cheaper to hold.
