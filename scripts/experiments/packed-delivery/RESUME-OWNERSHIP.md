# Resume ownership and callback dependencies

The compiler now includes state reached through a bound callback in its interaction group, even when that state has no DOM binding. Previously, a child button invoking `onPress={() => hidden++}` produced an empty `graphNodeIds` list. The corrected list contains `state:hidden`. This is a correctness prerequisite for reducing resume work; it is not a measured browser speedup.

The `trigger-groups` pass now consumes the existing `captureAnalysis` artifact and follows the requested bound row. Forwarded callbacks resolve against the enclosing component instance, keeping sibling callbacks separate. The focused tests cover alternate component, prop, state and element names; input versus click events; sibling instances; forwarding; and writes without a read. Four original regression cases failed before the change. The additional forwarded write-only sibling case exposed another omission and passed after callback writes were included.

The experimental MDX planner has stronger record checks for symbols, widget definitions, handles, locator ownership, duplicate state records, and seed aliases. Fifteen cases failed before these guards. Seed aliases describe how a prop read is redirected; they do not require a duplicate physical state cell. These checks remain experimental and do not prove the compiled symbol/capture dependency closure.

On the accepted accordion page, the selected `m3:` scope contains 68 cells, 153 computed records, 16 shared seeds, 34 shared definitions, 81 events and 73 handles. The planner refuses it because 19 cells carry unknown values used for callback slots. Their values are executable routing information, so ignoring arbitrary serialized values is insufficient to prove this boundary independent. No production filter or grouping integration was enabled.

## Verification

- Compiler and relevant bundler prerender suites: 2,106 passed, two expected failures, 262 files.
- Experimental tests: 43 passed in four files.
- Root and docs Markless-aware typechecks passed.
- Docs tests: 64 passed. The initial watch-mode attempt failed with an open-file limit; explicit `--run` passed, with a teardown warning that did not fail the command.
- Docs package doctor and production build passed.
- The rebuilt client output exactly matches accepted GSbudh: 63 JavaScript files, 19,274,342 bytes, identical filenames and SHA-256 hashes. Five framework requests remain the previously measured route behavior. No new latency comparison is claimed for identical client code.
- Diff whitespace check passed. Production changes are confined to the compiler pass, its input wiring/declaration and focused tests.

The six previously recorded fixture budget failures remain unresolved. No new commit, push or goal closure occurred.

## Remaining implementation

The next proof needs linked compiler capture information and the rendered callback-slot bindings. Payload ID prefixes alone cannot supply it. Preserve page/container/request shared state and refuse unresolved dependencies. After that proof, integrate incremental activation with the current staged runtime, including MDX render-data forwarding, ancestor event propagation, live scalar-state handoff, retries, disposal and navigation. A later control must wake its own records without replacing already live state or registering duplicate subscriptions.

Measure the integrated implementation on the real docs only after first, repeat, sibling, keyboard and navigation correctness passes. Keep the established ten-visit cold comparison and `max(10 ms, 10% of before median, 2 × larger MAD)` threshold. The earlier unchecked scope filter's 27.45 ms CPU saving remains diagnostic evidence, not an achieved shipping result.

Machine-readable evidence and source hashes are in [RESUME-OWNERSHIP.json](RESUME-OWNERSHIP.json); raw receipts are in [results/resume-ownership-2026-09-22](results/resume-ownership-2026-09-22/). Reproduce the real payload refusal with `node --experimental-strip-types scripts/experiments/packed-delivery/inspect-mdx-resume-ownership.mjs <saved-html> <scope-prefix> <report.json>`.
