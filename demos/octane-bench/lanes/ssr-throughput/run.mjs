import { Buffer } from 'node:buffer';

import { createFailedResult } from '../../lib/results.mjs';
import { summarizeSamples } from '../../lib/stats.mjs';

const ARTICLE_PATTERN = /<article\b[^>]*data-news-card=/g;
const ESCAPED_SENTINEL = '&lt;/style&gt;&lt;script data-markless-probe&gt;&amp;';

export async function runSsrThroughput({ fixture, protocol, environment }) {
	const cases = [
		{
			name: 'news-50',
			render: fixture.renderNews50,
			gate: { expectedArticleCount: 50 },
		},
		{
			name: 'news-500',
			render: fixture.renderNews500,
			gate: { expectedArticleCount: 500 },
		},
		{
			name: 'parallel-async',
			render: fixture.renderParallelAsync,
			gate: {
				settledTexts: [
					'parallel first 11',
					'parallel second 23',
					'parallel third 37',
					'parallel fourth 41',
				],
				forbiddenText: 'parallel pending',
			},
		},
		{
			name: 'nested-waterfall',
			render: fixture.renderNestedWaterfall,
			gate: { settledText: 'level 4 = 404', forbiddenText: 'pending' },
		},
		{
			name: 'escape-heavy',
			render: fixture.renderEscapeHeavy,
			gate: {
				expectedEscapeRows: 10_000,
				escapedSentinel: ESCAPED_SENTINEL,
				rawSentinel: fixture.ESCAPE_SENTINEL,
			},
		},
	];
	return runBenchmarkCases({ lane: 'ssr-throughput', protocol, environment, cases });
}

export async function runBenchmarkCases({ lane, protocol, environment, cases, measure = measureCase }) {
	const verified = [];
	for (const benchmarkCase of cases) {
		try {
			const body = await benchmarkCase.render();
			const checks = verifyBody(body, benchmarkCase.gate);
			verified.push({ ...benchmarkCase, bodyBytes: Buffer.byteLength(body), checks });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				exitCode: 1,
				result: createFailedResult({
					lane,
					protocol,
					environment,
					failure: `${benchmarkCase.name}: ${message}`,
					cases: [
						{
							name: benchmarkCase.name,
							gates: { passed: false, checks: [message] },
						},
					],
				}),
			};
		}
	}

	const measuredCases = [];
	for (const benchmarkCase of verified) {
		const measurement = await measure(benchmarkCase.render, protocol);
		measuredCases.push({
			name: benchmarkCase.name,
			gates: { passed: true, checks: benchmarkCase.checks },
			bodyBytes: benchmarkCase.bodyBytes,
			...measurement,
		});
	}
	return {
		exitCode: 0,
		result: {
			schemaVersion: 1,
			kind: 'markless-benchmark-result',
			lane,
			status: 'passed',
			recordedAt: new Date().toISOString(),
			protocol,
			environment,
			cases: measuredCases,
		},
	};
}

function verifyBody(body, gate) {
	if (typeof body !== 'string') throw new TypeError('renderer did not return an HTML string');
	const checks = [];
	if (gate.expectedArticleCount !== undefined) {
		const count = body.match(ARTICLE_PATTERN)?.length ?? 0;
		if (count !== gate.expectedArticleCount) {
			throw new Error(`expected ${gate.expectedArticleCount} articles, rendered ${count}`);
		}
		checks.push(`rendered exactly ${count} articles`);
	}
	if (gate.expectedEscapeRows !== undefined) {
		const count = body.match(/<li\b[^>]*data-escape-row=/g)?.length ?? 0;
		if (count !== gate.expectedEscapeRows) {
			throw new Error(`expected ${gate.expectedEscapeRows} escape rows, rendered ${count}`);
		}
		checks.push(`rendered exactly ${count} escape rows`);
	}
	if (gate.escapedSentinel) {
		if (!body.includes(gate.escapedSentinel)) throw new Error('escaped sentinel is missing');
		if (body.includes(gate.rawSentinel)) throw new Error('raw escape sentinel reached the HTML');
		checks.push('escaped sentinel present and raw sentinel absent');
	}
	const settledTexts = gate.settledTexts ?? (gate.settledText ? [gate.settledText] : []);
	if (settledTexts.length > 0) {
		for (const settledText of settledTexts) {
			if (!body.includes(settledText)) throw new Error(`settled content is missing: ${settledText}`);
		}
		if (gate.forbiddenText && body.includes(gate.forbiddenText)) {
			throw new Error(`unsettled content reached the final HTML: ${gate.forbiddenText}`);
		}
		checks.push(`async content settled: ${settledTexts.join(', ')}`);
	}
	return checks;
}

async function measureCase(render, protocol) {
	const warmupEnd = performance.now() + protocol.warmupSeconds * 1000;
	let warmupRenders = 0;
	while (warmupRenders < protocol.warmupMinimumRenders || performance.now() < warmupEnd) {
		await render();
		warmupRenders++;
	}

	const samples = [];
	const sampleEnd = performance.now() + protocol.timedSeconds * 1000;
	do {
		const started = performance.now();
		await render();
		samples.push(performance.now() - started);
	} while (performance.now() < sampleEnd && samples.length < protocol.maxSamples);

	const before = process.memoryUsage();
	for (let index = 0; index < protocol.memoryMaxRenders; index++) await render();
	const after = process.memoryUsage();
	return {
		timing: summarizeSamples(samples),
		memory: {
			label: 'allocator-growth-observation',
			renders: protocol.memoryMaxRenders,
			rssGrowthBytes: after.rss - before.rss,
			heapGrowthBytes: after.heapUsed - before.heapUsed,
			forcedGc: false,
		},
	};
}
