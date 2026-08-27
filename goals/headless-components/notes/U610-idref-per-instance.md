# IDREF presence per reading instance: the defect is narrower than reported, and its fix straddles the contract

Blocked. The measurement below moves the problem from "IDREF presence is decided
for the module" to one named leak with a bisect, and shows why closing it needs
two files this unit was not given.

## What the framework already does

U377 (`541e96e9`) already serves IDREF presence per widget instance. A widget's
seed phase files one seed-map entry per element() handle some part of that
instance binds, under `markless:element-bound|<handle>`; the compiled residue
reader omits an IDREF whose handle has no entry
(`elementHandleIdReadCase` in `packages/compiler/src/passes/public-render/shared-seed-pass.ts`).

`packages/vitest-browser/browser/idref-per-instance/idref-per-instance.tsrx` is
the plain form of the shape the packet asked for: one family, three instances,
only the first placing the `Panel` part that binds `panelEl`, the root writing
`aria-controls={widget.panelEl}`. **It is green on this tip, CSR and SSR** - the
two bare instances write no attribute, and no IDREF on the page resolves to
nothing. So the general capability is not missing.

## The actual defect: an enclosing widget's roster is inherited

`nested-family.tsrx` is the menu shape: an outer family rooted by `Bar`, an inner
family rooted by **every** `Item`, and the inner family's `Content` part written
inside the one item that opens it. Page: `plain-one`, `nesting` (holding
`Content`, which itself holds `deep-one` and `deep-two`), `plain-two`.

Measured red, CSR and SSR: `plain-one`, `plain-two`, `deep-one` and `deep-two`
all carry `aria-controls` naming an id that resolves to nothing. Exactly the
menu report - the four leaves, none of which bound `contentEl`.

`no-bar.tsrx` is the bisect: the same three `Item`s, the same `Content`, with
`Bar` deleted. **Green, CSR and SSR.** So the trigger is not the family, not the
recursion and not the cross-module placement - it is having an enclosing widget.

The mechanism, from the two twins that file the roster:

- The enclosing widget's seed phase walks its whole projection and files one
  entry per handle any part under it binds. That walk descends *through* a
  nested widget root's own projection, so `Bar` files `contentEl` - a handle of
  the INNER family, belonging to the `nesting` item's instance - onto `Bar`'s
  seed map.
- Every nested `Item` instance starts its own map from the inherited one
  (`fileBoundElementHandles`: `new Map(seeded ?? inherited ?? [])`). So each
  plain `Item` inherits `element-bound|contentEl` and reads "bound".

The roster key carries the handle but not the instance, so an entry filed by one
instance answers for every instance that inherits it. With no enclosing widget
there is nothing to inherit and the same items are correct.

## The fix, and why it is out of contract

The clean shape is to key the roster entry by the widget-instance token the read
side already computes to mint the id: file
`markless:element-bound|<instance-token>|<handle>` and read the same. Presence
then holds exactly when the instance that mints the id also filed the handle, and
an inherited entry naming another instance's token is inert rather than wrong.
Alternatively, stop the filing walk at a nested widget root; either way both
twins must change together, or the served bytes and the CSR render disagree.

- SSR half: `ssr-module.ts` `handleLines` + `projectedHandleEdgeIdsUnder` -
  **in contract**.
- Read half: `elementHandleIdReadCase` in `shared-seed-pass.ts` - **in contract**.
- CSR half: `projectionHandleChildNames` / `boundElementHandlesOf` /
  `fileBoundElementHandles` in **`packages/web/src/fns/element-handle-roster.ts`
  - not in this unit's contract**, and its caller `packages/web/src/fns/shared-seed.ts`
  is not either.

Changing only the in-contract halves makes every shared IDREF vanish on CSR (the
reader would look for a token-qualified key the CSR filing never writes), which
is strictly worse than the leak. Hence blocked rather than partial.

## The `@if` instance is not expressible today

The packet's fourth instance - a panel rendered inside an `@if` that gains and
loses the attribute with the arm - does not compile on this tip, measured twice
in `idref-per-instance.tsrx`:

- `@if (widget.armed) { <Panel>gated</Panel> }` (the part placed in the arm) →
  `MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED`: "cannot be rebuilt when
  widget.armed changes because `<Panel>` has to run to produce its content".
