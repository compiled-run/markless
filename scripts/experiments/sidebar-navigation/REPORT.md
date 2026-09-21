# Sidebar navigation and rapid Select toggling

The URL-only UI navigation failure was reproduced from `/markless/ui/select` to `/markless/ui/combobox`. Navigation changed the address, then client state initialization threw while reading the anatomy model's `selectionId`, leaving the old DOM in place.

The fixes address the consuming path:

- Sidebar markup now uses the public router Link. The router transform lowers supported TSRX Links to marked anchors, retaining dynamic attributes and lazy navigation loading.
- Client render data retains required local constant dependencies, authored repeat collections, and state initializers that depend on those locals. Local values are cached per component render and shared between initializer and markup reads.
- Website highlighting preserves MDX element tags alongside element counts, so destination locator indexes match its HTML.
- State composition retains child storage subscriptions and the owning protocol version, so destination theme changes work.
- Navigation replaces the route root in place instead of removing the document shell.
- Select leaves its trigger gesture to the trigger's click handler. The previous 300 ms dismissal grace suppressed fresh clicks; it is removed.

The running dev server retained old compiler output after source changes. Restarting the isolated server resolved that stale-output failure. Restart the website dev server once and refresh existing tabs.

## Verification

- Root `pnpm run typecheck`: passed.
- Focused compiler/router/web regression run: 325 tests passed. The expanded local-initializer test file subsequently passed five tests, including alternate component shapes and a shared initializer evaluated once across two state cells and markup.
- Select browser suite: 78 tests passed after the compiler changes. Rapid toggling previously failed in both CSR and SSR.
- Website Witness: both framework and UI sidebar cases passed. Framework case checks First app, home, theme interaction, preserved header and six Select toggles; UI case checks Select → Combobox. Both require one document request and no browser errors.
- Automated history check: destination, back and forward rendered correctly; one document request, no page errors, original header stayed connected. See `history-result.json`.
- Router dev Witness: passed lazy startup, SPA navigation and destination MDX interaction. Receipt: `/tmp/markless-router-final/2026-09-19T19-32-33.492Z/receipt.json`.
- Website tests: 42 passed, one pre-existing failure in `components/docs/anatomy/scenes.test.ts`, which tries to read a route directory as a file.
- Website Markless-aware typecheck: still blocked by 28 existing SVG opacity errors in `mug-art.tsrx` and 72 possibly-undefined selection errors in `mug-studio.tsrx`. The change is not ready to land while these consuming checks are red.

Website Witness receipt: `/tmp/markless-sidebar-check/2026-09-19T19-26-11.164Z/receipt.json`.

## Compiler boundary and limits

Pass: `public-render-module`; owning modules: `passes/public-render/residue-reader.ts` and `component-definitions.ts`. It consumes authored source, semantic graph, render data and symbol resolver records, and produces component definitions with compiled residue readers and initializer-residue mappings. Focused artifact/evaluator tests: `packages/compiler/test/client-residue-locals.test.ts`. No component body replay on resume or eager navigation import was added.

TSRX documentation was checked through the specification fallback (`https://tsrx.dev/specification`) because no TSRX MCP tool was available. The change uses ordinary constant declarations in component setup; it introduces no syntax.

Native Markdown links still perform ordinary navigation. Link spreads and explicit children props keep the existing delegate path. The document shell now stays mounted; route-dependent title, breadcrumb and pager updates in that shell remain a separate router limitation. No push or merge was performed.
