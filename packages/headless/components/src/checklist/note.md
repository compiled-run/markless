# checklist — implementation notes

The family follows `goals/headless-components/notes/research-checklist.md`. What is
recorded here is only what the source cannot show: the framework limits this family
ran into, each one measured on this branch rather than assumed.

## Shape

Five parts, not QDS's eleven: `root`, `label`, `selectall`, `item`, `error`. The six
QDS pass-through wrappers (`itemtrigger`, `itemindicator`, `itemlabel`,
`itemdescription`, `selectallindicator`, `hiddeninput`) are deleted — a consumer
writes `checkbox.*` directly inside `checklist.item` and `checklist.selectall`,
because each of those roots a real checkbox instance and a checkbox part resolves
the innermost enclosing root of *its own* family.

The group is a `<fieldset>` named by a `<legend>`, which is what aria-at's own
tri-state reference implementation does. No id is minted for the group name and no
IDREF is needed.

Select-all state is a pure function of `value` × `values` (the Base UI `allValues`
shape). There is no second state cell, so the select-all and the items cannot
disagree, and no item registration or construction-order index is required.

## Framework limits this family ran into

Each of these was measured on `feat/headless-ui-pilot` @ `34968931` while building
this family. They are the reason `checklist.browser.ts` carries pinned rows.

1. **A spread onto a component tag is silently dropped.**
   `packages/compiler/src/passes/semantic-graph/collect-components.ts` builds a
   component edge's props by iterating attributes and skipping anything with no
   identifier name; a `JSXSpreadAttribute` has none, so `{...rest}` written on
   `<CheckboxRoot>` contributes nothing and raises no diagnostic. This is why
   `checklist.selectall` and `checklist.item` render an element of their own that
   carries `{...rest}`, with the checkbox root as its child, rather than being the
   checkbox root. Cost: one extra element per item, and the checkbox family's
   `ui-*` flags sit on the inner element while the checklist's sit on the outer.

2. **A composed family's root cannot be seeded from the enclosing family's
   instance.** `<CheckboxRoot checked={checklist.value.includes(item.value)}>`
   seeds `false` at first render even when the group says the item is ticked. The
   identical expression in a plain template position on the same component —
   `ui-checked={checklist.value.includes(item.value)}` on the wrapper element —
   renders correctly, so the expression is right and the component-edge seed is
   what is stale. Moving the answer into a component-local `state()` cell first
   makes it worse: a component-body read of the enclosing family's instance sees
   the placeholder too, because part bodies run in the order-independent seed
   phase. There is no route today that carries a group's answer into a child
   family's root at first render.

3. **Sibling composed checkbox instances are not isolated after a gesture.** With
   three items rendered, a click on one item's trigger moved the select-all's and a
   different item's `aria-checked` to `true`, while the checklist instance's own
   arrays did not change and no `checklist.tsrx` symbol woke — only `checkbox.tsrx`
   symbols did. The checklist instance itself stays isolated (two lists on one page
   do not touch each other); the loss is in the composed checkbox instances.

4. **A shared factory cannot be called from another module.**
   `MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED` — "graph analysis is not available for
   that module". This forecloses the composition that would sidestep 1–3 entirely:
   `checklist.item` calling `checkboxState()` itself, rooting the checkbox instance
   in place with no component edge and no extra element.

5. **A callback slot is recognised from the written type annotation, not the
   resolved type.** `isCallbackSlotDeclaration` requires a syntactic `TSFunctionType`,
   so `undefined as ChecklistRootProps['onChange'] | undefined` is not a slot and
   degrades into a seed that then fails. The function type has to be spelled out.

6. **`aria-controls` on the select-all is not expressible.**
   `MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE` refuses an IDREF list. The family ships
   without it, exactly where QDS is, with a pinned row in the suite that turns red
   the day an IDREF *set* lands.

7. **A construct cannot open directly inside a component tag's children.** `@for`
   written as a direct child of `<checklist.root>` is a parse error; it has to be
   nested inside an element first. `items-from-data.tsrx` wraps its loop in a
   `<div>` for that reason.

8. **A part that renders a composed family's root has no instance during the
   server render.** Every SSR row throws "Cannot read properties of undefined
   (reading 'allChecked')" from `checklist.selectall`. This is why the whole SSR
   half of the suite is pinned rather than a few rows of it.

9. **`<fieldset>` does not declare `disabled`** in the type service's intrinsic
   attribute map, so the native "a disabled fieldset disables every control inside
   it" cascade is unavailable. `checklist.root` writes `ui-disabled` and each part
   carries its own restriction instead. Worth adding to the type service, since it
   is a plain HTML attribute the family's design assumed.
