import fs from 'node:fs';
import path from 'node:path';

import { createFailedResult } from '../../lib/results.mjs';
import { summarizeSamples } from '../../lib/stats.mjs';
import { evaluateMemoWallAnalyzerPolicy } from './analyzer-policy.mjs';
import { createSignalFavoringServer as createStaticServer } from '../signal-favoring/server.mjs';

// Exact-work evidence is DOM text-mutation counts: fixture-owned evaluation
// counters are blocked on framework finding 5 (module-scope calls and
// template literals in keyed-row expressions silently empty the repeat).
const EVIDENCE_FIELDS = ['domMutations', 'mutationBatches', 'requests'];
const ZERO = Object.fromEntries(EVIDENCE_FIELDS.map((field) => [field, 0]));
const OPERATIONS = [
	'mount',
	'parent-rerender-equal-A',
	'parent-rerender-equal-B',
	'one-change-A',
	'one-change-B',
	'theme-fanout-A',
	'theme-fanout-B',
];
const EXPECTED_EVIDENCE = {
	// mount = render + fill-a + fill-b dispatches: three commit batches.
	mount: { ...ZERO, domMutations: 6_000, mutationBatches: 3 },
	'parent-rerender-equal-A': { ...ZERO },
	'parent-rerender-equal-B': { ...ZERO },
	'one-change-A': { ...ZERO, domMutations: 3, mutationBatches: 1 },
	'one-change-B': { ...ZERO, domMutations: 3, mutationBatches: 1 },
	// The unconditional row writer rewrites all three bound texts for each
	// changed row object (1,000 changed leaf values + 2,000 identical rewrites).
	'theme-fanout-A': { ...ZERO, domMutations: 3_000, mutationBatches: 1 },
	'theme-fanout-B': { ...ZERO, domMutations: 3_000, mutationBatches: 1 },
};

export async function runMemoWall({ protocol, environment, clientDirectory, receiptPath }) {
	try {
		const measured = await measureBrowserLane({ protocol, clientDirectory });
		writeReceipt(receiptPath, measured.receipt);
		if (!measured.receipt.passed) {
			const details = measured.receipt.results.flatMap((result) =>
				result.status === 'fail' ? result.details : [],
			);
			throw new Error(`memo-wall analyzer or correctness gate failed: ${details.join('; ')}`);
		}
		const cases = OPERATIONS.map((name) => ({
			name,
			gates: { passed: true, checks: measured.gates[name].checks },
			bodyBytes: 0,
			timing: summarizeSamples(measured.samples[name]),
			memory: emptyMemory(),
			metrics: {
				counterEvidence: measured.gates[name].evidence,
				innerRepetitions: repetitionsFor(name, protocol),
			},
		}));
		const result = {
			schemaVersion: 1,
			kind: 'markless-benchmark-result',
			lane: 'memo-wall',
			status: 'passed',
			recordedAt: new Date().toISOString(),
			protocol,
			environment,
			cases,
		};
		validateMemoWallResultSchema(result);
		return { exitCode: 0, result };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			exitCode: 1,
			result: createFailedResult({
				lane: 'memo-wall',
				protocol,
				environment,
				failure: message,
				cases: [{ name: 'memo-wall', gates: { passed: false, checks: [message] } }],
			}),
		};
	}
}

export function evaluateMemoWallEvidence(operation, actual) {
	const expected = EXPECTED_EVIDENCE[operation];
	if (!expected) throw new TypeError(`unknown memo-wall operation ${operation}`);
	const failures = Object.entries(expected).flatMap(([field, value]) =>
		actual[field] === value
			? []
			: [`${operation} ${field} ${String(actual[field])}, expected ${value}`],
	);
	return {
		passed: failures.length === 0,
		failures,
		checks:
			failures.length === 0
				? [
						`${operation} matched all six fixture-owned computed counters`,
						`${operation} mutated exactly ${expected.domMutations} reactive DOM nodes in ${expected.mutationBatches} observer batch(es)`,
						`${operation} issued zero requests`,
					]
				: failures,
		evidence: { expected: { ...expected }, actual: { ...actual } },
	};
}

