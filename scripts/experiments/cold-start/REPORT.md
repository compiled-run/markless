# Website cold-start interaction

The main measured cost is unnecessary compilation behind the UI package barrel. A named import such as `import { tree } from '@markless/ui'` was walking unrelated exported families and forcing their TSRX compilation. The work happens again for the browser environment when interaction begins. Cached transforms explain why later interactions feel fast.

The candidate fix restricts the outer barrel walk to explicitly imported names/default exports. Namespace and unknown imports retain their conservative traversal; star re-exports remain traversable. It skips type-only bindings. No browser preload, hydration, dependency optimizer, runtime, website configuration, or eager initialization was added.

## Measurements

Fresh isolated dev server and Chromium context per sample, retained isolated dependency cache, light theme, `/markless/`, first theme toggle immediately after it becomes visible. Three cold runs before and after; two warm toggles per run. Server transform timings and CPU profiling were enabled in both sets. These are local development measurements, including development tools and source maps, not production bundle budgets.

| Measurement | Before | Candidate fix |
| --- | --- | --- |
| First click, median | 8.10 s | 1.24 s |
| First click, range | 5.72–10.95 s | 0.41–1.28 s |
| First document response, median | 7.85 s | 2.66 s |
| First document response, range | 7.72–14.98 s | 0.92–3.00 s |
| Initial external scripts | 5 | 5 |
| Initial external script response bytes | 242,599 | 242,599 |
| Scripts through three clicks | 177 | 177 |
| Script response bytes through three clicks | 12,166,719 | 10,421,333 |
| UI families in measured transforms over 1 ms | 46 | 5 |
| Browser errors in the six runs | 0 | 0 |

The observed median first-click improvement is 85%. Other dev/build processes were already running and were left untouched, so absolute timings vary considerably. The ranges do not overlap and clear the predeclared 20% threshold. The sub-second interaction target was achieved in one run, not reliably across these loaded-machine samples. Warm clicks ranged from 10–199 ms across both sets.

An additional idle-page check waited 2.5 seconds without interacting: only theme.js, mascot.js, Vite's client/environment modules, and Markless's dev error client were requested. Interaction modules stayed lazy. The remaining first-interaction graph is still large in source-served development; this patch addresses unnecessary compiler work rather than redesigning that graph.

## Change and checks

Compiler pass: `module-link`. Owner: `packages/compiler/src/passes/link/module-link.ts`. Consumes import binding metadata, resolution answers, and module graph interfaces; produces the barrel interfaces and child modules the bundler links. Five newly introduced assertions failed before the fix. Focused tests cover named/default/namespace/type-only imports, alternate names, multiple imports, existing shared-definition chains, and barrel composition.

- Root `pnpm run typecheck`: passed.
- Focused compiler/bundler tests: passed; see `evidence/link-tests.log` for the final count.
- Witness SSR browser resume: passed, including repeated clicks and no browser errors/failed requests.
- Witness repeated SSR hot reload: passed.
- Website tests: 41 passed, 1 failed. Existing `components/docs/anatomy/scenes.test.ts` reads a directory as a file after enumerating UI routes (`EISDIR`).
- Website Markless-aware typecheck: blocked by errors in existing mascot files: SVG `opacity` attributes and possibly undefined selection bindings.
- Accordion page could not serve in the initial measurement because existing playground tooling resolves `@markless/compiler` from `@markless/core`, which does not declare that dependency. This is separate from the measured homepage slowdown.

The candidate is **not fully verified or ready to land** while the consuming website checks remain red. No commit or push was made. Unrelated work and existing servers were preserved; the profiling server was stopped.

## Reproduction and evidence

From the repository root, start `node scripts/experiments/cold-start/server.mjs my-sample`. In another terminal run `node scripts/experiments/cold-start/probe.mjs`. Stop that server before starting another cold sample. The harness uses port 4488 and writes raw network timings, transform records, and Chrome CPU profiles under `/tmp/markless-cold-start/`.

`results.json` preserves the six sample summaries. `evidence/` preserves verification logs, idle-loading evidence, and Witness summaries with hashes and paths to the full receipts. Raw profiles, full receipts, and full network/transform records remain in the temporary directory. The failed accordion attempt was excluded from homepage timing comparisons; it also populated part of the dependency cache before those comparisons.
