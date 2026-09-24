# Remix 3 entrant

Remix 3's own stack: `remix/ui` components (not React), `remix/router` + `remix/routes`, the
unbundled `remix/assets` server, and `remix/node-fetch-server`. This is not Remix 2 or React Router.
Scaffolded with `npx remix@3.0.0-rc.3 new`, then built out to the full benchmark contract
(`demos/interaction-benchmark/CONTRACT.md` v1).

## Versions (checked 2026-09-22)

| Package | Version | Notes |
| --- | --- | --- |
| `remix` | `3.0.0-rc.3` (exact pin) | npm dist-tag `next`, published 2026-09-18. Release candidate. `latest` is still `2.17.5` (Remix 2). Stable 3.0 is announced for 2026-10-02. |
| `@remix-run/ui` | `0.10.0` | UI runtime (via `remix`) |
| `@remix-run/assets` | `0.7.1` | Unbundled asset server; oxc-transform/oxc-minify `0.121.0`, lightningcss `1.33.0` |
| `@remix-run/fetch-router` | `0.22.1` | `remix/router` |
| `@remix-run/node-fetch-server` | `0.14.1` | Node HTTP adapter |
| `@remix-run/node-tsx` | `0.1.1` | Runs `.ts/.tsx` sources in Node without a build step |
| `typescript` / `@types/node` | `7.0.2` / `26.6.2` | |
| Node | `>=24.3` required by scaffold; tested on `v24.15.0` | |

## Rendering mode

`renderMode: ssr`. Every route renders on the server at request time (`NODE_ENV=production node
--import remix/node-tsx server.ts`). Remix 3 has no bundling build: the server runs TypeScript
directly, and the asset server transforms and minifies each browser module on request (unbundled
ESM, one file per module, an import map, and `modulepreload` links in the document).

## How the app is built

- Shared inputs: `app/shared/data.ts` and `app/shared/styles.css`, copied by
  `node ../../shared/sync.mjs . app/shared` (`pnpm sync`). The asset server's `allowFiles` lists both,
  so browser modules import the same `data.ts` the server renders from. `styles.css` is a
  `<link rel="stylesheet">` whose href comes from `assets.getHref(...)` (served minified by
  lightningcss).
- Server-only HTML: the document shell (`app/actions/document.tsx`: head, identity meta, header,
  nav with `aria-current`, `page-title`), the Overview prose and headings, and the panel frames.
- `clientEntry(import.meta.url, ...)` components, one per interactive region, in
  `app/actions/public/`: `SidebarTree` (every route), `Counter`, `Toggle`, `Stepper`, `Tabs`,
  `Filter` (Overview), `RecordsTable` (toolbar, table, and edit dialog share one state owner), and
  `SettingsForm`. Each keeps UI state in setup scope and calls `handle.update()` from `on(...)`
  handlers, the documented idiom. Lists use `key` (rows keyed by record id). Focus moves use
  `ref(...)` plus `await handle.update()`.
- Edit dialog: native `<dialog class="dialog">`, rendered only while editing and opened with
  `showModal()` from its `ref`. Escape arrives as the dialog's `cancel` event.
- Routes (`app/routes.ts`) and one controller (`app/actions/controller.tsx`) with `remix/router`.
  `settingsApi: '/api/settings'` is a method-agnostic route; its action returns 405 for anything
  but POST, parses the JSON body (unparseable -> `{}`), calls `settingsServerResponse`, waits out
  `SETTINGS_DELAY_MS` from handler start, and answers `Response.json(body, { status,
  'cache-control': 'no-store' })`.
- Navigation: plain `<a href>` links. After `run()` starts, the runtime intercepts same-origin
  navigations through the browser Navigation API, fetches the destination's server-rendered HTML,
  and reconciles the whole document (title, `aria-current`, content). Back/forward is also
  intercepted: the smoke sees no document request on Back, and Chromium restores the scroll
  position. There is no client route table; every navigation is a server render fetched with
  `fetch` (counted by the runner as route data).

## Settings submit: request URL and encoding