export function validateMemoWallResultSchema(result) {
	if (!Array.isArray(result.cases) || result.cases.length === 0) {
		throw new TypeError('memo-wall result requires cases');
	}
	for (const benchmarkCase of result.cases) {
		const evidence = benchmarkCase.metrics?.counterEvidence;
		if (!evidence?.actual || !evidence?.expected) {
			throw new TypeError(`memo-wall case ${benchmarkCase.name} requires counterEvidence`);
		}
		for (const field of EVIDENCE_FIELDS) {
			if (!Number.isInteger(evidence.actual[field]) || evidence.actual[field] < 0) {
				throw new TypeError(
					`memo-wall case ${benchmarkCase.name} requires integer counterEvidence.actual.${field}`,
				);
			}
		}
	}
	return result;
}

async function measureBrowserLane({ protocol, clientDirectory }) {
	const { chromium } = await import('playwright');
	const server = await createStaticServer({ clientDirectory });
	const browser = await chromium.launch({
		headless: true,
		args: ['--disable-extensions', '--no-sandbox', '--js-flags=--expose-gc'],
	});
	const observations = [];
	const gateFailures = [];
	const gates = {};
	const samples = {};
	try {
		const semantic = await openBenchPage(browser, server.origin, observations);
		try {
			for (const operation of OPERATIONS) {
				const evidence = await collectEvidence(semantic.page, operation);
				evidence.requests = semantic.timedRequestCount();
				const gate = evaluateMemoWallEvidence(operation, evidence);
				if (!gate.passed) gateFailures.push(...gate.failures);
				gates[operation] = gate;
			}
		} finally {
			await semantic.context.close();
		}

		for (const operation of OPERATIONS) {
			samples[operation] = await measureOperation({
				browser,
				origin: server.origin,
				observations,
				operation,
				protocol,
			});
		}
		const timedRequests = observations.filter((request) => request.phase === 'timed').length;
		if (timedRequests !== 0)
			gateFailures.push(
				`measured memo-wall windows issued ${timedRequests} requests, expected zero`,
			);
		const receipt = evaluateMemoWallAnalyzerPolicy({
			baseUrl: `${server.origin}/`,
			declaredRequests: server.declaredRequests,
			observedRequests: observations,
			gateFailures,
		});
		return { gates, samples, receipt };
	} finally {
		await browser.close();
		await server.close();
	}
}

async function openBenchPage(browser, origin, observations) {
	const context = await browser.newContext();
	const page = await context.newPage();
	let phase = 'bootstrap';
	let timedRequests = 0;
	const pendingResponses = [];
	page.on('request', (request) => {
		if (phase === 'timed') timedRequests++;
		observations.push({
			phase,
			method: request.method(),
			url: request.url(),
			resourceType: request.resourceType(),
			status: null,
		});
	});
	page.on('response', (response) => {
		pendingResponses.push(
			(async () => {
				const observation = [...observations]
					.reverse()
					.find((entry) => entry.url === response.url() && entry.status === null);
				if (observation) observation.status = response.status();
				await response.finished();
			})(),
		);
	});
	await page.goto(`${origin}/`, { waitUntil: 'load' });
	await page.waitForFunction(() => window.__ready === true, null, { timeout: 10_000 });
	await page.evaluate(async () => {
		await window.__memoWallBench.mount();
		await window.__memoWallBench.unmount();
	});
	await Promise.all(pendingResponses);
	return {
		context,
		page,
		setPhase(next) {
			phase = next;
		},
		timedRequestCount() {
			return timedRequests;
		},
	};
}

