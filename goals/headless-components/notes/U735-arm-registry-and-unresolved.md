# The arm-rooted instance was never about the arm — and the unresolved refusal cannot be told from a legitimate one

Two cards. The first lands in composition and is measured; the second is
**blocked on a compiler signal**, because the page it must refuse and a page that
is green today reach composition looking identical.

## T046 — why the arm-rooted instance registers no root

U727 and U732 both recorded the widget registry as empty
(`{"rootPaths":{},"rowRooted":{}}`) at the arm-driven re-derive and read the arm
as the suspect. Measured on this tip, with the registration and the graph
registry instrumented on `item-collections/ic-arm-page.tsrx`, the registry is
**not empty and the arm has nothing to do with it**:

```
children  c0:p1: IcArmToggle  carrier
          c0:p2: c0:p3: c0:p4: IcItem  carrier
          c0:   IcArmRoot     carrier   <-- the arm-rooted instance
          c5:p6: c5:p7: IcItem carrier
          c5:   IcRoot        DESIGNATES
roots     ["c5:shared:…/ic-widget.tsrx#ic"]
```

Nothing in `ic` is seeded from a component body, so U730's marked rooting hands
its cells to every resolver and designates the **first declared** one — `IcRoot`.
`IcArmRoot` is therefore a *carrier*, and U730's rule is "a carrier never
registers a widget root at all". The whole `c0:` half of the page falls into page
space: its cells go unqualified, `createRosterCountReader` asks the unqualified
handle key, and `ui-max` counts every member on the page. Compiling the fixture
confirms the mark directly (`compileTsrxModule`, `componentDefinitions`):
`IcRoot` `rootsWidget: true`; `IcItem`, `IcArmRoot`, `IcArmToggle` all
`widgetFallbacks: ["…#ic"]`.

`resume-branches.ts` and `resume-arm-records.ts` are innocent, and were not
touched.

### What landed

One rule in `packages/web/src/fns/composition.ts`, and nothing else in
`packages/web` — `fns/instance-scope.ts` is byte-identical to the tip.
`marklessRegisterComposedWidgets` now also roots a carrier, under two conditions
it needs **both** of:

- it ENCLOSES another part of the family — some other child at this compose level
  carries the same definition's cells, does not designate them, and stands at an
  instance path that properly extends the carrier's. That is the projection
  relation, spelled in the paths composition already has (`c0:` is a proper
  prefix of `c0:p1:`).
- nothing DESIGNATES the family above it. A content part wrapping a family's
  options *inside* that family's own designated root encloses them too, and is a
  part of that widget rather than the start of a second one nested in it.

A carrier standing in a repeat row never roots: its cells are dropped a few lines
below and a widget the row never rooted must not appear.

Co-maximal carriers — siblings enclosing nobody, which is `aloof-page` and
`nested-page` — still stay page-wide, exactly as U730 ruled. That is what keeps
those two suites green.

**The second condition was measured, not designed.** Without it the browser
project went from 5 failures to 19: `array-element-handles`,
`deep-projection-dispatch`, `widget-root-handlers` and `toaster-mint` all render
a content/projection carrier inside the family's designated root, and rooting it
split each of those pages into two instances.

### What the witness proves

`packages/vitest-browser/browser/arm-rooted-registry/` — two instances of one
family, the first rooted by `ArmedDialRoot` (a carrier holding the flippable
`@if`), the second by the designated `DialRoot`. 8 passed, 2 pinned, CSR and SSR:

| row | before | after |
| --- | --- | --- |
| the arm's flip recounts its own instance | `ui-max` 6 → 7 → 6 | **4 → 3, other instance stays 2** |
| the arm renumbers only its own members | first instance renumbers, second unaffected | same, and now for the right reason |
| a shared-cell read after the arm flips | `w.code` undefined on the arm instance | **`a,b,c` → `b,c,d`, and `shout()` uppercases one instance only** |
| the designated root's own write | reached both | **reaches only its own instance** |

The `char = w.code.slice(pos, pos + 1)` derivation U732 had to guard is
unguarded here and green, which is the same fact the guard was standing in for.

### What did NOT land: the FIRST-PAINT count

`ui-max` on the newly rooted instance reads **0 at paint** and only becomes right
on the first flip. Measured on both modes: `0 → 4 → 3` where it should be
`3 → 4 → 3`. Two rows are pinned `test.fails` for it.

The cause is a rooting decision that composition does not own. A count is not
knowable while the render is still emitting the members it counts, so the ask
mints a placeholder keyed with the widget-instance token
`packages/web/src/fns/shared-seed.ts` files (line 81), and that token comes from
`widgetRootsOf` in `packages/web/src/prerender/children-projection.ts`, which
still reads a carrier as rooting nothing. The placeholder is therefore keyed with
the BARE handle id while composition has qualified every one of this instance's
handles, `marklessResolveRosterCounts` matches no handle, and the ask answers 0.

