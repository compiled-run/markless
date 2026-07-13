import { createBenchmarkVerdictReport } from '@markless/analyzer';
import { evaluateExactBuildRequestSet } from '../computed-chain/analyzer-policy.mjs';

export function evaluateMemoWallAnalyzerPolicy({
	baseUrl,
	declaredRequests,
	observedRequests,
	gateFailures = [],
}) {
	return createBenchmarkVerdictReport({
		source: 'markless-bench-memo-wall',
		benchmark: 'memo-wall',
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