async function collectEvidence(page, operation) {
	await page.evaluate(async () => {
		await window.__memoWallBench.unmount();
	});
	return await page.evaluate(async (name) => {
		const api = window.__memoWallBench;
		const root = document.querySelector('#app');
		if (!root) throw new Error('memo-wall root is missing');
		let domMutations = 0;
		let mutationBatches = 0;
		const reactiveNodes = (node) => {
			if (node.nodeType === Node.TEXT_NODE)
				return node.parentElement?.matches('[data-value]') ? 1 : 0;
			if (!(node instanceof Element)) return 0;
			return (
				(node.matches('[data-value]') ? 1 : 0) +
				node.querySelectorAll('[data-value]').length
			);
		};
		const observer = new MutationObserver((records) => {
			mutationBatches++;
			for (const record of records) {
				if (record.type === 'characterData') domMutations++;
				else
					for (const node of [...record.addedNodes, ...record.removedNodes])
						domMutations += reactiveNodes(node);
			}
		});
		observer.observe(root, { childList: true, characterData: true, subtree: true });
		const wallsCommitted = async () => {
			for (let attempt = 0; attempt < 400; attempt++) {
				if (
					document.querySelectorAll('#wall-a .item').length === 1_000 &&
					document.querySelectorAll('#wall-b .item').length === 1_000
				)
					return;
				await new Promise((resolve) => setTimeout(resolve, 5));
			}
			throw new Error('memo-wall walls did not commit 1,000 rows each');
		};
		// Content-consistency gate: every cell binds a precomputed row field
		// (finding 10 bans expressions), so the DOM itself must satisfy
		// inner === value + 1 and leaf === value + themeBumps for every
		// sampled row. This catches silently empty or stale cells that
		// mutation counts alone cannot see.
		const assertWallContent = (wallId, themeBumps) => {
			const rows = [...document.querySelectorAll(`#${wallId} .item`)];
			for (const index of [0, 1, 499, 500, 998, 999]) {
				const row = rows[index];
				const value = Number(row.querySelector('.row')?.textContent);
				const inner = Number(row.querySelector('.inner')?.textContent);
				const leaf = Number(row.querySelector('.leaf')?.textContent);
				if (!Number.isFinite(value) || inner !== value + 1 || leaf !== value + themeBumps) {
					throw new Error(
						`memo-wall ${wallId} row ${index} content inconsistent: value=${value} inner=${inner} leaf=${leaf} themeBumps=${themeBumps}`,
					);
				}
			}
		};
		if (name === 'mount') {
			await api.mount();
			await api.invoke('fill-a');
			await api.invoke('fill-b');
			await wallsCommitted();
			assertWallContent('wall-a', 0);
			assertWallContent('wall-b', 0);
		} else {
			await api.mount();
			await api.invoke('fill-a');
			await api.invoke('fill-b');
			await wallsCommitted();
			await new Promise((resolve) => setTimeout(resolve, 20));
			domMutations = 0;
			mutationBatches = 0;
			await api.invoke(actionFor(name));
			await new Promise((resolve) => setTimeout(resolve, 20));
			const bumpsA = name === 'theme-fanout-A' ? 1 : 0;
			const bumpsB = name === 'theme-fanout-B' ? 1 : 0;
			assertWallContent('wall-a', bumpsA);
			assertWallContent('wall-b', bumpsB);
		}
		await new Promise((resolve) => setTimeout(resolve, 0));
		observer.disconnect();
		return { domMutations, mutationBatches };

		function actionFor(operation) {
			const actions = {
				'parent-rerender-equal-A': 'equal-a',
				'parent-rerender-equal-B': 'equal-b',
				'one-change-A': 'one-a',
				'one-change-B': 'one-b',
				'theme-fanout-A': 'theme-a',
				'theme-fanout-B': 'theme-b',
			};
			if (!actions[operation])
				throw new Error(`unknown memo-wall evidence operation ${operation}`);
			return actions[operation];
		}
	}, operation);
}

