# U730 — marked rooting, landed

Implements the design ruled in `U728-marked-rooting.md` (following
`U725-render-order-rooting.md` and `U715-shared-collection-no-body-writer.md`). The four pinned rows
in `packages/vitest-browser/browser/shared-collection-no-body-writer/` are unpinned and green, CSR
and SSR.

```
pnpm exec vitest run --project browser packages/vitest-browser/browser/shared-collection-no-body-writer
Tests  10 passed (10)
```

## What landed

**Compiler.** `widgetRootComponents` is untouched and stays the DESIGNATED root: the seeding
component, else the first resolver in declaration order. Beside it,
`widgetFallbackComponents` (`shared-seed-pass.ts`) answers, per widget-scoped definition this module
declares AND NOTHING SEEDS, every other component that resolves it. `componentOwnedStateNodes`
(`shared.ts`) widens `cellIndexes` — and through it `seedCellIndexes` — to accept a carrier, so every
resolver's payload carries the cells. `resolvePayloadNodeOwners` still answers ONE owner per node, so
`widgetRootDefinitionIds`, the SSR `marklessWidgetRoots` marker and the bundler's `rootsWidget` gate
keep meaning "designated".

The mark is `widgetFallbacks` on the component definition record
(`component-definitions.ts`), serialised whole by the bundler with no serializer change, and typed on
`PrerenderDataDefinition`.

**CSR.** `widgetRootsOf` (`children-projection.ts`) subtracts the carried families, so it and
`rootsWidget` answer exactly what they answered before the widening. A new optional
`SharedSeedPass.widgetFallbacks` slot carries the mark to the three `ComposeChild` literals in
`prerender/evaluator.ts`, filled by `installMarklessSharedSeedPass`.

**Composition.** `marklessRegisterComposedWidgets` registers a root only for a child that DESIGNATES
the family it carries, so a carrier composes as a part. `marklessComposedState` collapses the
duplicate widget cells the extra carriers produce.

## Two places the ruled design did not survive contact

Both are departures from `U728`, and both are load-bearing.

### The SSR mark could not ride on the compose child

`U728` expected `marklessSsrRenderChild` (`ssr.ts`) to stamp the per-child mark, because it receives
both the child object and the component. It is not the only SSR push site, and not the one these
fixtures use: the render-data path pushes
`marklessSsrChildren.push({...child,output,callbackProps})` from a line emitted at
`ssr-module.ts:1027`, inside the module that PLACES the child. A placing module cannot see whether an
IMPORTED child carries a family without rooting it — `empty-family.tsrx` is imported by all three
pages — and adding the ask to that emitted line would change bytes in every module with a
render-data child.

So on SSR the carrier publishes the mark ITSELF, as a `widgetFallbacks` field on its own
`renderSsr` output (`widgetFallbacksOutputField`, emitted by `ssr-module.ts` and `same-module.ts`).
That is the one channel the placing module cannot supply and the carrier always can. Composition
reads `child.widgetFallbacks ?? child.output.widgetFallbacks`; absent means "roots what it carries",
which is every child compiled before the mark existed.

### Fallbacks never root, and the merge rule was not needed

`U728` ruled a per-level merge — maximal fallbacks root, co-maximal ones merge onto the first via
registry aliases — plus a third `MarklessWidgetRegistry` member carrying designation up. None of that
is here. **A carrier never registers a widget root at all.** Its cells stay in page space and resolve
by the prefix walk into whatever designated root encloses it, or stay page-wide when none does.

The two rules agree on every shape either was written for:

| page | under the ruled merge | under "carriers never root" |
| --- | --- | --- |
| `empty-page` | designated `EmptyRoot` roots `c0:`; parts resolve into it | same |
| `first-resolver-page` | designated `FirstField` roots `c0:p1:` | same |
| `aloof-page` | co-maximal carriers merge onto `c0:p1:` | one page-wide instance |
| `nested-page` | carrier enclosing the writer roots `c0:p1:` | one page-wide instance |
| `two-v2-page` | two designated `V2Dial`s, never merged | same |
| `nest.tsrx` | designated `NestRoot` per nesting | same |

For `aloof-page` and `nested-page` the two differ only in WHICH single instance the parts share, and
nothing observable separates them: the ruled merge also collapses every co-maximal carrier on a page
onto one. The simpler rule also avoids the case `U728` left open — a carrier that a deeper level
already rooted arrives at the level above as an ALREADY-COMPOSED record (`c0:shared:…`), and
`marklessComposedGraphNodeId` short-circuits prefixed shared ids without consulting the registry, so
an alias registered for one could not have redirected it without changing that short-circuit for
every nested family.

