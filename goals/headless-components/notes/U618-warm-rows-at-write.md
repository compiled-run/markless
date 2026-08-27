# The warm row path is sync end to end, except one async holder in a file this could not reach

The seed pass, the evaluator, the mint's dynamic imports, the symbol loader and
the write-side placement are all converted. A component row's render now answers
with a value when nothing had to be waited for. The witness still fails, and the
reason is measured rather than argued: one `async function` sits between the
mint and the render, in `packages/web/src/fns/instance-scope.ts`, which is
outside this unit's file contract.

## Measured on the witness, at the gesture

`browser/computed-collection-rows`, CSR row 1, probing every step of the mint
between the write and the row (probe removed before landing; the numbers are
what it printed):

```
surface:sync      the render-data thunk, primed at wiring
enclosing:sync    fns/instance-scope loaded, roots resolved
roots=1           the row stands inside one live widget - the holder IS taken
seedpass:sync     fns/shared-seed, converted here
derived:CcrItem:async    <- the app's emitted loadSymbol, first fetch
staged:CcrItem:sync
rsd:CcrItem:sync         the ssr-data renderer, converted in U615
edge:async               renderRowComponentEdge's whole answer
mint:async
```

Everything this unit owns answers `sync`. Two things do not, and both live
outside the contract:

1. **`marklessWithEnclosingWidgetRoots`** (`packages/web/src/fns/instance-scope.ts:643`)
   is `async`, so it hands back a promise however warm the render inside it is.
   It is taken whenever the row stands inside a live widget — `roots=1` above —
   which is every row of every family that roots a `shared({scope:'widget'})`.
   `packages/web/test/warm-rows-at-write/warm-rows-at-write.test.ts` pins this as
   a `test.fails` row: the same render answers **without** a promise when
   `enclosingWidgetRoots` is empty and **with** one when it holds a single root.
   That is the whole delta, isolated in a node test.

2. **The app's emitted `loadSymbol`** hands back a promise per call, so a symbol
   the document fetched at first paint still costs the row a statement. This unit
   holds the settled value from the mint's side (`settledSymbol` in
   `fns/row-component-mint.ts`), which makes every row after the first — and
   every later gesture — read it where it stands. The FIRST fetch of a symbol
   still yields, and only the emitter can fix that: the loader is written by the
   bundler into the app's own resume module.

Fixing (1) alone does not turn the witness green, because the witness's first
gesture is also its first mint and hits (2). Fixing both does.

## What landed

- **`packages/web/src/ssr-data/awaitable.ts`** (new): `marklessThen`,
  `marklessSettled`, `marklessIsThenable` — lifted verbatim out of the renderer
  where U615 wrote them — plus `marklessWalk`, an index-resuming sequential loop
  for the `for ... await` shapes the conversions replace. The renderer now
  imports them rather than owning them; three files needed the same three shapes
  and a fourth copy would have been the fourth place to fix a bug in them.
- **`fns/shared-seed.ts`**: `seedProjectingChild` and its four helpers
  (`seedEdgeAndOwnTemplate`, `applyComposedChainSeeds`, `composedScopeRead`,
  `applySharedSeeds`) drop `async`. Ordering is preserved exactly:
  `projectedEdges` is still computed AFTER the root edge seeds (it reads the
  branch arm the render will take), and `applyComposedChainSeeds` still carries
  its owner props/prefix/edge forward one link at a time.
- **`prerender/shared-seed-slot.ts`**: `SharedSeedPass` returns `Awaitable<...>`.
- **`prerender/evaluator.ts`**: `evaluatePrerenderDataComponent`,
  `renderRowComponentEdge`, both `renderChild` callbacks and
  `renderRepeatRowComponent` take the same spelling. `renderRepeatRowComponent`
  skips the enclosing-roots holder entirely when there is nothing to hold, so a
  row outside every widget is already sync today.
- **`fns/row-component-mint.ts`**: the evaluator and instance-scope namespaces
  are held in module slots once loaded and both are fetched when the repeat
  wires, not when a gesture needs them; the render-data surface is held the same
  way; `rows()` is `Awaitable`; `settledSymbol` holds resolved symbols per
  loader. Rows built but not yet registered accumulate, so a repeat asked to
  build twice before its flush cannot drop the first batch's registration.
- **`resume-keyed-repeats.ts`**: `settledMint()`'s unrowed-key branch now ASKS
  the mint instead of refusing. A `rows()` call that answers with a function is
  a row set built at the write: it applies immediately, and the commit it
  returns is held for the flush behind, where registration has always happened.
  A call that answers with a promise is held too, so the flush uses it rather
  than rendering a second time. `settle` waits on that promise as well as on the
  module load.

## Two shapes preserved deliberately

**A refusal is still a rejection, not a sync throw.** Both
`renderRepeatRowComponent` and `rows()` catch what their synchronous prologue
throws and answer with `Promise.reject`. `row-component-render.test.ts` and
`keyed-repeat-row-component.test.ts` pin the rejection shape, and a sync-capable
function that throws where it used to reject would have broken every caller's
error handling for the sake of a path that is not the warm one.

**Registration stays in the flush behind.** A row placed at the write is
registered by the same single call site as before, one flush later.

## Byte walls, measured

- `event-only-resume-closure.test.ts` wall is 20,983 source bytes and the binding
  closure here is `resume-keyed-repeats.ts` alone (all its imports are types).
  It was 20,626 before this unit and is **20,960** after: the write-path logic
  cost 437, and 103 were paid back by tightening two comments that this change
  made stale (the `settle` note now says it waits on a late render as well as a
  load; the flush-ordering note dropped a line that said a component row always
  renders before the apply, which is no longer true). No semantics were trimmed
  to fit, and nothing was moved out of the file.
- `packages/compiler/test/emit-byte-equality.test.ts` passes: served bytes are
  unchanged, as they were for U615's renderer conversion.

## Suites

- `pnpm typecheck` — clean.
- `packages/web/test`, `packages/runtime/test`, `packages/serializer/test`,
  `emit-byte-equality` — 100 files, 720 passed, 1 expected fail (the
  instance-scope receipt above).
- The 14 browser lanes named in this unit's verification — 18 files, 132 passed,
  4 expected fail. The 4 are the witness pins, still red, still truthfully
  pinned: they were NOT flipped to `test`, because the row is still not placed at
  the write and a green pin over a red mechanism is worse than the red one.
- `vp lint --deny-warnings` — 0 warnings, 0 errors.
- ui lane select/tree/toaster/checklist/navbar/menu — 308 passed, 2 expected
  fail, and one expected-fail-PASSED that is baseline noise, not this change:
  `checklist.browser.ts > CSR: a mounted error marks the group invalid, written
  after the items or before them` fails the same way on the merge base with this
  unit's diff stashed (measured both ways). It is a stale `test.fails` pin in a
  family file this unit may not edit.

## The blocked question

May `marklessWithEnclosingWidgetRoots` in `packages/web/src/fns/instance-scope.ts`
take the same then-or-continue spelling — installing the roots, calling the
render, and releasing them on both edges via `marklessSettled` instead of
`try/await/finally` — so it answers with a value when the render inside it does?
Nothing about what it holds or when it releases changes; every caller keeps
awaiting it. It is a ten-line edit, and
`packages/web/test/warm-rows-at-write/warm-rows-at-write.test.ts`'s last row goes
green the moment it lands.

And, separately, may the bundler's emitted `loadSymbol` hold the namespace it has
already fetched, so a second ask answers with the symbol rather than a promise of
it? Without that, the first gesture that mints a row still waits once — which is
exactly what the witness's rows 1 and 2 measure.
