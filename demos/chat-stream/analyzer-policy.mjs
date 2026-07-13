import { createBenchmarkVerdictReport } from '@markless/analyzer';
import { evaluateExactBuildRequestSet } from '../computed-chain/analyzer-policy.mjs';

export function evaluateChatStreamAnalyzerPolicy({ baseUrl, declaredRequests, observedRequests, gateFailures = [] }) {
	return createBenchmarkVerdictReport({
		source: 'markless-bench-chat-stream', benchmark: 'chat-stream',
		results: [
			evaluateExactBuildRequestSet({ baseUrl, declaredRequests, observedRequests }),
			{ id: 'MLA-EXT-CHAT-GATES', status: gateFailures.length === 0 ? 'pass' : 'fail', details: gateFailures },
		], metadata: { declaredRequests },
	});
}
