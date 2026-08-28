# U728 — marked rooting: the design is settled, the CSR carrier for the mark is not

Follows `U725-render-order-rooting.md` (option 1, MARKED ROOTING, ruled) and
`U715-shared-collection-no-body-writer.md`. Measured at the pilot tip `41d80f18`, unchanged tree:

```
pnpm exec vitest run --project browser packages/vitest-browser/browser/shared-collection-no-body-writer
Tests  6 passed | 4 expected fail (10)
```

Nothing under `packages/compiler/` or `packages/web/` was changed by this unit. What follows is the
whole design read out of the source, and the one thing it needs that the packet's file contract does
not carry.

## The design, end to end

### Compiler

`widgetRootComponents` (`packages/compiler/src/passes/public-render/shared-seed-pass.ts:386`) stays
exactly as it is and becomes the DESIGNATED root: the seeding component, else the first resolver in
declaration order. Beside it, a `widgetFallbackComponents` answers, per widget-scoped definition this
module declares, every OTHER component that resolves it.

`componentOwnedStateNodes` (`shared.ts:813`) is the only cell-emission site that changes: its
`cellIndexes`/`seedCellIndexes` accept a component that is a fallback carrier of the definition, so
the cells land in every resolver's payload. `resolvePayloadNodeOwners` (`shared.ts:915`) keeps
answering ONE owner per node — it is also what `widgetRootDefinitionIds` and the SSR
`marklessWidgetRoots` marker are derived from, and both must keep meaning "designated".

Mark the FALLBACK, not the root. A definition with a seeder has no fallbacks, so every headless
family — every one of them seeds in a body — emits byte-identically, and only the unseeded fixtures
(`emptyBox`, `firstBox`, `v2Dial`, `nestState`) pay for the field. Marking the root instead would put
a definition-id string in every family's rooting-component record.

The mark is a new field on the component definition record emitted by
`component-definitions.ts:250` — the same record that already carries `stateCellIndexes` and the
build-time-only `rootsWidget`. It needs no serializer change: the record is emitted by the compiler
and serialised whole by `jsonSourceWithNonFiniteNumbers` in `packages/bundler/src/transform.ts:757`,
which strips only `rootsWidget` and the three residue-reader fields. Its TYPE is
`PrerenderDataDefinition` in `packages/web/src/prerender/evaluator.ts:75`; the reader in
`children-projection.ts` can name the field in a local cast rather than widen that type, the way the
bundler already casts the same record.

### CSR readers

`widgetRootsOf` (`packages/web/src/prerender/children-projection.ts:24`) tests cell ownership today.
It becomes "owns the definition's cells AND is not marked a fallback carrier of it". `rootsWidget`
(`shared-seed.ts:278`, and the identical gate at `children-projection.ts:161`) is that same call and
follows for free. Both are in contract.

### Composition — and the mechanism that makes the merge nearly free

`marklessRegisterComposedWidgets` (`packages/web/src/fns/composition.ts:286`) runs at
`composition.ts:419`, AHEAD of `marklessQualifyChildState` (425) and
`marklessComposedSharedDefinition` (431). That ordering is what makes the merge cheap: it does not
have to rewrite anything.

A fallback that LOSES the merge is registered as an ALIAS — the exact shape
`marklessRegisterWidgetProjections` already uses: `rootPaths.set(loserPath + definitionId,
winnerPath)`. Everything downstream then falls out of code that already exists:

- `marklessComposedGraphNodeId` (`instance-scope.ts:829`) qualifies a bare widget id through
  `marklessWidgetRootPathThroughRows`, so the loser's cells qualify onto the WINNER's path, not its
  own. `widgetRootPathFor` asks the registry both with and without the trailing `/<kind>:<name>`, so
  a cell id resolves through the definition-id entry.
- `marklessComposedSharedDefinition` composes the loser's definition id to the same string as the
  winner's, and `marklessMergedSharedDefinitions` (`composition.ts:358`) already collapses records
  that share an id and unions their projection sites.
- The only new work is dropping the duplicate cells the collapse produces, in
  `marklessComposedState`'s `cells:` concatenation.

The merge rule itself, per base definition id, over the candidates one compose level sees:

- Any candidate marked DESIGNATED registers its own root at its own instance path, always. This is
  what keeps `<MenuRoot/><MenuRoot/>` two menus and keeps `two-v2-page` two rosters, and what keeps a
  legitimately nested root (`nestLevelState`, menu in menu) its own instance.
