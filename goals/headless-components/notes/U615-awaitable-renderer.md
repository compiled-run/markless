# The renderer is sync-capable now; one forbidden file still yields on the warm path

`renderSsrData` no longer returns a promise when nothing made it wait. Its whole
internal chain — `renderChunk`, `renderSlot`, and the projection helper
`withProjectionSpan` — is spelled as continuations over `Awaitable<T>` instead of
`await`, so a render whose every input answers synchronously hands back a
`RenderSsrDataOutput` directly, and one that waits on anything hands back a
promise exactly as before. No caller changed: `await` on a plain value still
works, which is why the conversion lands with the served bytes untouched.

That was the half of this unit that lives inside its contract. The other half —
a component row built inside the handler's own statement — is still one `await`
away, and that await is in a file this unit may not touch. That is the blocked
question at the bottom.

## What the renderer conversion actually is

Three shapes replaced every `await` in `packages/web/src/ssr-data/renderer.ts`:

- `marklessThen(value, next)` — calls `next` immediately when `value` is not a
  thenable, otherwise `value.then(next)`.
- `marklessSettled(value, release, next)` — the same, carrying the `finally` of
  the await it replaces, so a projection span is released on both the resolved
  and the rejected edge.
- Two index-resuming walks, for the statics/slots stream in `renderChunk` and the
  attribute slots of a `dynamic-host`: a slot that answers with a promise resumes
  the loop where it stopped rather than restarting it.

Two ordering facts were preserved deliberately, because both are load-bearing and
neither is obvious:

**Repeat rows are still started eagerly, in row order.** The old spelling was
`await Promise.all(items.map(renderChunk))`, which starts every row before any of
them finishes. A plain sequential loop would have changed the interleaving of the
`locators`/`anchors` pushes and of the evaluator's own `children.push`, which
feeds `marklessSsrComposeView` and therefore the served `view`. The new spelling
still `map`s first and only then decides: `Promise.all` if any row answered with
a promise, the array itself if none did. `awaitable-renderer.test.ts` pins the
mixed case — first row promised, second row not — against the byte-identical
output.

**`renderChunk`'s read context is hoisted out of the slot loop.** It was rebuilt
per slot from values that are constant for the whole chunk (`chunkId` and the
`repeat` argument). Building it once is the same object per slot, which is what
the walk needs to resume without recomputing it.

## Measured: served bytes are unchanged

- `packages/compiler/test/emit-byte-equality.test.ts` — passes.
- `packages/web/test`, `packages/runtime/test`, `packages/serializer/test` —
  97 files, 709 tests, all passing.
- The 13 browser lanes this unit was told to keep green (`krg`, `krg-remove`,
  `part-row-refresh`, `disposed-row-dispatch`, `repeat-owner-path`,
  `calendar-blockers`, `demand-load-replay`, `write-then-focus`,
  `nested-widget-outer-write`, `root-idref`, `composed-arm-boundary`,
  `seeded-write`, plus the witness) — 15 files, 126 passed, 4 expected fail,
  0 failed. The four expected fails are the witness pins, still pinned.
- `vp lint --deny-warnings` — 0 warnings, 0 errors.
- The static-closure byte wall in `event-only-resume-closure.test.ts` is not
  touched: it measures the static import closure of `resume-keyed-repeats.ts`
  and friends, and the renderer is reached only through the dynamic import in
  `fns/row-component-mint.ts`, so it is not in that closure at all. This unit
  edited no file inside the wall.

`packages/web/test/awaitable-renderer/awaitable-renderer.test.ts` is the new
witness for the mechanism itself: 4 rows over a two-row keyed repeat, asserting
that a fully warm render returns a non-promise, that one promised read turns the
whole render into a promise, that a promise on the first row alone does not
reorder the rows, and that the warm and promised renders agree on `html`,
`structureTokens`, `structure` and `coordinates` byte for byte. It asserts on
`typeof result.then` rather than on timing, because `await` settles a plain value
one microtask late — which reads the same in a test and is the entire defect in a
handler.

## The one await left on the warm path

Walking the chain from the write down, with the renderer converted:

`resume-keyed-repeats.ts` → `fns/row-component-mint.ts` `rows()` →
`mintComponentRow` → `prerender/evaluator.ts` `renderRepeatRowComponent` →
`renderRowComponentEdge` → `evaluatePrerenderDataComponent` → `renderSsrData`.

