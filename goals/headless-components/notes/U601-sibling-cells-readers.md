# Sibling computed cells: the two named readers are scoped, a third one is not

Status: **blocked**, one row short. The two readers this unit was cut for are
scoped and every surface they feed is correct. The whole compiler suite is green,
`tree` and `select` are back to green, and three of the four browser rows pass.
The fourth is the SSR render, and it fails inside a file outside this unit's
contract that resolves a component-local name against a MODULE-WIDE map, exactly
the shape the blocked permission names.

## What was changed

`packages/compiler/src/passes/semantic-graph/collect-markup.ts`

`expressionResidue` already took `componentName` as a parameter and used it for
the shared-instance fallback. It now also passes it to `graphBindingMap` and
`semanticAliasMap`, so a chunk slot's residue resolves the source name against
the component that authored the markup.

`packages/compiler/src/passes/payload-arena.ts`

`componentGraphScopes`, the per-component lookup cache the element-handle path
already used, gained a `sharedDefinitionId` argument. A second instance of it is
built with `null` (module-scope bindings only) and used by both `viewDomUpdates`
and `branchContentReads` through one `resolveTemplateRead` helper. The reading
component is `read.componentName` when the record carries one, falling back to
`componentByHostNodeId.get(read.hostNodeId)`, which is what both loops used
before. The shared-instance fallback is unchanged.

No change was needed in `graph-paths.ts` or `collect-state.ts`; both already had
the shape this needed.

## The measurement: tree WAS rendering a wrong value

Measured by compiling `packages/headless/components/src/tree/tree.tsrx` twice,
once with all three passes checked out at the pre-mint tip and once with this
change, and reading `protocolState.computed` plus the derive symbol each record
points at.

`TreeItem` (line 220) declares `const isShowing = computed(() => item.leaf !==
true && item.open === true)`; `TreeItemContent` (line 260) declares
`const isShowing = computed(() => item.open === true)`.

| | TreeItem's cell | TreeItemContent's cell |
| --- | --- | --- |
| Before | `computed:isShowing` -> `symbol:28` | `computed:isShowing` -> `symbol:28` |
| After | `computed:TreeItem.isShowing` -> `symbol:25` | `computed:TreeItemContent.isShowing` -> `symbol:28` |

`symbol:28` is `() => item.open === true`. `symbol:25` is
`() => item.leaf !== true && item.open === true`, and before this change nothing
in the emitted protocol referenced it: it was minted and dropped.

So yes — the second formula now answers where it did not. Concretely, an item
written `<tree.item leaf open>` used to render `aria-expanded="true"` and
`ui-open` on a `role="treeitem"` that has no group, because the row's gate was
computed by the content's leaf-blind formula. No shipped scenario writes `leaf`
and `open` on one item, which is why the suite never caught it.

`select` is the opposite case. Its two `isChosen` declarations (lines 245 and
277) are the same expression, `select.value === item.value`, so the survivor
always agreed and no wrong value was ever rendered. Select went red on the branch
only because the mint split the key while the readers still resolved by name; it
is green again with nothing else changed.

## Byte equality

`packages/compiler/test/emit-byte-equality` passes with no snapshot written and
none of its fixtures carries a collision, so the emitted bytes of unaffected
modules are unchanged. `git status` after a full suite run shows only the six
files this unit edited.

## The stale pins, retired

Nine rows across four files asserted the old unqualified ids.

`sibling-binding-scope/emitted-wire-keys.test.ts` — U587 wrote this to pin "the
emitted wire keys stay unqualified across sibling parts", deliberately deferring
the id change. It is now two rows stating the rule that replaced it: a second
fixture whose every local name is unique keeps its bare `state:readerCell` /
`computed:writerLabel` keys, and the original colliding fixture spells
`state:Reader.s`, `state:Writer.s`, `computed:Reader.label`,
`computed:Writer.label`, `element:Reader.boxEl`, `element:Writer.boxEl` and none
of the bare forms. The byte-stability row is untouched.

