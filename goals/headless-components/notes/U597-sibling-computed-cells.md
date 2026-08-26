# Sibling computed cells: the wire key is fixed, the readers of it are not

Status: **blocked**, with the minting half implemented and measured. Two
same-named component-local cells now mint distinct graph node ids, byte-equality
is untouched, and the browser witness went from four red rows to two. The
remaining two rows, and seven new red rows in shipped families, all trace to two
lookups that resolve a template read's source name against a MODULE-WIDE binding
map. Both files are outside this unit's contract.

## What was built

`packages/compiler/src/passes/semantic-graph/collect-state.ts`

`graphBindingId` gained a third case. A component-local `state`/`computed`/
`element` binding is minted as `kind:Component.name` instead of `kind:name` when,
and only when, a second component in the same module declares the same local name
under the same kind. Everything else is untouched: a helper call keeps its
four-segment id, a shared factory keeps its definition-qualified id, and a name
only one component declares keeps the bare key it has always emitted.

The collision set is computed once per module, memoized in a `WeakMap` keyed by
the walk state, by re-parsing the module and collecting every
`const x = state()/computed()/element()` declarator inside a component function.
The scan deliberately does not descend into function-valued nodes: a cell
declared inside a `shared()` factory, a computed body or a handler mints under a
different scope, so counting its name would qualify a name this rule cannot
reach.

The qualifier sits AFTER the `kind:` prefix, so
`protocolInstanceQualifies` in `packages/serializer/src/protocol-constants.ts`
still classifies the id by its family prefix and `PROTOCOL_INSTANCE_PATH` still
matches only the leading `c0:`/`p1:`/`r:key:` segments. No protocol reader in
`packages/web/src` or `packages/serializer` needed a change; both suites are
green untouched.

## The measurement that matters: byte equality holds

`packages/compiler/test/emit-byte-equality` passes against its existing snapshot
with nothing written. No fixture in it has the collision, so the "only when a
second component declares the name" rule did exactly the job it was cut for:
unaffected modules emit byte-identical output.

## Why this cannot land alone

Minting a distinct key is half the cell. A template read still resolves its
source name (`isOff`) to a binding through a map keyed by `binding.name` with
last-writer-wins, and that map is built module-wide. Both sibling parts therefore
resolve to the LATER part's binding.

Under the old collision this was invisible in the id — both spellings were
`computed:isOff`, so the wrong binding handed back the right string — while the
runtime cell carried the wrong formula. That is the original defect. With
distinct ids the mis-resolution becomes explicit: the back trigger's slot now
names a cell the back trigger never declared.

Measured on a two-trigger family module, `StepperBackTrigger` and
`StepperForwardTrigger` each declaring `const isOff`:

| Surface | Back trigger's read resolves to |
| --- | --- |
| `semanticGraph.graphBindings` | `computed:StepperBackTrigger.isOff` — correct |
| `stateLowering.reads` | `computed:StepperBackTrigger.isOff` — correct |
| `renderData.initialValues` | both cells, own symbol each — correct |
| `renderData` chunk slot residue | `computed:StepperForwardTrigger.isOff` — **wrong** |
| `payloadArena.view.domUpdates` | `computed:StepperForwardTrigger.isOff` — **wrong** |

`state-lowering.ts` already passes the declaring component to `graphBindingMap`,
which is why it answers correctly. The two wrong rows are the two callers that
do not:

**`packages/compiler/src/passes/semantic-graph/collect-markup.ts`, around line
805** — `expressionResidue` calls
`graphBindingMap(context.graph, null)` and `semanticAliasMap(context.graph, null)`
while `componentName` is already one of its own parameters, used two lines later
for the shared-instance fallback. Passing it as the third argument is the change.

**`packages/compiler/src/passes/payload-arena.ts`, line 37** — `componentBindings`
and `componentAliases` are built once, module-wide, and used by both
`viewDomUpdates` and `branchContentReads` (lines 159-220). Both loops already
have the reading component: `read.componentName` on the record, and
`componentByHostNodeId.get(read.hostNodeId)` for the shared fallback. The file
already has `componentGraphScopes`, a per-component scope cache, built for the
element-handle path; the same shape keyed with `null` for the shared scope is the
change.

Neither file is in this unit's contract, and the packet's blocked permission
names exactly this case, so nothing was improvised.

## The regression this leaves on the branch, unfixed

Two shipped families have the collision, so the mint change breaks them until the
readers are scoped. This is the strongest evidence that the two halves are one
change:

- `packages/headless/components/src/tree/tree.tsrx` declares `const isShowing`
  twice (lines 220 and 260) over different formulas. Six `tree.browser.ts` rows
  go red, CSR and SSR. They were green before only because the survivor's formula
  (`item.open === true`) happened to agree with the other's
  (`item.leaf !== true && item.open === true`) on every case the suite exercises.
