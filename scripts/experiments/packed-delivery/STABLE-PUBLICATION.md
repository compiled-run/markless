# Stable symbol publication and preload encoding

Workflow guidance: .ruler/skills/markless-implementation/implementation.md, .ruler/skills/markless-implementation/bundler.md, .ruler/skills/markless-implementation/performance.md.

Two build consistency fixes are implemented. Compact route-preload data now traverses route keys in sorted order while preserving each route's URL order and duplicates. First-pass symbol modules now resolve during linking but wait for finalized code before loading; a sibling first pass cannot overwrite finalized code or its execution-size entry. Failed linking refuses provisional symbol delivery. Finalized render-data dependencies remain loadable without claiming ownership of interaction routes.

The preload change's two regressions failed before implementation. Four symbol-publication regressions then reproduced early loading, failed-owner delivery and provisional overwrite. Alternate callback names and values execute correctly after linking; finalized revisions remain replaceable. The broader suite caught a render-data-only regression in the initial guard. Its existing production-build tests failed before separating finalized-code publication from claim recording and pass afterward.

## Production docs evidence

Three sequential final docs builds produced identical filenames and SHA-256 hashes for their 63 emitted client JavaScript files. Each run took approximately 31 seconds including doctor checks and copying the output. This is evidence for these repeated builds, not proof of universal compiler determinism or a build-speed improvement. The preceding three-build sample varied; an inspected pair differed by a 15-byte callback parameter fallback after normalizing chunk URLs. The final render-data correction did not change the docs' emitted JavaScript.

The final immutable output is `/private/tmp/markless-docs-determinism-aLMMJZ/build-2/.output`. Precise Chrome coverage passes 18 visits, 57 control actions and three unrelated static-header presses. The first counter action initializes 13 modules, repeats add zero, and an independent counter adds three. Computed state, the menu and accordion remain at 56, 72 and 117 first-action initializers; the second menu action adds one. Framework packs execute no covered source before input. These counts do not prove minimum necessary work. Coverage ranges and lexical export spans are not CPU time.

Six navigation/delivery cases pass: closed-overlay input, scalar/full-runtime handoff, keyboard input, intent/navigation/history/offline controls, delayed packs with visible controls, and observable failure of an intentionally blocked pack. The last case deliberately produces module-fetch errors; ordinary cases do not.

## Cold timing comparison

Ten fresh visits per build/condition, 40 visits and 120 clicks total. Chrome 153.0.8010.53, HTTP cache disabled, service workers blocked, identical Brotli-quality-5 HTML/JS proxies over localhost HTTP/1.1. Constrained runs use 150 ms latency, 5 Mbps and 4x CPU. Before runs precede after runs; no owned build, test or profiling work overlaps timing. Other desktop applications remain open. Timing ends at the expected DOM mutation, not compositor paint.

| Condition | Action | Before median | After median |
| --- | --- | ---: | ---: |
| Normal | First | 32.85 ms | 32.75 ms |
| Normal | Second | 15.10 ms | 15.15 ms |
| Normal | Third | 15.15 ms | 15.15 ms |
| Constrained | First | 79.35 ms | 73.50 ms |
| Constrained | Second | 9.45 ms | 10.65 ms |
| Constrained | Third | 13.00 ms | 11.15 ms |

No median difference clears max(10 ms, 10% of the previous median, twice the larger MAD). No speedup or regression is demonstrated. Both builds make five framework requests plus three site-script requests, with zero HTTP cache hits, failed clicks or page errors. No click starts another script request. Scripts are still pending at 9/10 before and 7/10 after constrained first clicks; this does not establish zero network wait. Encoded framework response bytes rise 210 B, from 235,485 to 235,695, despite the finalized callback's smaller raw source. This consistency fix is not a download-size optimization.

## Checks and preview

Root `pnpm run typecheck`, docs typecheck, 64 docs tests, 49 focused publication/HMR/preload tests, and the ten-test symbol/resolver/render-data combination pass. Final bundler/router verification has 859 passing tests and six unchanged size-budget/negative-budget failures. The docs tests retain their existing successful-test shutdown warning. No ceilings changed. Remaining gzip overruns: largest runtime fixture chunk 5,676 above 5,403/5,435; CSR download/startup 140,854/14,927 above 140,187/14,696; SSR download/navigation 84,855/25,702 above 84,771/25,502. Complex-control minimality and these gates remain unresolved.

Port 3000 still serves the earlier working immutable preview; port 3018 still serves the arm-registration candidate. Neither was switched. Fresh direct Chrome State clicks on port 3000 reach count 2 with five framework requests returning 200 and no console errors. A subsequent homepage visit opens and closes the documentation menu successfully; reused files return 304 and the route-specific file returns 200. The obsolete `chunk-DOTqkIfD.js` returns 404 and current homepage HTML does not reference it. This supports an old-document/build mismatch and a normal reload; it does not causally connect that reported error to the separate compiler-publication race.

Raw paths, distributions and counts are in [STABLE-PUBLICATION.json](./STABLE-PUBLICATION.json); copies are under ignored `results/stable-publication-2026-09-22/`. No commit, push or goal closure occurred. The next work should address a remaining measured interaction cost or byte overrun, rather than repeating the resolved missing-chunk diagnosis.
