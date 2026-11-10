# 12. Arm Rendering: Update Escalation Ladder, Arm-Relative Coordinates, Out-of-Order Streaming

Status: Ratified and implemented. Checked against main on 2026-11-10 (b79a5bab0).
Ratified with owner: 2026-07-07; D8 ratified 2026-07-08 and revised 2026-10-25,
2026-11-04 and 2026-11-06. The ladder, arm-relative records, streaming and
client navigation landed through goals/arm-rendering; the async error and
refresh model in D8 landed in #540 (2026-11-09), with #257 (refreshes keep
content), #397 (reads after an await join the key), #510 (an `@try` in a row
added after load) and #586 (a `@try` whose code loads after a click). Source
discussion: dashboard-migration goal, 15-need ledger. Research notes:
goals/arm-rendering/notes/ and goals/async-dx/notes/. Unresolved work is listed
under "Open items" at the end.

## Motivation

Async boundary arms (`@try` / `@pending` / `@catch` blocks) previously had no
client-side render path when they contained components, and in-arm records
lived in page-absolute DOM-order coordinates. Every observed failure class of
the dashboard migration traced to those two facts: dead in-arm interactions,
compose offset surgery for in-arm children, and a navigation architecture
detour (document.write swaps) taken to avoid client arm rendering.

## D1. The update escalation ladder

The compiler always selects the SMALLEST update tier it can statically prove.
Range replacement is the last resort, never the default.

| Tier | Mechanism                                        | Component execution | Used for                                |
| ---- | ------------------------------------------------ | ------------------- | --------------------------------------- |
| 1    | value slots (text/attribute graph subscriptions) | no                  | most state changes                      |
| 2    | keyed row ops                                    | no                  | repeat mutations                        |
| 3    | branch range flips (static parts + slots)        | no                  | @if/@switch, incl. inside arms          |
| 4    | arm commit (`commitArm`)                         | YES                 | transitions: mount, async settle, error |
| 5    | route swap                                       | YES                 | tier 4 at page scale                    |

Steady-state interactions run at the vanilla-JS floor (the tiers ARE the
textContent/replaceChildren calls a hand-writer would make, selected at
compile time). Component execution is paid exactly once per appearance of
content. The destructive edge of range replacement is confined to moments
where destruction is semantically meaningless; `commitArm` captures/restores
focus and scroll.

Doctrine note: executing components during a tier-4/5 render is INITIAL
render happening in the browser, which the unified render/resume model allows.
The resume model forbids re-executing components over existing server HTML; it
does not forbid rendering new content client-side.

### Arms picked by index

A two-arm `@if` is picked by the truthiness of its test, and a `@switch` whose
case tests are all literals is picked by comparing the discriminant's value with
`armTests` (the literal per arm, `null` for `@default`). Two shapes are picked by
INDEX instead: an `@if … @else if … @else` chain, and a `@switch` whose case
tests are not all literals (`@switch (true) { @case charge > 50: … }`). For
these the compiler mints one synthetic computed that asks the tests in order
and answers the arm index (`(a) ? 0 : (b) ? 1 : 2`, or `(v) === (t0) ? 0 : …`
ending in the `@default` arm's index, or one past the last arm when there is
none); the site's `armTests` lists every arm's index, so the same picker the
literal `@switch` uses selects by it. A chain with no final `@else` ends in an
empty arm the computed answers when every test fails. The site records the
index expression as `armIndexSource`, which the SSR module, the browser
prerender evaluator, and row templates evaluate wherever they would otherwise
evaluate the authored test text. Both shapes stay in tier 3: the flip rebuilds
the chosen arm from compiled markup and never escalates for the chain itself.

## D2. Escalation is never silent

If tier 3 cannot handle a flip (e.g. the @if contains a component), the
compiler escalates AND emits a diagnostic with a restructure suggestion
(`MARKLESS_BRANCH_ARM_RENDERS_IN_BROWSER`, a warning naming the component it
runs); the flip still replaces only the `@if`'s own range. The
sharp edge (a toggle wiping sibling DOM state) may only exist where a
diagnostic already said so. Silent failure is a defect class.

## D3. Arm-relative coordinate spaces