Everything below `renderRowComponentEdge` is either converted or already
sync-capable by signature:

- `renderSsrData` — converted, this unit.
- `input.loadSymbol` — already `(symbolId) => ResumeSymbol | Promise<ResumeSymbol>`
  (`resume-types.ts:303`). Warm, it answers synchronously.
- `registerPrerenderStagedComputeds` — already `void | Promise<void>`
  (`prerender/staged-graph.ts`), and for a minted row `input.graph` is
  `undefined`, so it returns `undefined` without doing anything.
- `evaluatePrerenderDataComponent`, `renderRowComponentEdge`,
  `fns/row-component-mint.ts`'s awaited dynamic imports — all inside this unit's
  contract, all mechanical, none of them done here (see below).

The exception is one call, `prerender/evaluator.ts` in `renderRowComponentEdge`:

```ts
const sharedSeeds = await sharedSeedPass()?.({ ... }, definition, { componentEdgeId: edge.id, ... }, read, undefined);
```

`sharedSeedPass()` answers with `seedProjectingChild` from
`packages/web/src/fns/shared-seed.ts`, which this unit's forbidden moves name as
owned by another live unit. It is `async`, as are the four helpers it calls
(`seedEdgeAndOwnTemplate`, `applyComposedChainSeeds`, `composedScopeRead`,
`applySharedSeeds`). An `async function` returns a promise whatever its body
does, so this one call yields the statement the handler needs, and the row cannot
be placed at the write however sync the renderer is.

**It is async by signature, not by work.** On the witness's path the pass does
nothing that waits:

- The pass is installed at all because of `rootsWidget === true`, not because of
  seeds. `packages/bundler/src/transform.ts:750` gates the install on
  `record.rootsWidget === true || Object.values(record.initialValueKinds ?? {}).includes('shared-seed')`,
  and `CcrRoot` in `ccr-widget.tsrx` roots the `ccr` widget. So the module is
  loaded and the pass runs, to file the widget-instance token that `CcrItem`'s
  `el={c.dayEls}` handle mints its id from.
- With the token filed, `applySharedSeeds` returns at
  `if (!child || seeds.length === 0) return;` — its only `await`s
  (`context.loadSymbol`, then the loaded factory) are behind that guard.
- `fileBoundElementHandles` in `fns/element-handle-roster.ts`, the other
  forbidden file the pass calls, is a plain synchronous function with no `await`
  anywhere in its module. It is not a blocker.

So the fix is five `async` keywords and their `await`s in one file, converted the
same way the renderer was, plus the same `Awaitable` return type on
`SharedSeedPass` in `prerender/shared-seed-slot.ts` (in contract, not yet
changed — it would be a type-only edit with nothing behind it).

## What is deliberately NOT done here

Left untouched, because none of it can be proven to reach the sync path until the
seed pass can answer without yielding, and half-converting the server render path
buys nothing while adding a diff to review:

- `evaluatePrerenderDataComponent` and `renderRowComponentEdge` in
  `prerender/evaluator.ts`.
- The awaited dynamic imports in `fns/row-component-mint.ts` and its `rows()`
  return type.
- The `settledMint()` branch in `resume-keyed-repeats.ts`. This one is also worth
  leaving alone on its own account: that file is inside the 20,983-byte
  static-closure wall, and spending bytes there for a path that still refuses is
  a straight loss.
- The four witness pins in `browser/computed-collection-rows`. They stay
  `test.fails` because they still fail. Flipping them would have turned a
  truthful red into a false green.

## The blocked question

May `packages/web/src/fns/shared-seed.ts` take the same `Awaitable` conversion the
renderer just took — `seedProjectingChild` and its four helpers dropping `async`
in favour of the `then`-or-continue spelling, so the pass answers with a seed map
directly when nothing had to be loaded? Nothing about what it computes changes,
and every caller keeps awaiting it.

With that granted, the rest is inside the existing contract and mechanical: the
evaluator's two functions, `row-component-mint`'s dynamic imports held in a
module-level slot once loaded, `rows()` becoming `Awaitable`, and
`settledMint()`'s unrowed-key branch asking the mint to try synchronously
instead of refusing outright. Registration stays in the flush behind, exactly as
now.

If instead that file must stay untouched while its owning unit is live, this one
should be re-cut after that unit lands rather than worked around: the only
workaround is a second seed pass spelled beside the first, which is the same
semantics written twice and drifting from the day it lands.
