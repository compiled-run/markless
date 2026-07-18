# Chained async comparison

This demo renders one nested data graph in three framework-idiomatic ways and records when the shared API server receives each request. The graph is always:

```text
session (60ms) -> recommendations (90ms)
catalog (80ms), independent
reviews (70ms), independent
```

The Markless lane uses only async computeds. Its recommendations computed reads the session computed, while catalog and reviews are independent computeds; every template read is guarded by `@try`, `@pending`, and `@catch`.

The lane uses Markless's `renderToStream` mode. The server writes the pending shell as soon as it is available, keeps the chunked HTML response open, writes each settled boundary append, and then closes the document.

The TanStack Start query lane uses `useQuery` in rendered components. The parent session query renders first. Once it settles, the nested component mounts recommendations, catalog, and reviews queries together. That preserves the normal render-then-fetch discovery cost without serializing queries that the mounted component can run in parallel.

The TanStack Start loader lane uses an authored route `loader`. The loader starts session, catalog, and reviews immediately, then starts recommendations when session settles. This is the manual-parallelism ceiling available when all requirements are known by the route.

## Honesty rules

All lanes call the same server endpoints with the same delays and render the same values. No lane receives cached or prefetched data. Only recommendations depends on session in the data model. The harness asserts both the final DOM and the exact four-request timeline before writing results.

Runtime discovery still has a hard limit: conditionally demanded data cannot be prestarted before the condition is discovered in any lane, including Markless. Markless can prestart independent async computeds that the template demands; it cannot predict a data requirement that runtime control flow has not demanded.

`run.test.mjs` resets a per-lane epoch, drives one production page load, writes `results/timeline-<lane>.json`, and generates `results/summary.md`. Its timing policy allows 25ms for intended parallel starts and 12ms of delay tolerance. The query lane additionally requires a measurable 1ms page-render gap before its first query request and verifies that the three nested queries begin within the same 25ms window.

## Measured findings

A real Chromium and server run of the original Markless lane showed that `renderToString` did not satisfy the parallel-start assertion. Non-streaming SSR reaches sibling async boundaries in document order and waits for each boundary before starting the next boundary's runner, so the independent catalog and reviews requests started sequentially in that measured mode.

Markless's parallel-prestart behavior currently belongs to streaming SSR: `renderToStream` performs a discovery pass that starts every demanded boundary runner before the render pass awaits settled values. This demo therefore measures the framework's idiomatic render-as-you-go mode and leaves the 25ms start epsilon unchanged.

Framework follow-up: this branch now emits an `asyncRunners` registry. That registry could support a prestart phase for `renderToString` too, but this demo does not implement or simulate that behavior.

## Running the comparison

From this directory, run these commands in order:

```sh
pnpm install
pnpm exec playwright install chromium
pnpm run build
pnpm test
```

The test skips with a clear reason when the Playwright package or Chromium executable is absent. Builds do not require a browser or a bound development server.

## OCTANE

Best-effort workspace discovery used:

```sh
rg -i -n 'octane' demos packages README.md --glob 'README*' --glob '*.{md,json,ts,tsx,tsrx,js,mjs}'
```

This checkout contains no Octane references in those demo, package, or README sources, so there is not enough local evidence to identify an installable Octane library or a compatible meta-framework. No Octane lane is fabricated here.

**TODO (network-enabled follow-up):** check the npm registry and Octane's authoritative project documentation for the current package name, whether it has a maintained React/meta-framework integration with route loaders or component-owned queries, and whether its license and server runtime can support this exact harness before authoring a fourth lane.
