import { createBenchmarkVerdictReport } from '@markless/analyzer';

export function evaluateComputedChainAnalyzerPolicy({
	baseUrl,
	declaredRequests,
	observedRequests,
	gateFailures = [],
}) {
	return createBenchmarkVerdictReport({
		source: 'markless-bench-computed-chain',
		benchmark: 'computed-chain',
		results: [
			evaluateExactBuildRequestSet({ baseUrl, declaredRequests, observedRequests }),
			{
				id: 'MLA-EXT-CHAIN-GATES',
				status: gateFailures.length === 0 ? 'pass' : 'fail',
				details: gateFailures,
			},
		],
		metadata: { declaredRequests },
	});
}

export function evaluateExactBuildRequestSet({ baseUrl, declaredRequests, observedRequests }) {
	const allowed = new Set(declaredRequests.map((request) => requestKey(
		request.method,
		new URL(request.path, baseUrl).href,
		request.resourceType,
	)));
	const details = observedRequests.flatMap((request) => {
		if (request.phase === 'timed') {
			return [`request entered a measured propagation window: ${request.method} ${normalizedUrl(request.url)}`];
		}
		if (!allowed.has(requestKey(request.method, request.url, request.resourceType))) {
			return [`undeclared ${request.method} ${request.resourceType} request: ${normalizedUrl(request.url)}`];
		}
		return request.status >= 200 && request.status < 400
			? []
			: [`allowed request did not succeed: ${request.method} ${normalizedUrl(request.url)} (${request.status ?? 'no response'})`];
	});
	return { id: 'MLA-I2-NETWORK', status: details.length === 0 ? 'pass' : 'fail', details };
}

function requestKey(method, url, resourceType) {
	return `${method.toUpperCase()} ${normalizedUrl(url)} ${resourceType}`;
}

function normalizedUrl(url) {
	const parsed = new URL(url, 'http://invalid.local');
	return `${parsed.pathname}${parsed.search}`;
}