All records inside an async boundary arm (locators, events, behaviors, nested
branch sites) index relative to the boundary's start anchor. Arms become
closed, movable, replaceable, streamable units; the anchor pair is the only
coupling to the page. Enables per-boundary lazy record loading; retires
events-in-arm misalignment and in-arm compose offset arithmetic.

A keyed `@for` row the browser builds after load (a row added by a write)
registers each `@try` block its component renders the same way a settled arm
registers the blocks nested in it: the block's anchors index the row's own
comments, and the block settles and re-settles on its own like a served one.

## D4. Author vocabulary in diagnostics

"Arm", "boundary", "tier", "anchor" are contributor vocabulary. Diagnostics
speak the author's words: "@try block", "@pending content", "this @if
contains <Shell>". Every diagnostic fixture asserts its message text.

## D5. Streaming mechanism

The server flushes the document with each still-pending boundary showing its
@pending arm between its existing comment anchors, and keeps the response
open. When a boundary settles, the server appends to the same stream:

    <template m:arm="boundary:N">settled arm html</template>
    <script type="markless/arm" data-boundary="boundary:N">arm records (arm-relative)</script>
    <script type="markless/state-patch" data-graph-node="...">incremental state patch</script>
    <script>__mArm("boundary:N", [boundaries it depends on])</script>

The dependency list is present only when the boundary reads another
boundary's async values; the executor uses it to order reveals (D8).

The template parses inert (the browser builds its DOM without rendering it);
the once-installed executor moves that content into the boundary's anchor
range — the same `commitArm` operation the client tiers use — and the records
register against the fresh DOM. The pending arm is genuinely replaced, not
hidden and kept.

A streamed commit is one fragment move plus record registration, nothing
else. The anchor pair is the only address a boundary has, and it is already
in the document; graph cells are addressed by id, records by anchor plus
arm-relative index. Settled content is therefore live the moment it lands.

Markless has no runtime representation of the document. The DOM is the only
tree; the runtime holds graph state (cells addressed by id) and record
registrations (addressed by anchor and arm-relative index). Streamed content
therefore needs no integration step beyond the fragment move and record
registration above.

## D6. Sequencing and defaults (amended 2026-07-07, owner ruling)

Client-side primitive first (tiers 3-4, commitArm); streaming after it proves
out. Streaming additionally requires incremental snapshot serialization. Both
shipped in that order; the state patch is the incremental serialization.
Ordering groups (parallel/sequential/reverse) are a deferred nicety.

STREAMING IS THE DEFAULT SSR POSTURE. Blocking the whole page on every async
boundary defeats @try's purpose; the router server entry streams by default and
blocking render is the explicit opt-out. Safe because streaming degrades
gracefully: a buffering proxy delivers one complete document whose inert
templates commit on parse — early paint is lost, correctness never.

Three-layer opt-in semantics (no configuration creep — structure and timing
decide):

1. Entry: streaming default; `render: 'blocking'`-style option opts out.
2. Boundary: an authored @pending arm IS the boundary's streaming declaration
   (it is the waiting UI). A @try without @pending (if the grammar permits one)
   HOLDS the stream — the structural deferStream equivalent.
3. Per-request: a first-flush deadline renders fast-settling boundaries inline
   (no pending flash, no template bytes); only boundaries still pending at
   flush time stream out of order. Latency decides, not configuration.

## D7. Navigation

The router routes CLIENT-SIDE: dispatchRouteUpdate -> the route renderer
renders the destination in the browser -> boundaries settle via commitArm,
under the navigation hold in D8. The document.write/server-HTML-swap
navigation (2026-07-07, superseded) and its machinery (swap-pending flag,
rendered-route meta, before-document-swap teardown) are deleted. The Link
component owns SPA navigation; Back and Forward are client navigations too.
A plain anchor to a path is a document load. The one plain-anchor case the
router takes is a hash change toward a `#/...` route path in a hash-routed
app; any other hash change is an in-page jump and stays with the browser.

## D8. Deadline-gated pending (ratified 2026-07-08, owner)

Supersedes the same-day "first appearances only" wording.

