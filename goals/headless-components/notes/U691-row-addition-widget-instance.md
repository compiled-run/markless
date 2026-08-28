# Adding a row to a repeat that was projected into a family root

`MARKLESS_REPEAT_ROW_COMPONENT_WIDGET_UNRESOLVED` is fixed at its cause. A
consumer's `@for` written inside a family root's children can now add a row
after resume, and the row's parts read the same family instance the served rows
read. Removing a row already worked; adding one was refused.

## What the refusal actually was

The mint asked one question to find the widget instance a new row stands in, and
the question only has an answer when the family owns the collection.

`enclosingWidgetsFor` (`packages/web/src/fns/row-component-mint.ts`) took its
anchor from `repeat.collectionGraphNodeId` — the graph node the repeat iterates —
and handed that to `marklessEnclosingWidgetRoots`, whose walk chops instance-path
segments off the right. Measured on the mutating witness page, the whole record
the mint gets is page space:

```
collectionGraphNodeId  state:rows
parentHostNodeId       h1
rowComponent           { componentEdgeId: component-edge:1, componentName: IcMutatingPage }
rowEvents              []
rowElementHandles      (absent)
```

Every one of those carries an empty instance path, because the collection, the
repeat's host element and the component edge are all the consumer page's own —
the page is the root module. The one rendered widget on the page is filed in the
live graph as

```
c0:shared:…/ic-widget.tsrx#ic  ->  root path "c0:"
```

and no chop of `""` reaches `c0:`. So the roots map came back empty, the row
rendered with nothing to resolve `ic()` against, its definition id stayed the
bare `shared:…#ic`, and `assertRowWidgetsResolved` refused it rather than let the
row fork a second instance whose writes nothing reads.

The token is not missing from the page — it is missing from the *collection*.
The repeat is authored outside the family and projected into it through
`{children}`, so the collection it reads is genuinely outside the widget while
the rows themselves are genuinely inside it. On the server those rows resolved
by dynamic scope: the renderer was inside `IcRoot` when it rendered the
projected children. Nothing in the payload writes that fact down.

## Where the token is, and the fix

The live page census answers it exactly. Dumped at mint time on the same page
(third column is "contains the repeat's parent element"):

```
h0             SECTION  true
c0:h0          DIV      true      <- the family root's own element
h1             DIV      true      <- the repeat's parent, page space
r:alpha:c1:h1  DIV      false     <- a served row
r:bravo:c1:h1  DIV      false
r:charlie:c1:h1 DIV     false
h2 / h3        BUTTON   false
```

A host id names its instance. `c0:h0` is a live element of instance `c0:`, and
it holds the repeat's parent — which is the whole of "the repeat stands inside
this rendered widget". Note the served rows are `r:<key>:c1:…`: even a served
row's own id space never names `c0:`, so this is not recoverable from the rows
either. The census is.

Three changes, all in `packages/web`:

- `fns/instance-scope.ts` gains `marklessWidgetRootsAroundPaths(registry, paths)`
  — the same registry question asked of where the rows physically stand rather
  than of an anchor node id. Deepest root wins, so a nested family answers with
  its own.
- `fns/row-component-mint.ts` walks up from the repeat's parent element through
  `parentElement`, collects the census ids of those ancestors, and unions the
  roots that answers with the collection-anchored roots. The collection-anchored
  answer still wins where it exists (a family that owns its own collection is
  unchanged); the positional answer only fills definitions the anchor left empty.
- `resume-runtime-start.ts` passes the live `elementsByHostId` map to the row
  mint host. One field, in a module no byte-walled closure statically reaches.

Only refusals turn into resolutions: `marklessComposedGraphNodeId` consults the
enclosing roots solely for ids the row's own render could not resolve, and
anything still unresolved after that is refused exactly as before.

## Bytes

None moved. The eight governed static closures are unchanged, and
`packages/web/test/event-only-resume-closure.test.ts` passes at its 20,970 limit
untouched — `resume-runtime.ts` sits exactly on it, so nothing was added to a
governed module. `fns/row-component-mint.ts`, `fns/instance-scope.ts` and
`resume-runtime-start.ts` are all outside those closures (the start module is
only ever reached through a dynamic import).

