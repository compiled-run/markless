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
the innermost enclosing root of _its own_ family.

The group is a `<fieldset>` named by a `<legend>`, which is what aria-at's own
tri-state reference implementation does. No id is minted for the group name and no
IDREF is needed.

Select-all state is a pure function of `value` × `values` (the Base UI `allValues`
shape). There is no second state cell, so the select-all and the items cannot
disagree, and no item registration or construction-order index is required.

## Framework limits this family ran into

Each of these was measured on `feat/headless-ui-pilot` @ `34968931` while building
this family. They are the reason `checklist.browser.ts` carries pinned rows.

1. **A spread onto a component tag was dropped on the CSR side.** _(fixed)_
   The SSR emitter already forwarded it; the CSR emitter
   (`componentPropsSource` in `passes/public-render/component-wiring.ts`) skipped
   any attribute with no identifier name, and a `JSXSpreadAttribute` has none.
   Both emitters now forward the spread. What is NOT yet done: the semantic graph
   still records no prop binding for a spread, so a spread-forwarded event or
   `el` handle across a component edge has no view record. The wrapper elements
   `checklist.selectall` and `checklist.item` render are still here for that
   reason and for gap 2 below.

2. **A composed family's root cannot be seeded from the enclosing family's
   instance.** _(partly fixed)_ Two separate faults were behind this.
    - `splitStaticGraphPath` split `checklist.value.includes(item.value)` on `.`
      with no check that a segment is a property name, so the edge prop was
      recorded as a graph reference down the path
      `["value", "includes(item", "value)"]` — a path no object answers, which
      read as `undefined` and seeded `false`. The split now fails closed when a
      segment is not an identifier or index, so the prop is honestly `opaque` and
      SSR evaluates the authored expression against the instance-qualified local.
    - `componentPropBindings` resolved edge props against an UNSCOPED binding map,
      so `checklist` in a part body resolved to the shared factory's own local of
      the same name. It is now scoped the way every other collector scopes a
      component body, with the shared instance's own return map as the fallback —
      which is what makes `checked={checklist.allChecked}` reach
      `computed:allChecked` instead of a non-existent `state:checklist.allChecked`.
      What is still open: the item's membership seed. `checked={...includes(...)}`
      is `opaque` at the edge, so it has an SSR value but no reactive route, and the
      CSR seed still renders the placeholder. Every row still pinned turns on that
      one seed.

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
   the day an IDREF _set_ lands.

7. **A construct cannot open directly inside a component tag's children.** `@for`
   written as a direct child of `<checklist.root>` is a parse error; it has to be
   nested inside an element first. `items-from-data.tsrx` wraps its loop in a
   `<div>` for that reason.

8. **A part that renders a composed family's root has no instance during the
   server render.** _(fixed)_ Every SSR row threw "Cannot read properties of
   undefined (reading 'allChecked')" from `checklist.selectall`. The synthetic
   computed that stands behind a recombined template expression declares one
   local per read root (`passes/public-render/html.ts`, `ssrAsyncRunnerSource`),
   and it assumed the resolved graph node WAS that root. When the node sits below
   the root — a shared instance's `allChecked` resolves to the computed itself —
   it bound `const checklist = <the boolean>` and the authored
   `checklist.allChecked` then read a member of a boolean. A node below the root
   now contributes a member of the local instead of replacing it. Four SSR rows
   are green as a result; the rest wait on gap 2.

9. **`<fieldset>` does not declare `disabled`** in the type service's intrinsic
   attribute map. _(fixed)_ `fieldset` now declares `disabled`, `form` and `name`
   in `packages/typescript-plugin/src/markless-tsrx.d.ts`.
