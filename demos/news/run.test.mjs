import assert from 'node:assert/strict';
import test from 'node:test';

import {
	declaredRequestSetFromDocument,
	evaluateExactRequestSet,
	evaluateNewsAnalyzerPolicy,
} from './analyzer-policy.mjs';
import { validateNewsResultSchema, verifyServerHtml } from './run.mjs';

const baseUrl = 'http://127.0.0.1:5191/';

test('post-dispatch JavaScript observation fails MLA-S1', () => {
	const declaredRequests = declaredRequestSetFromDocument(baseUrl, {
		modulepreloads: [`${baseUrl}assets/resume.js`],
		stylesheets: [],
	});
	const receipt = evaluateNewsAnalyzerPolicy({
		baseUrl,
		declaredRequests,
		observedRequests: [
			{
				phase: 'action',
				method: 'GET',
				url: `${baseUrl}assets/late.js`,
				resourceType: 'script',
				status: 200,
			},
		],
	});

	const s1 = receipt.results.find((result) => result.id === 'MLA-S1-PRELOAD-INTEGRITY');
	assert.equal(s1.status, 'fail');
	assert.equal(receipt.passed, false);
});

test('undeclared request fails exact MLA-I2 policy', () => {
	const invariant = evaluateExactRequestSet({
		baseUrl,
		declaredRequests: [{ method: 'GET', path: '/', resourceType: 'document', kind: 'document' }],
		observedRequests: [
			{
				phase: 'bootstrap',
				method: 'GET',
				url: `${baseUrl}assets/undeclared.css`,
				resourceType: 'stylesheet',
				status: 200,
			},
		],
	});

	assert.equal(invariant.status, 'fail');
	assert.match(invariant.details[0], /undeclared GET stylesheet request/);
});

test('wrong article count fails the news correctness gate', () => {
	assert.throws(
		() => verifyServerHtml('<main><article data-news-card="1"></article></main>'),
		/expected 50 article cards, rendered 1/,
	);
});

test('legacy client metric name fails news result schema validation', () => {
	assert.throws(
		() =>
			validateNewsResultSchema({
				cases: [
					{
						metrics: {
							hydrate_ms: { samples: 1 },
							resume_first_dispatch_ms: { samples: 1 },
							preloaded_client_bytes: 1,
							startup_executed_bytes: 1,
						},
					},
				],
			}),
		/forbidden client metric/,
	);
});
