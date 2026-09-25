import assert from 'node:assert/strict';
import test from 'node:test';

import { splitChunkBytes, validateBundleSizeResult } from './run.mjs';

test('bundle-size splits a packed chunk by attributed bytes, runtime and glue as framework', () => {
	const split = splitChunkBytes({ raw: 1000, gzip: 400, brotli: 300 }, [
		['author', 'src/root.tsrx', 200],
		['glue', 'vite/preload-helper.js', 100],
		['runtime', 'web/render', 500],
		['third-party', 'npm:lodash', 200],
	]);
	assert.deepEqual(split, {
		application: { raw: 400, gzip: 160, brotli: 120 },
		framework: { raw: 600, gzip: 240, brotli: 180 },
	});
});

test('bundle-size counts a chunk with no attributed modules as framework', () => {
	assert.deepEqual(splitChunkBytes({ raw: 52, gzip: 40, brotli: 30 }, []), {
		application: { raw: 0, gzip: 0, brotli: 0 },
		framework: { raw: 52, gzip: 40, brotli: 30 },
	});
});

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
