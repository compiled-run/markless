# A component row cannot be built at the write while its html comes from `renderSsrData`

The refusal is now asked per repeat and per written collection, which is the
half of this unit that lives inside its contract and is landed. The other half —
building a row for a key that has never been rowed, inside the handler's own
statement — needs `packages/web/src/ssr-data/renderer.ts` to be able to answer
synchronously, and that file is outside this unit's contract and named in its
forbidden moves. That is the blocked question at the bottom.

## The witness moved since U609

U609 recorded `browser/computed-collection-rows` as 4 red of 6, with rows 5 and
6 passing. On this unit's base — `feat/headless-ui-pilot` merged in, before any
edit of mine — it measures differently:

```
✓ CSR: a page key across a computed-backed month lands focus on the day it wrote   (test.fails, correctly failing)
✓ SSR: a page key across a computed-backed month lands focus on the day it wrote   (test.fails, correctly failing)
× CSR: the handler reads the rewritten 42 keys off the plural handle               (test.fails, now PASSES)
× SSR: the handler reads the rewritten 42 keys off the plural handle               (test.fails, now PASSES)
× CSR: a second crossing keeps the tab stop with the keyboard                      (test, fails)
× SSR: a second crossing keeps the tab stop with the keyboard                      (test, fails)

Tests  4 failed | 2 expected fail (6)
```

Two things changed. Rows 3 and 4 — 42 keys present, first key `2026-08-30`,
exactly one `tabindex="0"` and it is on `2026-09-14` — now hold. The rows DO
arrive and the roving tab stop IS correct once the flush lands, so the async
mint and everything downstream of it are right. Rows 5 and 6 now fail: the
second `PageDown` never reaches the grid, and the title stays at `2026-09`.

Those two facts are the same fact. `tabindex` is driven by the `isFocused`
computed and needs no focus call; `document.activeElement` needs one. In
`ccr-widget.tsrx` the handler ends

```ts
const target = minted.find((day) => day.getAttribute('value') === next);
s.landed = target ? 'found' : 'missing';
target?.focus();
```

`minted` is the plural `element()` handle read on the statement after the write.
It still answers the pre-write grid, so `target` is `undefined` and **`focus()`
is never called at all**. Focus stays on the day button of a month that has been
replaced, the browser drops it to `<body>` when that row detaches, and the next
page key reaches nothing. That is why rows 5 and 6 fail.

This kills U609's option 2 as a route to green. A focus replay that holds a
requested focus until the row attaches has nothing to hold: no focus was ever
requested. Only the handler seeing the new rows on its next statement fixes
rows 1, 2, 5 and 6.

## Landed: the refusal is per repeat and per collection, not per page

`settledMint()` in `packages/web/src/resume-keyed-repeats.ts` tested the loaded
module (`cell.mint.rows`), so every repeat on a page carrying any component row
was refused. It now asks the repeat, and then asks the written collection:

```ts
if (!builds) return { mint: undefined };
if (!cell?.mint) return undefined;
if (repeat.rowComponent)
	for (const item of readKeyedRepeatCollection(input.graph, repeat))
		if (!rowRootsByKey.has(repeatItemKey(item, repeat))) return undefined;
return { mint: cell.mint };
```

Spelled inline rather than as a helper on purpose: `packages/web/src/resume-keyed-repeats.ts`
is inside the on-demand resume closure that `event-only-resume-closure.test.ts`
walls at 20,983 source bytes, and the first spelling of this - a named
`unrowedKey` with a doc comment - measured 21,300 and failed that test. Bytes
are back under the wall.

Two refusals go away, both of them measured in
`packages/web/test/component-rows-at-write/`:

- A **template** repeat beside a component row builds its rows from markup and
  waits for nothing. The calendar's `cal.weekdays` was refused for the day
  grid's sake. Weekday names do not move, so nothing measured it before; the
  test does now.
- A **component** repeat whose written collection needs no row built is placed
  at the write. `rowRootsByKey` keeps a departed key's row, so a pure reorder, a
  row dropped, and a crossing back to a month already drawn all qualify —
  `applyKeyedRepeatRowOrder` calls `mintRow` only for a key with no row root, so
  in these cases the mint is never reached. The flush behind it then finds the
  rows placed and returns, and `mint.rows()` is not called at all: one apply, no
  render.

