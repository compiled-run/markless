# Qwik v2 entrant

Standalone pnpm root (`pnpm-workspace.yaml` with `packages: []`, own `pnpm-lock.yaml`). It never joins the Markless workspace or its toolchain.

## Versions

| Package | Pinned | Status | Source |
| --- | --- | --- | --- |
| `@qwik.dev/core` | `2.0.0-beta.45` | prerelease; npm `latest` and `beta` dist-tags both point here (published 2026-09-22T20:55Z) | `npm view @qwik.dev/core dist-tags` |
| `@qwik.dev/router` (Qwik Router, formerly Qwik City) | `2.0.0-beta.45` | prerelease, same dist-tags | `npm view @qwik.dev/router dist-tags` |
| `eslint-plugin-qwik` | `2.0.0-beta.45` | prerelease (`beta` tag; `latest` is still 1.20.0) | `npm view eslint-plugin-qwik dist-tags` |
| `create-qwik` (scaffold only) | `2.0.0-beta.45`, starter `empty` | prerelease (`beta` tag) | `npm view create-qwik dist-tags` |
| `vite` | `8.2.1` | stable, as pinned by the v2 starter | starter `package.json` |
| `typescript` | `5.9.3` | stable, as pinned by the v2 starter | starter `package.json` |

The SSR HTML reports `q:version="2.0.0-beta.45-dev+596de70"`: that is the version string baked into the published beta.45 tarball, not a local dev build.

Toolchain used locally: Node 24.15.0, pnpm 10.33.2.

## Rendering mode

SSR on every request, through Qwik Router's Vercel Edge adapter (`runtime: "edge"` in `.vercel/output/functions/_qwik-router.func/.vc-config.json`). No page is prerendered: the adapter's SSG step runs but emits no HTML because no route opts in to static generation. The browser resumes the server state (no hydration); event handlers load lazily through the Qwik loader.

Routes have no trailing slash (`qwikRouter({ trailingSlash: false })`, a documented Qwik Router option) so paths match the contract: `/`, `/records`, `/settings`. `/records/` redirects (301) to `/records`.

## Commands

Run from `demos/interaction-benchmark/apps/qwik`.

| Step | Command | Result |
| --- | --- | --- |
| Install | `pnpm install` | root `pnpm-lock.yaml` untouched by this app |
| Sync shared files | `pnpm run sync` (`node ../../shared/sync.mjs . src/shared`); `pnpm run sync.check` fails on drift | copies land in `src/shared/` (imported as `~/shared/data`, `./shared/styles.css`) |
| Build | `BENCHMARK_BUILD_ID=<id> pnpm run build` (runs `sync`, then `qwik build`: client build, Vercel Edge server build, SSG step, `tsc`, ESLint) | exit 0; writes `.vercel/output/`. Without `BENCHMARK_BUILD_ID` the build id is `git rev-parse --short HEAD` (needs `git` on PATH, else `unknown`) |
| Typecheck | `pnpm run typecheck` (`tsc --noEmit`) | exit 0 |
| Serve locally | `PORT=4420 pnpm run serve` | `scripts/serve.mjs` serves `.vercel/output/static` first, then calls the built edge function with a Web `Request` (mirrors `config.json`: `handle: filesystem`, then `/_qwik-router`) |
| Contract smoke | `BASE_URL=http://localhost:4420 [BENCHMARK_BUILD_ID=<id>] pnpm run smoke` | exit 0, 49 checks (see below) |
| Client JS per route | `BASE_URL=http://localhost:4420 pnpm run measure-js` | see below |
| Deploy (not run) | `pnpm run build`, then `vercel deploy --prebuilt` from this directory | not run; no deploys in this task |

## Implementation