`@try` / `@pending` / `@catch` is the ONLY async status vocabulary. There is
no property-style status surface: no `navigation.pending`, no `model.pending`,
no compiler lowering of status reads in templates (rejected by owner
2026-07-08). Anything an author wants to show about async progress is
expressed structurally in an arm.

@pending shows only when the wait is genuinely long, under one uniform rule
across all three cases:

- First load: the server's first-flush deadline renders fast-settling
  boundaries inline; only genuinely slow boundaries flush @pending and stream.
- Navigation: the outgoing page stays live and interactive until the
  destination settles or the client deadline passes; past the deadline the
  destination's @pending shows.
- Re-settle (mutation refresh, recompute; revised 2026-10-25, owner, on the
  async-refresh proof): the boundary keeps its last settled content
  (snapshots are versioned with status, so the prior value is always
  addressable) and every element whose binding reads a refreshing async
  value carries `aria-busy="true"` from the moment that value's refresh
  starts. A binding is a text or attribute update, a prop a child component
  shows, or a keyed list (its parent element is marked); it reads the value
  directly or through sync computeds, which the compiler records per
  boundary (per-element marks, 2026-11-04). Elements that read only sync state are never marked,
  even inside the block. Two async values in one block mark their own
  elements; a value that settles while another is still running clears its
  own marks, and the last one clears with the commit that shows it. `@pending`
  replaces the held content only when the NEWEST run has been pending longer
  than the stall threshold (5000 ms); the stall clock restarts on every newer
  run, so a typing burst never reaches it. A refreshing value no arm record
  binds (bare text at the block's top level, an arm that registered no
  records, a `@catch` arm reading only the error) falls back to the block's
  host: its parent element when the block is that element's only content,
  otherwise each top-level element of the shown arm. That fallback is decided
  at runtime because a component whose root is the boundary cannot see its
  parent at build time. The stall fallback applies only to a block that
  already shows settled content and whose `@pending` arm the browser holds:
  server-rendered and resumed boundaries get the busy marking but no stall
  fallback, because their `@pending` arm is not shipped to the browser. Live regions inside a busy
  boundary can be silenced by NVDA with Firefox, so announcements belong in a
  status element outside the boundary.
- Quiet re-settle (2026-11-06, async-error-states, submit-quiet-design.md
  Q2): a refresh starts quiet when the write that changed the async value's
  key did not happen inside an event handler's own turn — a `setInterval`/
  `setTimeout` callback, a socket or `EventSource` message, or a promise
  continuation no handler started. A quiet refresh gets neither the busy
  mark above nor the announcement (`refresh-announcer.ts`); it still swaps
  in the new content the moment it lands, and a quiet refresh that rejects
  still follows the failed-refresh rule below (the kept content stays, the
  `@catch` arm opens right after it) and still announces, because a silent
  failure is worse than an unexpected one. A write inside an event handler
  is loud — marked and announced as above — including a write the handler
  makes after an `await`: the compiler wraps the whole handler body, start
  to its eventual return or throw, in one mark, so a write anywhere in that
  body is loud regardless of which statement made it. Only a real DOM
  event's dispatch opens a user action, and it reaches other code through
  an explicit token the dispatch hands to every symbol it runs, not through
  wall-clock nesting: a callback prop the handler calls (directly, through
  any number of wrapper components, or fired and forgotten) inherits it at
  the moment of the call and keeps it for its whole body, awaits included;
  the same callback called by a timer or socket message after the dispatch
  ended carries a closed token and is quiet, even while an unrelated click
  is still open. So the same value is quiet when a poll bumps its key and
  loud when a button does. Known gap, not yet closed: JavaScript carries no
  context across an `await` by itself, so plain (non-symbol) code such as
  a timer callback that writes directly, firing while some handler is still
  waiting on its own `await`, is counted loud too. Closing it needs the
  compiler to rewrap each `await`, or a platform async context.
