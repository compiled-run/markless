import assert from 'node:assert/strict';
import test from 'node:test';

import {
	DERIVED_RECONCILE_SIZES,
	evaluateDerivedReconcileEvidence,
	validateDerivedReconcileResultSchema,
} from './run.mjs';

test('constant re-checks across N pass the scaling gate', () => {
	const evidence = evaluateDerivedReconcileEvidence(constantMeasurements(1));
	assert.equal(evidence.passed, true);
	assert.deepEqual(evidence.failures, []);
	assert.match(evidence.summary, /list-keyed-100 reChecks 1; list-keyed-1000 reChecks 1/);
});

test('re-checks that grow with N fail the scaling gate', () => {
	const evidence = evaluateDerivedReconcileEvidence(scalingMeasurements());
	assert.equal(evidence.passed, false);
	assert.equal(evidence.failures.length, 2);
	assert.match(evidence.failures[0], /re-checks scale with N \(N=100 reChecks 200, N=1000 reChecks 2000\)/);
	assert.match(evidence.summary, /list-keyed-1000 reChecks 2000/);
});

test('a delivered field value is required even when re-checks are constant', () => {
	const measurements = constantMeasurements(1).map((measurement) => ({
		...measurement,
		changedValueSeen: false,
	}));
	const evidence = evaluateDerivedReconcileEvidence(measurements);
	assert.equal(evidence.passed, false);
	assert.match(evidence.failures.join('; '), /never delivered the changed value/);
});

test('evidence rejects a measurement without counts', () => {
	assert.throws(
		() => evaluateDerivedReconcileEvidence([{ mode: 'list-keyed', size: 100 }]),
		/measurement\.reChecks must be a non-negative integer/,
	);
	assert.throws(() => evaluateDerivedReconcileEvidence([]), /at least one measurement/);
});

test('schema accepts an O(1) passed result and an O(N) failed result', () => {
	const passed = syntheticResult('passed', constantMeasurements(1));
	assert.equal(validateDerivedReconcileResultSchema(passed), passed);
	const failed = syntheticResult('failed', scalingMeasurements());
	assert.equal(validateDerivedReconcileResultSchema(failed), failed);
});

test('schema refuses to call an O(N) result passed', () => {
	assert.throws(
		() => validateDerivedReconcileResultSchema(syntheticResult('passed', scalingMeasurements())),
		/cannot pass while re-checks scale with N \(200 vs 2000\)/,
	);
});

test('schema refuses a passed result that never saw the changed value', () => {
	const measurements = constantMeasurements(1).map((measurement) => ({
		...measurement,
		changedValueSeen: false,
	}));
	assert.throws(
		() => validateDerivedReconcileResultSchema(syntheticResult('passed', measurements)),
		/cannot pass without changedValueSeen/,
	);
});

test('schema requires two or more sizes per mode', () => {
	const measurements = [constantMeasurements(1)[0]];
	assert.throws(
		() => validateDerivedReconcileResultSchema(syntheticResult('failed', measurements)),
		/must be measured at two or more sizes/,
	);
});

test('schema rejects a case without metrics', () => {
	assert.throws(
		() => validateDerivedReconcileResultSchema({ status: 'failed', cases: [{ name: 'x' }] }),
		/requires metrics/,
	);
	assert.throws(() => validateDerivedReconcileResultSchema({ cases: [] }), /requires cases/);
});

function constantMeasurements(reChecks) {
	return DERIVED_RECONCILE_SIZES.map((size) => ({
		mode: 'list-keyed',
		size,
		expectedReChecks: 1,
		reChecks,
		collectionRuns: 1,
		changedValueSeen: true,
		changeFlushMs: 0.5,
	}));
}

function scalingMeasurements() {
	return DERIVED_RECONCILE_SIZES.map((size) => ({
		mode: 'list-keyed',
		size,
		expectedReChecks: 1,
		reChecks: size * 2,
		collectionRuns: 1,
		changedValueSeen: true,
		changeFlushMs: 0.5,
	}));
}

function syntheticResult(status, measurements) {
	return {
		status,
		cases: measurements.map((measurement) => ({
			name: `${measurement.mode}-${measurement.size}`,
			gates: { passed: status === 'passed', checks: [] },
			metrics: {
				samples: 1,
				mode: measurement.mode,
				size: measurement.size,
				reChecks: measurement.reChecks,
				collectionRuns: measurement.collectionRuns,
				expectedReChecks: measurement.expectedReChecks,
				changedValueSeen: measurement.changedValueSeen,
			},
		})),
	};
}
