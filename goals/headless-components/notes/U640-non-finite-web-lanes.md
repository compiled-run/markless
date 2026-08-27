# A non-finite number survives every web lane

The serializer half of this shipped already: `serializeGraphValue` writes a
non-finite number as `{"$type":"number","value":"Infinity"|"-Infinity"|"NaN"}`,
byte-neutral for finite numbers, and both serializer decoders read it. The
remainder was on the web side — one encoder that still wrote a bare number, and
five resume-lane decoders that had no branch for the tag.

## The served byte, before and after

The witness is `packages/vitest-browser/browser/seed-module-const`. Its
`shared()` factory seeds `maxWidth: Number.POSITIVE_INFINITY`, which the
compiler cannot fold, so the SSR runtime writes the cell through
`marklessStateValue` → `marklessSetStatePayloadValue` → `state-serialize.ts` →
`marklessSerializeSlot`. Measured by reverting the encoder branch and reading
the served `script[type="markless/state"]`:

```
before: [["minWidth",1],["maxWidth",null],["width",3],["x",2]]
after:  [["minWidth",1],["maxWidth",{"$type":"number","value":"Infinity"}],["width",3],["x",2]]
```

A new factory `computed` in the fixture reads that field:
`headroom = gate.maxWidth - gate.width`. On the SSR page a click on `grow`
forces the derive to re-run off the **served** cell instead of the render map,
and the reverted tree reads exactly `-4` there (`null - 4`), not `Infinity`.
That is the red both new rows show; both are green with the branch in.

## The encoder

`packages/web/src/fns/state-slot.ts` is the SSR runtime's own implementation of
the same protocol the serializer owns. Its number branch now splits out:

```ts
if (typeof value === 'number')
    return Number.isFinite(value)
        ? value
        : { $type: 'number', value: String(value) as NonFiniteNumberName };
```

`String(value)` is not a restatement of the three names — for a non-finite
number it *is* the protocol's value, and `Number(slot.value)` on the decoding
side is its exact inverse. The tag's shape comes from the serializer:
`import type { NonFiniteNumberName } from '@markless/serializer'`, which makes a
rename of the tag a typecheck failure here rather than a silent divergence.

### Why a type import and not `nonFiniteName`

The serializer exports a runtime `nonFiniteName(value)` doing the same mapping,
and importing it would have been the more literal reading of "protocol facts are
imported from their owning package". It was not taken, for a measured reason:
`nonFiniteName` lives in `packages/serializer/src/value.ts` (12,546 chars) and is
reachable only through the package root export, so a runtime import pulls
`value.ts` plus the serializer index into whatever closure reaches
`fns/state.ts`. `event-only-resume-closure.test.ts` bans
`packages/serializer/src/value.ts` outright from the full-resume, payload-resume
and render-csr closures, so that direction is a wall, not a preference. The type
import carries the same fact at zero shipped bytes.

## The decoders

Six sites now carry the branch. The list came from a grep for the sibling
`$type === 'bigint'` branch plus a sweep of every `$type` read under
`packages/web/src` — a text search, not a priced completeness receipt:

- `event-resume.ts` `deserializeSlot` — full event-resume lane.
- `fns/scalar-specialized.ts` — the one-cell specialized reader; previously
  threw `MARKLESS_PAYLOAD_INVALID` on the tag.
- `event-only-lean/lean-shared.ts` `decodeScalarSlot` — previously `undefined`.
- `event-only-lean/scalar-core.ts` `decodeScalarSlot` — previously fell through
  to `new Date(value)`, i.e. an Invalid Date.
- `event-only-lean/scalar-core.ts` `validateScalarSlot` — the lean shape gate;
  previously threw, sending every non-finite page to full resume.
- `inline/resumer.ts` shared graph policy `decode` — previously fell through to
  `slot.value`, handing a `graph-truthy` condition the **string** `"Infinity"`.

The lean validator checks the round trip rather than three literals:

