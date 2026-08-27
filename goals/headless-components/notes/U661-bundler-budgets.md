# U661 — bundler budget re-anchors, and why the tree scenario is not the self-route-recursion fix

Two leftovers from the bundler-suite triage. The six budget rows are done and green.
The `self-route-recursion` rows are **not** fixed, and the reason is not the one the
packet carried; the measurement is below and it needs an owner call.

## 1. Six budget rows — re-anchored on measurement

All numbers are local macOS, measured through the tests themselves on this tree
(`NODE_ENV=test`, `MARKLESS_CONSUMER_BUILD=1` for the demos).

### `fixture-builds` — vite-csr and vite-plus

| anchor | was | measured | restated to |
| --- | --- | --- | --- |
| vite-csr largest runtime chunk | 3,750 | **5,151** (raw 13,945) | 5,162 (+11 variance) |
| vite-csr emitted runtime wall | 20,775 | **23,586** across 15 chunks | 23,604 (+18) |
| vite-plus largest runtime chunk | 3,745 | **5,153** (raw 13,945) | 5,165 (+12) |
| vite-plus emitted runtime wall | 20,705 | **23,531** across 15 chunks | 23,552 (+21) |

Both fixtures share one runtime chunk — byte-identical raw size, 13,945 — so they
move together. The chunk cap was the only assert that fired, but the emitted wall
was over too; it just never ran, because the cap throws first. Both had to move.

