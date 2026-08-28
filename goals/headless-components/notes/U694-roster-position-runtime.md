# A part is told where it stands, in both regimes

U690 made the compiler lower `roster.indexOf(mine)` in a `computed()` to one
call per regime. This card answers both calls, and renumbers them when the
roster moves. `packages/vitest-browser/browser/item-collections/` is **20 green,
0 `test.fails`**, CSR and SSR.

The witness now derives the position rather than stamping it: `IcItem` binds
`el={[w.itemEls, mine]}` and writes `ui-pos={pos}`, and `survey()` only REPORTS
what the roster holds (`readPositions` in `ic-order.ts`, which used to be
`stampPositions` and used to `setAttribute`). So every row that asserts
`ui-pos` is asserting the derivation, not a handler's leftovers.

## The one idea both regimes share

**At render there is no DOM, so the position IS emission order.** A widget
instance emits its members in document order, so the nth member of that instance
to ask is the nth in the roster. **After resume the roster is live**, so the
position is `indexOf` against its document-ordered members. The two agree, which
is the whole reason U689 chose this seam.

The counter is per (widget instance, roster, member handle) and lives in a Map
minted once per render — `marklessRosterPositionSeeds()` /
`marklessRenderRosterPosition()`, both in
`packages/web/src/prerender/shared-seed-slot.ts`. It rides the **seed map**,
under `markless:roster-positions`, because the seed map is the one channel that
reaches both the compiled SSR child render and the CSR component evaluation, and
it already carries the widget-instance token a position must count within
(`marklessWidgetInstanceKey(family)`, falling back to the plain key — the same
question `element-handle-roster.ts` asks). That is what makes the second
collection on a page start at zero instead of continuing the first.

Holding the counter in a closure per render, rather than in a module, is
deliberate: two page renders in one server process must not share a count.

## SSR: the counter, and why the renderer has to publish the seeds

`renderSsrOutput` (`packages/web/src/render-to-string.ts`) is the one place a
served page's render context is made, so it wraps whatever it was given with
`marklessSsrRosterPositionContext` (`packages/web/src/fns/roster-position.ts`).
That covers `renderToString` and `renderToStream`.

The compiled call site is

```js
const pos = (marklessSsrRenderContext?.rosterPosition ?? (()=>{throw ...}))(rosterId, handleId);
```

which **loses the context**: the function is invoked unbound, with two ids and
nothing else, so it cannot read the `sharedSeeds` sitting on the very object it
came off. `renderSsrData` therefore publishes each child's seed map onto the
counter (`positions.seeds = childContext.sharedSeeds`) in the statement directly
before it hands the child over — `packages/web/src/ssr-data/renderer.ts`, the
`child-component` slot. Nothing async sits between that assignment and the
child's `pos` line, which runs synchronously at the top of the child's render.

Order is right for free: `renderSsrData` renders a widget root's PROJECTION
before the root itself, and the projection is where the items are, so the items
ask in document order and the root's own render comes after them.

## CSR: the same counter, handed straight to the derive symbol

CSR first paint is not the compiled SSR module — it is the render-data
interpreter. `evaluatePrerenderDataComponent`
(`packages/web/src/prerender/evaluator.ts`) runs a derive symbol as
`loaded({ graph: { read }, read, rosterPosition })`, and there `input.sharedSeeds`
IS the component's own seed map, so the seeds are passed directly and
`positions.seeds` is never consulted. `evaluatePrerenderDataSurface` files the
counter into the top-level seeds; every child inherits it through the same
`seedChild` copy the widget-instance token travels in.

A row minted after resume is evaluated with no page seeds at all, so it mints a
counter of its own and starts from zero. That is a transient: the roster's
revision (below) renumbers it before the assertion can see it. Without the
fallback the mint died on `context.rosterPosition is not a function`.

## Resume: `indexOf` against the live roster

`refreshSyncComputed` (`packages/web/src/resume-sync-computed.ts`) builds
`rosterPosition` only for a record whose dependencies name an element binding
(`/element:`), because the scoping it needs is not on the lean path and is
`await import`ed rather than statically reached.

- **The roster** is read through `marklessInstanceScopedElementHandle`, with the
  instance path taken off the computed's own graph node id. The compiled roster
  id is one module-level string every rendered widget spells; unqualified, a page
  with two collections merges both into one array.
