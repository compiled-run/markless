# Claude Fable 5 Goal: Router, CSR Demo, And Manifest-Free Preloads

Use this file as the GoalBuddy charter for the next agent.

Suggested command:

```text
/goal Follow demos/preload-goal.md.
```

## Objective

Finish the current `feat/router` PR by cleaning up the tracked changes, preserving the good router and music-player work, and replacing the rejected preload implementation with a minimal manifest-free approach.

The desired end state:

- The tracked router changes are understood, validated, and either completed or trimmed.
- The `demos/music-player` CSR conversion stays documented and working if it is still wanted in this PR.
- CSR and SSR preload behavior is fixed without a runtime manifest fetch and without a large Rolldown marker-rewrite path.
- The available branch `codex/manifest-metadata-refactor` is used as the implementation direction for moving away from manifest-as-runtime concept.
- The final PR is coherent enough to push to `main`.

## Operator Feedback To Respect

The previous preload attempt was rejected.

Specific objections:

- Do not remove `joinURL` from `packages/bundler/src/build/preload-plan.ts`; using `ufo` at the bundler level is fine.
- Do not add about 65 lines of `rolldown.ts` marker/string-rewrite code.
- Do not keep or add a manifest-driven runtime preload path.
- Use the local/upstream branch `codex/manifest-metadata-refactor`; it is already available and points at `origin/codex/manifest-metadata-refactor`.

## Current Branch And Worktree

Current branch:

```text
feat/router
```

Recent HEAD:

```text
a7942e3 Fix router document preloads
```

Important: the worktree contains both staged and unstaged changes.

Staged additions:

- `demos/music-player/index.html`
- `demos/music-player/src/App.tsrx`
- `demos/music-player/src/main.ts`
- `packages/router/src/route-matcher.ts`

Unstaged tracked changes:

- `demos/music-player/boxes/tmp-csr.box.ts`
- `demos/music-player/document.tsrx` deleted
- `demos/music-player/package.json`
- `demos/music-player/pages/index.tsrx` deleted
- `demos/music-player/tsconfig.json`
- `demos/music-player/vite.config.ts`
- `packages/arcade/src/index.ts`
- `packages/arcade/test/public-surface.test.ts`
- `packages/bundler/fixtures/vite-ssr-preloader/vite.config.ts`
- `packages/bundler/fixtures/vite-ssr/src/dev-server.ts`
- `packages/bundler/fixtures/vite-ssr/vite.config.ts`
- `packages/bundler/src/rolldown.ts`
- `packages/bundler/src/source-module.ts`
- `packages/bundler/test/fixture-boundaries.test.ts`
- `packages/bundler/test/package-metadata.test.ts`
- `packages/bundler/test/preload-plan.test.ts`
- `packages/bundler/test/rolldown.test.ts`
- `packages/router/boxes/router-preload-strategy.box.ts`
- `packages/router/fixtures/router/components/InteractiveCounter.tsrx`
- `packages/router/fixtures/router/pages/index.tsrx`
- `packages/router/package.json`
- `packages/router/src/route-manifest.ts`
- `packages/router/src/spa-navigation.ts`
- `packages/router/src/vite/entries/client-entry.ts`
- `packages/router/src/vite/entries/route-discovery.ts` deleted
- `packages/router/src/vite/index.ts`
- `packages/router/src/vite/runtime/create-route-discovery.ts` deleted
- `packages/router/src/vite/runtime/create-server-entry.ts`
- `packages/router/test/spa-navigation.test.ts`
- `packages/router/test/vite.test.ts`
- `pnpm-lock.yaml`
- `vite.config.ts`

## Current Inconsistent State

Do not assume the current worktree builds.

The interrupted cleanup left a known inconsistency:

- `packages/bundler/src/source-module.ts` no longer exports `ARCADE_MODULE_PRELOADS_MARKER` and no longer emits the CSR `preloadCsrLazySymbols()` runtime fetch.
- `packages/bundler/src/rolldown.ts` still imports `ARCADE_MODULE_PRELOADS_MARKER` and still contains marker replacement helpers.
- `packages/bundler/test/rolldown.test.ts` still expects marker-based baked artifact preloads.

