import { createVerdictReport, evaluatePreloadIntegrity } from '@markless/analyzer';

export function evaluateNewsAnalyzerPolicy({ baseUrl, declaredRequests, observedRequests, gateFailures = [] }) {
	const actionObservations = observedRequests
		.filter((request) => request.phase === 'action')
		.map((request) => ({
			phase: 'action',
			actionId: 'theme-toggle',
			url: request.url,
			resourceType: request.resourceType,
		}));
	const preloadUrls = declaredRequests
		.filter((request) => request.kind === 'modulepreload')
		.map((request) => new URL(request.path, baseUrl).href);
	const preloadIntegrity = evaluatePreloadIntegrity({
		baseUrl,
		actionKind: 'interaction',
		declaredPreloads: preloadUrls,
		observedRequests: actionObservations,
	});
	const network = evaluateExactRequestSet({ baseUrl, declaredRequests, observedRequests });
	const gates = {
		id: 'MLA-EXT-NEWS-GATES',
		status: gateFailures.length === 0 ? 'pass' : 'fail',
		details: gateFailures,
	};
	return createVerdictReport({
		source: 'octane-bench-news',
		lane: 'news',
		results: [preloadIntegrity.invariant, network, gates],
		metadata: { declaredRequests },
	});
}

export function evaluateExactRequestSet({ baseUrl, declaredRequests, observedRequests }) {
	const allowed = new Set(
		declaredRequests.map((request) => requestKey(request.method, new URL(request.path, baseUrl).href, request.resourceType)),
	);
	const details = observedRequests.flatMap((request) => {
		const key = requestKey(request.method, request.url, request.resourceType);
		if (!allowed.has(key)) {
			return [`undeclared ${request.method} ${request.resourceType} request: ${normalizedUrl(request.url)}`];
		}
		return request.status >= 200 && request.status < 400
			? []
			: [`allowed request did not succeed: ${request.method} ${normalizedUrl(request.url)} (${request.status ?? 'no response'})`];
	});
	return {
		id: 'MLA-I2-NETWORK',
		status: details.length === 0 ? 'pass' : 'fail',
		details,
	};
}

export function declaredRequestSetFromDocument(baseUrl, links) {
	return [
		{ method: 'GET', path: '/', resourceType: 'document', kind: 'document' },
		...links.modulepreloads.map((href) => ({
			method: 'GET',
			path: pathAndSearch(href, baseUrl),
			resourceType: 'script',
			kind: 'modulepreload',
		})),
		...links.stylesheets.map((href) => ({
			method: 'GET',
			path: pathAndSearch(href, baseUrl),
			resourceType: 'stylesheet',
			kind: 'css',
		})),
		...(links.entryScripts ?? []).map((href) => ({
			method: 'GET',
			path: pathAndSearch(href, baseUrl),
			resourceType: 'script',
			kind: 'entry-script',
		})),
	];
}

function requestKey(method, url, resourceType) {
	return `${method.toUpperCase()} ${normalizedUrl(url)} ${resourceType}`;
}

function normalizedUrl(url) {
	const parsed = new URL(url, 'http://invalid.local');
	return `${parsed.pathname}${parsed.search}`;
}

function pathAndSearch(url, baseUrl) {
	const parsed = new URL(url, baseUrl);
	return `${parsed.pathname}${parsed.search}`;
}
