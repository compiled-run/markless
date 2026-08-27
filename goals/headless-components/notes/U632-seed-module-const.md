# A shared() seed that is not a bare literal

Crop's note (§10.1) reported that seeding a `state()` cell inside a `shared()`
factory from a module-scope `const` — or from `Number.POSITIVE_INFINITY` —
unregisters *every* field on the instance, literal-seeded fields included, and
that the only diagnostic points at a **consumer** of the shape rather than at the
seed that broke it. This reproduces exactly, the mechanism is a single line, and
it also turns out to be the whole of crop's §10.4.

## The witness

`packages/vitest-browser/browser/seed-module-const/` — one widget family whose
factory seeds four fields from four different shapes in one `state()` call: a
module-scope `const`, `Number.POSITIVE_INFINITY`, an imported `const`, and a bare
literal as the control. Parts read each field, one part declares a part-level
`computed()` over the shape, one reads a factory-declared `computed()`, a factory
method writes a field and a part handler writes another. CSR and SSR.

The literal-seeded `x` is the control on purpose: it is bound from the same
`state()` call, so when it goes missing along with the rest, the failure is the
whole shape unregistering rather than one seed being rejected.

## Red on the tip

The witness does not reach a single assertion on the tip — the family module
fails to compile:

```
MARKLESS_SHARED_SEED_UNKNOWN_FIELD: Cannot write to "gate.minWidth" because
"gateState()" declares no graph field named "minWidth". Instance callback fields
such as "minWidth" are not supported yet (tracked).
  family/gate.tsrx:96:4   ->   gate.minWidth = 5;
```

plus two `MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE` for the handler and
the sync-computed derive. Line 96 is the *consumer*. `minWidth` is declared in
the factory's `state()` twelve lines up. Nothing names the seed.

Compiling the same module directly shows why:

| seed for `minWidth` | binding on the graph | fields the factory publishes |
| --- | --- | --- |
| `1` | `initialValue: {minWidth:1,maxWidth:9,x:2}`, `initialValueKnown: true` | `minWidth, maxWidth, x, grow` |
| `MIN` (module const) | `initializerSource: "{ minWidth: MIN, … }"`, no `initialValue` | `grow` |
| `Number.POSITIVE_INFINITY` | `initializerSource: "{ … }"`, no `initialValue` | `grow` |

## The mechanism

`collect-shared.ts` read the factory's published field set off the **folded
value**:

```ts
function graphObjectReturnKeys(binding) {
  if (binding.valueKind !== 'object') return [];
  if (!isPlainRecord(binding.initialValue)) return [];   // <- here
  return Object.keys(binding.initialValue);
}
```

`evaluateInitialStateValue` (in `collect-state.ts`) folds literals, unary
operators, and objects and arrays of those. Anything else — an identifier, a
member expression — makes the fold fail, and the fold is all-or-nothing for the
whole seed object, so ONE unfoldable property drops `initialValue` for the entire
cell. `graphObjectReturnKeys` then returns `[]`, `...state` in the factory's
return contributes nothing, and the definition publishes only its methods. Every
consumer read and write is then a field the shape does not declare, and each one
is reported where it is written.

The field set is authored text. It was never the folded value's to know.

## The fix

**Fields register from the authored keys.** `graphObjectReturnKeys` keeps the
folded-value path byte-for-byte when the fold succeeded, and falls back to the
`state({…})` object's own keys otherwise. A seed carrying a spread or a computed
key still registers nothing, because there the field set genuinely is a runtime
answer and a partial list would drop fields silently.

**The value is carried as the reference, not folded.** `Number.POSITIVE_INFINITY`
cannot be folded into a graph value: `packages/serializer`'s `encodeSlot` encodes
a number as a bare JSON number, so `Infinity` would be printed as `null` and the
seed would silently become nothing. The client lane already carries the authored
expression (`render-body.ts` passes `initializerSource` to `marklessStateValue`);
the server lane did not, so its printed state map was simply missing the cell and
every server read of the shape came back `undefined`.

`ssr-module.ts` now emits, per render, for each shared cell with no protocol
value and an authored initializer:

```js
if(!marklessSsrRenderStateValues.has(id))marklessSsrRenderStateValues.set(id, { minWidth: MIN, … });
```

Emitted from `emitSsrDataLines`, which feeds both the root renderer and the
same-module part renderers, so one site covers both. It is a *set-if-absent*: a
component-body seed and a root-forwarded seed keep precedence over the factory
default, which is what a factory default means. Per render rather than at module
scope so two requests never share one mutable seed object.

**A seed nothing would bind is refused at the seed.**
`MARKLESS_SHARED_SEED_UNRESOLVED_VALUE` names the factory, the field and the
offending expression. The bindable set is exactly what the emitted copy carries:
factory locals, this file's carried module-scope declarations, its imports, and
globals. Registration still happens on the refusal path, so a refused seed does
not also produce a pile of misdirected consumer errors.

One measured landmine while building this: the first cut of that walk descended
into TypeScript type annotations and refused menu's
`null as { readonly x: number; readonly y: number } | null`, reporting `x` as an
unbound name. A type annotation spells types, not values. The walk now stops at
`TSType*` and steps through `TSAsExpression` to its expression.

## §10.4 — the factory computed that "freezes after a method write"

**Confirmed as this defect misattributed, with one honest remainder.**

U630 could not reproduce it, and `packages/vitest-browser/browser/factory-computed-after-method/`
is green on this tip: a factory-declared `computed()` over factory cells, moved by
a factory method and by a part handler, on an attribute and in text, CSR and SSR
— 24 rows, all passing. Its seed is a bare literal.

The witness here is the same shape with an unfoldable seed, and its factory
computed is the one row that does not go green: after the method write, the SSR
lane serves `NaN`. The raw cell on an attribute moves correctly (`ui-width` → 4)
and a *part-level* `computed()` over the identical cells moves correctly
(`2-6`). So the freeze crop reported is not a property of factory `computed()`;
it is a factory `computed()` reading a cell whose seed never reached the payload.

The remainder is that seed. The reference carry fixes the server's *render* map,
but `protocolState.cells` still carries no value for an unfoldable seed, so the
factory computed's derive module — which reads its dependencies from the payload
rather than from the render map — reads `undefined` and derives `NaN` on the
resumed page. Closing it means either giving the payload cell the authored
expression the same way, or teaching `packages/serializer` a non-finite number
encoding so `Infinity` can be folded. Both are outside this unit's contract
(`collect-state.ts`, `packages/serializer`), and neither is guesswork: the witness
row that pins it is `SSR: a factory method's write moves every reader of the shape`.

Crop's `undefined`-means-no-limit workaround can be dropped for the module-const
half today. A factory `computed()` over a seed that still cannot fold should wait
for the payload half.

## Measured

- `packages/compiler/test/seed-module-const/` — 11 rows: every seed shape
  registers all four fields, no consumer is blamed, the imported seed keeps its
  authored expression in the emitted server module, the refusal names factory +
  field + expression, and a literal-seeded factory still folds and refuses
  nothing.
- `packages/compiler/test` — 224 files, 1753 passing, including
  `emit-byte-equality`: bytes are unchanged for literal-seeded factories.
- `packages/vitest-browser/browser/seed-module-const` — 7 of 8 green (4 CSR, 3
  SSR); the eighth is the payload remainder above.
- `factory-computed-after-method` and `seeded-write` — 24 rows green, unchanged.
- crop, numberbox and slider — 152 rows green.
- `pnpm typecheck` clean; `pnpm docs:errors:check` in sync at 200 codes.
