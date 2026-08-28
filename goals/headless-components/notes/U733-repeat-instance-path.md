# Two panels over one collection each mint their own fourth row

`MARKLESS_REPEAT_ROW_COMPONENT_WIDGET_COLLISION` is fixed at its cause, and two
further defects the collision was hiding are fixed with it. Two family roots
over ONE page-level collection now each add their own row, on CSR and on SSR,
and each row reads the panel it stands in.

## The record now carries the repeat's own path

A minted row's identity is a segment, `r:<key>:`, and `rowSegmentOf` built it
from `enclosingInstancePath + rowKey` where the enclosing path was the
COLLECTION's. A `@for` projected into two panels reads one page-level cell, so
that path is empty for both renderings and both panels minted the segment
`r:d:`. `mergeMintedWidgetRoots` then saw the right panel file a widget root for
an id the left panel's row had already claimed, and refused it.

`ProtocolViewPayload['keyedRepeats'][number]` gains one optional field:

```
instancePath?: string
```

It is the graph instance path of the component that AUTHORED the `@for`, in the
same `c<n>:`/`p<n>:` grammar `componentEdgeInstancePaths` spells. Only
composition writes it — `marklessCsrRemapChildKeyedRepeat` in
`packages/web/src/fns/composition.ts` returns `instancePath + repeat.instancePath`
and the two `packages/web/src/fns/ssr.ts` sites that build a composed record put
it on. `packages/serializer/src/protocol-validation.ts` refuses a non-string.

**No compiler source changed, and no emitted byte moved.** The compiler emits a
module's own repeats, and a module authoring a `@for` stands at no instance, so
the field is always absent at emission — pay-per-use, exactly like `rowTemplate`
and `rowComponent`. Every same-module child is composed at render time too: the
rop page's `RopRows` repeat is emitted as `repeat:0` and becomes `c1:repeat:0`
and `c3:repeat:0` only once composition has run. The compiler and bundler
fixtures are byte-identical because nothing in the emit path was touched;
`packages/web/test/event-only-resume-closure.test.ts` passes at its untouched
limits, and `fns/row-component-mint.ts` is outside the eight governed closures.

`rowKeyInstancePath` in `packages/web/src/fns/row-component-mint.ts` prefers the
record's path and falls back to the collection's, so a repeat that ships no path
keys its rows exactly as it did before.

## Two defects the collision was hiding

Flipping the segment made both panels' rows refuse as
`MARKLESS_REPEAT_ROW_COMPONENT_WIDGET_UNRESOLVED` — the failure U691 recorded
when it tried widening the anchor, and the reason it read as an anchor problem.
It is not. Measured on the witness page, the mint logged both renders STARTING
before either composed a definition:

```
START r:c1%3Ap2%3Ad:
START r:c3%3Ap4%3Ad:
compose r:c1%3Ap2%3Ad:c0: -> shared:...#ropPanel   (bare: unresolved)
compose r:c3%3Ap4%3Ad:c0: -> shared:...#ropPanel   (bare: unresolved)
```

**The enclosing widget roots live in one module-level scope.** A row render is
async whenever a symbol has to be fetched, and `marklessWithEnclosingWidgetRoots`
installs the roots for the length of that render. Two repeats minting in one
tick overlap their windows: the second install wins, and whichever settles first
restores the scope out from under the other. The `rowSegment` guard on the scope
is what made this visible — with both panels spelling `r:d:` the guard could not
tell the two renders apart, so the first row silently read the second panel's
roots and the mismatch surfaced as a collision instead. `oneRowRenderAtATime` in
the mint queues renders so each row's window is its own; a warm render never
queues.

**The mint's prepared-row map was keyed by row key alone.** `rows()` reset one
shared map per call and `mintRow` read it by key, so the second repeat's `rows()`
wiped the first's and both panels then took the row the second built — the left
panel showed a fourth row reading `right`. The map is now keyed by repeat id
first.

Both are ordinary concurrency defects of the mint, not of the family or of any
`.tsrx`.

## The witness

`packages/vitest-browser/browser/repeat-owner-path/rop.test.ts`: 5 passed, 0
expected-fail (was 3 passed / 1 expected-fail). The pinned row **"CSR: two
panels over one collection each mint their own fourth row"** is flipped green
and now also asserts every right-panel row reads `right`; an SSR row asserting
the same after resume was added beside it. The file's doc comment no longer
names a pin.

`packages/vitest-browser/browser/item-collections` and
`packages/vitest-browser/browser/taglist-form-value`: 70 passed together.
`--project node packages/serializer packages/compiler packages/web`: 350 files,
2661 passed / 1 expected fail. `pnpm typecheck` clean.

`packages/serializer/test/protocol.test.ts` gains one row pinning that the field
round-trips, that a root-authored repeat omits it, and that a non-string is
refused at the payload boundary.
