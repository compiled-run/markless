import assert from 'node:assert/strict';
import test from 'node:test';

import { validateBundleSizeResult } from './run.mjs';

test('bundle-size rejects an empty framework bucket', () => {
	assert.throws(
		() =>
			validateBundleSizeResult({
				cases: [sizeCase({ framework: { raw: 0, gzip: 0, brotli: 0 } })],
			}),
		/empty framework bucket/,
	);
});

test('bundle-size schema rejects a missing byte field', () => {
	const benchmarkCase = sizeCase();
	delete benchmarkCase.metrics.bytes.total.brotli;
	assert.throws(() => validateBundleSizeResult({ cases: [benchmarkCase] }), /total\.brotli/);
});

function sizeCase(overrides = {}) {
	return {
		name: 'fixture',
		metrics: {
			bytes: {
				total: { raw: 30, gzip: 20, brotli: 10 },
				application: { raw: 10, gzip: 8, brotli: 6 },
				framework: { raw: 20, gzip: 12, brotli: 4 },
				...overrides,
			},
		},
	};
}
