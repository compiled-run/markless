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
  never replaces the held content, however long the refresh takes (revised
  2026-11-11, owner, on the async-dx research check: swapping shown content
  for `@pending` loses scroll position, focus, the caret and typed input, so
  keeping it wins; the 5000 ms stall threshold is removed). A refresh that
  fails keeps the content and opens `@catch` after it, as below. An author who
  wants a cue for a long refresh styles it from `aria-busy`, for example a
  CSS transition delay on the busy style. A refreshing value no arm record
  binds (bare text at the block's top level, an arm that registered no
  records, a `@catch` arm reading only the error) falls back to the block's
  host: its parent element when the block is that element's only content,
  otherwise each top-level element of the shown arm. That fallback is decided
  at runtime because a component whose root is the boundary cannot see its
  parent at build time. Client-rendered, server-rendered and resumed
  boundaries follow the same rule. Starting over from `@pending` on a new
  subject is the author's choice, made by keying a one-row list by that
  subject, which mounts a new block whose first load shows `@pending`. Live regions inside a busy
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
- Refresh after a save (2026-11-11, owner): when an event handler's write
  succeeds, every async value the page shows inside a `@try`, and every
  async value those read through sync computeds or other async values,
  re-asks with its current key, with no author code: no refresh or
  invalidate call, no action API, no status read. A write is a `fetch` the
  page sends to its own origin with a method other than `GET`, `HEAD` or
  `OPTIONS`, while at least one dispatch Markless runs for an authored
  handler is in flight; listeners added with `addEventListener` and other
  libraries' handlers are not such dispatches. It succeeds when its
  response is `ok`. Writes are never aborted, and latest-wins never applies
  to them. The refresh runs once, after every write in flight has settled
  and every dispatch known to have sent one of them has ended (2026-11-11,
  PM: a write sent in a dispatch's own synchronous run, before its first
  `await` or in a callback prop the handler calls there, is that
  dispatch's; a write sent after an `await` is no dispatch's, so its
  refresh waits for none). A dispatch that is merely running when a write
  is sent, such as one waiting for a dialog, holds nothing; a sender that
  never ends holds its refresh. It is loud: a save the
  person started is the person's change, so readers are marked busy and the
  refresh is announced as in the re-settle rule above. Busy from the send
  (2026-11-11, owner, research UC3, UC4 and UC6): the marks start when the
  write is sent, not when it answers. At that moment every value the
  refresh will re-ask (the same set, writers excluded) is held busy: a
  settled value takes the entry mark a handler writing its key input takes,
  and a value already loading is held as it is; one loading quietly (a
  poll) turns loud, so it is marked from the send too. While any write
  that holds a value is still out, a run of that value that lands (a poll,
  a key the handler changed, the previous save's refresh) is kept, not
  published, and the value stays marked; the refresh's own run supersedes
  it, and the kept answer is published only if the hold ends with nothing
  newer running. The holds end when every write of the round has settled
  and its known senders have ended, as the refresh starts; from then each
  value's mark clears when its own refreshed answer lands. So the mark is
  continuous from the send until that answer, and a second save sent while
  the first one's refresh loads keeps one continuous mark and one
  announcement pair. Holds count their holders: a handler's key write and
  every save holding a value each end their own hold. A hold whose holders
  are gone while a run is in flight is ending: that run's landing ends it
  and says how the saves ended. The content's mark lands with the first
  graph flush after the send, which can be one frame later when that flush
  waits for code still loading (the busy-marking module loads on a page's
  first loud refresh, never at page load).
  Only a known sender's element is marked: the element whose handler sent
  the write in its own synchronous run, set in the same task so it shows in
  the frame after the send. A write sent after an `await` marks the content
  but no control, because the browser cannot name its sender, and its round
  ends when that write has answered and its refresh has landed; the same
  handler saving again is a second round and a second refresh. A `submit`
  dispatch marks no control here; its form holds itself (Form submit
  pending below). Each sending dispatch has its own round: it opens at its
  first write, and again for a write sent in its own run after an earlier
  round of the same dispatch ended. Its control's mark and its `refreshed`
  promise, which the form's hold waits on, end when no value its round
  asked is pending any more, heard in the flush pass that publishes the
  last answer, after the subscriptions that clear the content's marks in
  that pass, so control, form and content clear in one frame; or at once
  when every write in the round failed. A container that unregisters (a
  navigation that removes the page) drops its values from every round, so
  a control in a part that stays is released. Control, form and content
  share `aria-busy` through its owners; an `aria-busy` the author wrote on
  such a control is cleared with it. The lean event path that runs a
  container's first event, before its full runtime loads, opens the same
  dispatch, so a control in a part with no async value of its own is
  marked too. The browser cannot tell a write is coming before it is sent
  (the analyzer has no fact for a `fetch` call site), so a handler that
  awaits something else first is marked from its write, and a handler that
  never writes marks nothing. When every write fails or answers with a
  non-`ok` status, the holds end as the last one settles, before the
  handler's own continuation runs, so a handler that throws on the failure
  reaches `@catch` with nothing marked; a value whose earlier refresh is
  still loading stays marked until that refresh lands. A write whose answer
  sends the page elsewhere ends its round at once and silently (the write
  watch's `'left'` outcome). A quiet refresh (a timer, a poll) marks nothing
  on its own. Announcements ride the value marks, one pair per continuous
  busy span: "Updating…" once they have held for the settle deadline (250
  ms), then one closing line a reveal cadence (300 ms) after the last
  clears; a span that ends sooner says only the closing line. That line is
  "Updated", or "Update failed" when a save that held one of the span's
  values failed (a network error, a 4xx or 5xx, whether the handler ignores
  it or throws into `@catch`) or a refreshed answer was rejected: the
  failure travels on the snapshot that ends that value's mark
  (`writeFailed`), so only the blocks whose marks it held can say it, once.
  The announcer counts a busy block by its anchor, so content the block
  re-renders while busy does not end its share; a block whose anchor left
  the page no longer counts. Limits: a save a recipe sends after its
  dispatch ended (the draft-row recipe) marks and reloads nothing; and on a
  server-rendered page, a reader blocked behind an input a failed save
  marked asks its unchanged key once when the input is given back.
  Inputs re-ask before
  their readers, so a value keyed by another async value waits for that
  input's answer and runs once. A value that started a run after the writes
  settled (the handler changed its key) is not asked again. A value whose
  run was already in flight when the writes settled starts that run over,
  so an answer requested before the save landed never shows. A value whose
  recipe sent a non-`GET` request in the synchronous start of its latest
  run counts as a writer and is never re-asked by this rule, because that
  would send the write again; and while a dispatch is in flight, that
  request also counts as a write, so the other values refresh. Both hold
  for a read sent as a `POST` (GraphQL, RPC), which is therefore not
  refreshed after a save and, when a handler changes its key, refreshes the
  rest of the page (open item below). A write that fails, rejects, is sent
  outside any dispatch (a timer, a socket message) or to another origin
  refreshes nothing; neither does a write made through `XMLHttpRequest`,
  `sendBeacon`, a WebSocket or a `fetch` reference taken before the page
  wired its async values. A write that never settles holds every later
  refresh on the page until it does; an author bounds it with the request's
  own `signal` (`AbortSignal.timeout`). Every container wired when the
  writes settle refreshes, including one a navigation rendered while a
  write was in flight. A recipe that sends a write after an `await` is not
  attributed: a refresh re-runs it and sends the write again. A write that
  no dispatch can be named for, sent while an earlier save's refresh still
  has a re-asked value loading, is not a new save, so such a recipe cannot
  loop; the cost is that a handler's own write sent after an `await` in
  that window is not refreshed either. Authoring
  rule: writes start before a recipe's first `await` or live in handlers;
  in development the runtime warns when a write is sent outside any
  dispatch while a run a refresh started is still loading. No compile-time
  check exists, because the analyzer has no fact for a fetch call site's
  method or for what a recipe reaches across functions. Validated by
  `packages/vitest-browser/browser/mutations-refresh` and the docs recipe
  `async-recipes/mugs.tsrx`; the marks from the send by
  `packages/vitest-browser/browser/save-busy`.
- Matched values during a re-settle (2026-11-04, async-error-states): the
  held content keeps showing pairs that belong together. A binding in the
  arm that reads the refreshing value beside an input of its key shows that
  input as the shown value was fetched with it, and a binding that reads an
  input outside the key updates in place at once (03-state-graph "Values
  shown together never mix"). So a client-settled arm registers update
  records for any binding whose value can change between settles: a sync
  computed or template expression that reads a live input, and an async
  value that reads one beside an async input.
- The clicked control's own text (2026-11-10, owner, UC23): the one place
  values shown together may mix. A pager button labelled
  `Next: page {page} of {rows.count}` shows the new page on the click, next
  to the count it already shows; every other reader of `page` beside `rows`,
  such as a `Page {page} of {rows.count}` line next to the button, stays
  matched until the new rows land. The rule, from compiler facts only: a
  text read whose value is one per-site template expression reaching an
  async value, whose nearest enclosing element in the same component's
  markup (itself included) is a control element (`button`, `select`,
  `option`, `textarea`, `label`, the same set the
  `MARKLESS_ASYNC_INPUT_BESIDE_VALUE` warning treats as showing the user's
  own choice), reads each state that control's own event handlers write as
  written; its other inputs and its async parts read as shown. The compiler
  marks those dependencies `writtenByControl` on the computed record. Not
  covered, so still matched: text a child component renders inside its own
  control (the child cannot see that its callback prop writes the parent's
  state), text in a keyed `@for` row (a row rebuilds from one shown read
  for the whole row), a sync computed read in the text (only the written
  state read directly counts), attributes such as `disabled`, and a
  container with a handler that is not a control element (a `form` or
  `div`). The rule is static, so every control that writes the state shows
  it as written, not only the one clicked. The control stays marked busy
  while its async part refreshes.
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
- Text beside the error (2026-11-11, async-dx): text in a `@catch` arm that
  joins the error with page state in one run of text, such as
  `<p>{error.message} (attempt {attempt})</p>`, updates in place when the
  state changes, like any other joined text: the element stays and its text
  is rewritten whole. The compiler resolves the error binding by its
  declaration, not its name, and gives that boundary a cell holding the error
  the shown `@catch` renders. The server writes the cell when it renders the
  arm, inline or streamed, as the error's name and message (the same durable
  form a rejected snapshot carries), and every browser commit of the arm
  writes it before the arm's updates subscribe. While a retry runs the
  `@catch` content stays and nothing rewrites the cell, so the text keeps the
  error it shows; the next `@catch` commit writes the new one. A boundary
  whose `@catch` text never joins the error with a graph read gets no cell.
  Unchanged: a handler in `@catch` refuses `error` (rule above), and one
  `{...}` template literal mixing the error with state is still refused at
  build time.
- Handler rejection (2026-11-09, #540): an async event handler inside a
  `@try` whose returned promise rejects fails that block the way a failed
  refresh does: the content stays and the `@catch` arm renders after it. The
  failure reaches only the nearest `@try` around the handler's element, also
  when the handler is a callback prop a child or grandchild calls. Nothing
  rejected among the block's async values, so `reset` clears the `@catch`
  without fetching again. A promise the handler starts but neither returns
  nor awaits is not watched.
- Form submit pending (2026-11-11, owner; extent per the async-dx
  research): while a `submit` handler's returned promise runs, the
  submitted form carries `aria-busy="true"` and the control that submitted
  it (`event.submitter`) carries `aria-disabled="true"`. When the handler's
  dispatch sent a same-origin write that succeeded, the marks and the
  repeat hold below stay until the refresh after a save that write caused
  has landed: they clear in the flush that commits the refreshed content,
  or that commits its failure. When no refresh follows (no write, or every
  write in the round failed) they clear once the promise settles and the
  dispatch ends. Writes that overlap join one refresh round, so the marks
  of every dispatch in that round clear together; a dispatch still running
  when another sends its write is part of that round, so one that never
  ends keeps the round, and its marks, open. A rejection still follows the
  handler-rejection rule above. No author code and no status read: authors
  style `form[aria-busy="true"]`. `disabled` is not used because it drops
  keyboard focus from the pressed control and does not give it back; focus
  stays on the control throughout. `aria-disabled` does not itself block
  activation. A handler that returns no promise marks nothing. Other submit
  controls of the form are not marked.
  - Repeat hold: what a submission carries is read when its dispatch
    reaches the handler, before the handler runs: the value and checked
    state of every control in `form.elements`, all selected options of a
    select, each file's name, size and last-modified time, and the
    submitter element (an image button included; no submitter is its own
    case). A second submit of the form whose record and submitter equal
    those of a submission still held is cancelled before any handler hears
    it, with no message. Any other submit starts at once, because holding
    it back would lose it and replaying it later would read the form after
    the first run may have cleared it. Disabled and unnamed controls take
    part, which errs toward sending. A form-associated custom element's
    value set only through `ElementInternals` is not seen, so a change to it
    alone can be held as a repeat.
  - The hold lives in a module that loads on the first submit whose handler
    returns a promise, never at page load, and starts as soon as it is
    loaded; every later submission is held as its handler returns. A repeat
    pressed before the first hold has started is sent. Closing that needs
    the submit event record to say the handler can return a promise, so the
    hold starts at dispatch, at a download cost on every page; not done.
  - `aria-busy` on an element is true while any owner holds it: a refresh
    showing that element's value, or a submission of that form. Each owner
    clears only its own hold.
  - A submit event record carries `authoredSubmitAriaDisabled` when a
    control that submits its form has an author-written `aria-disabled`
    (static or bound; the analyzer's fact, not a DOM read). Such a form
    then writes `aria-disabled` on none of its controls, so an unbound
    second submit control of that form is not marked either; the form's
    `aria-busy` and the repeat hold still apply.
  - `MARKLESS_ASYNC_ARIA_BUSY_MANAGED` refuses an authored `aria-busy` on a
    form whose own or enclosing `submit` handler can return a promise. A
    form busy for another reason marks it with a class or a `data-`
    attribute.
  - A form inside a shadow root is not marked: the submit event does not
    leave the shadow tree, so it reaches no dispatcher outside it.
- Form sent in place (2026-11-11, owner): a `<form>` with
  no `submit` handler is sent by the runtime without a page load when the
  analyzer and the submit both say it is a same-origin `POST` in this tab.
  The server side is the app's own route (a router `api/` endpoint or any
  same-origin URL); Markless adds no client action API.
  - Analyzer fact: a host `<form>` whose `method` is the string `post` in
    any case, or an expression (decided at submit), inside a `@try` that
    has a `@catch`, with no `submit` handler on it or on an enclosing
    element of the same component, and no spread attribute. It gets a
    `submit` record with no symbols, the sync policy
    `{ when: { type: 'submits-in-place' }, actions: ['preventDefault'] }`
    (served as the event-host code `f`) and `inPlaceSubmit`: `keep` when
    an element in the form has a bound property (a field showing state),
    otherwise `reset`. The `@try` joins the boundaries whose `@catch` takes
    handler failures, so it carries `catchesHandlers` and its own gate. A
    form with a method other than `post`, a spread, or no enclosing
    `@try`/`@catch` gets no record, and the browser submits it. A submit
    handler in another component around the form is not seen; that form is
    both sent in place and handed to the handler.
  - Never worse than the browser's own submit: with JavaScript on, the
    page's listeners and the server see what they would see without it.
  - Submit-time check, one self-contained function shared by the boot and
    the runtime (`inPlaceSubmission`, `packages/web/src/inline/sync-policy-core.ts`).
    The policy does not cancel at once: it waits until the event has
    passed every listener (a bubble listener on the window, registered for
    that one event), so every listener on the page runs first and sees
    `defaultPrevented` false. Only if none cancelled it, and the event
    reached the window, is the submit kept from the browser and sent in
    place. A listener that cancels it sends nothing through Markless; one
    that stops it leaves it to the browser. It is kept when the method
    (the submitter's `formmethod`, else the form's) is `post`; the target
    (`formtarget`, else the form's, else a `<base target>`) is empty or
    `_self`; the form's `rel` has no `external`; and the action
    (`formaction`, else the form's) has this page's origin. The form is
    read through `HTMLFormElement.prototype` and `Element.prototype`, since
    a field named `action`, `target`, `method`, `enctype`, `relList`,
    `elements` or `reset` shadows the form's own property. The event
    carries a promise of the kept submission, which the dispatch awaits.
    The check ships as its own inline script only on a page whose records
    hold an in-place form; the boot's sync-policy variants carry only the
    call.
  - First press: the boot marks the kept form `aria-busy` at once, before
    the runtime has loaded. If the runtime or the sender cannot load, the
    browser's own submit runs (`requestSubmit` through the prototype,
    with the submitter), so a form that would have worked natively still
    works. A repeat pressed before the hold module has loaded is sent, as
    for handlers.
  - Send: inside the submit's own dispatch, as a handler's save, so the
    refresh after a save, the form submit pending marks and repeat hold,
    and the handler-rejection rule apply unchanged. The request is the one
    the browser would send: the action URL, `POST`, a body in the chosen
    encoding (`multipart/form-data` as form data with files,
    `application/x-www-form-urlencoded` with each file's name, `text/plain`
    as `name=value` lines; line breaks as CRLF), the submitter's name and
    value, and no referrer under `rel="noreferrer"`. It carries the request
    header `IN_PLACE_REQUEST_HEADER` (`packages/web/src/fns/in-place-headers.ts`).
  - Answer: the generated wrapper of every router `api/` route, after the
    cross-site write check, answers a marked `POST`'s 301, 302 or 303 (a
    `Response`, or h3's `redirect()` answer, which has the same shape)
    whose location resolves to an `http:` or `https:` address with a
    body-less 200 carrying the location in `IN_PLACE_LOCATION_HEADER` and
    every other header (cookies included), `cache-control: no-store` and
    `vary` on the request header; `content-length` and `content-encoding`
    are dropped and the redirect's body is cancelled. Any other method,
    any other location, and a 307 or 308 (which repeats the `POST`) keep
    the redirect. The client follows only an `http:` or `https:` location;
    any other is a failed save in the `@catch`, so no `javascript:` or
    `data:` address runs on the page. So the page a
    redirect names is never rendered and thrown away: a location on this
    page refreshes the shown values; another page of this site is followed
    as a link click (the router swaps it in place); another site loads
    with `location.assign`. A save whose answer leaves the page asks
    nothing on it again. A route the wrapper does not answer (middleware,
    or a same-origin URL outside `api/`) keeps today's behaviour: `fetch`
    follows its redirect and the followed page is rendered once and not
    shown. Any other success keeps the page: the shown values refresh,
    and the form resets (through the prototype) when `inPlaceSubmit` is
    `reset`. A non-`ok` answer rejects into the `@catch` with an `Error`
    whose message is a JSON body's `message`, a `text/plain` body, or the
    status text; a network failure rejects with the browser's error. In
    both the content and typed values stay. The mark changes only how an
    accepted request's redirect is answered, never whether a write is
    accepted.
  - Opt-out without a new word: `rel="external"` on the form, the same
    token that makes the router leave a link to the browser.
  - Not covered: a prerendered client-rendered page's boot applies no
    sync policies, so its forms keep the browser's submit; a form inside a
    shadow root is not dispatched; a form whose `@try` is in another
    component file is not seen and stays the browser's. If the page is
    replaced by an in-place navigation after the boot has kept a submit
    but before the dispatch reaches the sender, the submission leaves with
    the page and nothing is sent, as a navigation started right after a
    native submit replaces it.

Fast paths never show pending — testable as a frame-sampled invariant. Once
pending UI shows, it stays a minimum duration (no blink). The client
deadline, min-duration and reveal-cadence constants live in one documented
module (`packages/web/src/pending-timing.ts`: deadline 250 ms, minimum pending
visibility 200 ms, reveal-train cadence 300 ms); the server's first-flush deadline (10 ms) lives with the stream
renderer. The timing state machine is pure and tested under a fake clock
across sweeps of settle times. Reveal choreography is
tier-aware: value-slot commits are layout-safe and commit immediately; range
commits join dependency-ordered reveal trains. All timing behavior is
structural or latency-decided — never per-block configuration. TSRX syntax is
unchanged.

## Open items

Known gaps on main as of 2026-11-11. Each is either being fixed or deferred;
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
- Mutations (partly specified). Refresh after a save, form submit
  pending and form sent in place are ruled above. Narrowing which values a
  save refreshes is not approved.
- Requests from inside an async value (open, owner, D8 "Refresh after a
  save"). Today a non-`GET` request a recipe sends counts as a write, which
  keeps a recipe that saves (a draft row) from being sent twice, but treats
  a read sent as a `POST` as a save. The alternative, every request inside
  an async value is a read and saves live only in handlers, refreshes
  `POST` reads but re-sends a recipe's save on every refresh.
- Writes after an `await` in a recipe (open, D8 "Refresh after a save").
  Covered by an authoring rule and a development warning only; a compile
  error needs an analyzer fact for fetch call sites and what a recipe
  reaches.