- Matched values during a re-settle (2026-11-04, async-error-states): the
  held content keeps showing pairs that belong together. A binding in the
  arm that reads the refreshing value beside an input of its key shows that
  input as the shown value was fetched with it, and a binding that reads an
  input outside the key updates in place at once (03-state-graph "Values
  shown together never mix"). So a client-settled arm registers update
  records for any binding whose value can change between settles: a sync
  computed or template expression that reads a live input, and an async
  value that reads one beside an async input.
- Failed refresh (2026-11-04, async-error-states): a refresh that rejects
  keeps the last good value. The rejected snapshot carries the previous
  settled `value` and the `valueKey` it was fetched for; a first-load failure
  has neither. A boundary showing `@try` content does not replace it: the
  content stays, its busy mark clears, and the `@catch` arm renders right
  after it, inside the same boundary, in a range opened by a runtime comment
  anchor that page-level comment walks skip. A later refresh that fulfills
  commits the `@try` arm over the whole boundary, which removes the `@catch`
  content; one that rejects again replaces only that range. On the first load
  `@catch` is still the only content. Every boundary follows this rule, nested
  or not; a nested boundary's failure is handled by that boundary and never
  reaches an outer `@catch`, because the outer boundary does not read the
  inner one's async values.
- Reset: `@catch (error, reset)` binds `reset` to a function an event handler
  in that arm may name or call (`onClick={reset}`, `() => reset()`). The
  compiler lowers it to a call that retries the boundary's async reads with
  their current keys: it lists them upstream first, each with the async values
  it reads, and a rejected value re-runs, or, when it is rejected because an
  async input is, that input re-runs instead. It is
  not a closure over the body, so it survives server render and resume.
  While the retry runs the shown content is held busy under the same rule as
  any refresh. `reset` may also be handed to a child component as a prop
  (`onRetry={reset}` or an inline arrow, through any number of components);
  each lowers to the same retry call. A handler in `@catch` still refuses any
  other body local the browser cannot recompute, including `error`.
- Handler rejection (2026-11-09, #540): an async event handler inside a
  `@try` whose returned promise rejects fails that block the way a failed
  refresh does: the content stays and the `@catch` arm renders after it. The
  failure reaches only the nearest `@try` around the handler's element, also
  when the handler is a callback prop a child or grandchild calls. Nothing
  rejected among the block's async values, so `reset` clears the `@catch`
  without fetching again. A promise the handler starts but neither returns
  nor awaits is not watched.

Fast paths never show pending — testable as a frame-sampled invariant. Once
pending UI shows, it stays a minimum duration (no blink). The client
deadline, stall-threshold, min-duration and reveal-cadence constants live in
one documented module (`packages/web/src/pending-timing.ts`: deadline 250 ms,
stall 5000 ms, minimum pending visibility 200 ms, reveal-train cadence
300 ms); the server's first-flush deadline (10 ms) lives with the stream
renderer. The timing state machine is pure and tested under a fake clock
across sweeps of settle times. Reveal choreography is
tier-aware: value-slot commits are layout-safe and commit immediately; range
commits join dependency-ordered reveal trains. All timing behavior is
structural or latency-decided — never per-block configuration. TSRX syntax is
unchanged.

## Open items

Known gaps on main as of 2026-11-10. Each is either being fixed or deferred;
none changes a ruling above.

- Independent blocks settle one after another (being fixed). Two `@try`
  blocks on one page that read unrelated values should reveal together, but
  a fragment render settles them in turn: two 1 s values take about 2 s.
- Reveal ordering groups (deferred, D6). Authors cannot ask for
  parallel/sequential/reverse reveal; streamed reveals follow the
  compiler-known dependency order only.
- Loud vs quiet across awaits in plain code (open, D8 "Quiet re-settle").
  Plain (non-symbol) code, such as a timer callback that writes directly, is
  counted loud while any handler is still waiting on its own `await`.
  Closing it needs the compiler to rewrap each `await`, or a platform async
  context.
- Async reads inside `@pending` and `@catch` (deferred). The rules above
  cover the `@try` arm's async reads; reading an async value directly in a
  `@pending` or `@catch` arm is not specified.
- Optimistic edits of existing rows (open). Adding a row optimistically is
  quiet, but an optimistic edit of a row already shown (a like, a toggle)
  still marks that row busy while its save runs.
- Mutations (design under research). How a save declares what it refreshes,
  and form-submit pending, are not specified here.