- `packages/headless/components/src/select/select.tsrx` declares `const isChosen`
  twice. One `select.browser.ts` row goes red.

Both were confirmed against the untouched tip: with `collect-state.ts` stashed,
`select` and `tree` are 105 passed / 1 skipped, 0 failed.

## Stash receipt

Witness written first, and red first.

- `packages/vitest-browser/browser/sibling-computed-cells/` — a two-trigger family
  whose parts both declare `const isOff` over different formulas, rendering
  `disabled` from it. On the untouched tip: **4 of 4 rows red**, CSR and SSR. With
  the mint change: **2 of 4 green** — the walk rows pass, the initial-render rows
  still fail on the unscoped read.
- `packages/compiler/test/sibling-computed-cells/distinct-cells.test.ts` — 8 rows.
  On the untouched tip 4 red (the collision rows) and 4 green (the no-collision
  controls, which must stay green). With the change, 8 green.
- `packages/compiler/test/sibling-computed-cells/read-resolution.test.ts` — 4 rows
  pinning the reader half. 2 green (a component-scoped lookup answers correctly;
  the module-wide one answers the last declarer), 2 red — the chunk slot residue
  and the host DOM update. Those two are the target for the reader change.
- `packages/compiler/test/sibling-computed-cells/initial-values.test.ts` — 2 rows,
  green: each sibling's initial value survives under its own key.

## Stale pins outside the contract

Nine rows in three files assert the old unqualified ids as the expected value.
None is a behaviour failure; each is a literal that this unit's goal changes.
They need the owner's call together with the readers above, because retiring them
retires an explicit ruling.

- `packages/compiler/test/sibling-binding-scope/emitted-wire-keys.test.ts`, 1 row.
  U587 wrote this deliberately: "the emitted wire keys stay unqualified across
  sibling parts", with a doc comment saying qualifying the id is a protocol change
  and not what that fix did. This unit is that protocol change, so the row is now
  a pin against its own goal.
- `packages/compiler/test/sibling-binding-scope/derive-dependency-scope.test.ts`,
  5 rows, including one titled "the colliding ids themselves are left alone".
- `packages/compiler/test/payload-node-owners.test.ts`, 1 row. It expects three
  same-module components to spell `computed:isOpen` three times; they now spell
  `computed:AccordionItem.isOpen`, `computed:AccordionTrigger.isOpen` and
  `computed:AccordionContent.isOpen`. The row's own title — "each own their own
  record" — is what the change delivers; only the literals are stale.
- `packages/compiler/test/same-module-initial-values.test.ts`, 2 rows. They look
  the value up by `state:report`, which no longer exists; under
  `state:SameNameLeft.report` and `state:SameNameRight.report` the values are
  correct and separated, which the new `initial-values.test.ts` pins.

## A workaround this retires, deliberately left in place

`componentOwnedInitialValues` in
`packages/compiler/src/passes/public-render/shared.ts` partitions a module's
initial values POSITIONALLY when one id is spelled twice, precisely because
same-named siblings collided. With distinct ids that branch stops firing, so both
definitions carry both values instead of one each.

That was left alone on purpose. Carrying an initial value a definition never
declared is already the standing behaviour for any id only one component spells,
and seeding a cell nothing on that definition reads is idempotent. Making the
partition owner-keyed would change emitted bytes for every module with a
component-local cell, which is exactly the wholesale snapshot rewrite this unit
was cut to avoid. It is a cleanup for a later unit, not a correctness gap.

## Full verification state

- `pnpm typecheck` — green.
- `pnpm exec vp lint --deny-warnings` — 0 warnings, 0 errors.
- `packages/web/test` + `packages/serializer/test` — 86 files, 602 tests, green.
- `packages/compiler/test` — 1694 passed, 1 expected fail, 11 failed: the 9 stale
  pins above and the 2 reader rows of this unit's own witness.
- `emit-byte-equality` — green, no snapshot written.
- browser `sibling-computed-cells` + `seeded-write` + `nested-widget-outer-write`
  — 28 passed, 2 failed (the two reader rows).
- ui `tour` and `numberbox` — green. `select` and `tree` — 7 failed, caused by
  this change and fixed by the reader scoping.

## The question

Add `packages/compiler/src/passes/semantic-graph/collect-markup.ts` and
`packages/compiler/src/passes/payload-arena.ts` to the contract, together with
the four stale-pin test files, and this finishes in one pass: both are a
declaring-component argument threaded into a lookup that already has the
component in hand. Splitting them from the mint is not possible — the mint alone
regresses `tree` and `select`, and the readers alone cannot tell the two cells
apart.
