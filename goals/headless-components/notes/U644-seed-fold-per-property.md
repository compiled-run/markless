# The seed fold, property by property — and the two residues it cannot reach

## What the drop actually is

U643 measured the axis right: a `shared()` seed folds when it is written as
literals and does not fold when one property is a name or a member expression,
and the value's finiteness has nothing to do with it. What U643 could not see is
*why* an unfolded seed silently empties the per-instance layer. It is not that
the values are dropped. It is that two different things end up wearing one label.

A folded seed publishes its factory default as a `constant` record in the
component's `initialValues`. The root's per-instance writes (`crop.name = name`)
publish as `shared-seed` symbol records **with the same graph node id**. The
runtime relies on exactly that pairing —
`packages/web/src/fns/shared-seed.ts`, `applySharedSeeds`:

```ts
const factory = initials.find(
  (candidate) => candidate.graphNodeId === initial.graphNodeId && candidate.value.kind === 'constant',
)?.value;
if (!seeded.has(initial.graphNodeId) && factory?.kind === 'constant')
  seeded.set(initial.graphNodeId, structuredClone(factory.value));
```

An unfolded seed publishes its factory default as a `state-initializer` symbol
record instead — same graph node id, different kind. Two consequences, both
silent:

- there is no `constant` record to prime from, so the per-instance seeds are
  merged onto nothing;
- `initialValueKinds` (built in
  `packages/compiler/src/passes/public-render/component-definitions.ts`) holds
  **one kind per graph node id**, and the `shared-seed` entries are written last,
  so the factory's `state-initializer` record is stamped `shared-seed` too. The
  runtime then runs the factory default *as if it were a per-instance seed*, over
  the top of the real ones.

Measured on a two-record module, compiled directly:

| seed | `Root.initialValues` kinds | `initialValueKinds[id]` |
| --- | --- | --- |
| `{ …, maxWidth: 9 }` | `constant`, `shared-seed`, `shared-seed` | `shared-seed` |
| `{ …, maxWidth: Number.MAX_SAFE_INTEGER }` | **`state-initializer`**, `shared-seed`, `shared-seed` | `shared-seed` |

That is the whole mechanism. "The fold is all-or-nothing" is the cause; the
misclassified factory record is the thing that eats the values.

## The witness

`packages/vitest-browser/browser/seed-fold-per-property/` — a crop-shaped family:
the root takes `name`, `disabled`, `defaultX`, `defaultWidth` and writes all four
into the shared instance; parts read the name, a `tabindex` computed off
`disabled`, the rect, and the cap. Three families over one shape, differing only
in how the cap is spelled:

- `family/box.tsrx` — `maxWidth: Number.MAX_SAFE_INTEGER` (a member expression)
- `family/box-literal.tsrx` — `maxWidth: 9007199254740991` (the control)
- `family/box-carried.tsrx` — `maxWidth: Number.POSITIVE_INFINITY`

Stash receipt, `collect-state.ts` stashed, everything else in place:
**3 failed | 13 passed** — and every failure is on the member-expression family,
with the literal control green beside it:

```
CSR: … keeps the root's prop-derived seed values   expected '' to be 'frame'
CSR: … keeps the root's prop-derived rect          expected '0' to be '7'
SSR: … keeps the unwritten seed property           expected 'undefined' to be '9007199254740991'
```

With the fix: **17 passed | 2 expected fail (19)**. The two expected fails are the
residues below, pinned by name rather than left silent.

## The fix

`collect-state.ts`'s `evaluateInitialStateValue` folded a `Literal`, `undefined`,
and objects/arrays/unary operators over those. It now evaluates each seed property
on its own terms, and a whole seed folds when every property does:

- **A module-visible `const`.** The identifier is resolved through the semantic
  view (`resolvedSymbolAt`), the module-scope `const` it actually resolves to is
  found by matching `declaredSymbolAt` on the declarator, and that declarator's
  initializer is folded. Chains fold (`const A = 1; const B = A;`), with a
  `visiting` set so a cycle refuses instead of recursing. A `let` does not fold —
  it is not a constant. A shadowing local does not fold, because the symbol ids
  do not match.
- **A frozen constant on a global.** `Number.X` and `Math.X` only, and only when
  `Number`/`Math` resolves to no module binding, and only when the property is a
  non-writable non-configurable data property holding a number or a string. That
  admits `Number.MAX_SAFE_INTEGER`, `Number.EPSILON`, `Math.PI`; it refuses
  `Number.parseInt`, which is a method, not a value this build may read for a page.
- **Bytes do not move for a literal-only seed.** Nothing on the literal path
  changed. `packages/compiler/test/emit-byte-equality.test.ts` is unchanged, and
  the full compiler suite is 226 files / 1777 passing / 1 expected fail.

