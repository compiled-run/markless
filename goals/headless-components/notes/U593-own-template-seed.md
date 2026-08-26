# The client seed pass now reaches a writer a nested widget root renders itself

## The defect, restated as a measurement

`nested-widget-outer-write` already proved the case where the PAGE projects the
writer into the nested widget root (`Note` into `Step`). The tour's card is the
other shape: `tour.item` renders `TourCard` in its own template, as its whole
body, and the card writes `tour.count = index + 1` into the enclosing
`tourState`. On the served render that write landed; in the browser it did not.

The new witness reproduces that shape without the tour. `nested.tsrx` gains one
family and two components:

- `Tally({ index, children })` — a plain part of `outerState` that writes
  `outer.count = index + 1` and carries a projection.
- `OwnInner({ index, children })` — roots `ownState`, and its own template
  renders `<Tally index={index}>{children}</Tally>` plus a `<Label />`.

`own-template-page.tsrx` writes three `OwnInner`s inside one `Outer`;
`own-template-siblings-page.tsrx` writes two `Outer`s with three and two.

Stash receipt, `packages/web/src/fns/shared-seed.ts` stashed to the untouched
tip, everything else in place:

| Row | Untouched tip | Applied |
| --- | --- | --- |
| CSR: a part a nested widget renders in its own template registers in the outer instance | red, `data-count` `0` (expected `3`) | green |
| SSR resume: the same row | green | green |
| CSR: sibling outers each count only their own own-template writers | red, `['0','0']` (expected `['3','2']`) | green |
| SSR resume: the same row | green | green |
| CSR/SSR: an own-template nested widget keeps its own write local | green | green |

The unit row `a writer the nested root renders in its own template seeds the
outer instance` (`packages/web/test/own-template-seed`) is red on the untouched
tip with `expected undefined to deeply equal { count: 3 }`, green applied. That
red/green pair is the asymmetry this unit closed: the served render was already
right, the client render was not.

## Where the two halves actually disagreed

Both halves ask the same guard question, and they ask it identically. The
client's `seedFamilyOpen` and the compiler's `seedFamilyOpenSource` are the same
predicate written twice — `(family ?? plain) === plain`. Neither the guard nor
`projectedEdges` was the cause.

The disagreement is one function, written twice, with two different truncations.

Both packages have a `childrenProjectionChain`: it walks a component's own
template down to the slot that renders its raw `children`, collecting each
composed link on the way.

- The compiler's (`passes/public-render/shared-seed-pass.ts`) returns the whole
  chain. `ssr-module.ts` turns it into `childrenRootEdgeIds`, then into
  `seedForward` — the lines a component's seed pass runs after its own seeds,
  handing each composed link the caller's seed map unchanged. In the emitted
  module for `OwnInner`, that is a call to `Tally`'s seed pass with
  `marklessSharedSeeds: marklessSsrSeeds`, still the outer root's map, because
  the page's seed case for the `Outer` edge is what invoked `OwnInner`'s seed
  pass and the nested root's own token is not filed until the projection renders.

- The client's (`prerender/children-projection.ts`) truncates:
  `chain.slice(0, rooted + 1)`, and answers `[]` when no link roots a widget.
  That is right for what it primarily serves — `childrenWidgetRootPath`, the
  composition seam, which wants the innermost link that roots a widget. But
  `applyComposedChainSeeds` was reading the same truncated answer, so for
  `OwnInner` (whose only composed link, `Tally`, roots nothing) the chain came
  back empty and the forward never ran.

By the time `Tally`'s own seed pass fired — from `OwnInner`'s render, one layer
down — the plain instance key had been overwritten with `OwnInner`'s token while
`outerState`'s family key still named the outer root. The guard correctly closed
the family, and the write was dropped. Exactly the behaviour the tour memo
measured, one component shallower.

## The change

Client half only. `packages/compiler/src/passes/public-render/shared-seed-pass.ts`
and `shared.ts` were in contract and are untouched; emitted bytes are unchanged
for every page, which `emit-byte-equality` confirms.

`packages/web/src/fns/shared-seed.ts`:

- `childrenForwardChain(surface, componentName)` — the same walk as
  `childrenProjectionChain`, untruncated. It is the twin of the compiler's
  version, and the doc comment says so and says why the truncated one exists.
- `seedEdgeAndOwnTemplate(context, edge, read, seeded)` — one placed child's
  whole contribution to the instance now open: its own seeds, then its forward
  chain. The served twin is `marklessSsrSeedChild`, which likewise runs the
  child's seed pass and its `seedForward` over the caller's map.
- `seedProjectingChild` calls it for the root edge and for every edge
  `projectedEdges` yields, instead of calling `applySharedSeeds` alone. Running
  the forward for every projected child, not only the root, is what the served
  render does: `marklessSsrSeedChild` is emitted per projected edge and always
  carries the child's forward lines.

The instance path is unaffected: `composedRoot` still comes from the truncated
`childrenProjectionChain`, so `childrenWidgetRootPath` and the token a part mints
its element ids from are exactly what they were.

## What this unblocks and what it does not

The tour's `tour.count` now has a writer that works in the browser, so
`U589-tour-finish`'s four downstream red rows should follow. It was not
re-measured here — the tour lives in another worktree this unit may not touch.

The second, smaller defect that memo names — `SSR: next and prev walk the steps`
failing on `tour.backtrigger` carrying `disabled` at step 0 — is untouched and
still needs its own measurement.

## Verification

All five commands green on the applied tree: `pnpm typecheck`; the browser lane
over `nested-widget-outer-write`, `seeded-write` and `nested-widget-instances`
(29 rows); `packages/web/test` plus `emit-byte-equality` and the compiler's
`nested-widget-outer-write` (549 rows, 79 files); the ui lane over otp, tree,
select, accordion and radio-group (236 passed, 6 skipped); `vp lint
--deny-warnings` clean.