First cleanup task should remove or replace the marker-rewrite preload attempt coherently.

## What Changed: Music Player CSR App

The non-SSR `demos/music-player` demo was converted from router SSR shape to plain CSR app shape.

Added:

- `demos/music-player/index.html`
  - Static HTML with `<div id="app"></div>`.
  - Script entry: `<script type="module" src="/src/main.ts"></script>`.
- `demos/music-player/src/main.ts`
  - Imports `render` from `arcade`.
  - Imports `App` from `./App.tsrx`.
  - Imports `./styles.css`.
  - Renders into `#app`.
- `demos/music-player/src/App.tsrx`
  - Moved the old page app component into `src`.
  - Uses local component imports from `./components/...`.
  - Keeps YouTube controller behavior and command state.

Deleted:

- `demos/music-player/document.tsrx`
- `demos/music-player/pages/index.tsrx`

Updated:

- `demos/music-player/package.json` removes `@arcade/router`.
- `demos/music-player/vite.config.ts` now uses `plugins: [arcade()]`.
- `demos/music-player/tsconfig.json` includes only `src` and `vite.config.ts`.
- `demos/music-player/boxes/tmp-csr.box.ts` changed from SSR/router expectations to CSR expectations.
- `pnpm-lock.yaml` removes the music-player router workspace dependency.
- `packages/bundler/test/package-metadata.test.ts` now expects `music-player` to be CSR and `music-player-ssr` to remain router SSR.

Need to verify:

- Whether this CSR conversion belongs in the final PR.
- Whether the temporary CSR box name/content should be cleaned up.
- Whether the CSR demo should assert no SSR payloads and still cover YouTube command behavior.

## What Changed: Router Manifest And Route Discovery

The router work moves route matching and route data generation away from browser-side route discovery.

Added:

- `packages/router/src/route-matcher.ts`
  - Owns route manifest types.
  - Owns `normalizeRequestPathname()`.
  - Owns `matchRouteManifest()`.
  - Uses local path helpers instead of `pathe`/`ufo`, so browser runtime route matching has no build-time URL/path dependencies.

Changed:

- `packages/router/src/route-manifest.ts`
  - Now builds route manifests from file IDs.
  - Re-exports matcher types/functions from `route-matcher.ts`.
  - Replaces `pathe`/`ufo` helpers with local `normalizeFilePath`, `extname`, slash helpers.
- `packages/router/src/vite/entries/client-entry.ts`
  - Imports `pageModuleLoaders`, `routeFileIds`, and `routeManifest` from `virtual:arcade-router/routes`.
  - No longer imports `createRouteDiscovery`.
  - Starts SPA navigation with the manifest object, not raw route file IDs.
- `packages/router/src/vite/index.ts`
  - Generates `virtual:arcade-router/routes` directly at build/plugin time.
  - Uses `discoverPageFiles()` and `buildRouteManifestFromFileIds()`.
  - Emits `pageModuleLoaders`, `routeFileIds`, and `routeManifest`.
  - Route preload collection now excludes sibling route chunks and navigation polyfill chunks.
- `packages/router/src/vite/runtime/create-server-entry.ts`
  - Accepts optional `routeManifest`.
  - Falls back to building from `routeFileIds` if needed.
- `packages/router/src/spa-navigation.ts`
  - Accepts `manifest` instead of `routeFileIds`.
  - Lazily loads the Navigation API polyfill on internal Link click if `window.navigation` is missing.
  - Guards against attaching the navigate listener multiple times.

Deleted:

- `packages/router/src/vite/entries/route-discovery.ts`
- `packages/router/src/vite/runtime/create-route-discovery.ts`
- The package export for `./vite/runtime/create-route-discovery`.
- The root `vite.config.ts` alias for that removed helper.

Tests updated:

- `packages/router/test/vite.test.ts`
  - Verifies generated route data has no browser route discovery helper.
  - Verifies browser router modules avoid `pathe`/`ufo`.
  - Updates exact route preload map expectations.
  - Excludes navigation polyfill and sibling route chunks from route preloads.
