# Markless entrant

The Markless implementation of the interaction benchmark (`demos/interaction-benchmark/CONTRACT.md`,
v1.1: sticky `.app-header`).

## Versions

This app is a member of the root pnpm workspace, so it builds against the working-tree Markless
packages, not a published release.

| Package | Version | Source |
| --- | --- | --- |
| `@markless/core`, `@markless/router`, `@markless/typescript-plugin` (and transitively bundler, compiler, runtime, serializer, web) | `workspace:*`, package.json version 0.4.0 | Working tree of this repository. Record `git rev-parse HEAD` plus `git status` at measurement time. The numbers below were taken on snapshot `6c6dfabe` with uncommitted framework changes (T078 and T071b) in `packages/bundler`, `packages/compiler`, `packages/serializer` and `packages/web`. |
| `nitro` | `3.0.260429-beta` (prerelease) | Root `catalog:` entry, same as `website/`. |
| `vite-plus` | `0.3.1` | Same as `website/`. |
| `vite` | `npm:@voidzero-dev/vite-plus-core@0.3.1` | Root override, same as `website/`. |
| `typescript` | `5.9.3` | Root workspace. |
| Node / pnpm (local) | v24.15.0 / 10.33.2 | Local machine. The Vercel preset chose the `nodejs24.x` runtime. |

## Rendering mode

SSR (`renderMode: ssr`). Nitro serves every request and the router plugin renders it; the browser
resumes the server's work instead of hydrating it. Configuration matches the docs site
(`website/vite.config.ts`): `markless({ experimentalNativePacking: true })` plus
`router({ linkPreloading: 'intent' })`.

App shape:

- `document.tsrx`: the HTML document (`<Html>` from `@markless/router`), identity meta tags, and
  `styles.css` through Vite's `?url` asset pipeline.
- `src/layout.tsrx`: header (`Link` from `@markless/router`), sidebar, `<main>`, and the route
  `<title>`. Each page renders `<Layout route="...">`.
- `src/disclosure.tsrx`: one sidebar group with its own `state(false)`; groups nest by children.
- `pages/index.tsrx`, `pages/records.tsrx`, `pages/settings.tsrx`: `state()` / `computed()`,
  `@for` / `@if`, and `element()` handles for dialog and focus.
- `api/settings.ts`: the router's server endpoint for `/api/settings`.
- `src/shared/`: `data.ts` and `styles.css`, copied by `shared/sync.mjs` (`pnpm run sync`).

## Commands

Run from `demos/interaction-benchmark/apps/markless` after `pnpm install` at the repo root.

| Step | Command |
| --- | --- |
| Sync shared files | `pnpm run sync` (`node ../../shared/sync.mjs . src/shared`); `pnpm run sync:check` exits 1 on drift |
| Build (Node server) | `BENCHMARK_BUILD_ID=<id> pnpm run build` (runs `sync:check`, then `vp build`) writes `.output/` |
| Serve | `pnpm run start` serves `node .output/server/index.mjs` on port 4410 |
| Contract smoke | `pnpm run smoke` builds nothing. It starts `.output/server/index.mjs` on `PORT` (default 4410), checks raw SSR HTML and the endpoint, then runs every CONTRACT.md case with trusted Playwright input |
| App typecheck | `pnpm run typecheck`, the Markless-aware checker (`packages/typescript-plugin/src/tsc.ts`) |
| Vercel build | `pnpm run build:vercel` writes `.vercel/output` |
| Vercel deploy | `vercel deploy --prebuilt --prod` after the Vercel build (see "Vercel production deployment") |

## Build status on the current working tree

`pnpm run build` succeeds with `experimentalNativePacking: true`, the configured entrant. Every
result below comes from that build.

## Contract status

From the contract smoke (49/49) and `runner/correctness.mjs --targets markless` (33/33), both on
the packed build.

| Case | Status |
| --- | --- |
| overview-counter-first (early, settled) | pass |
| overview-counter-repeat-x10 (early, settled) | pass |
| overview-independent-panel | pass |
| overview-toggle (early, settled) | pass |
| overview-disclosure (early, settled) | pass |
| overview-disclosure-nested | pass |
| overview-tab (early, settled) | pass |
| overview-filter (early, settled) | pass |
| records-search (early, settled) | pass |
| records-sort (early, settled) | pass |
| records-sort-toggle | pass |
| records-select (early, settled) | pass |
| records-dialog-open (early, settled) | pass |
| records-dialog-save | pass |
| records-dialog-cancel | pass |
| settings-derived (early, settled) | pass |
| settings-submit | pass |
| settings-submit-error | pass |
| settings-validation | pass |
| nav-overview-to-records (early, settled) | pass |
| history-back | pass |

Extra smoke checks, all passing: raw SSR HTML identity and titles per route, endpoint behavior
(200/422/405, headers, unparseable body, 300 ms delay), layout attributes, keyboard activation,
stepper bounds, tab arrow/Home/End keys, filter empty state, records empty state, selection across
search and sort, save disabled for a blank name, name-sorted rename order, network error message,
and navigation across all routes.

## Settings submit request

`fetch('/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body })`
from the form's `onSubmit`, with body `{"name","email","quantity","unitPrice"}` as raw field strings.
The endpoint is `api/settings.ts`, the router's server endpoint mechanism (`EndpointHttpContext`).

