# Handler-time element handles already resolve per instance. The pair rows are red for a different reason.

Status: **blocked**, no runtime source changed. `packages/web/src` is byte
identical to the tip. A new witness dir was added and it is **green on the
untouched tip**.

## The packet's premise, measured

The packet says a handler body reading a singular `element()` handle of a
widget-scoped family throws `MARKLESS_ELEMENT_HANDLE_INSTANCE_AMBIGUOUS` as soon
as a second instance of that family is on the page, and asks for the dispatch
path to resolve the read against the handler's own instance.

That resolution is already built and already works. `resume-events.ts` hands the
symbol a context whose `getElementHandle` is wrapped by
`marklessInstanceScopedElementHandle` (`fns/instance-scope.ts`), which qualifies
the compiled handle id through `marklessWidgetHandleId` ->
`marklessComposedGraphNodeId` — the *same* function that qualifies the handler's
graph nodes. Both halves of a handler therefore land on one instance by
construction.

The new witness dir `packages/vitest-browser/browser/handler-instance-handle/`
puts that claim under test, and every row is green with the runtime untouched:

- three nested levels of one family, a handler at each depth reading its own
  singular `contentEl` and marking it — click and keydown, CSR and SSR;
- two sibling top-level instances that do not cross, CSR and SSR;
- a handler on a **keyed-repeat row** inside a widget reading the widget's own
  handle, with a second widget beside it, CSR and SSR;
- the genuine-ambiguity case (a page-level handler standing in no instance)
  still refused, CSR and SSR.

10 rows, 10 green, no edit to `packages/web/src`. So there is no stash receipt to
give: the rows cannot be red on the tip, because the mechanism the packet asks
for is the mechanism that makes them pass.

## What the 3 `pair` rows are actually measuring

`browser/own-instance-handle/pair.tsrx` is not a second instance failing to be
addressed. It is a second instance that **never exists**.

I ran the pair page with the handle read taken out of the handler entirely, so
the click only wrote `level.hits`:

    clicking the inner content -> [data-pair-root] data-hits="1"
                                  [data-pair-item] data-hits="1"

One click, both counters. `PairRoot` and `PairItem` share a single widget
instance. The runtime agrees: on that page the widget registry holds exactly one
root path for the family —

    c0:shared:.../pair.tsrx#pairLevelState  ->  c0:

— and both `PairContent` elements bind `contentEl` inside it. Two elements, one
instance, one key. The registry refusing that read is correct behaviour, not a
lookup defect.

## Why there is only one instance

`packages/compiler/src/passes/public-render/shared-seed-pass.ts`,
`widgetRootComponents()`, returns `Map<definitionId, componentName>` — **one**
rooting component per module-declared widget-scoped family, chosen as the first
component that seeds it, or failing that the first that resolves it. Compiling
`pair.tsrx`'s source and asking the pass directly:

    roots:   [["shared:src/pair.tsrx#pairLevelState", "PairRoot"]]
    markers: ["marklessRenderSsr.marklessWidgetRoots = [\"shared:src/pair.tsrx#pairLevelState\"];"]

`PairRoot` is declared first, so `PairRoot` roots the family and `PairItem` gets
no `marklessWidgetRoots` marker at all. The rule is deliberate and already
pinned: `packages/compiler/test/nested-widget-root-boundary.test.ts` asserts it in
so many words — *"Root seeds, so Root owns the definition's cells and roots the
family. Err seeds too but is declared after Root, so it stays a part."*

`browser/own-instance-handle/nest.tsrx` is green precisely because it obeys that
rule: `NestItem` is the only component that resolves `nestLevelState`, so every
nested item starts an instance and every handler reads its own element. `pair`
asks two components in one module to root the same family, which the compiler has
no way to emit.

## No runtime-only change can turn these rows green

The third red row, *"a root-seeded level and an item-seeded level are two
instances"*, asserts only on **cells**: the item's click must leave the root's
`data-hits` at `0`. Cells are already instance-correct — that is the packet's own
premise, and the nest rows prove it. That row is red because the page carries one
instance rather than two, and nothing in `packages/web/src` decides how many
instances a page has. An element-handle change cannot move it, and neither can
resolving a handle by proximity to the dispatching element.

## What recursive menu still needs

Unchanged from U590, and not the wall U590 named. `menuItemState` is meant to be
"seeded by `menu.root` for the top level, then by every `menu.item`" — the pair
shape exactly. The blocker is not that an item's handler cannot read its own
`contentEl`; it demonstrably can, at any depth, once its level is a real
instance. The blocker is that `menu.root` and `menu.item` cannot both root
`menuItemState` from one module.

So the `ui-value` identity-guard question U590 escalated is still live and still
unanswered, and the pair pins did **not** flip.

## The owner question

Letting more than one component root a family needs both halves:

1. `widgetRootComponents` becoming a multimap, and `widgetRootMarkerLine` emitted
   for every rooting component rather than once per definition.
2. An **authored signal** for which resolves root and which merely read.
   `PairContent` resolves `pairLevelState` too and must stay a part; "every
   component that resolves it roots it" would break `nest.tsrx` and every shipped
   family. The source as written carries nothing that separates `PairRoot` and
   `PairItem` from `PairContent`.

Half 2 is a public API decision and half 1 is `packages/compiler/**`, which this
packet forbids. Both are outside what a runtime unit can settle.