The last test in that file pins the fallback that is still standing — a
component repeat needing a key it has never rowed leaves the served rows alone
until the flush — so whoever lands the synchronous path turns a red assertion
rather than editing a green one.

## Why the rest needs a file outside the contract

A row for an unrowed key means `rendered.html`, and that html has one producer:
`renderRepeatRowComponent` in `packages/web/src/prerender/evaluator.ts`, reached
from `mintComponentRow` in `packages/web/src/fns/row-component-mint.ts`. Making
it answer synchronously in the warm case means removing every `await` on the
warm path. Walking the chain:

`renderRowComponentEdge` (evaluator.ts:1031) awaits the shared-seed pass, and —
only when the row's component is given projected children — `renderSsrData`. The
witness and the calendar both spell `<calendar.item value={day} />` with no
children, so the projection branch is not on their path and could keep the async
spelling.

`renderRowChild` → `evaluatePrerenderDataComponent` (evaluator.ts:494) is on
every path. Its awaits are `input.loadSymbol` and the derive it returns,
`registerPrerenderStagedComputeds`, and then, unconditionally:

```ts
const rendered = await renderSsrData({ renderData, idPrefix: input.idPrefix, ... });
```

`renderSsrData` is `packages/web/src/ssr-data/renderer.ts:375`, and it is async
all the way down: `renderChunk` (line 400) awaits `renderSlot` (line 454), which
awaits `input.read`, `input.seedChild`, `input.renderChild`,
`input.selectBranchArm`, `input.selectAsyncArm`, a recursive `renderChunk` per
arm and per dynamic-tag body, and a `Promise.all` over repeat rows (line 593).
Every one of those inputs is already resolved in the warm case, but that does
not help: an `async function` hands back a promise whatever its body does, and
an `await` on an already-resolved promise still yields the statement the handler
needs. There is no second, synchronous renderer in the tree to call instead.

So the synchronous path runs through `packages/web/src/ssr-data/renderer.ts`,
which this unit's forbidden moves name as owned by another live unit. Writing a
second chunk walker inside `prerender/` to avoid touching it would be the
renderer's semantics spelled twice, drifting from the day it landed, and is not
something to improvise.

## The blocked question

May `packages/web/src/ssr-data/renderer.ts` become sync-capable — its internal
`await` chain rewritten in an `Awaitable<T>` combinator style, so
`renderSsrData` returns a `RenderSsrDataOutput` directly when every input it is
handed answers synchronously, and a promise otherwise? Nothing about its output
or its callers' async spelling changes; only the ability to finish without
yielding when there is nothing to wait for.

If that is granted, the rest follows inside this unit's existing contract and
is mechanical rather than novel:

- `evaluatePrerenderDataComponent` and `renderRowComponentEdge` in
  `prerender/evaluator.ts` take the same combinator treatment on the warm path,
  falling back to the async path wherever an input answers with a promise (a
  cold `loadSymbol`, a projection, an async boundary inside the row).
- `mintComponentRow` in `fns/row-component-mint.ts` must stop awaiting
  `import('../prerender/evaluator.ts')` and `import('./instance-scope.ts')` on
  the warm path — a resolved dynamic import still yields — by holding the loaded
  namespace in a module-level slot once the first load has settled.
- `rows()` becomes `Awaitable`, and `settledMint()`'s `unrowedKey` branch asks
  the mint to try synchronously instead of refusing outright. Registration stays
  in the flush behind, single-sourced, exactly as now.

Two smaller answers, if the whole conversion is judged too large for one unit:
the compiler could emit a `rowTemplate` alongside `rowComponent` for a row whose
component reduces to markup (a compiler emission change, also outside contract),
or the witness stands red and the calendar's grid keeps its post-flush tab stop
without its focus. Neither makes `<calendar.item value={day} />` work as
written.

## What is green here

`packages/web/test/component-rows-at-write/` (5 rows) and
`packages/web/test/rows-mint-at-write/` (8 rows) pass together. The witness pins
were left exactly as U609 wrote them: rows 3 and 4 pass under a `test.fails`
pin, which is a stale pin rather than a regression, and rows 5 and 6 fail on the
base commit before any edit of mine. `browser/computed-collection-rows` is red
at HEAD for that reason and stays red until the synchronous render lands.