## Client JS on initial load

Measured by the smoke: script responses in Chromium after load plus network idle, each body gzipped
with Node's zlib. Taken on snapshot `f6de3b00` plus the constant-props change (T095); the same
snapshot without it measured 57,145 / 57,473 / 55,993 B gzip. The difference is the sidebar
`node` values the layout's client reader answers with when a client navigation renders the layout.

| Route | Scripts | Raw | Gzip |
| --- | --- | --- | --- |
| `/` | 4 | 230,698 B | 57,204 B |
| `/records` | 4 | 241,865 B | 57,523 B |
| `/settings` | 4 | 229,352 B | 56,054 B |

## Contract deviations

1. The three tab buttons are written out rather than generated by a keyed `@for` over `TABS`. Their
   `aria-selected` / `tabindex` are inline expressions (`selectedTab === summaryTab!.id ? ...`).
2. Focus for the tab arrow keys and for the dialog's return target uses
   `document.getElementById` in the app's own handler, because per-row element handles are not
   available inside `@for`.

## Framework findings

1. Fixed: the packed build succeeds. It used to fail (`unresolved generated symbol chunks`) for a page with 5 or more
   handler symbols that renders any stateful child component. Minimal repro: a page with five
   `let cN = state(0)` counters plus `<Disclosure id="guides" />`; four counters build.
2. Fixed. Compile errors inside a nested child module used to hang the build at `transforming...`
   instead of reporting them. Constant data passed as a prop also used to be one of those errors:
   `<Disclosure node={SIDEBAR_TREE[0]!}>` was rejected with `MARKLESS_CAPTURE_OPAQUE_PROP`, so the
   groups took a literal `id` and looked the node up. Plain-data `const` values (and static member or
   index reads of them) now reach the browser as their build-time value, so the layout passes the
   `SIDEBAR_TREE` nodes directly.
3. Fixed: the app now uses these forms and passes. Handler and computed modules used to drop some references: module-level constants such as
   `const [summaryTab] = TABS` threw `summaryTab is not defined` at the first click; `sort?.key`,
   `records[0]!.name` and `editNameEl?.value` fail with `MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE`.
4. Fixed. Keyed `@for` rows did not update their bodies on the client when an item was replaced
   or mutated under its key. A row now rebuilds when any of its values moves: an item field, a
   page cell it reads, or an authored expression (`\`Edit ${record.name}\``,
   `formatUpdatedAt(record.updatedAt)`, `selectedIds.includes(record.id)`), which the page's
   render-data reader answers. Still open: the in-row mutation `record.name = ...` does not compile
   for a loop over state or over a computed. Over a computed the refusal is intended (computed values
   are read-only in v1), but the error is an unresolved-reference one rather than a read-only one.
5. Fixed. Attribute and text expressions that read state beside a module constant
   (`aria-selected={selectedTab === TABS[0].id ? ...}`) now update, and `<p>{a}|{b}|{c}</p>` updates
   as one joined value. A call to a helper of your own over state inside markup
   (`disabled={normalizeEditedName(draft) === ''}`) now fails the build with
   `MARKLESS_TEMPLATE_EXPRESSION_UNSUPPORTED` instead of rendering once; the app wraps it in a
   `computed()`.
6. `onKeyDown` works at runtime but the type service only accepts `onKeydown`; `tabindex="0"` and
   `colspan="7"` string literals are type errors.

## Vercel production deployment

Public URL: https://mlbench-markless.vercel.app (project `mlbench-markless`, deployment `dpl_6zrZWzgxj9iRUhXh1WbjxWAzfrPD`, 2026-09-23T03:28:06.011Z). Runtime `nodejs24.x`, region iad1. Per-deployment URLs stay behind Vercel SSO.

Build id `vercel-markless-3c755f6b`: `vercel-markless-` plus the first 8 hex digits of a sha256 over this directory's source files (sorted relative path and bytes; skips `node_modules`, `.output`, `.vercel`, `dist`, `build`, framework caches, `BENCH.md`, `build-info.json`).

Build: `NITRO_PRESET=vercel BENCHMARK_BUILD_ID=<id> pnpm run build` from this directory (the Nitro `vercel` preset through the router; `@markless/*` resolve to the working-tree sources), then `vercel deploy --prebuilt --prod`. The region in `.vercel/output/functions/__server.func/.vc-config.json` is pinned to `iad1` after the build.

Framework sources at deploy time: HEAD `d5107ae0` plus uncommitted working-tree changes, sha256 `0a62e352bc3e` over `packages/{core,router,bundler,compiler,web,runtime,serializer,analyzer}/src/**`. This includes the router fix that stops leaving the `nitro` import of the endpoint wrapper external, so `/api/settings` now runs on Vercel, where the function ships without `node_modules`.

Smoke on the public URL: PASS. `/`, `/records`, `/settings` 200 with matching identity metas; settings POST 200 (`no-store`, about 470 ms wall including the 300 ms delay), name `fail` 422, GET and PUT 405 with `allow: POST`. HTTP/2, document `gzip` (`br` when offered); hashed JS `/build/chunk-Be9glhDm.js` `cache-control: public, max-age=31536000, immutable`, `x-vercel-cache` MISS then HIT.

Runner correctness against the public URL (Chromium, direct, no proxy): **33/33**.
