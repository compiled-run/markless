# One module, two specifiers, one map slot: the barrel walk overwrites itself

The alias collapse is real, it is reproduced by a witness that owns no headless
code, and it is **not** in the bundler. It is one line in a compiler pass that
this unit's file contract forbids editing, so the unit stops at the measurement
and the witness stays red as the pin.

## The witness

`packages/vitest-browser/browser/double-barrel/` — two throwaway families and a
root barrel that re-exports both:

| file | what it is |
| --- | --- |
| `alpha/alpha.tsrx`, `beta/beta.tsrx` | a root and a label each, plus a `shared()` state |
| `alpha/index.ts`, `beta/index.ts` | the folder barrels: parts renamed to `root`/`label`, **and the shared state re-exported** |
| `index.ts` | `export * as alpha from './alpha/index.ts';` and the same for `beta` |
| `alpha/scenarios/folder-first.tsrx` | `import * as alpha from '../index.ts'` then `import { beta } from '../../index.ts'` |
| `beta/scenarios/root-first.tsrx` | the mirror: root barrel first, `import * as beta from '../index.ts'` second |
| `double-barrel.test.ts` | both pages, CSR and SSR |

`folder-first.tsrx` is `signature.tsrx`'s shape exactly: a page nested inside a
family folder, naming its own family through `../index.ts` and a second family
through `../../index.ts`, where the root barrel re-exports the first.

## What the ingredient turned out to be

Two earlier spellings of the witness were **green**, and ruling them out is what
located the bug:

1. Both families named from a page sitting beside the root barrel, so the same
   module arrived under one identical specifier string. Green.
2. The page moved into `alpha/scenarios/` so the two specifiers genuinely differ
   (`../index.ts` from the page, `./alpha/index.ts` from inside the root barrel).
   Still green.

The bug only appeared once the **folder barrel re-exported a `shared()`
definition** alongside the parts — which `src/ink/index.ts` does (`inkState`,
`inkState as state`). That is the whole trigger, and it is why no other family in
the package is at risk today.

With that one line added to `alpha/index.ts`, the witness reproduces the memo's
failure verbatim:

```
MARKLESS_COMPONENT_TAG_UNRESOLVED: Cannot resolve `<alpha.root />` because
`../index.ts` does not export a component named `root`.
That module serves no components.
(browser/double-barrel/alpha/scenarios/folder-first.tsrx:10:3)
```

## Two faces of one clobber

The reverse import order does not compile-fail — it fails later, which is worse:

| page | what happens on the tip |
| --- | --- |
| `folder-first` (folder barrel imported first) | **compile error**, one `MARKLESS_COMPONENT_TAG_UNRESOLVED` per part; the test file cannot import at all |
| `root-first` (root barrel imported first) | **compiles, then throws at render**: `ReferenceError: alpha is not defined`, raised from `alpha.tsrx`'s residue reader, CSR and SSR alike |

Same cause, opposite casualty. Which import is written last decides whether the
components survive and the shared re-export is lost, or the shared re-export
survives and the components are lost.

## Where it actually is

**`packages/compiler/src/passes/link/module-link.ts`, function
`linkBarrelComponents`.** Its `interfaces` accumulator is a
`Record<string, ModuleGraphInterfaceArtifact>` keyed by **import specifier**, and
two different code paths write the same key with `=`, so the second write wins
outright:

- **line 519**, inside `walkBarrel`'s nested-barrel branch: when a nested barrel
  returns shared re-exports, it republishes that barrel under
  `input.rebase(target)` with `reexports` set, `render.components: []`, and **no
  `linkedComponents`**.
- **line 575**, the per-import loop: `interfaces[moduleImport.source] = { linkedComponents, … }`
  with **no `reexports`**.

For `signature.tsrx` both of those keys evaluate to the identical string
`'../index.ts'` — one resolved module, `src/ink/index.ts`, reached under two
specifiers that happen to rebase to the same spelling. Whichever assignment runs
second erases the other half of the interface.

The consumer side is `packages/compiler/src/passes/semantic-graph/collect-components.ts`,
`resolveImportedChildComponent` (line 472): it looks up
`state.importedModuleInterfaces[importSource.importSource]`, finds the
components-less artifact, falls through `linkedComponents` (undefined) to
`moduleInterface.render.components` (empty), and reports `missingPart`. The
diagnostic is correct about what it was handed; it was handed the wrong artifact.

## Why this is not a bundler fix

`packages/bundler/src/link-driver.ts` is a shell around the pass. It supplies
`resolution`, `rebase` and `moduleInterface`, loops the pass until nothing is
pending, and then forwards `artifact.interfaces` **verbatim** (line 253, via
`republishPackageBarrels`, which only re-keys dependency-package barrels). By the
time the driver sees the record, the overwritten half is already gone — the
driver cannot merge what it never received. `source-module.ts` is not involved in
building this record at all.

One bundler-side workaround was considered and rejected rather than left
unexamined: calling `linkBarrelComponents` once per module import and merging the
per-import records in the driver. It would dodge this particular collision, but
it multiplies the resolve/interface rounds by the import count, it still clobbers
when two nested barrels inside a *single* import rebase to the same specifier,
and it puts the merge policy in the layer below the one that owns the lossy map.

## The fix the next unit should make

In `linkBarrelComponents`, stop assigning into `interfaces` with `=`. Publish
through one helper that merges when a key is already taken **and both entries
name the same resolved `filename`**: union `linkedComponents` (dedupe on
`exportPath` + `source`) and `reexports` (dedupe on `exportName` + `source`), and
keep whichever `render` actually carries components. A module's identity is its
resolved path; the specifier is only the name a given importer calls it by, and
two names for one file must not be able to delete each other's halves.

That merge fixes both faces at once, and it is byte-neutral for single-alias
pages, where no key is ever written twice with differing content — the one
repeated write today is `interfaces[specifier] = targetInterface` at line 543,
which stores the identical artifact and dedupes to itself.

## Once it is fixed

`packages/headless/components/src/ink/scenarios/signature.tsrx` currently reaches
textbox the long way round, `import * as textbox from '../../textbox/index.ts'`,
to dodge this bug. **It can go back to the double-barrel spelling**
`import { textbox } from '../../index.ts'` as soon as the merge lands — that
restoration is the real-world confirmation the witness is standing in for, and
the witness turning green should be the cue to make it.

## Verification as it stands

| command | result |
| --- | --- |
| `pnpm typecheck` | green |
| `vp test --project browser .../double-barrel` | **red — this is the pin**, both pages, both modes |
| `vp test --project browser .../seeded-write` | 8 passed |
| `vp test packages/bundler/test .../emit-byte-equality.test.ts` | 12 failed / 485 passed — **identical with the witness stashed**, so pre-existing |
| `vp test --project ui .../src/ink .../src/tour` | 97 passed |
| `vp lint --deny-warnings` | 0 warnings, 0 errors |

The bundler dozen is the known baseline: the two budget suites plus
`self-route-recursion`, `fixture-builds`, `dense-async-symbol-table`,
`doctrine-guard` and `inline-resumer`. Measured both ways in this worktree, same
12 either way.

The double-barrel suite cannot be pinned green with `test.fails`: `folder-first`
fails at **compile**, so the test module never imports and there is no test
function to mark. It stays red until the merge lands.
