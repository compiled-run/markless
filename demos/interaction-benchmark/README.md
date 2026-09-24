# Interaction benchmark

The same three-route dashboard (Overview, Records, Settings) implemented idiomatically in Markless, Qwik v2, Octane, React Router, Remix 3, SolidStart v2, SvelteKit with Svelte 5, and Ripple. One external Playwright runner visits each deployed build and measures how soon trusted input produces the correct visible response, during downloads and after they settle, plus repeats, independent controls, and navigation. Failures are recorded beside timings, never dropped.

- [CONTRACT.md](CONTRACT.md): the behavior contract. Routes, `data-testid`s, ARIA semantics, exact expected text, measurement definitions, and the measured case table. Every entrant implements exactly this.
- `shared/data.ts`: deterministic fixtures (200 records from mulberry32 seed 42, sidebar tree, tabs, filter items, settings validation and the `POST /api/settings` decision) and pure helpers. No dependencies, no DOM.
- `shared/styles.css`: the one stylesheet every app loads.
- `shared/result.schema.json`: JSON Schema for one runner result record (one per measured visit, failures included).
- `shared/sync.mjs`: copies `data.ts` and `styles.css` into an app.

## Layout

```
demos/interaction-benchmark/
  CONTRACT.md
  shared/            source of truth for fixtures, styles, result schema
  runner/            external Playwright runner
  apps/<entrant>/    one app per entrant
```

`apps/markless` is part of the root pnpm workspace so it builds against the working-tree Markless packages. Every other app is a standalone pnpm root with its own `pnpm-workspace.yaml` and lockfile, so its toolchain never touches the Markless workspace and is never routed through the Markless compiler.

Apps never import across their own root. Shared files are copied in, with a generated header naming the source hash:

```sh
node demos/interaction-benchmark/shared/sync.mjs demos/interaction-benchmark/apps/<entrant>            # writes src/shared/
node demos/interaction-benchmark/shared/sync.mjs demos/interaction-benchmark/apps/<entrant> app/shared # custom destination
node demos/interaction-benchmark/shared/sync.mjs demos/interaction-benchmark/apps/<entrant> --check    # exit 1 if copies drifted
```

Edit only `shared/`, then re-sync every app. Do not edit the copies.

## Build and run an entrant

```sh
node demos/interaction-benchmark/shared/sync.mjs demos/interaction-benchmark/apps/<entrant>
cd demos/interaction-benchmark/apps/<entrant>
pnpm install            # standalone roots; apps/markless uses the root install
BENCHMARK_BUILD_ID=<id> pnpm build
pnpm start              # production server, see the app's README for the port
```

Each app's own README pins its framework, router, adapter, and bundler versions and names its render mode. Deployments are independent Vercel projects, one per entrant.
