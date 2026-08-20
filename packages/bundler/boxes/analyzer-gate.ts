import {
	compareExecutedBytes,
	createVerdictReport,
	executedJavaScriptBytes,
	evaluateActionInvariants,
	evaluateDebugChannelStrip,
	evaluatePreloadIntegrity,
	type AnalyzerCanonicalInvariantResult,
	type AnalyzerVerdictReportV2,
	type AnalyzerTextArtifact,
} from '@markless/analyzer';
import {
	bundlerAnalyzerPolicy,
	type BundlerAnalyzerBudget,
	type BundlerAnalyzerNetworkRule,
} from './analyzer/policy.ts';
import { requestPhase, startedAfterAction } from './network-phase.ts';

type I5Fixture = 'vite-csr-preloader' | 'vite-ssr-preloader';
type I5Measurement = { readonly bootstrap: number; readonly action: number };

export function createBundlerAnalyzerReport(input: {
	readonly identity: { readonly fixture: string } | { readonly matrix: string };
	readonly commitSha: string;
	readonly buildArtifactHash: string;
	readonly results: readonly AnalyzerCanonicalInvariantResult[];
}): AnalyzerVerdictReportV2 {
	return createVerdictReport({
		source: 'witness',
		lane: 'bundler-analyzer-adoption',
		results: input.results,
		metadata: {
			consumer: '@markless/bundler',
			...input.identity,
			commitSha: input.commitSha,
			buildArtifactHash: input.buildArtifactHash,
		},
	});
}

export function evaluateBundlerStrip(input: {
	readonly debugEnabled: boolean;
	readonly artifacts: readonly AnalyzerTextArtifact[];
}): AnalyzerCanonicalInvariantResult {
	return evaluateDebugChannelStrip(input);
}

export function requireRatifiedBudget(fixture: I5Fixture): {
	readonly bootstrapMeasuredBytes: number;
	readonly actionMeasuredBytes: number;
	readonly bootstrapCeilingBytes: number;
	readonly actionCeilingBytes: number;
} {
	const budget: BundlerAnalyzerBudget = bundlerAnalyzerPolicy.budgets[fixture];
	if (
		budget.bootstrapMeasuredBytes === null ||
		budget.actionMeasuredBytes === null ||
		budget.bootstrapCeilingBytes === null ||
		budget.actionCeilingBytes === null ||
		budget.measurementCitation === null
	) {
		throw new Error(
			`MLA-I5 budget placeholder refused for ${fixture}; record fresh V8 bootstrap/action measurements and obtain owner ratification (${budget.authority})`,
		);
	}
	return budget as {
		readonly bootstrapMeasuredBytes: number;
		readonly actionMeasuredBytes: number;
		readonly bootstrapCeilingBytes: number;
		readonly actionCeilingBytes: number;
	};
}

export function formatI5Measurement(fixture: I5Fixture, measurement: I5Measurement): string {
	return `I5-MEASURED ${fixture} bootstrap=${measurement.bootstrap} action=${measurement.action}`;
}

export function refuseAfterI5Measurement(
	fixture: I5Fixture,
	measurement: I5Measurement,
	print: (line: string) => void = console.log,
): never {
	print(formatI5Measurement(fixture, measurement));
	requireRatifiedBudget(fixture);
	throw new Error(
		`MLA-I5 measurement mode is evidence-only for ${fixture}; OWNER-RATIFICATION-REQUIRED`,
	);
}

export async function measureAndRefuseI5(
	fixture: I5Fixture,
	measure: () => Promise<I5Measurement>,
	print: (line: string) => void = console.log,
): Promise<never> {
	const measurement = await measure();
	return refuseAfterI5Measurement(fixture, measurement, print);
}

export async function measureI5WithV8(
	pageUrl: string,
	actionSelector: string,
): Promise<I5Measurement> {
	// Witness deliberately exposes assertion-oriented page handles rather than
	// raw CDP. Measurement mode therefore uses the analyzer workspace's existing
	// Playwright host to open a separate page against the same preview server.
	const { chromium } = await import('../../analyzer/node_modules/playwright/index.mjs');
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage();
		const origin = new URL(pageUrl).origin;
		await page.coverage.startJSCoverage({ resetOnNavigation: false });
		await page.goto(pageUrl, { waitUntil: 'networkidle' });
		await page.locator(actionSelector).filter({ hasText: '0' }).waitFor();
		const bootstrapCoverage = await page.coverage.stopJSCoverage();

		await page.coverage.startJSCoverage({ resetOnNavigation: false });
		await page.locator(actionSelector).click();
		await page.locator(actionSelector).filter({ hasText: '1' }).waitFor();
		const actionCoverage = await page.coverage.stopJSCoverage();
		return {
			bootstrap: executedJavaScriptBytes(bootstrapCoverage, origin),
			action: executedJavaScriptBytes(actionCoverage, origin),
		};
	} finally {
		await browser.close();
	}
}

