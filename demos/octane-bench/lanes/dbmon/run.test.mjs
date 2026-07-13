import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateDbmonEvidence, validateDbmonResultSchema } from './run.mjs';
import { evaluateDbmonAnalyzerPolicy } from './analyzer-policy.mjs';
import { makeData } from './fixture/data.ts';

test('wrong dbmon row count is a red proof', () => {
	const gate = evaluateDbmonEvidence('mount', { rows: 999, cells: 7_000, survivingRows: 0, requests: 0 });
	assert.equal(gate.passed, false);
	assert.match(gate.failures.join('; '), /rows 999, expected 1000/);
});

test('dbmon schema requires all operations', () => assert.throws(() => validateDbmonResultSchema({ cases: [] }), /six operation/));

test('dbmon analyzer rejects timed requests', () => {
	const receipt = evaluateDbmonAnalyzerPolicy({ baseUrl: 'http://127.0.0.1:1/', declaredRequests: [{ method: 'GET', path: '/', resourceType: 'document' }], observedRequests: [{ phase: 'timed', method: 'GET', url: 'http://127.0.0.1:1/', resourceType: 'document', status: 200 }] });
	assert.equal(receipt.passed, false);
	assert.deepEqual(receipt.results.map((item) => item.id), ['MLA-I2-NETWORK', 'MLA-EXT-DBMON-GATES']);
});

test('dbmon generator is deterministic for a frame and key base', () => {
	assert.deepEqual(makeData(0, 17), makeData(0, 17));
	assert.notDeepEqual(makeData(0, 17), makeData(0, 18));
});
