# Octane entrant

Octane is [github.com/octanejs/octane](https://github.com/octanejs/octane) (Dominic Gannaway's React-API compiled framework, successor to Inferno). It is not Ember Octane.

## Versions (pinned 2026-09-22)

| Package | Version | Status | Source |
| --- | --- | --- | --- |
| `octane` | 0.4.2 | npm `latest`; README badge says "status: beta" | `npm view octane dist-tags` (published 2026-09-22) |
| `@octanejs/vite-plugin` | 0.1.58 | npm `latest`, pre-1.0 | `npm view @octanejs/vite-plugin dist-tags` |
| `@octanejs/app-core` | 0.0.54 | npm `latest`, pre-1.0; peer of the Vercel adapter, dependency of the Vite plugin | `npm view @octanejs/app-core dist-tags` |
| `@octanejs/adapter-vercel` | 0.0.55 | npm `latest`, pre-1.0 | `npm view @octanejs/adapter-vercel dist-tags`; also listed in the repo's `docs/packages.md` |
| `vite` | 8.3.0 | stable (plugin peer: `^8.0.16`) | `npm view vite dist-tags.latest` |
| `@tsrx/typescript-plugin` | 0.4.7 | editor/typecheck only | `npm view @tsrx/typescript-plugin` |
| `typescript` | 5.9.3 | plugin peer `^5.9.3` | |
| Node | 24.15.0 local; packages require >=22.22.2 | | |

The app shape comes from Octane's own scaffold: `npx create-octane@0.0.11 <dir> --template fullstack` (`@octanejs/cli` 0.0.11). That template uses the Vite plugin's app layer (`octane.config.ts` with `RenderRoute`s, `index.html` with `<!--ssr-head-->` / `<!--ssr-body-->` markers).

## Rendering mode

SSR at request time. The Vite plugin's app layer builds a client bundle (`dist/client`) and a self-contained server entry (`dist/server/entry.js`) that renders the matched route and hydrates it in the browser with `hydrateRoot`. Nothing is prerendered or hand-authored; raw HTML from the server contains the title, identity meta tags, nav, sidebar, and full route content (all 200 record rows on `/records`).

## Implementation (contract v1)

- `src/App.tsrx`: layout, nav, route switch, `<title>` and `<meta name="benchmark:*">` rendered in the component (Octane hoists `title`/`meta` into `<head>` on the server and updates them on the client). `src/shared/styles.css` is imported by the route entry; the app layer emits it as a `<link rel="stylesheet">`.
- `src/Sidebar.tsrx`, `src/Overview.tsrx`, `src/Records.tsrx`, `src/Settings.tsrx`: one component per area, local state with `useState`, keyed `@for` lists, refs for the focus moves the contract requires.
- Edit dialog: native `<dialog class="dialog">` opened with `showModal()` in `useLayoutEffect`; Escape arrives as the dialog `cancel` event (`onCancel`), focus returns to the row's `record-edit` button through a keyed ref map.
- Text inputs use `onInput`: in Octane `onChange` on a text input is the native commit event (the compiler warns `OCTANE_NATIVE_TEXT_ONCHANGE`), so `onInput` is the idiomatic per-edit handler. Checkboxes use `onChange`.
- `POST /api/settings`: an app-layer `ServerRoute` in `octane.config.ts` (the framework's API-route mechanism), listing all methods so non-POST requests get 405 from the handler. It parses the body (unparseable -> `{}`), calls `settingsServerResponse`, waits the rest of `SETTINGS_DELAY_MS` from handler start, and responds with `content-type: application/json` and `cache-control: no-store`.
- Build id: `vite.config.ts` reads `BENCHMARK_BUILD_ID` (fallback `git rev-parse --short HEAD`) at build time and injects it with Vite `define` as `__BENCHMARK_BUILD_ID__`.
- Shared files: synced to `src/shared/` (`data.ts`, `styles.css`). `pnpm run build` runs `pnpm run sync` first; `pnpm run sync:check` reports drift.

Routing: the app layer's `RenderRoute` matches each document request on the server; it does not provide client-side navigation. Client navigation follows Octane's own app-layer examples (`examples/cartlane`, `examples/wayfinder`), per the PM ruling: every route points at the same entry (`App`), the entry reads `props.url` for the initial route, links call `history.pushState`, and a `popstate` listener re-renders. Octane also publishes router bindings (`@octanejs/tanstack-router`, `@octanejs/wouter`, `@octanejs/remix-router`), but the scaffold and app-layer examples do not use them. Label: `navigation: app pushState (Octane example pattern)`.

Scroll: the app sets `history.scrollRestoration = 'manual'`, stores `scrollY` in the leaving entry's `history.state` before `pushState`, and restores it in a layout effect after the popstate render (`flushSync`). Forward navigation scrolls to 0.

## Settings submit request

`fetch('/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email, quantity, unitPrice }) })` with the raw field strings. Exactly one request per valid submit; none on a validation failure. Pending UI (`disabled`, `Saving…`) is set in the submit handler before the request is sent. URL and encoding match the contract exactly.

## Contract status (contract smoke, local production server, Chromium)

| case | early | settled |
| --- | --- | --- |
| overview-counter-first | pass | pass |
| overview-counter-repeat-x10 | pass | pass |
| overview-independent-panel | n/a | pass |
| overview-toggle | **framework failure, intermittent** (see findings) | pass |
| overview-disclosure | pass | pass |
| overview-disclosure-nested | n/a | pass |
| overview-tab | pass | pass |
| overview-filter | pass | pass |
| records-search | pass | pass |
| records-sort | pass | pass |
| records-sort-toggle (correctness) | n/a | pass |
| records-select | pass | pass |
| records-dialog-open | pass | pass |
| records-dialog-save | n/a | pass |
| records-dialog-cancel (correctness) | n/a | pass |
| settings-derived | pass | pass |
| settings-submit | n/a | pass |
| settings-submit-error | n/a | pass |
| settings-validation (correctness) | n/a | pass |
| nav-overview-to-records | pass (no document request) | pass (no document request) |
| history-back | n/a | pass (see deviation 1) |

The smoke also checks: SSR HTML and identity meta for all three routes, `documentTitle` after client navigation and Back/Forward, sidebar tree initial state and nested-state persistence, tabs Arrow/Home/End with focus, stepper bounds and `disabled`, empty filter/records states, Enter-to-save and name re-sort after edit, row DOM identity across edit, selection across search, `aria-describedby` on errors, API 405/400/delay/headers, and that no page errors occur.

## Contract deviations

1. history-back pre-step (smoke only, not the app): `.app-header` is not sticky, so a pointer click on `nav-settings` from `scrollY` 1200 scrolls the link into view first, and the route is left at `scrollY` 0. The contract's expected 1200 cannot then be the "value when the route was left" for any entrant. The smoke leaves Records with trusted Enter on the focused link (`focus({ preventScroll: true })`), which keeps 1200 at leave time; the app restores 1200 correctly. Reported to the PM as a contract/runner ambiguity.
2. overview-toggle early is listed in the smoke's `KNOWN_FRAMEWORK_FAILURES`: it is still run and printed as `not ok` / `KNOWN FRAMEWORK FAILURE` when it fails, but does not fail the exit code.

## Framework findings

- Keyboard activation before the runtime loads is lost. On a fresh load, focusing a button and pressing Space before the `runtime` chunk has been fetched loses the activation in about half of attempts (counter: 7 of 12 lost with Space, 2 of 12 with Enter; toggle: 4 of 12 with Space). Pointer clicks at the same moment are replayed every time (12 of 12). App code is plain `onClick` + `useState`. Affects the `overview-toggle` early case.
- Octane's `onChange` on text inputs is the native commit event, not React's per-keystroke `onChange`; the compiler warns about it at build time.

## Client JavaScript per route (initial load)

Fresh context, `networkidle`, gzip level 9 of the `dist/client` files actually requested (smoke output):

| route | scripts | bytes gzip |
| --- | --- | --- |
| `/` | 7 | 103,694 |
| `/records` | 7 | 103,694 |
| `/settings` | 7 | 103,694 |

The same 7 chunks load on every route (one entry for all routes): `runtime` (85.2 kB gzip per Vite), `App` (all routes, 10.0 kB), `octane-hydrate`, `event-capture`, `control-capture`, `dom-binding-handoff`, `native-read-seeds`. CSS: one stylesheet, 1,616 bytes gzip. HTML documents (gzip -9): `/` 2,124, `/records` 7,500 (111,456 raw), `/settings` 1,497.

## Commands

All commands run inside `demos/interaction-benchmark/apps/octane` (standalone pnpm root; `pnpm-workspace.yaml` has `packages: []`).

| Step | Command |
| --- | --- |
| Install | `pnpm install` |
| Sync shared files | `pnpm run sync` (check only: `pnpm run sync:check`) |
| Build (sync + client + server + Vercel output) | `BENCHMARK_BUILD_ID=<id> pnpm run build` |
| Serve production build (port 4431) | `pnpm run start` / `pnpm run preview` (`octane-preview`), or `PORT=4431 node dist/server/entry.js` |
| Contract smoke (server running) | `BENCHMARK_BUILD_ID=<id> pnpm run smoke` (`BASE_URL` defaults to `http://localhost:4431`) |
| App typecheck | `pnpm run typecheck` (`tsrx-tsc`) |
| Dev server (port 4430) | `pnpm run dev` |

The smoke resolves `@playwright/test` from the Markless root install (through the real path of `@vitest/browser-playwright`). Each case runs in a fresh browser context; early cases start after `goto` commits, settled cases after `networkidle`.

## Vercel adapter

`octane.config.ts` sets `adapter: vercel({ serverless: { runtime: 'nodejs22.x', regions: ['iad1'] } })` per the PM fairness ruling (Node 22.x, iad1, default memory). `pnpm run build` writes Vercel Build Output API v3 to `.vercel/output/`: `static/assets/*` with immutable caching, and `functions/index.func` (Node 22, `supportsResponseStreaming: true`, region `iad1`) serving every non-static path, including `/api/settings`. Deploy (not done here): `vercel deploy --prebuilt`.

## Vercel production deployment

Public URL: https://mlbench-octane.vercel.app (project `mlbench-octane`, deployment `dpl_9sSZS6GLHEezBubMeULjfXTbEuV9`, 2026-09-23T03:04:30.419Z). Runtime `nodejs24.x`, region iad1. Per-deployment URLs stay behind Vercel SSO.

Build id `vercel-octane-2d441bfe`: `vercel-octane-` plus the first 8 hex digits of a sha256 over this directory's source files (sorted relative path and bytes; skips `node_modules`, `.output`, `.vercel`, `dist`, `build`, framework caches, `BENCH.md`, `build-info.json`).

Build: `BENCHMARK_BUILD_ID=<id> pnpm run build`; the adapter writes `nodejs22.x`, which the deploy step patches to `nodejs24.x` (fairness ruling: Node 24, `iad1`) in `.vercel/output/functions/index.func/.vc-config.json`; then `vercel deploy --prebuilt --prod`.

Smoke on the public URL: pass (`/`, `/records`, `/settings` 200/200/200, identity metas match; settings POST 200, name `fail` 422, GET 405, PUT 405). HTTP/2, document `gzip`; hashed JS `/assets/App-BuoH97f9.js` `cache-control: public, max-age=31536000, immutable`, `x-vercel-cache` MISS then HIT.

Runner correctness against the public URL (Chromium, direct, no proxy): **22/33**. Failed: `overview-counter-first [early] timeout`, `overview-counter-repeat-x10 [early] timeout`, `overview-toggle [early] timeout`, `overview-disclosure [early] timeout`, `overview-tab [early] timeout`, `overview-filter [early] timeout`, `records-search [early] timeout`, `records-sort [early] timeout`, `records-select [early] timeout`, `records-dialog-open [early] timeout`, `settings-derived [early] timeout`.
