# U716 — a row that reads outside its item now mints, and stops one step short of green

U714's design is built: the protocol carries the fact, the compiler emits it, the runtime fills it.
What it does not do yet is land the read on the right graph node when the repeat lives inside a
composed child, which is every real page including taglist's. **This branch must not merge on its
own** — see "What is still missing" below.

## What landed

**Protocol.** `ProtocolRowTemplateSlotValue` (`packages/serializer/src/protocol.ts`) is the value
channel both `textSlots` and `attributeSlots` entries carry beside their `path` (and, for attributes,
`name`):

```ts
export type ProtocolRowTemplateSlotValue =
	| { readonly itemPath: ReadonlyArray<string> }
	| { readonly graphNodeId: string; readonly graphPath: ReadonlyArray<string> };
```

`assertRowTemplateSlotValue` in `packages/serializer/src/protocol-validation.ts` requires exactly one
of the two: both is two answers for one position, neither writes `undefined` where the server wrote a
value. Half the graph pair is neither channel and is refused too. Pinned in
`packages/serializer/test/protocol.test.ts` — "a row slot names the item or a graph node, and exactly
one of the two" — including the mixed row (an attribute off the graph, text off the item) that is the
shape needing this at all.

**Compiler.** `mintableFromItem` became `mintableSlotValue`
(`packages/compiler/src/passes/row-mint.ts`): it answers where a slot's value comes from, or `null`.
`repeat-item` gives `itemPath`; `graph-read` gives the `graphNodeId`/`graphPath` pair;
`authored-expression`, `element-handle-id` and `element-handle-id-list` stay `null`. Both halves of
the one decision read it — `mintableRowTemplate` (`passes/protocol-view.ts`) for the template,
`resolveRowComponentMint`/`projectionIsMintable` for the component wrapper — so the two cannot
disagree. `mintableRowTemplate`'s return type is now taken off `ProtocolViewPayload` rather than
restated.

**Diagnostic.** `rowMintRefusal` (`passes/public-render/row-mint-diagnostics.ts`) asks
`mintableSlotValue` the same question, so the warning and the withheld template stay one decision.
The `outside-read` clause is replaced by `unfillable-read`, which carries the read **in the author's
own words** and the attribute name when there is one, so the message reads

> This @for row over entry sets class from `chosen === entry.code ? 'picked' : 'plain'`, which only
> rendering produces — the browser fills a row from entry and from state the page holds, and this is
> neither.

Severity is untouched: still the one `KEYED_REPEAT_ROW_MINT_UNSUPPORTED_SEVERITY` constant, still
`warning`.

**Runtime.** `mintRowNodes`/`mintRow` (`packages/web/src/fns/row-mint.ts`) take an optional
`RowMintGraph` (`Pick<RuntimeGraph, 'read'>`) and fill graph-pair slots from `graph.read` **once**, at
mint. `resume-keyed-repeats.ts` passes the graph it already holds; `fns/row-component-mint.ts`
forwards it into the wrapper mint. Both new imports are types and erase, so the demand-loaded mint
module gains no static edge — its one value import is still `dom-attribute`.

`resume-types.ts` needed no edit: `ResumeKeyedRepeatRecord` is
`NonNullable<ProtocolViewPayload['keyedRepeats']>[number]`, so it followed the serializer for free.

**One read at mint is the ruling, and the source says why.** A row host carries no per-instance
locator, so the repeat ships no `domUpdates` for it and a **served** row's `name={taglist.name}` does
not refresh either. A minted row that kept itself current would disagree with the rows beside it.

## Emit-byte measurement

`packages/compiler/test/emit-byte-equality.test.ts` moved by **three lines, in one fixture, and no
shipped record**:

- `keyed-repeat` — `publicRenderPlan.diagnostics[0]`: `message`, `why` and the suggestion, all
  diagnostic prose. Its row is `class={chosen === entry.code ? 'picked' : 'plain'}`, an authored
  expression, which stays refused; only the wording of the refusal changed.