- **The member** is the gap this card had to close. A component-local
  `element()` handle carries NO instance in its id — composition qualifies
  `shared:` handles only (`fns/ssr.ts`, `marklessWidgetHandleId`) — so three
  rendered `IcItem`s file three registrations under the one key `element:mine`
  and the registry refuses. Measured, not assumed: `element:mine` →
  "registered by 3 rendered widgets", `r:bravo:c0:p1:element:mine` → undefined,
  `c0:p1:element:mine` → undefined.

  `materializeElementHandles` now files one more key per registration: the ROW
  segments of the host it was registered on, ahead of the handle id
  (`r:bravo:element:mine`). The reader asks with the row segments of the
  computed's own instance path, and falls back to the bare id. Row segments are
  runtime identity — the same `r:<key>:` the whole instance-path grammar uses —
  and they are the one part of host-id space that does NOT diverge from graph
  space, which is why the qualification survives the projection segment
  (host `c1:` vs symbol `c0:p1:`) that U691 already named as a divergence.

  **Known limit, carried forward:** two parts of the same family in the SAME row
  (or outside any row) still share the bare key, so a re-derive there resolves no
  member and answers `-1`. The witness cannot reach it — the static, composed and
  two-instances pages hold no repeat, so nothing invalidates them after first
  paint — but a projected-in item would. The real fix is to qualify
  component-local handle ids the way widget-scoped ones are qualified, which
  moves `marklessWidgetHandleId`, the registry's strip regex and the scoped
  reader together, and is its own card.

## Invalidation: the roster's revision

The computed's only dependency is the roster's own binding node (U690's protocol
record), so something has to write that node. Nothing did.

`wireRosterRevisions` (`packages/web/src/fns/roster-position.ts`), called from
`resume-runtime-start.ts` immediately after `wireKeyedRepeats`, subscribes each
keyed repeat's collection node and, on a write, bumps every element-binding node
this page's computeds depend on. Registration order is the ordering guarantee:
the repeat's own row application is subscribed first, so the rows are placed
before the parts standing in them are asked where they stand. Then the existing
`sync-computed-demand:` subscription in `resume-sync-demand.ts` fires and
`refreshSyncComputed` re-derives. No polling, no `requestAnimationFrame`, no DOM
query — the walk is over registered handles.

The binding node's cell carries the revision because nothing else ever writes an
`element()` binding and every reader of one answers from the handle registry
(`marklessElementHandlePropValue` consults the graph only for a key the registry
does not know).

`repeat.rowElementHandles` was the obvious source for "which roster moved" and is
**absent** on the witness — measured `null`. A row COMPONENT's handles live in
the child's own view, not on the repeat record, so the roster ids are taken from
the computeds' dependency lists instead.

## Bytes

**The `event-only-resume-closure.test.ts` wall holds, at 20,970.** The only
governed module that grew is `resume-locators.ts`, 10,003 → 10,200 (+197), which
puts `resume.ts`'s closure at 20,925 — 45 bytes of headroom left. Everything
else was placed to cost it nothing: `resume-keyed-repeats.ts` (10 bytes of
headroom) and `resume-runtime.ts` (a single-file closure sitting exactly ON the
wall) are byte-identical, and `resume-sync-computed.ts` grew 2,290 → 4,493 inside
its own 18,153-byte headroom while reaching `fns/instance-scope.ts` only through
`await import`, which the closure walk does not follow. `resume-runtime-start.ts`
is reached by no governed closure at all.

**The bundler chunk anchors do NOT hold, and this is the open item.**
`packages/bundler/test/music-player-ssr-budget.test.ts` is green on the pilot tip
and red here:

```
page-load download:        71,139 gzip / 100 chunks   anchor 69,588 +128  (over by 1,423)
first-navigation marginal: 23,762 gzip /   8 chunks   anchor 23,333 +128  (over by   301)
```

`page-load execute` (4,233 vs 4,214 +32) still holds.

Attributed as far as measurement got, and the attribution is surprising, so it is
recorded rather than guessed at:

- Reverting the whole card returns both stages to green — reproduced twice by
  stashing, so it is this card and not a dirty fixture build.
- Reverting **only the render-time half** (the counter, the renderer's publish,
  the evaluator's context, the SSR context) still leaves `page-load download` at
  71,047 over 99 chunks and `first-navigation` at 23,773. So roughly 1,331 of the
  1,423 belongs to the RESUME half, whose whole source delta is +197 raw bytes in
  `resume-locators.ts`, a demand-loaded `resume-sync-computed.ts`, and six lines
  in `resume-runtime-start.ts`. A source delta that small producing ~1.3 KB gzip
  across ~100 chunks is a chunk-GROUPING move, not code volume, and root-causing
  it needs a chunk-by-chunk diff of the two builds.
- Moving the counter out of its own module and into
  `prerender/shared-seed-slot.ts` (which both client render paths already import)
  bought 217 gzip bytes and one chunk, so that placement was kept.

The anchors are owner-priced and this card does not raise them. What the next
card needs is the chunk-name diff between the two `music-player-ssr` builds:
which chunk gained, and whether a module the resume half touches changed which
group rolldown put it in.