`SettingsForm` handles the form's `submit` event (`on('submit', ...)`, `preventDefault()`), shows
the pending UI through `handle.update()` (flushed on a microtask, before the request starts), then
sends exactly one `fetch(POST /api/settings)` with `content-type: application/json` and body
`{"name","email","quantity","unitPrice"}` (raw field strings). The URL comes from
`routes.settingsApi.href()` passed as a serializable prop. The form also carries
`action="/api/settings" method="post"` as its progressive-enhancement target; the JS path never
uses it.

## Contract status (smoke on 2026-09-22, Chromium, local production server on 4450)

`pnpm smoke` runs every measured and correctness-only case from CONTRACT.md section 10, early and
settled where the table says so, plus extra correctness checks from sections 1-7. Each visit is a
fresh browser context. It asserts exact DOM text, attributes, focus, URL, scroll, and request
count/body.

| Case | Settled | Early |
| --- | --- | --- |
| `overview-counter-first` | pass | pass in most runs; input sometimes lost (see below) |
| `overview-counter-repeat-x10` | pass | pass in most runs; all 10 clicks lost in 1 of 6 runs |
| `overview-independent-panel` | pass | n/a |
| `overview-toggle` | pass | **fails every run: input lost before hydration** |
| `overview-disclosure` | pass | pass in most runs; input sometimes lost |
| `overview-disclosure-nested` | pass | n/a |
| `overview-tab` | pass | pass in most runs; input lost in 1 of 6 runs |
| `overview-filter` | pass | pass in most runs; input lost in 1 of 6 runs |
| `records-search` | pass | pass |
| `records-sort` | pass | pass |
| `records-sort-toggle` (correctness only) | pass | n/a |
| `records-select` | pass | pass |
| `records-dialog-open` | pass | pass in most runs; input lost in 1 of 6 runs |
| `records-dialog-save` | pass | n/a |
| `records-dialog-cancel` (correctness only) | pass | n/a |
| `settings-derived` | pass | pass |
| `settings-submit` | pass | n/a |
| `settings-submit-error` | pass | n/a |
| `settings-validation` (correctness only) | pass | n/a |
| `nav-overview-to-records` | pass (client-side, no document request) | pass |
| `history-back` | pass (client-side traversal, scroll restored to 1200) | n/a |

Extra checks, all pass: identity meta and build id on all three routes, document basics and
`documentTitle` on SSR and after client navigation, `aria-current`, 405 on `GET /api/settings`,
disclosure Enter/Space and nested state kept when a parent collapses, counter Enter/Space, stepper
bounds and `disabled`, tab ArrowLeft/ArrowRight wrap and Home/End with focus, filter empty state,
records empty state (`colspan="7"`), row DOM identity kept across search and sort, selection kept
across search and sort, edit Save disabled for a blank name, Enter saves a trimmed name and a
name-sorted table re-sorts, Cancel button, settings network error (`Request failed.`), errors update
on input after the first submit, form resets after navigation, forward navigation lands at
`scrollY` 0, Tab order (header links, sidebar toggles, route content).

**Early inputs before hydration are lost.** Remix 3 hydrates each `clientEntry` after the entry
module and its about 60 unbundled modules load. There is no event capture or replay for input that
arrives earlier. The SSR buttons and inputs are real and visible from first paint (contract rule 5
forbids hiding them), so Playwright's actionability check passes immediately and an early input can
land on a control that has no handler yet. Nothing happens and the page stays in its initial
state; the runner will record a timeout. The smoke labels these `LOST` (it checks that the page is
still exactly in its initial state after network idle, so a wrong or duplicated response is never
mislabeled) and exits 0 unless `STRICT_EARLY=1` is set. `overview-toggle` loses its input on every run
because it needs only `locator.focus()` and a key press. Over six full runs (five on 4450, one on
the Vercel handler on 4451) the other lost early inputs were counter x10, tab, filter, and
records dialog open, each once. Settled phase: 0 failures in every run.

## Contract deviations

1. No build step exists in Remix 3. `pnpm build` runs `sync --check` against `shared/` and writes
   `build-info.json` (`BENCHMARK_BUILD_ID`, else `VERCEL_GIT_COMMIT_SHA` short, else
   `git rev-parse --short HEAD`). The server reads it at startup for `benchmark:build`. If the file
   is missing, it falls back to the same sources at server start.