- `@if (widget.armed) { <div el={widget.panelEl} …/> }` (the handle bound on a
  plain element in the arm) → two errors: the same
  `MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED` ("it holds a attribute binding",
  pointing at `el=`), plus `MARKLESS_ELEMENT_HANDLE_DUPLICATE`, because a second
  binding site for one shared handle is refused for the module even though at
  most one of the two renders per instance.

So an element() handle cannot be bound inside a flippable `@if` arm at all
today. That refusal lives in `packages/compiler/src/passes/symbol-modules.ts`,
and lifting it is arm-rebuild work in `packages/runtime/**` and
`packages/web/src/render-csr.ts` - all three outside this contract, the last two
explicitly forbidden. `MARKLESS_ELEMENT_HANDLE_DUPLICATE` is in contract
(`semantic-graph/diagnostics.ts`) but is not worth relaxing alone.

The runtime half of the owner's direction ("CSR/resume adds it when the handle
binds and removes it when the bound element leaves") lands in
`packages/web/src/fns/element-handle.ts`, which the packet forbids.

## Does this retire the two-handle `aria-labelledby` idiom?

Partly, and for fewer families than U604 assumed. The families that write an
IDREF naming a handle of an INNER, per-item widget family - the ones exposed to
this leak - are:

- **menu** - `aria-controls={item.itemContentEl}` and `aria-labelledby={item.itemEl}`
  (`menu.tsrx:739`). The reported case.
- **accordion** - `aria-labelledby={item.labelEl}` on `accordion.itemcontent`
  (`accordion.tsrx:210`), naming `accordion.itemlabel`.
- **tree** - `aria-labelledby={item.labelEl}` (`tree.tsrx:246`); tree also
  carries the plural `labelEls` on the outer family beside the singular
  `labelEl` on `treeItemState`, which is the two-handle idiom in its clearest
  form.
- **tour** - `aria-labelledby={item.titleEl}` and `aria-describedby={item.descriptionEl}`
  on the card (`tour.tsrx:196`), naming two optional parts of `tourItemState`.

These four are latent, not currently red: the leak only shows where a page MIXES
items that place the part with items that do not, and outside menu's submenu
scenarios the shipped scenarios place the part on every item. This is the shape
of the risk, not an exhaustive audit - I read the four files named above and
grepped `aria-labelledby` across family `.tsrx`; I have no guessless receipt, so
read it as "these four, and possibly others".

The single-family cases - toggle, select, textbox, slider, combobox, progress,
togglegroup, radio-group, datebox, colorpicker, popover, modal, calendar,
numberbox, checkbox, fileupload, carousel - already get correct per-instance
omission from U377 wherever the widget is not nested inside another one, which
`idref-per-instance.test.ts` now pins.

## Menu lane, on this tip

`pnpm exec vp test --project ui packages/headless/components/src/menu/menu.browser.ts -t axe`:
**12 passed, 88 skipped**. The two pinned rows still pass, meaning they still
observe exactly `['aria-valid-attr-value']` - the violation is unchanged and the
pin is not stale. Nothing in this unit touched `menu.browser.ts`.

## What landed

Witnesses only, all under `packages/vitest-browser/browser/idref-per-instance/`:
6 rows, 4 green and 2 pinned expected-fail. The two pins are the reproducer; they
turn red the moment presence becomes per instance, and the fix is to delete
`.fails`. axe-core is not a dependency of `packages/vitest-browser` and that
package.json is outside this contract, so `idrefs.ts` asserts the
`aria-valid-attr-value` rule directly: every id in an `aria-controls`,
`aria-labelledby` or `aria-describedby` value must resolve inside the page.

## To unblock

Re-cut with `packages/web/src/fns/element-handle-roster.ts` and
`packages/web/src/fns/shared-seed.ts` added to the contract, and the `@if`
instance dropped from the goal (or split into its own unit that owns
`symbol-modules.ts`, `packages/runtime/**` and `render-csr.ts`). The
`emit-byte-equality` requirement is unaffected by the token-keyed roster on
pages where every instance binds: the same entries are filed, only under longer
keys, and the seed map is not served bytes - but that has not been measured yet.
