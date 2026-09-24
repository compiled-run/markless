# Ripple entrant

Ripple here is [Ripple-TS/ripple](https://github.com/Ripple-TS/ripple) (`.tsrx` files, `track()` state), not the legacy ripplejs project. This app implements the full interaction benchmark contract (`demos/interaction-benchmark/CONTRACT.md`, v1).

## Versions

| Package | Pinned | Notes |
| --- | --- | --- |
| `ripple` | 0.4.7 | npm `latest` dist-tag, published 2026-09-22. Pre-1.0. `1.0.0`/`1.0.1` exist on npm but are deprecated as "accidental publish"; not used. |
| `@ripple-ts/vite-plugin` | 0.4.7 | Provides the metaframework: `ripple.config.ts`, `RenderRoute`, `ServerRoute`, SSR server build, `ripple-preview`. |
| `@ripple-ts/adapter-vercel` | 0.4.7 | Build Output API v3 adapter; re-exports `serve`/`runtime` from `@ripple-ts/adapter-node` 0.4.7. |
| `@tsrx/ripple` / `@tsrx/core` | 0.2.4 / 0.2.4 | Compiler, resolved transitively (see `pnpm-lock.yaml`). |
| `@tsrx/typescript-plugin` | 0.4.7 | Provides `tsrx-tsc`, the TSRX-aware type checker (dev only). |
| `vite` | 8.3.0 | npm `latest`. |
| `typescript` | 5.9.3 | Version the Ripple template targets. |

Docs followed: the Ripple repo at commit `b8f33c93bb9a4018a82108cb997a2f5174907f70` (2026-09-21), `website-new/docs/guide/{syntax,reactivity,control-flow,events,dom-refs,head-management,application}.md`, and `packages/vite-plugin/README.md`.

## Rendering mode

`renderMode: ssr`. Every route is a `RenderRoute` rendered on request by the plugin's production entry (`dist/server/entry.js`, buffered SSR, the default) and hydrated by the plugin's generated client entry. `index.html` carries only document scaffolding: `<html lang="en">`, charset, viewport, the two `benchmark:*` meta tags, the stylesheet link, and the `<!--ssr-head-->`/`<!--ssr-body-->` markers the plugin requires. The per-route `<title>` comes from a `<head>` block in the shared `AppShell` component (Ripple's head management).

**Navigation is document navigation.** Ripple 0.4.7 ships no client router (the metaframework router runs on the server only). Per the PM ruling of 2026-09-22 the header links are plain `<a href>` elements and every nav click is a full document load; no hand-written or third-party router variant exists. Navigation and history cases pass on their visible outcomes after document navigation and must be labeled **document navigation** in results, never compared as client-navigation latency.

## Implementation map

| Contract part | Where | Ripple mechanism |
| --- | --- | --- |
| Layout, nav, `aria-current`, `<title>` | `src/components/AppShell.tsrx` | Each page wraps its content in `<AppShell route=...>`; `<head><title>` block; keyed `@for` over `ROUTES`. |
| Sidebar tree | `src/components/TreeGroup.tsrx` | Recursive component, one `track(false)` per group, panel uses the `hidden` attribute so nested state survives a parent collapse. |
| Overview panels, tabs, filter | `src/pages/overview.tsrx` | `track()` / derived `track(() => ...)`, `onClick`/`onKeyDown`/`onInput`, keyed `@for`, `@if`, callback refs for tab focus. |
| Records table + edit dialog | `src/pages/records.tsrx` | Records, query, sort, selection (`track` of an immutable `Set`), editing record; rows are `@for (...; key record.id)` over a derived `visibleRecords(...)`; `@empty` renders `records-empty`; native `<dialog>` opened with `showModal()` from a ref callback. |
| Settings form | `src/pages/settings.tsrx` | Tracked values, derived errors (after the first attempt) and total, `fetch` POST on submit. |
| `POST /api/settings` | `src/server/settings.ts`, `src/routes.ts` | `ServerRoute` from `@ripple-ts/vite-plugin` mounted at `SETTINGS_ENDPOINT`. |
| Build id meta | `vite.config.ts` | `transformIndexHtml` replaces `%BENCHMARK_BUILD_ID%` with `process.env.BENCHMARK_BUILD_ID`, else `git rev-parse --short HEAD`. |
| Shared inputs | `src/shared/` | Copied by `shared/sync.mjs` (`pnpm sync`); `pnpm build` runs `sync.mjs --check` first and fails on drift. |

## Settings submit request

- URL: `POST /api/settings` (same origin, the contract URL; not a framework-owned URL).
- Encoding: `content-type: application/json`, body `JSON.stringify({ name, email, quantity, unitPrice })` with the raw field strings.
- Mechanism: plain `fetch` from the submit handler. Ripple also has `#server` RPC functions, but they post to a framework-owned URL with devalue encoding; the contract endpoint is a better fit for a `ServerRoute`, which is Ripple's own server-route API.
- Server: the handler starts a timer at entry, parses the body (unparseable -> `{}`), calls `settingsServerResponse`, waits the rest of `SETTINGS_DELAY_MS`, and replies with `content-type: application/json` and `cache-control: no-store`. The route is registered for GET/HEAD/POST/PUT/PATCH/DELETE/OPTIONS so that every non-POST method gets 405 (Ripple's router answers an unregistered method with 404).

## Contract status (local, 2026-09-22, `BENCHMARK_BUILD_ID=t028-local`)

Checked by `scripts/smoke.mjs` with trusted Playwright input against the production server. `early` = input issued right after `page.goto` commits (Playwright actionability only); `settled` = after `load` + network idle.

| Case | Phases | Status |
| --- | --- | --- |
| `overview-counter-first` | early, settled | pass |
| `overview-counter-repeat-x10` | early, settled | pass |
| `overview-independent-panel` | settled | pass |
| `overview-toggle` | early, settled | pass |
| `overview-disclosure` | early, settled | pass |
| `overview-disclosure-nested` | settled | pass (also checks nested state kept across parent collapse, Enter/Space) |
| `overview-tab` | early, settled | pass (plus Arrow/Home/End keyboard check) |
| `overview-filter` | early, settled | pass (plus empty state) |
| `records-search` | early, settled | pass (plus `records-empty`) |
| `records-sort` | early, settled | pass |
| `records-sort-toggle` (correctness only) | settled | pass (row DOM identity kept across sort) |
| `records-select` | early, settled | pass (selection kept across search and sort, Space toggles) |
| `records-dialog-open` | early, settled | pass (Save disabled on empty name) |
| `records-dialog-save` | settled | pass (plus Enter-to-save re-sorting a name-sorted table, focus returns to the moved row) |
| `records-dialog-cancel` (correctness only) | settled | pass (Escape and Cancel button) |
| `settings-derived` | early, settled | pass (plus `Total: n/a`) |
| `settings-submit` | settled | pass (pending UI observed; exactly one POST) |
| `settings-submit-error` | settled | pass (next submit clears the alert with the pending UI) |
| `settings-validation` (correctness only) | settled | pass (no request; errors update on input after first attempt) |
| `nav-overview-to-records` | early, settled | pass, **document navigation** |
| `history-back` | settled | pass, **document navigation** (browser restores scroll within 50 px) |
| Document basics + identity metas, SSR content, 200 SSR rows | - | pass |
| `POST /api/settings` 200/422/400 bodies, headers, >= 300 ms, 405 for GET/PUT/DELETE | - | pass |

App smoke result: 38/38 checks pass. No case is `unsupported`. Client navigation (no document load) is not available in Ripple 0.4.7; the smoke records every header-link click as `document navigation`.

### Shared runner correctness suite

`BENCHMARK_BUILD_ID=t028-local node demos/interaction-benchmark/runner/correctness.mjs --targets ripple --proxy-port ripple=4481` (runner starts `node dist/server/entry.js` on 4480 behind its h2/TLS proxy): **30 passed, 3 failed**, exit 1.

- `records-sort` [early] and `records-select` [early]: timeout. The DOM never changed (sort stayed `none`, checkbox ended unchecked while focused), with no page errors and no document request. Most likely cause: the click landed before hydration attached handlers. Ripple does not queue or replay pre-hydration input, and `/records` is a 120 KB document with 200 rows, so its hydration finishes later than the other routes. My own smoke passed these on a direct (no proxy) connection, so this is timing-dependent. These are genuine early-phase failures, not app bugs to hide.
- `settings-submit-error` [settled]: `wrong-response`. The runner saw `settings-error` with the right text and `settings-status` with text `""`, but reported the status predicate as not holding with `visible: false`: an empty `<p>` has zero height. It also flagged Chrome's own console line `Failed to load resource: ... 422` as a page error. Both look like runner strictness that every entrant will hit (the contract requires the status to be empty and the 422 to happen), so they are reported to the runner owner rather than worked around here.

## Contract deviations

- **Navigation (section 6, rule 10):** header links perform document loads, labeled `document navigation` per PM ruling. `document.title`, `aria-current`, content and scroll restoration hold after each load; route-local state is reset by the reload (allowed).
- **Layout composition:** the scaffold used a `RenderRoute` `layout`, but the plugin passes a layout only `children`, not the matched route, so it cannot set `aria-current` or the route title during SSR. Each page instead renders `<AppShell route="...">`. This is ordinary component composition, not a workaround of the contract.
- **Edit dialog Escape handler** uses `onCancel={{ handleEvent, delegated: false }}` (documented Ripple event-object option) because a plain `onCancel={fn}` is delegated and never fires (see framework findings).
- **Selection state** is `track(new Set())` replaced on each change instead of `RippleSet`, because `RippleSet` crashes server rendering (see framework findings).
- **Early-phase inputs before hydration:** Ripple does not queue or replay events that arrive before its client entry runs. An input that lands before hydration is lost and shows up as a `timeout`/`wrong-response` (seen for `records-sort` and `records-select` early in the runner). Nothing in the app hides or delays controls to avoid this.
- **Server host:** `ripple.config.ts` wraps the adapter's `serve` to listen on `::` (or `$HOST`) because the adapter default `localhost` binds only `::1` on macOS, which the runner's `127.0.0.1` probe cannot reach. Vercel does not use `serve`.

## Client JS and CSS on initial load (production build, local)

Measured by Playwright response capture on a fresh context, gzip level 9 via node `zlib`. Every route loads the same shared chunks plus its page chunk.

| Route | Page chunk raw / gzip | `main-*.js` (hydrate entry) | `data-*.js` (Ripple runtime + shared `data.ts`) | `AppShell-*.js` | **JS total raw / gzip** |
| --- | --- | --- | --- | --- | --- |
| `/` | 5,623 / 2,139 | 9,633 / 4,150 | 25,127 / 10,313 | 10,689 / 4,729 | **51,072 / 21,331** |
| `/records` | 5,849 / 2,313 | 9,633 / 4,150 | 25,127 / 10,313 | 10,689 / 4,729 | **51,298 / 21,505** |
| `/settings` | 3,990 / 1,810 | 9,633 / 4,150 | 25,127 / 10,313 | 10,689 / 4,729 | **49,439 / 21,002** |

CSS: `main-*.css` 4,990 raw / 1,620 gzip on every route. HTML documents: `/` 7,036 / 1,861, `/records` 120,748 / 7,256, `/settings` 4,768 / 1,252 (raw / gzip).

Preloads: the server emits `modulepreload` for the page chunk and `data-*.js`; `AppShell-*.js` is not preloaded and is fetched after the entry runs.

## Commands

All run from this directory. It is a standalone pnpm root (own `pnpm-workspace.yaml` and `pnpm-lock.yaml`); the repo root lockfile is not involved. The smoke loads Playwright from the repo root `node_modules/.pnpm`.

```sh
pnpm install --ignore-workspace
pnpm sync                                            # copy shared/data.ts + styles.css into src/shared
BENCHMARK_BUILD_ID=<id> pnpm build                   # sync --check, then vite build -> dist/client + dist/server/entry.js
pnpm typecheck                                       # tsrx-tsc --noEmit -p tsconfig.json
PORT=4480 node dist/server/entry.js                  # production server (same as `PORT=4480 pnpm start`)
BENCHMARK_BUILD_ID=<id> PORT=4480 pnpm smoke         # contract smoke, server must be running
pnpm run build:vercel                                # build, then ripple-adapt-vercel -> .vercel/output
```

Ports: 4480-4489 are reserved for this entrant.

## Framework findings (Ripple 0.4.7)

1. **`RippleSet` breaks SSR.** `new RippleSet()` inside a component compiles to `_$_.ripple_set(...)`, which the server runtime does not export: the render throws `TypeError: _$_.ripple_set is not a function`, the server sends an empty `<div id="root">`, and the client falls back to a full mount.
2. **Non-bubbling events are delegated.** `onCancel={fn}` on a `<dialog>` is compiled to a delegated handler, but `cancel` does not bubble, so the handler never runs. `{ handleEvent, delegated: false }` works.
3. **`@for (...; index i; key i)` crashes hydration.** The key function reads `i.value` on an undefined index argument (`Cannot read properties of undefined (reading 'value')`); hydration then fails and the fallback mount also fails, leaving the page empty. Keying by the item works.
4. **Plain-value props do not update a child.** A child component receiving `error={errors.value[field]}` and rendering `@if (error)` never showed the error after it changed (observed; the docs pass `Tracked` objects when a prop must stay reactive). The settings fields are rendered inline in the parent loop instead.
5. **`AppShell-*.js` is not in the server's `modulepreload` list** (only the page chunk and the shared runtime chunk are), so one module is discovered late.
6. Types: `ripple/types/index.d.ts` needs `ReadonlySetLike` (ESNext lib) and `@tsrx/core` types import packages that are not installed, so the app tsconfig uses `lib: ["ESNext", "DOM", "DOM.Iterable"]` and `skipLibCheck`.
7. **Adapter binds `localhost` by default**, which is `::1` only on macOS; `127.0.0.1` clients cannot connect. Worked around with a `hostname` option in `ripple.config.ts`.
8. **No pre-hydration event replay**: early clicks on the 200-row `/records` page can be lost (see runner results).

## Vercel

`ripple.config.ts` uses `serve`/`runtime` from `@ripple-ts/adapter-vercel`. A deploy would be:

```sh
pnpm run build:vercel            # writes .vercel/output (Build Output API v3)
vercel deploy --prebuilt         # not run; deploys are out of scope for this task
```

`pnpm run build:vercel` was run for the scaffold and succeeded: static assets go to `.vercel/output/static` (with `/assets/*` served `immutable`), and every other path goes to one Node function, `functions/index.func` (response streaming enabled).

Adapter doubts:

- **Heavy function.** The generated server entry imports `@ripple-ts/vite-plugin` (to get `RenderRoute` from `ripple.config.ts`) and `@ripple-ts/adapter-vercel`. `@vercel/nft` therefore traces `vite`, `rolldown`, `typescript`, `lightningcss`, and `@vercel/nft` itself into the function: **18 MB** on disk for a three-route app. This may inflate cold starts.
- **Runtime version is auto-detected from the local Node** (24 here). The PM ruling requires Node.js 22.x on Vercel; set `serverless.runtime` via `adapt()` before a deploy.
- The adapter prints 15 "Failed to resolve dependency" warnings for optional imports of traced dev tooling. The build still succeeds; the function has not been run on Vercel.

## Vercel production deployment

Public URL: https://mlbench-ripple.vercel.app (project `mlbench-ripple`, deployment `dpl_EAP2885MHacwJHuL64PxsKqRix4B`, 2026-09-23T03:06:00.926Z). Runtime `nodejs24.x`, region iad1. Per-deployment URLs stay behind Vercel SSO.

Build id `vercel-ripple-5e6ef143`: `vercel-ripple-` plus the first 8 hex digits of a sha256 over this directory's source files (sorted relative path and bytes; skips `node_modules`, `.output`, `.vercel`, `dist`, `build`, framework caches, `BENCH.md`, `build-info.json`).

Build: `BENCHMARK_BUILD_ID=<id> pnpm run build:vercel` (runtime auto-detected as `nodejs24.x`), region pinned to `iad1` in `.vc-config.json`, then `vercel deploy --prebuilt --prod`. The 18 MB function (traced dev tooling with macOS native bindings) starts and serves on Linux.

Smoke on the public URL: pass (`/`, `/records`, `/settings` 200/200/200, identity metas match; settings POST 200, name `fail` 422, GET 405, PUT 405). HTTP/2, document `gzip`; hashed JS `/assets/src/pages/overview.tsrx-CBZKTekT.js` `cache-control: public, max-age=31536000, immutable`, `x-vercel-cache` HIT then HIT.

Runner correctness against the public URL (Chromium, direct, no proxy): **22/33**. Failed: `overview-counter-first [early] timeout`, `overview-counter-repeat-x10 [early] timeout`, `overview-toggle [early] timeout`, `overview-disclosure [early] timeout`, `overview-tab [early] timeout`, `overview-filter [early] timeout`, `records-search [early] timeout`, `records-sort [early] timeout`, `records-select [early] timeout`, `records-dialog-open [early] timeout`, `settings-derived [early] timeout`.