async function measureOperation({ browser, origin, observations, operation, protocol }) {
	if (operation === 'mount') return await measureMount(browser, origin, observations, protocol);
	const bench = await openBenchPage(browser, origin, observations);
	try {
		await bench.page.evaluate(async () => {
			await window.__memoWallBench.mount();
			await window.__memoWallBench.invoke('fill-a');
			await window.__memoWallBench.invoke('fill-b');
			for (let attempt = 0; attempt < 400; attempt++) {
				if (
					document.querySelectorAll('#wall-a .item').length === 1_000 &&
					document.querySelectorAll('#wall-b .item').length === 1_000
				)
					break;
				await new Promise((resolve) => setTimeout(resolve, 5));
			}
		});
		bench.setPhase('timed');
		const samples = await bench.page.evaluate(
			async ({ action, warmups, iterations, repetitions, yieldMs }) => {
				const api = window.__memoWallBench;
				if (typeof window.gc !== 'function')
					throw new Error('Chromium did not expose forced GC');
				const output = [];
				for (let sample = 0; sample < warmups + iterations; sample++) {
					window.gc();
					const started = performance.now();
					for (let repeat = 0; repeat < repetitions; repeat++) await api.invoke(action);
					const duration = (performance.now() - started) / repetitions;
					if (sample >= warmups) output.push(duration);
					await new Promise((resolve) => setTimeout(resolve, yieldMs));
				}
				return output;
			},
			{
				action: actionForOperation(operation),
				warmups: protocol.operationWarmups,
				iterations: protocol.operationSamples,
				repetitions: repetitionsFor(operation, protocol),
				yieldMs: protocol.sampleYieldMs,
			},
		);
		bench.setPhase('bootstrap');
		return samples;
	} finally {
		await bench.context.close();
	}
}

async function measureMount(browser, origin, observations, protocol) {
	const output = [];
	for (let sample = 0; sample < protocol.operationWarmups + protocol.operationSamples; sample++) {
		const bench = await openBenchPage(browser, origin, observations);
		try {
			bench.setPhase('timed');
			const duration = await bench.page.evaluate(async () => {
				if (typeof window.gc !== 'function')
					throw new Error('Chromium did not expose forced GC');
				window.gc();
				const started = performance.now();
				await window.__memoWallBench.mount();
				await window.__memoWallBench.invoke('fill-a');
				await window.__memoWallBench.invoke('fill-b');
				for (let attempt = 0; attempt < 400; attempt++) {
					if (
						document.querySelectorAll('#wall-a .item').length === 1_000 &&
						document.querySelectorAll('#wall-b .item').length === 1_000
					)
						break;
					await new Promise((resolve) => setTimeout(resolve, 5));
				}
				return performance.now() - started;
			});
			bench.setPhase('bootstrap');
			if (sample >= protocol.operationWarmups) output.push(duration);
		} finally {
			await bench.context.close();
		}
		await new Promise((resolve) => setTimeout(resolve, protocol.sampleYieldMs));
	}
	return output;
}

function actionForOperation(operation) {
	return operation
		.replace('parent-rerender-equal-A', 'equal-a')
		.replace('parent-rerender-equal-B', 'equal-b')
		.replace('one-change-A', 'one-a')
		.replace('one-change-B', 'one-b')
		.replace('theme-fanout-A', 'theme-a')
		.replace('theme-fanout-B', 'theme-b');
}

function repetitionsFor(operation, protocol) {
	if (operation.startsWith('parent-rerender')) return protocol.equalWriteRepetitions;
	if (operation.startsWith('one-change')) return protocol.oneChangeRepetitions;
	if (operation.startsWith('theme-fanout')) return protocol.sharedFanoutRepetitions;
	return 1;
}

function emptyMemory() {
	return {
		label: 'allocator-growth-observation',
		renders: 0,
		rssGrowthBytes: 0,
		heapGrowthBytes: 0,
		forcedGc: false,
	};
}

function writeReceipt(filePath, receipt) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, `${JSON.stringify(receipt, null, '\t')}\n`);
}
