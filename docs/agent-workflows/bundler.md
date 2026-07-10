# Bundler and Tooling Workflow

Read `implementation.md` first. This file is the bundler and repository-tooling overlay.

- The pnpm workspace files own workspace and dependency truth. Vite Plus is the root surface for pack, test, check, format, and lint configuration and commands; keep package scripts as thin aliases.
- Use Vite or Rolldown only for builds and production optimization. Do not introduce esbuild, terser, Rollup, SWC, webpack, Babel, Jest, standalone Vitest conventions, Prettier, ESLint, Biome, tsup, tsdown, another primary package manager, or a parallel custom tool stack.
- Before changing bundler code or fixtures, inspect the applicable `qwik-bundler` Rolldown entry, Vite adapters, build helpers, and fixture-backed tests. Use only its relevant bundler, Vite, Rolldown, build-artifact, fixture, and HMR shapes; do not copy unrelated Qwik router assumptions.
- The Markless router Vite plugin exists and is released. Preserve that fact when distinguishing it from unrelated Qwik router design.
- Use Witness boxes for pipeline and HMR behavior. Capture receipts for applicable server restarts, client reloads, build artifacts, manifests, leaked server-only values, and edit-to-update behavior.
