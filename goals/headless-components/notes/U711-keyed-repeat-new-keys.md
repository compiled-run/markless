# U711 — taglist's two pinned rows, reduced to one ingredient each, and both owned by the compiler

U697 left two pinned rows in `taglist.browser.ts` and a reduction
(`packages/vitest-browser/browser/taglist-form-value/`) that was entirely green — it did not
reproduce either failure. Both are reproduced here with no family involved, each by adding exactly
one ingredient to that reduction, and both causes are compile-time decisions in `packages/compiler`.

**This unit is blocked.** The packet fenced the fix to `packages/web`, and neither cause is there.

## 1. The field never mints a row: a row attribute reading a cell outside the item

`taglist.field`'s row is:

```tsrx
@for (const tag of taglist.value; key tag) {
  <input type="hidden" name={taglist.name} value={tag} />
}
```

`value={tag}` reads the repeated item. `name={taglist.name}` reads an instance cell. That second
read is the whole ingredient.

The compiler ships a row's markup only when the client could finish the row from the item alone —
`mintableRowTemplate` in `packages/compiler/src/passes/protocol-view.ts`:

```ts
if (slot.kind !== 'text' && slot.kind !== 'attribute') return {};
if (slot.residue.kind !== 'repeat-item') return {};
```

`name={taglist.name}` is an `attribute` slot whose residue is `graph-read`, so the whole
`rowTemplate` field is dropped and the record carries no markup at all. (`resolveRowComponentMint`
in `packages/compiler/src/passes/row-mint.ts` asks the same question through `mintableFromItem`, and
refuses on the same terms.)

Everything the runtime then does follows from that record and is correct as written. In
`packages/web/src/resume-keyed-repeats.ts`:

- `builds = Boolean(repeat.rowTemplate ?? repeat.emptyArm ?? repeat.rowComponent)` is `false`, so the
  mint module is never even loaded;
- `applyKeyedRepeatRowOrder` reaches a key it has no row for and returns at
  `if (!(repeat.rowTemplate ?? repeat.rowComponent) || !mint) return;`.

That refusal is deliberate and is spelled out in `fns/row-mint.ts`: half a row is worse than none.
The runtime has no markup, no slot coordinates, and no locator records for a row the payload
declined to describe, so there is no fix for this inside `packages/web`.

Measured, not read: `packages/web/src/resume-keyed-repeats.ts` was instrumented to print every
keyed-repeat record at wiring time and reverted afterwards. The reproducing page's record came back

```
{"id":"c1:repeat:1","hasTemplate":false,"hasComponent":false,"hasEmpty":false,
 "parent":"c1:h6","found":true,
 "collection":"…shared-grow-family.tsrx#listBox/state:box","path":["items"]}
```

The parent element is found and the collection resolves; only the markup is missing.

Why the drop-and-restore half works, and why an attribute on the same host refreshes: neither needs
markup. A departed key keeps its row element in `rowRootsByKey` and re-inserts it when the key comes
back, and the host's own attribute has its own `domUpdates` record. Both are untouched by this.

**Witness:** `browser/taglist-form-value/named-row-page.tsrx` + `BoxNamedField` in
`shared-grow-family.tsrx`. Identical to the green `BoxField` except the row reads `box.name` instead
of the literal `"topics"`. Pinned `test.fails` as
`a row whose attribute reads a cell outside the item still mints`, CSR and SSR.

## 2. The stale text is not about text: it is a method call

U697 recorded this as "an attribute over the collection refreshes; a text child derived from the same
collection on the same element does not". The position is not the ingredient. Four reads of the same
cells were put on one element in the reduction and the write was made:

| read | after the write |
| --- | --- |
| `ui-count={size}` (an explicit `computed()`) | refreshes |
| `ui-seen={box.seen}` (attribute, plain cell) | refreshes |
| `{box.seen}` (text, plain cell) | refreshes |
| `{box.items.length}` (text, property of the collection) | refreshes |
| `{box.items.join('|')}` (text, method call) | **stale** |
| `ui-joined={box.items.join('|')}` (attribute, same method call) | **stale** |

An attribute spelled with the method call goes stale exactly as the text does. U697's split was a
coincidence of the two expressions `consumer-state.tsrx` happened to use — `list.value.length` is a
property, `list.value.join('|')` is a call.

The cause is a stated compile-time policy,
`packages/compiler/src/passes/semantic-graph/collect-elements.ts`:

```ts
const TEMPLATE_READ_OPTIONS: CompositeReadOptions = { unaryOperators: true };
```

with its own comment saying why: *"`methodCalls` stays off: nothing in a template is unexpressible
without it, and a computed minted for every `.format()` and `.toFixed()` in a page's text is bytes
with no behavior behind them. Widening it is its own change with its own byte measurement."*

With `methodCalls` off, `isCompositeTemplateExpression` in `semantic-graph/composite-reads.ts`
answers `false` for a `CallExpression`, so `collectCompositeTemplateExpression` returns `null` and no
synthetic computed is minted. The template read then reaches `payload-arena.ts`'s `viewDomUpdates`
with no `computedGraphNodeId`, `resolveTemplateRead` cannot resolve `box.items.join('|')` to a graph
path, and the read is dropped: **no `domUpdates` record is emitted, so `packages/web` has nothing to
subscribe.** Component-edge props already pass `methodCalls: true`
(`semantic-graph/collect-components.ts`), which is why the same expression is reactive when written
on a child tag and dead when written in markup.

**Witness:** the `joined` span in `BoxField`, pinned `test.fails` as
`an expression calling a method on the collection refreshes`, CSR and SSR, with the four green reads
beside it in `a text child over a cell and over a property of the collection refreshes`.

## What was ruled out

The double write U697 named as its leading suspect — `take()` writing `taglist.value` and then
calling `onChange`, whose consumer write re-runs the root's `taglist.value = value` in the same turn
— is not an ingredient in either failure. The reduction reproduces both with a single sibling-part
write and no callback at all. It is also not the `<form>`, not the `error`/`description` parts, and
not `required`/`invalid`; U697 had already measured those out.

## The owner questions

1. Should a row whose markup reads a cell outside the repeated item be mintable? Answering yes means
   `rowTemplate` grows a slot kind that names a graph node and a path (the value is one read per
   mint, not per row), `fns/row-mint.ts` grows a graph argument to fill it, and
   `mintableRowTemplate`/`mintableFromItem` widen together. Answering no means taglist's field cannot
   spell `name={taglist.name}` on the row and the family must be reshaped instead — and the
   compiler should say so with a diagnostic rather than silently shipping a repeat that cannot grow.
2. Should a template position mint a computed for a method call? The comment on
   `TEMPLATE_READ_OPTIONS` already frames this as its own change with its own byte measurement.
   Until it is taken, `{list.value.join('|')}` in markup is a silent dead binding, which is the part
   worth deciding on: a refusal that renders once and never moves has no diagnostic behind it.

Both edits live in `packages/compiler`, which this unit's file contract excludes.

## Files

- `packages/vitest-browser/browser/taglist-form-value/shared-grow-family.tsrx` — four extra reads on
  the field's host, and `BoxNamedField`, whose row attribute reads an instance cell.
- `packages/vitest-browser/browser/taglist-form-value/named-row-page.tsrx` — new; the same page with
  that field.
- `packages/vitest-browser/browser/taglist-form-value/taglist-form-value.test.ts` — two green rows
  and two pinned rows added; the file comment no longer says the reduction fails to reproduce.
- `packages/headless/components/src/taglist/taglist.browser.ts` — the two pin comments now name the
  measured mechanisms. No row's expectation changed.