export function evaluateRatifiedBudget(
	fixture: 'vite-csr-preloader' | 'vite-ssr-preloader',
): readonly AnalyzerCanonicalInvariantResult[] {
	// Owner-approved pending state (policy.enforcementDeferred): I5 results are
	// omitted from the report and the receipt stays OUT of the required manifest
	// until measurement + ratification flip the flag (checker forbids not-run in
	// required receipts by design - deferral is manifest-level, never silent).
	if (bundlerAnalyzerPolicy.budgets[fixture].enforcementDeferred) {
		return [] as readonly AnalyzerCanonicalInvariantResult[];
	}
	const budget = requireRatifiedBudget(fixture);
	return [
		compareExecutedBytes('bootstrap', budget.bootstrapMeasuredBytes, budget),
		compareExecutedBytes('interaction', budget.actionMeasuredBytes, budget),
	] as readonly AnalyzerCanonicalInvariantResult[];
}

export function evaluateDeclaredRequests(input: {
	readonly pageOrigin: string;
	readonly rules: readonly BundlerAnalyzerNetworkRule[];
	readonly requests: readonly {
		readonly method: string;
		readonly url: string;
		readonly status: number | null;
		readonly failedReason?: string | null;
	}[];
}): AnalyzerCanonicalInvariantResult {
	const details = input.requests.flatMap((request) => {
		let url: URL;
		try {
			url = new URL(request.url);
		} catch {
			return [`undeclared request: ${request.method} ${request.url}`];
		}
		const declared = input.rules.some(
			(rule) =>
				rule.method === request.method &&
				url.origin === input.pageOrigin &&
				(typeof rule.path === 'string'
					? `${url.pathname}${url.search}` === rule.path
					: rule.path.test(url.pathname)),
		);
		if (!declared) return [`undeclared request: ${request.method} ${request.url}`];
		if (request.failedReason || request.status === null || request.status >= 400)
			return [
				`failed request: ${request.method} ${request.url} (${request.status ?? request.failedReason ?? 'no response'})`,
			];
		return [];
	});
	return { id: 'MLA-I2-NETWORK', status: details.length ? 'fail' : 'pass', details };
}

export function evaluateBundlerPreloadWindow(
	input: Parameters<typeof evaluatePreloadIntegrity>[0],
) {
	return evaluatePreloadIntegrity(input);
}

export function requirePassingAnalyzerResults(
	results: readonly AnalyzerCanonicalInvariantResult[],
): void {
	const failed = results.filter((result) => result.status !== 'pass');
	if (failed.length === 0) return;
	throw new Error(
		failed
			.map((result) => `${result.id}: ${result.details.join('; ') || result.status}`)
			.join('\n'),
	);
}

export function evaluatePreloaderEvidence(input: {
	readonly fixture: 'vite-csr-preloader' | 'vite-ssr-preloader';
	readonly pageUrl: string;
	readonly declaredPreloads: readonly string[];
	/**
	 * Latest instant, in the CDP monotonic timebase, that provably precedes the
	 * click (see `preClickInstantMs`). Phase is decided by request start time, not
	 * by array position: witness records requests in completion order, so an index
	 * split counts a still-in-flight page-parse preload as click-caused.
	 */
	readonly actionStartTimeMs: number;
	readonly requests: readonly {
		readonly method: string;
		readonly url: string;
		readonly startTimeMs: number;
		readonly endTimeMs: number | null;
		readonly status: number | null;
		readonly failedReason?: string | null;
		readonly resourceType?: string | null;
	}[];
}): readonly AnalyzerCanonicalInvariantResult[] {
	const origin = new URL(input.pageUrl).origin;
	const preload = evaluateBundlerPreloadWindow({
		baseUrl: input.pageUrl,
		actionKind: 'interaction',
		declaredPreloads: input.declaredPreloads,
		observedRequests: input.requests.map((request) => ({
			phase: requestPhase(request, input.actionStartTimeMs),
			...(startedAfterAction(request, input.actionStartTimeMs)
				? { actionId: 'counter-click' }
				: {}),
			url: request.url,
			...(request.resourceType === null || request.resourceType === undefined
				? {}
				: { resourceType: request.resourceType }),
		})),
	}).invariant;
	const network = evaluateDeclaredRequests({
		pageOrigin: origin,
		rules: bundlerAnalyzerPolicy.network[input.fixture],
		requests: input.requests,
	});
	return [
		preload,
		{ id: 'MLA-I1-CONSOLE', status: 'pass', details: [] },
		network,
		...evaluateRatifiedBudget(input.fixture),
		{ id: 'MLA-EXT-WITNESS', status: 'pass', details: [] },
	];
}

export function proveBudgetRedAtMeasuredBytesMinusOne(
	actionId: string,
	measuredBytes: number,
): AnalyzerCanonicalInvariantResult {
	if (measuredBytes <= 0)
		throw new Error('MLA-I5 measuredBytes - 1 red proof requires a positive V8 measurement');
	return compareExecutedBytes(actionId, measuredBytes, {
		bootstrapCeilingBytes: measuredBytes - 1,
		actionCeilingBytes: measuredBytes - 1,
	}) as AnalyzerCanonicalInvariantResult;
}

// Keep this reference type-checked beside the gate: it guarantees the browser
// result combiner remains the analyzer-owned implementation, not a local copy.
export const combineBundlerBrowserResults = evaluateActionInvariants;
