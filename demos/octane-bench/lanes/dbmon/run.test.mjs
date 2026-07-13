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

test('wrong tick write counts fail the dbmon gates', () => {
	const full = evaluateDbmonEvidence('full-tick', { rows: 1_000, cells: 7_000, textMutations: 6_000, changedCells: 5_968, survivingRows: 1_000, requests: 0 });
	assert.equal(full.passed, false);
	assert.match(full.failures.join('; '), /textMutations 6000, expected 7000/);
});

test('a broken row writer fails the dbmon tick band even when writes equal changes', () => {
	const gate = evaluateDbmonEvidence('full-tick', { rows: 1_000, cells: 7_000, textMutations: 0, changedCells: 0, survivingRows: 1_000, requests: 0 });
	assert.equal(gate.passed, false);
	assert.match(gate.failures.join('; '), /changed 0 cells, expected 5500\.\.6000/);
});

test('the documented tick change counts come from the seeded corpus itself', () => {
	const stringifyFields = (row) => [String(row.name), String(row.count), String(row.query0), String(row.query1), String(row.query2), String(row.query3), String(row.query4)];
	const changedBetween = (before, after) => before.flatMap((row, index) => stringifyFields(row).map((text, field) => text !== stringifyFields(after[index])[field])).filter(Boolean).length;
	assert.equal(changedBetween(makeData(0, 1), makeData(0, 2)), 5_968);
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