`sibling-binding-scope/derive-dependency-scope.test.ts` — 5 rows, literals only;
the row titled "the colliding ids themselves are left alone" is retitled "each
declaring component mints its own id for the shared local name", which is what it
now asserts. The file's header comment is restated.

`payload-node-owners.test.ts` — 1 row. The three accordion parts now spell
`computed:AccordionItem.isOpen`, `computed:AccordionTrigger.isOpen`,
`computed:AccordionContent.isOpen`; the owner partition it pins is unchanged. The
second row's spliced cell was given the real id so it still collides with a
record that exists.

`same-module-initial-values.test.ts` — 2 rows, looked up under
`state:SameNameLeft.report` / `state:SameNameRight.report` and the three
`Alternate*` keys. The second row's title dropped "positional partition": with
distinct ids the positional branch in `componentOwnedInitialValues` no longer
fires, and what the row now measures is that each part's initial value stays
with it. The name only one component spells still uses its bare key, pinned by
the untouched `state:onlyHere` line.

## The third reader, which is the block

`packages/compiler/src/passes/public-render/render-body.ts` builds two
module-wide, name-keyed, last-writer-wins maps of `state` and `computed`
bindings:

- `renderBodyLines`, lines 30-38. `computedBindings` is handed to
  `computedDeclarationLine`, which emits the SSR body's
  `const <name> = (<functionSource>)()` line. It already receives
  `rootInfo.componentName` as its own parameter.
- `renderValuePreludeLines`, lines 423-432. The same two maps; line 473 emits
  `const <name>=read(<binding.id>,[])`, so a demand-load prelude spells the wrong
  graph node id for the same reason. `rootInfo.componentName` is in hand here too.

Measured on the browser witness family
(`packages/vitest-browser/browser/sibling-computed-cells/family/stepper.tsrx`),
the emitted `ssrModuleSource` carries, inside
`marklessRenderSsrStepperBackTrigger`:

```
const isOff = (() => { ...; return (() => {
    const at = stepper.step;
    const total = stepper.count;
    return at >= total - 1;
})(); })();
```

That is the FORWARD trigger's formula in the BACK trigger's server render. The
same file writes
`marklessSsrRenderStateValues.set("computed:StepperBackTrigger.isOff", isOff)`
one line later, so the id is right and the value seeded under it is wrong. Tree
shows the identical shape: both SSR functions emit
`return (() => item.open === true)()`, so `TreeItem`'s server-rendered
`aria-expanded` is still the leaf-blind formula, before and after this change.

Failing row:
`packages/vitest-browser/browser/sibling-computed-cells/sibling-computed-cells.test.ts`
> `SSR: same-named sibling gate cells answer their own formula`, line 27,
`expect(gate(container, '[data-back]')).toBe(true)` — expected true, received
false. The CSR twin of that row passes, as do both walk rows.

## The question

Add `packages/compiler/src/passes/public-render/render-body.ts` to a contract and
this closes: both maps take `rootInfo.componentName`, which both functions
already hold, filtered the same way `graphBindingMap`'s third argument filters —
skip a binding whose `componentName` is defined and differs. It is the same
one-argument change as the two readers in this unit, in a third place.

## Verification state

- `pnpm typecheck` — green.
- `pnpm exec vp lint --deny-warnings` — 0 warnings, 0 errors.
- `pnpm exec vp test packages/compiler/test` — 213 files, 1708 passed,
  1 expected fail, 0 failed.
- `pnpm exec vp test --project ui` on `tree`, `select`, `tour`, `numberbox` —
  206 passed, 1 skipped, 0 failed. Both regressed families are green from the
  compiler change alone, with nothing in `packages/headless` touched.
- browser `sibling-computed-cells` + `seeded-write` — 11 passed, 1 failed: the
  SSR row above.
