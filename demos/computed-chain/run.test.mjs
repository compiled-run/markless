import assert from 'node:assert/strict';
import test from 'node:test';

import {
	createFixtureModel,
	deriveAffectedLevels,
	generateFixtureSource,
	verifyGeneratedFixture,
} from './gen.mjs';
import {
	evaluateOperationEvidence,
	validateComputedChainResultSchema,
} from './run.mjs';
import { evaluateComputedChainAnalyzerPolicy } from './analyzer-policy.mjs';

test('generator deterministically emits 100 levels and ten state owners', () => {
	const first = generateFixtureSource();
	const second = generateFixtureSource();
	assert.equal(first, second);
	assert.deepEqual(verifyGeneratedFixture(first), {
		levels: 100,
		owners: [1, 11, 21, 31, 41, 51, 61, 71, 81, 91],
	});
});

test('a middle computed wired to the wrong predecessor fails exact-work evidence', () => {
	assert.match(generateFixtureSource({ miswireMiddle: true }), /value51 = computed\(\(\) => counted\(51, 0 \+ owner51\)\)/);
	const affected = deriveAffectedLevels(createFixtureModel({ miswireMiddle: true }), 1);
	const gate = evaluateOperationEvidence('shallow-write', {
		recomputations: affected.length,
		domMutations: affected.length,
		mutationBatches: 1,
		requests: 0,
	});
	assert.equal(gate.passed, false);
	assert.match(gate.failures.join('; '), /recomputations 50, expected 100/);
});

test('computed-chain analyzer has I2 and chain gates but no S1 resume oracle', () => {
	const receipt = evaluateComputedChainAnalyzerPolicy({
		baseUrl: 'http://127.0.0.1:5190/',
		declaredRequests: [{ method: 'GET', path: '/', resourceType: 'document', kind: 'document' }],
		observedRequests: [{
			phase: 'timed',
			method: 'GET',
			url: 'http://127.0.0.1:5190/',
			resourceType: 'document',
			status: 200,
		}],
	});
	assert.deepEqual(receipt.results.map((result) => result.id), [
		'MLA-I2-NETWORK',
		'MLA-EXT-CHAIN-GATES',
	]);
	assert.equal(receipt.passed, false);
	assert.match(receipt.results[0].details[0], /measured propagation window/);
});

test('an equal write with recomputation fails exact-work evidence', () => {
	const gate = evaluateOperationEvidence('equal-write', {
		recomputations: 1,
		domMutations: 0,
		mutationBatches: 0,
		requests: 0,
	});
	assert.equal(gate.passed, false);
	assert.match(gate.failures.join('; '), /recomputations 1, expected 0/);
});

test('computed-chain result schema rejects missing counter evidence', () => {
	assert.throws(
		() => validateComputedChainResultSchema({ cases: [{ name: 'mount', metrics: {} }] }),
		/requires counterEvidence/,
	);
});
