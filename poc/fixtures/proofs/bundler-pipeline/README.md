# Bundler Pipeline Proof

This fixture is the executable spec for the minimal `@markless/core`
bundler-pipeline POC. It is intentionally authored as normal `.tsrx` source and
does not include hand-written final artifact JSON.

## Source

- [`src/App.tsrx`](./src/App.tsrx)

## What This Proves

Future pass-boundary and pipeline-boundary tests consume this fixture to prove:

- the compiler TSRX transform entry can consume authored `.tsrx`;
- the Rolldown plugin boundary sees and transforms TSRX modules;
- the Vite adapter delegates to the same Rolldown/base transform instead of
  creating a second compiler model;
- virtual modules are generated through the plugin boundary;
- emitted chunks record app module, generated symbol, and runtime-facing
  ownership;
- manifest output records transformed modules, virtual modules, emitted chunks,
  and their relationships;
- HMR artifact updates refresh transform and manifest records;
- local pipeline receipts make build/dev/HMR behavior inspectable;
- shared compiler/protocol code stays free of Node-only assumptions;
- build tooling remains Vite/Rolldown/vite-plus only.

## Focused Tests

- `poc/packages/compiler/test/bundler-pipeline.test.ts` checks the compiler transform
  artifact from this fixture.
- `poc/packages/rolldown/test/bundler-pipeline.test.ts` checks that the Rolldown POC
  plugin delegates to the compiler transform, exposes virtual modules, records
  emitted chunks, and returns inspectable receipts.
- `poc/packages/vite/test/bundler-pipeline.test.ts` checks that the Vite POC adapter
  wraps the same Rolldown/base plugin and refreshes transform/manifest records
  during an HMR update.
- `poc/packages/test-utils/test/pipeline-receipts.test.ts` checks the local
  Witness-style receipt helpers used by the POC tests.

## Non-Goals

- No browser resume.
- No production bundler.
- No fake final artifacts.
- No webpack, Rollup, esbuild, SWC, Babel, Jest, tsup, tsdown, or custom build
  stack.
