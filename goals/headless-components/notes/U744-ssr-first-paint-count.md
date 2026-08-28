# SSR answers the carrier-rooting rule at first paint

## What was wrong

A widget family nothing seeds hands its cells to every component that resolves it, and
the compiler designates one of them the root. A page that also renders a *second*
root-shaped component of that family — a variant root beside the designated one — gets a
CARRIER: it holds the cells without designating them.

CSR already decided that such a carrier is nevertheless a root when the page gives it a
root's standing. `marklessRegisterComposedWidgets` in `packages/web/src/fns/composition.ts`
asks the shared predicate `marklessCarrierRootsWidget` with the child's page placement
(its instance path, whether a designated site encloses it, whether it sits in a repeat row).

SSR did not. It filed the widget instance token from the compiler's per-component marker
`<fn>.marklessWidgetRoots`, which names only the families a component DESIGNATES. That is a
fact about the component alone; it cannot see where the page put it. So on the server the
carrier registered no instance token, the count placeholder was keyed with the bare handle
id while composition had qualified every handle of the instance, no handle matched, and the
roster count answered 0 at first paint.

Measured before the fix: `['0','2']` where `['3','2']` is right (item-collections), and
`0` at paint / `4` with the arm / `3` without (arm-rooted-registry).

## What the fix does

Routes the page placement into the SSR seed gate and reuses the same predicate CSR uses —
no second rooting rule.

**New marker.** `widgetCarriesMarkerLine` in
`packages/compiler/src/passes/public-render/shared-seed-pass.ts` stamps
`<fn>.marklessWidgetCarries = [...]` from the existing `widgetFallbackDefinitionIds`. The
`widgetFallbacks` field already published the same answer, but on the render OUTPUT, which
does not exist yet when the seed pass runs — the seed pass runs before the child renders.
Emitted from both `ssr-module.ts` (the served root) and `same-module.ts` (sibling
components in one module).

**New SSR helper.** `marklessSsrPlacedWidgetRoots` in `packages/web/src/fns/ssr.ts` takes
the placed child plus the placements ENCLOSING it (innermost first) and the placements it
ENCLOSES, and calls `marklessCarrierRootsWidget` over sites built from the two markers. It
has no instance paths this early, so it spells the nesting in `':'.repeat(depth)` strings
whose prefix relation is the one composition reads off real instance paths — the same trick
`packages/web/src/prerender/children-projection.ts` already uses for the build-time twin. A
child carrying nothing returns the marker answer unchanged, so nothing else moves.

**New compiler emission.** `ssr-module.ts` precomputes `placementByEdgeId` (each placed
child's instance path plus the two arguments that reach its markers) and swaps the three
gates that asked `marklessSsrWidgetRoots(...)` — the instance-token gate, the per-family
key loop, and `marklessSsrWidgetFamilies` — for `widgetRootsSource(edgeId)`.

## Pay-per-use

`widgetRootsSource` emits the placement-aware call ONLY for an edge that encloses another
placed edge. Condition 3 of the carrier rule is "encloses another part of the family", so an
edge enclosing nobody can never be a carrier root; it keeps `marklessSsrWidgetRoots(args)`
with byte-identical arguments. In practice that confines the extra bytes to root-shaped
placements.

## What was NOT changed

`marklessSsrWidgetBoundary` still asks the raw marker. A projected part encloses nothing, so
the placement-aware answer and the marker answer are the same there. Left alone rather than
churned.

`childrenWidgetRootMarkerLine` and `widgetRootMarkerLine`'s `composedRootSurfaceArgs` also
still ask the raw marker. Both are about a component's own internal composition, not about
where a page puts it.

The CSR path is untouched.

## Verification

- `pnpm typecheck` — clean.
- `pnpm exec vitest run --project node packages/compiler packages/web` — 342 files, 2621
  tests green (1 expected-fail row unrelated to this unit).
- `pnpm exec vitest run --project browser packages/vitest-browser/browser/arm-rooted-registry packages/vitest-browser/browser/item-collections`
  — 2 files, 95 tests green.

Both formerly pinned rows are now plain `test` rows and pass in both regimes:
`arm-rooted-registry.test.ts` "each instance counts its own roster at first paint" (the
`firstPaint = mode === 'CSR' ? test : test.fails` fork is gone; both modes use `test`), and
`item-collections.test.ts` "SSR: the count follows an @if arm applying and dropping".

## Compiler pins updated

Seven rows across three files pinned the emitted helper name. Renamed to say what they now
pin, per the packet's "reason in the test name":

- `nested-widget-root-boundary.test.ts` — "the outer root's seed pass guards every part
  against a nested root of the family it starts **where this page puts it**"; "a part's own
  seed case reads the families of the widget enclosing it, **both asked with where this page
  puts them**".
- `multi-root/widget-instance-token.test.ts` — "a served widget root files its instance
  token under every family it roots **where this page puts it**".
- `nested-part-idref-minting.test.ts` — no rename; only its `instanceRegistrations` regex
  widened to `marklessSsr(?:Placed)?WidgetRoots\(.*?\)` (the old `[^)]*` could not span the
  nested parens of the placement argument lists). The four rows pin the same facts.

## Bundler byte budgets: pre-existing red, NOT this unit

Two budget rows are red. I measured them with my change stashed and with it applied and got
byte-identical numbers, so this unit contributes nothing to them. Left as they are, per the
packet.

    music-player-ssr: measured 138163 gzip bytes across 108 chunks,
                      over anchor 137401 (+128 margin) = 137529   [over by 634]
    music-player-csr: measured  69905 gzip bytes across  97 chunks,
                      over anchor  69730 (+128 margin) =  69858   [over by 47]

## Follow-up worth considering

The `enclosing` argument lists are deduped by their emitted argument string, which collapses
two different depths of the same component into one site. Harmless for this predicate —
condition 2 only asks whether SOME designating site encloses the carrier — but it is a
deliberate narrowing, not an accident, and would need revisiting if the rule ever grew a
depth-sensitive clause.
