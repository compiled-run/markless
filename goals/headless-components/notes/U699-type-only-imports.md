# U699 — a type-only import carried as a value import

The landmine U696 found and left: `collectModuleImports` read only the specifier shape (`named`,
`default`, `namespace`) and threw away whether the import was type-only. Every band that carries
imports into an emitted module therefore carried `import type { Limit } from './limits.ts'` as
`import { Limit } from "./limits.ts";`. `./limits.ts` need not export a runtime `Limit` at all — a
type alias or an interface exports nothing — so the emitted module throws at **module load**, before
the first render, and the authored file still typechecks and still renders on the server.

## What was reproduced

Compiling a file whose prop defaults and module scope name type-only bindings emitted, before this
unit:

- `shared-seed`: `import { Limit } from "./limits.ts";` for `import type { Limit }`.
- `state-initializer`: three bad lines at once — the `import type` name, the inline `type Cap`
  specifier out of a mixed list, and the whole `import type * as limits` namespace.
- `async-computed-runner`: the `import type` name.
- the SSR module: the `import type` name, whenever a carried module-scope declaration was annotated
  with it.

`sync-computed-derive` and `event-handler` did not carry it for the shapes tried; they select from a
tree walk that did not reach those type positions. They are covered anyway, because the fix sits
below all six bands.

## The fix

`SemanticModuleImport` gains an optional `typeOnly?: boolean`, set by `collectModuleImports` from
the parser's `importKind` — on the declaration (`import type { A }`, `import type D from`,
`import type * as NS`) or on the individual specifier (`import { type B, C }`). The field is omitted
rather than written `false` for a value import, so a value import's record is byte-identical to the
one every existing carry site already read.

The drop is at three choke points, not at each band's own selection site:

- `dedupeModuleImports` and `uniqueModuleImports` in `symbol-modules.ts`. Every band's carry funnels
  through one of these two twins before its imports become nodes or text, so shared-seed,
  state-initializer, behavior, async-computed-runner, event-handler and sync-computed-derive are all
  covered by the same two lines.
- `publicRenderValueImports` in `public-render/shared.ts`, which is what the SSR module and the
  residue reader emit from — the name already promised value imports.
- the emission branch of `carryForeignFactoryScope` in `foreign-scope.ts`. Here the type-only import
  is still recorded as *satisfying* the copied body's free name and only its emitted line is skipped;
  dropping it from `neededFactoryScope` instead would have turned a working build into a new
  cross-module refusal.

A free type name in a lifted symbol is not a runtime reference, so nothing has to replace the
dropped line. `unresolvedGraphReferences` was deliberately left reading the full import list,
including type-only ones, so the U696 refusal does not start firing on names that were never runtime
references.

## Emit byte-equality

`emit-byte-equality` and the other 237 existing compiler test files are unchanged and pass. No
fixture re-anchored: the drop keys on `typeOnly`, which is absent from every value import, so a
fixture with no type-only import selects exactly the imports it selected before.

## A landmine found but not fixed

The emitted `.js` symbol modules still carry TypeScript **syntax** out of the authored text: a prop
default spliced as `marklessProp_cap === undefined ? WIDTH as Limit : marklessProp_cap`, and a
carried module-scope declaration emitted as `const BASE: Limit = WIDTH;`. Dropping the import is
correct and necessary, but a module whose text still spells `as Limit` is not valid JavaScript on its
own; it survives today only if something downstream strips types. That is a separate defect from the
import carry and was not touched here. The pins assert on the import lines, and record the surviving
annotation in the module-scope case so a future strip does not silently change what is being pinned.

## Pins

`packages/compiler/test/type-only-imports/type-only-imports.test.ts`, ten rows: `import type`, an
inline `type` specifier from a mixed list, a type-only namespace import, a type-only default import,
the state-initializer band, the async-computed-runner band, a carried module-scope declaration
(event-handler plus state-initializer), the SSR module, the `collectModuleImports` record itself
across all five specifier shapes, and the byte-equality half — a value-only file carrying exactly the
import line and splice it carried before. Nine of the ten fail against the unfixed source; the tenth
is the byte-equality row, which must pass both ways.

## Suite state

`pnpm typecheck` clean. `pnpm exec vitest run --project node packages/compiler`: 238 files,
1868 passed, 1 expected fail. Across the whole node project two failures, neither from this change:
`packages/bundler/test/fixture-builds.test.ts` runtime-budget assertion (standing baseline noise),
and `packages/compiler/test/inline-order.test.ts` timing out at the 5s default under full-suite
contention — it takes 3.6s and passes when run alone.

## A tooling landmine hit while finishing this unit

`pnpm fmt` (`vp fmt`) formats the **whole repository**, not the paths handed to it — one run
rewrote 2256 files, including hundreds outside this unit's contract and hundreds of lines inside its
own five source files that had nothing to do with the change. The tree was reverted with
`git checkout -- .` and the five edits re-applied by hand; the final diff is 42 insertions and 9
deletions across exactly those five files. A bounded unit should not run `pnpm fmt`. Note that
`goals/` is gitignored in this repo, so this note lives on disk only and is not part of the commit.
