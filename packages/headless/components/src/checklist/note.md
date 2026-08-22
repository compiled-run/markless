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
three row triggers still mint ONE element id. The row segment reaches the graph
path but not the minted handle, because the seed pass builds that token from the
HOST id prefix rather than from the instance path.

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
