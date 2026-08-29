# The seed pass was asking positions, and the render's numbering paid for it

`renderRosterPosition` counts asks. That is exact only when the render asks once
per rendered part. The CSR path asked three times per tour card, and the two
extra asks came from a place that renders nothing at all: the **shared-seed
pass**. It now counts on a ledger of its own, so the render asks exactly once per
part again — which is what the served page already did.

The four CSR `Disabled` browser rows and the `tour > a tour served open
announces its first card without any press` screen-reader row are green, with no
assertion changed.

## Measured, not reasoned: where the six asks came from

`scenarios/disabled.tsrx`, two cards, instrumented at `renderRosterPosition` with
the derive being evaluated and the top of the stack. CSR, six asks under ONE key
(`c0:|…#tourState/element:itemEls|element:mine` — both cards spell it, which is
the point of a counter):

```
ask 0  fns/shared-seed.ts:132   seeds s0  (tour root scope)
ask 1  fns/shared-seed.ts:132   seeds s0  (tour root scope)
ask 2  fns/shared-seed.ts:132   seeds s1  (card 1's own instance c0:p2:)
ask 3  prerender/evaluator.ts   seeds s2  TourCard c2:c0: computed:at = 3
ask 4  fns/shared-seed.ts:132   seeds s3  (card 2's own instance c0:p9:)
ask 5  prerender/evaluator.ts   seeds s4  TourCard c9:c0: computed:at = 5
```

Only asks 3 and 5 are parts rendering. `isCurrent` then compares step 0 against
3, is correctly false against a wrong number, and both cards paint `hidden`.

**The idempotent-key candidate is refused by this measurement.** Both cards ask
under the same `(instance, roster, handle)` key — the roster's node id and the
member handle's node id are module-level strings, and the instance is the tour's,
which both cards share. First-ask-wins on that key answers 0 for every card. No
per-part token is reachable at the ask either: the render asks of both cards
carry the same widget-instance token (`c0:`). So the fix had to be "ask once per
rendered part", the other candidate on the card.

## Why the seed pass asks at all

`composedScopeRead` (`fns/shared-seed.ts`) builds a composing link's scope by
evaluating its module's initial values, and the producer hands every component of
a module the whole module's list. `tour.item` is a wrapper whose own template
puts the consumer's children inside the card that stands in the roster, and both
components live in `tour.tsrx` — so `TourItem`'s definition carries `TourCard`'s
`computed:at`, and the seed pass runs it once per composing link. The evaluator
guards the same hazard with `marklessOwnsDerivedNode`; the seed scope has no such
guard, and that is why it was invisible until a family wrote this shape.

It never surfaced on `item-collections` because `IcItem` is placed directly, and
`ic-composed-page`'s composing link (`Panel`) lives in the page's module, whose
initials hold no position derive. Measured: one ask per item on both.

## The fix

`packages/web/src/prerender/shared-seed-slot.ts` — `MarklessRosterPositions`
gains `seeding`, a ledger held only while a seed pass is running;
`renderRosterPosition` counts on `positions.seeding ?? positions.taken`.
`marklessRosterSeedPass(seeds, run)` swaps one in for the duration and restores
the previous one on both edges (`marklessSettled`).

`packages/web/src/prerender/evaluator.ts` — the two `seedChild` sites that hand
the pass an inherited seed map are wrapped in it. The third site
(`renderRowChild`) hands the pass `undefined`, so no ledger reaches it and no ask
is possible there.

Sequential by construction: `marklessWalk` resumes where it stopped and every
seed pass is awaited before the render that follows it, so one pass is in flight
at a time. The ledger is per render, like the counter it shadows, so two page
renders in one process cannot splice each other.

**What a seed-time ask now answers.** The seed pass's own walk order, from zero,
per pass. That is right for the pass that walks an instance's members (the two
root-scope asks answer 0 and 1) and arbitrary for a nested pass seeding one
card's own projection. Nothing spends a position at seed time — the seed scope
exists to answer a composing link's props — and the served page is unaffected
either way. Making it exact needs the owner-guard the evaluator has, in
`fns/shared-seed.ts`, which is outside this card.

## The witness

`packages/vitest-browser/browser/item-collections/ic-composed-part.tsrx` — the
card and the wrapper that composes it in ONE module, the wrapper rooting a widget
of its own the way `tour.item` does; the card derives `pos` from the roster,
writes it as `ui-pos`, and spends it in a second derivation (`ui-mine`).
`ic-composed-part-page.tsrx` places three of them flat inside `IcRoot`.

Red before, on CSR only, exactly as the tour was:

```
CSR: a part composed by a wrapper in its own module still counts from zero
  ui-pos  expected ['0','1','2']  received ['4','6','8']
```

SSR was green before and after.

## Verification

- `pnpm typecheck` — clean.
- `pnpm exec vitest run --project node packages/web` — 96 files, 653 passed.
- `pnpm exec vitest run --project browser` over `item-collections` and
  `single-component-family` — 94 passed, 1 expected fail (pre-existing).
- `pnpm test:sr` — 323 passed, 3 failed, 9 expected fail, 4 skipped. The three
  are `toaster.sr.ts`, and `timebox.sr.ts` / `tokenbox.sr.ts` collect no test at
  all. **Attributed by stashing this card's two source files and re-running the
  whole lane: without the fix it is FOUR failing files — the same three plus
  `tour.sr.ts (9 tests | 1 failed)`.** The tour row is this card's; the other
  three are the tip's.

## The tip's tokenbox break, which no lane can work around

`packages/headless/components/src/tokenbox/tokenbox.tsrx` does not compile on the
pilot tip (`MARKLESS_STATE_DYNAMIC_PATH_READ` at :151 and :181,
`MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE` for symbol:1 and symbol:2).
It landed in `22b0982a`, which is on `feat/headless-ui-pilot` and NOT in U738's
base — which is why U738 could measure a tour ui lane and this card cannot.

Every `*.browser.ts` reaches it: a scenario imports `src/index.ts`, which
`export * as tokenbox`, so the whole `ui` project fails at import for every
family, not only tour. `pnpm exec vitest run --project ui
packages/headless/components/src/tour` reports `0 test`.

**The 38 tour ui rows were measured green.** With the six tour scenarios
temporarily pointed at `../index.ts` (the family's own entry) instead of the
barrel, and nothing else changed:

```
Test Files  1 passed (1)
Tests      38 passed (38)
```

That import change is REVERTED in the shipped tree: 378 scenario import lines across the
package name the barrel and 2 do not, so pointing one family away from it would
hide a repo-wide break rather than fix anything. The tour ui lane goes green the
moment tokenbox compiles.

## Bytes

`prerender/shared-seed-slot.ts` is eager and grew by one field, one `??` on the
ledger, and `marklessRosterSeedPass` (a nine-line function over
`marklessSettled`, which is a named import from `ssr-data/awaitable.ts` — the
module the file already imported `Awaitable` from as a type). No new module, no
new chunk, no anchor touched. The bundler budget lanes are not in this
card's verification and were not run.
