# An unfoldable seed reaches the served cell

U632 carried a `shared()` seed the compiler cannot fold — a module-scope `const`,
`Number.POSITIVE_INFINITY`, an imported `const` — into the SSR **render map** as
the authored expression. Its remainder was that `protocolState.cells` still held
no value for that cell, so a factory-declared `computed()` whose derive module
reads dependencies from the payload derived `NaN` on the resumed page.

The pinned row was
`SSR: a factory method's write moves every reader of the shape` in
`packages/vitest-browser/browser/seed-module-const/seed-module-const.test.ts`.
It is flipped and green.

## The mechanism

`ssr-module.ts`'s `unfoldedSharedSeedLines` emitted a bare map write:

```js
if(!marklessSsrRenderStateValues.has(id))marklessSsrRenderStateValues.set(id, { minWidth: MIN, … });
```

The render map is what the HTML is printed from, so the *server* lane looked
right. The **payload** is a separate draft object, and the client lane already
wrote both: `render-body.ts` routes a seed through `marklessStateValue(values,
state, id, value)`, which sets the map *and* calls `marklessSetStatePayloadValue`
on the served cell. The server lane simply skipped the second half.

## The fix — route (a), the preferred one

The same helper. One line in `unfoldedSharedSeedLines`:

```js
if(!marklessSsrRenderStateValues.has(id))marklessStateValue(marklessSsrRenderStateValues,marklessSsrPayloadState,id,{ minWidth: MIN, … });
```

Three things make this safe rather than lucky:

- **`marklessSsrPayloadState` is already in scope at every emission site.** The
  seed lines land in three places — the root renderer, the same-module part
  renderers, and `ssrSeedForwardBlockLines` — and all three declare
  `marklessSsrPayloadState` above the seed block.
- **Only the owning renderer records the write.** Every renderer runs
  `marklessSelectStateNodes`, which keeps only the cell records that renderer
  declares; `marklessSetStatePayloadValue` looks the cell up by id and is a
  no-op when the record is not in the selection. So the line can be emitted per
  render — six copies in the witness module — and exactly one lands.
- **The import comes for free.** `emitCatalogHelperImports` adds
  `marklessStateValue` because the emitted source now names it.

Bytes do not move for a foldable seed: `unfoldedSharedSeedLines` only fires for a
cell with no protocol value *and* an `initializerSource`, and a foldable seed has
its value folded and no `initializerSource`. `emit-byte-equality` is unchanged.

## The fix — route (b), non-finite numbers, half done

`encodeSlot` wrote a number as a bare JSON number, so `Infinity` printed as
`null`. The encoding is now a slot tag, not a record:

```json
{ "$type": "number", "value": "Infinity" | "-Infinity" | "NaN" }
```

Byte-neutral for finite numbers — the tag is only reached on the
`!Number.isFinite(value)` branch, and a test pins the exact JSON for `0, -0, 1,
-7, 3.5, 1e21, MAX_SAFE_INTEGER, EPSILON`. Both decoders (`value-decode.ts` and
the client's `value-decode-client.ts`) read it inline as `Number(slot.value)`, so
it needs no extension chunk, and `protocol-validation.ts` accepts the tag only
for those three names.

## What is NOT closed, with the measurement

There are **two** encoders for this protocol. `packages/serializer`'s
`serializeGraphValue` fills a cell at compile time and is fixed. The SSR runtime
writer is a second implementation — `packages/web/src/fns/state-slot.ts`'s
`marklessSerializeSlot`, reached through `state-serialize.ts` →
`state-payload.ts` — and it is the one route (a) now routes the seed through. It
still returns a bare number.

Measured on the witness after route (a), reading the served payload script:

```
["minWidth",1],["maxWidth",null],["width",3],["x",2]
```

The three finite fields land — which is what makes the pinned row green, since
`right` derives from `x` and `width`. `maxWidth` is `Number.POSITIVE_INFINITY`
and flattens to `null`. Before route (a) the cell carried no value at all, so
this is a *new* wrong served byte for a non-finite unfoldable seed, not a
pre-existing one.

`packages/web/src/fns/state-slot.ts` is outside this unit's file contract (the
contract names `packages/web/src/graph-runtime.ts`, which does not exist, and
`packages/web/src/fns/ssr-data.ts`, a one-line re-export). The fix there is the
same three lines as in the serializer. It was not improvised around: the
alternatives available inside the contract were a second divergent encoder
emitted from `ssr-data.ts`, which would leave the codebase with three encoders
for one protocol and still not fix client-side writes of a non-finite value.

The same tag will also need reading in the lean and inline resume lanes, which
carry their own slot decoders:
`packages/web/src/event-resume.ts:716`, `packages/web/src/fns/scalar-specialized.ts:56`,
`packages/web/src/event-only-lean/scalar-core.ts:271,361`,
`packages/web/src/event-only-lean/lean-shared.ts:381`,
`packages/web/src/inline/resumer.ts:841`.
That list is a grep for the sibling `$type === 'bigint'` branch, not a priced
completeness claim.

## Measured

- `packages/vitest-browser/browser/seed-module-const` — 9 rows green (was 7 of 8
  with the pinned row on `test.fails`). The new row asserts the seed in the
  served payload script, not just in the printed HTML.
- `packages/compiler/test` + `packages/serializer/test` + `packages/web/test` +
  `packages/runtime/test` — 326 files, 2500 passing, 1 expected fail; includes
  `emit-byte-equality` unchanged.
- `packages/serializer/test/non-finite-number.test.ts` — 13 rows: root, object
  field, client decoder, exact tag bytes, finite byte-equality, protocol
  validation accept and refuse.
- `factory-computed-after-method`, `seeded-write` — green, unchanged.
- crop, numberbox, slider — 152 rows green. `pnpm typecheck` and
  `pnpm exec vp lint --deny-warnings` clean.
- `packages/vitest-browser/browser/same-module-instance-identity.test.ts` fails
  one row (`same-module components with one state name keep distinct SSR payload
  ids` — expected 2, got 0). It fails identically with this unit's `src` changes
  stashed, so it is inherited from the merge base, not from this work.
