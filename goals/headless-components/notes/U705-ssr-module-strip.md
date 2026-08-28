# U705 — the SSR module is JavaScript now, without reprinting its template

U702 stripped types at `printEmittedModule`, which covers every symbol module because each is
printed from an AST. It explicitly did not cover the SSR module: `public-render` assembles
`publicRenderModule.ssrModuleSource` as **text**, splicing authored spans into a hand-written
template, so `const BASE: Limit = WIDTH;`, `{ cap = WIDTH as Limit }`, `pick<Limit>(x)!` and
`x satisfies T` all survived into a file that dev SSR (the vite module runner) serves raw.

This unit closes that without reformatting the module: **the template is still text; only the
spliced spans are reprinted, and only when a span actually carries TypeScript.**

## The mechanism

`packages/compiler/src/passes/public-render/authored-strip.ts` is the new seam. One span in, one
span out:

1. Wrap the span into a parseable program by shape — an expression as
   `const marklessSsrSpan = (<span>\n);`, a binding pattern as `const <span> = marklessSsrSpan;`,
   statements bare (and, on failure, inside `function marklessSsrSpan() { … }`, because a component
   body's guard `return` is not a valid program on its own).
2. Parse it as TypeScript with `collect: true`, so a span that does not stand alone is a value
   (`null`) rather than a thrown compile abort.
3. **Ask whether the tree carries TypeScript at all.** If it does not, return the span
   byte-for-byte. This is the whole reason no fixture moved.
4. Otherwise reprint with `yuku-codegen`'s `generate(program, EMISSION_PRINT_OPTIONS)` — the same
   options object U702 pinned, `strip: true` included — and unwrap.
5. If the printer reports errors, throw `SsrStripError` naming both the construct and the splice
   site: `a module-scope declaration carried into the SSR module … parameter properties cannot be
   stripped to JavaScript`.

The `carriesTypeScript` predicate is structural, not textual: any node whose `type` starts with
`TS`, plus `importKind`/`exportKind === 'type'`, `declare`, `abstract`, `definite`, `override`,
`accessibility`, `readonly`, and a non-empty `implements`. That is why `"a as b"` and
`` `x ${y} z` `` are untouched — a string is a string to a parser, and the forbidden move here was
regex stripping precisely because it is not.

Reused rather than respelled: `EMISSION_PARSE_OPTIONS` and `EMISSION_PRINT_OPTIONS` are imported
from `emit-codegen.ts`, so the SSR seam cannot drift from the symbol-module seam's option choices.
The `yuku-tsrx` landmine U702 recorded still holds — its re-exported `generate` ignores `strip` —
so the import is from `yuku-codegen` directly.

## The splice sites, found by compiling and reading the emitted module

Measured, not grepped: a fixture carrying TypeScript in every band was compiled and its
`ssrModuleSource` dumped, then each surviving construct traced to the line that spliced it. Nine
sites, all now routed through the seam:

| Splice | Site | Shape |
| --- | --- | --- |
| Carried module-scope declarations | `ssr-module.ts` (`moduleScopeLines`) | statements |
| Component-body statements | `render-body.ts` `renderBodyLines` | statements |
| Prop destructuring defaults | `shared.ts` `destructureProps` | expression |
| State initializers | `render-body.ts` `stateDeclarationLine` | expression |
| Computed derives | `render-body.ts` `computedDeclarationLine` | expression |
| Shared-state seed values | `render-body.ts` `sharedStateSeedLine` | expression |
| Async/sync computed runners | `html.ts` `ssrAsyncRunnerSource` | expression |
| Authored residue reads, branch arm tests, repeat collections | `ssr-module.ts` SSR-data emitter | expression |
| Child component prop values | `ssr-module.ts` edge props | expression |

`destructureProps`, `renderBodyLines` and the `html.ts` collectors are reached only from
`ssr-module.ts` and `same-module.ts` — both SSR — so stripping inside them touches nothing else.
`authoredResidueReadCases` is shared with the CLIENT residue reader, so it takes the strip as an
**optional** callback: the SSR caller passes one, the client caller does not, and the client
render-data module is byte-unchanged.

## What deliberately stays TypeScript: the residue `case` label

`case "(count as number) + 1":return (count + 1);`

The label is the id `renderData` names the residue by. Rewriting it would stop the switch matching
what the renderer asks for. It is a string literal — data, not code — exactly as U702's
`export const authoredSource = "…"` is. Only the returned expression is stripped. The JS-parse pin
blanks case labels before parsing and says why.

## Emit byte-equality

**No fixture moved.** `git diff --stat -- packages/compiler/test/__snapshots__` is empty and
`emit-byte-equality.test.ts` passes untouched. Nothing to attribute: step 3 above returns a
TypeScript-free span verbatim, and every existing SSR fixture's spliced spans are TypeScript-free.
The goal anticipated fixtures moving; they did not, because the strip is conditional rather than an
unconditional reprint.

Byte-neutral through the bundler too, which is expected — the bundler was already stripping the
whole source module, so it now receives text it would have produced anyway. Receipt:
`packages/bundler/test/fixture-builds.test.ts` reports `emitted runtime gzip wall exceeded:
23586 > 23583` **identically with and without this change** (measured by stashing
`packages/compiler/{src,test}` and re-running the single file). That is the standing baseline noise
U699 and U702 both recorded — U702 measured it at 23588, so the wall has drifted 2 bytes closer
since, from other work, not from this unit.

## Pins

`packages/compiler/test/emitted-js/emitted-js.test.ts` (13 → 22 tests). The one U702 test asserting
the old ruling — `the SSR module is still string-built, so authored TypeScript survives in it`,
which pinned `const BASE: Limit = WIDTH;` present and the JS parse failing — is inverted, and is the
only re-anchored assertion in the repository.

New:

- `the SSR module parses as JavaScript` — the whole module through `parse(source, { lang: 'js' })`,
  which rejects annotations, `as`, `satisfies`, `!` and `import type` as diagnostics.
- Six per-construct pins (`test.each`) asserting the authored spelling is absent and the stripped
  spelling present, one per band: carried declaration, annotated parameter, prop default, state
  initializer, computed derive, async runner.
- `a generic call in an SSR span loses its type arguments` — `pick<Limit>(WIDTH)` parses clean as
  two comparisons in JavaScript, so the JS-only parse cannot see it; pinned by text, the same shape
  U702 pinned for symbol modules.
- `a TypeScript-free SSR span is spliced unchanged` — the byte-identity claim step 3 rests on.
- `an SSR span that cannot be reprinted refuses by name` — a module-scope class with a parameter
  property, asserting the message carries BOTH the splice site and the construct.

## Suite state

`pnpm typecheck` clean. `pnpm exec vitest run --project node packages/compiler`: 239 files,
1900 passed, 1 expected fail, 0 failed. Whole node project: 465 files, 3613 passed, 1 expected fail,
37 skipped, plus the one bundler budget failure shown above to be identical without this change.

Raw `pnpm exec tsc --noEmit -p tsconfig.json` reports 567 errors, **all** `TS2307` and **all** under
`packages/headless/` — raw `tsc` has no `.tsrx` module resolver, which is why the repo's own
`pnpm typecheck` runs `packages/typescript-plugin/src/tsc.ts` instead. None are in
`packages/compiler`, and no headless file was touched.

`pnpm fmt` was not run: U699 recorded that it rewrites the whole repository regardless of the paths
handed to it. `goals/` is gitignored in this repo, so this note lives on disk only.

## For whoever picks this up next

The bundler caveat U702 left is untouched and still live: `stripEmittedTypesFromFragment`
(`bundler/src/transform.ts:116-121`) skips reprinting when a fragment already parses as JavaScript,
and a generic call does — so the three authored render-data slices (`:713/720/725`) still ship
`pick<Limit>(x)` verbatim. The compiler now closes that shape for symbol modules AND for the SSR
module, because both parse as TypeScript and print stripped rather than sniffing. The render-data
slices remain bundler-owned.
