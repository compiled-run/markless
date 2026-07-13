import { Buffer } from 'node:buffer';

import { createFailedResult } from '../benchmarks/lib/results.mjs';
import { summarizeSamples } from '../benchmarks/lib/stats.mjs';

const SCENARIOS = ['staggered', 'all-fast'];
const CARD_COUNT = 10;

export async function runStreamingSsr({ fixture, protocol, environment }) {
	const cases = [];
	for (const scenario of SCENARIOS) {
		try {
			for (let index = 0; index < protocol.warmupMinimumRenders; index++) {
				await renderOnce(fixture, scenario, false);
			}

			const verificationRender = await renderOnce(fixture, scenario, true);
			const checks = verifyStreamingRender(scenario, verificationRender);
			const shellSamples = [];
			const totalSamples = [];
			const chunkCounts = [];
			const byteCounts = [];
			const memoryBefore = process.memoryUsage();
			for (let index = 0; index < protocol.maxSamples; index++) {
				const render = await renderOnce(fixture, scenario, false);
				shellSamples.push(render.chunks[0]?.arrivalMs ?? Number.NaN);
				totalSamples.push(render.totalMs);
				chunkCounts.push(render.chunks.length);
				byteCounts.push(render.totalBytes);
			}
			const memoryAfter = process.memoryUsage();
			const timing = summarizeSamples(totalSamples);
			cases.push({
				name: scenario,
				gates: { passed: true, checks },
				bodyBytes: median(byteCounts),
				timing,
				shellTiming: summarizeSamples(shellSamples),
				metadata: {
					chunkCount: median(chunkCounts),
					totalBytes: median(byteCounts),
					...(scenario === 'all-fast' ? { rendersPerSec: timing.opsPerSec } : {}),
				},
				memory: {
					label: 'allocator-growth-observation',
					renders: protocol.maxSamples,
					rssGrowthBytes: memoryAfter.rss - memoryBefore.rss,
					heapGrowthBytes: memoryAfter.heapUsed - memoryBefore.heapUsed,
					forcedGc: false,
				},
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				exitCode: 1,
				result: createFailedResult({
					benchmark: 'streaming-ssr',
					protocol,
					environment,
					failure: `${scenario}: ${message}`,
					cases: [{ name: scenario, gates: { passed: false, checks: [message] } }],
				}),
			};
		}
	}

	return {
		exitCode: 0,
		result: {
			schemaVersion: 1,
			kind: 'markless-benchmark-result',
			benchmark: 'streaming-ssr',
			status: 'passed',
			recordedAt: new Date().toISOString(),
			protocol,
			environment,
			cases,
		},
	};
}

export function verifyStreamingRender(scenario, render) {
	const shell = render.chunks[0]?.value;
	if (!shell) throw new Error('stream did not expose a non-empty shell chunk');
	if (!shell.includes('data-stream-shell')) throw new Error('first chunk does not contain the shell');

	const checks = ['shell was exposed as the first non-empty chunk'];
	for (let index = 0; index < CARD_COUNT; index++) {
		const cardMarker = `data-stream-card="${index}"`;
		const matches = render.html.split(cardMarker).length - 1;
		if (matches !== 1) throw new Error(`expected card ${index} exactly once, found ${matches}`);
		if (!shell.includes(cardMarker)) {
			const skeletonMarker = `data-card-skeleton="${index}"`;
			if (!shell.includes(skeletonMarker)) {
				throw new Error(`pending card ${index} has no skeleton in the shell`);
			}
		}
	}
	checks.push('all ten cards were present exactly once at completion');
	checks.push('every card pending at shell time had a skeleton placeholder');

	if (scenario === 'staggered') {
		const slowestCard = `data-stream-card="${CARD_COUNT - 1}"`;
		if (shell.includes(slowestCard) || !render.chunks.slice(1).some((chunk) => chunk.value.includes(slowestCard))) {
			throw new Error('slowest card must arrive in a chunk after the shell');
		}
		checks.push('slowest card arrived after the shell');
		if (render.totalMs < 40) {
			throw new Error(
				`staggered stream completed in ${render.totalMs.toFixed(1)} ms; expected at least 40 ms`,
			);
		}
		checks.push('staggered completion took at least 40 ms');
	}
	return checks;
}

async function renderOnce(fixture, scenario, collect) {
	const chunks = [];
	let html = '';
	const started = performance.now();
	await fixture.renderStream(scenario, (value) => {
		if (typeof value !== 'string') throw new TypeError('stream chunk must be a string');
		if (value.length === 0) return;
		chunks.push({
			value: collect ? value : '',
			arrivalMs: performance.now() - started,
			bytes: Buffer.byteLength(value),
		});
		if (collect) html += value;
	});
	return {
		chunks,
		html,
		totalMs: performance.now() - started,
		totalBytes: chunks.reduce((sum, chunk) => sum + chunk.bytes, 0),
	};
}

function median(values) {
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[sorted.length >> 1];
}