```ts
tagged.$type === 'number' &&
!Number.isFinite(Number(tagged.value)) &&
String(Number(tagged.value)) === tagged.value
```

## Closure walls: nothing moved

Every entry `event-only-resume-closure.test.ts` governs was re-measured with the
test's own import walker before and after. All eleven are byte-identical:

| entry | before | after |
| --- | --- | --- |
| `event-only-resume.ts` | 2,961 | 2,961 |
| `resume.ts` | 19,277 | 19,277 |
| `resume-runtime.ts` (the anchor) | 20,970 | 20,970 |
| `payload.ts` | 18,071 | 18,071 |
| `render-csr.ts` | 111,252 | 111,252 |
| `resume-async-boundaries.ts` | 8,374 | 8,374 |
| `resume-behaviors.ts` | 11,494 | 11,494 |
| `resume-branches.ts` | 20,909 | 20,909 |
| `resume-keyed-repeats.ts` | 20,960 | 20,960 |
| `fns/row-mint.ts` | 7,167 | 7,167 |
| `resume-sync-computed.ts` | 2,290 | 2,290 |

The wall is 20,983, and `resume-runtime.ts` sits 13 bytes under it — which is
exactly why no branch went into a governed file. None of the six decoder sites
is in any of these closures (the walker resolves `event-only-resume.ts` to a
single file, `resume.ts` to five, `payload.ts` to six), and the type imports
this unit adds are erased by the walk and by the build. No budget was raised.

## What the change does cost

Raw source growth, none of it inside a governed closure:

| file | before | after | delta |
| --- | --- | --- | --- |
| `fns/state-slot.ts` | 2,785 | 3,161 | +376 |
| `fns/scalar-specialized.ts` | 1,914 | 2,101 | +187 |
| `event-resume.ts` | 25,069 | 25,160 | +91 |
| `event-only-lean/scalar-core.ts` | 15,868 | 16,261 | +393 |
| `event-only-lean/lean-shared.ts` | 15,390 | 15,447 | +57 |
| `inline/resumer.ts` | 47,239 | 47,303 | +64 |

The only per-page cost is the inline resumer, whose body is serialized whole
into every SSR document. Measured on the emitted string from
`createInlineResumerSource` with both graph-policy flags on: **14,272 chars with
the branch**, and the branch is one line —
`if (tagged.$type === "number") return Number(tagged.value);` — 62 chars with
its indentation and newline, before minification.

## Measured

- `packages/vitest-browser/browser/seed-module-const` — 12 rows green (was 9).
  The two new rows are the served-payload tag and the resumed derive, CSR and
  SSR; both were confirmed red with the encoder branch reverted.
- `packages/web/test/non-finite-web-lanes` — 37 rows across five files, one per
  decoder lane plus the encoder (tag bytes, finite byte-equality for
  `0, -0, 1, -7, 3.5, 1e21, MAX_SAFE_INTEGER, EPSILON`, and a round trip through
  the serializer's client decoder).
- `packages/web/test` + `packages/serializer/test` — 100 files, 690 passing.
- `--project browser`: `seed-module-const`, `seeded-write`,
  `progressive-counter`, `crazy-impl-b909-parity` — 25 passing.
- `--project ui`: crop + numberbox — 122 passing. The combined pair was run five
  times: two runs lost one numberbox row to a timeout, three were clean, and
  numberbox alone was clean. The row is `CSR: a whole currency string can be
  typed back into the field it came from`, a `userEvent.fill` + poll row on the
  client-render path, which serves no state script and so reaches none of the
  six decoders. Recorded as a browser-lane flake, not a regression.
- `pnpm typecheck` and `pnpm exec vp lint --deny-warnings` clean.

## Not closed

`packages/serializer`'s `protocol-validation.ts` accepts the tag only for the
three names; the lean validator here accepts any string that round-trips to a
non-finite number, which is the same set. No web lane validates the tag against
an imported list, because the serializer exposes the names only as a type.
