# checklist — implementation notes

The family follows `goals/headless-components/notes/research-checklist.md`. What is
recorded here is only what the source cannot show: the framework limits this family
ran into, each one measured on this branch rather than assumed.

## Shape

The QDS folder's exact part list, eleven parts: `root`, `label`, `error`, `field`,
`selectall`, `selectallindicator`, `item`, `itemtrigger`, `itemlabel`,
`itemdescription`, `itemindicator`. Each renders one piece of markup and nothing
else — no wrapper elements, no fieldset, no legend.

`root` is the group AND the select-all's own checkbox root, which is what QDS
does: one element carrying `role="group"`, whose checked value is the group's
pure function of `value` × `values` and whose toggle writes the whole ticked set.
`label`, `selectall`, `selectallindicator`, `field` and `error` written directly
inside it are that instance's parts. `item` roots a second checkbox instance, and
`itemtrigger`/`itemlabel`/`itemdescription`/`itemindicator` are its parts.

Select-all state is a pure function of `value` × `values` (the Base UI `allValues`
shape). There is no second state cell, so the select-all and the items cannot
disagree, and no item registration or construction-order index is required.

## The blocker, and what T071 changed

The original diagnosis in this note was wrong about the mechanism. Measured on
this base: the fault was never `marklessWidgetRootPath`'s longest-prefix lookup.
It was the widget-instance TOKEN a part mints its `element()` id from
(`markless:widget-instance`, set by the seed pass in
`packages/web/src/fns/shared-seed.ts`). The token named the nearest projecting
component edge, and it never crossed a composed edge at all, so
`CheckboxTrigger` composed by `checklist.selectall` read no token and threw
`MARKLESS_ELEMENT_HANDLE_WIDGET_INSTANCE_MISSING`.

T071 landed the owner's ruling as compose-time data. A component whose own
`children` are rendered inside its composition declares that fact at build time:
`childrenProjectionChain` reads it off the render chunks (the one slot that
renders `prop:props.children` raw), and the emitted module carries the answer as
`Fn.marklessChildrenWidgetRoot`, resolved once at module load from the same
`marklessWidgetRoots` marker the T053 boundary check already reads. The seeding
parent appends it to the token, so a part written inside `<checklist.root>`
resolves to the `CheckboxRoot` that root COMPOSED (`c0:c0:`), not to the
consumer-site path. Nothing is sensed: no tree walk, no DOM ancestry, no child
announcing itself. Seeds also now cross a composed edge on the CSR path, the way
the SSR render context already carried them.

The anatomy renders. Every part resolves to one instance, `checklist.label`'s
`for` equals the select-all trigger's minted `id`, and each item mints its own
(`c0:p4:c6:`, `c0:p8:c6:`, ...). The framework witnesses are
`packages/vitest-browser/browser/projection-into-composed-root.test.ts`.

**What still stops every row of this suite:** a spread onto a COMPONENT tag
contributes no edge prop. `componentPropBindings`
(`packages/compiler/src/passes/semantic-graph/collect-components.ts`) skips an
attribute with no name, so `<CheckboxRoot {...rest} ...>` forwards nothing, and
no consumer attribute survives `<checklist.root>` -> `<CheckboxRoot>` -> `<div>`.
Every locator in `checklist.browser.ts` names a `data-testid` the consumer
wrote, so the suite stays pinned at suite level until the spread reaches the
edge. This is the same gap as limit 1 below, now measured as blocking the whole
anatomy rather than only forwarded events and handles.

## What T073 changed

The composed root's own seed now runs. The CSR seed pass descends the same
children-projection chain the widget token follows, and runs each link's seeds in
THAT link owner's scope: its props, plus every value its module already emitted an
initial for, evaluated in the emitted order exactly as the render evaluates them.
That is the computed reader this family was waiting for — `checked=
{checklist.allChecked}` and `checked={checklist.value.includes(item.value)}` both
resolve, with no seed-time derive of their own and no new emission kind. The
group's shared cells are seeded by `<checklist.root>`'s own seeds first, so the
derive over them reads seeded values, not the factory placeholder: acyclic.

