import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateChatStreamEvidence, validateChatStreamResultSchema } from './run.mjs';
import { evaluateChatStreamAnalyzerPolicy } from './analyzer-policy.mjs';
import { initialConversations } from './fixture/data.ts';

test('an incomplete token drain is a red proof', () => {
	const gate = evaluateChatStreamEvidence('stream-8-token-batches', { messages: 18, streaming: 1, remaining: 8, requests: 0 });
	assert.equal(gate.passed, false);
	assert.match(gate.failures.join('; '), /remaining 8, expected 0/);
});
test('chat-stream schema requires all operations', () => assert.throws(() => validateChatStreamResultSchema({ cases: [] }), /five operation/));
test('chat receipt declares I2 and stream gates', () => {
	const receipt = evaluateChatStreamAnalyzerPolicy({ baseUrl: 'http://localhost/', declaredRequests: [], observedRequests: [] });
	assert.deepEqual(receipt.results.map((item) => item.id), ['MLA-I2-NETWORK', 'MLA-EXT-CHAT-GATES']);
});
test('chat corpus is fixed-seed deterministic', () => assert.deepEqual(initialConversations(), initialConversations()));
