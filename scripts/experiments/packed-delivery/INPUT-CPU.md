# CPU work inside actual accordion input

Workflow guidance: .ruler/skills/markless-implementation/implementation.md, .ruler/skills/markless-implementation/performance.md.

The unchanged production docs were profiled in three fresh Chrome 153.0.8010.53 contexts, at 4x CPU, with HTTP cache disabled and service workers blocked. Nine trusted accordion actions pass. V8 samples and pointer/click/expected-mutation marks now share one trace clock. The analysis separates pointer activity before the click from click-to-mutation and excludes the surrounding automation window.

This improves attribution over CPU-PROFILE.md, but does not eliminate automation that runs while the framework awaits asynchronous work. Unassigned `(program)`, idle, garbage collection and anonymous automation frames remain separate. A missing sample does not prove that a function never ran, and these profiled visits cannot establish a latency improvement.

## Findings

| Observed work | Three second-click samples |
| --- | ---: |
| Generated Vite CSS preload helper, inclusive sampled time | 5.24 / 6.72 / 6.45 ms |
| Registering widget definitions into their graph registry, inclusive sampled time | 6.50 / 2.84 / 3.78 ms |

Source positions identify the first path as the helper that reads the CSP nonce and prepares CSS dependencies. An inspected parent chain reaches it through the generated MDX component `loadSymbol` import. The second path is `marklessNoteGraphWidgetRoots`, called by `marklessInstanceScopedGraph`; it walks shared definitions and re-registers their root/projection paths. Inclusive values contain descendant samples and must not be added to descendant timings.

The first click also contains 40.80–51.56 ms of main-thread `V8.CompileCode` intervals, versus 0.037–0.054 ms on the measured second clicks. These intervals are unioned by event name to avoid double counting nested instances. They cannot be charged entirely to framework code because the same window contains automation compilation. The first-click profiled window spans 197.92–213.32 ms; those are instrumentation timings, not the cold comparison result.

The sampled first-click source includes `readScript` in the MDX scalar attempt and payload deserialization in full resume. Inspection of `mdx-scalar.ts` confirms that it reads state and view before asking for a scalar plan, including when that plan is unsupported. This is a separate candidate for avoiding work before full resume; it is not changed by the module-promise experiment.

## Parsing and reproduction

Trace sample deltas include small negative values. The analyzer reconstructs absolute sample timestamps, sorts samples with their node identities, then clips each sample-to-next-sample interval to the input window. This follows the timestamp ordering used in [Chrome DevTools' CPU profile model](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/cpu_profile/CPUProfileDataModel.ts). It deliberately does not apply DevTools' missing-sample repair heuristics. Assertions require sample intervals to partition each complete input window, correct profile/thread identity, unique marks, valid emitted source positions and successful actions.

Run the existing execution probe with `DOCS_TIMELINE=1 DOCS_TIMELINE_CPU=1 DOCS_EXECUTION_SAMPLES=3 DOCS_EXECUTION_CASES=accordion DOCS_CPU_RATE=4`, then run `timeline-cpu.mjs <results.json> <summary.json>`. Input: `/private/tmp/markless-docs-execution-AoL2Yq/results.json`. Summary: `/private/tmp/markless-accordion-input-cpu.json`. Raw trace and summary copies are under ignored `results/input-cpu-2026-09-22/`.

The next bounded production experiment addresses the repeated generated MDX module imports. Widget-registry changes, scalar early rejection and a claim of globally minimal execution are outside this experiment.
