# Navigation-intent async prestart POC

This runnable proof shows that navigation intent can start the destination page's statically known async computed fetches before destination rendering begins. Page A has a link to Page B. In the prefetch run, `pointerdown` loads Page B's compiler output, derives its async demand, starts that demand, and only then commits the in-POC navigation. There is no authored loader and no new authoring API.

## Derivation and execution

`build.mjs` compiles `src/PageB.tsrx` with the real Markless compiler and emits `dist/route-b-artifact.mjs`. The browser consumes these exact compiled fields:

- `protocolView.asyncBoundaries[].asyncReads[].graphNodeId` supplies boundary-read roots.
- `protocolState.computed[].dependencies` supplies the transitive edges, including edges through sync computeds.
- `protocolState.computed[].async` selects async nodes from that closure.
- `protocolView.asyncRunners[graphNodeId]` resolves each selected node to its compiler-emitted runner symbol.
- `protocolState.computed[].deriveSymbolId` resolves sync computed hops needed to feed a downstream runner.
- `protocolState.cells` seeds the destination graph-read shim.

`src/derive.mjs` deliberately fails when a demanded async computed has no `asyncRunners` entry. The prestart list therefore cannot silently survive a compiler regression by falling back to a handwritten fetch list.

The POC executes compiler-emitted runner and sync-derive modules against a minimal graph-read shim. This is the honest intent-time option: running the destination component would begin rendering and defeat the measurement, while the runners' emitted contract already accepts graph reads, an abort signal, and a key. The shim does not emulate rendering, hydration, or a second component runtime.

## Measurement

`server.mjs` uses one delayed API for both runs and records request arrival time and sequence. The browser explicitly posts destination render start, producing `renderStartMs` and `renderStartSequence` in the same server clock as each fetch arrival.

The Playwright test records:

- `results/timeline-prefetch.json`: every derived fetch arrival precedes destination render start;
- `results/timeline-plain.json`: the same compiled destination starts only after destination render start.

The independent catalog request has a longer delay than the session-to-recommendations chain. The test therefore also requires at least two destination requests to remain unsettled when the prefetched navigation commits, proving they are genuinely in flight rather than merely present in old timeline history.

The prefetch navigation shim waits until the server has observed all derived request arrivals before committing navigation. This models a router choosing to gate commit on intent work; it does not claim that a production router must use this policy. The plain run records render start first and then invokes the identical compiler-derived execution path.

## What this proves—and does not

This proves that the current compiled protocol has enough information to prestart all statically demanded async computeds, including an async dependency reached through a sync computed, without a loader or fetch list.

It does not prove real `@markless/router` integration. It also cannot prestart a computed whose demand is conditional on runtime-only control flow; no system can prestart a requirement before discovering that requirement. Cache ownership, deduplication across navigation commit, abort behavior, and staleness policy are intentionally deferred.

Placement recommendation: keep this evidence under `poc/` now because it uses a deliberately minimal graph and navigation shim. Promote it to `demos/` and integrate the derivation/execution boundary into `packages/router` only after repeated box tests prove robust cancellation, cache handoff, navigation races, and development/production artifact behavior. That threshold prevents a convincing timing proof from being mistaken for a production-ready router contract.

## Commands for the PM

Run these in order from the repository root:

```sh
pnpm --dir poc/nav-intent-prefetch run build
node --check poc/nav-intent-prefetch/build.mjs
node --check poc/nav-intent-prefetch/server.mjs
node --check poc/nav-intent-prefetch/src/client.mjs
node --check poc/nav-intent-prefetch/src/derive.mjs
node --check poc/nav-intent-prefetch/src/prefetch.mjs
pnpm --dir poc/nav-intent-prefetch run check
pnpm --dir poc/nav-intent-prefetch run test:static
pnpm --dir poc/nav-intent-prefetch run test:browser
```

The browser test reuses the Playwright installation already declared by `demos/chained-async-comparison`. If that package or Chromium is absent, prepare it first without changing this POC's dependency truth:

```sh
pnpm --dir demos/chained-async-comparison install
pnpm --dir demos/chained-async-comparison exec playwright install chromium
```

The last command binds a loopback port and launches Chromium, so it is reserved for the PM environment. It writes both JSON evidence files only after all ordering and rendered-data assertions pass.
