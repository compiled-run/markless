# One non-finite printer, owned by the serializer; the SSR static values map now agrees with the render data

Status: **landed.** The fifth printer U663 found is fixed, the compiler's private
copy of the printer is gone, and the printer now lives in `@markless/serializer`
beside the tag it speaks. The fold refusal in `collect-state.ts` was **not**
lifted — see the verdict at the end.

## What changed

**The printer moved to the serializer.** `jsonSourceWithNonFiniteNumbers` is now
exported from `packages/serializer/src/value.ts`, directly under `nonFiniteName`,
and re-exported through the package index. The serializer owns the encoding
(`{"$type":"number","value":"Infinity"}`) and the name (`nonFiniteName`), so it
now also owns the one way to print that value as JavaScript source.

`packages/compiler/src/passes/public-render/non-finite-json.ts` is **deleted**.
Its two callers — `public-render/module.ts:1` (the render-data module) and
`public-render/render-body.ts:1` (the storage seed) — now import the serializer's
export. No behavior change at those two sites: the function body moved verbatim.

**`stateEntries` calls it.** `public-render/shared.ts:681` was

```ts
return `	[${JSON.stringify(cell.graphNodeId)}, ${JSON.stringify(value)}]`;
```

and is now

```ts
return `	[${JSON.stringify(cell.graphNodeId)}, ${jsonSourceWithNonFiniteNumbers(value) ?? 'undefined'}]`;
```

`?? 'undefined'` prints the same bytes template interpolation of `undefined`
already printed, spelled out. That one string is the SSR module's static values
map for all three of its callers — `ssr-module.ts:238`, `same-module.ts:102`,
`graph-runtime.ts:49` — none of which needed a change.

## The divergence is closed

Same seed U663 measured, `maxWidth: 1e400`, one compile, both halves of the
emitted pair:

```
before   marklessRenderData      …"value":{"minWidth":1,"maxWidth":Infinity,"x":2,"label":""}
         marklessSsrStateValues  ["shared:src/seed.tsrx#gate/state:g", {"minWidth":1,"maxWidth":null,"x":2,"label":""}]

after    marklessRenderData      …"value":{"minWidth":1,"maxWidth":Infinity,"x":2,"label":""}
         marklessSsrStateValues  ["shared:src/seed.tsrx#gate/state:g", {"minWidth":1,"maxWidth":Infinity,"x":2,"label":""}]
```

Re-measured on a second, simpler shape (a bare `state()` in a rendering
component, no `shared()` factory): same result, both halves `Infinity`.

Finite values are byte-identical to what `JSON.stringify` printed before — the
printer returns `JSON.stringify`'s own bytes when nothing in the payload is
non-finite, and the new compiler row pins that for the state map.

## Rows added

- `packages/compiler/test/seed-module-const/folded-non-finite-emit-agreement.test.ts`
  — a folded `1e400` seed prints the same `Infinity` in `marklessRenderData` and
  `marklessSsrStateValues`, and the printed source evaluates back to a real
  `Infinity`; a finite seed prints `JSON.stringify`'s bytes in both halves.
- `packages/serializer/test/non-finite-json-source.test.ts` — the printer's own
  rows at its new home: JSON byte for byte when nothing is non-finite,
  `undefined` where `JSON.stringify` returns nothing, each of the three names,
  a round-trip through `new Function`, and the marker-collision case.
- `packages/compiler/test/storage-seed-printer/storage-seed-printer.test.ts` —
  import repointed to `@markless/serializer`; assertions unchanged.

Verify, all green in this worktree: `pnpm typecheck`;
`pnpm exec vp test packages/serializer/test packages/compiler/test` (242 files,
1887 passed, 1 expected fail);
`pnpm exec vp test --project browser packages/vitest-browser/browser/seed-module-const packages/vitest-browser/browser/seed-fold-per-property` (31 passed);
`pnpm exec vp lint --deny-warnings`.

## The next import to collapse

`packages/bundler/src/non-finite-json.ts` is the surviving twin of the function
that just moved. It is byte-for-byte the same algorithm with a non-optional
return type, and its one caller is `bundler/src/transform.ts:723`. That file is
owned by another live unit, so it was left alone. Collapsing it is a two-line
change once that unit lands: delete the file, and have `transform.ts` import
`jsonSourceWithNonFiniteNumbers` from `@markless/serializer` (the bundler already
depends on the serializer). Its test,
`packages/bundler/test/non-finite-definition-printer.test.ts`, repoints the same
way. Note the return type: the bundler's copy returns `string`, the serializer's
returns `string | undefined`, so `transform.ts:723` needs the `?? 'undefined'`
the other two call sites use — or an explicit refusal if a definition record can
never be unprintable.