- `src/root.tsx`: document head (charset, viewport, `benchmark:entrant` = `qwik`, `benchmark:build` from the Vite `define` `__BENCHMARK_BUILD_ID__`), `DocumentHeadTags` (title from each route's `head` export = `documentTitle(route)`), `styles.css` imported through Vite (Qwik inlines it as a `<style>` in the SSR head). `<html lang="en">` via `containerAttributes` in `entry.ssr.tsx`.
- `src/routes/layout.tsx`: shared layout; nav uses Qwik Router `<Link>` with `aria-current` from `useLocation()`. `src/components/tree.tsx`: sidebar tree, one `component$` per group with its own `useSignal`, panels always rendered with `hidden`.
- `src/routes/index.tsx`: Overview. `useSignal` per panel, `useComputed$` for tab content and filter results, `bind:value` on the filter. Tab arrow keys use `sync$` to `preventDefault` synchronously (so Home/End do not scroll) plus a lazy `$` handler that selects and focuses the tab.
- `src/routes/records/index.tsx`: 200 keyed rows (`key={id}`) derived with `useComputed$` from the module-level `RECORDS` plus a `useStore` of renamed names; selection is a `useStore` keyed by id. Edit dialog is one native `<dialog class="dialog">` opened with `showModal()` from the Edit handler; `autoFocus` on `edit-name` plus the dialog focusing steps put focus there; `onClose$` returns focus to the trigger (kept in a `noSerialize` signal).
- `src/routes/settings/index.tsx`: one `useSignal<SettingsValues>` updated on every `input`, `useComputed$` errors (shown after the first submit attempt), `preventdefault:submit` + `onSubmit$` that validates, sets pending UI synchronously, then `fetch`es the endpoint.
- `src/routes/api/settings/index.ts`: Qwik Router endpoint (`onRequest`): non-POST -> 405; POST parses JSON (unparseable -> `{}`), `settingsServerResponse`, waits the rest of 300 ms from handler start, responds with `content-type: application/json`, `cache-control: no-store`.

## Settings submit request

`POST /api/settings`, `content-type: application/json`, body `{"name","email","quantity","unitPrice"}` (raw field strings), sent with `fetch` from the form's `onSubmit$`. Exactly the contract URL and encoding; no framework-owned URL (`routeAction$` would post to `?qaction=` with its own encoding, so the plain endpoint was chosen). One request per submit.

## Contract status (local production build on Node, Chromium, `scripts/smoke.mjs`)

Every case below passes. "early" means the input is issued right after `page.goto` commits (no wait for load); "settled" waits for load plus network idle.

| Case | Phases checked | Status |
| --- | --- | --- |
| `overview-counter-first` | early, settled | pass |
| `overview-counter-repeat-x10` (10 concurrent trusted clicks) | early, settled | pass (ends at 10, stays 10) |
| `overview-independent-panel` | settled | pass |
| `overview-toggle` (Space) | early, settled | pass; click toggles back too |
| `overview-disclosure` | early, settled | pass |
| `overview-disclosure-nested` | settled | pass; nested state survives parent collapse; Enter/Space work |
| `overview-tab` | early, settled | pass; ArrowLeft/Right wrap, Home/End, Enter/Space, focus follows, no page scroll |
| `overview-filter` | early, settled | pass; no-match shows `filter-empty`, `1 item` singular |
| `records-search` | early, settled | pass |
| `records-sort` | early, settled | pass |
| `records-sort-toggle` (correctness only) | settled | pass |
| `records-select` | early, settled | pass; Space toggles; selection kept across sort + search; row DOM identity kept |
| `records-dialog-open` | early, settled | pass |
| `records-dialog-save` | settled | pass; aria-labels update; Enter saves; blank name disables Save; name-sorted table re-sorts |
| `records-dialog-cancel` (correctness only) | settled | pass (Escape and Cancel) |
| `settings-derived` | early, settled | pass; invalid quantity/price gives `Total: n/a` |
| `settings-submit` | settled | pass; pending UI observed, one request, exact URL/header/body |
| `settings-submit-error` | settled | pass; error cleared on next submit; Enter submits |
| `settings-validation` (correctness only) | settled | pass; no request; `aria-invalid`/`aria-describedby`; errors live-update after first submit |
| `nav-overview-to-records` | early, settled | pass; settled run asserts no document request |
| `history-back` | settled | pass (see deviation 2 for how the smoke leaves the scrolled page) |
| Document basics, identity, layout, static structure of each route | settled | pass |
| `POST /api/settings` direct (200, 422, 400 for garbage, 300 ms delay, 405 for GET/PUT/DELETE/PATCH) | n/a | pass |

The shared runner has no `correctness.mjs` yet, so only this app smoke has run.

## Contract deviations

1. Qwik Router's CSRF origin check (default `checkOrigin: true`) answers 403, not 405, to a non-GET request to `/api/settings` that carries no `Origin` header and a form-like (or missing) content type. Same-origin browser requests and requests with a matching `Origin` get 405 as specified; the JSON POST is unaffected. The framework default was kept; the smoke sends a same-origin `Origin` header for the 405 checks.
2. `history-back` in the smoke leaves the scrolled Records page with `dispatchEvent("click")` on `nav-settings`. The header is not sticky, so a trusted Playwright click first scrolls the link into view (`scrollY` 0), and Qwik then correctly saves 0 as the Records scroll position. This affects every entrant and the shared runner's `history-back` pre-steps the same way (reported to the PM). The measured input (`page.goBack()`) is trusted.
3. The `edit-name` input carries `autoFocus` so `showModal()` focuses it; Chromium logs "Autofocus processing was blocked because a document already has a focused element" on page load. No behavior change.

## Client JS per route (initial load, gzip level 9, local production build)

`measure-js.mjs` recompresses response bodies with gzip level 9; it does not read the transfer size. Fresh browser context per route.

| Route | HTML (gzip) | JS `modulepreload`ed in SSR head | JS fetched by `load` | JS fetched by `load` + 3 s idle | Bundle graph JSON |
| --- | --- | --- | --- | --- | --- |
| `/` | 8,286 | 42,364 (3 files) | 50,388 (12 files) | 72,233 (51 files) | 1,499 |
| `/records` | 29,152 | 42,364 (3 files) | 42,364 (3 files) | 73,164 (53 files) | 1,499 |
| `/settings` | 7,040 | 42,364 (3 files) | 52,102 (13 files) | 73,350 (54 files) | 1,499 |

Whole client `build/` directory: 60 JS files, 74,960 bytes gzip. The idle column is the default preloader fetching bundles by probability; it grows with the number of routes and handlers.

## Bundling and preloading (default production settings, unchanged)

- Entry strategy: `{ type: "smart" }` (the `qwikVite()` production default; dev always uses `segment`). No `manual` grouping.
- Qwik loader: `qwikLoader: "module"` (default): a `<script async type="module">` in `<head>`.
- Preloader: default `PreloaderOptions` (`ssrPreloads: 5`, `maxIdlePreloads: 25`). SSR emits `modulepreload` links for the loader, the preloader and the core bundle, plus `<link rel="preload" as="fetch">` for the bundle graph JSON. After load the preloader fetches bundles by probability from the bundle graph.
- `statePrewarm`: default `false`.
- Server build: no `ssr.noExternal` tuning (the starter's advanced block stays commented out).

## "Reasonable optimized grouping" tuned variant (not implemented)

A tuned variant would change only documented options, recorded as a separate labeled configuration:

1. `qwikVite({ entryStrategy: { type: "smart", manual: { ... } } })` to put the counter handler and the three route components and nav link handlers into one or two named bundles, cutting the roughly 50-request idle fan-out into a few larger requests.
2. Preloader tuning in `entry.ssr.tsx` (`preloader: { ssrPreloads, maxIdlePreloads }`): raise `ssrPreloads` so the counter handler bundle is a `modulepreload` in the SSR HTML (interaction-ready sooner during download), or lower `maxIdlePreloads` to reduce contention.
3. Optionally `qwikLoader: "inline"` (about 1.6 kB gzip in the HTML) to remove one request before the first interaction can be captured.

Which of these to apply, and whether the tuned variant is the "tuned Qwik" reference for the acceptance target, is a PM decision.

## Vercel adapter notes and doubts

- The adapter is `@qwik.dev/router/adapters/vercel-edge/vite` (`vercelEdgeAdapter()`), added with `pnpm qwik add vercel-edge`. It is the only Vercel adapter in Qwik v2 beta.45: there is no Node serverless adapter. `target: "node"` changes only the Vite SSR target; the emitted function is still `runtime: "edge"`.
- Vercel now steers new projects from Edge Functions to Node.js Functions. Edge behavior (cold start, region placement, response streaming) has to be checked on the preview deployment; the adapter's docs URLs still point to v1 pages.
- `qwik add` added `vercel@^29.1.1` as a devDependency. That CLI is old, so it was removed; use a current global Vercel CLI (pin its version at deploy time).
- `vercel.json` (from the adapter) sets immutable caching for `/build/*` and `/assets/*`. The adapter writes its own `.vercel/output/config.json` without those headers, so whether `vercel deploy --prebuilt` applies `vercel.json` headers must be checked on the preview (inspect `cache-control` on `/build/*.js`). If it does not, the fix is `vercelEdgeAdapter({ outputConfig: false })` plus a hand-written `config.json` with header routes, recorded as a deviation.
- The static output also publishes `q-manifest.json` (45 kB). It is not fetched by the page.

## Known limitations

- `scripts/serve.mjs` runs the edge function on Node, not the Vercel Edge runtime. It is good for correctness and the controlled-host runs, but it does not measure Vercel.
- Qwik v2 is a beta; beta.45 was published the same day it was pinned.

## Vercel production deployment

Public URL: https://mlbench-qwik.vercel.app (project `mlbench-qwik`, deployment `dpl_53gMZd7MCreUjzdBVpVjdm7V6LmJ`, 2026-09-23T03:07:27.735Z). Runtime `edge`, region edge (global; served from cle1 for the smoke host). Per-deployment URLs stay behind Vercel SSO.

Build id `vercel-qwik-8120cad8`: `vercel-qwik-` plus the first 8 hex digits of a sha256 over this directory's source files (sorted relative path and bytes; skips `node_modules`, `.output`, `.vercel`, `dist`, `build`, framework caches, `BENCH.md`, `build-info.json`).

Build: `BENCHMARK_BUILD_ID=<id> pnpm run build`, then `vercel deploy --prebuilt --prod`.

Runtime: Vercel Edge (the only Qwik v2 Vercel adapter), served from the nearest edge location, so no `iad1` pin applies.

Cache headers: `--prebuilt` does not apply `vercel.json`, and the adapter's `config.json` has no header routes, so hashed `/build/*` files first went out as `max-age=0, must-revalidate`. The deploy step copies the two `vercel.json` header rules into `.vercel/output/config.json` (what `vercel build` would do); `/build/*` is now `immutable`.

Smoke on the public URL: pass (`/`, `/records`, `/settings` 200/200/200, identity metas match; settings POST 200, name `fail` 422, GET 405, PUT 405). HTTP/2, document `gzip`; hashed JS `/build/q-B2AkDwbb.js` `cache-control: public, max-age=31536000, s-maxage=31536000, immutable`, `x-vercel-cache` MISS then HIT.

Runner correctness against the public URL (Chromium, direct, no proxy): **22/33**. Failed: `overview-counter-first [early] timeout`, `overview-counter-repeat-x10 [early] timeout`, `overview-toggle [early] timeout`, `overview-disclosure [early] timeout`, `overview-tab [early] timeout`, `overview-filter [early] timeout`, `records-search [early] timeout`, `records-sort [early] timeout`, `records-select [early] timeout`, `records-dialog-open [early] timeout`, `settings-derived [early] timeout`.
