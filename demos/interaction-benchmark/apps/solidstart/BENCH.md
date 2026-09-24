# Solid 2 entrant (`solidstart`)

Standalone pnpm root (own `pnpm-workspace.yaml` and `pnpm-lock.yaml`); it never joins the Markless workspace. The directory and entrant id stay `solidstart` for continuity with the benchmark registry, but the app runs on **Solid 2** and no `@solidjs/start` package is installed (see "Why there is no `@solidjs/start` package").

## Versions (exact pins, checked 2026-09-22)

Every Solid package below is a prerelease. `pnpm ls solid-js --depth Infinity` resolves exactly one copy, `2.0.0-rc.9`; no Solid 1.x package is in the lockfile.

| Package | Pinned | Status | Source |
| --- | --- | --- | --- |
| `solid-js` | 2.0.0-rc.9 | prerelease; npm `next` tag (`latest` is still 1.9.15) | `npm view solid-js dist-tags` |
| `@solidjs/web` | 2.0.0-rc.9 | prerelease; npm `next` tag. The DOM/SSR runtime that `solid-js/web` became in 2.0 | `npm view @solidjs/web dist-tags`; Solid 2 `MIGRATION.md` |
| `@solidjs/router` | 2.0.0-next.26 | prerelease; npm `next` tag (`latest` 1.0.0 is the Solid 1 router). Peer `solid-js ^2.0.0-rc.9` | `npm view @solidjs/router@next peerDependencies` |
| `@solidjs/meta` | 1.0.0-next.2 | prerelease; npm `next` tag. The meta README maps Solid 2.x to meta 1.x | `@solidjs/meta` README version table |
| `@solidjs/vite-plugin` | 3.0.0-next.44 | prerelease; npm `latest` tag (`next` tag points to the older 3.0.0-next.35). Peer `solid-js ^2.0.0-rc.9`. Pulls in the Solid 2 compiler: `@solidjs/compiler` 2.0.0-rc.9 and `@solidjs/babel-plugin` 2.0.0-rc.9 | `npm view @solidjs/vite-plugin dist-tags` |
| `filesystem-routing` | 0.3.1 | npm `latest`; published by the Solid team (`solidjs/filesystem-routing`, maintainer ryansolid). Official template pins 0.3.0 | `npm view filesystem-routing repository.url maintainers` |
| `nitro` | 3.0.260903-beta | prerelease; the only dist-tag (`latest`) of Nitro v3 | `npm view nitro dist-tags` |
| `vite` | 8.3.0 | stable | plugin peer `^8.0.0 \|\| ^9.0.0` |
| `typescript` | 5.9.3 | dev only | |
| Node | 24.15.0 locally; `nodejs24.x` on Vercel | | |

The Solid team's own list of templates, [`solidjs/templates/templates.json`](https://github.com/solidjs/templates/blob/main/templates.json), labels the `solid-v2` group "Solid 2.0" with `status: "beta"`.

## Why there is no `@solidjs/start` package

