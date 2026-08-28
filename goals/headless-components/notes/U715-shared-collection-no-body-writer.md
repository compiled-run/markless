# U715 — the `context.graph.read` throw, measured

Board card T028, from `U697-taglist-defects.md` item 4:

> With a root that only *reads* the collection — nothing outside the instance ever writing it — a
> sibling part's handler write reaches nothing at all, and the reason is a real runtime throw:
> `TypeError: context.graph.read is not a function or its return value is not iterable`.

Everything below is a browser measurement against the pilot tip (`13ba8a2c`), not a reading of the
source. The witness is `packages/vitest-browser/browser/shared-collection-no-body-writer/`:
6 green rows, 4 pinned, CSR and SSR.

## The reported shape does not reproduce

A widget-scope `shared()` factory that seeds `items`, a root that only reads the collection, one
part holding a keyed `@for` over it, one sibling part whose handler pushes to it — no body writing
it anywhere — is **green**. It grows past the served keys, the sibling attribute bindings refresh,
and nothing throws, in CSR and SSR alike. Seeding the collection empty instead of with two entries
is green too.

So "no component body ever writes the collection" is not an ingredient, and neither is an empty
seed. Whatever U697 hit in that shape was closed by work that landed since (the row-mint units).

## What does reproduce, and it is one ingredient

The throw survives in a shape U697 never separated: **the page never renders the component the
compiler gave the definition's cells to.**

Same family module, same factory, same parts. Only the page differs:

| page | outermost part rendered | result |
| --- | --- | --- |
| `no-writer-page` | the root, which resolves the definition | green |
| `empty-page` | the root, which resolves the definition | green |
| `first-resolver-page` | a part that resolves it, and is its module's *first* resolver | green |
| `aloof-page` | a root that resolves nothing; writer beside the field | **throws** |
| `nested-page` | a root that resolves nothing; writer nested inside the field | **throws** |

`first-resolver-page` and `nested-page` are the same render tree — an aloof root wrapping a part
that resolves the definition, with the writer nested inside that part. The only difference is
declaration order inside the family module. Moving the outermost part above the writer in the file
turns the throw into a green row. That is the whole ingredient.

## The mechanism, in two functions

Instrumenting `marklessInstanceScopedGraph`'s reader (`packages/web/src/fns/instance-scope.ts:444`)
on `aloof-page`, at the moment the handler runs:

```
graphNodeId  "shared:empty-family.tsrx#emptyBox/state:box"   (as the part spells it)
q            "shared:empty-family.tsrx#emptyBox/state:box"   (unchanged: still page space)
instancePath "c0:p2:"
answer       undefined
roots        [["shared:empty-family.tsrx#emptyBox", ""]]     (one root, rooted nowhere)
```

Reads of the same node under every candidate prefix (`""`, `c0:`, `c0:p1:`, `c0:p2:`) answer nothing
as well: **the cell does not exist in the graph at any id.** The green `empty-page` run, same family,
same parts, shows `roots [["c0:shared:…#emptyBox", "c0:"]]` and `answer []`.

Two decisions produce that, and neither is in `instance-scope.ts`:

1. `widgetRootComponents` — `packages/compiler/src/passes/public-render/shared-seed-pass.ts:386`.
   A widget-scoped definition's cells go to the seeding component, "and with no seed, the first
   component that resolves the definition does" — first in `semanticGraph.sharedInstances` order,
   which is declaration order in the module. Nothing consults which component a page will render
   outermost.

2. `marklessRegisterComposedWidgets` — `packages/web/src/fns/composition.ts:276`. A composed child
   registers a widget root only if its payload carries a cell whose id starts with
   `definition.id + '/'`. The component the compiler picked is not on this page, so no child carries
   one, no root is registered, and the definition composes page-wide with root path `""`.

From there `instance-scope.ts` is doing exactly what the registry tells it.
`marklessWidgetRootPathThroughRows` answers `''`, `marklessComposedGraphNodeId` correctly leaves the
id in page space (it has no prefix to strip and no root to add), the graph answers `undefined` for a
cell nobody ever wrote, and the emitted handler's `[...box.items, 'gamma']` spreads `undefined`. V8
spells that `context.graph.read is not a function or its return value is not iterable`, and the
frame it names — `packages/web/src/fns/instance-scope.ts:341` — is the `scopeSymbol` wrapper calling
the symbol, not the fault.

The near miss is worth writing down: `assertWidgetReadResolved`
(`packages/web/src/fns/instance-scope.ts:139`) already refuses this class of read with the named
`MARKLESS_WIDGET_INSTANCE_UNRESOLVED` error, but only for an id carrying a non-empty edge prefix.
A bare widget id is excluded on purpose — "a bare widget id claims no instance" — because per spec
03 a definition resolved by the page itself is legitimately page-wide. Today a bare id means both
"page-wide on purpose" and "rooted nowhere by accident", and nothing tells them apart.

## The silent half

`first-resolver-page` before the reorder is the same defect without the throw. The writer was the
module's first resolver, so it carried the cells and rooted a widget of its own at its own instance
path (`c0:p1:c0:`), while the field read the page-level one at `c0:`. Two instances of one family,
one gesture, nothing moves and nothing is reported. The registry showed both roots. A fix has to
close that as well as the throw.

## What the spec says should happen

`specs/framework/03-state-graph.md` is explicit, and it is not what the code does:

> the widget root is the outermost composed instance that carries the definition's cells

and, on resolution:

> the widget instance is the instance path of the **outermost component that resolves the
> definition**

The compiler resolves "outermost" as "first declared in the module", which is a different question
and only coincides when the family module happens to declare its root part first. Every family in
`packages/headless/components` does declare its root first, which is why this has stayed invisible.

## Blocked

The cause is outside `packages/web/src/fns/instance-scope.ts`, which is this unit's only writable
source file. The fix belongs in one or both of:

- `packages/compiler/src/passes/public-render/shared-seed-pass.ts` (`widgetRootComponents`) — pick
  the cell owner by something other than module declaration order, or give the cells to every
  resolver and let composition choose the outermost.
- `packages/web/src/fns/composition.ts` (`marklessRegisterComposedWidgets`) — register a root for
  the outermost composed instance that resolves the definition, rather than only for one that
  carries cells.

A third, smaller change stands on its own and does live in `instance-scope.ts`: make a widget-scoped
read that resolves to no rendered root refuse with `MARKLESS_WIDGET_INSTANCE_UNRESOLVED` instead of
answering `undefined`, so the failure names itself instead of surfacing as a spread-of-undefined
TypeError inside user code. It needs a ruling first, because it cannot be told apart from a
legitimately page-wide definition without a new signal from composition.
