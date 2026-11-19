# @markless/ui families on phones: refusals ranked (2026-11-18)

`node packages/mobile/proofs/ui-family-probe.ts` builds one synthetic app per family (its root holding each other part it
exports) for native and records what the build refuses. The table ranks refusals by how many families each one blocks,
taken from the compiler's own diagnostics in `ui-family-probe.json`. Keyboard-only warnings (`MARKLESS_NATIVE_KEYBOARD_ONLY`)
leave a handler out and block nothing, so they are not counted.

## The probe rendered state helpers as parts

Until this change the probe took every lower-case re-export of a family's `index.ts` as a part, so it rendered
`accordion.itemstate`, `buttongroup.heldValues`, `crop.boundedRect` and other state helpers and plain functions as
components. Each one gave `<x.helper>, a component from another module`. The children the probe put inside it were then
never lowered, which gave `markup outside the root template, its @if arms and its @for rows`. That made the top reason in
the committed probe, 21 families, mostly an artifact of the probe itself. The probe now renders a re-export only when the
analysis of the module it comes from lists it as an exported component (`SemanticGraphArtifact.components`). That drops
57 re-exports over 21 families and drops no component (checked against the old rule export by export).

| | Before (committed probe, `58cfe994c`) | After |
|---|---|---|
| Families that build | 5 of 46: checkbox, collapsible, gridlist, tabs, toggle | **9 of 46**: also accordion, buttongroup, toolbar, tree |
| `markup outside the root template, …` | 21 families | 2 (base, slider) |
| Same probe on #834's head (modal, popover) | 7 of 46 | 11 of 46 |

## Ranked refusals

Tree: `cw/native-integration` at `58cfe994c` with the probe fix; 37 families are refused. "Families" counts each family
once per row. "Only reason" counts families for which this row is the only refusal left. "With #834" is the same probe on
#834's head (`d212a582b`), which adds the overlay primitive.

Most rows are one exact compiler message. A row written with `…` gathers messages from one message template that differ
only in the name they cite (a field, a function or a component), matched on the template's fixed words. Rows 2 and 20
are wide: they gather many different helper calls and statements, so each is a group of separate blockers, not one.

