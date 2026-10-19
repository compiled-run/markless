# Resume without data scripts

Research note, 2026-10-19. Read-only research: no code changed. Scratch scripts and raw output live in
`/tmp/rwds` (crawler `crawl.mjs`, `authcrawl.mjs`, `authrw.mjs`; classifier `analyze.mjs` with
`literals.mjs`; tables `agg.mjs`, `tiers.mjs`, `edges.mjs`; browser checks `firstclick.mjs`, `profclick.mjs`,
`drift.mjs`; encoder benchmark `bench/`). Per-route results are in `/tmp/rwds/out/<site>.json`.

Owner's question: do we need `markless/state` and `markless/view` at all, or can the browser know or
recover the same thing without a data script?

## 1. Short answer

Mostly no, we don't need them. Across all 1,212 crawled routes that ship a payload, **99.7% of payload bytes are
things the compiler already knows or the browser can work out from the page itself**. Only about **0.2%**
(286 KB out of 160.6 MB of payload) is hidden state that has to be sent.

Two caveats change what that means in practice:

1. **Most of the payload is framework records, not app data.** App values (cell values, async results,
   `attach` inputs) are only 3.8% of payload bytes. The other 96% is ids, wiring, update records, shared
   definitions and computed records, all compile-time plus the composition instance path. So the main win
   does not come from reading values out of the DOM. It comes from **not shipping records the compiled
   code already has**.
2. **Reading app values back from the DOM buys little and carries the most risk.** Most of what is in
   the DOM is also a literal in the source: 90% of value bytes match a compile-time literal, and only 0.3%
   are exclusively DOM-recoverable. Meanwhile the live DOM had already changed before first interaction on
   16 of 92 sampled routes.

The recommendation is a three-step design, each step separately measurable:

1. **Wiring in attributes.** Replace the locator and event lists with a short handler-reference
   attribute on each event host, read by delegated listeners. This removes the census walk and the view
   parse from page load, so JS run at load goes down.
2. **Records from compiled code.** Re-derive the records on first interaction from the compiled render
   data. The existing "prerender wake channel" already does this as a baseline-plus-delta.
3. **Send only the request-time values.** Cell values the compiler cannot know, async results and row
   keys go as a small per-island values script, decoded lazily. The encoding is "tagged JSON": plain
   JSON plus a few tags for what JSON cannot express. Its 526 B decoder loads on first interaction; it is
   the smallest after compression among the formats tried, needs no eval, and round-trips the data
   (section 8).

## 2. What was measured

**Crawl.** Every route of every Markless deployment. Seeds came from each port's `.migrate/inventory.json`
(`routes` and `routeUnion`), the live `sitemap.xml`, and a breadth-first walk of same-origin links on the
Markless host. Signed-in routes were fetched after a real login: remix-notes `/notes*`, next-dashboard
`/dashboard*` and realworld `/editor`, `/settings`. Duplicates by final URL were dropped.

| Site | Host | Routes fetched (unique) | Routes with a payload |
|---|---|---|---|
| markless.dev | markless.dev | 360 | 360 |
| htmx.org | mm-htmx-org-new.vercel.app | 189 | 188 |
| alpinejs.dev | mm-alpinejs-dev-new.vercel.app | 78 | 76 |
| shadcn-admin | mm-shadcn-admin-new.vercel.app | 33 | 33 |
| AG Grid | mm-ag-grid-new.vercel.app | 1 | 1 |
| Remix notes | mm-remix-notes-new.vercel.app | 9 (5 signed in) | 9 |
| RealWorld | mm-realworld-new.vercel.app | 53 (7 signed in) | 53 |
| Next dashboard | mm-next-dashboard-new.vercel.app | 16 (12 signed in) | 14 |
| vite.dev | vite-dev-markless.vercel.app | 57 | 1 |
| Docusaurus | mm-docusaurus-new.vercel.app | 474 | 472 |
| migrate demo | migrate-demo-new.vercel.app | 5 | 5 |
| **All** | | **1,275** | **1,212** |

vite.dev doc pages ship no Markless payload: they run hand-written `/page-scripts/page.js`, so only `/`
counts. The AG Grid port has a single route.

**Decoding.** Both scripts are parsed and run through `decodeProtocolPayloadLists` from origin/main
(`a7efd422`, the record-templates and key-table change). Cell values and async snapshots are decoded with
`deserializeGraphValue`. **None of the live sites serve templated records yet**, so the "after compact
records" column re-encodes every live payload with `encodeProtocolPayloadLists`.

**Classification.** Every byte of every record goes into one class. Key names and JSON punctuation are
spread across the record's leaves in proportion to their size.

- **(a) In the DOM.** A value leaf whose string equals a text node or attribute value (exact, after
  whitespace collapse, or embedded inside a larger text run), or a number whose `String()` is in the DOM.
  The async served arm (`initiallyServedArm`) also counts here.
- **(b) Compile-time.** Every record field the compiler writes: names, symbol ids, `source`, paths,
  targets, row templates, arm plans, flags, and the module-local part of every id. It also covers value
  leaves found as a literal in the site's own source: string literals, JSX/MDX text and bundled JSON, read
  from the site's checkout. Booleans, nulls and numbers count as (b) when they are invariant across every
  instance of that cell on the site.
- **(c) Derivable from the component tree and DOM order.** The instance-path prefix of every id
  (`m0:c0:c2:`, `r:<key>:`), dom-order `index`, comment-anchor indexes, `data-markless-paths`, and page
  props equal to the URL or route params.
- **(d) Recomputable.** Sync `computed[].value`, async snapshot status, version and key.
- **(e) Hidden.** Everything else, meaning value leaves found in neither the DOM nor the source.

Precedence for values is (b) before (a) before (e): a value that is both a literal and in the DOM counts as (b).

