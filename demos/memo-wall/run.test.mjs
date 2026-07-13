import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateMemoWallEvidence, validateMemoWallResultSchema } from './run.mjs';
import { evaluateMemoWallAnalyzerPolicy } from './analyzer-policy.mjs';

const ZERO = {
	rowA: 0,
	innerA: 0,
	leafA: 0,
	rowB: 0,
	innerB: 0,
	leafB: 0,
	domMutations: 0,
	mutationBatches: 0,
	requests: 0,
};

test('an equal parent write producing DOM work fails the zero-work gate', () => {
	const gate = evaluateMemoWallEvidence('parent-rerender-equal-A', {
		...ZERO,
		domMutations: 3,
		mutationBatches: 1,
	});
	assert.equal(gate.passed, false);
	assert.match(gate.failures.join('; '), /domMutations 3, expected 0/);
});

test('a theme fan-out with missing writes fails exact evidence', () => {
	const gate = evaluateMemoWallEvidence('theme-fanout-A', {
		...ZERO,
		domMutations: 1_000,
		mutationBatches: 1,
	});
	assert.equal(gate.passed, false);
	assert.match(gate.failures.join('; '), /domMutations 1000, expected 3000/);
});

test('memo-wall result schema rejects missing counter evidence', () => {
	assert.throws(
		() => validateMemoWallResultSchema({ cases: [{ name: 'mount', metrics: {} }] }),
		/requires counterEvidence/,
	);
});

test('memo-wall analyzer has I2 and memo gates but no S1 resume oracle', () => {
	const receipt = evaluateMemoWallAnalyzerPolicy({
		baseUrl: 'http://127.0.0.1:5190/',
		declaredRequests: [
			{ method: 'GET', path: '/', resourceType: 'document', kind: 'document' },
		],
		observedRequests: [
			{
				phase: 'timed',
				method: 'GET',
				url: 'http://127.0.0.1:5190/',
				resourceType: 'document',
				status: 200,
			},
		],
	});
	assert.deepEqual(
		receipt.results.map((result) => result.id),
		['MLA-I2-NETWORK', 'MLA-EXT-MEMO-GATES'],
	);
	assert.equal(receipt.passed, false);
	assert.match(receipt.results[0].details[0], /measured propagation window/);
});
