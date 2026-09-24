# React Router entrant

Framework mode, server-rendered on every request (`ssr: true`), deployed through Vercel's React Router preset. Standalone pnpm root (`pnpm-workspace.yaml` with `packages: []`), so none of these dependencies enter the Markless workspace or root lockfile.

## Versions (pinned 2026-09-22)

| Package | Version | Status | Source |
| --- | --- | --- | --- |
| react-router | 8.4.0 | stable (`latest`; released 2026-09-15) | `npm view react-router dist-tags` |
| @react-router/dev, @react-router/node, @react-router/serve | 8.4.0 | stable | npm dist-tags |
| react, react-dom | 19.3.0 | stable (`latest`) | npm dist-tags |
| vite | 8.3.0 | stable (`latest`) | npm dist-tags |
| @vercel/react-router | 1.3.6 | stable (`latest`, 2026-08-26) | npm dist-tags |
| isbot | 5.2.2 | stable | npm dist-tags |
| typescript | 5.9.3 | matches the official template's `^5.9.3` | template package.json |
| React Compiler | not enabled | the official `default` template does not add `babel-plugin-react-compiler` (latest 1.0.0); kept at the template's choice | remix-run/react-router-templates `default/` at 067adb37 |

Node >= 22.22.0 is required by React Router 8 (local runs used Node 24.15.0).

## Rendering mode

SSR: `react-router.config.ts` sets `ssr: true` (the template default). HTML for `/`, `/records`, `/settings` is rendered per request by the server bundle, then React hydrates and the router takes over client-side navigation. Route modules are split per route (`splitRouteModules` is the v8 default).

## Commands

Run from this directory.

