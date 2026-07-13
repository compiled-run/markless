import { createVerdictReport } from '@markless/analyzer';
import { evaluateExactBuildRequestSet } from '../signal-favoring/analyzer-policy.mjs';

export function evaluateDbmonAnalyzerPolicy({ baseUrl, declaredRequests, observedRequests, gateFailures = [] }) {
	return createVerdictReport({
		source: 'octane-bench-dbmon',
		lane: 'dbmon',
		results: [
			evaluateExactBuildRequestSet({ baseUrl, declaredRequests, observedRequests }),
			{ id: 'MLA-EXT-DBMON-GATES', status: gateFailures.length === 0 ? 'pass' : 'fail', details: gateFailures },
		],
		metadata: { declaredRequests },
	});
}