Eighteen rows of this suite and two screen-reader rows flipped with it.

## What T074 changed

The sibling defect is fixed, both halves at once, because neither works alone
(measured: shipping either one on its own turns the select-all's own render red).

A part is a SIBLING of the widget root its composition placed it in — inside a
keyed `@for` a row's parts sit at `r:<key>:c0:p1:` while the checkbox root the
row's child composed sits at `r:<key>:c0:c0:` — so no prefix of the part's own
path can ever name that root. The two halves:

1. A `shared:` id that already carries an instance path is one only a widget
   lookup can have written, so composing it AGAIN starts another rendered widget
   and it takes the new path. Without this, two placements of one composing
   component (and every row of a `@for`) collapse onto one widget's cells.
2. The registry that answers "which rendered widget holds this id" is now a map,
   and composition registers each widget a second time under the projection site
   its parts sit at. The answer comes from the same declared children-projection
   chain T071 introduced: the compiler's `marklessChildrenWidgetRoot` marker on
   the SSR side, the same chunk walk on the CSR side, both handed to one
   registration function. Nothing is sensed and no lookup rule changed.

The SSR side declares it into the same seam rather than a parallel one: the
emitted module puts `childrenWidgetRoot` on the composed child it already builds,
so CSR and SSR reach the same registration code with the same value. Browser
resume has no composition to watch, so the payload carries it: a widget-scoped
shared definition now has `projectionIds`, and resume registers those the way it
already registers the definition's own id.

Six more rows of this suite flipped, and
`packages/vitest-browser/browser/projection-into-composed-root.test.ts` is green
on every row including the keyed one and SSR resume.

Three rows that used to pass went honestly red. They passed because every
instance had collapsed into one: the items' parts fell back to the root's
`c0:shared:checkbox...`, so the select-all's own toggle moved every item trigger
without anything travelling through the group. Separating the instances removed
that accident and exposed the defect below.

## The one named defect left

**A widget callback slot's dispatch never leaves the widget.**
`checkbox.toggle()` calls `checkbox.onChange?.(next)`, which the consumer edge
answers with `checklist.setAll` — and on a gesture no checklist symbol runs at
all. The browser's own dispatch trace for `Space on the focused select-all` is
character-identical before and after T074: `symbol:0 (checkbox.tsrx)` and its dom
updates wake, and nothing from checklist.tsrx ever does. Every remaining pinned
row of this suite is pinned on it. It is not a seeding or an identity problem —
both sides now agree on which node each part reads — so it belongs to the
widget-callback route, not to this family.

The looped rows carry a second measured detail: inside `items-from-data.tsrx` the
three row triggers still mint ONE element id.

## What T075 changed

**The looped rows are fixed, and the cause was not the host prefix.** `key row`
and `key i` both lower to an EMPTY key path (`itemKeyPath` returns `[]` when the
key IS the item, and `null` for an index key, which `collect-repeat` then spells
as `[]` too). Two readers took an empty path for "this repeat has no key":
`protocol-view`'s `resumableKeyedRepeats` dropped the keyed-repeat view record
outright, and the SSR-data renderer passed no `key` down, so every row got the
same empty row segment and the whole loop collapsed onto one widget instance and
one minted id. A list of option values is exactly this shape.

The artifact now says which one it is: `indexKey` is set only for a position key,
and an empty key path means the item itself is the identity — which
`readValuePath(item, [])` already answered correctly. The two readers ask
`indexKey` instead of the path length. Witnesses:
`packages/vitest-browser/browser/widget-token-scalar-rows.test.ts` (the T074 row
shape keyed by the scalar item) and `widget-token-row-scoping.test.ts` (that loop
written inside an enclosing root's projected children, the checklist anatomy);
`packages/compiler/test/keyed-repeat-item-key.test.ts` pins the artifact fact.

**T075b moved where that fact is spelled, because the first spelling shipped it.**
`indexKey` on the emitted render-data artifact cost bytes on every page with a
position-keyed `@for` — the whole render-data artifact is `JSON.stringify`d into
the shipped module — and `music-player-ssr` has one, which put the byte wall over
and changed the checked-in emit snapshot. The position key is now a semantic-graph
fact only: `protocol-view` reads `semanticGraph.keyedRepeats[].indexKey`, and the
render-data artifact carries the opposite, rarer marker instead — `itemKey`, set
only for `key row`. No fixture in `emit-byte-equality` and nothing in
`music-player-ssr` writes `key row`, so both are byte-identical to the pre-T075
tree: the emit snapshot passes unchanged and the wall measures exactly 65,162.

## The defect that is still open, and why it is a redesign

**A widget callback slot's dispatch still never leaves the widget**, and the
reason is structural rather than a missing case. The minimal shape is witnessed
at `packages/vitest-browser/browser/widget-callback-escape.test.ts` (pinned) with
`fixtures/wcb.tsrx`, `wcb-group.tsrx`, `wcb-page.tsrx`, and measured at the
artifact boundary in `packages/compiler/test/widget-callback-composed-root.test.ts`.

What happens today: `resolveWidgetCallbackRoute` resolves a claim against
`enclosingWidgetRootEdge` — the innermost edge into the SAME family module that
textually encloses the part's own edge. In `checklist.tsrx`, `ChecklistSelectAll`
composes `<CheckboxTrigger>` and no `<CheckboxRoot>` encloses it: the enclosing
root was placed by a SIBLING part (`ChecklistRoot`), and only the consumer's
nesting says which sibling. The route therefore folds to
`compiler-known-constant undefined` and the dispatch no-ops silently.

A second resolution target inside the composing module is not enough, and this is
the conflict:

1. `checklist.tsrx` has TWO composed roots of the same family — `ChecklistRoot`'s
   `<CheckboxRoot onChange={setAll}>` and `ChecklistItem`'s
   `<CheckboxRoot onChange={setItem}>`. Which one encloses `ChecklistSelectAll`
   versus `ChecklistItemTrigger` is a fact about the CONSUMER's markup. The
   module that binds the claim cannot choose, and choosing wrong is worse than
   no-oping.
2. Handing the choice to the consumer means re-publishing the claim one level up.
   A claim row needs a manifest entry (`virtualModuleId` + `exportName`), and a
   module's manifest carries only the symbol modules it compiled itself; the
   re-exported claim has none. Worse, the composing module ALREADY binds that
   same base symbol (for the part's own graph reads, at its own instance path), so
   a second binding at the consumer would give one symbol two bound rows with two
   different instance paths.

The shape that does work is the one T074 already used for widget identity:
resolve at COMPOSE time, not at bind time. The composing module declares, on the
composed child it already builds, "the widget rooted here answers slot
`<definitionId>#onChange` with symbol `<local id>`", exactly beside the
`childrenWidgetRoot` it already declares; composition registers it under the same
qualified instance path it registers `projectionIds` under; the payload carries
it for browser resume the same way; and the slot invocation becomes a new route
kind that asks that registry using the part's own widget instance — the identity
it already resolves its graph reads through. Nothing is sensed and no tree is
walked. That is a new claim/route kind plus a new compose-time registration seam
across CSR, SSR and the resume payload, with its own byte measure — a change of
T074's size, not a patch to `resolveWidgetCallbackRoute`.

(Read the T075c section below before acting on this paragraph. A registration
seam of composition's own is the wrong half: the invoking side cannot ask it,
because it never sees the instance path the registration is keyed by. The
identity resolves through the GRAPH, so the answer has to BE a graph node, and
the declaration belongs to the family module rather than to composition.)

Every remaining pinned row of this suite is still pinned on this.

### What T075b priced about that design

Three facts measured on this base, so the next attempt starts from them.

**The answer is already at the compose seam; only the KEY is missing.** A compose
child already carries `callbackProps` — `{propName: page-space symbol id}`, built
by `packages/web/src/prerender/evaluator.ts` (`input.symbolPrefix + symbolId`) and
by the emitted SSR module (`childProps.__marklessSsrCallbacks`). The same loop in
`marklessRegisterComposedWidgets` that pushes a widget root already knows the
qualified widget id that answer belongs to. So the registration reads
`[instancePath + definition.id, child.callbackProps]` and needs NO new compiler
artifact field, no new emitted data, and no new SSR/CSR declaration — only the
registry, the payload field for resume, and the new route kind.

**Deriving the answer instead of registering it does not work, and the reason is
worth writing down.** The widget's root instance path minus its last instance
segment IS the composing instance's path, so `rootPath` plus the composing
module's local callback symbol id would reach the handler with no registry, no
payload field, and no bytes in `composition.ts`. It fails on the same conflict
that killed bind-time resolution: `checklist.tsrx` has two `<CheckboxRoot
onChange=...>` edges with two different local symbol ids, and the stripped path
does not say which edge composed this root. Compose-time registration is the only
shape that answers that, which is what the ruling says.

**The byte wall decides the shape.** `music-player-ssr` sits at exactly 65,162,
its cap. `packages/web/src/fns/composition.ts` loads on every composing page, so
even two unconditional lines in `marklessRegisterComposedWidgets` move the wall.
The registration therefore has to be gated the way the T074 CSR walk is (riding
the shared-seed pass, so a page with no widget seeds loads neither), and the
invoke-side route handling has to live in the symbol-resolver module, which the
compiler already emits per-page and can gate on the route being present.

### What T075c measured, and why the registration moves

**A registry keyed by qualified instance path cannot be ASKED from the invoking
side.** This is the fact that decides the design, and it was measured on the
running witness rather than reasoned about. The part's dispatch runs inside the
capture context the emitted symbol-resolver builds
(`packages/compiler/src/passes/symbol-resolver-module.ts`,
`createCaptureContext`), and everything that context knows about instances is
`bound.instancePath` — the part's edge path inside its OWN module. On
`wcb-page.tsrx` the second group's trigger dispatched with
`bound.instancePath = "c1:"` while the widget it belongs to is rooted at
`c5:c0:`, because the bundler's per-edge symbol route already consumed the outer
path: `emitLazySymbolRouteFunction` (`packages/bundler/src/source-module.ts`)
hands the child module `symbolId.slice(prefix.length)`, and the woken symbol was
`c5:p7:bound:symbol%3A0:component-edge%3A1`. Composition's registrations are
absolute (`c5:shared:…#wcb -> c5:c0:`, logged at
`marklessRegisterWidgetProjections`), so a lookup made with `c1:` matches
nothing, and a lookup made with a RELATIVE key cannot be made to work either:
two placements of one composing component register the same relative key, which
is exactly the sibling collapse T074 removed.

**The one channel that still knows the absolute path is the GRAPH.** The part's
own `s.on` read resolves correctly today only because
`marklessInstanceScopedGraph` qualifies it with the stripped prefix before the
graph sees it, and `marklessComposedGraphNodeId` runs the widget-root lookup
there. So the answer has to be readable as a graph node of the widget's own
definition — `<definitionId>/slot:<slotName>` — and the invoke side becomes
`context.graph.read(...)` of that id, which lands on the right rendered widget by
the same rule the part's other reads land by. Nothing new is sensed and no path
arithmetic is added.

**Where that node's value comes from, and why it keeps the wall unmoved.** The
answering symbol id is already handed to the widget root as a prop:
`__marklessSsrCallbacks[propName]` on its own props object, on both the
prerender-evaluator path and the emitted SSR path. The declaration therefore
belongs to the FAMILY module (`wcb.tsrx`, `checkbox.tsrx`) — the module that
declares the slot — as one more `shared-seed`-shaped value for the node, planned
from `semanticGraph.sharedCallbackBindings` (which already says: definition D,
slot S, root component C, prop P). A module with no callback slot emits none, so
`music-player-ssr` is byte-identical by construction, and the value rides the
seed map, the compose seam and the payload that already exist — CSR, SSR and
resume agree because there is one node, not three transports. The remaining work
is four sites: the protocol-state cell plus `graphNodeIds` entry
(`packages/compiler/src/passes/protocol-state.ts`, which today drops
`kind: 'callback-slot'` return properties), the planned seed symbol
(`packages/compiler/src/passes/symbol-resolver.ts`), the route kind replacing the
`compiler-known-constant undefined` fold in `resolveWidgetCallbackRoute`, and the
`invoke` branch in the emitted resolver. `edgeChildProps` in
`packages/web/src/fns/shared-seed.ts` also has to carry the callbacks map, which
it does not build today.

**A third defect, newly measured and pinned:** the children-projection chain is
walked to any depth, but the seed pass's symbol prefix is not.
`applyComposedChainSeeds` advances `ownerPrefix` by each link's own edge segment
while `applySharedSeeds` appends that segment again, so a composer that wraps its
children in a SECOND pure composer before the family root asks the first link's
module for a symbol only the second one owns (`Unknown async symbol c0:symbol:7`).
One link deep the double-count is invisible. Witness:
`packages/vitest-browser/browser/projection-chain-depth.test.ts` (pinned), with
`fixtures/pwr-deep-group.tsrx` and `pwr-deep-page.tsrx`. The fix is prefix
arithmetic in `packages/web/src/fns/shared-seed.ts`, not a change to the declared
chain.

## What T075e measured, and the one line it changed

**The return leg was not what the red rows were pinned on.** T075d landed the
callback-slot graph node and its minimal witness
(`packages/vitest-browser/browser/widget-callback-escape.test.ts`) is green, but
five rows of this family that were green before it went red. Measured on the
running page rather than reasoned about: clicking the select-all produced NO
writes at all. Its own `checkbox.checked` never moved, `checklist.setAll` never
ran, and on `with-onchange.tsrx` the consumer handler's call counter stayed at
`0`. The dispatch trace named the difference exactly — before T075d the click
woke `symbol:0 (checkbox.tsrx)` plus six of its dom-update symbols through
`c0:p2:bound:symbol:0:component-edge:4`; after it, no checkbox symbol woke at
all and the bound symbol had lost its instance prefix.

**The cause is where a dispatching method gets inlined.** A `shared()` method is
inlined into a handler because the handler carries no runtime instance to call it
on. T075d extended that inlining from event handlers to callback props, and fixed
parameterised methods, which is what `checklist.setAll(next === true)` needs. But
`setAll` and `setItem` both end in `checklist.onChange?.(next)`, so the inlined
body carries a widget-callback claim of the CHECKLIST's own slot — a claim a
callback prop has no route to answer. Every claim this module publishes then
travelled to the consumer page, the part's own gesture bound to the wrong symbol,
and it ran nothing. One line closes it: a method that dispatches through its own
family's slot stays a CALL inside a callback prop, and is still inlined into event
handlers, where the whole route is owned. Parameterised inlining is untouched, so
the escape witness stays green.

Pinned at `packages/compiler/test/widget-callback-composed-root.test.ts` ("a
dispatching shared method is not inlined into a callback prop") with a middle
module that declares a slot of its own — this family's exact shape.

**The return leg itself is still open, and it is still the next thing.** With the
dispatch restored, the rows below the ones that flipped back stay pinned on it:
when the group writes `checklist.value`, the synthetic computed a composed edge
minted (`checked={checklist.value.includes(item.value)}`,
`checked={checklist.allChecked}`) re-derives, but nothing writes that value
through to the composed `CheckboxRoot`'s seeded cell, so the item's rendered
state does not follow. The channel is priced and needs no new transport: the
child's shared-seed symbol is already a derive `(context) => value` reading
`prop:props`, and `resume-sync-demand.ts` already subscribes a record's
dependencies and writes its node from a `deriveSymbolId`. What is missing is the
record — the child module declaring "this shared node follows these prop reads"
— plus the compose-side remap, which `marklessQualifyChildState` already performs
for `computed[].dependencies`. A payload `computed` entry carrying no `compute`
is read from the cell, so the child's own toggle keeps writing it: last write
wins between the two channels.

## What T075f changed

**T075e's one line was the wrong half of a true diagnosis, and it shipped a red
tip.** Leaving `checklist.setAll(...)` standing as a call inside the callback prop
emitted a free `checklist` into the symbol module, so the moment the checkbox's
slot route invoked it the symbol threw `ReferenceError: checklist is not defined`
— six unhandled rejections, `pnpm test:headless` exiting 1 on 108 passing rows. A
callback prop carries no runtime shared instance, for exactly the reason an event
handler does not, so the method has to be inlined there too.

What T075e was really protecting against is the CLAIM, not the inlining. An
inlined dispatching body grows a widget-callback capture slot, and a
widget-callback ROUTE is what publishes a claim to the consumer
(`linkedImportedClaimKind`); once the callback prop published one, every claim
this module makes travelled up and the part's own gesture bound the wrong symbol.

The fix separates the two. A callback prop is invoked by whatever composed its
edge — it is never a part a consumer binds — so no consumer edge can ever answer
its slot, and the route is resolved where it is minted instead of published: the
`callback-slot-route` on the slot's own graph node that T075d already built for a
part with no enclosing root. The symbol therefore dispatches through the graph,
which is the one channel that knows the absolute instance path (the T075c
finding), and publishes nothing.

The emitted module says it plainly:

```js
export async function symbol_0(context) {
  const next = context.event;
  (async (on) => {
    const next = on ? [...context.graph.read(".../state:checklist", ["values"])] : [];
    context.graph.write({ graphNodeId: ".../state:checklist", path: ["value"], value: next });
    await marklessInvokeCallbackSlot(context, ".../slot:onChange", [next]);
  })(next === true);
}
```

`marklessInvokeCallbackSlot` is `packages/web/src/fns/callback-slot.ts`, and it is
the same function the emitted symbol-resolver module's own `callback-slot-route`
branch now calls — one reading of the composer-path arithmetic instead of two, and
the import is carried only by a module that actually dispatches through a slot.
Pinned at `packages/compiler/test/widget-callback-composed-root.test.ts` ("a
dispatching shared method inlined into a callback prop routes through its own slot
node"), which asserts the inlining, the resolved route, the absent claim, and the
emitted call.

**Containment, and where the rejection was really escaping.** An inlined
dispatching body becomes `(async () => { ... })()` — a promise no caller awaits,
because the authored `checkbox.toggle()` was not awaited either. Every failure
inside it therefore bypassed the dispatch try/catch entirely, which is why the
T050 outer-listener containment never saw these. `resume-events.ts` now separates
the two invocation paths: the top-level loop runs symbols directly, so a failure
there still reaches the dispatch catch and rethrows, while the `invokeSymbol`
threaded into symbol contexts — the one a slot route calls — reports through
`reportRuntimeError` and returns, contained and reported once instead of
surfacing as an unhandled rejection. The row-event path was threading neither
`invokeSymbol` nor `invokeCallback` into its context at all; it now builds the
same channel, with the row's item locals travelling on it, so a slot dispatch from
inside a keyed `@for` row reaches a handler rather than throwing "Bound callback
invocation is unavailable".

**The return leg is still open**, unchanged from the T075e description below it:
the group's write re-derives the synthetic computed a composed edge minted, but
nothing writes it through to the composed `CheckboxRoot`'s seeded cell. The design
is priced in that section and was not attempted here.

**One thing measured in passing, not fixed.** `setItem`'s inlined body lowers
`checklist.value.filter(...)` to `context.graph.read(node, ["value", "filter"])(...)`
— the array method read off the path and called detached from its receiver, where
the derive path lowers the same shape as a member call
(`read(node, ["value"]).includes(...)`, symbol:3). The two lowerings disagree. It
did not surface as a red row in this suite, but it is a real difference between
the event-handler and derive read rewriters.

## Framework limits this family ran into

1. **A spread onto a component tag was dropped on the CSR side.** _(fixed)_
   Both emitters now forward the spread. What is NOT yet done: the semantic graph
   still records no prop binding for a spread, so a spread-forwarded event or
   `el` handle across a component edge has no view record.

2. **A composed family's root could not be seeded from the enclosing family's
   instance.** _(fixed)_ Three separate faults were behind this, the last one
   landed beside this note:
    - `splitStaticGraphPath` split `checklist.value.includes(item.value)` on `.`
      with no check that a segment is a property name. It now fails closed.
    - `componentPropBindings` resolved edge props against an UNSCOPED binding map.
      It is now scoped the way every other collector scopes a component body.
    - The membership seed itself. A component-edge prop whose expression is a
      recombination of reads — including a method call ON a read, which is what
      `checklist.value.includes(item.value)` is — now mints the same synthetic
      computed a template expression does, and the edge names that node. The
      composed checkbox therefore follows the group both ways. The refusal that
      replaces the old silent placeholder is
      `MARKLESS_COMPONENT_PROP_EXPRESSION_UNSUPPORTED`: an edge prop that reads a
      state cell or a computed but cannot be routed is an error, not a seed.
      Method calls are read as part of the expression at a component edge only;
      template positions are unchanged, so no page pays for a `.toFixed()` it
      never needed. Widening them is a separate change with its own byte measure.

3. **Sibling composed checkbox instances.** Not re-probed: the blocker above stops
   every row before a gesture is reached.

4. **A shared factory cannot be called from another module.**
   `MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED` — "graph analysis is not available for
   that module". This forecloses the composition that would sidestep the blocker
   entirely: `checklist.item` calling `checkboxState()` itself, rooting the
   checkbox instance in place with no component edge and no extra element.

5. **A callback slot is recognised from the written type annotation, not the
   resolved type.** `isCallbackSlotDeclaration` requires a syntactic
   `TSFunctionType`, so `undefined as ChecklistRootProps['onChange']` is not a slot
   and fails with `MARKLESS_SHARED_MEMBER_UNKNOWN` plus
   `MARKLESS_SHARED_SEED_UNKNOWN_FIELD`. Measured again on this base: the alias
   here is an indexed access into a type declared in a DIFFERENT module
   (`checklist-types.ts`), so the fix is cross-module type resolution, not the
   same-module alias walk. The function type is spelled out for now.

6. **`aria-controls` on the select-all is not expressible.**
   `MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE` refuses an IDREF list. The family ships
   without it, exactly where QDS is, with a pinned row in the suite that turns red
   the day an IDREF _set_ lands.

7. **A construct cannot open directly inside a component tag's children.** `@for`
   written as a direct child of `<checklist.root>` is a parse error; it has to be
   nested inside an element first. `items-from-data.tsrx` wraps its loop in a
   `<div>` for that reason.

8. **The group has no accessible name of its own.** `role="group"` on the root and
   a `<label for>` naming the select-all trigger name the CONTROL, not the group.
   Naming the group needs `aria-labelledby` on the root pointing at an `element()`
   handle the label part carries — which needs the spread graph half from limit 1,
   because `checklist.label` forwards `el` through `{...rest}` across a component
   edge. Not landed.