2. `settings-form` keeps `action`/`method="post"` for progressive enhancement, as the Remix
   guide recommends. Without JS a native submit would post form-encoded data to the JSON endpoint and
   get the 400 `Invalid settings.` JSON. The measured path is always the JSON `fetch`.
3. Framework markers: each client entry is wrapped in `<!-- rmx:h:... -->` / `<!-- /rmx:h -->`
   comments, and the head carries the asset server's import map and about 60 `modulepreload`
   links. These are framework-owned and counted.
4. `type={type as 'text'}` in `settings-form.tsx`: the remix/ui input typings are a discriminated
   union on `type`, and a mapped `'text' | 'email'` value does not narrow. Runtime output is the
   real `type` (`text` or `email`).

## Commands

```sh
cd demos/interaction-benchmark/apps/remix3
pnpm install                       # standalone pnpm root (own pnpm-workspace.yaml + lockfile)
pnpm sync                          # copy shared/data.ts + styles.css into app/shared
BENCHMARK_BUILD_ID=<id> pnpm build # sync --check + write build-info.json
pnpm typecheck                     # tsc --noEmit
PORT=4450 pnpm start               # production server on 4450
pnpm smoke                         # contract smoke, BASE_URL defaults to http://localhost:4450
STRICT_EARLY=1 pnpm smoke          # also fail on early inputs lost before hydration
CASE=history-back pnpm smoke       # one case
pnpm bytes                         # client JS per route (server must be running)
# Vercel function shape, run locally:
NODE_ENV=production PORT=4451 node scripts/serve-vercel-handler.mjs
BASE_URL=http://localhost:4451 pnpm smoke
```

Ports: 4450 (production server), 4451 (local run of the Vercel handler). Range 4450-4459.
The smoke resolves `@playwright/test` from the Markless repo root.

## Client JS on initial load (production mode, local, 2026-09-22)

`scripts/client-bytes.mjs` loads each route in Chromium, waits for network idle, and sums every
`script` response the browser fetched. Gzip is computed per module (level 9). The server itself
sends `identity`: the scaffold has no compression middleware. The controlled local host adds one
shared compressing proxy (PM ruling).

| Route | JS modules | Raw (minified) | Gzip, per-module sum | App modules | HTML raw / gzip |
| --- | --- | --- | --- | --- | --- |
| `/` | 67 | 135,536 B | 54,196 B | entry, sidebar-tree, data, counter, toggle, stepper, tabs, filter | 24,262 / 2,932 B |
| `/records` | 63 | 135,433 B | 53,370 B | entry, sidebar-tree, data, records-table | 121,444 / 8,178 B |
| `/settings` | 63 | 133,919 B | 53,135 B | entry, sidebar-tree, data, settings-form | 21,443 / 2,240 B |

About 52 KB gzip on each route is the shared `remix/ui` runtime plus the import-map polyfill.
`data.ts` (all 200 records are generated from the seed in the browser) is shared by every route.

Default asset caching is `Cache-Control: no-cache` with a weak ETag, because fingerprinting is off in
the scaffold.

## Vercel

Remix 3 has no official Vercel adapter or deploy guide. The installed guides, the RC post, and the
start-here page say nothing about Vercel. The config here is our own, using a plain Node function:

- `api/index.mjs` imports `remix/node-tsx` to register its loader hooks. It then loads
  `app/router.ts` by a `process.cwd()` path and exports `{ fetch(request) }`, which is Vercel's Web
  fetch handler shape for Node functions.
- `vercel.json`: `framework: null`, `buildCommand: pnpm build` (sync check + `build-info.json`; the
  sync check needs `demos/interaction-benchmark/shared/` in the upload, so deploy with the repo as the
  source and this directory as the root), `outputDirectory: public` (the favicon goes to
  the CDN). A catch-all rewrite sends every request to `/api/index`. `includeFiles` ships `app/**`,
  `build-info.json`, `tsconfig.json`, and the pnpm store directories for remix, `@remix-run/*`, oxc, lightningcss, and
  es-module-lexer. The asset server reads and transforms those files at request time.
- `engines.node: 24.x` picks the Node 24 runtime.
- Deploy with a remote build (see "Vercel production deployment"), not with
  `vercel build` + `--prebuilt` from macOS: oxc and lightningcss load native platform bindings, and
  a macOS build would ship darwin binaries to Linux.

