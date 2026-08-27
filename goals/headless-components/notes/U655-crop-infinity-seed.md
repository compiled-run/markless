# Crop seeds its two size caps `Number.POSITIVE_INFINITY`

## What changed

`packages/headless/components/src/crop/` only. The `undefined`-means-no-limit
branch is gone from the family's internals:

- `crop.tsrx` — the `shared()` factory seeds `maxWidth: Number.POSITIVE_INFINITY,
  maxHeight: Number.POSITIVE_INFINITY` instead of `undefined`, and `CropRoot`
  destructures both props with `= Number.POSITIVE_INFINITY`.
- `crop-types.ts` — `CropInstanceState.maxWidth` / `.maxHeight` narrow from
  `number | undefined` to `number`.
- `crop-math.ts` — `sizeCeiling(areaSize: number, cap: number)` drops its
  `cap === undefined ? Number.POSITIVE_INFINITY : cap` line; `boundedRect`,
  `resizedRect` and `resizedAxis` take a plain `number` for the caps.
- `crop.browser.ts` — the one row that passed `undefined, undefined` for the caps
  ("the area caps the size even when the declared maximum does not") now passes
  the two infinities. Same subject, same assertion.
- `note.md` — the "seed that is not a bare literal" wall records the residue as
  closed and says why the default sits on the prop rather than at the write.

The public prop type is untouched: `maxWidth?: number`, `maxHeight?: number`,
docs unchanged.

## Why the default sits on the prop, not at the seed write

The obvious spelling — keep the props undefined-able and coerce at the write —
does not compile:

```
MARKLESS_SHARED_SEED_UNSUPPORTED: Cannot seed "crop.maxWidth" from
"maxWidth ?? Number.POSITIVE_INFINITY" because a component body seeds a shared
instance only from its own props or from constants.
(src/crop/crop.tsrx:479:2)
```

A component body's shared-state assignment becomes a per-instance initial value,
which the compiler builds only from a bare prop or a constant. So the fallback
has to be a destructuring default, which is what `minWidth = 40` and
`minHeight = 40` already are in this same parameter list.

## Measured

- `pnpm exec vp test --project ui packages/headless/components/src/crop` —
  **58 passed**, both before the change (baseline re-taken in this worktree) and
  after. U643's 8 red rows are 0. No row needed a change of subject.
- `pnpm typecheck` — clean.
- `pnpm test:sr` — 34 files, 281 passed, 10 expected fail, 4 skipped.
- `pnpm exec vp lint --deny-warnings` — 0 warnings, 0 errors.
- `pnpm --filter @markless/ui api:check` — **red, and only for the reason below.**

## The one open item: two generated manifest lines

`api-extract/extract.ts` records a component's destructuring defaults
(`componentDefaults`, keyed by prop name) into `api/manifest.json`, so giving the
two caps a default adds exactly two lines to the checked-in manifest, and
`api:check` fails as stale until it is regenerated:

```
1170a1171
> 						"default": "Number.POSITIVE_INFINITY",
1176a1178
> 						"default": "Number.POSITIVE_INFINITY",
```

Nothing else in the manifest moves — no prop added, removed or retyped, every doc
string identical, all other families byte-identical. The two entries state in the
manifest the default the prop doc already states in prose ("Defaults to no limit
but the area"), the same way `minWidth` carries `"default": "40"`.

`packages/headless/components/api/manifest.json` is outside this unit's file
contract, so it was not regenerated. The fix is one command:

```
pnpm --dir packages/headless/components api:extract
```

There is no in-contract spelling that both seeds `Number.POSITIVE_INFINITY` and
leaves the manifest untouched: the coercion cannot live at the seed write (the
compiler refuses it), and any destructuring default — under any name, including a
module constant such as `NO_LIMIT` — is recorded by the extractor.
