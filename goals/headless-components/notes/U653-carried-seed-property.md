# Carrying one seed property while folding the rest

## What the three residues actually were

U644 left a seed model that is one record per BINDING. This unit makes it one
record per PROPERTY, and the two SSR residues beside it turned out to be ordering
bugs rather than model bugs.

### 1. The fold was still all-or-nothing per record

`evaluateInitialStateValue` answers yes or no for a whole `state({...})` seed.
A seed with one unfoldable property therefore published nothing as a constant,
and the runtime had no merge base for the root's per-instance writes.

`partialInitialStateValue` in `collect-state.ts` now evaluates each property on
its own terms and returns the subset that folds. A partly folded seed carries
BOTH facts on the binding:

- `initialValue` — the folded subset, with each unfoldable property present as an
  `undefined` value;
- `initializerSource` — the authored expression, unchanged;
- and no `initialValueKnown`, which is what still routes the cell down the carry
  path in `protocol-state`, `symbol-resolver` and `state-lowering`.

The unfoldable property keeps its KEY in the subset on purpose. The field set of
the shape is read off `Object.keys(binding.initialValue)` in
`collect-shared.ts`'s `graphObjectReturnKeys`, and dropping the key there would
unregister a field the factory plainly declares — the exact defect U644's witness
was built to catch.

### 2. Two records under one graph node id

`initialValue()` in `render-data/index.ts` now emits the constant AND the
residue's `state-initializer` symbol for a partly folded seed. That puts two
records under one graph node id, which `initialValueKinds` — one kind per id —
cannot describe: the `shared-seed` entry was written last and stamped the factory
default as a per-instance seed, so the runtime ran the factory default over the
top of the real seeds.

`component-definitions.ts` now counts the symbol-function records per node. A
node with more than one keys its kinds by SYMBOL id; every other node keeps the
graph node id key it has always had. The reader in `packages/web/src/fns/shared-seed.ts`
(`initialValueKind`) asks for the symbol id first and falls back to the node id,
so **no existing module moves a byte** — `emit-byte-equality` is unchanged, 9
rows green, no fixture moved.

`applySharedSeeds` then lays the merge base down before the first per-instance
seed runs: the folded constant, and then the carried expression spread over it.
The factory record is no longer in the seeds list at all.

### The constant record is published only where a write will merge onto it

Emitting the folded constant for EVERY carried seed regressed four CSR rows in
`seed-module-const` (`ui-min-width` null, a part computed reading
`undefined-NaN`, a derive resuming `NaN` instead of `Infinity`). That family's
root writes no props, so nothing merges; the constant simply stood in for the
live value every reader of the shape is owed, and answered ahead of it.

So the constant is emitted only when the symbol resolver holds a `shared-seed`
symbol for that same node — a shape somebody actually writes per instance. A
shape nobody writes needs no base and gets none, which is exactly its behaviour
before this unit.

### 3. SSR ordering — both halves

The carried expression is a set-if-absent, and it was emitted inside
`SsrDataLines.render`, which lands AFTER the component body's own statements. The
root's `box.name = name` had already set the cell, so the guard skipped and the
factory default never landed. It is now `SsrDataLines.carriedSeed`, emitted in the
prelude right after `sharedSeedConsumeLine` — after a forwarded seed, before the
body — at both assembly sites (`ssr-module.ts` for the root, `same-module.ts` for
the module's other components).

A second half, not in the packet and only visible once the first was fixed: the
seed-pass early return in `shared-seed-pass.ts` primes the caller's map with
`staticValues.get(id)`, and a carried seed has no entry there. It primed
`undefined`, and the per-instance writes spread onto nothing. It now reads
`staticValues.has(id) ? staticValues.get(id) : (<authored expression>)`.

### Non-finite folded values

`JSON.stringify` prints a non-finite number as `null`, so a folded `1e400` — which
does fold, on the plain `Literal` path — reached the page as a silent wrong
number. `renderDataObjectSource` in `public-render/module.ts` now prints the
render-data module as the JavaScript it is: non-finite numbers are named through
the serializer's own `nonFiniteName`, never a restated tag. A payload with no
non-finite number is byte-for-byte the JSON it was, which is pinned by a row
comparing the emitted source to `JSON.stringify(renderData)`.

**The fold still refuses non-finite constants, and this is why.** There is a
second printer for the same folded values, `JSON.stringify(record)` at
`packages/bundler/src/transform.ts:721`, which prints the component definitions
the browser lanes actually load. It is outside this unit's contract. Folding
`Number.POSITIVE_INFINITY` instead of carrying it would still serve `null` on
that path, so the refusal stays and the carry — now correct — does the work.
Lifting it is a one-line change in `collect-state.ts` once the bundler's printer
is taught the same thing.

## Can crop seed `Number.POSITIVE_INFINITY` directly?

**Yes.** Not because it folds — it still does not — but because the carry now
works, on both paths, with the root's prop writes intact.

The measurement is `packages/vitest-browser/browser/seed-fold-per-property`,
whose `box-carried.tsrx` is built to crop's shape: a `shared({scope:'widget'})`
factory seeded `maxWidth: Number.POSITIVE_INFINITY` beside four literal-seeded
fields, a root that writes `name`, `disabled`, `defaultX` and `defaultWidth` from
its props, and parts reading the name, a computed tabindex, the rect and the cap.
Both pinned rows are now plain `test` and green:

- `SSR: a carried seed property still serves its own value` — the cap reads
  `Infinity`;
- `CSR: a carried seed property keeps the root's prop-derived values` — `ui-name`
  is `frame` and `ui-x` is `7` beside it.

This is inference from a family built to crop's shape, not a crop measurement —
crop was not edited. U644's alternative recommendation (seed both caps
`Number.MAX_SAFE_INTEGER` and narrow the fields to `number`) is still available
and still cheaper, since a finite cap folds and needs no carry at all. The
follow-up that changes crop either way should re-run
`vp test --project ui packages/headless/components/src/crop`; the baseline is
unchanged at 254 passed across crop, numberbox, slider and menu.

## Measured

- `pnpm typecheck` — clean.
- browser: `seed-fold-per-property`, `seed-module-const`, `factory-returns-state`,
  `seeded-write`, `handle-in-arm` — **51 passed, 0 expected fail** (was 45 passed
  with 2 pinned; the two pins flipped to plain `test`, and `seed-module-const`
  carries no pinned row).
- `packages/compiler/test` + `packages/web/test` + `packages/serializer/test` —
  327 files, 2481 passing, 1 expected fail (pre-existing).
- `packages/compiler/test/emit-byte-equality` — 9 passed, unchanged; **no fixture
  moved, 0 bytes**.
- ui: crop, numberbox, slider, menu — 254 passed. One flaky failure appeared on
  the first run and did not reproduce on either of the two runs after it.
- `pnpm exec vp lint --deny-warnings` — 0 warnings, 0 errors.

New rows: 10 in `packages/compiler/test/seed-fold-per-property` (the folded
subset and its key set, both records published together, the constant withheld
where nobody writes, the symbol-id keying and the node-id fallback, the SSR
ordering, the seed-pass prime, and the two printer rows) and 4 in
`packages/web/test/carried-seed-property` (the merge base, the order the two
symbols load in, the factory default not running as a seed, and a folded-only
seed still priming under the node-id key).
