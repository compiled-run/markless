# The bundler's non-finite printer is now the serializer's

The bundler carried its own copy of `jsonSourceWithNonFiniteNumbers` in
`packages/bundler/src/non-finite-json.ts`, a twin of the one the serializer now
owns beside `nonFiniteName`. The copy is deleted; `packages/bundler/src/transform.ts`
imports the shared printer from `@markless/serializer` (already a bundler
dependency) and prints component definitions with it.

## What changed

- Deleted `packages/bundler/src/non-finite-json.ts`.
- `transform.ts` folds `jsonSourceWithNonFiniteNumbers` into its existing
  `@markless/serializer` import block and calls it as
  `jsonSourceWithNonFiniteNumbers(record) ?? 'undefined'`, matching the
  compiler's call sites in `passes/public-render/module.ts` and
  `passes/public-render/shared.ts`.
- `packages/bundler/test/non-finite-definition-printer.test.ts` imports the
  printer from `@markless/serializer`. Its collision decoy now spells the
  serializer's placeholder (`' markless-non-finite0'`, a leading space) instead
  of the deleted copy's NUL-prefixed one; with the old decoy that test asserted
  nothing about the printer it was actually calling.

## Can an `undefined` record reach the call site

No, on the evidence available. `record` is the rest of a destructuring over the
component definition, so it is always a fresh plain object, and `JSON.stringify`
of a plain object returns a string — the two ways the shared printer returns
`undefined` (a top-level `undefined`, function or symbol, or a `toJSON` that
returns nothing) cannot arise from a rest object built out of compiler
render-data.

Measured, not only argued: a probe that threw on `undefined` at that exact call
site was run over the whole bundler suite plus the compiler's byte-equality
lane — 503 tests across 68 files — and never fired. The `?? 'undefined'` is
there to satisfy the shared `string | undefined` signature, not to cover a live
path.

## Emitted bytes

Unchanged. `packages/compiler/test/emit-byte-equality.test.ts` and the byte pins
in `packages/bundler/test/fixture-builds.test.ts` pass. The one failing case in
that file is the runtime gzip wall, and it fails identically with the change
stashed out: `emitted runtime gzip wall exceeded: 23586 > 23583`, the same three
bytes over on the merged base. It is not this change.

The two printers differed only in their internal placeholder — the bundler's
began with a NUL, the serializer's with a space — and in how each tested the
payload for a collision (escaped spelling versus raw spelling). Neither
placeholder survives into the output: each is replaced by the number's name
before the source is returned, so the printed bytes are the same either way.

## Not measured

`packages/bundler/test/render-order-sweep.test.ts` failed in a full-directory
run alongside the pre-existing budget failure, and a baseline run of it alone
did not finish inside the time available. It is outside this unit's verify set
and untouched by this change, but it carries no baseline receipt here.
