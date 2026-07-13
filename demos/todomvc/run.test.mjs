import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateTodoMvcEvidence, validateTodoMvcResultSchema } from './run.mjs';
import { evaluateTodoMvcAnalyzerPolicy } from './analyzer-policy.mjs';

test('wrong todo count after add is a red proof', () => {
	const gate = evaluateTodoMvcEvidence('add-100', { rows: 99, completed: 0, requests: 0 });
	assert.equal(gate.passed, false);
	assert.match(gate.failures.join('; '), /rows 99, expected 100/);
});
test('TodoMVC result needs all operations', () => assert.throws(() => validateTodoMvcResultSchema({ cases: [] }), /nine operation/));
test('TodoMVC receipt declares I2 and semantic gates', () => {
	const receipt = evaluateTodoMvcAnalyzerPolicy({ baseUrl: 'http://localhost/', declaredRequests: [], observedRequests: [] });
	assert.deepEqual(receipt.results.map((item) => item.id), ['MLA-I2-NETWORK', 'MLA-EXT-TODOMVC-GATES']);
});
