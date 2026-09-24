# Docs CPU investigation

Three fresh Chrome contexts per scenario at 4× CPU, HTTP cache disabled and service workers blocked. The separate sampling mode passed 15 visits and 48 actions. It requests a 100-microsecond interval; observed intervals vary. Precise coverage is disabled in this mode.

The counter first-action profiles include the recursive element census in web/resume-census.ts and payload parsing in serializer/protocol-client.ts. Accordion first-action profiles also include the comment walk used to materialize async-boundary anchors. The sampled repeat paths include subscription flushing and instance-prefix routing. These observations identify remaining work; they do not establish that any one operation dominates input latency.

Most samples in the complete windows are idle, unassigned program execution, browser built-ins, or browser-automation work. Those cannot be charged to a framework function. The sampling windows include control lookup, click dispatch, correctness assertions and two animation frames. Source snippets in the companion JSON identify the observed emitted functions, but its top-function samples are not an exhaustive call inventory, exact function timing or a claim that a missing function never executed. Further attribution of module evaluation versus browser work needs a timeline trace around the actual input.

The precise-coverage observations remain separate: module initializer counts are not inferred from these samples. The paired unprofiled experiment in GRAPH-DEMAND.md supplies timing evidence and led to rejection of the subscription index.

Reproduce: DOCS_COLD_OUTPUT=<saved-output> DOCS_CPU_PROFILE=1 DOCS_EXECUTION_SAMPLES=3 DOCS_CPU_RATE=4 node scripts/experiments/packed-delivery/execution-probe.mjs

A separate timeline follow-up passed five scenarios and 16 actions at /private/tmp/markless-docs-execution-Hb6vaU/results.json. TIMELINE.json retains captured-click/expected-mutation windows and module-evaluation events. Repeat interactions still contain module-evaluation events. Source inspection then found the concrete same-pack import rewrite documented in IMPLEMENTATION.md; a direct deferred initializer call is under validation. This is a mechanism finding, not a speed claim from one trace.