**The growth is the two families the triage named, and I can show why nothing else
is in this chunk.** The attribution is by module exhaustion, not by
revert-measurement (reverting runtime source is outside this unit's contract):

- The chunk's *entire* string-literal set is 27 strings, and they name only three
  things: the dispatch core (`web:resume-events`, `MARKLESS_EVENT_DISPATCH_UNMATCHED`),
  instance scope (`MARKLESS_WIDGET_INSTANCE_UNRESOLVED`, `WidgetInstanceRuntimeError`),
  and the focus keys (`__marklessNativeFocus`, `focusin`, `pointerover`).
- The sources feeding those, and their growth since anchor `48851c2b`:
  `resume-events.ts` +12,610 raw source bytes, `fns/instance-scope.ts` +7,937,
  `fns/overlay.ts` +3,023, and `fns/element-handle-roster.ts` new at 5,966.
- Focus replay: `529caa2d` moved it into the dispatch core so a plain click loads no
  module for a handle it never reads — that is the progressive-execution doctrine
  buying the bytes deliberately. The pointer/focus priming merges that fed it belong
  to the same family.
- Widget-instance qualification: `9fbedb5c` (roster keyed by widget instance),
  `65ab93e3` (a widget root's own element mints from its own instance token),
  `c288d956` (a surface's captured focus origin handed out through the runtime).

**Named and not either family** (the packet asked for anything else): two dispatch
fixes also landed in `resume-events.ts` in this window — `96b659d9` disposed-row
dispatch and `61953e0d` non-bubbling dispatch. Neither is separable without a revert
build, but both are small relative to the two families' source growth.

**The row-component mint stays demand-split, and better than that**: none of its
`MARKLESS_REPEAT_ROW_COMPONENT_*` codes appear anywhere in either fixture's build.
This fixture has no `@for` row component, so the mint is shaken out entirely and
costs these two walls nothing.

The emitted-wall growth splits: +1,412 is the dispatch-core chunk above, and most of
the rest is the demand-gated companion chunk carrying
`MARKLESS_ELEMENT_HANDLE_INSTANCE_AMBIGUOUS` (2,949 gzip) — `9fbedb5c`'s roster, split
out of the eager closure rather than deleted, so it counts against the wall and not
the cap. Repayment stays owed to bundler-diet under the existing pay-per-use
obligation.

### music-player CSR

| stage | was | measured | restated to |
| --- | --- | --- | --- |
| page-load download | 128,534 | **135,982** (see landmine) | 135,982 |
| page-load execute | 15,316 | **14,221** | 14,221 (walks down) |
| interaction 1 | 2,254 | **2,416** | 2,416 |
| interaction 2 | 2,513 | **2,705** | 2,705 |
| interaction 3 | 2,514 | **2,706** | 2,706 |

All three interaction chunks contain `marklessQualifyGraphNodeId` and none of the
focus keys, so their whole marginal growth is the widget-instance qualification
family — the qualification wrapper is now inlined per staged trigger chunk. The
demo's dispatch-core chunk is 5,699 gzip and carries both families, the same shape
the vite fixtures measure. `page-load execute` walks *down* by 1,095: the roster no
longer sits in the eager static closure.

**MEASUREMENT LANDMINE — the one thing to carry forward.** This lane's page-load
download is not reproducible run to run. Three consecutive builds on one unchanged
tree measured **135,182 across 106 chunks, 135,982 across 107, and 135,788 across
107**. The chunk count itself moves, so this is build nondeterminism, not the gzip
run variance the 128 B margin was sized for. I anchored at the highest of the three
and wrote the landmine into the test. Every other stage on this lane held to within
1 B across the same three runs. This deserves its own unit: a wall that moves 800 B
on an unchanged tree cannot catch an 800 B regression.

### music-player SSR

| stage | was | measured | restated to |
| --- | --- | --- | --- |
| page-load download | 65,067 | **69,588** across 97 chunks | 69,588 |
| page-load execute | 4,010 | **4,214** | 4,214 |
| interaction 1 | 1,931 | **1,932** | 1,932 |
| interaction 2 | 1,567 | **1,568** | 1,568 |
| interaction 3 | 1,094 | **1,092** | 1,092 (walks down) |
| first-navigation | 23,860 | **23,333** | 23,333 (walks down) |

Only the first two were over. The other four were already inside their margins and
are restated to measured so the margin means what it says. Same shared dispatch core
carries the download and execute growth.

**Attribution caveat, stated plainly**: the music-player anchors were set at
`f19e2d5d` and roughly 100 merges have landed since, against the vite fixtures'
much narrower window. For the demos I name the changes and confirm them by which
identifiers each measured chunk actually contains. That is weaker than the fixtures'
module-exhaustion argument and much weaker than a revert-measurement.

### The two "staged budget goes red and names the stage" rows

Both go green on their own, as expected. They failed only because they perturb one
anchor and assert exactly one overrun; with four (CSR) and two (SSR) stages already
over, the count was wrong. With the anchors restated to measured, the baseline
overrun set is empty and the perturbation produces exactly one.

## 2. `self-route-recursion` ×3 — NOT fixed, and the packet's premise does not hold

The packet said: drop or move the `computed` in `tree/scenarios/deep.tsrx` so the
scenario compiles. I measured that, and it does not work. **`deep.tsrx` is left
exactly as it was.**

What I measured, in order:

1. **Dropping the `computed`** (label reads `{'Folder ' + depth}` inline) does not
   fix it. The refusal survives and only its *reason* changes, from "`<FileNode>`
   keeps a `name` of its own that only running it works out" to "`<FileNode>` has to
   run to produce its content."
2. **The reason is structural, not the computed.** `armChildStaticMarkup` in
   `packages/compiler/src/passes/symbol-modules.ts` (~line 1570) admits an arm child
   only when the edge has no import source, **no props**, no children, no graph
   bindings, and a chunk with no slots and no wired records. `FileNode` takes
   `depth` and `level`, so `edge.props.length > 0` refuses it unconditionally. No
   arrangement of a self-recursive, widget-rooting node inside an `@if` can pass
   that gate.
3. **Restructuring the arm into a `@for`** over a computed child list *does* make all
   four `self-route-recursion` rows pass, **and the route pins do not move** —
   `c6:p7:`, `c0:p4:p5:` and `c0:p1:` all still hold. But it **breaks the tree's own
   lane**: `SSR: a self-composing node unrolls to the depth its prop names` and
   `SSR: each unrolled level resumes with its own open state` both go red with
   `Cannot find element with locator: getByTestId('depth-3-item')`. Recursion through
   a computed-collection row component does not unroll on the server. So that trade
   is 3 bundler rows for 2 tree rows, which is not a fix.
4. **The decisive measurement: the scenario is fine; the test's transform call is
   not.** The tree ui lane compiles and renders `deep.tsrx` green today — 51 passed,
   1 skipped, with the file untouched. But `transformTsrxModule` refuses it in
   *every* input variant I probed: bare client, `prerenderRecords`, `directCsr`,
   `dev`, `environment: 'ssr'`, and `runtimeDemandClass: 'csr'`. All six blocked.

So the scenario is not broken. The bundler test calls `transformTsrxModule` with only
`{ filename, source, environment }` and **no `importedModuleInterfaces`**, which the
real pipeline always supplies. Without the `@markless/ui` barrel's interface the
compiler cannot see what `tree.item` is, plans a `branch-update` symbol for a branch
that is decided by a prop and never flips, and then refuses the arm it just planned.
The diagnostic is gated on that symbol existing (`symbol-modules.ts` ~line 1274: "a
branch nobody asks to flip ships no symbol, so it needs no diagnostic"), which is
consistent with the real build staying silent.

I did not chase the fix further because supplying the interface means compiling the
barrel — `src/index.ts` re-exports 30-odd families — inside a unit test, which is a
design decision, not a repair.

### Should the bundler test keep reaching into `packages/headless` for its fixture?

**No.** Three reasons, in order of weight:

1. It is measuring something it cannot reproduce. The test transforms a file the real
   pipeline compiles with imported module interfaces, using a call that has none. It
   is asserting on a compile that never happens in production, and it went red on a
   change to a *different* package's scenario file, which is exactly the coupling a
   fixture is supposed to prevent.
2. `deep.tsrx` is owned by the tree family and answers to the tree's lane. Its shape
   is free to change for accessibility or family reasons; it should not be pinned by
   a bundler route-table test whose pins (`c6:p7:`, `c0:p4:p5:`) encode the
   scenario's exact component nesting.
3. The route pins it asserts survived my `@for` restructure unchanged, which says the
   pins are about the route-table *shape*, not about this particular tree. A small
   fixture under `packages/bundler/test/fixtures/` that self-composes and imports one
   child module would pin the same behaviour without the cross-package reach.

The obstacle is that the current test's child-module route is the `@markless/ui`
barrel itself, so an owned fixture needs a stand-in child module and its pins
re-measured. That is a unit's worth of work, not a side edit.

### The owner question

Either:

- **(a)** Give `self-route-recursion` its own fixture in `packages/bundler/test/fixtures/`
  and re-measure the pins. Cross-package coupling goes away; the test stops
  exercising the barrel-import path it exercises today.
- **(b)** Teach the test to supply `importedModuleInterfaces` the way
  `arm-escalation-link.test.ts` does, so it compiles `deep.tsrx` the way the build
  does. Keeps the coupling, but the test would then measure something real — and it
  would confirm whether the missing interface really is what plans the phantom
  `branch-update` symbol.
- **(c)** Treat the refusal as a compiler defect: a prop-decided arm that is settled
  at render should not plan a branch-update symbol at all. That is the deepest fix
  and the only one that also helps consumers, but it is compiler work.

My read: **(b) first, as a measurement** — it is cheap and it either confirms or kills
the interface hypothesis in one run. If it confirms, **(c)** is the real defect and
**(a)** is worth doing anyway on ownership grounds.

## Verification state at hand-off

- `pnpm typecheck` — green.
- `pnpm exec vp test packages/bundler/test` — the six budget rows are green; the two
  "goes red and names the stage" rows are green; **`self-route-recursion` ×3 stay
  red**, unchanged from the triage, for the reason above.
- `pnpm exec vp test --project ui packages/headless/components/src/tree` — 51 passed,
  1 skipped. `deep.tsrx` untouched.
- `pnpm exec vp lint --deny-warnings` — green.
