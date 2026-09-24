# SvelteKit entrant (Svelte 5 runes)

Implements the full behavior contract `demos/interaction-benchmark/CONTRACT.md` (v1): layout, Overview, Records, Settings, `POST /api/settings`, identity metas, and client navigation.

## Pinned versions

All are exact pins in `package.json`, resolved in this app's own `pnpm-lock.yaml`. Source: `npm view <pkg> dist-tags` on 2026-09-22.

| Package | Version | npm dist-tag | Prerelease? | Notes |
| --- | --- | --- | --- | --- |
| `svelte` | 5.57.1 | `latest` | no | Svelte 5, runes mode (`$state`, `$props`) |
| `@sveltejs/kit` | 2.70.3 | `latest` | no | `next` is 3.0.0-next.27, not used |
| `@sveltejs/adapter-vercel` | 6.3.4 | `latest` | no | `next` is 7.0.0-next.9, not used |
| `@sveltejs/vite-plugin-svelte` | 7.3.0 | `latest` | no | its peer range requires vite ^8 and svelte ^5.46.4 |
| `vite` | 8.3.0 | `latest` | no | kit 2.70.3's peer range allows ^8 |
| `typescript` | 6.0.3 | not `latest` | no | `latest` is 7.0.2, but kit 2.70.3's peer range is `^5.3.3 \|\| ^6.0.0`, so this is the newest release that satisfies the peer range |
| `svelte-check` | 4.7.6 | `latest` | no | |

Toolchain used: Node 24.15.0, pnpm 10.33.2. The Vercel function runtime is pinned to `nodejs22.x` in `svelte.config.js`.

## Rendering mode

**SSR** (SvelteKit default: nothing is prerendered and no route sets `ssr = false`). Each request is rendered on the server, then the client hydrates it. Navigation after the first page load happens in the browser through SvelteKit's client router. The HTML comes from SvelteKit's own renderer. Nothing is hand-authored.

## Commands

Run all commands from this directory. It is a standalone pnpm root with its own `pnpm-workspace.yaml` and lockfile, so it never touches the Markless workspace.