Both files are outside this unit's contract (U734 holds prerender). **The two
`test.fails` count rows in `browser/item-collections/item-collections.test.ts`
therefore cannot be flipped yet**: their first assertion is the first-paint
`['3','2']`. Their *post-flip* half is fixed — `['4','2']` and back to `['3','2']`
— which is the half U727 named. The follow-up card is: make `widgetRootsOf`
answer the same rule `marklessCarrierRootsWidget` now answers, and unpin four
rows (two here, two in item-collections).

## T047 — the unresolved refusal, blocked

The refusal was built and it worked on the shape the packet named, then had to be
taken back out. Both halves are recorded because the second half is the ruling
this needs.

The shape: `shared-collection-no-body-writer/rootless-page.tsrx` renders a part of
`seeded-family.tsrx#seededBox`, a family whose root SEEDS it from its own props,
so the compiler gives the cells to that one component and no other resolver
carries them — and the page renders none of it. Measured: the handler's
`[...box.items, 'gamma']` spreads undefined and V8 spells that
`context.graph.read is not a function or its return value is not iterable`,
which is U715's original report reproduced exactly.

Recording "no child of this compose carries this family's cells" on the composed
definition, carrying it to the graph registry and refusing there does name that
failure `MARKLESS_WIDGET_INSTANCE_UNRESOLVED`. It also **breaks four rows that
are green today**: `browser/adopted-family-derives/outermost-part-page.tsrx` and
`outermost-second-part-page.tsrx`, where a part ADOPTS a family declared in
another module and the family is page-wide on purpose.

The two pages are indistinguishable to composition. Instrumented per compose
child, both ship the widget definition record and carry none of its cells:

```
adopted   [{"p":"c0:","defs":["shared:…/gauge.tsrx#gauge|widget"],"cells":[]}]
rootless  [{"p":"c0:","defs":["shared:…/seededBox|widget"],  "cells":[]}]
```

The distinction exists only at build time, in `componentDefinitions`:

- `part.tsrx` (adopting) — `Mark`: `cells: []`, and no `sharedDefinitions` record
  of its own. The family is somebody else's; page-wide is correct.
- `seeded-family.tsrx` (declaring) — `SeededAdder`: `cells` lists
  `…#seededBox/state:box` but `stateCellIndexes: []`. It is a part of a family
  its OWN module declares, whose cells went to a component this page never
  rendered.

That second fact is the signal, and only the compiler can emit it — this unit
forbids `packages/compiler`. Composition cannot reconstruct it: the runtime
compose child carries the owned selection, so both arrive as "record, no cells".

**Blocked question for the owner:** may a follow-up mark, in
`packages/compiler/src/passes/public-render/shared-seed-pass.ts`, every component
that resolves a widget-scoped definition ITS OWN MODULE DECLARES and owns none of
its cells — the complement of `widgetFallbackComponents` for a SEEDED family — so
composition can tell a part left rootless from a legitimate page-wide adoption?
The mark is `[]` for every family in `packages/headless/components/src` (all 387
seed in a body and root where the seed lands), so it costs those bytes nothing.

Three rows stand in the meantime, CSR and SSR:

- `test.fails`: a part whose family rendered no root or carrier NAMES its failure.
  Pinned with the reason above.
- green: that page reads undefined rather than writing into the void — the
  measured `is not a function or its return value is not iterable`, so the defect
  is witnessed rather than merely described.
- green: the same part takes the write once its family's root renders.

## Bytes and lanes

Both music-player budget rows were **already red on this tip before any edit**,
and neither anchor was raised.

| row | tip, unchanged | with this card |
| --- | --- | --- |
| music-player CSR page-load download (anchor 137243 +128) | 137,810 | 137,959 (**+149**) |
| music-player-ssr page-load download (anchor 69730 +128) | 69,897 | 69,897 (**+0**) |

The +149 is this card's own emitted rule. It is named rather than absorbed; the
CSR row was 439 over before it and is 588 over after, and bisecting the pre-existing
overrun is still its own card's work (U732 carried the same finding forward).

The resume closure wall is untouched — `fns/composition.ts` is not in
`resume-branches.ts`'s closure and `packages/web/test/event-only-resume-closure.test.ts`
is green.

- `pnpm typecheck` — clean.
- `pnpm exec vitest run --project node packages/web` — 653 passed.
- `--project node packages/web packages/bundler packages/compiler` — 3,091 passed,
  2 failed, both the budget rows above, both red before this card.
- `--project browser` (the WHOLE project, because a rooting rule is a wide
  surface) — 1,069 passed, 19 expected fail, **5 failed, all five in
  `menu-gates/nested-scope.test.ts` and all five failing identically on the
  unchanged tree** (the same five U730 recorded).
- `--project browser` on the verify block's three suites — 36 passed, 4 expected fail.
- `--project ui` (the whole project, 2,517 rows) — 2,477 passed, 17 expected fail,
  5 failed: `conformance.browser.ts > menubar` ×2, `calendar`, `taglist` ×2 — the
  same set U730 recorded as failing identically on the unchanged tree. No family
  in `packages/headless/components/src` carries an unseeded widget definition, so
  the new rule is inert there by construction.
