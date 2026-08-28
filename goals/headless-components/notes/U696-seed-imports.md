# U696 — an imported constant a prop default names

The drawer wrote `snapPoints: [1]` and `closeThreshold: 0.25` out as literals instead of importing
them from `drawer-swipe.ts`, against the repo's standing rule that a shared fact is imported and
never restated. The reason recorded in `src/drawer/note.md` was a compiler landmine: the build
failed with `ReferenceError: CLOSE_THRESHOLD is not defined` from `shared-seed.ts`, at CSR render
time, with no compile-time signal at all.

## What was actually broken

Not what the note said. A `state()` seed reads an imported constant fine — the state-initializer
band already carries the imports its text names, and so does the SSR module. Compiling

```
import { LIMIT } from './limits.ts';
export const gate = shared(() => { const g = state({ maxWidth: LIMIT }); ... }, { scope: 'widget' });
export function Root({ cap = LIMIT }) @{ const g = gate(); g.minWidth = cap; ... }
```

emits a state-initializer module that opens with `import { LIMIT } from "./limits.ts";`, and a
shared-seed module that splices

```
const cap = marklessProp_cap === undefined ? LIMIT : marklessProp_cap;
```

with no import above it. So both of the drawer's failures were the **prop default**, not the seed.

The cause is one line in `symbol-resolver.ts`: a shared-seed symbol chooses the imports to carry
from `write.valueSource` alone. For `drawer.closeThreshold = closeThreshold` that source is the bare
prop local `closeThreshold` — `CLOSE_THRESHOLD` appears nowhere in it. The destructuring default is
spliced later, by the emitter, out of `SemanticComponentPropDeclaration.defaultSource`, and nothing
scanned that text.

Nothing caught it either. `unresolvedGraphReferences` is an allowlist filter: it reports a free name
in an emitted module only when it can explain it — a graph binding, a row local, or a module-scope
declaration. `moduleScopeDeclarations` skips `ImportDeclaration` outright, so an imported free name
was invisible to the one check whose job is to see it. The server render hides the rest: SSR
evaluates the authored module, where the import is in scope, so the build stayed green and only the
browser threw.

## The fix

Two changes in `packages/compiler/src/passes/symbol-modules.ts`.

**The carry.** The authored text a symbol module splices is the symbol's own source *plus* every
destructuring default its prop reads carry. `propReadDefaultSources` + `splicedSourceReferencedNames`
name that set, and both the shared-seed band (which gained a `moduleImports` channel) and the
state-initializer band (which had the same blind spot in its own prop reads) now select imports
against it. Carrying beats folding: it needs no cross-module value, works for any import shape —
named, default, namespace — and keeps the binding live rather than freezing this build's reading of
it into the payload.

**The refusal.** `unresolvedGraphReferences` takes the file's imported local names beside its
declared ones, so a free imported name is now reported instead of ignored, through a
`moduleImportReferenceDiagnostic` under the existing
`MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE` code. Any future emitter that splices authored
text without carrying its imports fails the build rather than the browser.

## What is still refused, deliberately

A prop default naming a **same-file `const`** — `function Root({ cap = MIN })` — is refused, not
carried: the shared-seed band carries imports but not declarations, because the declaration carry
needs the co-parsed projection the state-initializer band uses for its source map and that is a
larger change than this unit. It was already refused before this work and still is, naming the
binding and the symbol, so it is a build error rather than a silent one. The advice the diagnostic
gives is the right one: move it into a module you import from.

The seed **value** naming an import — `drawer.snapPoints = LIMIT` — stays refused by
`isUnloweredSharedSeed` in `state-lowering.ts` with `MARKLESS_SHARED_SEED_UNSUPPORTED`. A seed value
must come from this component's props or from constants; that rule was not relaxed here.

## A landmine found but not fixed

`collectModuleImports` does not record `importKind`, so a **type-only** import is carried as a value
import. A prop default naming one now emits `import { Limit } from "./limits.ts";` into the symbol
module, which throws at module load instead of at first render. This is pre-existing for every band
that carries imports (state-initializer, behavior, event-handler, async-computed-runner); the
shared-seed band simply joins them. Fixing it means threading a type flag through
`SemanticModuleImport`, which touches every fixture those bands own — worth its own unit.

## Pins

`packages/compiler/test/seed-imports/seed-imports.test.ts`, eight rows: an imported constant carried
into a seed module and into a shared-seed module; a namespace import carried whole; a default naming
no import carrying none (the byte-equality half); the two refusals above; and both directions of the
new filter branch, driven through the `unresolvedModuleDeclarationDiagnostics` seam because the carry
makes it unreachable from an authored file. The 236 existing compiler test files, `emit-byte-equality`
among them, are unchanged.

## The drawer

`DEFAULT_SNAP_POINTS` now lives in `drawer-swipe.ts` beside `CLOSE_THRESHOLD`, and `drawer.tsrx`
imports both for the factory seed and for `DrawerRoot`'s defaults. The note's Finding 1 is gone and
the two findings after it are renumbered.
