# U671 — folding a non-finite seed

The compiler refused to fold `Infinity`, `-Infinity` and `NaN` (and the frozen
`Number.*` constants that evaluate to them) into a `shared()` seed, so a seed
property like `caps: Number.POSITIVE_INFINITY` was handed to the carried-
expression path instead of becoming a constant. The serializer has printed those
values as the names that denote them since U665 (`jsonSourceWithNonFiniteNumbers`
beside `nonFiniteName`), and web's decoders read the `{"$type":"number",
"value":"Infinity"}` tag, so the refusal was the last holdout.

## What moved

**`passes/semantic-graph/collect-state.ts`.** `foldedConstant` is gone. It was
the whole refusal: a two-line wrapper that turned a non-finite result into
`{ ok: false }`, called from `frozenGlobalProperty` (so `Number.POSITIVE_INFINITY`
refused) and from `evaluateNamedConstant` (so a module `const` chain ending in one
refused). Both now return the evaluated value. A bare `Infinity` / `NaN`
identifier resolves through `frozenGlobalProperty('globalThis', name)` and folds
by the same route. A direct `1e400` literal never went through the wrapper and
already folded, which is why `seed-module-const/folded-non-finite-emit-agreement`
was green before this unit.

**`passes/public-render/state-entries.ts`.** Two changes, one refusal and one
printer. `isDirectPublicLiteralValue` returned `Number.isFinite(value)` for a
number, which dropped the *whole module* off the direct-DOM CSR path when any
cell held one; it now admits every number. `literalExpression` was the sixth bare
`JSON.stringify` printer and wrote `null`; it now calls the serializer's
`jsonSourceWithNonFiniteNumbers`, with its `undefined` result standing in for the
old explicit `undefined` branch. Measured on a single-component `state({ total: 1,
caps: Number.POSITIVE_INFINITY })`: the emitted cell map is now
`new Map([["state:score", {"total":1,"caps":Infinity}]])` and the module keeps
`createMarklessDirectChunkRenderer` instead of falling off the path.

**`passes/payload-arena.ts` — NOT lifted; see below.**

## Crop

`crop.tsrx` seeds `maxWidth` / `maxHeight` with `Number.POSITIVE_INFINITY`.
Compiling it now yields exactly one record for
`shared:src/crop/crop.tsrx#cropState/state:crop`, of kind `constant`, and the
render-data module prints `"maxWidth":Infinity`. Before this unit that node
carried a `constant` plus a `symbol-function` factory default beside it. No crop
source or behaviour changed; the only crop edit is the paragraph in
`crop/note.md` that described the two caps as riding beside the folded subset as
a carried expression, which is no longer true. Crop pins no emission shape in
code — the carried-shape claim lived only in that prose.

## Emit byte equality

Byte-identical. `packages/compiler/test/emit-byte-equality.test.ts` and the four
suites under `emit-byte-equality/` (barrel-alias, roster-key, seed-children-text,
shared-return-shape) are 13/13 green with no re-anchor, because no fixture seeds
a non-finite value and `jsonSourceWithNonFiniteNumbers` returns `JSON.stringify`'s
own bytes when a payload holds none.

## The behavior-input site is a live defect, not a lift

`payload-arena.ts:545` declines a numeric literal that overflows to a non-finite
number (`install(1e400)`). U665 read that as a third site to lift. It is not:
accepting it is strictly worse than refusing it, and the refusal now carries a
one-line reason at the site plus a pin in
`test/non-finite-seed/non-finite-seed.test.ts`.

Measured with the guard removed. `behaviorInputValues` recorded
`[Number.POSITIVE_INFINITY]`, and the emitted view payload script read:

    "inputValues":[null]

The seed path survives because a state cell's value is tagged by
`serializeGraphValue` before JSON ever sees it — the same fixture's state script
carries `["caps",{"$type":"number","value":"Infinity"}]`. The view payload has no
such stage. `renderPayloadScripts` (`packages/serializer/src/payload-scripts.ts`)
writes it with a bare `JSON.stringify`, and it must stay parseable JSON because
the runtime recovers it with `JSON.parse`
(`packages/serializer/src/protocol-validation.ts`) — so the render-data module's
trick of printing JavaScript names is not available here. Both readers then hand
`inputValues` to the behavior undecoded:

- `packages/web/src/render-csr.ts`, `behaviorInputs: behavior.inputValues ?? []`
- `packages/web/src/resume-behaviors.ts`, `behaviorInputs`,
  `record.inputValues !== undefined ? [...record.inputValues] : …`

Lifting it needs a tagged input value in the view payload plus a decode on both
of those read paths — three files outside this unit's contract, two of them in
packages this unit was told not to touch.

## Residue

Eight pins in
`packages/compiler/test/seed-fold-per-property/seed-fold-per-property.test.ts`
are red and the file is outside this unit's contract. They are not defects: the
file uses `Number.POSITIVE_INFINITY` as its stand-in for "a property that cannot
fold", which this unit made foldable. The repair is a re-anchor onto an
expression that genuinely does not fold — the file already knows several (a
`let`, a shadowed global, a `parseInt` call) — plus deleting or inverting the two
tests that name the refusal directly:

- `a non-finite constant is not folded` (line 104) and `a bare Infinity is not
  folded either` (line 113): now false; the equivalent positive pins live in
  `test/non-finite-seed/non-finite-seed.test.ts`.
- `const carried` (line 191): swap `Number.POSITIVE_INFINITY` for a genuinely
  unfoldable expression. The five tests reading `carried` — partial fold,
  constant-plus-carry, no-constant-without-root-writes, kinds keyed by symbol id,
  carry-lands-before-writes — then pin what they were written to pin. The sixth,
  `the seed pass primes a carried seed from its own expression`, greps the SSR
  source for `Number.POSITIVE_INFINITY` and needs the same substitution.
- `a folded non-finite number reaches the render-data module as a name` (line
  305, the `1e400` case) is green and stays.