Every other fixture is byte-identical, and no fixture grew a `rowTemplate`. Pay-per-use holds: a row
with no outside read emits no new key.

## What is still missing, measured

The row **mints**. In `packages/vitest-browser/browser/taglist-form-value/`, the named-row page now
builds the third hidden input with the right `value`; only its `name` is empty. Instrumenting the
mint and the wiring (both reverted) gave the reason exactly:

```
REPEAT-PROBE collection:  "c0:shared:…/shared-grow-family.tsrx#listBox/state:box"
MINT-PROBE   slot id:     "shared:…/shared-grow-family.tsrx#listBox/state:box"   value: undefined
```

The repeat's `collectionGraphNodeId` is **composed** — qualified with the child instance's path —
before the runtime ever sees it. The row template's slot id is not, so it names a node the live graph
does not hold and the read answers `undefined`.

Composition happens in files this unit's contract excludes:

- `packages/web/src/fns/ssr.ts:1318` and `:1611` — both child keyed-repeat composition sites, each
  writing `collectionGraphNodeId: mapped.graphNodeId` from
  `marklessCsrRemapChildKeyedRepeat(...)`.
- `packages/web/src/fns/instance-scope.ts:~923` — the same qualification for an arm-scoped record
  set (a minted row's own repeats).

The helper already exists and is the right one: `marklessCsrRemapChildGraph(record, graphProps,
instancePath, registry)` in `packages/web/src/fns/composition.ts:564` maps exactly a
`{ graphNodeId, path }` pair, and is what `marklessCsrRemapChildDomUpdate` uses. Mapping each
`rowTemplate` text/attribute slot's graph pair through it at those three sites is the change.

**One ruling that change needs and this packet does not carry.** `marklessCsrRemapChildGraph` answers
`null` for a read of a prop the invocation site never passed live — the child already rendered its
final value and there is nothing to wire. A `domUpdate` in that case is simply dropped, because a
value that cannot change needs no subscription. A **row slot** cannot be dropped: the mint would then
write nothing where the server wrote a value. The two honest answers are to bake the rendered value
into the record as a literal third channel, or to drop the whole `rowTemplate` for that row and warn.
That is an owner call, not an improvisation.

Until it lands, a repeat whose row reads outside its item and which sits inside a composed child
**grows rows with an empty outside read** where before it did not grow at all. On a page whose repeat
is not composed (page-level state, page-level `@for`) the read resolves and the row is correct.

## Pins

- `packages/vitest-browser/browser/taglist-form-value/taglist-form-value.test.ts` — "a row whose
  attribute reads a cell outside the item still mints" (CSR and SSR) stays `test.fails`, and its
  comment now names the one remaining step: the row builds, the name does not arrive.
- `packages/headless/components/src/taglist/taglist.browser.ts` — "the form field hands back one
  entry per tag under one name" is untouched, still `test.fails`, for the same reason.
- The other pinned row in both files — an expression calling a method on the collection — is U711's
  second owner question (`TEMPLATE_READ_OPTIONS` in `passes/semantic-graph/collect-elements.ts`) and
  nothing here touched it.

## Compiler tests that moved with the ruling

- `test/keyed-repeat-row-mint.test.ts` — the two outside-read rows now assert the graph pair; a new
  row pins that a value only rendering produces still ships no template.
- `test/keyed-repeat-row-mint-producer.test.ts`, `test/keyed-repeat-row-component.test.ts`,
  `test/part-row/keyed-repeat-part-row-mint.test.ts` — their unmintable fixtures were plain outside
  reads, which now mint; each was moved to a method call, which is the refusal that remains.
- `test/part-row/keyed-repeat-widget-read-row-mint.test.ts` — the three inverted rows, plus a new one
  pinning the loud refusal at its new boundary.
- `test/keyed-repeat-row-mint-diagnostic.test.ts` — the `unfillable-read` clause, pinned on naming
  the read rather than its category.
