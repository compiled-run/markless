# Sibling binding scope: fixed where the colliding id is consumed

Both symptoms the earlier investigation reproduced are gone, with no change to
the emitted id and no snapshot rewrite. The ids still collide; what changed is
that the two places that consumed them now ask which scope declared the binding.

## What was wrong

Two sibling parts in one module, each declaring `state`, `element()` and
`computed()` under the same local names, mint the same graph node ids —
`state:s`, `element:boxEl`, `computed:label` are each minted twice. The id is
built from the local name alone.

Symptom 1: each derive's finalized dependency list was the union of both
siblings' reads, so `Reader`'s derive re-ran on writes to `Writer`'s cells and
vice versa.

Symptom 2: `MARKLESS_ELEMENT_HANDLE_DUPLICATE` fired on a module where nothing
was bound twice — two components each declaring their own `boxEl` and each
binding it once.

## What changed

`packages/compiler/src/passes/semantic-graph/collect-async.ts`

`finalizeComputedDependencies` now resolves the binding a pending derive was
declared as, instead of writing the finalized edges onto every binding whose id
matches. The derive body sits lexically inside exactly one component, and
`componentId` already carries that component's span (`component:<start>:<end>`),
so span containment names the owner without any new state on the walk. Where
only one binding carries the id — the ordinary case — nothing changes; where the
owner cannot be told apart (no body span, no `componentId`, a shared factory
where both candidates are equally unqualified) it falls back to the old
behaviour rather than guessing.

The same owner narrows the two lookups the finalize step makes:
`graphBindingMap` and `semanticAliasMap` already accepted a `componentName`, so
`collectGraphDependencies` gained an optional `componentName` parameter and
passes it through. It defaults to undefined, so every walk-time caller resolves
exactly as before.

`packages/compiler/src/passes/semantic-graph/collect-elements.ts`

The exactly-one-live-host rule is now asked of the scope that DECLARED the
handle, keyed by `sharedDefinitionId ?? componentName` plus the handle name,
rather than by the handle name module-wide. That distinguishes the three cases
that were previously indistinguishable:

- two components each binding their own same-named handle once — no longer a
  duplicate,
- one component binding its handle twice — still refused,
- two parts of one widget binding the same shared-factory handle — still
  refused, because the declaring scope is the factory, not either part.

`resolvePropForwardedElementHandle` now returns the parent's element binding
alongside its name, so a forwarded handle is keyed by the component that
declared it rather than by the child that bound it. Two children forwarding one
parent handle therefore still read as a double bind.

The idref map (`firstBindingByHandle`) is deliberately left keyed by handle name
alone: its resolution order is not what this change is about, and narrowing it
would move behaviour no test asked for.

`graph-paths.ts` needed no change — `graphBindingMap` and `semanticAliasMap`
already took an optional `componentName`.

## The `readsSourceText` guard is gone

It was a text search over the derive's own source, added to keep the handle-read
refusal from firing on a sibling's edges. With the dependency edges now scoped to
the declaring component, an element edge on a derive means that derive's body
really read that handle, so the text search has nothing left to filter. Removed,
and the whole pin row in `packages/compiler/test/element-handle-derive/` stays
green — including the sibling case that motivated the guard, which still names
`Reader` and not `Writer`.

## Evidence

New tests in `packages/compiler/test/sibling-binding-scope/`:

- `derive-dependency-scope.test.ts` — sibling derives keep only their own edges;
  a many-read derive still collects everything it reads; a shared-factory cell
  still reaches the sibling derives that read it; a derive chained onto a
  sibling-named derive stays inside its own part; the colliding ids are asserted
  to still be `state:s` / `computed:label` / `element:boxEl`.
- `handle-duplicate-scope.test.ts` — the three duplicate cases above, plus a
  plural shared-factory handle bound by two parts still compiling.
- `emitted-wire-keys.test.ts` — the emitted bytes still spell the unqualified
  ids, and two compiles of the same module emit identical bytes.

Stash receipt: with the two source files stashed and the tests in place, 7 of
the 12 new tests fail; with the source applied, all 12 pass.

`pnpm typecheck`, `pnpm exec vp lint --deny-warnings`, and the whole
`packages/compiler/test` suite (208 files, 1686 tests, 1 expected fail) are
green. `emit-byte-equality.test.ts` passes against its existing snapshot with no
snapshot written. `packages/web`, `packages/runtime`, `packages/analyzer` and
`packages/bundler` were run with and without the fix: the failing set is
byte-identical in both runs and is entirely the known `packages/bundler` budget
and fixture-build noise on this branch.

## Still open

The ids themselves remain ambiguous. Making them genuinely unique per component
is a change to a serialized wire key — it is emitted verbatim into generated
code and crosses the SSR/resume boundary — so it touches `collect-state.ts`,
`emit-codegen.ts`, `protocol-state.ts`, `render-data/` and `public-render/**`,
rewrites the byte-equality snapshots wholesale, and needs the runtime's resume
path checked against the new key format. That is a separate, protocol-level goal
and it is not what this change did.
