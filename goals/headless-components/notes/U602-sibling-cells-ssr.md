# Sibling computed cells: the served render was the last reader

Status: **completed**. The fourth reader named at the end of
`U601-sibling-cells-readers.md` is scoped, the browser witness directory is green
in both CSR and SSR, and the tree case that motivated the whole cell now has an
SSR row of its own in the compiler suite.

## What was changed

`packages/compiler/src/passes/public-render/render-body.ts`, one new helper and
two call sites.

Both `renderBodyLines` (the served body) and `renderValuePreludeLines` (the
demand-load prelude) built their own `state` and `computed` maps by folding
`semanticGraph.graphBindings` keyed on `binding.name`, module-wide and
last-writer-wins. Two sibling parts declaring the same local name therefore
collapsed to one entry, and the survivor was whichever part came last in the
module.

They now share `componentBindingMap(input, kind, componentName)`, which applies
the same filter `graphBindingMap` applies as its third argument — skip a binding
whose `componentName` is defined and differs from the rendering component — and
is handed `rootInfo.componentName`, which both functions already held. Bindings
with no `componentName` (module scope) still resolve, unchanged.

Nothing else moved. `state-lowering.ts` is in this unit's contract and needed no
edit: `scopedGraphLookup` already threads `componentName` into both
`graphBindingMap` and `semanticAliasMap`.

## The measurement

Compiling a tree-shaped fixture (a `widget`-scoped `item` cell, `TreeItem`
declaring `isShowing = computed(() => item.leaf !== true && item.open === true)`,
`TreeItemContent` declaring `isShowing = computed(() => item.open === true)`) and
reading `publicRenderModule.ssrModuleSource`:

| served render | derive emitted before | derive emitted after |
| --- | --- | --- |
| `marklessRenderSsr` (TreeItem) | `(() => item.open === true)()` | `(() => item.leaf !== true && item.open === true)()` |
| `marklessRenderSsrTreeItemContent` | `(() => item.open === true)()` | unchanged |

The wire key each render publishes under was already right after U601
(`computed:TreeItem.isShowing`, `computed:TreeItemContent.isShowing`); what was
wrong was the value computed and seeded under it. The row's `aria-expanded` slot
reads `computed:templateExpression:0`, whose emitted expression is
`(() => isShowing ? 'true' : undefined)()`, so the wrong derive fed the attribute
directly.

Concretely: an item written `<tree.item leaf open>` was served
`aria-expanded="true"` on a `role="treeitem"` that has no group. That is the same
defect U601 measured on the client side, on the server half of the render.

## The new SSR row

`packages/compiler/test/sibling-computed-cells/served-gate.test.ts`, two rows.

The first is tree's real case: with the shared item seeded `{open: true, leaf:
true}` the row part serves `undefined` for `aria-expanded`, and with `{open:
true, leaf: false}` it serves `'true'`. The second pins the other direction —
the group part still answers its own leaf-blind formula, so a leaf-and-open item
keeps `ui-open` on the group.

Rather than assert on emitted text, the rows slice the served function's value
prelude (its `const <name> = (...)()` derives and the
`marklessSsrRenderStateValues.set("computed:...` lines), run it over a seeded
state map with a stub `marklessSsrReadPublicPath`, and read back the graph node
the `aria-expanded` slot in `renderData` actually points at. The full markup pass
needs `@markless/web`, so this evaluates the lines that decide the attribute, not
the HTML around them. The attribute's graph node id is looked up from the chunk
slot, not spelled as a literal.

Checked against the defect: reverting the filter in `componentBindingMap` turns
the first row red with `expected 'true' to be undefined`. The second row passes
either way — the group part is the last declarer, so it was already winning its
own name.

## Byte equality

`packages/compiler/test/emit-byte-equality` passes inside the full compiler run
and writes no snapshot; `git status` after every lane below shows only the two
files this unit touched. No fixture in that directory carries a same-named
sibling collision, so no fixture's emitted bytes legitimately changed.

## Verification state

- `pnpm typecheck` — green.
- `pnpm exec vp test packages/compiler/test` — 214 files, 1710 passed,
  1 expected fail, 0 failed.
- `pnpm exec vp test --project browser` on `sibling-computed-cells` and
  `seeded-write` — 12 passed, 0 failed. The row U601 was blocked on,
  `SSR: same-named sibling gate cells answer their own formula`, is green, as is
  the SSR twin of the walk row.
- `pnpm exec vp test --project ui` on `tree`, `select`, `tour`, `numberbox` —
  206 passed, 1 skipped, 0 failed.
- `pnpm exec vp lint --deny-warnings` — 0 warnings, 0 errors.

Nothing in `packages/headless` was touched; tree's served render is corrected
from the compiler alone.