- Every published `@solidjs/start` release, including 2.0.0 through 2.0.5 (`latest`), `rc` 2.0.0-rc.10, and `beta` 2.0.0-beta.10, depends on `solid-js ^1.9.x` and requires a peer of `@solidjs/router >=0.16.0 <2.0.0-0`. That is the Solid 1 router, so none of them can run on Solid 2.
- The solid-start branch `upgrade-to-solid-2-beta` (PR solidjs/solid-start#2091, "WIP: Upgrade to solid 2 beta") was closed unmerged on 2026-08-16 and was never published. Among the npm tags, `alpha`, `beta`, and `rc` are all Solid 1 builds, and there is no `next` tag.
- The Solid 2 plugin documents itself as the replacement. `solidjs/solid-vite-plugin` README (next branch), `options.start`: "**Start is now a mode of the plugin**: the serving layer that replaces SolidStart. The plugin owns entries, dev serving, and the build." The Solid 2 migration guide also calls features such as `clientOnly`, `httpStatus`, and `httpHeader` "hoisted from SolidStart", and the router README says single-flight policy "previously lived inside SolidStart; the router now owns it".
- The official fullstack SSR starter for Solid 2 is `solidjs/templates/solid-v2/fullstack` (updated 2026-09-18). It uses `@solidjs/vite-plugin` with `start` and `ssr: true`, `filesystem-routing` for `src/routes`, `@solidjs/router@next`, `@solidjs/meta@next`, and API routes through `createAPIHandler` middleware. Its README includes a Nitro recipe (`nitro({ serverEntry: false })` after `solid()`) for hosts where Nitro should own the server, and this app follows that recipe.

So this entrant is the Solid team's documented Solid 2 routed-SSR stack. It is SolidStart's successor, not a `@solidjs/start` release. Results should label it "Solid 2 (SSR start mode)".

## Rendering mode

SSR (`renderMode: ssr`). `solid({ start: {...}, ssr: true })` streams a server render of every route on request, and the client hydrates it. Nothing is prerendered. There are no hand-written entry files and no HTML shell: the plugin generates the server and client entries around `src/App.tsx` and wraps them in `src/Document.tsx` (the documented document convention, with `<HydrationScript />`). The `renderMode` start option keeps its default of `stream`.

## How Solid 2 is wired

- `vite.config.ts`:
  - `solid({ start: { middleware: "./src/middleware.ts" }, ssr: true, extensions: [".jsx", ".tsx"] })`
  - `nitro({ serverEntry: false, vercel: { functions: { runtime: "nodejs24.x", regions: ["iad1"] } } })`
  - `fileRoutes({ httpMethods: true, types: true })`

  This is the fullstack template's configuration without the parts the benchmark does not use: `serverFunctions`, typed env, and dev diagnostics. Nitro adopts the plugin's `ssr` environment and its Fetchable entry. The Node output is `.output/server/index.mjs`, which is what `runner/targets.mjs` starts.
- Routing: `filesystem-routing` scans `src/routes` and writes `file-routes.d.ts`, a generated file that is kept in the tree so `tsc` works before a build. `src/router.ts` builds the single router instance with `createRouter({ routes: fileRoutes(pageRoutes) })` from `@solidjs/router` and `@solidjs/router/fs`. Route components are code-split: each route is a lazy `?pick=default` module.
- Navigation: plain `<a href={paths.records()}>` links, since router 2 has no `<A>` component. The router intercepts same-origin clicks through event delegation and sets `aria-current="page"`, `data-active`, and `data-pending` on anchors that the compiler registers with it ("claimed" anchors).
- Titles: `<Title>` from `@solidjs/meta` 1.x. There is no provider; it sits on the `useHead` registry in `@solidjs/web`. SSR puts the title into `<head>`, and client navigation replaces it.
- Identity: `<meta name="benchmark:entrant" content="solidstart">` and `<meta name="benchmark:build">` in `src/Document.tsx`. The build id is a Vite `define` of `BENCHMARK_BUILD_ID`, falling back to `git rev-parse --short HEAD` or `unknown`. Runs must set `BENCHMARK_BUILD_ID`.
- API endpoint: `src/routes/api/settings.ts` exports uppercase `POST`/`GET`/`PUT`/`PATCH`/`DELETE`/`OPTIONS` handlers (`APIHandler` from `filesystem-routing/api`). `src/middleware.ts` serves them with `createAPIHandler(routes)`, the template's pattern. `POST` parses JSON (unparseable bodies become `{}`), calls `settingsServerResponse`, waits until 300 ms after the handler started, and returns JSON with `cache-control: no-store`. The other methods return 405, and `HEAD` falls back to `GET`, so it is also 405.
- Early input: the server-rendered `_$HY` bootstrap captures `click` and `input` events before hydration and replays them against the hydrated tree.

## Solid 2 idioms used (ported from the Solid 1 version)

Changes follow `solidjs/solid` (next branch) `documentation/solid-2.0/MIGRATION.md` and the `solid-js` 2.0 `CHEATSHEET.md`:

- `createStore` now comes from `solid-js` (`solid-js/store` no longer exists). Store setters use draft-first updates: record rename is `setRecords(d => { d.find(...).name = name })`, selection is `setSelected(d => { d[id] = checked })`, and settings fields are `setValues(d => { d[field] = value })`. The 1.x path-style setters and `produce` are gone.
- `onMount` became `onSettled` (the edit dialog calls `showModal()` and focuses the input there).
- Writes are batched: a setter's new value becomes visible only after the microtask flush. The dialog close handler calls `flush()` before moving focus back to the row's Edit button, because focus cannot land behind a modal dialog that is still in the DOM. The migration guide lists this kind of imperative sync point as the reason `flush()` exists.
- Reading props at the top of a component body now warns (Solid 2 treats it as an accidental one-time read), so the dialog's one-time seed of its local name signal uses `untrack(() => props.initialName)`.
- `<For>` keyed by identity (the default) gets the raw item plus an index accessor. The store rows keep their identity, so rows survive search, sort, selection, and edits. `<Show>` function children receive accessors.
- JSX types come from `@solidjs/web` (`jsxImportSource: "@solidjs/web"`), and `hidden`/`disabled` are presence booleans. Form `value`/`checked` stay properties.
- Everything else (signals, memos, and components) keeps the Solid 1 shape. `createSignal`/`createMemo` for counter, toggle, stepper, tabs, filters, sort, dialog, and settings status. A recursive `TreeGroup` component with its own signal: collapsed panels stay mounted with `hidden`, so nested open state survives a parent collapse.
- Settings submit is a plain `onSubmit` handler with signals, not an `action()`. The contract requires one JSON `POST /api/settings` and visible pending text. A router `action` posts to `/_server` (the server-function endpoint), and Solid 2 transitions hold writes made inside an action until it settles, which would hide the pending UI unless it were rebuilt from optimistic primitives. Request: `POST /api/settings`, `content-type: application/json`, body `{"name","email","quantity","unitPrice"}` (raw field strings), exactly one request per submit.

## Contract deviations

- **`createRouter({ ..., scrollRestoration: false })`.** Router 2 turns on its own scroll restoration by default when no custom history is passed. On a browser Back to a scrolled `/records`, that restoration calls `scrollTo(0, 1200)` in the same task as `popstate` but before the destination route's DOM is swapped in. The page is still the short Settings page, so the offset clamps to 0 and `history-back` fails. Traced in Chromium: the restore `scrollTo` fired about 0.5 ms before the Records markup mutation, while `page-title` still read "Settings". The documented `scrollRestoration: false` option hands restoration back to the browser. Solid 2 renders the popped route synchronously inside the `popstate` task, so native restoration lands at 1200 in Chromium and WebKit. This is the router's own documented option and adds no work.
- **No `<Loading>` boundary around the route outlet.** The official template wraps `props.children` in `<Loading>`. With that boundary, hydration removes and re-inserts every top-level node of the route content under `<main>`: all six Overview blocks, observed with a MutationObserver. That blurs any control that was focused before hydration. The runner's `overview-toggle [early]` case (focus, then press Space) timed out because focus fell to `<body>`. The app has no async data, only lazy route code, which the SSR preloads with modulepreload. Without the boundary, hydration mutates nothing and focus is kept. The smoke adds a `hydration-keeps-focus` check (entry script held until focus is placed) to pin this behavior.
- Links are plain `<a>` elements; router 2 has no link component. `aria-current="page"` is applied by the router only on the client. The SSR HTML has no `aria-current` until hydration, unlike the Solid 1 `<A>`. After hydration, and in every navigation and history case, it is exact.
- `@solidjs/meta` 1.0.0-next.2 is a dependency for `<Title>`, as in the official template, and its bytes are counted.

## Contract status

Local production build (Nitro `node-server` preset, `BENCHMARK_BUILD_ID` set).

- `pnpm run smoke`: 47/47 checks pass. Every CONTRACT.md `early` case runs in both phases, and every settled and correctness-only case runs with trusted Playwright input and exact expected values in a fresh context. The smoke also fails on console errors, except the expected 422 resource error in `settings-submit-error`.
- `node demos/interaction-benchmark/runner/correctness.mjs --targets solidstart`: 33/33 pass (proxy on 5461 in front of 4461).

| case | status |
| --- | --- |
| overview-counter-first | pass (early, settled) |
| overview-counter-repeat-x10 | pass (early, settled) |
| overview-independent-panel | pass |
| overview-toggle | pass (early, settled); focus kept across hydration |
| overview-disclosure | pass (early, settled) |
| overview-disclosure-nested | pass (nested state kept across a parent collapse) |
| overview-tab | pass (early, settled); arrow/Home/End keys also pass |
| overview-filter | pass (early, settled); empty state also passes |
| records-search | pass (early, settled); `records-empty` colspan 7 |
| records-sort | pass (early, settled) |
| records-sort-toggle | pass |
| records-select | pass (early, settled); selection and row DOM identity kept across search and sort |
| records-dialog-open | pass (early, settled; native modal) |
| records-dialog-save | pass (blank name disabled, Enter saves, name-sorted table re-sorts) |
| records-dialog-cancel | pass (Escape and Cancel; focus returns to the row's Edit button) |
| settings-derived | pass (early, settled) |
| settings-submit | pass (pending UI, one POST with the exact JSON body; Enter also submits) |
| settings-submit-error | pass |
| settings-validation | pass (no request, focus on the first invalid field, `aria-describedby`) |
| nav-overview-to-records | pass (early, settled; no document load) |
| history-back | pass with `scrollRestoration: false` (see deviations); Forward and a second Back also pass; trusted click on `nav-settings` from `scrollY` 1200 |
| extra checks | SSR document and identity metas on every route, 200 SSR rows, API 200/422/400/405 plus delay and headers, form reset after navigation, header navigation lands at `scrollY` 0 |

## Client bytes per route

Initial document load, production build, measured 2026-09-22. The file list is every JS and CSS request the page makes through `networkidle`; sizes are the built files, compressed with node zlib gzip level 9.

| route | JS raw | JS gzip | CSS raw / gzip | HTML raw / gzip | JS files (raw / gzip) |
| --- | --- | --- | --- | --- | --- |
| `/` | 142,389 B | 51,976 B | 4,939 / 1,600 B | 7,307 / 2,201 B | data 99,527/35,741; entry-client 30,493/11,819; dist 8,132/2,741; index 4,237/1,675 |
| `/records` | 142,482 B | 52,046 B | 4,939 / 1,600 B | 108,953 / 8,095 B | data; entry-client; dist; records 4,330/1,745 |
| `/settings` | 141,021 B | 51,699 B | 4,939 / 1,600 B | 4,862 / 1,507 B | data; entry-client; dist; settings 2,869/1,398 |

- `data-*.js` is Rolldown's shared chunk. It holds `solid-js` 2, `@solidjs/signals`, the `@solidjs/web` runtime, and the shared fixtures module, which generates the 200 records on the client too.
- `entry-client` is the generated client entry plus the router.
- `dist-*.js` is `@solidjs/meta`.
- A `serverForms` chunk (router no-JS form support) and a serialization `decode` chunk are emitted but are not requested on these routes.
- The Solid 2 client JS is about twice the Solid 1 build's (about 24.4 kB gzip on `/`).
- The only CSS file is the app's `styles.css`. The Solid 1 build's unused dev-toolbar CSS is gone, because start mode leaves devtools out unless `@solidjs/start-devtools` is installed.

## Commands

| Step | Command (run in this directory) | Result |
| --- | --- | --- |
| Install | `pnpm install` | exit 0 |
| Sync shared inputs | `pnpm run sync` (writes `src/shared/data.ts`, `src/shared/styles.css`, contract v1.1 with sticky header) | |
| Production build (node-server) | `BENCHMARK_BUILD_ID=<id> pnpm run build` (sync `--check`, then `vite build`; output in `.output/`) | exit 0 |
| Serve | `PORT=4461 node .output/server/index.mjs` (`pnpm start`) | |
| Typecheck | `pnpm run typecheck` (`tsc --noEmit`) | exit 0 |
| Contract smoke | `pnpm run smoke` (does not build; starts `.output/server/index.mjs` on 4461, override with `SMOKE_PORT`) | exit 0 |
| Runner correctness | `node demos/interaction-benchmark/runner/correctness.mjs --targets solidstart` (from the repo root) | exit 0 |
| Vercel build | `NITRO_PRESET=vercel BENCHMARK_BUILD_ID=<id> pnpm run build` (writes `.vercel/output/`) | exit 0 |

Ports 4460-4469: dev 4460, production server and smoke 4461, `vite preview` 4462, ad-hoc checks 4463. Playwright is loaded from the Markless repo root.

## Vercel adapter

Nitro v3 `vercel` preset. `NITRO_PRESET=vercel pnpm run build` produces Build Output API v3:

- Static assets go to `.vercel/output/static`, with `cache-control: public, max-age=31536000, immutable` on `/assets/*`.
- Everything else is routed to one function, `__server.func`. Its `.vc-config.json` has `launcherType: Nodejs`, `runtime: nodejs24.x`, `regions: ["iad1"]`, and `supportsResponseStreaming: true`.

Deployment was not done in this task: run `vercel link`, then `vercel deploy --prebuilt`, or let Vercel CI build it.

Adapter notes:

- Nitro v3 is still published only as a beta.
- `.vercel/output/static/.vite/manifest.json` (the client build manifest) is publicly reachable. It is harmless but public.

## Findings (observations, not diagnosed upstream bugs)

- Router 2.0.0-next.26's built-in scroll restoration fires before the popped route's DOM commits, so Back to a long page lands at 0 (see deviations).
- A `<Loading>` boundary around the route outlet re-inserts the route's top-level nodes during hydration, which drops focus placed before hydration (see deviations).
- The router's link state (`aria-current`) is client-only, so the SSR HTML has none.
- `runner/targets.mjs` still lists `@solidjs/start` in `versionPackages` for this entrant. That package is no longer installed; the Solid 2 packages to record are `solid-js`, `@solidjs/web`, `@solidjs/router`, `@solidjs/vite-plugin`, `nitro`, and `vite`. The runner file is outside this app, so it is reported here instead of edited.

## Vercel production deployment

Public URL: https://mlbench-solidstart.vercel.app (project `mlbench-solidstart`, deployment `dpl_JBqjUmqNuXNab8eLouJRWSVusyvp`, 2026-09-23T03:04:54.882Z). Runtime `nodejs24.x`, region iad1. Per-deployment URLs stay behind Vercel SSO.

Build id `vercel-solidstart-d0be8cf5`: `vercel-solidstart-` plus the first 8 hex digits of a sha256 over this directory's source files (sorted relative path and bytes; skips `node_modules`, `.output`, `.vercel`, `dist`, `build`, framework caches, `BENCH.md`, `build-info.json`).

Build: `NITRO_PRESET=vercel BENCHMARK_BUILD_ID=<id> pnpm run build`, then `vercel deploy --prebuilt --prod`. Nitro already writes `nodejs24.x` and `iad1`.

The first smoke requests seconds after the deploy got status 404 with the correct page HTML on all three routes; every later request answered 200. Not reproduced.

Smoke on the public URL: pass (`/`, `/records`, `/settings` 200/200/200, identity metas match; settings POST 200, name `fail` 422, GET 405, PUT 405). HTTP/2, document `gzip`; hashed JS `/assets/index-MtiADJaM.js` `cache-control: public, max-age=31536000, immutable`, `x-vercel-cache` MISS then HIT.

Runner correctness against the public URL (Chromium, direct, no proxy): **33/33**.
