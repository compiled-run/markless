# Website cold-start interaction

Workflow guidance: .ruler/skills/markless-implementation/implementation.md, .ruler/skills/markless-implementation/performance.md, .ruler/skills/markless-implementation/bundler.md

User outcome: triage and minimize the website's interaction delay immediately after dev-server boot, preserving small initial browser JavaScript and interaction-triggered chunks. Warm interactions already feel fast.

Initial owned scope: scripts/experiments/cold-start/** and /tmp/markless-cold-start/** for measurements. Choose and record the bounded production fix scope from measured evidence before editing it. Preserve existing website/framework changes and other running servers. No eager browser hydration, app-wide preload, dependency installation, push or merge.

Measure first page availability, visible-control-to-effect latency, browser script requests/bytes before and after interaction, server transform work and a CPU profile. Use a fresh isolated server per cold sample, the same retained dependency cache, fresh Chromium contexts and repeated warm actions. Distinguish first optimizer population from ordinary cold server restarts. Three cold samples per retained baseline/fix; compare medians and ranges. Treat reductions under 20% or overlapping large noise as inconclusive; keep a fix only with repeatable improvement and correctness preserved. Target sub-second first interaction after controls become visible; if unavoidable compile cost remains, report it explicitly rather than moving it into initial browser load or hiding it in readiness.

Verify: failing focused regression before the fix; narrow tests then relevant bundler/router Witness boxes and website consumer checks; pnpm run typecheck; website Markless-aware typecheck; website tests; initial browser JS and lazy handler boundary checks; repeat cold/warm measurements; HMR/invalidation checks if affected. Record environmental load and any incomplete checks. Stop only task-owned servers.

Production scope: packages/compiler/src/passes/link/module-link.ts and packages/compiler/test/module-link.test.ts; bundler/link-driver.ts only if import metadata needs explicit preservation. Additional workflow guidance: .ruler/skills/markless-implementation/compiler.md.

Hypothesis: the barrel walk ignores imported names and forces unrelated UI families into cold server/client compilation. First measured homepage click was 5.72 seconds versus 10–23 milliseconds warm; sidebar/client transform took 5.13 seconds and unrelated calendar, crop, menu, and colorpicker transforms were recorded. Restrict explicitly named/default imports at the barrel entry; preserve conservative namespace/unknown and star-reexport behavior. Falsification: unrelated-family transforms or first-click cost remain comparable, or linked components/shared definitions cease to work. No browser preloading change.
