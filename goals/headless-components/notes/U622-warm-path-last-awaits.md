# The last two awaits: one is converted, the other two are owner questions

The ancestor-widget holder now answers with a value when the render inside it
does. Neither of the two things the goal asked for after that can be delivered
inside this unit's file contract, and both refusals are measured rather than
argued.

## What landed

**`packages/web/src/fns/instance-scope.ts` — `marklessWithEnclosingWidgetRoots`
drops `async`.** It takes the `marklessSettled` / `Awaitable` spelling the
renderer, the seed pass and the evaluator use: install the roots, call the
render, release on the sync edge, the resolved edge and the rejected edge. The
one edge `marklessSettled` cannot see is a render that throws where it stands,
before it ever produces a value, so the call sits in a `try` whose `catch`
releases and rethrows — leaving the roots installed there would hand one row's
ancestors to whatever rendered next.

Every caller keeps awaiting it, so nothing about what it holds or when it
releases changes. `+422` source bytes in a file no governed closure reaches
(measured below).

**`packages/web/test/warm-path-last-awaits/enclosing-widget-roots-holder.test.ts`
(new)** pins the holder directly, without going through the evaluator: a warm
render answers without a promise, a waiting one still answers with what it
rendered, and the roots are gone again after a sync answer, a resolved promise,
a rejected promise and a synchronous throw. The only view of the installed state
is `marklessComposedGraphNodeId`, which resolves a row-local `shared:` id against
the ancestors standing above it, so the test reads the mechanism rather than a
private field.

## Blocker 1: the holder is converted and the warm path is still async

`packages/web/src/prerender/evaluator.ts:1046`, inside `renderRepeatRowComponent`:

```ts
return marklessWithEnclosingWidgetRoots(rowSegmentOf(input), input.enclosingWidgetRoots, () =>
    Promise.resolve(renderRowComponentEdge(input)),
);
```

`Promise.resolve(x)` is a promise whatever `x` is, so the holder is handed a
thenable and answers with `.then(...)` however warm the render was. The
`Promise.resolve` was correct when the holder's parameter type was
`() => Promise<T>`; it is now the whole remaining delta.

Measured, not inferred, with the conversion in the tree:

- `packages/web/test/warm-rows-at-write/warm-rows-at-write.test.ts` — 3 passed,
  **1 expected fail**. The red row is still "a row inside a live widget answers
  without a statement". It was red before the conversion for the holder's
  `async`, and it is red after it for this wrapper.
- `packages/vitest-browser/browser/computed-collection-rows` — 2 passed,
  **4 expected fail**, unchanged. So the four pins this unit was to flip to plain
  `test` were NOT flipped: the row is still not placed at the write, and a green
  pin over a red mechanism is worse than the red one.

`renderRowComponentEdge` is module-private, so no caller inside the contract
(`fns/row-component-mint.ts` included) can reach past the wrapper.
`packages/web/src/prerender/**` is forbidden to this unit.

**Question:** may `renderRepeatRowComponent` drop the `Promise.resolve` and pass
`() => renderRowComponentEdge(input)` straight through? The prologue that can
throw is already inside the surrounding `try`, which answers with
`Promise.reject`, so the rejection shape `row-component-render.test.ts` and
`keyed-repeat-row-component.test.ts` pin is unchanged. It is a one-line edit and
both suites above go green the moment it lands.

## Blocker 2: holding a fetched symbol costs served bytes

The bundler's emitted `loadSymbol` can hold what it fetched — the patch is
straightforward and was written, measured, and then reverted, because it moves
served bytes and the goal says served bytes are unchanged.

Shape (in `packages/bundler/src/source-module.ts`, both loader spellings —
`emitDirectSourceSymbolLoader` for a table at or under
`SMALL_SYMBOL_DIRECT_LOAD_LIMIT` and the resolver-delegating `emitLoadSymbol`
fallback above it):

```js
const marklessHeldSymbols = new Map();
function marklessHoldSymbol(symbolId, answered) { /* set on settle, return as-is */ }
function loadSymbol(symbolId) {
	if (marklessHeldSymbols.has(symbolId)) return marklessHeldSymbols.get(symbolId);
	if (symbolId === "…") return marklessHoldSymbol(symbolId, import("…").then(…));
	…
}
```

