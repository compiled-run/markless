import fs from 'node:fs';
import path from 'node:path';

import { createFailedResult } from '../../lib/results.mjs';
import { summarizeSamples } from '../../lib/stats.mjs';
import { evaluateSignalFavoringAnalyzerPolicy } from './analyzer-policy.mjs';
import { createSignalFavoringServer } from './server.mjs';

const OPERATIONS = [
	'mount',
	'shallow-write',
	'middle-write',
	'deep-write',
	'forward-sweep',
	'batched-forward-sweep',
	'reverse-sweep',
	'unmount',
];
const EXPECTED_EVIDENCE = {
	mount: { recomputations: 100, domMutations: 100, mutationBatches: 1, requests: 0 },
	'shallow-write': { recomputations: 100, domMutations: 100, mutationBatches: 1, requests: 0 },
	'middle-write': { recomputations: 50, domMutations: 50, mutationBatches: 1, requests: 0 },
	'deep-write': { recomputations: 10, domMutations: 10, mutationBatches: 1, requests: 0 },
	'forward-sweep': { recomputations: 550, domMutations: 550, mutationBatches: 10, requests: 0 },
	'batched-forward-sweep': { recomputations: 100, domMutations: 100, mutationBatches: 1, requests: 0 },
	'reverse-sweep': { recomputations: 100, domMutations: 100, mutationBatches: 1, requests: 0 },
	unmount: { recomputations: 0, domMutations: 100, mutationBatches: 1, requests: 0 },
	'equal-write': { recomputations: 0, domMutations: 0, mutationBatches: 0, requests: 0 },
};

export async function runSignalFavoring({ protocol, environment, clientDirectory, receiptPath }) {
	try {
		const measured = await measureBrowserLane({ protocol, clientDirectory });
		writeReceipt(receiptPath, measured.receipt);
		if (!measured.receipt.passed) {
			const details = measured.receipt.results.flatMap((result) => result.status === 'fail' ? result.details : []);
			throw new Error(`signal-favoring analyzer or correctness gate failed: ${details.join('; ')}`);
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
			lane: 'signal-favoring',
			status: 'passed',
			recordedAt: new Date().toISOString(),
			protocol,
			environment,
			cases,
		};
		validateSignalFavoringResultSchema(result);
		return { exitCode: 0, result };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			exitCode: 1,
			result: createFailedResult({
				lane: 'signal-favoring',
				protocol,
				environment,
				failure: message,
				cases: [{ name: 'signal-favoring', gates: { passed: false, checks: [message] } }],
			}),
		};
	}
}

export function evaluateOperationEvidence(operation, actual) {
	const expected = EXPECTED_EVIDENCE[operation];
	if (!expected) throw new TypeError(`unknown signal-favoring operation ${operation}`);
	const failures = Object.entries(expected).flatMap(([field, value]) => actual[field] === value
		? []
		: [`${operation} ${field} ${String(actual[field])}, expected ${value}`]);
	return {
		passed: failures.length === 0,
		failures,
		checks: failures.length === 0
			? [
				`${operation} recomputed exactly ${expected.recomputations} fixture computeds`,
				`${operation} mutated exactly ${expected.domMutations} reactive DOM nodes in ${expected.mutationBatches} observer batch(es)`,
				`${operation} issued zero requests`,
			]
			: failures,
		evidence: { expected: { ...expected }, actual: { ...actual } },
	};
}

export function validateSignalFavoringResultSchema(result) {
	if (!Array.isArray(result.cases) || result.cases.length === 0) {
		throw new TypeError('signal-favoring result requires cases');
	}
	for (const benchmarkCase of result.cases) {
		const evidence = benchmarkCase.metrics?.counterEvidence;
		if (!evidence?.actual || !evidence?.expected) {
			throw new TypeError(`signal-favoring case ${benchmarkCase.name} requires counterEvidence`);
		}
		for (const field of ['recomputations', 'domMutations', 'mutationBatches', 'requests']) {
			if (!Number.isInteger(evidence.actual[field]) || evidence.actual[field] < 0) {
				throw new TypeError(`signal-favoring case ${benchmarkCase.name} requires integer counterEvidence.actual.${field}`);
			}
		}
	}
	return result;
}

