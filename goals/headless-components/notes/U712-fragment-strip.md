# U712 — the render-data fragment stripper reads TypeScript, it no longer sniffs JavaScript

The caveat U702 measured and U705 left live: `stripEmittedTypesFromFragment` in
`packages/bundler/src/transform.ts` decided whether to reprint by asking whether the fragment
already parses as JavaScript. A generic call is TypeScript that *is* valid JavaScript with a
different meaning, so it passed that gate and shipped verbatim.

Receipt for the old behaviour, run against the same oxc the bundler loads:

```
transformSync('markless-emitted.js', 'const CAP = pick<Limit>(WIDTH);')
  errors: 0    code: "const CAP = pick < Limit > WIDTH;"
```

Zero errors means the old gate returned the fragment untouched, and the browser then evaluated two
comparisons where the author wrote a call. This reached the three authored render-data slices only
(the residue reader, its module-scope declarations, its imports); symbol modules and the source
module always took the full reprint, and the compiler closed its own side in U702 (symbol modules)
and U705 (the SSR module).

## The fix: parse as TypeScript, reprint only a tree that carries TypeScript

`fragmentCarriesTypeScript` parses the fragment with oxc's `parseSync` under `{ lang: 'ts' }` and
walks the tree for TypeScript-only syntax. A tree with none returns the fragment's exact bytes; a
tree with any goes through the existing fail-closed `stripEmittedTypes`.

The walk is the same principle as the compiler's `carriesTypeScript`
(`packages/compiler/src/passes/public-render/authored-strip.ts`), re-implemented rather than
imported — the bundler does not depend on compiler internals, and it walks an oxc AST rather than a
yuku one. Markers: a `type` name starting with `TS`; `importKind`/`exportKind === 'type'`; the flags
`declare`, `abstract`, `definite`, `override`, `accessibility`; `readonly === true`;
a non-empty `implements`. Verified against oxc directly, one construct at a time:

| Authored | What the oxc TS parse carries |
| --- | --- |
| `pick<Limit>(WIDTH)` | `TSTypeParameterInstantiation`, `TSTypeReference` |
| `x as number` | `TSAsExpression` |
| `foo!.bar` | `TSNonNullExpression` |
| `import type { A } from 'x'` / `import { type A, b }` | `importKind === 'type'` |
| `export type { A }` / `export { type A, b }` | `exportKind === 'type'` |
| `class C implements D {}` | `implements` non-empty, `TSClassImplements` |
| `class C { readonly x = 1 }` | `readonly === true` |
| `class C { declare x }` / `abstract class C {}` / `override m()` | the matching flag |
| `class C { x!: number }` | `definite === true` |
| `class C { private x = 1 }` | `accessibility === 'private'` |
| `const o = { a: 1 }` / `function f(a, b) { return a + b }` | nothing — byte-identical path |

The rolldown loader was widened from "the `transformSync` binding" to "the module", so `parseSync`
comes from the same lazily-resolved import. The lazy load still matters for the reason the existing
comment gives: `rolldown/experimental` binds native code that must never enter the browser module
graph.

### A parse failure now answers "yes, it carries TypeScript"

`fragmentCarriesTypeScript` returns `true` when the TS parse reports errors, when `parseSync`
throws, and when no parser is available. That hands the verdict to `stripEmittedTypes`, which is
fail-closed and names the module. The old gate's `false`-on-failure had the same effect by a
different route; the new spelling makes "we could not tell" and "we can tell there is none"
different answers, and only the second one licenses a silent pass-through.

## A meaning change worth stating plainly

`a < b > (c)` in authored source is now emitted as `a(c)`, not as two comparisons. That is correct,
not a regression: the authored file is a `.tsrx`, TypeScript is its language, and TypeScript reads
that spelling as a generic call. The old gate shipped the JavaScript reading of a fragment the
author wrote in TypeScript — those are the two different programs the defect was made of.

## No fixture moved, and no chunk anchor moved

`git status` after the change lists exactly the two edited files. No snapshot under
`packages/bundler/test/__snapshots__` moved, and the pin that would have caught it —
`every virtual module a TypeScript-free source emits stays byte-identical` — passes untouched.
The anchor-sensitive suites pass unchanged: `chunking.test.ts`, `build-determinism.test.ts`,
`fixture-builds.test.ts`, `render-order-sweep.test.ts`.

This is expected from the mechanism: a fragment with no TypeScript-only node returns its input
string, so every emission that was already TypeScript-free is byte-for-byte what it was. Only a
fragment that actually carried TypeScript changes, and those were already wrong.

## It is also cheaper than the gate it replaces

The old gate ran a full `transformSync` (parse plus codegen) purely to read the error count. The new
one parses and walks, with no codegen. Measured over 200 iterations on a ~60-line fragment with a
residue-reader arrow at the end:

```
old js-probe transform x200:  230 ms
new parse+walk x200:           90 ms
```

## Pins

`packages/bundler/test/render-data-type-strip.test.ts`, 4 new tests (10 in the file). Two are
end-to-end through `transformTsrxModule`, reading the real render-data virtual module for a source
whose module-scope declarations the residue reader lifts:

- a generic call — `const CAP = pick(WIDTH);` present, `pick<Limit>` absent, and the whole module
  still parses clean as JavaScript.
- an `as` assertion and a non-null `!` — `const LOUD = WIDTH + 1;` and `const FORCED = BOX.n;`
  present, `as Limit` and `BOX.n!` absent.

Two go at the seam directly, which is why `stripEmittedTypesFromFragment` is now exported from
`transform.ts` (module-internal; `transform.ts` is not a package entry point, and
`stripEmittedTypes` beside it was already exported for `build/delegate-loader.ts`):

- each of the three shapes stripped in isolation.
- byte-identity for TypeScript-free fragments, including odd spacing (`const  spaced   =  1 ;`) and
  a multi-line function body the printer would have reformatted, plus the `onlyRemoveTypeImports`
  path for a value import.

The byte-identity pin is the one that keeps the fast path honest: without it, "always strip" would
pass every other assertion in the file while reformatting every render-data module in the repo.

## Suite state

`pnpm typecheck` clean. `pnpm exec vitest run --project node packages/bundler`: 67 files,
507 passed, 0 failed. Whole node project: 465 files, 3619 passed, 1 expected fail, 37 skipped,
0 failed.

The `emitted runtime gzip wall exceeded` failure U702 and U705 both recorded as standing baseline
noise does **not** fire at this tip — `fixture-builds.test.ts` is green.

`pnpm fmt` was not run. `goals/` is in `.gitignore` (line 23; the 31 existing notes are tracked
only because they were force-added), so this note lives on disk and is not part of the commit.

## For whoever picks this up next

All three emission seams now decide by a TypeScript parse rather than by sniffing: symbol modules
(U702, compiler printer under `strip: true`), the SSR module (U705, `authored-strip.ts`), and the
render-data fragments (here). The bundler's `stripEmittedTypes` whole-module path was never
affected — it always passed `markless-emitted.ts`.
