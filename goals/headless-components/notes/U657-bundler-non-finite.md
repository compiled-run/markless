# The bundler prints the folded non-finite number too

## The residue

U653 taught the compiler's render-data module to print a folded non-finite
number as the name the serializer already gives it, so `marklessRenderData` on
the page reads `Infinity` instead of `null`. It left a second printer over the
same folded values untouched: `JSON.stringify(record)` at
`packages/bundler/src/transform.ts:722`, which prints the component definitions
into `marklessPrerenderComponents` — the half of the module the browser lanes
actually read a seed constant out of.

Measured before the change, on a page seeding `state({ cap: 1e400, floor:
-1e400, missing: +'x', span: 3 })`, the two halves of one emitted module
disagreed:

```
marklessRenderData        …"value":{"cap":Infinity,"floor":-Infinity,"missing":NaN,"span":3}
marklessPrerenderComponents …"value":{"cap":null,"floor":null,"missing":null,"span":3}
```

`packages/web/src/settle-kernel.ts:167` reads `initial.value.value` straight out
of that record with no decode step, so `null` is what a reader of the cap got.

## What changed

`packages/bundler/src/non-finite-json.ts` — one exported function,
`jsonSourceWithNonFiniteNumbers(value)`. It walks the payload with a
`JSON.stringify` replacer; if nothing non-finite is in it, it returns that JSON
unchanged, byte for byte. Only when a non-finite number is present does it take
the second pass: each one is swapped for a marker string, and each marker is
then replaced by `nonFiniteName(value)` imported from `@markless/serializer` —
the protocol's own name, not a restated tag. The marker is prefixed with a NUL
so it cannot collide with authored text, and it grows an underscore if the
payload happens to spell it anyway.

`transform.ts` calls it in place of `JSON.stringify(record)`. That is the only
site in `packages/bundler/src` printing a compiled record this way (checked with
a grep for `JSON.stringify(record|definition|renderData|compiled|surface)` —
three other hits are module specifiers and a component name).

No dependency change: `@markless/serializer` is already a `dependencies` entry
of `@markless/bundler`, and `transform.ts` already imported from it.

## Byte identity

The no-non-finite path returns the identity-replacer `JSON.stringify`, so a
payload without one is unchanged to the byte. Two guards hold that down:

- a unit row asserting `jsonSourceWithNonFiniteNumbers(record) === JSON.stringify(record)`
  over a record with nested arrays, `null`, escapes and a newline;
- an emission row that re-stringifies the loaded definition and asserts the
  emitted module contains exactly those bytes, with no `Infinity` or `NaN` in it.

`packages/compiler/test/emit-byte-equality.test.ts` — 9 rows, green, unchanged.
The bundler's own emitted-byte pins (`shared-seed-gate`, `inline-resumer`,
`self-route-recursion`, the two music-player budget files) sit exactly where they
sat before this unit; see Measured.

## New rows

`packages/bundler/test/non-finite-definition-printer.test.ts`, 5 rows:

