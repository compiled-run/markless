import { createVerdictReport } from '@markless/analyzer';
import { evaluateExactBuildRequestSet } from '../signal-favoring/analyzer-policy.mjs';

export function evaluateTodoMvcAnalyzerPolicy({ baseUrl, declaredRequests, observedRequests, gateFailures = [] }) {
	return createVerdictReport({
		source: 'octane-bench-todomvc', lane: 'todomvc',
		results: [
			evaluateExactBuildRequestSet({ baseUrl, declaredRequests, observedRequests }),
			{ id: 'MLA-EXT-TODOMVC-GATES', status: gateFailures.length === 0 ? 'pass' : 'fail', details: gateFailures },
		],
		metadata: { declaredRequests },
	});
}
