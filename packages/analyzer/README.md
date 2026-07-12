# `@markless/analyzer`

`@markless/analyzer` is the browser-lane invariant checker for Markless
applications. It turns application-owned route/action policy and browser evidence
into MLA invariant results and versioned verdict reports. The package root is
runtime-agnostic; the optional `@markless/analyzer/playwright` entry point gathers
evidence from a Playwright `Page`.

Consumers should run analyzer checks as merge-blocking application or harness
gates, own their matrices, policies, budgets, and persisted receipts, and retain
stronger package-specific assertions: add analyzer evidence beside existing
bespoke proof, establish parity, then remove only duplicated mechanics — never
swap a stronger assertion for a weaker generic verdict.

## Browser invariants

The browser lane currently emits legacy `BQA-*` aliases, which
`normalizeInvariantId` and `createVerdictReport` canonicalize to the following MLA
IDs. New persisted verdicts use the canonical IDs.

- `MLA-I1-CONSOLE` checks the captured `console.error` and uncaught `pageerror`
  entries for an action window. A failure means the page reported at least one
  browser error.

- `MLA-I2-NETWORK` checks request records produced by `classifyRequest`, plus
  network-liveness errors. Evidence is evaluated against the consumer's known
  document paths and phase-specific API contracts; a failure means a request was
  undeclared, unsuccessful, malformed, or leaked after the measurement window.

- `MLA-I3-BOUNDARY-MISSING`, `MLA-I3-PENDING-TIMEOUT`, and `MLA-I3-REJECTED`
  check debug-channel `BoundarySnapshot` values against the action's
  `PendingPolicy` and expected rejected-boundary list. They respectively mean a
  graph read or snapshot is missing, a boundary exceeded the owning liveness
  policy, or an unexpected rejection occurred. The default liveness deadline is
  owned by `QA_LIVENESS_DEADLINE_MS` in `src/invariants.ts`.

- `MLA-I4-WIRING-MISSING` and `MLA-I4-UNCLASSIFIED` inspect visible semantic
  interaction candidates and the debug channel's interaction explanations. A
  failure means a required event has no valid framework registration (including
  router delegation for Markless links), or a focusable/ARIA candidate has no
  recognized semantics or matrix-declared event. Findings tagged by a
  consumer-owned known audit are reported without making that result blocking.

- `MLA-I5-BOOTSTRAP-BUDGET` and `MLA-I5-ACTION-BUDGET` compare same-origin V8
  executed-JavaScript bytes with consumer-supplied `AnalyzerBudgets`. A failure
  means the measured bootstrap or action exceeded its supplied ceiling; the
  package does not own application budget values.

## MLA seam stages

### `MLA-S1-PRELOAD-INTEGRITY`

`evaluatePreloadIntegrity` consumes declared module-preload URLs and phased
bootstrap, navigation, and action request observations. Interactions fail when a
module is fetched in the action window instead of being loaded beforehand;
navigations allow destination loads until the declared settlement point and fail
later module loads. Declared but never loaded preloads are returned as warnings,
not invariant failures.

### `MLA-S2-PAYLOAD-WIRING`

`parsePayloadEventClaims` reads event claims from served `markless/view` data and
initial or streamed arm records. `reconcilePayloadWiring` compares those claims
with runtime debug-channel registrations. A failure means the payload promised an
event registration that the runtime did not confirm. Unclaimed registrations are
returned separately as `runtimeOnly`; runtime-generated CSR, callback-prop, and
router registrations are not treated as failures.

### `MLA-S3-LOCATOR-RESOLUTION`

`locatorPlansFromView` derives plans for the locator kinds represented by a served
view, and `evaluateLocatorResolution` walks caller-provided DOM roots through a
`WalkableDomAdapter`. Every plan must resolve to exactly one node with the expected
shape. Zero or ambiguous matches fail the invariant; kinds that cannot be expanded
from the served payload are listed under `coverage.skipped` rather than silently
claimed as covered.

