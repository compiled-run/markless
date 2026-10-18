# Project to-do

Open work parked on 2026-09-25, when the focus moved to compiling to native.
The detailed goal board lives in `docs/goals/packed-delivery-performance/`
(gitignored, local only); this file is the durable summary.

## Publish @markless/ui, @markless/icons and @markless/ui-tools

0.5.0 shipped without these three: `@markless/icons` and `@markless/ui-tools`
have never been published, and the release workflow cannot claim a new name
(it has no npm token by design). They are marked `"private": true` in their
`package.json` until then; their `publishConfig` stays, so
`verify-packed-manifests.mjs` still checks their tarballs on every run.

To release them (needs the owner's npm login and 2FA), follow "Bringing back
the held packages" in `docs/ci-process.md`.

## Finish the packed-delivery goal

- Redeploy the benchmark apps and run the full public benchmark: 8 frameworks,
  Chromium and WebKit, 30+ visits per page.
- Run the final Codex audit that checks the results against the goal.
- Closing the goal needs an owner go-ahead.

## Open owner question

- Start the page runtime on intent (pointer down, focus or hover). It would hide
  the one-time startup cost on the first click after load, the one area where
  Markless still trails other frameworks (settled first clicks: 3 lead, 33 tie,
  36 trail; repeat clicks: 0 lead, 43 tie, 21 trail).

## Follow-ups, highest value first

- **The walkthrough's package-manager switch can become real tabs.** `storage()` now renders from the request cookie and corrects a prerendered page at idle, so the plain buttons with CSS-driven ", selected" text are no longer needed.

- **Compiler refuses an imported stateful component inside `@if`** on
  server-rendered pages, for example an imported modal. Common pattern.
  High priority.
- **Two compiler bugs:** a file with several components offers every callback
  to one of them; the docs accordion shows two open rows in single-open mode.
- **Smaller per-page packs.** Benchmark packs of 10 to 16 KB miss the 16 KB
  prefetch budget, so touch taps wait one extra round trip (67 ms vs Qwik's
  33 ms).
- **Fetch server data on intent.** Navigation with server data went from 473
  to 67 ms in the lab; it runs data-fetching code before the click.
- **Idle prefetch takes two steps.** It loads the navigation code first, then
  the next page, instead of both in one round trip. Small fix.
- **Startup scripts may drop clicks** on elements added after start (prerender
  and settle scripts; the main one was already fixed). Untested, small.
- **Client-rendered apps run a little more code at load when packed**
  (live-feed CSR 6.4 KB vs 3.7 KB). Fix: one startup pack per page for
  client-rendered builds.
- **Named `.tsrx` imports in MDX** are unsupported. Several days of compiler
  and bundler work; needs its own goal.
- **The evaluator grew about 2.7 KB** from correctness fixes. Reduce it.
- **Report upstream bugs** (public, needs a go-ahead): srvx/Nitro EPIPE busy
  loop; `@tsrx/ripple` text whitespace differs from Babel; `@tsrx/yuku` 0.2.0
  fails on sibling elements on one line like `<b/><i/>`. Repros are in the goal
  notes.
- **Accessibility lanes:** NVDA reads are blocked because `@tsrx/yuku` has no
  Windows binary (upstream); the VoiceOver lane fails on the macOS runner image.

Lower priority or parked:

- Docs accordion page preloads 2.5 KB more with the planner; tune the cost model.
- Early clicks on the benchmark's fast profile are 4 to 5 ms slower packed in
  Chromium; split pages that mix fast and full actions.
- After a one-page edit, a redeploy re-downloads other pages that idle prefetch
  had fetched. Leave it unless deploy cost starts to matter more than
  navigation speed.
- Per-package packs: a framework patch would re-download only the framework
  file, but the first visit to the docs costs 8 KB more. Revisit with real data
  on how often each is edited.
- Server build output differs between checkout folders; client output is
  identical.
- One formatting pass over framework files with pre-existing formatter drift.
- Parked fast paths (overlay narrowing, settings forms, list sort and filter)
  only win on benchmarks and cost bytes. Re-measure on the docs site first.
- Compiling request-invariant values away is unmeasured; investigate first.
- Old-tab recovery for pages without the router would cost 72 bytes on every
  page. Only if needed.
- Positioning and marketing, after the benchmark results.

## CI flakes found 2026-09-26

- `packages/cli/test/starter-build.test.ts`: `serve()` gives the built server 100 polls x 100 ms (10 s) to serve its own first page; a cold start under machine load (load average about 8) takes longer. Use a time-based deadline well inside the 180 s test timeout.
- `packages/bundler/test/helpers/demo-build-lock.ts`: a lock is stale only after 15 minutes, but `music-player-csr-budget.test.ts` waits 8 minutes in `beforeAll`, so one killed run makes the next run fail. Make staleness depend on the holder process being gone, or shorter than the hook timeout.

- `packages/router/boxes/router-streaming-settle.box.ts` failed once on a CI rerun of main `8f972696` (2026-10-17): expected `[data-harbor-logged]` to read "Logged 2" but it read "Logged 4", so two clicks counted four times; it passed on the next rerun and in every local run. Find out whether a click can be replayed and also run live before treating it as a flake.

## Framework defects found while building docs figures 2026-10-11

- A keyed `@for` over a `computed()` list on an MDX page throws `MARKLESS_MDX_RENDER_DATA_ROOT_MISSING: 0` and stops clicks working. Worked around in `website/components/figures/state/` by looping over frozen art.
- A `const` declared inside an `@if` branch is not visible to an `@for` in the same branch ("pieces is not defined"). Worked around in `website/components/docs/term.tsrx` by hoisting the `const`.
- A number inside a repeated block cannot read live state, so `website/components/figures/devices/` renders every digit and shows one with CSS.
- MDX cannot pass a component as a child of another component (`<Subtitle><Term/></Subtitle>`); the intro uses a `terms` prop instead.
- An inline `attach={(el) => ...}` arrow fails with `MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE`, and `attach={fn}` never runs without a trigger; figures start from `onVisible` instead.
- TSRX intrinsic types reject SVG filter and pattern attributes, `href` and `dy`.
- A page component placed inside a library component's children gets mismatched paths: with `CodeFiles` inside `resizable.item`, its elements are located under `m4:c0:c2:r:<file>:...` but its state and click handlers under `m4:c0:c0:p1:p2:r:<file>:...`, so clicks cannot find their state (the docs playground's file tab blanked the editor). Worked around in `website/components/docs/code.tsrx` by keeping the tabs outside the split.

- A keyed `@for` over a computed list does not re-render when the state it derives from changes, while a second list built the same way does (found building the Walkthrough's create figure, 2026-10-15; repro in goals/walkthrough-page/notes/for-computed-bug.md). Looping over frozen art and indexing a computed is rejected with `MARKLESS_REPEAT_ROWS_FROZEN` and `MARKLESS_STATE_DYNAMIC_PATH_READ`, so the anatomy skill's advice no longer works either. Worked around with fixed slots.

- On a fresh page, the first Escape or Enter in a figure's input is handled late (about 140 ms in dev) because event replay waits for the handler to load, and its `input.value = ''` then wipes keys typed in that gap (Escape then `npm create markless` became `create markless` in the Walkthrough's create terminal, 2026-10-15). Fix belongs in the early-event replay, not the figure.

## Bundle growth accepted on 2026-10-15

- benchmark-guard failed on main at `abfe7d4d`: `41_size-uncompressed` grew by 3.00 kB against `c3317d30`, from the runtime work in the 140-commit push of 2026-10-12 (234 package files). The owner accepted it to unblock main. Find which commit added the bytes and either cut them or record why they are needed.
