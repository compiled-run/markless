import { createBenchmarkVerdictReport } from '@markless/analyzer';
import { evaluateExactBuildRequestSet } from '../computed-chain/analyzer-policy.mjs';

export function evaluateDbmonAnalyzerPolicy({ baseUrl, declaredRequests, observedRequests, gateFailures = [] }) {
	return createBenchmarkVerdictReport({
		source: 'markless-bench-dbmon',
		benchmark: 'dbmon',
		results: [
			evaluateExactBuildRequestSet({ baseUrl, declaredRequests, observedRequests }),
			{ id: 'MLA-EXT-DBMON-GATES', status: gateFailures.length === 0 ? 'pass' : 'fail', details: gateFailures },
		],
		metadata: { declaredRequests },
	});
}
