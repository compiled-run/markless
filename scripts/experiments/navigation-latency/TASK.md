# Navigation latency

Workflow guidance: .ruler/skills/markless-implementation/implementation.md, .ruler/skills/markless-implementation/performance.md, .ruler/skills/markless-implementation/bundler.md

Direct request: reduce the approximately 700 ms dev sidebar navigation delay while retaining minimal initial JavaScript and interaction-loaded chunks. Preserve prior navigation and Select fixes and unrelated website work.

Initial scope: scripts/experiments/navigation-latency/**. Expand only to the measured owning runtime/compiler path and focused tests after a reproducible measurement.

Measured scope: packages/router/src/vite/mdx.ts and packages/router/test/vite/mdx.test.ts, plus existing router/website browser witnesses if needed. First navigation requested 157 resources / 9.8 MB in dev. MDX navigation currently eagerly imports SSR component modules and then separately imports linked render data. Hypothesis: emitting only the navigation surface removes the redundant SSR dependency closure and reduces first-visit latency without startup requests. Falsified if repeated matched measurements do not improve by the threshold below or route rendering/interactions regress.

Measurement correction: the early resource lists hit the browser's resource timing buffer limit. Those counts/bytes were lower bounds. The probe now sets a 10,000-entry buffer before page load; the complete repeated baseline contains 269 requests and 12.2 MiB. Timing marks were not affected.

Expanded owning scope: packages/router/src/vite/entries/resume-entry.ts. Navigation-only emission removed about 1 MB but did not improve timings. The departing MDX page resumes through the ordinary SSR module, which retains the majority of the redundant dependency closure. Emit a dedicated MDX resume module via the same query already used for TSRX, retaining lazy render data and symbol loading. Same correctness and performance gates apply.

Render waterfall scope: packages/bundler/src/transform.ts, packages/web/src/prerender/evaluator.ts, packages/bundler/test/render-initializers.test.ts. The complete resource trace shows sequential initializer/derive symbol requests during destination rendering. Link the compiler-selected local initializers into their render-data modules and use them for fresh renders without live graphs or bound captures; preserve the existing loader for those scoped cases. Event handlers remain lazy. Falsified if startup loads increase, scoped rendering regressions appear, or repeated latency does not clear the stated threshold.

Production verification: packages/router/boxes/router-mdx-client.box.ts checks direct MDX resume and MDX → TSRX → MDX navigation and interactions against built output. The existing preload-strategy box is also run against both the candidate and the pre-optimization tree; its outstanding failure prevents landing.

Measurement protocol: isolated local Vite dev server, installed Chromium, 1440×1000 viewport, no artificial CPU/network throttling. Record first navigation separately; warm both destination routes, then eight alternating UI route transitions. Measure click event to route commit and next paint, route-module arrival, HTML construction and mount. Report medians and min/max by route. A retained improvement must exceed both 20% and 30 ms in repeated runs without adding startup route-module requests. Warm-navigation target: below 100 ms median where practical; cold costs reported separately.

Correctness: target h1, preserved document shell, one document request, no browser errors, active sidebar destination, continued interactions. Verify focused failing regression before changing behavior; pnpm run typecheck; relevant runtime/compiler tests; website Witness and consuming website tests/typecheck, preserving and reporting existing failures.