## The witness

`packages/vitest-browser/browser/item-collections/item-collections.test.ts` goes
from 9 passed / 11 expected-fail to 10 passed / 10 expected-fail.

**"SSR: the roster renumbers after an item is added" is flipped and green.** The
added row mints, attaches, binds its element into the family's own roster handle,
and a later `survey()` reads `0,1,2,3` over `alpha, bravo, charlie, delta-3`.

**"SSR: an item added after resume takes the next position by itself" is still
`test.fails`, and no longer for this reason.** Flipped and measured, it now fails
as:

```
expected [ null, null, null, null ] to deeply equal [ '0', '1', '2', '3' ]
```

Four items are in the DOM — the mint did its job — but nothing writes `ui-pos`
until a handler walks the roster, and the row asserts positions without
surveying. That is the render-order ordinal, U689's card 2, not this card. The
proof is the row directly above it: "SSR: dropping the first item renumbers the
ones behind it" involves no minting at all, asserts the same way, and is red for
the same reason. It was left alone by this packet's own instruction, which is the
same instruction that should have covered this row.

So T009 is closed for the one-family case and one of the two rows the packet
named goes green; the other waits on the ordinal card with its comment corrected
to say so.

## What this breaks, and the open question it carries

`packages/vitest-browser/browser/repeat-owner-path/rop.test.ts` is the other T009
witness and it is **pinned at the refusal**: two of its three rows assert that
`MARKLESS_REPEAT_ROW_COMPONENT_WIDGET_UNRESOLVED` is raised. They are now red,
because the refusal no longer happens. That file is outside this packet's file
contract, so it was left untouched — this is the blocking question.

Its own doc comment predicts the flip: *"Once the path is carried, these two flip
to a fourth row per panel whose owner is that panel."* Measured with a throwaway
probe inside this packet's contract (written, run, deleted), the SSR half gets
**half** of that:

```
left:     alpha/left  bravo/left  charlie/left  delta/left     <- correct
right:    alpha/right bravo/right charlie/right                <- no fourth row
refusals: MARKLESS_REPEAT_ROW_COMPONENT_WIDGET_COLLISION x2
```

The left panel's row mints and reads the left panel's instance, which is the
capability T009 was about. The right panel's row is refused by a *different*
guard: `mergeMintedWidgetRoots` sees the row file a widget root for an id a live
root already claims elsewhere. The cause is the row segment. `rowSegmentOf`
(`packages/web/src/prerender/evaluator.ts`) builds it from
`enclosingInstancePath + rowKey`, and that enclosing path is the collection's —
page space for both panels. Two family roots over one page-level collection
therefore mint the same key under the same segment `r:d:`, and the second
collides with the first.

Widening the anchor to the positionally-found root path was tried and reverted:
it makes the segments distinct but resolves to the projection site (`c1:`, `c3:`
— the `RopRows` instances) rather than the panel roots (`c0:`, `c2:`), and all
four rows then refuse as unresolved. That is the divergence rop.test.ts's comment
already names — host id space and the graph instance path the widget registry is
keyed by coincide on some trees and part company wherever a projection segment
appears. Making the anchor right is a second change, not a tweak to this one.

So the question for the owner is which of these to cut next:

1. Re-cut `rop.test.ts`'s two rows against the new behaviour, with the left row
   flipped green and the right one pinned at `MARKLESS_REPEAT_ROW_COMPONENT_WIDGET_COLLISION`
   — an honest, narrower pin that names the row-segment cause rather than the
   anchor one this unit fixed.
2. Or carry the repeat's own graph instance path on the compiler's keyed-repeat
   record, which is what rop.test.ts says is actually missing, and key the row
   segment off that. That is a `packages/compiler` change this packet forbids.

Either way `rop.test.ts` has to be edited, and it is outside this packet's
contract.