- If no designated candidate is present, the MAXIMAL fallbacks root: one whose path is a strict
  prefix of another's wins, and the enclosed one aliases onto it. That is `nested-page` and the
  silent half of `first-resolver-page`.
- Co-maximal fallbacks — neither path a prefix of the other — merge onto the first in child order.
  That is `aloof-page`.

A level sees deeper candidates too: a placed child carries both its own definition record and the
composed records of the roots below it (`c0:shared:…` beside `shared:…`), so `nested-page`'s two
candidates are both visible at the page level. Their designation is not the placed child's, so
`MarklessWidgetRegistry` (`instance-scope.ts:508`) needs a third member — the set of ids registered
as designated — carried up by `marklessComposeWidgetRegistry` exactly as `rootPaths` and `rowRooted`
already are. `instance-scope.ts` is in contract.

`assertWidgetReadResolved` (`instance-scope.ts:139`) then loses its "a bare widget id claims no
instance" exemption for a definition the registry files as widget-scoped and no rendered root owns,
which is the `MARKLESS_WIDGET_INSTANCE_UNRESOLVED` refusal the packet asks for.

### SSR

`marklessSsrWidgetRoots` (`ssr.ts:272`) already answers designation per placed child off the
compiled `marklessWidgetRoots` marker, and `marklessSsrRenderChild` (`ssr.ts:340`) receives both the
child object and the component it is rendering — so the SSR half can stamp the per-child mark onto
the compose child inside `ssr.ts`, in contract.

## What is blocked: the CSR path has no in-contract place to put the per-child mark

CSR is not the compiled-module path. `render()` (`packages/web/src/render.ts:93`) finds no
`renderCsr` on a compiled `.tsrx` — the compiler emits none — so it falls to
`render-canonical.ts:20`, which is `renderPrerenderDataSurface` in
`packages/web/src/prerender/evaluator.ts`. Both pinned rows of every fixture are CSR and SSR, so this
path is not optional.

On that path the `ComposeChild` objects that `marklessRegisterComposedWidgets` iterates are built by
three object literals inside `evaluator.ts` — `children.push({…})` at ~947, `projected.push({…})` at
~1308, and the row child at ~1362. Those literals are the ONLY place that holds the child surface,
`edge.childComponentName` and the child object at once. They carry exactly one build-time field
today, `childrenWidgetRoot`, and it arrives through the
`SharedSeedPass.childrenWidgetRoot` slot declared in
`packages/web/src/prerender/shared-seed-slot.ts:52` and filled by `shared-seed.ts:652`.

Nothing composition receives identifies which component a child is:

- `state.sharedDefinitions` is the MODULE's list. The evaluator hands each component
  `{...structuredClone(definition.state), cells, computed}` (`evaluator.ts:696`), so the definition
  records are byte-identical for a family's root and its parts. The mark cannot ride there.
- `state.cells` is per component but, under multi-owner emission, carries the same widget cells for
  root and fallback alike — that is precisely the signal the change destroys.
- `propCellId` is `prop:props` or `prop:<name>` (`shared.ts:364`), the same string for every
  component that destructures its props.
- A leaf component never passes through `marklessComposeState` at all (it returns early on no child
  states), so no in-contract function runs over a fallback carrier's own output. `EmptyAdder` in
  `aloof-page` is a leaf.

So the mark can be EMITTED and READ in contract, and consumed in contract on SSR, but on CSR it
cannot reach `marklessRegisterComposedWidgets`. Landing the compiler half without it is worse than
landing nothing: every part of every seeded family would carry the definition's cells and read as a
widget root on the CSR path, which is the family behaviour change the packet forbids.

## The decision this needs

Extend the file contract with the two files that carry the mark across the CSR seam:

- `packages/web/src/prerender/evaluator.ts` — three added properties, one per `ComposeChild` literal,
  each `sharedSeedPass()?.<slot>?.(surface, componentName)` beside the `childrenWidgetRoot` line
  already there.
- `packages/web/src/prerender/shared-seed-slot.ts` — one added optional slot on `SharedSeedPass`,
  declared beside `childrenWidgetRoot` and filled from `shared-seed.ts` by the same
  `installMarklessSharedSeedPass`.

Neither file is held by U727 (roster-position, roster-resume, resume-branches, resume-arm-records).
U725 named `packages/web/src/prerender/**` as held by U722; if that hold still stands, this is a
hand-off rather than a contract extension.

If the answer is no, the alternative is to overload `ComposeChild.childrenWidgetRoot` with a grammar
that carries designation in the same string. That is a lie about a named field and its consumer
(`marklessProjectionIds`, `composition.ts:310`), and it is not recommended.
