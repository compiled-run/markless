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

## THE BLOCKER: this anatomy does not run on this base

Measured on `feat/headless-ui-pilot` @ `560eebd5` plus the component-edge computed
landed beside this note. Every row of `checklist.browser.ts` except the recorded
IDREF gap is red, and they are all one fault:

    MARKLESS_ELEMENT_HANDLE_WIDGET_INSTANCE_MISSING:
    shared:.../checkbox.tsrx#checkboxState/element:triggerEl

A widget-scoped shared() instance is found by **longest registered prefix of the
reader's instance path** (`marklessWidgetRootPath`, `packages/web/src/fns/
instance-scope.ts`). Instance paths for projected children are computed from where
the consumer WROTE the tag (`componentEdgeInstancePaths`), not from where the part
forwards `children` to.

So for `<checklist.root><checklist.selectall/></checklist.root>`:

  * `checklist.root`'s own composed `CheckboxRoot` registers the checkbox widget
    at `c0:c0:`.
  * `checklist.selectall` is a projected child of `checklist.root` at `c0:p1:`,
    and its own `CheckboxTrigger` lands at `c0:p1:c0:`.
  * `c0:c0:` is not a prefix of `c0:p1:c0:`, so the trigger finds no widget root.

The five-part shape this family shipped before worked around it by giving
`checklist.selectall` a wrapper `<div>` whose child was the `CheckboxRoot`: the
consumer's `<checkbox.trigger>` was then projected THROUGH that root
(`c0:p1:c0:pN:`), and projection composes. That is exactly the wrapper element the
QDS anatomy forbids.

**What has to land before this anatomy runs:** children projected into a part must
inherit the instance path of any family root that part composes them into. Until
then the QDS part list is expressible but not executable, and the choice is a
wrapper element per composing part or a change to how projection paths are built.

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
