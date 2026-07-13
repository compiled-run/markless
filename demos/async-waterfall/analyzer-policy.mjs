import { createBenchmarkVerdictReport, evaluatePreloadIntegrity } from '@markless/analyzer';
import { declaredRequestSetFromDocument, evaluateExactRequestSet } from '../news/analyzer-policy.mjs';

export { declaredRequestSetFromDocument, evaluateExactRequestSet };

export function evaluateAsyncWaterfallAnalyzerPolicy({ baseUrl, declaredRequests, observedRequests, gateFailures = [] }) {
	const actionObservations = observedRequests
		.filter((request) => request.phase === 'action')
		.map((request) => ({
			phase: 'action',
			actionId: 'first-root-state-click',
			url: request.url,
			resourceType: request.resourceType,
		}));
	const declaredPreloads = declaredRequests
		.filter((request) => request.kind === 'modulepreload')
		.map((request) => new URL(request.path, baseUrl).href);
	const preloadIntegrity = evaluatePreloadIntegrity({
		baseUrl,
		actionKind: 'interaction',
		declaredPreloads,
		observedRequests: actionObservations,
	});
	const network = evaluateExactRequestSet({ baseUrl, declaredRequests, observedRequests });
	const gates = {
		id: 'MLA-EXT-ASYNC-WATERFALL-GATES',
		status: gateFailures.length === 0 ? 'pass' : 'fail',
		details: gateFailures,
	};
	return createBenchmarkVerdictReport({
		source: 'markless-bench-async-waterfall',
		benchmark: 'async-waterfall',
		results: [preloadIntegrity.invariant, network, gates],
		metadata: { declaredRequests },
	});
}
