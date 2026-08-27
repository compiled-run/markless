# A handle bound inside a flippable arm already works. The refusal was never about the handle

The premise this unit inherited — "an `element()` handle cannot be bound inside a
flippable `@if` arm" — is wrong, measured. `el={handle}` inside a flippable arm
compiles today, files its element when the arm renders, and unfiles it when the
arm goes away, CSR and SSR, served open and served closed. What is refused is a
different thing that the earlier reading could not separate from it: the **id**
an IDREF elsewhere makes the bound element carry.

## What the tip actually does

`packages/vitest-browser/browser/handle-in-arm/` is the witness. One family, one
widget-scoped `panelEl`, bound on a `<div>` inside `@if (widget.open)`, with a
`probe` handler that reads the handle and marks what it found.

Four rows, **green on the tip before any change in this unit**:

- CSR served closed, SSR resume served closed: the probe reads `undefined` while
  the arm is gone; after the toggle flips it open, the same probe reaches the
  live element and stamps it; after it flips closed again the probe reads
  `undefined`; a second open files a fresh binding rather than doubling the first.
- CSR served open, SSR resume served open: the arm the render painted files its
  handle at startup, and the same open/close cycle follows.

The mechanism is already whole, in two halves that were both already there:

- Compiler: `branchArmRecords` in `protocol-view.ts` already emits a per-arm
  `elementHandles` set, filtered to the hosts inside that arm's chunk. The new
  compiler row in `packages/compiler/test/handle-in-arm/` pins it: the branch
  ships a flip module and its arm record carries `panelEl`.
- Runtime: `materializeBranchArmRecords` in `resume-branches.ts` registers each
  arm handle against the host it claims under `branch:<id>:arm:<n>:<path>`, and
  `disposeRemovedRangeHosts` runs **before** the journal is applied, so the
  outgoing arm's hosts reach `disposeHost` → `elementHandles.deleteHost` →
  `unfile` while they are still inside the range. One live entry per key at all
  times, which is what stops `resume-locators.ts`'s `get` from throwing
  `ambiguousElementHandleError` on the flip.

So no compiler refusal needed lifting for the handle, and no arm-rebuild code
needed writing. That is the headline: the families working around this with
`hidden` did not have to.

## What is refused, and why

Add one IDREF naming the same handle — `aria-controls={widget.panelEl}` on the
widget root — and the module stops compiling:

    MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED: this @if (widget.open) cannot be
    rebuilt when widget.open changes because it holds a attribute binding.

The IDREF is what makes the bound element carry a minted `id`, and that id is an
`attribute` slot with an `element-handle-id` residue sitting inside the arm
chunk. `renderChunkParts` in `symbol-modules.ts` refuses every slot kind it has
no arm part for, and reported the slot KIND — "a attribute binding" — which reads
as though `el=` itself were the problem. It is not; without the IDREF the same
arm compiles and the four rows above pass.

The id cannot be respelled by a flip. `elementHandleIdReadCase` mints it as
`'mx-' + (widgetInstanceToken + handleGraphNodeId).replace(/\W+/g,'-')`, and the
token is a seed-map value the render phase holds. A `branch-update` symbol is
called with `{ graph, arm, branchId, composedBranchId, element, getElementHandle }`
and nothing else: no `idPrefix`, no seed reader. The seed map is not in the
resume payload at all (nothing under `seed` in `resume-types.ts` or
`packages/serializer/src/protocol.ts`), so the token is not reachable from the
graph either.

**Change landed here:** the refusal now names its real cause instead of the slot
kind (`armSlotRefusalDetail` in `symbol-modules.ts`), so the next reader is not
sent looking for a binding that is not there. Pinned by the second compiler row.

## The IDREF presence flip is out of contract

Making the IDREF appear and disappear with the arm needs one of:

- The widget-instance token reaching a `branch-update` symbol. That is a new
  payload channel: `packages/serializer/src/protocol.ts` and
  `protocol-view.ts`, neither in this contract.
- Restating the mint in the runtime. `elementHandleIdReadCase` exists precisely
  so the id-carrying side and the naming side cannot be spelled differently;
  a third spelling in `resume-branches.ts` is the defect that doc forbids.
- The arm record carrying the resolved id, minted at render. The minting render
  is `fns/ssr.ts` and `ssr-data/renderer.ts` (forbidden), and the record is
  assembled in `protocol-view.ts` (not in contract).

Worth knowing before that unit is cut: today the roster is deliberately WIDER
than what renders — `projectionHandleChildNames` in `element-handle-roster.ts`
walks branch arms unconditionally and files the handle, with the comment that
"hearing about a part that turns out not to render leaves the IDREF present".
So if the refusal were simply lifted with no id channel, a served-closed page
would carry `aria-controls` naming nothing: a dangling IDREF, which is exactly
the `aria-valid-attr-value` failure `idref-per-instance/idrefs.ts` reports.
Lifting the refusal without the id flip would be a regression, not a fix.

The fourth-instance `@if` row planned for `browser/idref-per-instance` is
therefore not addable as a green browser row: it is a compile refusal, and it
lives in `packages/compiler/test/handle-in-arm/` as one.

## Ruling: one handle bound in two arms of one branch stays refused

    @if (a) { <div el={x}/> } @else { <div el={x}/> }
    → MARKLESS_ELEMENT_HANDLE_DUPLICATE: Cannot bind element handle "panelEl"
      to multiple live host elements.

**Refused, deliberately.** Three reasons, in order of weight:

1. The author loses nothing. The same page is expressible with one binding site
   and no duplication — `<div el={x}>@if (a) { A } @else { B }</div>` — and that
   spelling is also what a reader would rather find. A rule that costs no
   capability is worth keeping.
2. It is not expressible where the check lives. The duplicate check in
   `collect-elements.ts` compares binding SITES per scoped handle;
   `SemanticElementHandleBinding` carries `keyedRepeatScopeIds` and `rowOwner`
   and nothing about branch arms, so "these two sites are sibling arms of one
   branch" cannot be asked there. Stamping an arm scope onto the binding is
   `collect-markup.ts`, outside this contract.
3. Getting it wrong fails quietly. Two live entries under one key make
   `resume-locators.ts`'s `get` throw only when both happen to be filed at once;
   a dispose/register ordering slip instead hands a handler the dead arm's
   element, and the handler runs and moves the wrong node. That is the class of
   defect this refusal exists to end.

Pinned by the third compiler row, so the ruling is a test rather than a memory.

## What landed

- `packages/vitest-browser/browser/handle-in-arm/` — 4 green rows, the capability
  witness. They pass on the tip too: they pin behaviour that was already correct
  and undocumented, which is why the workaround kept being written.
- `packages/compiler/test/handle-in-arm/` — 3 green rows: the arm record carries
  the handle; the IDREF case refuses and says why in the id's own terms; the
  two-arm case is a duplicate.
- `packages/compiler/src/passes/symbol-modules.ts` — `armSlotRefusalDetail`.
  Also fixes the article ("a attribute" → "an attribute") for the generic case.

Nothing in the runtime changed, so served bytes are unchanged by construction
for every module — not only for modules with no handle in an arm.
