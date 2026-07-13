import assert from 'node:assert/strict';
import test from 'node:test';

import { assertResult } from '../../lib/results.mjs';
import { declaredRequestSetFromDocument, evaluateAsyncWaterfallAnalyzerPolicy } from './analyzer-policy.mjs';
import { evaluatePageState, validateAsyncWaterfallResultSchema, verifyServerHtml } from './run.mjs';

const baseUrl = 'http://127.0.0.1:5191/';

test('wrong async boundary count fails the server gate', () => {
	assert.throws(
		() => verifyServerHtml('<!--markless:async:boundary:0--><span data-deepest-value>L9:v0</span><button id="bump"></button>'),
		/expected 10 async boundaries, rendered 1/,
	);
});

test('forbidden client metric name fails result schema validation', () => {
	assert.throws(
		() => assertResult({ cases: [{ metrics: { hydrate_ms: 1 } }] }),
		/forbidden metric name/,
	);
});

test('post-dispatch JavaScript fails the preload-window rail', () => {
	const declaredRequests = declaredRequestSetFromDocument(baseUrl, {
		modulepreloads: [baseUrl + 'build/resume.js'],
		stylesheets: [],
		entryScripts: [baseUrl + 'build/main.js'],
	});
	const receipt = evaluateAsyncWaterfallAnalyzerPolicy({
		baseUrl,
		declaredRequests,
		observedRequests: [{
			phase: 'action',
			method: 'GET',
			url: baseUrl + 'build/late.js',
			resourceType: 'script',
			status: 200,
		}],
	});
	assert.equal(receipt.passed, false);
	assert.equal(receipt.results.find((result) => result.id === 'MLA-S1-PRELOAD-INTEGRITY')?.status, 'fail');
});

test('deepest boundary gate rejects a stale version', () => {
	assert.deepEqual(
		evaluatePageState({ levels: 10, deepest: 'L9:v0', failures: 0 }, 1),
		['deepest boundary rendered L9:v0, expected L9:v1'],
	);
});

test('valid metric contract reports the ten-level serial floor', () => {
	const timing = { samples: 1, minMs: 160, p50Ms: 160, p95Ms: 160, p99Ms: 160, meanMs: 160, opsPerSec: 6.25 };
	const result = { cases: [{ metrics: {
		ssr_resume_first_dispatch_ms: timing,
		update_deepest_boundary_ms: timing,
		waterfall_factor: 1,
		levels: 10,
		delay_ms_per_level: 16,
		serial_floor_ms: 160,
	} }] };
	assert.equal(validateAsyncWaterfallResultSchema(result), result);
});