| Step | Command |
| --- | --- |
| Sync shared files | `pnpm run sync` (copies `shared/data.ts` and `shared/styles.css` to `src/lib/shared/`, imported as `$lib/shared/...`) |
| Install | `pnpm install` (`onlyBuiltDependencies: [esbuild]` lets adapter-vercel's esbuild run its postinstall) |
| Build | `BENCHMARK_BUILD_ID=<id> pnpm run build` (`sync --check`, then `vite build`, which also runs adapter-vercel and writes `.vercel/output`). The build id falls back to `git rev-parse --short HEAD`, then `unknown`. |
| Type check | `pnpm run check` (`svelte-kit sync && svelte-check`) |
| Local serve | `pnpm run preview` (`vite preview` on 127.0.0.1:4470) |
| Contract smoke | `pnpm run smoke` (starts preview on `PORT` or 4470, runs every contract case, stops the server). `node scripts/smoke.mjs <case-prefix>` runs a subset. |
| Bytes | `pnpm run bytes` (against a running preview on `PORT` or 4470, or `ORIGIN`) |

### Local serving and deploy use the same build

A single `vite build` produces both outputs:

- `.svelte-kit/output/{client,server}` is served locally by `vite preview`. This uses SvelteKit's own preview server, which runs the real SSR server bundle whatever adapter is configured, so no second build with adapter-node is needed.
- `.vercel/output` (Build Output API v3) is what Vercel deploys.

So the local runs and the Vercel runs execute the same client assets and the same SSR code. The HTTP layer is different: locally it is Vite's preview middleware on Node 24, and on Vercel it is Vercel Functions on `nodejs22.x` behind Vercel's CDN.

## Implementation

- Shared files: `src/lib/shared/data.ts` and `src/lib/shared/styles.css`, written by `shared/sync.mjs` (destination `src/lib/shared`, so they resolve as `$lib/shared/...`). `styles.css` is imported by `src/routes/+layout.svelte` and emitted by Vite as one linked CSS file.
- Layout (`+layout.svelte`): header, nav, sidebar tree, `h1.page-title`, `<svelte:head>` with `<title>` (`documentTitle(route)`), `benchmark:entrant` and `benchmark:build`. The current route comes from `page` in `$app/state`, so title and `aria-current` follow client navigation. The build id is SvelteKit's own `kit.version.name` (set in `svelte.config.js` from `BENCHMARK_BUILD_ID` or the short git commit) and read through `version` from `$app/environment`.
- Sidebar tree: recursive `src/lib/TreeNode.svelte`, one `$state` per group. Panels stay rendered with the `hidden` attribute, so nested groups keep their state when a parent collapses.
- Overview: `$state` per panel, `$derived` for the selected tab and filter results, keyed `{#each}`. Tab arrow keys select and focus the next tab through `bind:this` references.
- Records: `$state.raw` record array (replaced on save), `SvelteSet` for selection by id, `$derived(visibleRecords(...))`, keyed `{#each rows as record (record.id)}`. The edit dialog is a native `<dialog class="dialog">`, rendered only while editing, opened with `showModal()` from an `{@attach}` attachment. `showModal()` focuses `edit-name` (first focusable). Save, Cancel, and Escape all end in the dialog's `close` event, which clears the editor and, after `tick()`, focuses the triggering `record-edit` button (a name re-sort moves the row, which drops focus otherwise).
- Settings: `$state` form values, errors `$derived` from `validateSettings` once a submit was attempted, `onsubmit` handler with `fetch`.
- Endpoint: `src/routes/api/settings/+server.ts` exports only `POST`; SvelteKit answers every other method with 405 on its own.

### Settings submit request

`fetch('/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email, quantity, unitPrice }) })`, one request per submit, raw field strings. This is the contract's own URL and encoding. A SvelteKit form action with `use:enhance` was not used: it would post `multipart/form-data` to `/settings?/save` and return SvelteKit's devalue-encoded action result, while the contract's endpoint must exist at `/api/settings` anyway. A `+server.ts` endpoint plus `fetch` is SvelteKit's documented pattern for a JSON API.

## Contract status (2026-09-22, local `vite preview`, Chromium via Playwright 1.58.2)

`pnpm run smoke`: 45/45 checks passed, run 3 times in a row. Every case is exercised with trusted Playwright input (`click`, `mouse.click`, `keyboard.press`, `keyboard.insertText`) and asserts the exact contract values.

| case | phases run | result |
| --- | --- | --- |
| `overview-counter-first` | early, settled | pass |
| `overview-counter-repeat-x10` | early, settled | pass (10 `mouse.click` sent without awaiting; stays at 10 after 300 ms) |
| `overview-independent-panel` | settled | pass |
| `overview-toggle` | early, settled | pass (Space, then Enter) |
| `overview-disclosure` | early, settled | pass |
| `overview-disclosure-nested` | settled | pass (also: nested state survives parent collapse via Enter/Space) |
| `overview-tab` | early, settled | pass (extra: ArrowRight wrap, ArrowLeft, Home, End, Enter, Space; focus, `tabindex`, `aria-labelledby`) |
| `overview-filter` | early, settled | pass (extra: `zzz` gives `0 items` and `filter-empty`) |
| `records-search` | early, settled | pass (extra: empty state `records-empty`, `colspan="7"`) |
| `records-sort` | early, settled | pass (also: row DOM identity for `r004` survives the sort) |
| `records-sort-toggle` | settled | pass |
| `records-select` | early, settled | pass (extra: Space toggles; selection kept across search and sort) |
| `records-dialog-open` | early, settled | pass (dialog is `:modal`, one instance, `aria-labelledby` resolves) |
| `records-dialog-save` | settled | pass (also aria-labels update; extra: Enter saves, empty name disables Save, name-sorted table re-sorts, focus returns) |
| `records-dialog-cancel` | settled | pass (Escape and `edit-cancel`) |
| `settings-derived` | early, settled | pass (extra: invalid quantity gives `Total: n/a`) |
| `settings-submit` | settled | pass (exactly one POST, URL `/api/settings`, `content-type: application/json`, exact body) |
| `settings-submit-error` | settled | pass (then a valid resubmit removes `settings-error`) |
| `settings-validation` | settled | pass (no request sent; `aria-describedby` set only while shown; errors update on input) |
| `nav-overview-to-records` | early, settled | pass; 1 document request per visit, so client-side navigation |
| `history-back` | settled | pass, with the pre-step deviation below; Forward also restores Settings |

Also checked: SSR HTML of every route contains `lang`, charset, viewport, the exact `<title>`, both identity metas, `h1.page-title`, and (for `/records`) all 200 rows; `GET /api/settings` gives 405; an unparseable body gives 400 `Invalid settings.` after at least 300 ms with `cache-control: no-store`; name ` FAIL ` gives 422.

No case is `unsupported`.

`runner/correctness.mjs` does not exist yet, so the shared runner's correctness suite was not run.

## Contract deviations and notes

- `history-back` pre-step: the smoke activates `nav-settings` with `locator.dispatchEvent('click')` (an untrusted click, pre-step only, not measured). A trusted click scrolls the header link into view first because the header is not sticky, so the window is back at `scrollY` 0 before the navigation starts and SvelteKit correctly restores 0. The shared runner's `actionable()` does the same `scrollIntoView`, so as written this case cannot pass for any entrant whose header scrolls away. Reported to the PM as a contract/runner finding. SvelteKit's own scroll restoration (it stores positions per history entry and sets `history.scrollRestoration = 'manual'`) restores 1200 when the page is left at 1200.
- Disclosure state lives in the layout, which SvelteKit keeps mounted across client navigation, so open groups stay open after navigating. The contract allows this ("not required to persist"); a fresh document load always starts collapsed.
- `data-sveltekit-preload-data="hover"` on `<body>` is kept from SvelteKit's default project template (its recommended configuration). Hovering a nav link preloads that route's code; no route has a `load` function, so no data is fetched.
- Early-phase inputs passed locally, but Svelte does not replay events that arrive before hydration. On a slower network an early click on an SSR button can be lost and would show up as a timeout or wrong response, which is the honest result for this framework.
- The document title for an unknown route (404) falls back to `Interaction benchmark`; not covered by the contract.

## Client bytes on initial load (2026-09-22 build)

Measured by `pnpm run bytes`: every `.js`/`.css` response a fresh context loads until network idle, gzip -9 per file, summed. The `nodes/1` default error page component is loaded eagerly by SvelteKit on every route.

| route | JS files | JS raw | JS gzip | CSS gzip | HTML raw / gzip |
| --- | --- | --- | --- | --- | --- |
| `/` | 10 | 87,122 B | 34,642 B | 1,605 B | 6,725 / 2,014 B |
| `/records` | 10 | 88,388 B | 35,190 B | 1,605 B | 104,583 / 7,283 B |
| `/settings` | 10 | 85,882 B | 34,291 B | 1,605 B | 4,742 / 1,385 B |

The largest chunks are the Svelte runtime (about 16.8 kB gzip), the SvelteKit client router (about 10.2 kB gzip), and the shared fixtures from `data.ts` (about 2.3 kB gzip). Preload hints arrive as an HTTP `Link` header (`rel="preload"` for the CSS, `rel="modulepreload"` for JS), not as `<link>` tags.

## Vercel adapter

Configured in `svelte.config.js` as `adapter({ runtime: 'nodejs22.x', regions: ['iad1'] })`, per the PM fairness ruling (Node.js 22.x, iad1, default memory). Build output checked locally: `.vercel/output/config.json` (v3) has `/_app/immutable/*` served with `cache-control: public, immutable, max-age=31536000`. It has one Node function per route (`index`, `records`, `settings`, deduplicated through symlinks to one shared handler) with `experimentalResponseStreaming: true`.

How a deploy would be done (not run, per packet):

1. `vercel link` in this directory (one Vercel project per entrant).
2. Either let Vercel build it (`vercel deploy`: framework preset SvelteKit, install `pnpm install`, build `pnpm run build`), or build locally and upload the result: `vercel build` then `vercel deploy --prebuilt`.
3. Preview deployments only. Check that the URL is not behind deployment protection.

Open questions about the adapter:

- Edge runtime (`runtime: 'edge'`) is possible but is not the recommended default. It is not used here.
- `Link` preload headers must survive Vercel's function response path. This still needs to be confirmed on a real preview deployment.

## Vercel production deployment

Public URL: https://mlbench-sveltekit.vercel.app (project `mlbench-sveltekit`, deployment `dpl_C2gS1Hv4PLnEqKMJ9YmNnmZPxtvK`, 2026-09-23T03:01:53.865Z). Runtime `nodejs24.x`, region iad1. Per-deployment URLs stay behind Vercel SSO.

Build id `vercel-sveltekit-5fd0b338`: `vercel-sveltekit-` plus the first 8 hex digits of a sha256 over this directory's source files (sorted relative path and bytes; skips `node_modules`, `.output`, `.vercel`, `dist`, `build`, framework caches, `BENCH.md`, `build-info.json`).

Build: `BENCHMARK_BUILD_ID=<id> pnpm run build`; the adapter writes `nodejs22.x`, which the deploy step patches to `nodejs24.x` (`iad1` kept); then `vercel deploy --prebuilt --prod`. The `Link` preload header survives the Vercel function path.

Smoke on the public URL: pass (`/`, `/records`, `/settings` 200/200/200, identity metas match; settings POST 200, name `fail` 422, GET 405, PUT 405). HTTP/2, document `gzip`; hashed JS `/_app/immutable/entry/start.zfeMyOvz.js` `cache-control: public, immutable, max-age=31536000`, `x-vercel-cache` HIT then HIT.

Runner correctness against the public URL (Chromium, direct, no proxy): **28/33**. Failed: `overview-toggle [early] timeout`, `overview-disclosure [early] timeout`, `overview-tab [early] timeout`, `records-sort [early] timeout`, `records-select [early] timeout`.
