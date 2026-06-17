# Contributing To Arcade

This file is for people and AI agents changing the repo. The README explains
what Arcade is; this file explains how the workspace is organized and how to
make changes safely.

## Start Here

Read these in order:

1. [AGENTS.md](./AGENTS.md) for always-on project rules.
2. [specs/framework-design.md](./specs/framework-design.md) for the design index.
3. [specs/framework/00-overview.md](./specs/framework/00-overview.md) for the
   product contract and package map.
4. The narrow split spec under `specs/framework/` for the behavior you are
   changing.
5. [specs/state.md](./specs/state.md) for current progress and caveats.

Treat `specs/framework/archive/` as historical context, not the current
contract.

## Package Map

Workspace packages mostly use the internal `@arcade/*` scope. App authors use
the public `arcade` package:

- `packages/arcade` -> `arcade`, public authoring, runtime, and adapter
  re-exports.
- `packages/core` -> `@arcade/core`, internal authoring API implementation
  used by `arcade`.
- `packages/protocol` -> `@arcade/protocol`, shared protocol and payload
  types.
- `packages/runtime` -> `@arcade/runtime`, graph runtime, render, and resume
  helpers.
- `packages/serializer` -> `@arcade/serializer`, value and payload
  serialization.
- `packages/compiler` -> `@arcade/compiler`, compiler passes and artifacts
  for `.tsrx` files.
- `packages/bundler` -> `@arcade/bundler`, Rolldown and Vite integration.
- `packages/test-utils` -> `@arcade/test-utils`, test helpers.
- `packages/vitest-browser` -> `@arcade/vitest-browser`, browser-mode test
  helpers.

There is intentionally no `packages/server`. Initial render and browser resume
are phases of one runtime model.

## Local Setup

```sh
pnpm install
pnpm test
pnpm check
pnpm lint
pnpm fmt
pnpm build
```

Prefer vite-plus commands directly when working on a focused slice:

```sh
pnpm exec vp test packages/compiler/test/semantic-graph.test.ts
pnpm exec vp check
pnpm exec vp pack
```

## Development Rules

- TSRX-only: Arcade components live in `.tsrx` files.
- Import authoring APIs from `arcade`.
- Do not add reactivity to plain `.ts` files.
- Do not add TSX or JSX support unless the specs are deliberately reopened.
- Do not add hydration or VDOM behavior.
- Keep compiler behavior in pass-owned modules with readable artifacts.
- Keep shared compiler, runtime, serializer, and protocol code runtime-agnostic
  ESM.
- Build tooling goes through Rolldown or Vite. Do not add another build stack.
- Maintainers working on features must keep the relevant GoalBuddy kanban board
  up to date. Use `docs/goals/<slug>/state.yaml` as the source of truth and
  record task status, receipts, verification, and the next task or blocker
  before stopping or handing off.

## Test Workflow

Use the red-green-refactor loop for behavior changes:

1. Add or update the closest focused test.
2. Run the narrow command and confirm it fails for the expected reason.
3. Implement the smallest change that makes the test pass.
4. Rerun the focused test.
5. Broaden verification only when the change touches shared behavior.

Compiler tests should assert pass artifacts and diagnostics whenever possible.
End-to-end fixture tests are useful, but they do not replace pass-level
coverage.

## Agent Notes

Use project-local skills when available:

- `$arcade-implementation` for compiler, runtime, bundler, package, or test
  work.
- `$arcade-spec-maintenance` for spec edits.

Ignore generated and local-output folders while scanning:

- `dist/`
- `.witness/`
- `packages/bundler/.witness/`
- `docs/goals/`

The `poc/` tree contains executable proof fixtures and earlier proof packages.
Use it as design evidence and regression material, not as the production package
surface.
