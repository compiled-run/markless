import fs from 'node:fs';
import path from 'node:path';

import { createFailedResult } from '../benchmarks/lib/results.mjs';
import { summarizeSamples } from '../benchmarks/lib/stats.mjs';
import { createComputedChainServer as createStaticServer } from '../computed-chain/server.mjs';
import { evaluateDbmonAnalyzerPolicy } from './analyzer-policy.mjs';

const OPERATIONS = ['mount', 'full-tick', 'partial-tick', 'all-new-key-remount', 'sort-reorder', 'unmount'];
// The unconditional row writer yields exact tick write counts (7,000 full,
// 700 partial). changedCells comes from a full cell-snapshot diff and its
// band proves values really changed (5,968 full / 596 partial with the
// current corpus) - a broken writer cannot pass on counts alone. Per-field
// suppression remains the benchmark's improvement hypothesis; the naive
// live-node-compare attempt was measured, rejected, and reverted (see the
// pinned pair under baselines/pairs/dbmon/).
const EXPECTED = {
	mount: { rows: 1_000, cells: 7_000 },
	'full-tick': { rows: 1_000, cells: 7_000, textMutations: 7_000, changedCellsMin: 5_500, changedCellsMax: 6_000 },
	'partial-tick': { rows: 1_000, cells: 7_000, textMutations: 700, changedCellsMin: 550, changedCellsMax: 600 },
	'all-new-key-remount': { rows: 1_000, cells: 7_000 },
	'sort-reorder': { rows: 1_000, cells: 7_000 },
	unmount: { rows: 0, cells: 0 },
};

export async function runDbmon({ protocol, environment, clientDirectory, receiptPath }) {
	try {
		const measured = await measureBrowserBenchmark({ protocol, clientDirectory });
		writeReceipt(receiptPath, measured.receipt);
		if (!measured.receipt.passed) {
			throw new Error(measured.receipt.results.flatMap((item) => item.status === 'fail' ? item.details : []).join('; '));
		}
		const cases = OPERATIONS.map((name) => ({
			name,
			gates: { passed: true, checks: measured.gates[name].checks },
			bodyBytes: 0,
			timing: summarizeSamples(measured.samples[name]),
			memory: emptyMemory(),
			metrics: { semanticEvidence: measured.gates[name].evidence },
		}));
		const result = passedResult({ protocol, environment, cases });
		validateDbmonResultSchema(result);
		return { result, exitCode: 0 };
	} catch (error) {
		const failure = error instanceof Error ? error.message : String(error);
		return { result: createFailedResult({ benchmark: 'dbmon', protocol, environment, failure }), exitCode: 1 };
	}
}

export function evaluateDbmonEvidence(operation, actual) {
	const expected = EXPECTED[operation];
	if (!expected) throw new TypeError(`unknown dbmon operation ${operation}`);
	const fixedFields = Object.entries(expected).filter(([field]) => !field.startsWith('changedCells'));
	const failures = fixedFields.flatMap(([field, value]) => actual[field] === value ? [] : [`${operation} ${field} ${String(actual[field])}, expected ${value}`]);
	if (expected.changedCellsMin !== undefined && !(actual.changedCells >= expected.changedCellsMin && actual.changedCells <= expected.changedCellsMax)) {
		failures.push(`${operation} changed ${String(actual.changedCells)} cells, expected ${expected.changedCellsMin}..${expected.changedCellsMax}`);
	}
	if (actual.requests !== 0) failures.push(`${operation} requests ${actual.requests}, expected 0`);
	if (operation === 'full-tick' && actual.survivingRows !== 1_000) failures.push('full-tick did not reuse all 1,000 keyed rows');
	if (operation === 'partial-tick' && actual.survivingRows !== 1_000) failures.push('partial-tick did not reuse all 1,000 keyed rows');
	if (operation === 'all-new-key-remount' && actual.survivingRows !== 0) failures.push('all-new-key-remount retained old keyed rows');
	if (operation === 'sort-reorder' && actual.survivingRows !== 1_000) failures.push('sort-reorder rebuilt keyed rows');
	return {
		passed: failures.length === 0,
		failures,
		checks: failures.length === 0 ? [
			`${operation} rendered ${expected.rows} rows and ${expected.cells} cells`,
			...(expected.textMutations === undefined ? [] : [`${operation} committed exactly ${expected.textMutations} text mutations over ${String(actual.changedCells)} value changes`]),
			`${operation} preserved the required keyed identity and issued zero requests`,
		] : failures,
		evidence: { expected: { ...expected, requests: 0 }, actual: { ...actual } },
	};
}

export function validateDbmonResultSchema(result) {
	if (!Array.isArray(result?.cases) || result.cases.length !== OPERATIONS.length) throw new TypeError('dbmon result requires all six operation cases');
	for (const benchmarkCase of result.cases) {
		if (!benchmarkCase.metrics?.semanticEvidence?.actual) throw new TypeError(`dbmon case ${benchmarkCase.name} requires semanticEvidence`);
	}
	return result;
}

