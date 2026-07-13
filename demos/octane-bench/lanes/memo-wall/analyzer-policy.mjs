import { createVerdictReport } from '@markless/analyzer';
import { evaluateExactBuildRequestSet } from '../signal-favoring/analyzer-policy.mjs';

export function evaluateMemoWallAnalyzerPolicy({
	baseUrl,
	declaredRequests,
	observedRequests,
	gateFailures = [],
}) {
	return createVerdictReport({
		source: 'octane-bench-memo-wall',
		lane: 'memo-wall',
		results: [
			evaluateExactBuildRequestSet({ baseUrl, declaredRequests, observedRequests }),
			{
				id: 'MLA-EXT-MEMO-GATES',
				status: gateFailures.length === 0 ? 'pass' : 'fail',
				details: gateFailures,
			},
		],
		metadata: { declaredRequests },
	});
}
