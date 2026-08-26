# U584 - a handle read in a derive is refused, not answered with undefined

## What changed

`computed(() => s.measuring ? widthOf(s.trackEl) : 'idle')` used to compile and
then read `undefined` for the handle on every derivation, CSR and SSR resume
alike. Handles are bound on the DOM and only a handler-shaped read is rewritten
into the lookup that answers one, so no derive body can ever observe a handle.
It is now a compile error under `MARKLESS_ELEMENT_HANDLE_UNBOUND`.

Message shape, from the real compiler output:

```
Cannot read element handle "s.trackEl" inside computed "trackWidth" in WidthRoot:
element() handles are DOM-bound and readable only in event handlers, so
"trackEl" is undefined on every derivation.
```

Handler bodies are untouched: they are not computed bindings, so the probe
buttons in the fixtures compile exactly as before.

## Where the witness lives

`collectElementHandleDeriveReads` in
`packages/compiler/src/passes/semantic-graph/collect-elements.ts`, run from
`collectElementHandleDiagnostics`. The evidence is already in the graph: the
derive collector files an element binding as an ordinary dependency edge, and
that edge was resolved in the scope that declared the derive - a component body,
or the shared factory it was written inside - so the same-module scoping U580
landed is inherited rather than re-implemented. The refusal names
`binding.componentName`, falling back to the shared definition's name for a
factory-declared derive.

The builder is `elementHandleDeriveReadDiagnostic` in `diagnostics.ts`. It goes
through `semanticGraphDiagnostic`, so it is severity `error` - a warning would be
waivable with `// markless-allow`, and there is no reading of this code where the
author wanted the word `undefined` on the page.

## Landmine found on the way: graph node ids are component-blind

Two sibling parts in one module that each declare `const boxEl = element()` and
`const label = computed(...)` produce two bindings sharing ONE id
(`element:boxEl`, `computed:label`). `finalizeComputedDependencies` merges
pending dependencies with `graphBindings.map(b => b.id !== pending.graphNodeId)`,
so the reader's handle dependency is copied onto the writer's identically-named
derive that never mentioned the handle. Left alone that produced a false compile
error on the innocent sibling.

The guard is `readsSourceText`: a dependency only counts when the derive's own
`functionSource` really spells that read, checked with an identifier-boundary
match. The last test in `element-handle-derive/handle-read-in-derive.test.ts`
pins it. The underlying id collision is NOT fixed here and is worth its own
unit - it is a latent source of wrong dependency edges for any same-named
bindings in sibling components of one module.

## Tests

- `packages/compiler/test/element-handle-derive/handle-read-in-derive.test.ts` -
  six rows: single / plural / factory refused; handler read and state-cell-only
  derive still compile; the refusal names the declaring component under
  same-module siblings.
- `packages/vitest-browser/browser/handles-in-computed/handles-in-computed.test.ts` -
  the eight rows that pinned the silent `undefined` are now four compile-refusal
  rows, one per fixture shape, each fetching the family module and asserting a
  500 carrying the code, the handle name and the component name. CSR and SSR
  collapse to one row each because compile refusal is identical on both paths.
  The `__screenshots__` directory went with the deleted rows.

Stash receipt: with `collect-elements.ts` and `diagnostics.ts` stashed, 4 of the
6 compiler rows fail and all 4 browser rows fail; with them applied, all pass.

A sweep compiling every `.tsrx` under `packages/headless/components/src`,
`packages/web`, `packages/vitest-browser/browser`, `demos` and `apps` found the
new refusal on exactly the four `handles-in-computed` fixtures and nowhere else,
so no family or demo was reading a handle in a derive.

## Two verify commands are red on the base branch, not from this work

`pnpm docs:errors:check` and `pnpm exec tsc --noEmit -p tsconfig.json` both fail
on `feat/headless-ui-pilot` before any of this unit's edits.

`pnpm docs:errors:check` reports, at baseline: `docs/errors-catalogue.md` stale,
`docs/pages/errors/index.mdx` stale,
`docs/pages/errors/MARKLESS_CAPTURE_OPAQUE_PROP.mdx` stale, and
`docs/pages/errors/MARKLESS_SEED_CHILDREN_UNAVAILABLE.mdx` missing. Adding a
second wording under an existing code also changes the table row (the Message
cell gains a `(+1 more)` suffix) and the index page, so this unit's own docs
regeneration needs `docs/errors-catalogue.md` and `docs/pages/errors/index.mdx`
too. Only `docs/pages/errors/MARKLESS_ELEMENT_HANDLE_UNBOUND.mdx` was in the file
contract; it was regenerated (byte-identical to what the generator writes) by
running the generator against a scratch copy of the tree, so nothing outside the
contract was written. Fixing the rest is `node scripts/diagnostics-catalogue.mjs`
plus a widened contract.

`pnpm exec tsc --noEmit -p tsconfig.json` is plain `tsc`, which cannot resolve
`.tsrx` imports: 428 `TS2307 Cannot find module '…/scenarios/basic.tsrx'` errors,
every one of them in `packages/headless`, identical count before and after this
change. The repo's real typecheck is `pnpm typecheck`
(`node packages/typescript-plugin/src/tsc.ts -p tsconfig.json`), which passes
clean with this change applied. Write-task verify arrays should name
`pnpm typecheck`, not `pnpm exec tsc`, for this repo.