async function measureBrowserBenchmark({ protocol, clientDirectory }) {
	const { chromium } = await import('playwright');
	const server = await createStaticServer({ clientDirectory });
	const browser = await chromium.launch({ headless: true, args: ['--disable-extensions', '--no-sandbox', '--js-flags=--expose-gc'] });
	const observations = [];
	const gateFailures = [];
	try {
		const bench = await openPage(browser, server.origin, observations);
		let gates;
		try {
			gates = await semanticGates(bench);
			for (const gate of Object.values(gates)) if (!gate.passed) gateFailures.push(...gate.failures);
		} finally { await bench.context.close(); }
		const samples = {};
		for (const operation of OPERATIONS) samples[operation] = await measureOperation(browser, server.origin, observations, operation, protocol);
		const receipt = evaluateDbmonAnalyzerPolicy({ baseUrl: `${server.origin}/`, declaredRequests: server.declaredRequests, observedRequests: observations, gateFailures });
		return { gates, samples, receipt };
	} finally { await browser.close(); await server.close(); }
}

async function openPage(browser, origin, observations) {
	const context = await browser.newContext();
	const page = await context.newPage();
	let phase = 'bootstrap';
	let timedRequests = 0;
	page.on('request', (request) => {
		if (phase === 'timed') timedRequests++;
		observations.push({ phase, method: request.method(), url: request.url(), resourceType: request.resourceType(), status: null });
	});
	page.on('response', (response) => {
		const entry = [...observations].reverse().find((item) => item.url === response.url() && item.status === null);
		if (entry) entry.status = response.status();
	});
	await page.goto(`${origin}/`, { waitUntil: 'load' });
	await page.waitForFunction(() => window.__ready === true, null, { timeout: 10_000 });
	await page.evaluate(() => {
		const root = document.querySelector('#app');
		const counters = { text: 0 };
		const counting = new MutationObserver((records) => {
			for (const record of records) if (record.type === 'characterData') counters.text++;
		});
		counting.observe(root, { characterData: true, subtree: true });
		window.__benchCounters = counters;
		// Commits land on a later task than graph.flush(), so timed windows and
		// gates wait on the observable DOM effect of each dispatched action.
		window.__benchSettled = (predicate, timeoutMs = 10_000) =>
			new Promise((resolve, reject) => {
				if (predicate()) { resolve(); return; }
				const timer = setTimeout(() => { observer.disconnect(); reject(new Error('dbmon commit wait timed out')); }, timeoutMs);
				const observer = new MutationObserver(() => {
					if (!predicate()) return;
					clearTimeout(timer);
					observer.disconnect();
					resolve();
				});
				observer.observe(root, { childList: true, characterData: true, subtree: true });
			});
	});
	return { context, page, setPhase(value) { phase = value; }, timedRequests() { return timedRequests; } };
}

async function semanticGates(bench) {
	const actual = await bench.page.evaluate(async () => {
		const api = window.__dbmonBench;
		const settled = window.__benchSettled;
		const counters = window.__benchCounters;
		const rows = () => [...document.querySelectorAll('.dbmon tbody > tr')];
		const firstName = () => rows()[0]?.querySelector('.dbname')?.textContent;
		const quiet = () => new Promise((resolve) => setTimeout(resolve, 25));
		const snapshot = (survivingRows = 0, textMutations) => ({ rows: rows().length, cells: document.querySelectorAll('.dbmon tbody td').length, survivingRows, ...(textMutations === undefined ? {} : { textMutations }) });
		await api.mount(); await api.invoke('fill');
		await settled(() => rows().length === 1_000 && firstName() === 'cluster-0');
		await quiet();
		const mountedRows = rows();
		const mount = snapshot();
		// The unconditional row writer rewrites all 7,000 cells per full tick
		// (700 per partial tick) and the gate requires those exact counts.
		// The cell-snapshot diff additionally proves the workload is real: a
		// silently broken writer (finding 10's failure class) cannot pass on
		// mutation counts alone because changedCells would fall out of band.
		// commitFloor only detects the commit batch; exactness is gated above.
		const cellTexts = () => [...document.querySelectorAll('.dbmon tbody td')].map((cell) => cell.textContent);
		const observe = async (action, commitFloor) => {
			const beforeTexts = cellTexts();
			const before = counters.text;
			await api.invoke(action);
			await settled(() => counters.text >= before + commitFloor);
			await quiet();
			const afterTexts = cellTexts();
			let changedCells = 0;
			for (let index = 0; index < afterTexts.length; index++) if (afterTexts[index] !== beforeTexts[index]) changedCells++;
			return { textMutations: counters.text - before, changedCells };
		};
		const fullObserved = await observe('tick', 4_000);
		const fullRows = rows();
		const full = { ...snapshot(fullRows.filter((row) => mountedRows.includes(row)).length, fullObserved.textMutations), changedCells: fullObserved.changedCells };
		const partialBefore = rows();
		const partialObserved = await observe('tick-partial', 400);
		const partial = { ...snapshot(rows().filter((row) => partialBefore.includes(row)).length, partialObserved.textMutations), changedCells: partialObserved.changedCells };
		const remountBefore = rows();
		await api.invoke('remount');
		await settled(() => rows().length === 1_000 && firstName() === 'cluster-1000');
		await quiet();
		const remount = snapshot(rows().filter((row) => remountBefore.includes(row)).length);
		const sortBefore = rows();
		const orderOf = () => rows().map((row) => row.querySelector('.dbname')?.textContent).join('|');
		const orderBefore = orderOf();
		await api.invoke('sort');
		await settled(() => orderOf() !== orderBefore);
		await quiet();
		const sortRows = rows();
		const sort = { ...snapshot(sortRows.filter((row) => sortBefore.includes(row)).length), orderChanged: orderOf() !== orderBefore };
		await api.unmount();
		await settled(() => rows().length === 0);
		const unmount = snapshot();
		return { mount, 'full-tick': full, 'partial-tick': partial, 'all-new-key-remount': remount, 'sort-reorder': sort, unmount };
	});
	const gates = {};
	for (const operation of OPERATIONS) {
		actual[operation].requests = bench.timedRequests();
		const gate = evaluateDbmonEvidence(operation, actual[operation]);
		if (operation === 'sort-reorder' && actual[operation].orderChanged !== true) {
			gate.passed = false; gate.failures.push('sort-reorder did not change row order'); gate.checks = gate.failures;
		}
		gates[operation] = gate;
	}
	return gates;
}