## Can the fold refusal be lifted now? Not here, and not yet — but the reason it exists is gone

`collect-state.ts:1473-1477`:

```ts
// A folded seed is printed into the render-data module with JSON, which has no
// form for a non-finite number: those stay on the carried-expression path.
function foldedConstant(value: unknown) {
	if (typeof value === 'number' && !Number.isFinite(value)) return { ok: false };
	return { ok: true, value };
}
```

That comment is now false. Every printer over a folded seed that this unit could
find speaks the name: the render-data module, the storage seed, the bundler's
component definitions, and — as of this unit — the SSR static values map and the
graph-runtime cells map. **The value divergence the refusal was guarding against
no longer exists.** Lifting it is now a routing-and-bytes question, not a
correctness one.

Two costs remain, neither of them a wrong value, and both in files outside this
unit's contract:

**The direct-DOM CSR path refuses non-finite seeds, module-wide.**
`public-render/state-entries.ts:28`, `isDirectPublicLiteralValue`, returns false
for a non-finite number; `emitDirectPublicStateEntries` then returns `null` for
the whole module and `emitDirectPublicRenderModule` emits nothing, so the module
falls back to the standard runtime module. Lifting the refusal widens the set of
modules that fold a non-finite, and so widens the set dropped off the direct
path. I did not measure the size of that cost: neither probe shape I compiled
qualified for the direct path in the first place (it needs one component, no
props, no component edges, no style scopes, no boundaries), so I have no
before/after byte delta for it. That measurement belongs with the lift.

That file also holds a **sixth** bare-`JSON.stringify` printer of a cell value —
`literalExpression`, `state-entries.ts:46`. It is unreachable with a non-finite
today only because the guard above bails out first. If the direct path is ever
wanted for these modules, that line needs the shared printer too, and the guard
needs to stop refusing.

**The behavior-input literal parser declines non-finite numbers.**
`passes/payload-arena.ts:545`, `literalBehaviorInputValue`: a numeric literal
that overflows fails `Number.isFinite` and the function returns `undefined`, so
the behavior gets no input value where a finite literal gets one. This is the
`payload-arena.ts` consumer flagged as unaudited in both the U657 and U663 memos.
I read it, and it declines rather than printing a wrong value — but I did not
measure what a resumed behavior does with the missing input. Still unaudited in
that sense.

**And the crop flip is still a bytes change.** With the refusal lifted,
`packages/headless/components/src/crop`'s two `Number.POSITIVE_INFINITY` size
caps move from carried to folded. On value grounds that is now safe — I confirmed
that under the refusal a `Number.POSITIVE_INFINITY` seed produces no folded
constant at all (neither a render-data `constant` record nor a state-map entry;
the authored expression is carried into the SSR module instead), and that the
same seed spelled `1e400`, which folds today, prints `Infinity` in both halves
after this change. But it changes emitted bytes for a shipped family, so crop's
browser rows have to be re-measured by whoever lifts it.

**Recommendation:** lift it in a unit that owns `collect-state.ts`,
`public-render/state-entries.ts` and the crop rows, with the direct-path byte
delta measured as part of the lift. Do not lift it in a unit that owns only
`collect-state.ts`.

## Completeness

Not exhaustive. No guessless receipt was taken over every printer of a cell
value. What I checked by hand for this unit, each named:

- every reference to `jsonSourceWithNonFiniteNumbers` and `non-finite-json` under
  `packages/` (grep): the compiler's two call sites and its test, now repointed;
  the bundler's copy, its caller and its test, left alone;
- every `deserializeGraphValue` call site in `packages/compiler/src` and
  `packages/bundler/src` (grep): `public-render/shared.ts:680` — fixed here — and
  `public-render/state-entries.ts:16` — the guarded direct path above;
- `payload-arena.ts`'s only `Number.isFinite` guard, at line 545.

Grep cannot see re-exports or namespace access, so "every" above is scoped to
those two text searches, not to the module graph.

## Measured

- Base guard: the worktree was behind and had no `node_modules`. Merged
  `feat/headless-ui-pilot`, then `pnpm install --offline`. Guard file
  `packages/compiler/src/passes/public-render/projection-text.ts` present after
  the merge.
- Evidence gathered with a throwaway compile probe under
  `packages/compiler/test/seed-module-const/`, printing
  `renderDataModuleSource`, `ssrModuleSource` and `moduleSource` for the seeds
  above; removed afterwards.
- No file outside the packet's contract was edited.