**Cost, counted from the emitted text:** 320 bytes for the store and its setter,
82 for the guard line, and 30 per symbol row for the wrapping call — so
`402 + 30 × symbols` raw source bytes added to every source module and every
resume module that emits a symbol loader. An eight-symbol page pays 642.

**What it broke, measured by running `packages/bundler/test` with the patch in
and with it stashed:** 12 failures at the merge base (the music-player CSR/SSR
budget pair, `self-route-recursion` ×3 on an unrelated headless `tree` scenario
compile error, `doctrine-guard`, `dense-async-symbol-table`, `fixture-builds` ×2
— the baseline noise this goal already knows about), and **15 with the patch**.
The three new ones are all emitted-byte pins, and they are the served-byte wall
speaking:

- `packages/bundler/test/rolldown.test.ts > transformTsrxModule keeps compact
  resolver loading for larger symbol tables` — asserts the emitted text contains
  `return marklessSymbolResolverModule().then((mod) => mod.loadSymbol(symbolId));`
  verbatim.
- `packages/bundler/test/rolldown.test.ts > browser-trigger prerender pages keep
  their resume emission byte-identical` — snapshot.
- `packages/bundler/test/render-data-type-strip.test.ts > every virtual module a
  TypeScript-free source emits stays byte-identical` — snapshot.

All three live in `packages/bundler/test/**`, which IS in this unit's contract,
so updating them was mechanically possible. It was not taken: they exist to catch
exactly this drift, and re-baselining a served-byte pin to fit a change is the
move the goal's own blocked permission names.

**The obvious alternative is worse.** Holding could live in `@markless/web`
instead, wrapping the loader once where the runtime receives it — zero emitted
app bytes. But the closure wall's anchor is `resume-runtime.ts`, and it stands at
**20,970 against a 20,983 limit: 13 bytes of headroom**, nowhere near what a hold
map and its setter need. That route breaks the wall instead of the snapshots.

**Question:** which does the goal want — `402 + 30 × symbols` raw bytes per
emitting module with three byte-identity pins re-baselined, some other site for
the hold, or the hold dropped?

## Blocker 3 (answered, not a question): no primer warms the day-row symbol

The goal asked to verify that the focus-primed / pointer-primed preloads make
the calendar's day-row symbol warm before the first gesture. **Neither does, and
the miss is structural rather than a bug in either primer.**

Both primers are one function, `preloadSymbolsFor` in
`packages/web/src/resume-events.ts:189`. It walks from the primed element up to
the container, and for each element reads `eventRecords.get(element)` — the
DISPATCH records — then fetches `record.symbolIds` for the event names the
primer cares about (`focusin` → the focus-preload key events; `pointerover` →
`PRESS_EVENT_NAMES`). Every id it can ever fetch is an id some element's event
record names.

The symbol the witness waits on is not one of those. `CcrItem`'s derived symbol
is asked for by the evaluator at `packages/web/src/prerender/evaluator.ts:612`,
walking `definition.initialValues` for entries whose value kind is
`symbol-function` — a component's own derive, named by its state payload, bound
to no element and no event. It appears in no `eventRecords` entry, so both
`focusPreload` and `pressPreload` walk straight past it.

So the honest answer to "which primer misses it" is: both, for the same reason —
the primers preload HANDLER symbols, and a row component's derive is not one.
Making the emitted loader hold what it fetched would still help every ask after
the first (and every later gesture, and rows 2..n of the same batch), but on this
witness the first gesture is also the first fetch, so holding alone does not turn
rows 1 and 2 green either. Warming a row component's derive before the gesture
would need a primer that reads the repeat's row-component record rather than an
event record — a separate piece of work, and one nothing in this unit's contract
could carry.

## Measurements

- `pnpm typecheck` — clean.
- Closure walk, with the conversion in the tree (probe built from
  `event-only-resume-closure.test.ts`, run, and removed):
  `resume-runtime.ts` **20,970**, `resume-keyed-repeats.ts` 20,960,
  `resume-branches.ts` 20,909, `resume.ts` 19,277, payload 18,071, event-only
  2,961. The 20,983 wall holds; `fns/instance-scope.ts` is in none of these
  closures, which is why its +422 moves nothing.
- `packages/compiler/test/emit-byte-equality.test.ts` passes: served bytes
  unchanged, which is true of the tree as it stands precisely because the
  bundler patch was reverted.
