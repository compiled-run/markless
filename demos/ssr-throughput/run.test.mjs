import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeSamples } from '../benchmarks/lib/stats.mjs';
import { assertResult, createFailedResult } from '../benchmarks/lib/results.mjs';
import { runBenchmarkCases } from './run.mjs';

test('summarizeSamples reports nearest-rank latency percentiles and throughput', () => {
	const summary = summarizeSamples([1, 2, 3, 4, 100]);

	assert.equal(summary.minMs, 1);
	assert.equal(summary.p50Ms, 3);
	assert.equal(summary.p95Ms, 100);
	assert.equal(summary.p99Ms, 100);
	assert.equal(summary.opsPerSec, 1000 / 22);
	assert.equal(summary.samples, 5);
});

test('result schema accepts a failed result and rejects timing on failed cases', () => {
	const result = createFailedResult({
		benchmark: 'ssr-throughput',
		protocol: sampleProtocol(),
		environment: sampleEnvironment(),
		failure: 'wrong article count',
	});

	assert.equal(assertResult(result), result);
	assert.throws(
		() =>
			assertResult({
				...result,
				cases: [{ name: 'news-50', gates: { passed: false, checks: [] }, timing: {} }],
			}),
		/result\.cases\[0\] must not contain timing when its gates failed/,
	);
});

test('wrong article count returns a failed result and nonzero exit without timing', async () => {
	let timingCalls = 0;
	const outcome = await runBenchmarkCases({
		benchmark: 'ssr-throughput',
		protocol: sampleProtocol(),
		environment: sampleEnvironment(),
		cases: [
			{
				name: 'news-50',
				render: async () => '<main><article data-news-card="1">only one</article></main>',
				gate: { expectedArticleCount: 50 },
			},
		],
		measure: async () => {
			timingCalls++;
			throw new Error('timing must not run');
		},
	});

	assert.equal(outcome.exitCode, 1);
	assert.equal(outcome.result.status, 'failed');
	assert.match(outcome.result.failure, /expected 50 articles, rendered 1/);
	assert.equal(timingCalls, 0);
	assert.equal('timing' in outcome.result.cases[0], false);
	assert.equal(assertResult(outcome.result), outcome.result);
});

function sampleProtocol() {
	return {
		mode: 'smoke',
		timedSeconds: 1,
		warmupMinimumRenders: 3,
		warmupSeconds: 0.1,
		maxSamples: 200_000,
		memoryMaxRenders: 100,
		forcedGc: false,
	};
}

function sampleEnvironment() {
	return {
		os: 'test',
		arch: 'test',
		cpuModel: 'test',
		nodeVersion: 'v0.0.0',
		pnpmVersion: '0.0.0',
		gitSha: '0'.repeat(40),
		dirtyTree: false,
	};
}