async function measureBrowserLane({ protocol, clientDirectory }) {
	const { chromium } = await import('playwright');
	const server = await createSignalFavoringServer({ clientDirectory });
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
			for (const operation of [...OPERATIONS, 'equal-write']) {
				const evidence = await collectEvidence(semantic.page, operation);
				evidence.requests = semantic.timedRequestCount();
				const gate = evaluateOperationEvidence(operation, evidence);
				if (!gate.passed) gateFailures.push(...gate.failures);
				if (operation !== 'equal-write') gates[operation] = gate;
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
		if (timedRequests !== 0) gateFailures.push(`measured propagation windows issued ${timedRequests} requests, expected zero`);
		const receipt = evaluateSignalFavoringAnalyzerPolicy({
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
		pendingResponses.push((async () => {
			const observation = [...observations].reverse().find((entry) => entry.url === response.url() && entry.status === null);
			if (observation) observation.status = response.status();
			await response.finished();
		})());
	});
	await page.goto(`${origin}/`, { waitUntil: 'load' });
	await page.waitForFunction(() => window.__ready === true, null, { timeout: 10_000 });
	// Prime render()'s production dynamic imports before any measured mount.
	await page.evaluate(async () => {
		await window.__signalFavoringBench.mount();
		await window.__signalFavoringBench.unmount();
	});
	await Promise.all(pendingResponses);
	return {
		context,
		page,
		setPhase(next) { phase = next; },
		timedRequestCount() { return timedRequests; },
	};
}

async function collectEvidence(page, operation) {
	await page.evaluate(async () => {
		await window.__signalFavoringBench.unmount();
		window.__signalFavoringBench.resetEvaluationCounters();
	});
	return await page.evaluate(async ({ name, expectedRecomputations }) => {
		const api = window.__signalFavoringBench;
		const root = document.querySelector('#app');
		if (!root) throw new Error('signal-favoring root is missing');
		let domMutations = 0;
		let mutationBatches = 0;
		const reactiveNodes = (node) => {
			if (node.nodeType === Node.TEXT_NODE) return node.parentElement?.matches('[data-value]') ? 1 : 0;
			if (!(node instanceof Element)) return 0;
			return (node.matches('[data-value]') ? 1 : 0) + node.querySelectorAll('[data-value]').length;
		};
		const observer = new MutationObserver((records) => {
			mutationBatches++;
			for (const record of records) {
				if (record.type === 'characterData') domMutations++;
				else for (const node of [...record.addedNodes, ...record.removedNodes]) domMutations += reactiveNodes(node);
			}
		});
		observer.observe(root, { childList: true, characterData: true, subtree: true });
		// Dispatched clicks commit on a later task than graph.flush(), so
		// every phase waits on its observable effect: mount on the deepest
		// output existing, writes on the fixture-owned evaluation counters
		// reaching the expected total, zero-work cases on a quiet window.
		const recomputationSum = () => api.readEvaluationCounters().reduce((sum, count) => sum + count, 0);
		const until = async (predicate, label) => {
			// Sweeps drive ten sequential deep writes (550 recomputations) and a
			// fresh context demand-loads symbol chunks on first use, so the
			// evidence wait is generous; exactness is still gated on the counts.
			for (let attempt = 0; attempt < 6_000; attempt++) {
				if (predicate()) return;
				await new Promise((resolve) => setTimeout(resolve, 5));
			}
			throw new Error(`signal-favoring evidence wait timed out: ${label}`);
		};
		const quiet = () => new Promise((resolve) => setTimeout(resolve, 40));
		if (name === 'mount') {
			await api.mount();
			await until(() => document.querySelector("[data-value='100']")?.textContent !== '', 'mount deepest output');
			await quiet();
		} else {
			await api.mount();
			await until(() => document.querySelector("[data-value='100']")?.textContent !== '', 'mount deepest output');
			await quiet();
			domMutations = 0;
			mutationBatches = 0;
			api.resetEvaluationCounters();
			if (name === 'shallow-write') await api.write(1);
			else if (name === 'middle-write') await api.write(51);
			else if (name === 'deep-write') await api.write(91);
			else if (name === 'forward-sweep') await api.forwardSweep();
			else if (name === 'batched-forward-sweep') await api.batchedForwardSweep();
			else if (name === 'reverse-sweep') await api.reverseSweep();
			else if (name === 'equal-write') await api.equalWrite();
			else if (name === 'unmount') await api.unmount();
			else throw new Error(`unknown evidence operation ${name}`);
			if (name === 'unmount') await until(() => root.querySelector('#signal-chain') === null || root.childElementCount === 0, 'unmount teardown');
			else if (expectedRecomputations > 0) await until(() => recomputationSum() >= expectedRecomputations, `${name} recomputations`);
			await quiet();
		}
		observer.disconnect();
		const recomputations = recomputationSum();
		return { recomputations, domMutations, mutationBatches };
	}, { name: operation, expectedRecomputations: EXPECTED_EVIDENCE[operation]?.recomputations ?? 0 });
}

async function measureOperation({ browser, origin, observations, operation, protocol }) {
	if (operation === 'mount') return await measureMount(browser, origin, observations, protocol);
	const bench = await openBenchPage(browser, origin, observations);
	try {
		if (operation !== 'unmount') await bench.page.evaluate(() => window.__signalFavoringBench.mount());
		bench.setPhase('timed');
		const samples = await bench.page.evaluate(async ({ name, warmups, iterations, repetitions, yieldMs }) => {
			const api = window.__signalFavoringBench;
			if (typeof window.gc !== 'function') throw new Error('Chromium did not expose forced GC');
			const invoke = async () => {
				if (name === 'shallow-write') await api.write(1);
				else if (name === 'middle-write') await api.write(51);
				else if (name === 'deep-write') await api.write(91);
				else if (name === 'forward-sweep') await api.forwardSweep();
				else if (name === 'batched-forward-sweep') await api.batchedForwardSweep();
				else if (name === 'reverse-sweep') await api.reverseSweep();
				else if (name === 'unmount') await api.unmount();
			};
			const output = [];
			for (let sample = 0; sample < warmups + iterations; sample++) {
				if (name === 'unmount') await api.mount();
				window.gc();
				const started = performance.now();
				for (let repeat = 0; repeat < repetitions; repeat++) await invoke();
				const duration = (performance.now() - started) / repetitions;
				if (sample >= warmups) output.push(duration);
				await new Promise((resolve) => setTimeout(resolve, yieldMs));
			}
			return output;
		}, {
			name: operation,
			warmups: protocol.operationWarmups,
			iterations: protocol.operationSamples,
			repetitions: repetitionsFor(operation, protocol),
			yieldMs: protocol.sampleYieldMs,
		});
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
				if (typeof window.gc !== 'function') throw new Error('Chromium did not expose forced GC');
				window.gc();
				const started = performance.now();
				await window.__signalFavoringBench.mount();
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

function repetitionsFor(operation, protocol) {
	if (operation === 'shallow-write' || operation === 'middle-write' || operation === 'deep-write') {
		return protocol.writeRepetitions;
	}
	if (operation.includes('sweep')) return protocol.sweepRepetitions;
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
