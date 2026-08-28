# U725 — render-order rooting: why the rule needs one more decision before it can land

Board card T038, following `U715-shared-collection-no-body-writer.md`. This unit was to move
widget rooting off declaration order and onto the render tree, flipping the four pinned rows in
`packages/vitest-browser/browser/shared-collection-no-body-writer/`.

It did not land. Below is what the attempt established, why the rule as written does not decide
the `aloof-page` shape, and the two files the fix needs that this packet forbids.

Measured at the pilot tip `df1cbc18`, unchanged tree:

```
pnpm exec vitest run --project browser packages/vitest-browser/browser/shared-collection-no-body-writer
Tests  6 passed | 4 expected fail (10)
```

The four still-pinned rows are `aloof-page` and `nested-page`, CSR and SSR. The `nested-page`
failure still surfaces as the `context.graph.read is not a function or its return value is not
iterable` throw reported through `packages/web/src/fns/instance-scope.ts:347`, exactly as U715
measured it.

## The mechanism, re-derived and unchanged

U715's reading of the two owning functions holds at the pilot tip:

- `widgetRootComponents` (`packages/compiler/src/passes/public-render/shared-seed-pass.ts:386`)
  returns ONE component per widget-scoped definition — the first component that files a
  `shared-seed` symbol for it, else the first entry of `semanticGraph.sharedInstances` that
  resolves it, which is declaration order in the module.
- That one name is what `resolvePayloadNodeOwners`
  (`packages/compiler/src/passes/public-render/shared.ts:963`) hands the definition's cells to,
  through `componentOwnedStateNodes`'s `owner.cells[index] === componentName` test
  (`shared.ts:822`). One owner, one payload.
- `marklessRegisterComposedWidgets` (`packages/web/src/fns/composition.ts:286`) registers a widget
  root only for a composed child whose payload carries a cell under `definition.id + '/'`.

## One owner cannot be right for two pages of one module

This is the part worth writing down, because it closes off the small fix.

`empty-family.tsrx` declares four components that resolve `emptyBox`: `EmptyRoot`, `EmptyAdder`,
`EmptyField`, `EmptyFieldHoldingAdder`. Nothing seeds it, so the owner is `EmptyRoot`.

- `empty-page` renders `EmptyRoot > (EmptyField, EmptyAdder)`. The only right owner is `EmptyRoot`.
- `nested-page` renders `AloofRoot > EmptyFieldHoldingAdder > EmptyAdder`, and never renders
  `EmptyRoot` at all. The only right owner is `EmptyFieldHoldingAdder`.

Both pages compile against the same family module, and the cells are emitted once, into one
component's payload, when that module is compiled. So no build-time choice of a single owner
satisfies both pages. Emitting the cells into EVERY resolving component's payload — the packet's
own first option — is not one design among several; it is forced.

The runtime half of that is containable: `marklessRegisterComposedWidgets` already receives the
whole `children` array and already runs before any child state is qualified or merged
(`composition.ts:419`, ahead of `marklessQualifyChildState` at 425 and
`marklessComposedSharedDefinition` at 431), so a pass that decides which candidate roots, aliases
the rest onto it, and drops the losers' duplicate cells fits inside `composition.ts` plus
`ssr.ts`. Both call sites of `marklessRegisterComposedWidgets` are those two files.

## Where the rule stops deciding: co-outermost siblings

"The outermost rendered part that seeds/resolves the definition roots the instance" decides three
of the four pinned rows and both silent-half rows:

| page | rendered resolvers | outermost | decided? |
| --- | --- | --- | --- |
| `empty-page` | `EmptyRoot` `c0:`, `EmptyField` `c0:p1:`, `EmptyAdder` `c0:p2:` | `c0:` | yes |
| `first-resolver-page` | `FirstField` `c0:p1:`, `FirstAdder` `c0:p1:c0:` | `c0:p1:` | yes |
| `nested-page` | `EmptyFieldHoldingAdder` `c0:p1:`, `EmptyAdder` `c0:p1:c0:` | `c0:p1:` | yes |
| `aloof-page` | `EmptyField` `c0:p1:`, `EmptyAdder` `c0:p2:` | **two, neither enclosing the other** | **no** |

`aloof-page` has two co-outermost resolvers. Taking "each maximal resolver roots its own instance"
leaves that row exactly as red as it is today: the field reads `c0:p1:` and the adder writes
`c0:p2:`. Making it green requires merging co-maximal sibling resolvers onto one instance.

## Why the merge cannot be decided from the render tree alone

A merge rule keyed on the render tree cannot tell these two apart, because at compose time both are
"two sibling composed children, each carrying the definition's cells, neither enclosing the other":

