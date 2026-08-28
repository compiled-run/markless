# U714 — a row that reads outside its item is mintable, but the payload has no field to carry it

**This unit is blocked, on the serializer.** The cockpit's ruling (yes, such a row is mintable) is
clear and the compiler and runtime edits are both small and inside this packet's contract. The one
thing that is not inside it is the only place the new fact can live: the row template's slot shape
is declared and validated in `packages/serializer`, and every reader — compiler emitter and web
runtime alike — is typed off that declaration.

## What the record can say today, and why it cannot say this

`ProtocolViewPayload['keyedRepeats'][number]['rowTemplate']`, in
`packages/serializer/src/protocol.ts` (the type opens at line 302; `keyedRepeats` at 368,
`rowTemplate` at 431):

```ts
readonly rowTemplate?: {
    readonly html: string;
    readonly textSlots?: ReadonlyArray<{
        readonly path: ReadonlyArray<number>;
        readonly itemPath: ReadonlyArray<string>;
    }>;
    readonly attributeSlots?: ReadonlyArray<{
        readonly path: ReadonlyArray<number>;
        readonly name: string;
        readonly itemPath: ReadonlyArray<string>;
    }>;
};
```

Every slot entry names its value as `itemPath`, a property path off the repeated item, and nothing
else. A read outside the item is a `graph-read` residue — `{ graphNodeId, path }`
(`SemanticMarkupResidue` in `packages/compiler/src/artifacts.ts:895`) — and there is no field for the
node id. So the emitter cannot spell it.

Nor can it smuggle it. `assertOptionalRowTemplateSlots` in
`packages/serializer/src/protocol-validation.ts:534` runs `assertStringArrayField(slot, 'itemPath')`
on **every** entry, and that validator is on the live resume path: `packages/web/src/payload-full.ts`
calls `assertProtocolViewPayload` before the runtime sees the record. A slot without `itemPath`
throws at boot. And `packages/web` cannot read an extra field even if one survived validation:
`ResumeKeyedRepeatRecord` is `NonNullable<ProtocolViewPayload['keyedRepeats']>[number]`
(`packages/web/src/resume-types.ts:127`), so the runtime's view of the record IS the serializer's
type. Restating the shape locally would be exactly the "protocol facts imported from their owning
package, never restated as literals" rule this repo holds.

That is the whole blocker. It is one type and one validator.

## The shape to grow (proposed, for whoever owns the serializer edit)

Make the value channel a union of the two ways a row slot gets its value, rather than adding a
parallel array — the mint already walks one list per position, and a row mixing item reads with
outside reads (which is exactly `taglist.field`) must keep them in one ordered list:

- `packages/serializer/src/protocol.ts` — in both `textSlots` and `attributeSlots`, keep `path` and
  (for attributes) `name` required, and make the value either `itemPath` **or** a new pair
  `graphNodeId: string` + `graphPath: ReadonlyArray<string>`.
- `packages/serializer/src/protocol-validation.ts` — `assertOptionalRowTemplateSlots` requires
  exactly one of the two: `itemPath` a string array, or `graphNodeId` a string with `graphPath` a
  string array. Neither present, or both, is an invalid payload.

Pay-per-use holds: a row with no outside read emits no new key, so its record stays byte-identical.

## What the rest of the change looks like (measured, not guessed — all inside this contract)

**Compiler.** `mintableRowTemplate` (`packages/compiler/src/passes/protocol-view.ts:498`) refuses at

```ts
if (slot.residue.kind !== 'repeat-item') return {};
```

That becomes: `repeat-item` emits `itemPath` as now; `graph-read` emits `graphNodeId` +
`graphPath` from the residue; every other residue (`authored-expression`, `element-handle-id`,
`element-handle-id-list`) stays a refusal, because those genuinely cannot be carried.
`mintableFromItem` (`packages/compiler/src/passes/row-mint.ts:133`) widens on the same terms — it
gates the component-wrapper row, which must admit the same slots the template does or the two halves
disagree.

**Diagnostic.** It already exists and does not need inventing: `rowMintRefusal` in
`packages/compiler/src/passes/public-render/row-mint-diagnostics.ts:84` returns
`{ kind: 'outside-read' }` today for any non-`repeat-item` residue, and
`keyedRepeatRowMintUnsupportedDiagnostic` (`public-render/diagnostics.ts:141`) reports it as a
warning. The widening narrows that refusal to the residues that stay uncarriable, and the message —
currently "reads a value that is not a property of item" — should name the read instead of the
category. So the ruling's "say so rather than drop silently" half is already built; only its
boundary moves.

**Runtime.** `mintRowNodes` in `packages/web/src/fns/row-mint.ts` takes a graph and, per slot, reads
`graph.read(slot.graphNodeId, slot.graphPath)` instead of `readPath(item, slot.itemPath)`. The graph
is already threaded to the module: `resume-keyed-repeats.ts` calls
`loadRowMint(input.renderData, input.graph, rowComponentHost)` at both mint sites (lines 184 and
260), so `RowMintHost.__marklessRowMint` already carries a `graph?: RuntimeGraph` parameter. Only
`mintRow`/`mintRowNodes` and their two callers (`resume-keyed-repeats.ts`,
`fns/row-component-mint.ts:128`) need the argument passed down.

**One read at mint is correct, and this is why.** A row host inside a repeat row chunk carries no
per-instance locator — `packages/compiler/src/passes/public-render/types.ts:69` states it:
"repeat-row emission unsets it — rows never carry per-instance locators" — so the repeat record ships
`rowEvents` and `rowElementHandles` in row-relative coordinates and no `domUpdates` for row hosts at
all. The **served** rows' `name={taglist.name}` therefore does not refresh when `taglist.name`
changes. Filling a minted row once, at mint, makes it behave exactly like the rows beside it. Keeping
minted rows updated would make them diverge from served rows, which is a worse bug than the one being
fixed. If outside reads in rows should be reactive, that is a separate change that gives row hosts
per-row dom-update records — and it applies to served rows first.

## Tests that pin the current refusal and must move with the ruling

- `packages/compiler/test/part-row/keyed-repeat-widget-read-row-mint.test.ts` — three of its four
  tests assert `rowTemplate` is `undefined` for a widget read in a row, plus the warning. Under the
  ruling the attribute and text cases mint, and the fourth test's `owned?.rowTemplate` expectation
  inverts.
- `packages/compiler/test/__snapshots__/emit-byte-equality.test.ts.snap` — fixtures with such rows
  move by exactly the new `rowTemplate` key; each mover needs its own attribution line.
- `packages/vitest-browser/browser/taglist-form-value/taglist-form-value.test.ts` — the pinned
  `a row whose attribute reads a cell outside the item still mints` row (CSR and SSR) unpins.
- `packages/headless/components/src/taglist/taglist.browser.ts` — `the form field hands back one
  entry per tag under one name` unpins.

The second pinned row in that witness — `an expression calling a method on the collection refreshes`
— is a different mechanism (`TEMPLATE_READ_OPTIONS` in
`passes/semantic-graph/collect-elements.ts`) and is untouched by any of this. It is U711's second
owner question and needs its own byte measurement.

## The blocked question

May a follow-up packet edit `packages/serializer/src/protocol.ts` (the `rowTemplate` slot shape
inside `ProtocolViewPayload['keyedRepeats']`) and `packages/serializer/src/protocol-validation.ts`
(`assertOptionalRowTemplateSlots`)? Nothing else in the serializer needs to move, and without those
two the compiler cannot emit the fact and the runtime cannot read it.