## The regression this turned up, and the rule that closes it

Multi-owner emission broke `packages/vitest-browser/browser/part-row-refresh.test.ts` ("CSR: rows
that are component parts refresh when every element is replaced"), which the packet's verify block
does not run. `part-row-gate-parts.tsrx` seeds `gateState` from the factory and writes it only from a
handler, so `GateItem` — a component part rendered inside a keyed `@for` — is a carrier. Every row
then carried its own copy of the family's cells at the factory default, and a minted row writes every
cell of its composed state into the live graph unconditionally
(`seedMintedGraphNodes`, `row-component-mint.ts`, out of contract): the click advanced `offset` to 1
and the mint put 0 straight back over it, so the rows re-rendered with the values they already had.

`marklessDropCarriedWidgetCells` closes it: **a carrier composed at an instance path carrying a row
segment contributes none of the family's cells.** A part standing in a row already has the guarantee
the cells exist for — the row either stands inside a rendered root or the family is page-wide — and
one carried copy per row is a widget the row never rooted.

Three narrower guards were tried against the same row and did not hold, which is worth recording:
qualifying the cell and dropping it when a root answered (the mint's compose registry is empty, so
nothing answers); the `enclosingWidgetScope` ancestor roots (not installed for this repeat); and a
scope around `renderRepeatRowComponent` (the row's part composes through the ordinary child path, not
the row-child path).

## What the change actually costs

Compiled every `.tsrx` in the repo and counted the components carrying the mark:

- `packages/headless/components/src`: **387 files, 0 components marked.** Every family seeds its
  shared state in a body, so every family emits byte-identically and no family's rooting changes.
  Pinned going forward by `packages/compiler/test/widget-fallback-carriers.test.ts`.
- `packages/vitest-browser/browser` + `demos`: 561 files, **87 components marked** across 9 fixture
  families. `U725`'s inventory named four (`emptyBox`, `firstBox`, `v2Dial`, `nestState`) because it
  audited only the suites in the verify block; the others are `wideState`, `gateState`,
  `noWriterBox`, `stepperState` and `gate.tsrx`'s `gateState`. `gateState` is the one that produced
  the regression above.

Bundler anchors, measured against the unchanged tree at the same tip:

- `music-player-ssr` page-load download: **69884 bytes both before and after** — this change moves
  nothing there.
- `music-player` CSR page-load download: 137545 before, 137682 after — **+137 gzip bytes**, all of it
  the runtime that READS the mark (`widgetFallbacksOf`, the designation test, the cell collapse, the
  row guard), since music-player declares no widget-scoped `shared()` of its own.

Both budget tests were ALREADY red at this tip before any edit (CSR over by 174, SSR by 26), so
neither is a signal this change produced, and the anchors live in `packages/bundler/test/**`, outside
this unit's contract. They were left alone.

## Not done

`assertWidgetReadResolved` still exempts a bare widget id. The packet asked for
`MARKLESS_WIDGET_INSTANCE_UNRESOLVED` on a read that resolves to no root, and under this design a
bare id is no longer evidence of that: a page-wide carrier instance — which is what `aloof-page` and
`nested-page` now legitimately are — reads exactly the same bare id as a part that reached no root at
all. Telling them apart needs a signal composition does not currently record (whether any rendered
root for the family exists at a non-empty path), and inventing one under the wire was not worth the
risk to 2407 passing family rows. It is a follow-up, not a blocker: every shape the packet named is
green without it.

## Verification

- `pnpm typecheck` — clean.
- `pnpm exec vitest run --project node packages/compiler packages/web packages/bundler` —
  3091 passed, 2 failed, both the pre-existing bundler budget anchors above.
- `pnpm exec vitest run --project browser` (the WHOLE project, not just the four suites named, since
  87 marked components is a wider regression surface than the packet assumed) — 1041 passed,
  5 failed, all five in `menu-gates/nested-scope.test.ts` and all five failing identically on the
  unchanged tree.
- `pnpm exec vitest run --project ui` (the whole project) — 2407 passed, 4 failed
  (`conformance.browser.ts > menubar` ×2, `calendar`, `taglist`), all four failing identically on the
  unchanged tree. The taglist cap row flips between its CSR and SSR spelling run to run, before and
  after.