- `packages/router/test/spa-navigation.test.ts`
  - Updates callers to pass `manifest`.
  - Adds lazy polyfill-load test.
- `packages/router/boxes/router-preload-strategy.box.ts`
  - Excludes Vite preload helper/polyfill-ish chunks from candidate route preload matching.
- Router fixtures add `type="checkbox"` to input controls in:
  - `packages/router/fixtures/router/components/InteractiveCounter.tsrx`
  - `packages/router/fixtures/router/pages/index.tsrx`

Need to verify:

- Route manifest generation still works in dev and build.
- Removed `create-route-discovery` exports do not break public API expectations.
- Exact route preload maps are still right after the manifest-metadata branch is applied.

## What Changed: Arcade Public Surface

`packages/arcade/src/index.ts` was narrowed:

- Keeps author/browser render exports such as `state`, `computed`, `element`, `shared`, `render`.
- Removes root exports for:
  - `renderToString`
  - resume APIs
  - Rolldown plugin APIs

`packages/arcade/test/public-surface.test.ts` now expects server/build APIs through subpaths instead of the root entry.

Need to verify:

- This public surface narrowing is intended for this PR.
- It does not break examples or package metadata tests.

## What Changed: Bundler Fixtures

`packages/bundler/fixtures/vite-ssr/vite.config.ts`:

- Uses `fileURLToPath(new URL(...))` to make SSR input absolute.

`packages/bundler/fixtures/vite-ssr-preloader/vite.config.ts`:

- No longer re-exports `../vite-ssr/vite.config.ts`.
- Defines its own config so the SSR input resolves to the preloader fixture root.
- This was necessary because the preloader fixture had been building the base SSR fixture root, producing too few preloads.

`packages/bundler/fixtures/vite-ssr/src/dev-server.ts`:

- Was changed to read `entry.default.modulePreloads`.
- This depends on the rejected baked artifact preload approach.
- If marker/baked artifact preloads are removed, this host should probably go back to planning from `payloadView` plus resume root, or use the final manifest-free metadata approach chosen by the next agent.

## What Changed: Rejected Bundler Preload Attempt

This attempt should not be kept as-is.

`packages/bundler/src/source-module.ts`:

- Removed old CSR runtime preload function:
  - `fetch("/build/bundle-graph.json")`
  - dynamic `import("arcade/preload")`
  - `preloadLazySymbolModules(...)`
- Removed `preload: preloadCsrLazySymbols` from CSR compiled artifact.
- This part is directionally useful because runtime bundle graph fetch is unwanted.

`packages/bundler/src/rolldown.ts`:

- Added `planModulePreloads` import.
- Added import of `ARCADE_MODULE_PRELOADS_MARKER`.
- Added `ArtifactModulePreload` type.
- Added `MODULE_PRELOAD_MARKER_RE`.
- Added server/client generateBundle marker replacement.
- Added helpers:
  - `rewriteGeneratedArtifactModulePreloads()`
  - `planArtifactModulePreloads()`
- This is rejected: too much complexity, string marker replacement, and not aligned with the manifest-removal branch.

`packages/bundler/test/rolldown.test.ts`:

- Was changed to expect generated marker constants and baked artifact preloads.
- Added a large generated-bundle test around marker replacement.
- This test should be removed or rewritten for the final simpler implementation.

`packages/bundler/test/preload-plan.test.ts`:

- Adds a URL joining test.
- Keep the spirit of this test, but keep `joinURL` in bundler preload planning.

Important operator decision:

- Do not restore the old CSR `/build/bundle-graph.json` runtime fetch.
- Do not keep marker replacement.
- Find a simpler manifest-free path, likely through build metadata/head/link injection or through the `codex/manifest-metadata-refactor` model.

## Previous Failed Test Output That Started This

Original preload failures:

```text
fail csr preload: throttled startup overlaps lazy symbol modulepreloads
Expected CSR startup to request lazy symbol modulepreload /build/chunk-Bv277vyw.js, but saw:
/build/chunk-BQllG2s8.js start=0ms end=546ms duration=546ms

fail csr preview: built app loads through vite preview
Expected CSR startup to request lazy symbol modulepreload /build/chunk-D4JETWol.js, but saw: /build/chunk-DQ2bfX_X.js, /build/chunk-BQllG2s8.js

fail ssr preload: preview HTML renders bundle graph modulepreloads
Expected SSR preload fixture to expose a complex dependency graph with at least 6 modulepreloads, but saw 4.

fail ssr preload: low-network startup downloads preloaded chunks before interaction
Expected a complex preload set with at least 6 chunks, saw 4.

fail ssr preload: modulepreload requests overlap instead of waterfalling
Expected a complex preload set with at least 6 chunks, saw 4.
```

Earlier unrelated build failure:

```text
Cannot resolve entry module ./packages/router/src/vite/runtime/create-route-discovery.ts
```

That is consistent with the removed route discovery helper still being referenced somewhere before cleanup.

## What We Tried

1. Confirmed CSR should still use modulepreload for lazy/dynamic symbol chunks.
   - Raw CSR `index.html` does not inherently need SSR-style preload links.
   - But CSR startup should warm lazy symbol chunks so the first interaction does not fetch new JS.

2. Researched real-world patterns with grep MCP.
   - `__vitePreload` in Vite/Rolldown output showed dynamic import dependency arrays are the normal bundler-level mechanism.
   - Other projects either emit `<link rel="modulepreload">` from build/SSR data or append deduped modulepreload links in the browser.

3. Implemented a rejected marker-based artifact preload plan.
   - It baked finalized preload hrefs into generated TSRX artifacts by replacing a string marker during `generateBundle`.
   - It made CSR append those links and SSR read `artifact.modulePreloads`.
   - Focused tests passed before the cleanup interruption, but the design was too complex and not wanted.

4. Partially started cleanup after operator rejection.
   - Restored intent to keep `joinURL`.
   - Removed source-module CSR runtime fetch and `preload` artifact hook.
   - Did not finish cleanup, leaving `rolldown.ts` and tests inconsistent.

## Verification History

Before the operator rejected the marker approach, these commands had passed:

```text
pnpm exec vp test packages/bundler/test/rolldown.test.ts packages/bundler/test/module-preload-dom.test.ts
pnpm exec vp test packages/bundler/test/fixture-builds.test.ts
pnpm --dir packages/bundler/fixtures/vite-csr-preloader build
pnpm --dir packages/bundler/fixtures/vite-ssr-preloader build
pnpm exec vp test packages/bundler/test/package-metadata.test.ts packages/arcade/test/public-surface.test.ts
pnpm build
git diff --check
```

But do not treat that as current proof. The worktree changed after those runs.

The Witness box suite could not be run here because the environment cannot bind localhost ports:

```text
pnpm --dir packages/bundler test:boxes
listen EPERM: operation not permitted 127.0.0.1:5173
listen EPERM: operation not permitted 127.0.0.1:4173
```

Escalated port-capable execution was rejected by policy in the prior run. A local operator may need to run:

```text
pnpm --dir packages/bundler test:boxes
```

## Manifest Metadata Refactor Branch

Branch:

```text
codex/manifest-metadata-refactor
```

Current local ref:

```text
901a613052a4020eff0edb8fac5769c2a6db73cb
```

It tracks:

```text
origin/codex/manifest-metadata-refactor
```

Intent of that branch:

- Rename `packages/bundler/src/build/manifest.ts` to `build-metadata.ts`.
- Move away from manifest-as-runtime concept.
- Add `packages/bundler/src/build/head-links.ts`.
- Keep optional `arcade-manifest.json` as explicit output only.
- Remove server manifest injection concept from the main runtime path.

Files changed on that branch include:

- `packages/bundler/src/build/manifest.ts` renamed to `packages/bundler/src/build/build-metadata.ts`
- `packages/bundler/src/build/head-links.ts` added
- `packages/bundler/src/rolldown.ts`
- `packages/bundler/src/types.ts`
- `packages/bundler/src/vite/index.ts`
- `packages/bundler/test/manifest.test.ts`
- `packages/bundler/test/module-preload-dom.test.ts`
- `packages/bundler/test/preload-plan.test.ts`
- Router preload box/fixture updates
- Serializer/web payload changes unrelated to this immediate preload task

