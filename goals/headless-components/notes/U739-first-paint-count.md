# The first-paint count on an arm-rooted instance — right in CSR, still 0 in SSR

The carrier-rooting rule is now ONE function, asked by composition and by the
render-side seed pass over the same shape. That fixes the CSR half of T050 and
unpins two of the four rows. The SSR half does not reach the rule at all: it
files the widget instance token from a compiler-emitted per-component marker
that cannot see a page's placement, and that marker is `packages/compiler`.

## What the count was missing

Composition (U735) roots a carrier that stands at a proper prefix of another
resolver's instance path when nothing designates the family above it. The render
side answers a count that no forward pass can know by minting a placeholder keyed
with the widget instance token, and that token came from `widgetRootsOf`
(`packages/web/src/prerender/children-projection.ts`), which read a carrier as
rooting nothing. So the placeholder was keyed with the BARE handle id while
composition had qualified every handle of that instance, `marklessResolveRosterCounts`
matched no handle, and the ask answered 0 until the first flip re-derived it.

## The predicate, shared

`marklessCarrierRootsWidget` in `packages/web/src/fns/composition.ts` is now
exported and takes SITES rather than compose children:

```ts
export type MarklessWidgetSite = {
	readonly path: string;
	readonly designates: boolean;
	readonly inRow: boolean;
};
export function marklessCarrierRootsWidget(
	sites: ReadonlyArray<MarklessWidgetSite>,
	carrier: MarklessWidgetSite,
): boolean;
```

`path` is compared only by prefix, which is the whole point: composition passes
its instance paths, and the render side — which has no instance paths this early
— passes strings whose prefix relation is the same one. The rule itself is
unchanged (not in a row; nothing designating above; encloses at least one
non-designating carrier of the family), so U735's measured second condition still
holds and `array-element-handles`, `deep-projection-dispatch`,
`widget-root-handlers` and `toaster-mint` stay green.

`children-projection.ts` imports it. That edge is not new to the module graph:
`prerender/evaluator.ts` already imports `fns/composition.ts`.

## What the render side had to learn

`widgetRootsOf` takes an optional `WidgetPlacement` — where the placed child
stands among the children placed around it:

- `enclosing` — the placed children whose projections enclose it, innermost
  first, from `enclosingProjectingChildNames`, which already existed.
- `enclosed` — every component inside its own projection at any depth, from a new
  `projectedChildNames` in `fns/shared-seed.ts`. It is `projectedEdges`'s walk
  with the boundary pruning removed, because whether this child IS a boundary is
  exactly the question being asked. Taken arm only, same as `projectedEdges`.
- `inRow` — `context.rowSegment`.

`placementSites` turns those into sites: one depth mark per enclosing child, a
distinct tail per enclosed one. A placed child counts as a site only when its own
payload owns the family's cells, which is the ownership test composition makes on
a compose child's composed state.

Without a placement the answer is unchanged — the conservative "a carrier roots
nothing". The two other `widgetRootsOf` callers (`childrenProjectionChain`'s
`rootsWidget`, and the composed-chain half of `renderedWidgetRootsOf`) pass none,
because those ask about a component's OWN template composing children, which is a
different level from the page's placement. Only `seedProjectingChild` passes one.

## What is still 0, and why it is not reachable from here

SSR files the token from compiler-emitted code:

```js
if(marklessSsrWidgetRoots(Component,name).length) marklessSsrSeeds.set('markless:widget-instance', …)
```

`marklessSsrWidgetRoots` (`packages/web/src/fns/ssr.ts`) reads
`renderSsr.marklessWidgetRoots`, a marker the compiler stamps on a component from
that component alone. A carrier's standing is a fact about the PAGE — which parts
were projected into it, what encloses it — so no per-component marker can answer
it. Giving SSR the same answer needs the emitted seed block to pass a placement,
which is `packages/compiler/src/passes/public-render/ssr-module.ts` plus
`fns/ssr.ts`; both are outside this unit's contract, and U740 holds the compiler.

Measured, SSR, both fixtures: `ui-max` `0` at paint, `4` with the arm, `3`
without. `browser/item-collections`: `['0','2']` at paint.

## Rows

Unpinned and green:

- `arm-rooted-registry` — `CSR: each instance counts its own roster at first paint`
- `item-collections` — `CSR: the count follows an @if arm applying and dropping`

Still pinned, each with the SSR marker reason at the site:

- `arm-rooted-registry` — same row, SSR. The suite loops over both modes, so the
  row picks `test` or `test.fails` off `mode`.
- `item-collections` — same row, SSR.

## Lanes

- `pnpm typecheck` — clean.
- `--project node packages/web packages/bundler` — 1,158 passed, 2 failed: the two
  music-player budget rows, both red on the unchanged tip.
- `--project browser` on the verify block's four suites — 119 passed, 4 expected
  fail, 0 failed. Was 117 passed, 6 expected fail. `adopted-family-derives` and
  `shared-collection-no-body-writer` are green: neither `Mark`/`Tick` nor
  `SeededAdder`/`SeededField` owns its family's cells, so the placement is never
  consulted for them.
- `--project browser` (the WHOLE project, because a rooting rule is a wide
  surface) — 1,090 passed, 17 expected fail, 5 failed, all five in
  `menu-gates/nested-scope.test.ts`. Those five were re-measured on the stashed
  tree in this worktree and fail identically there, which is the same set U730 and
  U735 recorded.

## Bytes

Both budget rows were already red before this card, and neither anchor was
raised.

| row | tip, unchanged | with this card |
| --- | --- | --- |
| music-player CSR page-load download (anchor 137398 +128) | 138,130 | 138,133 (**+3**) |
| music-player-ssr page-load download (anchor 69730 +128) | 69,907 | 69,907 (**+0**) |

The CSR row was 604 over before this card and is 607 over after. The +3 is the
carrier rule's new call shape; the placement builder is prerender-only and does
not reach the CSR page-load closure.

## The follow-up

Give the SSR seed block the placement the CSR one now has, so
`marklessSsrWidgetRoots` answers the same rule rather than a per-component
marker — `ssr-module.ts`'s `registerInstance` gate plus `fns/ssr.ts`. Until then
the two SSR rows stand pinned and the first-paint count on an arm-rooted instance
is server-rendered as 0.