- `aloof-page`: `EmptyField` and `EmptyAdder` projected into `AloofRoot`. Must merge — one widget.
- Any consumer writing two family roots side by side into one host —
  `<Shell><MenuRoot/><MenuRoot/></Shell>` — must NOT merge. Spec 03 is explicit: "a second
  `<SelectRoot>` on the page resolves a second instance", and identity comes from "normal
  component, key, and projection identity". Merging those is a family behaviour change of the
  worst kind: two menus sharing one open state.

Instance paths do not separate them (`c0:p1:`/`c0:p2:` in both shapes). Cell ownership does not
separate them, because under multi-owner emission every part carries the cells. The only thing
that separates them is which COMPONENT each child is, and that is a build-time fact composition
never receives.

So the compiler has to mark it — the packet's own word: the seed emitted "for EVERY seeding
component, **marked**". The mark has to say, per candidate, *designated family root* (the module's
one declared root, which keeps today's one-instance-per-rendered-root behaviour and never merges)
versus *fallback candidate* (a part that carries the cells only so a page that never renders the
designated root still has them, and which merges with its co-maximal siblings).

## The two files that mark lands in, and this packet forbids

Payload cell ownership is not just the compiler's internal bookkeeping — two runtime readers derive
"does this child root a widget family" from it, and both flip the moment every part carries the
cells:

- `widgetRootsOf` (`packages/web/src/prerender/children-projection.ts:24`) answers the CSR twin of
  the `marklessWidgetRoots` marker by testing whether a child's owned cell ids start with
  `definition.id + '/'`. Under multi-owner emission it answers "roots" for every part.
- `rootsWidget` (`packages/web/src/fns/shared-seed.ts:267`, and the same gate at
  `children-projection.ts:161`) feeds the seed-boundary check that stops a nested root from
  re-running an enclosing root's seeds. It reads the same ownership.

Both rows of every pinned test are CSR and SSR, so the CSR path is not optional. Neither file is in
this unit's contract, and `packages/web/src/prerender/**` is held by U722. Attempting the change
without them makes every part of every seeded family — menu, menubar, toolbar, tree, calendar,
tabs, drawer, rating-group, taglist — read as a widget root on the CSR path, which is precisely the
family behaviour change the packet forbids.

## Inventory: which definitions the change would actually touch

Only a definition with NO seeding component falls back to declaration order, so a change guarded to
those leaves every seeded family byte-identical. Read from source, not measured:

- `emptyBox`, `firstBox` (the witness fixtures) — no body write.
- `v2Dial` (`packages/vitest-browser/browser/single-component-family/v2/dial.tsrx`) — no body
  write; `V2Dial` roots by being declared first, and `two-v2-page.tsrx` renders two of them, each
  wrapping two `V2Part`s, and asserts two separate rosters. This is the fixture that proves
  co-maximal roots must stay separate.
- `nestState` (`packages/vitest-browser/browser/own-instance-handle/nest.tsrx`) — `NestRoot` reads
  `nest.marks` and writes nothing in its body, so this family also roots by declaration order.
- Every other widget definition in those suites seeds in a body (`d.tag = tag`,
  `pair.name = 'root'`, `level.name = name`), so its owner is the seeder and nothing changes.

The headless families were not audited for unseeded widget definitions; that audit is part of the
work, not a precondition for the ruling.

## The decision the packet is missing

**When a page renders two or more co-outermost components of one widget family and neither encloses
the other, which of these is the widget instance?**

1. **Marked rooting.** The compiler names one component per definition the *designated* root (the
   seeder, else the first resolver, as today) and every other resolver a *fallback* carrier of the
   cells. Designated roots never merge — two `<MenuRoot/>` side by side stay two widgets. Co-maximal
   *fallbacks* merge onto the first, which is what turns `aloof-page` green. Costs the mark in the
   payload or on the child descriptor, and the two out-of-contract readers above.

2. **Maximal rooting, no merge.** Every maximal resolver roots its own instance. Needs no mark, and
   `nested-page` plus the silent half of `first-resolver-page` go green — but `aloof-page` stays
   red in both modes, and the honest reading is that a page whose parts share no resolving ancestor
   has two widgets, not one. Two of the four pinned rows would have to be re-pinned as intended
   behaviour rather than defects.

Option 1 is the recommendation: it is the only one that makes all four pinned rows green, and its
merge is confined to families that declare no root anyone rendered. It needs a re-cut packet
carrying `packages/web/src/prerender/children-projection.ts` and `packages/web/src/fns/shared-seed.ts`
(or a hand-off with whoever holds U722), because payload cell ownership is the signal both of them
read.

Nothing was changed under `packages/compiler/` or `packages/web/` by this unit.
