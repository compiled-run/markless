import assert from 'node:assert/strict';
import test from 'node:test';

import { validateCodegenSizeResult } from './run.mjs';

test('codegen-size rejects a corpus hash mismatch', () => {
	assert.throws(
		() =>
			validateCodegenSizeResult({ cases: [codegenCase()] }, [
				{ file: 'events.tsrx', sha256: 'b'.repeat(64) },
			]),
		/corpus hash mismatch/,
	);
});

test('codegen-size schema rejects a missing byte field', () => {
	const benchmarkCase = codegenCase();
	delete benchmarkCase.metrics.bytes.compiled.gzip;
	assert.throws(
		() => validateCodegenSizeResult({ cases: [benchmarkCase] }, benchmarkCase.metrics.corpus),
		/compiled\.gzip/,
	);
});

function codegenCase() {
	return {
		name: 'client',
		metrics: {
			bytes: {
				source: { raw: 20, gzip: 15 },
				compiled: { raw: 40, minified: 30, gzip: 20 },
			},
			corpus: [{ file: 'events.tsrx', sha256: 'a'.repeat(64) }],
			files: [],
		},
	};
}