| Step | Command |
| --- | --- |
| Install | `pnpm install` |
| Sync shared files | `pnpm run sync` (copies `shared/data.ts` and `shared/styles.css` into `app/shared/`) |
| Build | `BENCHMARK_BUILD_ID=<id> pnpm run build` (runs `sync:check`, which fails on drifted copies, then `react-router build`) |
| App typecheck | `pnpm run typecheck` (`react-router typegen && tsc`) |
| Serve | `PORT=4440 pnpm start` (runs `react-router-serve` on the single server bundle listed in `.vercel/react-router-build-result.json`; it gzips responses) |
| Contract smoke | `BASE_URL=http://localhost:4440 pnpm run smoke` (Playwright resolved from the repo root's `@playwright/test`) |
| Client bytes | `BASE_URL=http://localhost:4440 pnpm run bytes` |

Because the Vercel preset sets `serverBundles`, the server entry is `build/server/nodejs_<config-hash>/index.js` rather than `build/server/index.js`; `scripts/start.mjs` reads the path from the build result instead of hard-coding it.

The build id comes from `BENCHMARK_BUILD_ID` at build time, falling back to `git rev-parse --short HEAD`; `vite.config.ts` injects it as a compile-time constant rendered into `<meta name="benchmark:build">` in `app/root.tsx`.

## Implementation

- Shared copies live in `app/shared/` (`data.ts`, `styles.css`). `styles.css` is loaded through the route `links` export with Vite's `?url` import, the template's own pattern.
- `app/root.tsx`: document head (entrant and build metas, `<Meta />`, `<Links />`), the shared layout, `NavLink` header links (`end` on every link so only the exact route gets `aria-current="page"`), `<ScrollRestoration />`.
- `app/components/sidebar-tree.tsx`: recursive disclosure tree, one `useState` per group; collapsed panels use the `hidden` attribute, so nested state survives a parent collapse.
- `app/routes/overview.tsx`, `records.tsx`, `settings.tsx`: `useState`/`useMemo`/`useCallback` hooks. Records rows are a keyed `memo` component; the edit dialog is a native `<dialog>` opened with `showModal()`.
- Titles use each route's `meta` export with `documentTitle(route)`.
- `app/routes/api.settings.ts` is a resource route: `action` handles POST (300 ms timer started when the handler starts, `Response.json` with `cache-control: no-store`), any other method and the `loader` (GET/HEAD) return 405.
- React Compiler is off (template default).

### Settings submit request

The Settings route submits with `useFetcher().submit(values, { method: "post", encType: "application/json", flushSync: true })` to its own `clientAction`. The `clientAction` sends exactly one `POST /api/settings` with `content-type: application/json` and body `{"name","email","quantity","unitPrice"}` (raw field strings), and maps a network failure to `Request failed.`. No routes have server loaders, so React Router makes no revalidation request after the action; the smoke asserts the submit produces exactly one fetch. `flushSync: true` makes the pending UI (`fetcher.state !== "idle"`) commit synchronously in the submit event instead of inside React Router's default `startTransition`.

## Contract status (local, port 4440, Chromium)

`scripts/smoke.mjs` runs every case in CONTRACT.md's measured and correctness-only tables with trusted Playwright input and exact assertions, in a fresh browser context per case. Cases marked early are run a second time right after `page.goto` commits, without waiting for load. Extra checks cover SSR HTML, the API (delay, headers, 200/422/400/405), identity metas, layout and ARIA, keyboard activation, tab arrow/Home/End keys, stepper bounds, empty states, row identity across search, re-sort after rename, cancel button, live error updates, and forward navigation landing at `scrollY` 0.

| Case | Settled | Early |
| --- | --- | --- |
| overview-counter-first | pass | pass |
| overview-counter-repeat-x10 | pass | pass |
| overview-independent-panel | pass | n/a |
| overview-toggle | pass | pass |
| overview-disclosure | pass | pass |
| overview-disclosure-nested | pass | n/a |
| overview-tab | pass | pass |
| overview-filter | pass | pass |
| records-search | pass | pass |
| records-sort | pass | pass |
| records-sort-toggle (correctness only) | pass | n/a |
| records-select | pass | pass |
| records-dialog-open | pass | pass |
| records-dialog-save | pass | n/a |
| records-dialog-cancel (correctness only) | pass | n/a |
| settings-derived | pass | pass |
| settings-submit | pass | n/a |
| settings-submit-error | pass | n/a |
| settings-validation (correctness only) | pass | n/a |
| nav-overview-to-records | pass (no document request) | pass |
| history-back | pass when the route is left while scrolled; see contract issue below | n/a |

Smoke total: 41/41 required checks pass, plus one informational check that fails for the contract reason below.

### Contract issue: history-back pre-steps

The case scrolls `/records` to y=1200 and then clicks `nav-settings` with Playwright's trusted click. The header is not sticky in `styles.css`, so Playwright scrolls the link into view first; a capture-phase `pointerdown` listener sees `scrollY` 0 at the click. The route is therefore left at y=0, and `<ScrollRestoration />` correctly restores 0 on Back, which fails the assertion `abs(scrollY - 1200) <= 50`. Any correct restoration implementation fails this pre-step as written. The smoke checks restoration by leaving the scrolled page with `dispatchEvent("click")` on `nav-settings` (restores to 1200, pass) and keeps the literal trusted-click variant as `history-back:literal-playwright-click`, reported as INFO-FAIL without failing the run. This needs a contract or runner fix (for example a sticky header in `styles.css`, or leaving the route with a navigation that does not scroll first).

## Contract deviations

- None in app behavior. The runner's `targets.mjs` reads build identity from `<meta name="bench-build-id">` / `x-bench-build-id`, while CONTRACT.md rule 8 names `<meta name="benchmark:build">`; this app follows the contract.
- `NavLink` adds its own `class="active"` (and an empty `class` on inactive links) and `data-discover`; these are framework-owned attributes and nothing in `styles.css` targets them.

## Client JS and CSS on initial load (local build)

Files referenced by each route's SSR HTML (module script imports plus modulepreloads), gzip level 9 via `pnpm run bytes`:

| Route | JS files | JS raw | JS gzip | CSS gzip | HTML raw | HTML gzip |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | 7 | 356,758 | 115,163 | 1,605 | 8,977 | 2,616 |
| `/records` | 7 | 357,382 | 115,405 | 1,605 | 107,374 | 8,079 |
| `/settings` | 8 | 355,405 | 115,177 | 1,605 | 7,964 | 2,140 |

Shared across routes: entry.client 67.2 kB gzip, jsx-runtime (React) 28.9 kB, errorBoundaries 11.7 kB, lib 4.3 kB, data (shared fixtures) 2.3 kB, root 0.8 kB. Route chunks: overview 1.2 kB, records 1.5 kB, settings 1.0 kB plus a 0.2 kB split `clientAction` chunk.

After hydration React Router fetches `/__manifest?paths=...` once (lazy route discovery, the v8 default, about 0.4 kB) for the `<Link>`s on screen. Client navigation to `/records` fetches only the records route chunk (1.5 kB); there is no data request because no route has a server loader.

## Vercel deployment

Integration: `vercelPreset()` from `@vercel/react-router/vite` in `react-router.config.ts`, which is Vercel's documented React Router integration. At build end it writes `.vercel/react-router-build-result.json`, which Vercel's builder reads to create one Node.js function per server bundle (here a single `nodejs` bundle) and to serve `build/client` as static assets.

To deploy later, with this directory as the Vercel project root and a Node 22 or 24 runtime:

```sh
vercel pull --yes --environment=production
vercel build --prod
vercel deploy --prebuilt --prod
```

Adapter doubts:

- `@vercel/react-router@1.3.6` (also on vercel/vercel `main`) declares peer dependencies `@react-router/dev@7` and `@react-router/node@7`; pnpm warns about the unmet peers against 8.4.0. The local production build and the build-result file work with 8.4.0, but Vercel has not published a version declaring React Router 8 support. A real `vercel build` + deployment is needed to confirm the builder accepts the v8 output.
- The official `react-router-templates` repository no longer has a Vercel template to compare against.
- The preset uses `serverBundles`, so the local server entry differs from the non-Vercel default path.

## Known limitations

- The Tailwind setup and Google Fonts links from the default template were left out; styling is the shared `styles.css` only.

## Vercel production deployment

Public URL: https://mlbench-react-router.vercel.app (project `mlbench-react-router`, deployment `dpl_GtFhavhyY8V38W9F3D4zfEbGCJ8c`, 2026-09-23T03:08:27.345Z). Runtime `nodejs24.x`, region iad1. Per-deployment URLs stay behind Vercel SSO.

Build id `vercel-react-router-da72e418`: `vercel-react-router-` plus the first 8 hex digits of a sha256 over this directory's source files (sorted relative path and bytes; skips `node_modules`, `.output`, `.vercel`, `dist`, `build`, framework caches, `BENCH.md`, `build-info.json`).

Build: project framework preset set to `react-router`, then `BENCHMARK_BUILD_ID=<id> vercel build --prod --yes` (Vercel's React Router builder accepted the React Router 8 build result) and `vercel deploy --prebuilt --prod`. Functions pinned to `iad1`. `vercel build` pulls `.vercel/.env.production.local`; it was deleted after the build.

Smoke on the public URL: pass (`/`, `/records`, `/settings` 200/200/200, identity metas match; settings POST 200, name `fail` 422, GET 405, PUT 405). HTTP/2, document `gzip`; hashed JS `/assets/entry.client-pT2057XF.js` `cache-control: public, max-age=31536000, immutable`, `x-vercel-cache` MISS then HIT.

Runner correctness against the public URL (Chromium, direct, no proxy): **30/33**. Failed: `overview-counter-repeat-x10 [early] timeout`, `overview-toggle [early] timeout`, `records-search [early] timeout`.
