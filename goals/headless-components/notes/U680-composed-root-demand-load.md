# A witness for the composed-root demand-load window, and a stalled browser lane

The witness is written and compiles. The fix is not made: the browser lane never
produced a single test result in this worktree, so nothing about the defect was
measured here and no runtime file was touched.

## The witness

`packages/vitest-browser/browser/composed-root-demand-load/` is the minimal
shape U677 reported the defect on, with the menubar and menu families stripped
out of it:

- `panel.tsrx` — the COMPOSED family. `PanelRoot` seeds `panelState`
  (`scope: 'widget'`), so every root a page part composes roots one rendered
  panel. `PanelSurface` reads the same family and is what the consumer writes as
  a child of the page part, so it is projected THROUGH the composed root.
- `bar.tsrx` — the PAGE family. `BarItem` seeds `itemState` and composes
  `PanelRoot` around a private `BarControl`. `BarControl`'s `onKeydown` is the
  handler under test: it writes its own item's cell (`item.presses`) and the
  composed panel's cells (`panel.opens`, `panel.openedBy`). `BarControl` is
  declared before `BarItem` — a component composing one declared later in the
  same module is a use-before-initialization at import time, which U677 already
  measured.
- `page.tsrx` — two items, so "the instance the gesture landed in" and "the
  first rendered instance" are two different answers.
- `composed-root-demand-load.test.ts` — four rows. Two COLD (CSR and SSR
  resume): the page's very first gesture is ArrowDown on the SECOND item's
  control, which is inside the handler demand-load window, and the assertion is
  that the second item's own panel took the write and the first panel is
  untouched. Two WARM (CSR and SSR resume): the first press spends the window on
  item one, then item two is pressed against a loaded handler. The warm rows are
  the contrast — U677 measured this shape passing warm and failing cold.

Focus-then-`userEvent.keyboard` rather than a click, copied from
`demand-load-replay/`: a click would spend the one gesture that opens the window
before the keydown gets there.

The three fixtures compile clean (`compileTsrxModule`, zero diagnostics), and
the compiled output confirms the shape is the one the packet asked for:

- `widgetRootComponents(panel.tsrx)` = `panelState -> PanelRoot`
- `widgetRootComponents(bar.tsrx)` = `itemState -> BarItem`
- `bar.tsrx`'s SSR module emits `childrenWidgetRoot:` on the `PanelRoot` compose
  — the compile-time declaration that says where `BarItem`'s children land, and
  the exact input `marklessProjectionIds` reads to register the projection
  bridge.

So the witness is a real composed-root-plus-projection page, not an
approximation of one. What is missing is a run of it.

## The stall

`pnpm exec vitest run --project browser packages/vitest-browser/browser/composed-root-demand-load`
printed

```
 RUN  v4.1.5 <worktree>
markless diagnostics available - window.__MARKLESS_DEBUG__ records containers, ...
```

and then nothing. First attempt: ~15 minutes, no collection line, no test name,
no failure. Killed and re-run once per the packet's rule: ~12 minutes, byte-identical
output, killed again. No error was printed at any point, and the vitest process
stayed alive the whole time.

Two facts that bound it:

- The node lane is healthy on this same tree: `vitest run --project node
  packages/web` is 94 files / 640 tests green in 1.6s.
- This worktree has no built package dists. `packages/core/dist` and
  `packages/web/dist` do not exist here, while the main checkout at
  `/Users/jacksm5pro/dev/open-source/markless` has them. The browser project's
  config loads `markless()` from `@markless/core/vite` and the compiled fixtures
  demand-load `@markless/web/fns/*` at runtime, both of which are dist subpath
  exports.

That is a hypothesis, not a measurement — the markless plugin clearly did load
(it printed its diagnostics banner), so resolution is not failing outright. But
a worker dispatched into a fresh worktree runs `pnpm install` and nothing else,
and `pnpm build` (`vp pack` over eleven packages plus two CJS builds) was not
affordable inside this unit's 45-minute wall clock alongside a browser run.
Whoever picks this up should either build the dists in the worktree first, or
run the browser lane from the main checkout.

## Where the defect is not, and where to look

Nothing below is measured on the failing page; it is the reading of the code the
packet named, recorded so the next attempt does not re-read it.

The render-side registry and the payload-side registry are built from different
sources and both look correct on paper for this shape:

- Compose fills a per-render registry in `packages/web/src/fns/composition.ts`:
  `marklessRegisterWidgetInstanceIds` files one root per rendered widget under
  `instancePath + definition.id`, and `marklessRegisterWidgetProjections` files
  the SAME widget a second time under the projection site a part sits at. The
  second registration is the whole projection bridge — a projected part is a
  SIBLING of the root it was placed in (`c1:p1:` beside `c1:c0:`), so the
  prefix walk in `widgetRootPathFor` can never reach that root from the part's
  own path.
- Resume fills the graph's registry in
  `packages/web/src/fns/instance-scope.ts` `marklessNoteGraphWidgetRoots`, from
  `graph.listSharedDefinitions()` — `definition.id` for the root and
  `definition.projectionIds` for the sites, both under
  `marklessInstancePath(definition.id)`.

For this page those two produce the same answers, per instance, and
`widgetRootPathFor` walking `c1:c0:c0:` reaches `c1:c0:` before `c0:...` is ever
considered. So a stale or half-filled registry is the shape to suspect, not the
walk itself.

The two things worth instrumenting first, in order:

1. **What the registry holds at handler-run time in the cold window.** CSR builds
   the graph lazily: `packages/web/src/render-csr.ts` `demandRuntime()` only runs
   `createFullRuntimeGraph` on the first gesture, so the first gesture is the
   first time `marklessGraphWidgetRegistry` is ever asked. Log `rootPaths` there
   for the cold row and the warm row and diff them. If the cold registry is
   missing the second instance's entries, the write falls all the way through
   `marklessComposedGraphNodeId` to `marklessUnresolvedWidgetGraphNodeId` and
   leaves page space — and where a bare `shared:` id lands is the next question.
2. **`marklessWidgetScope.active`.** It is a module-global pointer, re-aimed per
   entry by `marklessScopeWidgetsTo`, and it is what the generated
   symbol-resolver's bound-symbol adapter reads because it holds the dispatching
   graph in a closure it never passes on. Two of the lookups default to it
   (`marklessWidgetHandleId`, `marklessComposedGraphNodeId`). A dispatch that
   reaches it while `composing` is true is refused the re-aim by design, and the
   cold window is the one moment where a render and a dispatch can be in flight
   at once.

The `enclosingWidgetScope` first-wins-by-definition-id in
`marklessEnclosingWidgetRoots` is the one place in this file that structurally
prefers the FIRST rendered instance, which matches U677's symptom exactly — but
it is installed only by a client-minted repeat row
(`fns/row-component-mint.ts`), and this page has no repeat. Rule it in or out
with a breakpoint before spending time on it.

## Byte walls

Untouched. No runtime file was edited, so the event-only resume closure wall and
the bundler chunk gzip anchors are exactly where they were.