async function measureOperation(browser, origin, observations, operation, protocol) {
	const samples = [];
	const count = protocol.operationWarmups + protocol.operationSamples;
	if (operation === 'mount') {
		for (let index = 0; index < count; index++) {
			const bench = await openPage(browser, origin, observations);
			try {
				bench.setPhase('timed');
				const duration = await bench.page.evaluate(async () => {
					window.gc?.(); const started = performance.now();
					await window.__dbmonBench.mount(); await window.__dbmonBench.invoke('fill');
					await window.__benchSettled(() => document.querySelectorAll('.dbmon tbody > tr').length === 1_000);
					return performance.now() - started;
				});
				bench.setPhase('bootstrap'); if (index >= protocol.operationWarmups) samples.push(duration);
			} finally { await bench.context.close(); }
		}
		return samples;
	}
	const bench = await openPage(browser, origin, observations);
	try {
		for (let index = 0; index < count; index++) {
			if (operation === 'unmount' || index === 0) {
				await bench.page.evaluate(async () => {
					if (document.querySelector('.dbmon tbody > tr')) await window.__dbmonBench.unmount();
					await window.__dbmonBench.mount(); await window.__dbmonBench.invoke('fill');
					await window.__benchSettled(() => document.querySelectorAll('.dbmon tbody > tr').length === 1_000);
				});
			}
			bench.setPhase('timed');
			const duration = await bench.page.evaluate(async (name) => {
				const settled = window.__benchSettled;
				const counters = window.__benchCounters;
				const rows = () => document.querySelectorAll('.dbmon tbody > tr');
				const firstName = () => rows()[0]?.querySelector('.dbname')?.textContent;
				window.gc?.(); const started = performance.now();
				if (name === 'unmount') {
					await window.__dbmonBench.unmount();
					await settled(() => rows().length === 0);
				} else if (name === 'full-tick' || name === 'partial-tick') {
					// Commit-detection floor only: the commit lands as one batch, so
				// any threshold below the real count stops the clock at the same
				// observer callback; exact write counts are gated in semanticGates.
				const expected = counters.text + (name === 'full-tick' ? 4_000 : 400);
					await window.__dbmonBench.invoke(name === 'full-tick' ? 'tick' : 'tick-partial');
					await settled(() => counters.text >= expected);
				} else if (name === 'all-new-key-remount') {
					const before = firstName();
					await window.__dbmonBench.invoke('remount');
					await settled(() => rows().length === 1_000 && firstName() !== before);
				} else {
					const orderOf = () => [...rows()].map((row) => row.querySelector('.dbname')?.textContent).join('|');
					const before = orderOf();
					await window.__dbmonBench.invoke('sort');
					await settled(() => orderOf() !== before);
				}
				return performance.now() - started;
			}, operation);
			bench.setPhase('bootstrap'); if (index >= protocol.operationWarmups) samples.push(duration);
			await new Promise((resolve) => setTimeout(resolve, protocol.sampleYieldMs));
		}
		return samples;
	} finally { await bench.context.close(); }
}

function passedResult({ protocol, environment, cases }) { return { schemaVersion: 1, kind: 'markless-benchmark-result', benchmark: 'dbmon', status: 'passed', recordedAt: new Date().toISOString(), protocol, environment, cases }; }
function emptyMemory() { return { label: 'allocator-growth-observation', renders: 0, rssGrowthBytes: 0, heapGrowthBytes: 0, forcedGc: false }; }
function writeReceipt(filePath, receipt) { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, `${JSON.stringify(receipt, null, '\t')}\n`); }