| # | Families | Only reason | With #834 | Refusal | Families blocked |
|---|---|---|---|---|---|
| 1 | 17 | 0 | 18 | … reads `…`, which is not state of this component | carousel, checklist, crop, drawer, editable, fileupload, ink, numberbox, pad, qr-code, rating, resizable, taglist, textbox, timebox, tokenbox, tour |
| 2 | 15 | 1 | 13 | … uses a call to `…`, which needs a script engine | calendar, carousel, colorpicker, datebox, drawer, menu, menubar, modal, navbar, pagination, select, slider, table, taglist, toaster |
| 3 | 13 | 1 | 0 | the dismiss event has no native meaning yet | calendar, colorpicker, combobox, drawer, hovercard, menu, menubar, modal, navbar, popover, select, tooltip, tour |
| 4 | 12 | 0 | 12 | shared state `…` of …State needs a JSON initial value known at build time | crop, drawer, editable, ink, numberbox, pad, rating, resizable, slider, timebox, tokenbox, tour |
| 5 | 12 | 0 | 12 | … while rendering writes `…`, which is not state | crop, drawer, editable, ink, numberbox, pad, rating, resizable, slider, timebox, tokenbox, tour |
| 6 | 11 | 0 | 0 | the pointerdown event has no native meaning yet | carousel, colorpicker, crop, drawer, ink, menu, modal, numberbox, pad, resizable, tooltip |
| 7 | 11 | 0 | 11 | … reads `…` as a value | crop, drawer, editable, ink, numberbox, pad, rating, resizable, timebox, tokenbox, tour |
| 8 | 10 | 0 | 10 | a style binding | colorpicker, crop, drawer, menu, otp, pad, progress, rating, resizable, toaster |
| 9 | 10 | 0 | 0 | the pointerup event has no native meaning yet | carousel, colorpicker, crop, drawer, ink, menu, modal, numberbox, pad, resizable |
| 10 | 9 | 0 | 9 | the pointermove event has no native meaning yet | carousel, colorpicker, crop, drawer, ink, menu, pad, rating, resizable |
| 11 | 8 | 0 | 8 | the @if test reads the callback `children` as a value | calendar, colorpicker, fileupload, progress, taglist, toaster, tokenbox, tour |
| 12 | 8 | 0 | 8 | the pointerover event has no native meaning yet | carousel, combobox, hovercard, menu, menubar, navbar, toaster, tooltip |
| 13 | 7 | 0 | 7 | the <output> element has no native view yet | colorpicker, crop, ink, numberbox, pad, rating, taglist |
| 14 | 7 | 0 | 7 | the pointercancel event has no native meaning yet | colorpicker, crop, drawer, ink, numberbox, pad, resizable |
| 15 | 6 | 0 | 6 | the keydown event has no native meaning yet | colorpicker, combobox, editable, numberbox, radio-group, taglist |
| 16 | 6 | 0 | 6 | the pointerout event has no native meaning yet | carousel, hovercard, menu, navbar, toaster, tooltip |
| 17 | 4 | 0 | 4 | the blur event has no native meaning yet | colorpicker, editable, numberbox, taglist |
| 18 | 4 | 0 | 4 | the paste event has no native meaning yet | datebox, taglist, timebox, tokenbox |
| 19 | 3 | 0 | 3 | the focus event has no native meaning yet | numberbox, otp, radio-group |
| 20 | 3 | 0 | 6 | … uses a statement or operator (`let`, `for…of`, `new Set`, destructuring, `&`, `??=`), which needs a script engine | calendar, datebox, navbar |
| 21 | 3 | 0 | 3 | … while rendering sets `…` from a value that follows state | carousel, fileupload, toaster |
| 22 | 2 | 0 | 2 | an @if inside an <svg>, which is drawn once when the app is built | ink, qr-code |
| 23 | 2 | 0 | 2 | markup outside the root template, its @if arms and its @for rows | base, slider |
| 24 | 2 | 0 | 2 | the <option> element has no native view yet | combobox, select |
| 25 | 2 | 0 | 2 | the <select> element has no native view yet | combobox, select |
| 26 | 2 | 0 | 2 | the `…` prop of <…> (a prop the pass cannot pass) | checklist, menubar |
| 27 | 2 | 0 | 2 | the contextmenu event has no native meaning yet | menu, menubar |
| 28 | 2 | 0 | 2 | the pointerleave event has no native meaning yet | numberbox, rating |
| 29 | 2 | 0 | 13 | … reads `event.…` (clientX, detail, pointerId, …), which a tap does not have | editable, rating |

Rows 1 (in part), 5 and 7 are mostly cascades of row 4. When a family's shared instance is refused, it has no cells. Then
every later write (`DrawerRoot while rendering writes \`drawer.open\`, which is not state`) and read of that instance is
refused on its own. In 10 of row 4's 12 families the cause is one thing: a field whose first value is `undefined`
(`given: undefined`, `seed: undefined`). The analyzer knows that value (`initialValueKnown: true`), but `isNativeValue`
rejects `undefined`, while a native expression already spells `undefined` as null (`expression-tree.ts`). Removing that
cause alone takes row 4 from 12 families to 2 (crop and drawer, for other reasons), row 5 from 12 to 2, row 7 from 11 to 2
and row 1 from 17 to 11. It makes no family build by itself. It is the first blocker taken, in its own pull request.

## Order taken

Blockers are taken from the top of the table, preferring those that finish a family real apps use (tabs, accordion,
drawer, tooltip, select or combobox, checkbox, switch, radio group, toast). Rows 3, 6 and 9 (`dismiss`, `pointerdown`,
`pointerup`) are #834's and are not taken here. Each blocker's pull request records the probe before and after.
