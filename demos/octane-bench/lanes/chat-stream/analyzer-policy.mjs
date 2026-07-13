import { createVerdictReport } from '@markless/analyzer';
import { evaluateExactBuildRequestSet } from '../signal-favoring/analyzer-policy.mjs';

export function evaluateChatStreamAnalyzerPolicy({ baseUrl, declaredRequests, observedRequests, gateFailures = [] }) {
	return createVerdictReport({
		source: 'octane-bench-chat-stream', lane: 'chat-stream',
		results: [
			evaluateExactBuildRequestSet({ baseUrl, declaredRequests, observedRequests }),
			{ id: 'MLA-EXT-CHAT-GATES', status: gateFailures.length === 0 ? 'pass' : 'fail', details: gateFailures },
		], metadata: { declaredRequests },
	});
}