One existing row had to be repointed inside its own directory:
`packages/compiler/test/seed-module-const/` asserted the carried SSR line using
`{ minWidth: MIN, … }`, a same-module const that now folds. The assertion's
subject is the carry, so the seed was changed to an imported `LIMIT`, which is
genuinely unfoldable. Its intent and every other row in that file are untouched.

## What is NOT closed, and the exact measurement

**A seed property that cannot be folded is still all-or-nothing.** Two kinds of
property remain unfoldable:

- an *imported* const — this build cannot read another module's binding;
- a *non-finite* constant (`Number.POSITIVE_INFINITY`, bare `Infinity`, `NaN`) —
  the fold deliberately refuses these, because a folded value is printed into the
  render-data module with `JSON.stringify` at
  `packages/compiler/src/passes/public-render/module.ts:114`, and JSON has no form
  for a non-finite number. Measured on a `1e400` literal, which does fold today:

  ```
  "initialValues":[{…,"value":{"kind":"constant","value":{…,"maxWidth":null}}}]
  ```

  The served protocol payload is fine — U638's slot tag
  (`{"$type":"number","value":"Infinity"}`) is in the cell — but the page reads
  `null`. So folding an infinity would have traded a silent drop for a silent
  wrong number, and the fold leaves it on the carry instead.

Carrying a property *while folding the rest* is the piece this unit could not
build inside its contract. It needs three things, all outside it:

- `initialValue()` in `packages/compiler/src/passes/render-data/index.ts` emits
  exactly **one** record per binding — a `constant` or a `symbol-function`, never
  both. A split seed needs both: the folded subset as the `constant` the runtime
  primes from, and the residue's initializer symbol beside it.
- `unfoldedSharedSeedLines()` in
  `packages/compiler/src/passes/public-render/ssr-module.ts` starts with
  `if (cell.value !== undefined) return [];`, so the moment a cell carries a
  folded subset the residue's SSR line stops being emitted.
- `initialValueKinds` in
  `packages/compiler/src/passes/public-render/component-definitions.ts` is keyed
  by graph node id, so even with both records present the runtime still cannot
  tell the factory default from a per-instance seed.

Folding a non-finite constant instead of carrying it needs only the first of
those printers changed (`module.ts:114`), plus whatever reads the same JSON on
the client.

**SSR has a second residue, newly visible.** `unfoldedSharedSeedLines` emits its
carried expression as a set-if-absent, and it lands *after* the root's
per-instance writes in the same render. So on SSR a carried seed loses its own
value the moment the root writes any prop into the shape — the cell is already
set, the guard skips, and the factory default never lands. Pinned by
`SSR: a carried seed property still serves its own value` (expected fail); it
reads `undefined`. This is why the pre-existing `seed-module-const` witness never
caught it: that family's root writes no props.

## Can crop drop `undefined`-means-no-limit?

**Not with `Number.POSITIVE_INFINITY`, and yes with `Number.MAX_SAFE_INTEGER` —
subject to one measurement this unit was not allowed to take.**

Crop was not edited, so this is inference from a family built to crop's shape,
not a crop measurement. The witness *is* the experiment: same root-writes-props
layer, same cap-read-by-a-part, three spellings of one cap.

- `Number.MAX_SAFE_INTEGER` — 16 of 16 green. A finite cap folds, the per-instance
  layer survives, and no `undefined` branch is needed. For an image crop this is
  indistinguishable from no limit.
- `Number.POSITIVE_INFINITY` — the carried path, with both residues above. Crop
  would still lose `name`, `disabled` and the seed rect.

So the recommendation is: crop can drop the `undefined` branch by seeding both
caps `Number.MAX_SAFE_INTEGER` and narrowing the fields to `number`, and the
follow-up that does it should re-run
`vp test --project ui packages/headless/components/src/crop` — U643's baseline is
58 passed — because that is the only measurement that settles it. Seeding
`Number.POSITIVE_INFINITY` stays blocked on the render-data printer.

## Measured

- `packages/vitest-browser/browser/seed-fold-per-property` — 17 passed, 2 expected
  fail; 3 failed / 13 passed with `collect-state.ts` stashed.
- `packages/compiler/test/seed-fold-per-property` — 16 rows: each fold shape, the
  `constant` factory record the runtime primes from, the four refusals
  (non-finite, bare `Infinity`, shadowed global, method-valued property, `let`,
  imported const), and the unchanged `MARKLESS_SHARED_SEED_UNRESOLVED_VALUE`.
- `packages/compiler/test` — 226 files, 1777 passing, 1 expected fail, including
  `emit-byte-equality`.
- browser: `seed-fold-per-property`, `seed-module-const`, `factory-returns-state`,
  `seeded-write` — 41 passed, 2 expected fail.
- ui: crop, numberbox, slider, menu — 254 passed.
- `pnpm typecheck`, `pnpm exec vp lint --deny-warnings` clean;
  `pnpm docs:errors:check` in sync at 200 codes (no new code was needed — the
  existing refusal still covers the refusal path).
