# A count that is resolved after the render can be printed, never spent

U722 shipped a roster count that answers exactly when it is written as text or
as an attribute value, and wrongly when it is spent in arithmetic or a
comparison, with nothing refusing the second shape. This card measured whether
the count can be made a NUMBER before the asker renders, found that it cannot
without a seam this contract does not hold, and landed the refusal instead.

**(b) landed. (a) did not, and the reason is a named seam, not a shrug.**

## Why the count cannot be a number in time

Three routes were measured, in the order the card named them.

**A pre-pass over the composed view.** The count is answered from
`surface.view.elementHandles` — one registration per part that ended up in the
roster — and those are filed by composition, in `packages/web/src/fns/ssr.ts`
(`marklessWidgetHandleId` at its two composition sites) and
`packages/web/src/fns/composition.ts`. **Neither file is in this contract**;
composition.ts is U735's. That is the blocked seam the packet asked to have
named.

Scope is not the only wall, and not the deciding one. A pre-pass is also not
SUFFICIENT, for the reason U722 already recorded and this card re-confirmed
against the witness: the root asking `ui-max` renders before its members, so a
forward pass could in principle answer it, but a PART asking "2 of 5" renders in
the MIDDLE of the members it is counting. `IcItem` in
`packages/vitest-browser/browser/item-collections/ic-widget.tsrx` is exactly
that asker. One mechanism has to serve both, and no forward walk serves the
second.

**Render-then-patch, re-evaluating the dependent bindings.** By the time the
placeholder exists, `step >= total - 1` has already collapsed to a boolean and
the attribute is either present or absent in a serialized string. Nothing in the
surface records that the attribute derived from the count. Re-printing it means
the render body must DEFER every expression that transitively reads a count into
a thunk, and count reads inside those thunks must be lowered to a context call
rather than to the `const` (a closure cannot be rebound after composition). That
is a compiler emission change to attribute and text printing, a defer registry on
the render context, a splice pass, plus a second implementation in
`prerender/evaluator.ts`, which builds the CSR surface from the payload by a
different mechanism. It fits this contract's files. It does not fit one unit.

**A second full render pass.** `renderSsrOutput` (`render-to-string.ts`) already
awaits the whole render before resolving counts, so a second pass with the tally
in hand is mechanically available and would cost nothing on a page that asks no
count (`positions.counted` says which). It was rejected on semantics, not bytes:
the second pass re-runs the page's own render, including every awaited resource,
so a count-bearing page would fetch its data twice. Doubling a page's server-side
side effects to answer a number is not a trade this card will make silently.

## What landed: the count is printable, not spendable

`collectElementRosterCounts` now refuses the spend by name, in
`packages/compiler/src/passes/semantic-graph/roster-count.ts`:

```
MARKLESS_ROSTER_COUNT_NOT_A_NUMBER: Cannot spend the roster count "total" in a
"-" operation ("total - 1") in IcRoot: at server render the count is a
placeholder the renderer resolves once the page has composed, so only a bare
read printed as text or as an attribute value carries it.
```

The rule is drawn at RENDER time and by POSITION, not by name:

- **Admitted** — the bare read as a whole attribute value (`ui-max={total}`), as
  a whole text interpolation (`{total}`), and as one `${}` slot of a template
  literal (`` `${pos + 1} of ${total}` ``). A template slot is transparent: the
  count is stringified into the text either way, and the resolver answers a
  delimited run wherever it sits, so the surrounding literal text is not a spend.
- **Refused** — arithmetic and comparison (`total - 1`, `step >= total - 1`), a
  property read, a call or call argument, a conditional test, a composite, a
  local carrying it forward (`const carried = total`), and a second `computed()`
  reading it — including one that only forwards it, because that publishes a
  SECOND binding holding the placeholder and nothing downstream knows to resolve
  that one.
- **Untouched** — every read inside a handler. By the time one runs the count is
  a number in the graph, so `w.seen = total - 1` in an `onClick` is right and
  stays legal. The refusal is decided by the nearest enclosing function before
  any operation is judged, which is what keeps an assignment inside a handler
  from reading as an assignment spend.

Two implementation facts worth keeping. The walk needs its own child enumeration:
`childNodes` skips `openingElement`, and an attribute expression is only
reachable through it — which is where a count is usually spent, so the first
version of this guard saw nothing at all in markup and passed both arithmetic
fixtures. And identity is resolved through yuku's symbol table, not by name, so
a shadowing local named `total` is not the count.

## Witness

`packages/vitest-browser/browser/item-collections/` is **80 passed, 2
`test.fails`** across `item-collections` and `single-component-family` (the two
`test.fails` are the pre-existing `@if` arm rows, untouched by this card).

Eight new rows pin "2 of 5" as a live shape, CSR and SSR, at first paint and
after add and remove: `IcItem` now derives its own count and prints
`` ui-label={`${pos + 1} of ${total}`} ``, and `IcRoot` prints `` `of ${total}` ``.
That is the asker in the MIDDLE of its roster and the asker BEFORE it, both
exact, both answered by the served page rather than by the render. Two instances
on one page print their own numbers and not each other's.

`packages/compiler/test/render-order-ordinal/roster-count-spend.test.ts` is 8
rows: the three admitted printed shapes, `total - 1` in an attribute,
`step >= total - 1` (tour's forward-trigger gate verbatim in shape), a dependent
`computed`, a forwarding `computed`, a carried local, a handler spending it
freely, and a plain computed doing the same arithmetic with no refusal — the
guard is keyed to the count, not to the shape of the expression.

The refusal names the INNERMOST operation the count reaches. For
`step >= total - 1` that is the `"-"`, which is the one the author has to move;
the comparison around it is only wrong because the subtraction is.

## Bytes

**Nothing moved.** The guard is a diagnostic: it emits no code, and
`packages/compiler/test/__snapshots__/emit-byte-equality.test.ts.snap` is
unmodified. The witness fixtures are test-only.

**One bundler anchor is red and was red before this card.**
`music-player-csr-budget.test.ts` `page-load download` measures **137,886 gzip
across 108 chunks against anchor 137,243 + 128 = 137,371**. Measured on the
untouched pilot tip (03f36609, this card's work stashed) it is **137,886 across
108 chunks** — the same number to the byte. It is not this card's overrun and no
anchor was restated.

## Verification

- `pnpm typecheck` — clean.
- `pnpm exec vitest run --project node packages/compiler packages/web packages/bundler`
  — 407 files, 3,100 passed, 1 expected fail, 1 failed: the pre-existing CSR
  budget row above.
- `pnpm exec vitest run --project browser packages/vitest-browser/browser/item-collections packages/vitest-browser/browser/single-component-family`
  — 2 files, 80 passed, 2 expected fail, exit 0.

## What the next card owns

1. **The deferred-binding render-then-patch**, if the arithmetic shape is wanted
   back. It needs `render-body.ts` to wrap count-dependent expressions in thunks,
   a defer registry on the render context, a splice in
   `marklessResolveRosterCounts`, and the CSR twin in `prerender/evaluator.ts`.
   Boolean attributes need the whole attribute deferred, not just its value:
   presence is the value.
2. **The cross-component spend.** The guard sees one component. A count passed
   down as a prop (`<Child max={total} />`) and spent in the child is not caught,
   because the compiler does not follow a prop into another module's arithmetic.
   Printing it in the child is fine; spending it there is the same silent wrong
   number, unrefused.
