import { createBenchmarkVerdictReport } from '@markless/analyzer';
import { evaluateExactBuildRequestSet } from '../computed-chain/analyzer-policy.mjs';

export function evaluateTodoMvcAnalyzerPolicy({ baseUrl, declaredRequests, observedRequests, gateFailures = [] }) {
	return createBenchmarkVerdictReport({
		source: 'markless-bench-todomvc', benchmark: 'todomvc',
		results: [
			evaluateExactBuildRequestSet({ baseUrl, declaredRequests, observedRequests }),
			{ id: 'MLA-EXT-TODOMVC-GATES', status: gateFailures.length === 0 ? 'pass' : 'fail', details: gateFailures },
		],
		metadata: { declaredRequests },
	});
}