Important nuance:

- The branch still had the old CSR `/build/bundle-graph.json` runtime fetch in `source-module.ts` when inspected earlier.
- So the branch is the direction for removing manifest concepts, not a complete direct fix for CSR preloading.

## Recommended GoalBuddy Board Shape

Start with a recovery goal, not a blind implementation.

First active task should be Scout or Judge:

- Map staged vs unstaged changes.
- Identify which changes belong to the PR and which are accidental/preload-attempt residue.
- Compare current `feat/router` with `codex/manifest-metadata-refactor`.
- Decide whether to merge/cherry-pick the branch or manually port only the build-metadata/head-link pieces.

Then one Worker should do a deletion-first cleanup:

- Remove marker-rewrite machinery from `packages/bundler/src/rolldown.ts`.
- Remove marker/baked preload expectations from `packages/bundler/test/rolldown.test.ts`.
- Keep `joinURL` in `packages/bundler/src/build/preload-plan.ts`.
- Keep removal of runtime `/build/bundle-graph.json` fetch only if an actual replacement preload path is implemented in the same slice.
- Fix `packages/bundler/fixtures/vite-ssr/src/dev-server.ts` so it does not depend on `artifact.modulePreloads` unless that artifact field is intentionally retained.

Then a Worker should implement the final preload path:

- Prefer the manifest-metadata-refactor/build-metadata model.
- Avoid a CSR-only runtime fetch.
- Avoid SSR-only preload behavior.
- Avoid broad generated-code string replacement.
- Keep environment-specific sinks:
  - CSR can get built HTML modulepreload links or a small build-data-driven startup sink.
  - SSR can render head links from the same build/preload data.

## Likely Minimal Preload Direction

The likely best direction is:

- Use finalized bundle graph/build metadata during build.
- Compute lazy symbol modulepreload hrefs from symbol roots with `planModulePreloads()`.
- Put those hrefs into build-time HTML/head link output or shared build metadata, not into a generated TSRX artifact marker.
- Keep `joinURL` in bundler-level URL planning.
- Do not require app-authored CSR or SSR entries.

Open design choice for the next agent:

- If CSR boxes expect startup network requests, built CSR HTML can include `<link rel="modulepreload">` tags for lazy symbol chunks. That is not SSR-specific; it is static build HTML preload output.
- SSR can use the same computed list through render/head output.
- If the app has no host HTML transform path, use a small build metadata/head-link injection path from `codex/manifest-metadata-refactor`.

## Required Checks

Use narrow checks first:

```text
pnpm exec vp test packages/router/test/vite.test.ts packages/router/test/spa-navigation.test.ts
pnpm exec vp test packages/bundler/test/preload-plan.test.ts packages/bundler/test/rolldown.test.ts
pnpm exec vp test packages/bundler/test/package-metadata.test.ts packages/arcade/test/public-surface.test.ts
pnpm exec vp test packages/bundler/test/fixture-boundaries.test.ts
```

Then build checks:

```text
pnpm --dir demos/music-player build
pnpm --dir packages/bundler/fixtures/vite-csr-preloader build
pnpm --dir packages/bundler/fixtures/vite-ssr-preloader build
pnpm build
git diff --check
```

Final oracle, if the environment can bind ports:

```text
pnpm --dir packages/bundler test:boxes
```

Pay special attention to:

- `csr-preload-network`
- `csr-preview`
- `ssr-preload-html`
- `ssr-preload-network`
- `ssr-preload-waterfall`
- router preload strategy boxes
- music-player CSR box

## Non-Negotiables

- Do not use `../native-tsrx`.
- Do not add hydration or VDOM behavior.
- Do not add a standalone server package.
- Do not add a new build pipeline.
- Do not add a CSR-only runtime manifest fetch.
- Do not add or keep broad `generateBundle` string marker replacement for artifact preloads.
- Do not remove `joinURL` from bundler-level preload URL planning.
- Preserve unrelated tracked work unless the board explicitly decides it is residue and removes it deliberately.
