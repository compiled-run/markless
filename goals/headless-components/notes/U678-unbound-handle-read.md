# An unbound element() handle read lowers to the handle registry

U675 measured the defect and named the mechanism: what decides whether a widget
family's `element()` handle answers per instance is not the family's component
count but whether the module that READS the handle also BINDS it in its own
markup. A module that only reads lowered the read to `context.graph.read(...)`,
and a handle is not a graph value, so the read answered `undefined`.

This closes it at the lowering.

## What changed

One file: `packages/compiler/src/passes/symbol-resolver.ts`.

`elementHandlesByGraphNodeId` built the handle record set from BINDING sites
only — `payloadArena.view.elementHandles` plus the keyed-repeat and async-arm
handle lists, each of which carries a `hostNodeId` and therefore exists only
where this module wrote `el={...}`. A family module that declares a handle,
hands it to parts living in other modules, and reads it back in a handler
contributed no record at all, so `elementHandleReads` kept nothing,
`elementHandleValueLowering` returned `null`, and the read fell through to
`graph.read`.

The function now also admits every `element()` DECLARATION reachable from the
module's `shared()` factories: each `semanticGraph.graphBindings` entry whose
`kind` is `element` and which carries a `sharedDefinitionId`. Those records
already carry exactly what the lowering needs and nothing new had to be
computed — the binding's `id` IS the graph node id the read resolves to
(`shared:src/Dial.tsrx#dial/element:markEls`), and its `name` is the authored
handle name. The declaration set was already on the semantic graph; only the
resolver was not reading it.

Binding sites are still collected first, and the loop keeps the first record per
graph node id, so a handle this module does bind keeps byte-for-byte the record
it had. Only a read with no binding record gains one.

The runtime is untouched, as U675 predicted it could be: the registry already
answers `getElementHandle` per instance for a handle bound elsewhere in the
instance, which is what the `two-v2-page` row was already proving.

## Scope of the widening

The filter requires `sharedDefinitionId`, so this admits handles declared by a
`shared()` factory and nothing else. A component-local `element()` that is
declared but never bound in its own module is left exactly as it was — that is
not a shape the witness exercises, and widening to it would move bytes for no
measured reason.

## Bytes

None. `emit-byte-equality` passes unchanged; no fixture was re-anchored and no
fixture module has an unbound handle read. This is the expected result of
keeping the binding-site records first: every module that already produced a
handle record produces the identical one.

## Pins

- `packages/compiler/test/single-component-family/unbound-handle-read.test.ts`
  — 2 passed. The row that was red ("a root that only reads the handle") now
  emits `context.getElementHandle("shared:src/Dial.tsrx#dial/element:markEls")`
  where it emitted `context.graph.read(...)` of the same node.
- `packages/compiler/test/emit-byte-equality.test.ts` — 1 passed, byte-identical.
- Whole compiler node suite — 233 files, 1819 passed, 1 expected fail. The
  expected fail is the suite's own and predates this edit; the same 233/1819/1
  shape holds on the unmodified tree.
- Browser witness `packages/vitest-browser/browser/single-component-family/` —
  NOT RUN. See below.

## The browser witness did not run here

The 4 red rows this change is meant to turn green (`two-dials-page` and
`two-controls-page`, CSR and SSR) are unverified. `pnpm exec vitest run
--project browser packages/vitest-browser/browser/single-component-family` was
started three times from the repo root and stalled identically every time: it
printed the `RUN` banner and the markless diagnostics line, then produced
nothing for 9-11 minutes while accumulating 1.4-2.9 seconds of CPU. No headless
Chromium process was ever spawned. The stall is therefore before the browser
launch, in the provider or the dev server, not in a test.

It is not a missing browser binary: `pnpm exec playwright install --dry-run
chromium` reports chromium v1208 and chromium-headless-shell v1208, and both are
present in `~/Library/Caches/ms-playwright`.

It is also not attributable to this change. The stall happens before any fixture
compiles, and the whole compiler node suite — which compiles far more fixtures
through the very code path this edit touches — finishes in 7 seconds.

What the change does at build time is nevertheless pinned directly: the compiler
row asserts the exact lowering the browser rows depend on, and it is green.
Someone with a working browser provider should run the witness before this is
called done.

## A note on the typecheck command

`pnpm exec tsc --noEmit -p tsconfig.json` reports 508 errors on this tree with
or without this change: plain `tsc` cannot resolve `.tsrx` modules, so every
`import ... from '*.tsrx'` is an unresolved module. The repo's real typechecker
is `pnpm typecheck` (`node packages/typescript-plugin/src/tsc.ts -p
tsconfig.json`), which is `.tsrx`-aware; it is clean with this change. The 508
is a pre-existing property of the bare-`tsc` command, not a regression — it was
measured on the unmodified tree as well.