1. the printer spells `Infinity` / `-Infinity` / `NaN` as those names;
2. a payload with no non-finite number prints byte for byte as JSON;
3. an authored string spelling the marker stays a string;
4. the emission row — a folded `1e400` / `-1e400` / `+'x'` seed goes through
   `transformTsrxModule`, the emitted render-data module is imported as a
   `data:text/javascript` module (the way the browser loads it), and the loaded
   definition's `initialValues` constant reads `{cap: Infinity, floor:
   -Infinity, missing: NaN, span: 3}`. The serialized state cell beside it is
   decoded with the serializer's `deserializeGraphValue` and asserted equal, so
   both halves of the payload agree;
5. the finite counterpart of 4, pinning the bytes.

Row 4 fails on the parent (`"cap":null`) and passes with the change; rows 1-3
and 5 pass either way. Checked by reverting the one call site and re-running: 1
failed, 4 passed.

Why `1e400` and `+'x'` rather than `Number.POSITIVE_INFINITY` and `NaN`: the
fold's refusal (below) is on the named-constant path only. A numeric literal
that overflows, its negation, and unary `+` over a non-numeric string all fold
through `evaluateInitialStateValue`'s `Literal` and `UnaryExpression` arms with
no refusal in front of them. Those are the shapes that actually reach the
printer today.

## Can the fold's refusal be lifted now?

The refusal is `foldedConstant` at
`packages/compiler/src/passes/semantic-graph/collect-state.ts:1474`, whose stated
reason is that a folded seed is printed with JSON. **The stated reason is
discharged — but one more printer has to be taught the same thing first, and the
lift is a behaviour change worth measuring, not a one-liner to land blind.**

What I checked, and what I did not:

- The two printers the reason named are both fixed: the compiler's render-data
  module (U653) and the bundler's definitions (this unit).
- `packages/compiler/src/passes/public-render/render-body.ts:291` is a third
  printer of a folded constant — `binding.storage ? JSON.stringify(binding.initialValue)`,
  the storage-seed default, reached when a binding has no `initializerSource`,
  which is exactly the fully-folded case. A storage seed holding a non-finite
  number prints `null` there. **This is a live gap today**, not only after a
  lift, because the literal path already folds `1e400` without passing through
  `foldedConstant`. Teach it `jsonSourceWithNonFiniteNumbers`'s equivalent (or
  export one shared printer) before lifting.
- `packages/compiler/src/passes/public-render/state-entries.ts` is safe and is a
  gate of its own: `isDirectPublicLiteralValue` returns false for a non-finite
  number, which drops the whole module off the direct-DOM public-render path.
  Correct, but a lift would push more modules onto the slower path — a cost to
  measure, not a bug.
- `protocol-state.ts:109` hands the value to the serializer's encoder, which
  already tags it. `state-lowering.ts:1157` only reads key membership.
- `payload-arena.ts:505` feeds `pathInitialValue` into a `BehaviorInputValue`. I
  did not follow that to its printer. That is the one unaudited consumer.

I have no guessless receipt over every reader of `binding.initialValue`; the
list above is the grep hits for `.initialValue` in `packages/compiler/src`
excluding `initialValueKinds`/`initialValues`, eight sites, each named.

Second reason to measure rather than assume: lifting flips routing. A seed that
folds completely carries no `initializerSource` and sets `initialValueKnown`, so
the cell leaves the carry path in `protocol-state`, `symbol-resolver` and
`state-lowering`. `packages/headless/components/src/crop` now seeds both size
caps `Number.POSITIVE_INFINITY` (commit 35536f9e), so crop is the live consumer
that would flip from carry to fold. The follow-up should re-run
`seed-fold-per-property`, `seed-module-const`, `packages/web/test/carried-seed-property`,
`emit-byte-equality` and `vp test --project ui packages/headless/components/src/crop`.

## Measured

- `pnpm typecheck` — clean.
- `pnpm exec vp test packages/bundler/test packages/compiler/test/emit-byte-equality.test.ts`
  — 13 failed, 489 passed. The same 13 fail on the merge base with this unit's
  two files stashed (13 failed, 484 passed): the fixture builds, both
  music-player budget files, the doctrine guard, `dense-async-symbol-table`,
  `inline-resumer`, `self-route-recursion` and `shared-seed-gate`. The last two
  fail on compiler refusals raised since those fixtures were written
  (`MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED`, `MARKLESS_SHARED_RETURN_UNNAMED`),
  not on a byte diff. Difference between the two runs is exactly the 5 new rows.
- `pnpm exec vp test --project browser packages/vitest-browser/browser/seed-module-const packages/vitest-browser/browser/seed-fold-per-property`
  — 31 passed, 0 expected fail.
- `pnpm exec vp lint --deny-warnings` — 0 warnings, 0 errors.
