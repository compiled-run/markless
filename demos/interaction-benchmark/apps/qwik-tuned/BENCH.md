# Qwik v2 entrant, tuned variant

Results label: entrant `qwik`, variant `tuned` (runner target `qwik-tuned`). The page identity meta stays `benchmark:entrant` = `qwik`.

This directory is a copy of `apps/qwik` (same versions, routes, components, endpoint, smoke) with three documented Qwik settings changed. Everything not listed under "Tuning" is identical to the default entrant; see `../qwik/BENCH.md` for versions, implementation notes, contract status and deviations. It has its own pnpm root and lockfile (copied unchanged) and deploys as its own Vercel project, so the default and tuned entrants build and deploy independently.

Why it exists: with its defaults, Qwik 2.0.0-beta.45 loads the Qwik loader as an external async module. On a real network a click that lands after first paint but before that script runs is lost (`docs/goals/packed-delivery-performance/notes/T088-real-network-early.md`). The benchmark keeps the default entrant unchanged and records this tuned configuration next to it (CONTRACT.md rule 6: documented optimizations are allowed and recorded as a separate `variant`).

## Tuning

| Setting | Default entrant | Tuned | Source |
| --- | --- | --- | --- |
| Qwik loader delivery (`src/entry.ssr.tsx`) | `qwikLoader: "module"` (default): `<script async type="module" src="/build/q-….js">` | `qwikLoader: "inline"`: the loader script is embedded in the HTML | Qwik docs, Qwikloader: "we recommend delivering Qwikloader in an inlined `<script>` tag" (https://qwik.dev/docs/advanced/qwikloader/); `RenderOptions.qwikLoader` JSDoc in `@qwik.dev/core/dist/server.d.ts` ("`inline`: This embeds the Qwik Loader script directly in the document ... about 1.6kB with gzip") |
| Bundle grouping (`vite.config.ts`) | `entryStrategy: { type: "smart" }`, no manual map | `{ type: "smart", manual: ROUTE_BUNDLES }`: one bundle per route (`overview`, `records`, `settings`) and one for the shared chrome (root, layout, sidebar tree), using the docs' `bundle()` helper | Qwik docs, Bundle Optimization, `qwikVite()` plugin section (https://qwik.dev/docs/guides/bundle/) |
| SSR preloads (`src/entry.ssr.tsx`) | `preloader` default (`ssrPreloads: 5`, `maxIdlePreloads: 25`) | `preloader: { ssrPreloads: 8, maxIdlePreloads: 25 }` | `PreloaderOptions` JSDoc in `@qwik.dev/core/dist/server.d.ts`; Qwik docs, Prefetching Modules, "Preloader" (https://qwik.dev/docs/advanced/modules-prefetching/#preloader) |

Notes on each:

- Inline loader: the loader is placed near the end of the container HTML (5.3 kB unminified text in the `/` document), not in `<head>`. Listeners are installed when the parser reaches it, with no extra request.
- Grouping: the manual map keys are Qwik segment hashes, read from this app's `q-manifest.json`. The hashes depend on the app directory, so they differ from `apps/qwik`'s. The Qwik docs say hashes are stable across compilations; a changed hash is not an error, the segment just falls back to the smart placement. Qwik ignores the manual map for `useComputed$` segments (they keep their own bundles), so the route bundles hold components, event handlers and `$` helpers. Result: 60 client JS files become 41.
- Preloads: with `ssrPreloads: 8` the SSR head's inline preload script adds `modulepreload` links for the route bundle and the chrome bundle on first paint (on `/`: the overview bundle and the chrome bundle are among the 8). `maxIdlePreloads` is left at its default and is written out only to make the configuration explicit.

## Commands

Run from `demos/interaction-benchmark/apps/qwik-tuned`. Same as `apps/qwik`, but the local port defaults to 4425.

| Step | Command |
| --- | --- |
| Install | `pnpm install --frozen-lockfile` |
| Build | `BENCHMARK_BUILD_ID=<id> pnpm run build` |
| Serve locally | `PORT=4425 pnpm run serve` |
| Contract smoke | `BASE_URL=http://localhost:4425 [BENCHMARK_BUILD_ID=<id>] pnpm run smoke` |
| Client JS per route | `BASE_URL=http://localhost:4425 pnpm run measure-js` |
| Runner | `node ../../runner/correctness.mjs --targets qwik-tuned` (serves on 4425, proxy on 5425) |

## Results (2026-09-23)

- Build: exit 0 (client, Vercel Edge server, SSG step, `tsc`, ESLint).
- Contract smoke, local production build: 49 passed, 0 failed.
- Runner correctness via the proxy, normal profile: 33/33.
- Runner, constrained profile (rtt150 / 5 Mbps / 4x CPU, `--network-shaping cdp`), early phase, 3 visits each of `overview-counter-first`, `overview-toggle`, `overview-tab`, `records-sort`, `records-select`, `settings-derived`: 18/18 inputs captured (input-to-response medians 300-388 ms). Under the same profile the default entrant passed 0 of 3 early counter visits (T088 note).
- Runner correctness on the public URL (direct, normal profile): 33/33; a second early-only run: 12/12. The default entrant's public URL scores 22/33, all 11 failures early-phase.

Client JS per route (initial load, gzip level 9, local production build, `measure-js.mjs`):

| Route | HTML (gzip) | JS `modulepreload`ed in SSR head | JS fetched by `load` | JS fetched by `load` + 3 s idle | Bundle graph JSON |
| --- | --- | --- | --- | --- | --- |
| `/` | 10,482 | 39,985 (2 files) | 57,425 (14 files) | 68,447 (34 files) | 1,242 |
| `/records` | 31,781 | 39,985 (2 files) | 45,345 (6 files) | 68,527 (34 files) | 1,242 |
| `/settings` | 9,335 | 39,985 (2 files) | 49,729 (11 files) | 68,714 (35 files) | 1,242 |

Whole client `build/` directory: 41 JS files, 72,333 bytes gzip (sum of per-file gzip).

## Vercel production deployment

Public URL: https://mlbench-qwik-tuned.vercel.app (project `mlbench-qwik-tuned`, team jack-shelton, deployment `dpl_DgG6146xKdDkBMkgLGJaiVwxH964`, 2026-09-23T03:38:09Z). Runtime `edge` (served from cle1 for the smoke host). Per-deployment URLs stay behind Vercel SSO (302).

Build id `vercel-qwik-tuned-fce8506b`, same method as the other entrants (first 8 hex digits of a sha256 over this directory's source files).

Deploy steps, same as `apps/qwik`: `BENCHMARK_BUILD_ID=<id> pnpm run build`; copy the two `vercel.json` header rules into `.vercel/output/config.json` ahead of the adapter's routes (`--prebuilt` does not apply `vercel.json`); `vercel deploy --prebuilt --prod`. `vercel link` writes a `.env.local` with an OIDC token and appends `.env*` to `.gitignore`: delete the file and restore `.gitignore` before hashing, or the build id changes.
