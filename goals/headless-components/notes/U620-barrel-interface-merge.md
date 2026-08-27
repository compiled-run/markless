# One file, one interface: the barrel walk merges instead of overwriting

The alias collapse is fixed where the previous unit measured it — one accumulator
in one compiler pass — and the browser witness is green in both import orders,
CSR and SSR. Getting there turned up a **second, unrelated defect** that the
earlier memo had folded into the same symptom; it is named below and is still
open.

## The fix

`packages/compiler/src/passes/link/module-link.ts`, `linkBarrelComponents`. Its
`interfaces` accumulator is keyed by import specifier, and three code paths used
to write it with `=`. All three now go through one publisher:

```ts
const publishInterface = (key: string, published: ModuleGraphInterfaceArtifact): void => {
	const existing = interfaces[key];
	if (!existing || existing === published || existing.filename !== published.filename) {
		interfaces[key] = published;
		return;
	}
	interfaces[key] = mergeBarrelInterfaces(existing, published);
};
```

`mergeBarrelInterfaces` unions `linkedComponents` (dedupe on `exportPath` +
`source`) and `reexports` (dedupe on `exportName` + `source`), and takes the rest
of the surface — `render`, `exports`, `sharedDefinitions` — from whichever entry
actually read the module rather than republished it. "Actually read it" is
decided by `render.components.length`: a republished barrel carries an empty
render by construction, so the entry with more components wins, and a tie keeps
the incumbent.

### Different filenames keep the old behaviour, and that case is reachable

When the two entries name different resolved `filename`s the publisher still
overwrites, exactly as before. **That case can exist**: `input.rebase` is the
driver's path math, and nothing in the pass guarantees two distinct files never
rebase to one string — a build whose resolver maps two ids into one relative
spelling (a symlinked package, an alias plugin) would produce it. No such case is
witnessed today, and merging two genuinely different files would be wrong, so the
last write continues to win there. If it ever bites, the right answer is a
diagnostic at the collision, not a merge.

## What the fix is measured against

`packages/compiler/test/double-barrel/barrel-interface-merge.test.ts` — four
tests over a fixture that mirrors the browser witness: two families with folder
barrels that re-export a `shared()` definition beside their parts, one root
barrel doing `export * as`, and pages nested one directory down so the two
specifiers genuinely differ before rebasing collapses them to `../index.ts`.

| test | what it pins |
| --- | --- |
| folder barrel named first | the merged key keeps both parts **and** the shared re-export |
| root barrel named first | the mirror, on the other family |
| nested republish | the root barrel's own shared surface still steps into the republished folder barrel |
| single alias | a page naming one barrel once publishes the exact interface it always did |

Only the first of those was red before the fix. **The second was already green**
— see "what the earlier memo got wrong" below.

`packages/compiler/test/emit-byte-equality/barrel-alias-bytes.test.ts` prices the
byte-neutrality claim directly rather than by argument: it runs the walk twice
over the same fixture, once for a page that names the folder barrel alone and
once for a page that also names the root barrel, then compiles the *same* page
source against each resulting interface record and compares
`renderDataModuleSource`, `ssrModuleSource`, `publicRenderPlan`, `protocolState`
and `protocolView`. They are equal. Reaching one module twice costs a page
nothing.

## What the earlier memo got wrong

The U619 memo recorded two faces of one clobber: folder-first losing its
components (`MARKLESS_COMPONENT_TAG_UNRESOLVED`, a compile error) and root-first
losing its shared re-export (`ReferenceError: alpha is not defined` at render).
The first is exactly right. **The second is a different bug that the witness
happened to carry.**

Measured: with the merge applied, the compile error disappeared and *all four*
witness tests — including both folder-first cases, which had never reached render
before — failed with `ReferenceError: alpha is not defined`, raised from
`readResidue` in the render-data module for `alpha/alpha.tsrx`. A throwaway probe
page importing the family's parts **directly**, no barrel of any kind involved,
reproduced it identically. At the pass level, the root-first order publishes a
correct interface both before and after the merge: its second write is a superset
of the first, so there was never anything to lose there.

### The second defect, stated

A `shared()` factory that returns `state({...})` *itself* compiles an attribute
residue that reads an unbound local:

```
export const alphaState = shared(() => state({ tone: 'plain' }), { scope: 'widget' });

export function AlphaRoot({ children }) @{
	const alpha = alphaState();
	<div data-alpha-root data-alpha-tone={alpha.tone}>{children}</div>
}
```

`alpha.tone` is emitted verbatim into `readResidue` instead of being lowered to a
graph read, so rendering throws `ReferenceError: alpha is not defined`. It is not
a name collision — renaming the local to `tones` moves the error to `tones is not
defined`. Returning the ratified wrapper object instead makes it green:

```
shared(() => { const tones = state({ tone: 'plain' }); return { ...tones, mark() { … } }; }, …)
```

That is the shape every family in `packages/headless/components` already uses,
which is why nothing shipped is broken by it. It lives outside `passes/link` —
somewhere between the semantic graph and residue emission — so this unit did not
touch it. **It should be ledgered as its own defect**, with the two-line
reproduction above as the witness.

The browser witness was moved onto the wrapper shape (both families, symmetric)
so it pins the barrel behaviour and nothing else. Its `alpha.tsrx` carries a
one-line note saying why.

## Once this lands

`packages/headless/components/src/ink/scenarios/signature.tsrx` currently reaches
textbox the long way round, `import * as textbox from '../../textbox/index.ts'`,
to dodge the collapse. **It can go back to `import { textbox } from
'../../index.ts'`.** That claim is structural, not executed — this unit's
contract forbade editing the file, so it was not compiled that way. The
structure it rests on: `signature.tsrx` sits in `src/ink/scenarios/`, imports
`../index.ts` (the ink folder barrel, which re-exports `inkState` and `inkState
as state` beside its parts), and `src/index.ts` line 13 is `export * as ink from
'./ink/index.ts'`, so the root barrel's nested republish rebases to `../index.ts`
— the identical collision the fixture and the witness reproduce, with the same
shared-re-export trigger. Whoever makes the edit should run the ink lane after.

## A second collapse site was looked for and not found

`republishPackageBarrels` in `packages/bundler/src/link-driver.ts` also assigns
into an interfaces record (`interfaces[source] = entry`, line 275), but it is
keyed from a `Map` of package barrels — one entry per source — and package
specifiers are bare, never the relative spellings the walk produces, so a package
barrel and a path barrel cannot land on one key. This is a reading of that one
function, not an exhaustive search of the repo: no completeness receipt was
taken, so treat it as "the site the driver was known to have, checked" rather
than "the only one".

## Verification

Run in this worktree, after merging `feat/headless-ui-pilot` into it (the base
guard: the witness and `node_modules` were both absent at dispatch).

| command | result |
| --- | --- |
| `pnpm typecheck` | green |
| `vp test --project browser .../double-barrel .../seeded-write` | 12 passed — the witness is green in both orders, CSR and SSR |
| `vp test packages/compiler/test` | 219 files, 1728 passed, 1 expected fail |
| `vp test --project ui .../src/ink .../src/tour .../src/menu` | 199 passed |
| `vp lint --deny-warnings` | 0 warnings, 0 errors |

The acceptance is the witness, and it earns the name: with the merge temporarily
disabled in place, the suite goes back to failing at compile with the same two
`MARKLESS_COMPONENT_TAG_UNRESOLVED` diagnostics, so the test file cannot even be
collected.

The bundler suite was not run — the earlier memo measured its twelve failures as
a pre-existing baseline unrelated to this pass, and this unit's verification set
does not include it.