### `MLA-S4-STRIP-GUARANTEE`

`evaluateDebugChannelStrip` scans served HTML and JavaScript text artifacts for
`DEBUG_CHANNEL_SENTINELS`. An unflagged build fails if any sentinel remains. A
flagged build is the positive control and fails if none is present. Import the
sentinel set from `@markless/analyzer`; do not copy its protocol strings into a
consumer.

## Coverage lane

`executedJavaScriptBytes` consumes V8 coverage entries, merges overlapping
positive ranges, subtracts nested zero-count ranges, and counts UTF-8 bytes for
same-origin scripts. Missing source text for a counted same-origin entry is an
error. `collectExecutedJavaScriptBytes` and `measurePageWindow` provide the
Playwright integration. Consumers supply the bootstrap and action ceilings passed
to `compareExecutedBytes` or `evaluateActionInvariants`.

## Route/action matrix

`validateMatrixDocument` validates the application-owned `RouteActionMatrix`,
including fixture URLs, action locators and operations, API contracts, setup
dependencies, pending/rejection policy, navigation intent, and reset safety.
`assertMatrixFileSetEquality` can additionally prove that matrix route files equal
the consumer's discovered route files. Validate persisted JSON against
[`route-action-matrix.schema.json`](./route-action-matrix.schema.json); import the
TypeScript contracts and validator rather than repeating schema facts in a
harness.

## Locator and payload collection

The Playwright helpers `collectLocatorResolution` and `collectPayloadWiring` adapt
the live document to the portable S3 and S2 evaluators. They inspect each
`data-async-container`, its owned payload scripts, and the Markless debug-channel
subset required by the analyzer. A missing or incompatible channel is a collection
error, not a passing invariant.

## Playwright driver

Install Playwright when using `@markless/analyzer/playwright`. `ConsoleLedger` and
`RequestLedger` retain console and classified request evidence;
`waitForBoundaryLiveness`, `inventoryCandidates`, and
`collectCandidateExpectations` gather browser-lane evidence;
`performMatrixAction` executes a validated matrix action; and `measurePageWindow`
combines the action window, liveness, network quieting, candidate inventory, V8
coverage, and S1 evaluation. `collectServedBuildArtifacts` supplies text artifacts
for S4. Fault helpers are also exported for negative-control tests.

## Witness verdicts and reports

`createWitnessVerdict` converts a Witness box outcome into
`MLA-EXT-WITNESS`. Combine it with browser and seam results through
`createVerdictReport` or `appendInvariantResult`. `validateVerdictReport` validates
the current report shape, while `readVerdictReport` also upgrades legacy browser-QA
reports and canonicalizes accepted `BQA-*` aliases. Report versions and accepted
invariant IDs are owned by `src/contracts.ts` and `src/verdicts.ts`.

## Minimal integration

This example assumes the caller already opened a debug-enabled application page.
It collects two seam checks, verifies the strip positive control, integrates a
Witness outcome, and creates a canonical verdict.

```ts
import {
	createVerdictReport,
	createWitnessVerdict,
	evaluateDebugChannelStrip,
} from '@markless/analyzer';
import {
	collectLocatorResolution,
	collectPayloadWiring,
	collectServedBuildArtifacts,
} from '@markless/analyzer/playwright';
import type { Page } from 'playwright';

export async function analyze(page: Page) {
	const [payload, locators, artifacts] = await Promise.all([
		collectPayloadWiring(page),
		collectLocatorResolution(page),
		collectServedBuildArtifacts(page),
	]);
	const strip = evaluateDebugChannelStrip({ debugEnabled: true, artifacts });
	const witness = createWitnessVerdict({
		name: 'application-browser-lane',
		tags: ['browser'],
		passed: true,
		receiptPath: 'artifacts/application-browser-lane.json',
	});

	return createVerdictReport({
		source: 'application',
		lane: 'browser-invariants',
		results: [payload.invariant, locators.invariant, strip, witness],
	});
}
```