**Where the heuristics lean.** They lean toward (b) for strings that happen to equal some literal, and toward
(e) for strings built by concatenation in source (for example markless.dev's keyboard hints) and for booleans
that differ per instance. The (e) figure is therefore a lower bound, and "all app values" is used as the
conservative upper bound throughout.

## 3. Results

### 3.1 Per site

Sizes are raw bytes as served (HTML is compressed on the wire; gzip shown separately).

| Site | Routes | With payload | HTML MB | Payload MB | Payload share of HTML | After compact records MB | Payload gzip KB, today / compact | a | b | c | d | e | e KB | App values: a / b / e share |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| markless.dev | 360 | 360 | 210.81 | 155.36 | 73.7% | 42.46 | 7203.5 / 4009.7 | 0.0% | 70.6% | 29.0% | 0.2% | 0.2% | 272.3 | 0.0 / 92.2 / 5.7% of 4677 KB |
| htmx.org | 189 | 188 | 9.66 | 0.22 | 2.3% | 0.22 | 109.0 / 109.0 | 0.0% | 75.5% | 24.3% | 0.0% | 0.0% | 0.0 | 0.0 / 43.6 / 0.0% of 73 KB (rest: URL props) |
| alpinejs.dev | 78 | 76 | 7.75 | 1.92 | 24.8% | 1.60 | 193.9 / 187.7 | 0.1% | 91.7% | 8.1% | 0.0% | 0.1% | 1.9 | 0.1 / 97.5 / 0.2% of 893 KB |
| shadcn-admin | 33 | 33 | 12.83 | 6.22 | 48.5% | 2.79 | 410.2 / 306.5 | 0.1% | 88.8% | 10.9% | 0.1% | 0.2% | 9.4 | 1.8 / 92.3 / 3.6% of 252 KB |
| AG Grid | 1 | 1 | 0.16 | 0.11 | 69.8% | 0.10 | 9.5 / 9.3 | 0.1% | 85.3% | 8.9% | 4.0% | 0.2% | 0.2 | 4.3 / 85.8 / 6.0% of 3 KB |
| Remix notes | 9 | 9 | 0.15 | 0.04 | 29.4% | 0.04 | 11.6 / 11.9 | 3.6% | 80.5% | 11.2% | 2.0% | 2.4% | 1.0 | 18.8 / 40.2 / 12.5% of 8 KB |
| RealWorld | 53 | 53 | 0.75 | 0.09 | 12.0% | 0.09 | 33.4 / 33.4 | 0.0% | 77.2% | 22.7% | 0.0% | 0.0% | 0.0 | 0.0 / 34.5 / 0.0% of 19 KB |
| Next dashboard | 16 | 14 | 0.46 | 0.11 | 24.6% | 0.11 | 25.5 / 25.5 | 7.9% | 72.0% | 18.5% | 0.8% | 0.5% | 0.6 | 30.7 / 49.4 / 2.0% of 28 KB |
| vite.dev | 57 | 1 | 6.75 | 0.02 | 0.2% | 0.01 | 1.9 / 1.8 | 0.3% | 91.5% | 8.2% | 0.0% | 0.0% | 0.0 | 4.7 / 80.0 / 0.0% of 1 KB |
| Docusaurus | 474 | 472 | 85.71 | 0.39 | 0.5% | 0.39 | 217.4 / 217.4 | 0.0% | 69.1% | 30.7% | 0.0% | 0.0% | 0.0 | 0.0 / 34.4 / 0.0% of 163 KB |
| migrate demo | 5 | 5 | 0.07 | 0.01 | 11.8% | 0.01 | 3.2 / 3.2 | 1.6% | 83.5% | 14.8% | 0.0% | 0.0% | 0.0 | 6.0 / 57.0 / 0.0% of 2 KB |
| **All** | **1,275** | **1,212** | **335.10** | **164.50** | **49.1%** | **47.82** | **8219 / 4915** | **0.0%** | **71.6%** | **28.0%** | **0.2%** | **0.2%** | **285.5** | **0.3 / 90.4 / 4.6% of 6119 KB** |

In the last column, whatever is not a, b or e is class (c): page props that equal the URL or route params.

The `data-markless-paths` attribute adds another 483 KB across all routes (class c).

Compact records cut markless.dev's raw payload by 73% and its gzip size by 44%. They do nothing for the
small ports, because nothing there repeats a quarter of a list.

### 3.2 What a three-step design would leave to send

All sizes in KB (1,024 B). The second column is the payload served today; "Left to send" means hidden values
plus the new wiring attributes.

| Site | Today | Wiring lists (locators, events, paths attribute) | New wiring attributes | Records the compiler knows | App values | of which hidden (e) | Left to send | Saved | Conservative: send every app value (left / saved) |
|---|---|---|---|---|---|---|---|---|---|
| markless.dev | 151723.0 | 7488.9 | 141.5 | 139937.5 | 4677.0 | 272.3 | 413.8 | 99.7% | 4818.5 / 96.8% |
| htmx.org | 213.5 | 60.4 | 2.8 | 94.5 | 72.6 | 0.0 | 2.8 | 98.7% | 75.5 / 64.7% |
| alpinejs.dev | 1879.8 | 245.2 | 9.2 | 765.7 | 893.0 | 1.9 | 11.2 | 99.4% | 902.2 / 52.0% |
| shadcn-admin | 6075.3 | 978.9 | 42.6 | 4882.6 | 252.2 | 9.4 | 52.1 | 99.1% | 294.8 / 95.1% |
| AG Grid | 111.0 | 19.4 | 1.0 | 89.2 | 3.3 | 0.2 | 1.2 | 98.9% | 4.3 / 96.2% |
| Remix notes | 42.7 | 4.6 | 0.2 | 30.9 | 7.8 | 1.0 | 1.2 | 97.3% | 8.0 / 81.2% |
| RealWorld | 87.9 | 47.2 | 2.4 | 28.7 | 19.3 | 0.0 | 2.4 | 97.5% | 21.7 / 75.3% |
| Next dashboard | 110.5 | 3.0 | 0.1 | 79.7 | 28.2 | 0.6 | 0.7 | 99.4% | 28.3 / 74.4% |
| vite.dev | 14.9 | 3.2 | 0.1 | 11.1 | 0.9 | 0.0 | 0.1 | 99.2% | 1.0 / 93.2% |
| Docusaurus | 377.9 | 119.5 | 11.1 | 112.0 | 162.6 | 0.0 | 11.1 | 97.2% | 173.7 / 54.0% |
| migrate demo | 7.8 | 2.3 | 0.2 | 4.0 | 2.0 | 0.0 | 0.2 | 98.1% | 2.1 / 72.5% |
| **All** | **160644** | **8973** | **211** | **146036** | **6119** | **286** | **497** | **99.7%** | **6330 / 96.1%** |

**How the wiring-attribute cost was estimated.** Each event host is charged ` m:on="` plus, for each event,
its name, a separator and a two-character handler reference (2 more bytes for a sync policy), plus the
closing quote. The "Conservative" column assumes the compiler recovers no app value at all.

**How to read the htmx, Docusaurus and Alpine numbers.** Their app values are mostly route props equal to
`location`, plus nav and props data that is literal in source, which is why the conservative column looks
poor for them.

### 3.3 Distribution across routes

| Site | Routes with payload | min KB | median KB | p90 KB | max KB | e median B | e p90 B | e max B |
|---|---|---|---|---|---|---|---|---|
| markless.dev | 360 | 52.3 | 406.6 | 474.1 | 943.3 | 711 | 1031 | 2730 |
| htmx.org | 188 | 1.0 | 1.1 | 1.1 | 9.8 | 0 | 0 | 0 |
| alpinejs.dev | 76 | 0.8 | 26.5 | 29.5 | 40.2 | 17 | 49 | 118 |
| shadcn-admin | 33 | 13.4 | 222.9 | 297.0 | 847.0 | 249 | 418 | 3212 |
| AG Grid | 1 | 111.0 | 111.0 | 111.0 | 111.0 | 209 | 209 | 209 |
| Remix notes | 9 | 1.8 | 4.1 | 7.8 | 7.8 | 0 | 345 | 345 |
| RealWorld | 53 | 1.2 | 1.4 | 2.3 | 2.6 | 0 | 0 | 0 |
| Next dashboard | 14 | 2.1 | 9.0 | 13.5 | 23.6 | 45 | 93 | 216 |
| vite.dev | 1 | 14.9 | 14.9 | 14.9 | 14.9 | 0 | 0 | 0 |
| Docusaurus | 472 | 0.7 | 0.8 | 0.8 | 1.0 | 0 | 0 | 0 |
| migrate demo | 5 | 0.9 | 0.9 | 3.5 | 3.5 | 0 | 0 | 0 |

### 3.4 Worst routes

By payload size. Sizes in KB; the "compact" column is the state and view scripts re-encoded with compact records.

| Site | Route | HTML | state | view | Payload share of HTML | Payload, compact | e |
|---|---|---|---|---|---|---|---|
| markless.dev | /concepts/state | 1964.5 | 684.5 | 258.8 | 48.0% | 422.9 | 1.5 |
| shadcn-admin | /users | 1562.4 | 416.1 | 430.9 | 54.2% | 338.5 | 3.1 |
| markless.dev | /ui/styling | 931.1 | 521.2 | 190.0 | 76.4% | 430.1 | 1.2 |
| markless.dev | /ui/accordion | 964.0 | 381.9 | 278.4 | 68.5% | 305.1 | 2.7 |
| markless.dev | /ui/radiogroup | 857.8 | 366.1 | 282.0 | 75.5% | 290.3 | 1.4 |
| markless.dev | /ui/combobox | 855.2 | 361.5 | 276.5 | 74.6% | 273.9 | 1.4 |
| markless.dev | /ui/carousel | 832.7 | 349.1 | 273.5 | 74.8% | 260.8 | 1.5 |
| markless.dev | /ui/gridlist | 832.5 | 344.1 | 263.4 | 73.0% | 271.7 | 1.3 |
| markless.dev | /ui/table | 817.7 | 340.1 | 254.9 | 72.8% | 263.4 | 1.3 |
| markless.dev | /build/shared | 810.6 | 361.7 | 223.9 | 72.2% | 242.8 | 1.0 |

By hidden bytes, the top routes are shadcn-admin `/users` (3.1 KB), markless.dev `/ui/accordion`
(2.7 KB: the `m6:state:keyboard` hint table, built by concatenation in source, so it is a heuristic miss
rather than real hidden state) and `/errors/MARKLESS_ATTACH_NO_START_TRIGGER` (2.0 KB of prose parts split
around inline code).

### 3.5 Per payload field, all sites

| Field | Records | KB | Share | a | b | c | d | e (KB) |
|---|---|---|---|---|---|---|---|---|
| view.domUpdates | 183,345 | 47583.8 | 29.6% | 0.0% | 63.7% | 36.3% | 0.0% | 0.00% (0.0) |
| state.computed | 114,371 | 45677.1 | 28.4% | 0.0% | 69.9% | 29.3% | 0.8% | 0.00% (1.2) |
| state.sharedDefinitions | 21,735 | 32314.9 | 20.1% | 0.0% | 79.0% | 21.0% | 0.0% | 0.00% (0.0) |
| state.cells | 47,352 | 13391.5 | 8.3% | 0.1% | 84.3% | 13.5% | 0.0% | 2.12% (284.3) |
| view.elementHandles | 67,490 | 12139.1 | 7.6% | 0.0% | 75.0% | 25.0% | 0.0% | 0.00% (0.0) |
| view.locators | 64,734 | 5991.2 | 3.7% | 0.0% | 62.0% | 38.0% | 0.0% | 0.00% (0.0) |
| view.events | 14,631 | 2498.1 | 1.6% | 0.0% | 89.3% | 10.7% | 0.0% | 0.00% (0.0) |
| view.keyedRepeats | 961 | 442.2 | 0.3% | 0.0% | 76.4% | 23.6% | 0.0% | 0.00% (0.0) |
| view.branches | 462 | 294.8 | 0.2% | 0.0% | 89.1% | 10.9% | 0.0% | 0.00% (0.0) |
| view.asyncBoundaries | 24 | 97.7 | 0.1% | 0.0% | 84.5% | 15.5% | 0.0% | 0.00% (0.0) |
| state.sharedSeeds | 222 | 61.5 | 0.0% | 0.0% | 87.4% | 12.6% | 0.0% | 0.00% (0.0) |
| view.behaviors | 51 | 61.0 | 0.0% | 0.0% | 99.5% | 0.5% | 0.0% | 0.00% (0.0) |
| state.storage | 570 | 52.1 | 0.0% | 0.0% | 100.0% | 0.0% | 0.0% | 0.00% (0.0) |
| state/view version | 2,424 | 28.4 | 0.0% | 0.0% | 100.0% | 0.0% | 0.0% | 0.00% (0.0) |
| view.asyncRunners | 15 | 1.1 | 0.0% | 0.0% | 100.0% | 0.0% | 0.0% | 0.00% (0.0) |

Per-site field tables (markless.dev, shadcn-admin, Alpine, Docusaurus) are printed by
`node /tmp/rwds/agg.mjs fields <site>`. Three patterns stand out:

- **Ids dominate the view script.** On the markless.dev home page, `graphNodeId`, `hostNodeId`,
  `handleId` and `symbolId` key/value pairs are 146 KB of the 231 KB view script.
- **Some props are sent more than once.** The same props object is sent once per projection
  (`m12:c0:c0:prop:props` and `m12:c0:c0:p1:p2:p3:prop:props`, 20.7 KB each). On markless.dev
  `/ui/styling`, 141 KB of cell values are exact duplicates of another cell on the same page.
- **`domUpdates[].source`**, the authored expression text, is devtools-only (stripped on
  `executionLog: never` pages). It is still served on markless.dev: 8–9 KB per page.

## 4. What each field is for, and who reads it

The full reader table with file:line is in the scout receipt; the essentials:

- **The inline boot reads only `markless/view` at load**: locators, events, and the event names inside
  keyedRepeats, branches and asyncBoundaries (`packages/web/src/inline/resumer.ts:816-840`). It builds the
  dom-order census with a TreeWalker (`inline/served-census.ts`).
  - It touches `markless/state` only to evaluate a `graph-truthy` sync policy on the first event that
    needs one (`resumer.ts:913-992`).
- **The full resume reads everything on first interaction.** It decodes every cell at once
  (`payload-graph-construct.ts:56-73`). The lean dispatch paths decode per cell.
- **Read by nobody at runtime:**
  - `cells[].name` (validation and debugging only).
  - `domUpdates[].source` (devtools and execution log).
- **Already re-derived in the browser in one mode.** With the prerender wake channel
  (`MARKLESS_PRERENDER=1`, or `MARKLESS_PRERENDER_WAKE=1`), `renderToString` derives a baseline with
  `derivePrerenderResumeRecords(component, props)`. It ships only the records that differ, or nothing. The
  browser re-derives the same baseline from `marklessPrerenderData` and merges
  (`packages/web/src/render-to-string.ts:166-197`, `packages/bundler/src/source-module.ts:1386-1400`,
  `fns/prerender-resume.ts`).
  - None of the crawled sites serve with it.
  - The scout flagged a parity risk: the server baseline uses `options.props`, while the browser
    derivation passes none.

### 4.1 What the client-render path already knows

The coordinator's hypothesis was that the client-render compile output already holds templates, ids and
wiring. It holds, with one correction: **CSR has no separate imperative codegen**. `render()` runs the same
composition SSR runs, in the browser (`render-canonical.ts:30-85`). It does this either through the
prerender evaluator over `renderData`, or by calling `component.renderSsr()`. It gets back the same
`{html, state, view}` and hands them to the same `createResumeRuntime`.

The compile-time records reach client bundles through the `payload:` virtual module
(`bundler/src/source-module.ts:367`) and `marklessPrerenderData` (`transform.ts:1059-1065`).

| Payload field | Where the client already has it | Server-only step | Can sharing the compile output drop it? |
|---|---|---|---|
| events, domUpdates, elementHandles, behaviors (except `inputValues`), asyncRunners | `protocolView` per component | instance-path prefix; filtered to what rendered | Yes, plus instance path |
| computed (graph ids, dependencies, derive symbol), sharedSeeds, sharedDefinitions, storage keys | `protocolState` per component | deps re-routed to parent's prop nodes; definitions merged | Yes, plus instance path |
| keyedRepeats row template, rowEvents, keyPath, collectionPath, emptyArm, rowComponent | compile-time `protocolView` (identical html) | none | Yes |
| keyedRepeats id, instancePath, propRoutes, enclosingRow | none | written by composition | Yes, by re-running composition |
| branches arm plan, arm tests | compiler per-arm plan | none | Yes |
| branches testReads, contentReads, composedGraphProps, idrefSites | none | rewritten to caller's nodes | Yes, by re-running composition |
| locators index and tagName, branch and boundary anchor indexes | compile-time index assumes initial values | rewritten from the rendered structure (rows taken, arms served) | Yes, from the DOM walk, or by re-running composition with request values |
| cells values, served computed values, async snapshots, `initiallyServedArm`, minted element ids, `attach` input values | none | request time | **No: this is class (e), plus whatever (a)/(b) recovers** |

So **everything except the last row could be dropped by sharing compile output and re-running
composition in the browser on first interaction**. The last row is exactly what the byte census calls app
values: 6.1 MB of 160.6 MB, of which 0.29 MB is neither a literal nor in the DOM.

## 5. Edge cases

"Example route" means a crawled route where the case actually occurs.

| Case | How often in the crawl | Example route | What breaks if we trust the DOM or drop data | What the design must do |
|---|---|---|---|---|
| **Keyed lists** | 111 routes have keyed repeats (Alpine 51, markless.dev 49, shadcn 5, Remix 4, AG Grid 1, htmx 1). Row-scoped cells: 412 routes | alpinejs.dev `/directives/for` (15 repeats); shadcn-admin `/tasks` (53-element rows, 7.9 KB row template); AG Grid `/` (`computed:win`, 28 KB of row templates) | Row keys (`keyPath`, e.g. `id`, `slot`, `href`) are data, rarely in the DOM. Next dashboard customer ids are UUIDs found nowhere in the DOM. The row count can be read from the DOM; identity cannot | Send keys (or a key column) when the collection is request data. For a collection that is a computed over compile-time data, keys are (d). Row templates are compile-time |
| **Async boundaries** | 15 routes, 24 boundaries | next-dashboard `/dashboard/invoices` signed in (3.9 KB async value); remix-notes `/notes/<id>` (3 boundaries); markless.dev `/concepts/async` | The fulfilled value is fetched data. Most of it is rendered, but ids and unrendered fields are not | Send the snapshot value. The served arm can be read from which arm's comment range is present |
| **DOM rendered after load** | AG Grid `/` (351 elements served, 780 three seconds after load), RealWorld all 12 sampled routes (27→86 on `/article/*`), Docusaurus `/docs/blog` (+18), vite.dev `/` (+99) | (same) | Anything recovered from the DOM on first interaction sees DOM the page itself (or another script) already changed. Today the census is pinned at load before that happens | Pin the census at the first event rather than reading positions later. Recover values only inside a range Markless still owns (row, arm), or verify against a checksum |
| **Storage** | 357 markless.dev routes (theme toggle on every page; `/mascot` 11 storage cells) | markless.dev `/build/storage` | Value lives in cookie or localStorage, and the seed script already reads it into a slot before paint | No payload value needed beyond the key, which is compile-time |
| **Forms and user input** | 508 routes have input/change/submit/key events; 633 routes have form controls; 36 routes bind `value`/`checked` | shadcn-admin `/users` (112 form events, 12 value bindings, invite dialog form); remix-notes `/notes/new`; RealWorld `/editor`, `/settings` | A user can type before the page wakes. The DOM property then differs from the served attribute and from state. Today `control-edit-hold.ts` keeps the user's edit; a DOM-read design would seed state with the typed text | Seed from the served value (sent, or the attribute), not the live property; keep the edit-hold rule |
| **Sync policies that read state** | `graph-truthy` preventDefault conditions: 393 events on markless.dev, 560 on shadcn-admin, 5 on AG Grid | shadcn-admin `/apps` (`click` preventDefault when `state:here`); markless.dev `/build/components` (tree `keydown`) | These decide `preventDefault` synchronously at the first event, before any code loads. Today the boot parses the state script at that moment | The cell values these read must be inline and synchronously readable: an attribute on the host or the island's values script |
| **Triggers without a user** | Docusaurus: every page has `visible` + `idle`; RealWorld 106 `idle`; Alpine 26 | Docusaurus `/` | The "first interaction" happens at idle. Lazy recovery cost lands right after load, but not during it | Fine under the rule (load JS unchanged); counts against idle-time budget |
| **Third-party DOM mutation** | htmx: `buttons.github.io` (replaces anchors with iframes) and `sinon` on 188 routes; Alpine: `@docsearch/js` on 76 routes | htmx `/examples/active-search/`; alpinejs.dev `/directives/model` | Element counts shift. `data-markless-paths` repair handles it today. Translators and extensions rewrite text nodes, so state read from text would be wrong | Never read app values from text without verification; keep path repair for positions |
| **Text that does not round-trip** | Formatted numbers on 4 routes; value only found embedded inside larger text on 4 Remix routes; markdown/markup stripping needed: 0 | shadcn-admin `/users` (numbers shown formatted); remix-notes `/notes` (note title inside a link label) | `String(n)` is not in the DOM, so the formatter cannot be inverted safely | Send those values (e), or invert only through a compile-time-known template (`prefix`/`suffix` in the update record) |
| **i18n / direction** | migrate demo `/fr/`, `/ar/` (`dir=rtl`); all others `en` | migrate-demo `/ar/` | Values are compile-time literals per locale; nothing hidden found. Locale-dependent formatting falls into the row above | Treat locale as a route prop |
| **Portals, dialogs, popovers** | 401 routes have dialog/popover/listbox/menu elements | shadcn-admin `/tasks` (28), `/users` (25); markless.dev `/ui/*` | In every crawled page they render inside their host. The locator check found 0 mismatches between served dom-order indexes and the static parse on 1,212 pages. A library that moves nodes to `<body>` would break dom-order recovery | Keep the rule that `@markless/ui` renders in place. A third-party portal needs an explicit host anchor |
| **Minted ids** | Every markless.dev page with a code/result panel | markless.dev `/` (`state:panel.value = "result-pane-17zqgj2"`) | Deterministic hashes of the instance path, not found as an attribute value in the DOM | (c): the compiler can re-mint them from the same path |
| **Duplicate values** | 432 routes send the same value object twice or more | markless.dev `/ui/styling` (141 KB duplicated) | Pure waste | Send once per page, or not at all when it is a literal prop |
| **Page props (URL)** | Every route (`prop:props.url`, `params`, `status`) | Docusaurus long-path routes (up to 311 B) | None: equal to `location` | Read from `location` |

The two cases that genuinely block "no data at all" are **keyed-row identity for request data** and
**synchronous state-dependent `preventDefault`**. Both are small and can ride on attributes or a tiny
per-island script.

## 6. Prior art

None of the surveyed frameworks recovers reactive state by reading rendered text. The ones with no data
script either keep state as author-written attributes (Alpine, htmx) or re-run components (Solid).

- **Google Wiz / JSAction.**
  - How it works: an inline `EventContract` listens at the container and queues events. Each element
    carries `jsaction="click:handler"`, where the handler string is opaque. Lazily loaded controllers
    (`jscontroller`, `jsmodel`, `jsdata`) take over. Angular adopted the contract for event replay and
    incremental hydration.
  - For us: this proves the attribute-encoded handler reference, and that the container listener can stay
    tiny.
  - Sources: https://github.com/google/jsaction,
    https://github.com/angular/angular/blob/main/packages/core/primitives/event-dispatch/README.md,
    https://angular.dev/guide/incremental-hydration
- **Qwik.**
  - v1: a `qwik/json` container script plus `q:id`/`q:key` attributes, and `on:click="chunk#sym[captures]"`.
  - v2: moves locations into a compact positional `qwik/vnode` string decoded with a TreeWalker, and restores
    state roots on demand.
  - Known costs: capturing a store serializes the whole store (issues #6920, #4342), and the first read can
    pull a large graph into one long task, which is why v2 has `statePrewarm`.
  - For us: positional strings beat locator objects, and lazy per-root decoding works. Do not let one read
    drag the whole graph in.
  - Sources: https://github.com/QwikDev/qwik/blob/main/packages/qwik/src/core/shared/serdes/serialization.md,
    https://github.com/QwikDev/qwik/blob/main/packages/qwik/src/core/client/process-vnode-data.ts,
    https://github.com/QwikDev/qwik/issues/6920
- **Marko 6.**
  - How it works: the compiler serializes only values a client effect or handler can read, and drops
    statically known values and inert subtrees. It locates nodes with comment "visits" plus one-character
    "walk" codes.
  - Known costs: recent fixes for values wrongly dropped (PRs #4270, #4367).
  - For us: compile-time elimination is the safest big lever. Expect parity bugs and build a parity check,
    as the wake channel already has.
  - Sources: https://github.com/marko-js/marko/blob/main/packages/runtime-tags/src/dom/resume.ts,
    https://github.com/marko-js/marko/blob/main/packages/runtime-tags/src/dom/walker.ts,
    https://markojs.com/docs/newsletter/may-2026
- **Alpine and htmx.**
  - How they work: the DOM is the state, but the author writes it (`x-data="{open:false}"`, `hx-*`). Alpine
    walks the DOM eagerly at load; htmx processes its attributes at load and keeps state on the server.
  - For us: attribute state works when it is small and authored. Neither infers state from rendered text.
  - Sources: https://github.com/alpinejs/alpine/blob/main/packages/alpinejs/src/lifecycle.js,
    https://github.com/bigskysoftware/htmx/blob/master/src/htmx.js
- **Solid.**
  - How it works: no state payload, because components re-run at hydration. `data-hk` keys and compiled
    `firstChild`/`nextSibling` walks locate nodes; seroval serializes only async values.
  - For us: "no payload" here is paid for with full re-execution, which resumability rejects. The compiled
    walk paths transfer.
  - Sources: https://github.com/lxsmnsyc/seroval, https://github.com/solidjs/solid/issues/3610
- **Cautionary.**
  - React Server Components send every rendered text twice (HTML plus flight). One report measured ~885 KB
    of flight data for ~49 KB of visible text
    (https://github.com/vercel/next.js/discussions/42170). Markless.dev's 74% payload share is the same
    disease.
  - Astro's `props` attribute on `astro-island` shows the escaping, size and XSS cost of putting objects in
    attributes (https://github.com/withastro/roadmap/discussions/635).

## 7. Proposed design: resume from compiled code

The rule throughout: **code run at page load must not grow; it should shrink**.

### Step 1: wiring in attributes, no census at load

- **Attributes.** The server writes one attribute per event host, e.g.
  `m:on="click:3;keydown.p:4"`.
  - The number indexes the island's symbol table, already in a lazily loaded chunk.
  - `.p` / `.s` mark constant `preventDefault` / `stopPropagation`.
  - The attribute name and grammar would be owned by `packages/serializer`, like
    `PROTOCOL_LOCATOR_PATHS_ATTRIBUTE` today.
- **The inline boot shrinks.**
  - It registers delegated listeners for the page's event names, a constant list baked into the
    specialized boot as today.
  - On an event it walks `parentNode` to the nearest `m:on`, applies constant sync actions, queues the
    event, and imports the resume module.
  - No `JSON.parse` of the view, no TreeWalker census, no side tables.
- **State-dependent sync policies** (`graph-truthy`) read their cell from the island's inline values
  (step 3), which must be readable synchronously.
- **What moves to first interaction.** Today's load work moves after the first event. On the markless.dev
  home page at 4x CPU, that is `marklessServedCensus` 21 ms plus `runInlineResumer` 10 ms.
- **Bytes.** Locators and events lists plus the paths attribute are 9.0 MB across the crawl; the
  attributes cost about 0.2 MB.
- **Spec conflict.** This goes against 05-resumability-payload.md: "production output should not require
  Qwik-style per-node `on:click` attributes". The owner has to decide.

### Step 2: records from compiled code

- **What it does.** On first interaction the resume module re-derives `domUpdates`, `computed`,
  `sharedDefinitions`, `sharedSeeds`, `elementHandles`, `keyedRepeats`, `branches`, `behaviors` and
  `asyncRunners` for the page. It runs the prerender evaluator over the compiled render data with the
  request inputs from step 3 (`derivePrerenderResumeRecords`), then pins the census and matches
  dom-order indexes.
- **This is the existing wake channel, generalized.** Today it ships the delta against a props-less
  baseline. Here the delta is replaced by the request inputs themselves, so nothing record-shaped is sent.
- **Bytes.** 146 MB of records across the crawl leave the HTML.
- **Granularity.** A coarse first cut derives the whole page. A finer one resumes one island, or one
  composed instance, keyed by an `m:i` instance-path attribute on its root host. That avoids Qwik's
  "one read pulls the whole graph" long task.
- **Fallback.** If derivation fails parity (the server can check this, as the wake channel does), the
  route falls back to a records sidecar file. The HTML references the file; it is fetched on first
  interaction or prefetched with `<link rel=prefetch>`, which runs no JS. For prerendered routes it is
  CDN-cacheable.

### Step 3: send only request-time values

- **What gets sent.**
  - Cell values the compiler cannot reproduce.
  - Async snapshot values.
  - Row keys of request-data collections.
  - Minted ids only where the path cannot re-mint them.
  - `attach` input values that are not literals.
- **Where it goes.** A per-island `<script type="markless/values">` (or an attribute for one or two
  scalars), decoded lazily in the encoding chosen in section 8.
- **What does not get sent.**
  - Values equal to a compile-time literal or initializer come from the compiled initializer (b).
  - Route props come from `location` (c).
- **Reading values from the DOM (a) is deliberately not in the first cut.** It is 0.3% of value bytes. It
  is the only part exposed to translators, extensions and user typing. 16 of 92 sampled live routes had
  already changed their DOM before the first click.
- **If DOM recovery is ever added,** it must invert through the compile-time update record (text node
  index, `prefix`/`suffix`, attribute name, class true/false values). It should also be verified against a
  4-byte per-island checksum, falling back to fetching values on a mismatch.

### Load-time JS, first-interaction cost, what breaks

**Load.** The boot loses the view parse, the census and the side tables, so it goes down. For scale:

- Today's inline async resumer is 3.6–21.6 KB raw per page (21.6 KB on markless.dev with the sync-policy
  and shared-graph features), plus 1.3 KB of early-event capture.
- The router link resumer (8–32 KB inline on the big sites) is a separate, larger item, untouched by this
  design.
- Measured at 4x CPU on the markless.dev home page: the page is busy for 153 ms during load, of which the
  census is 21 ms and the inline resumer is 10 ms.

**First interaction, today's baseline at 4x CPU.** Chromium through Playwright, cache disabled, median of
3 runs. The click target is the first visible click host from the view payload; "busy" is CPU-profile
samples over 1.5 s after the click.

| Route | Clicked | state / view KB | JSON.parse of both scripts | Click to first DOM change | Busy after click | Where the time went |
|---|---|---|---|---|---|---|
| markless.dev `/` | "Framework" select | 322 / 226 | 4.0 ms | 51 ms | 67 ms | runtime chunk 27 ms, router 17 ms |
| markless.dev `/ui/select` | "UI" | 318 / 243 | 6.6 ms | 172 ms | not profiled | |
| markless.dev `/ui/accordion` | "UI" | 382 / 278 | 6.9 ms | 200 ms | 228 ms | runtime 76 ms, arm-record and locator materialization 46 ms, `structuredClone` 21 ms |
| shadcn-admin `/users` | "Invite User" | 416 / 431 | 6.6 ms | 230 ms | 140 ms | dialog layout (`getClientRects`) 35 ms, runtime 58 ms |
| htmx `/examples/click-to-edit/` | "↑ Show" | 4 / 6 | 0 ms | 13 ms | 12 ms | |

Reading this table:

- **Parsing is cheap.** `JSON.parse` of 550–850 KB is 4–7 ms at 4x. The cost that grows with payload size
  is materializing records: locators, arms, cloning.
- **Step 1 moves about 31 ms of census and side-table work from load to first click** on the heaviest
  pages.
- **Step 2 adds an evaluator run.** Its cost is not measured yet; it is the open risk, and the experiment
  in section 9 measures it.
- **JS downloaded on the first click was 0 bytes on every measured route,** because the chunks are
  modulepreloaded at load. Step 2 needs the render-data chunks on the client. If they are not already
  preloaded, first interaction adds a download.

**What breaks or must change.**

- **Spec 05**
  - The "no per-node `on:click` attributes" sentence.
  - The `markless/state` / `markless/view` canonical container names.
- **Spec 10 and 06.** "Browser resume does not consume the CSR plan / does not execute component bodies."
  The evaluator runs render data and initializer symbols. Whether that counts as executing component bodies
  is an owner decision.
- **Tooling that reads payload scripts.** The analyzer, devtools dump, `decodeProtocolPayloadLists`
  readers, MDX islands and streamed arms. The decoded dump would have to come from re-derivation.
- **Pages a server cannot re-derive identically** (parity mismatch) need the sidecar fallback.
- **Pages that change their own DOM before first interaction** (AG Grid, RealWorld) must pin the census at
  the first event, inside ranges Markless owns.

## 8. Encoding for what must still be sent

**What was benchmarked.** Thirteen formats on the 8 crawled samples in `/tmp/rwds/samples`: markless.dev `/` and
`/ui/select`, shadcn-admin `/users`, Alpine `/directives/model`, next-dashboard `/dashboard/invoices`,
remix-notes `/notes/new`, htmx `/examples/click-to-edit/` and Docusaurus `/`.

- **Two inputs.** FULL is today's state and view. RESIDUAL is every cell value keyed by graph id plus async
  snapshots, an upper bound on what step 3 sends.
- **Method.**
  - Encoders were timed in node 24; decoders in Chromium at 4x CPU, median of 15 after warmup, with the
    first call on the page in brackets.
  - Decoder size is esbuild-minified and gzipped.
  - Qwik `_serialize`, Marko 6's serializer (copied from its html runtime) and React Flight (in a separate
    `react-server` process) all actually ran.
- **Scripts:** `/tmp/rwds/bench` (`report.txt` has every number).

**RESIDUAL**, the part that matters for the design. Bytes are summed over the 8 samples.

| Format | raw KB | gzip KB | brotli KB | decode at 4x (first call) | decoder min+gz | lazy per cell | needs eval | round-trips the real data |
|---|---|---|---|---|---|---|---|---|
| Markless envelopes today | 165.2 | 15.9 | 12.5 | 0.5–1.2 ms (4–5.5) | 749 B | yes | no | yes |
| plain JSON | 90.7 | 11.9 | 9.8 | 0.1–0.2 ms | 67 B | no | no | **no**: drops `undefined` in 4 of 8 samples |
| devalue (Svelte) | 79.0 | 17.1 | 13.4 | 0.3–0.4 ms | 1,806 B | no | no | yes |
| seroval JS (Solid) | 85.2 | 11.8 | 9.8 | (2.1–3.7 ms) | 884 B | no | **yes** | yes |
| seroval JSON mode | 165.2 | 16.7 | 13.2 | 0.5–1.6 ms | 4,271 B | no | no | yes |
| turbo-stream (Remix) | 91.8 | 11.9 | 9.8 | 0.8–1.9 ms (9–13), async | 2,848 B | no | no | yes |
| Qwik `_serialize` | 80.8 | 14.5 | 12.0 | 1.9–9.3 ms (10–26) | 41,957 B (did not tree-shake) | per root in real Qwik | no | yes, except -0 |
| Marko 6 | 69.5 | 12.4 | 10.4 | (3.3–4.3 ms) | 131 B | no | **yes** (inline script) | **no**: drops `undefined` |
| React Flight | 92.9 | 12.0 | 9.9 | 0.4–1.2 ms (6–8) | 12,050 B | no | no | **no**: drops `undefined`, duplicates shared objects, nested cycle hangs |
| schema codec, yuku style (JSON ints) | 47.9 | 15.3 | 12.3 | 0.2–0.3 ms (3.7–4.4) | 619 B | no | no | yes |
| schema codec, varint base64 | 39.4 | 16.3 | 13.7 | 0.2 ms (3–4) | 668 B | no | no | yes |
| schema codec, lazy per record | 40.2 | 16.7 | 14.0 | open 0.1–0.3 ms | 877 B | yes | no | yes |
| **tagged JSON** | 93.0 | 12.0 | **9.9** | open 0.14–0.24 ms, all 0.2–0.3 (1.1–1.8) | **526 B** | **yes** | no | yes |

"Tagged JSON" is a format the benchmark built:

- Verbatim JSON for everything JSON can express.
- One-key tags for the rest: `$u` undefined, `$n` NaN/±Infinity/-0, `$b` BigInt, `$d` Date, `$m` Map, `$s` Set,
  `$x` RegExp, `$l` URL, and `$o` to escape a real `$` key.
- `$i`/`$r` for shared or cyclic objects.
- A trailing list of which cells contain tags, so untagged cells come straight out of one native
  `JSON.parse`.

**FULL**, today's whole payload (sums over the 8 samples):

- Compact templates (what main serves now) were the best measured after compression: 88 KB gzip / 60 KB
  brotli, against 120.5 / 79.1 for the served envelopes.
- The yuku-style schema codec reached 115.7 / 69.5. It was 3–4x smaller raw, but brotli already removes
  repeated keys, and integer codes and base64 compress worse.
- Seroval JS, Marko and React Flight were within a few percent of plain JSON after compression.

**Recommendation: tagged JSON in an inert per-island `<script type="markless/values">`, decoded lazily per
cell by a 526 B decoder that loads on first interaction.**

- **Size.** It ties the smallest formats after compression, 21% under today's envelopes, without eval and
  without losing `undefined`, Map, Set, Date or cycles.
- **Speed.** It decodes in about 1–2 ms on the first call at 4x.
- **Load time.** It runs nothing at load.
- **Why not the schema codec.** For data this small and repetitive, gzip and brotli beat positional
  schemas. A yuku-style generated decoder only pays when the payload is large and numeric, which the
  residual is not.
- **The next 28%.** Send values as a positional array in an order the compiler can reproduce, rather than
  keyed by graph id. That cuts RESIDUAL to 7.1 KB brotli, because the ids are 2.9 KB of the 9.9 KB.
- **Until step 2 lands,** keep compact templates for the full payload.

## 9. Smallest experiment that would prove or kill it

**Experiment.** One page, the wake channel turned on, measured end to end:

1. Build markless.dev with the existing channel (`MARKLESS_PRERENDER_WAKE=1`).
2. Crawl `/`, `/ui/accordion`, `/ui/select` and `/concepts/state` with `/tmp/rwds/analyze.mjs` and
   `/tmp/rwds/profclick.mjs`.
3. In the same build, make the server send the request inputs instead of a record delta: cells that differ
   from the compiled initializers, plus async values.
4. Run the site's own checks and the witness resume suites for those pages.

**Pass:**

1. Served `markless/state` + `markless/view` bytes on those four routes fall by ≥ 90%.
2. JS executed at page load is not larger, byte for byte, by the existing executed-at-load counter, and
   load busy time at 4x is not higher.
3. Click to first DOM change at 4x is no more than today + 50 ms on `/ui/accordion` (today 200 ms) and
   `/concepts/state`.
4. Every interaction on those pages behaves the same: the site's checks and witness suites are green.
5. There are zero `MARKLESS_RESUME_RECORD_DELTA_PARITY_MISMATCH` errors across all 360 markless.dev routes
   at build.

**Kill:** first-interaction cost grows by more than 50 ms at 4x on the heavy routes, or parity fails on
more than a handful of routes for reasons that are not plain bugs (e.g. composition depends on
server-only data). Then the records sidecar file (step 2 fallback) is the better path.

Step 1 (attributes, no census at load) can be tested independently and first: it is pure bytes and load
time, with no evaluator risk.

## 10. Limits of this note

- The class (b) test for values is a literal match against each site's local checkout, which may differ
  slightly from what is deployed. Strings built by concatenation are misread as (e); strings that coincide
  with an unrelated literal are misread as (b). The conservative column brackets both.
- DOM matching uses a static parse (linkedom), not the live DOM. The live-drift check covers 92 routes.
- First-interaction numbers come from one machine and 3 runs, with Chromium's CPU throttle, which is not
  a real phone.
- The Next-dashboard and Remix signed-in crawls used the demo accounts. RealWorld signed-in routes used
  `demo@conduit.test`.