Checked locally: `scripts/serve-vercel-handler.mjs` wraps the exact `api/index.mjs` export in
node-fetch-server, and the contract smoke passes against it (0 settled failures).

The PM ruling asks for Node.js 22.x on Vercel. This entrant pins `engines.node: 24.x` because the Remix
3 scaffold requires Node >= 24.3 (`remix/node-tsx`). That runtime difference needs a PM decision;
it has not been changed here.

Not verified until a preview deploy:
1. That the Vercel function tracer leaves `includeFiles` `.ts/.tsx` sources untranspiled, and the
   pnpm symlinked `node_modules` layout survives packaging.
2. That `request.url` inside the function is the original path after the rewrite.
3. The function bundle size with the native bindings included.
4. Cold starts: each new instance re-transforms every browser module on first request. There is
   no `files.cache` (read-only filesystem apart from `/tmp`), and the default `no-cache` header
   means the Vercel CDN does not cache assets. Asset timings on Vercel therefore include function
   time. The runner should report this, not attribute it to client activation.

## Known limitations and tuning options (not applied)

- Tuned variant for later: `fingerprint: true` in `app/assets.ts` (serves assets as `immutable`,
  as remix.run itself does), `remix/middleware/compression`, and a `CDN-Cache-Control` header so
  Vercel's CDN caches fingerprinted assets. These change delivery materially, so record them as a
  separately labelled variant.
- `app/assets.ts` still carries the scaffold's development-only HMR wiring. It is inactive when
  `NODE_ENV=production`.

## Vercel production deployment

Public URL: https://mlbench-remix3.vercel.app (project `mlbench-remix3`, deployment `dpl_5Rw2oJhmk6L6K88cEEUXRMs3nXea`, 2026-09-23T03:11:34.140Z). Runtime `nodejs24.x`, region iad1. Per-deployment URLs stay behind Vercel SSO.

Build id `vercel-remix3-7fa817d6`: `vercel-remix3-` plus the first 8 hex digits of a sha256 over this directory's source files (sorted relative path and bytes; skips `node_modules`, `.output`, `.vercel`, `dist`, `build`, framework caches, `BENCH.md`, `build-info.json`).

Remote Vercel build (not `--prebuilt`, because oxc and lightningcss ship native bindings): `vercel deploy --prod --build-env BENCHMARK_BUILD_ID=<id>`.

`vercel.json` changes needed for Vercel: `buildCommand` is `pnpm run build:vercel`, which only writes `build-info.json` from `BENCHMARK_BUILD_ID` (the upload has no `../../shared`, so the sync check cannot run there); `installCommand` is `pnpm install --frozen-lockfile --prod --config.node-linker=hoisted`. The prod-only install keeps TypeScript 7 out of the build (`@vercel/node` otherwise picks it up and fails), and the hoisted layout avoids pnpm's symlinked directories, which Vercel rejects in a function package ("invalid deployment package"). `includeFiles` is now `{app/**,build-info.json,tsconfig.json,package.json,node_modules/**}` with `excludeFiles: node_modules/.bin/**` (the old list was over Vercel's 256-character limit).

Assets are served by the function with `cache-control: no-cache` (template default), so they are not CDN-cached.

Smoke on the public URL: pass (`/`, `/records`, `/settings` 200/200/200, identity metas match; settings POST 200, name `fail` 422, GET 405, PUT 405). HTTP/2, document `gzip`; hashed JS `/assets/npm/.pnpm/remix%403.0.0-rc.3_%40emnapi%2Bcore%401.11.2_%40emnapi%2Bruntime%401.11.2/node_modules/remix/dist/multiple-import-maps-polyfill.js` `cache-control: no-cache`, `x-vercel-cache` MISS then MISS.

Runner correctness against the public URL (Chromium, direct, no proxy): **24/33**. Failed: `overview-counter-first [early] timeout`, `overview-counter-repeat-x10 [early] timeout`, `overview-tab [early] timeout`, `overview-filter [early] timeout`, `records-search [early] timeout`, `records-sort [early] timeout`, `records-select [early] timeout`, `records-dialog-open [early] timeout`, `settings-derived [early] timeout`.
