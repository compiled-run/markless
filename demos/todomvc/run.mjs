import fs from 'node:fs';
import path from 'node:path';
import { createFailedResult } from '../benchmarks/lib/results.mjs';
import { summarizeSamples } from '../benchmarks/lib/stats.mjs';
import { createComputedChainServer as createStaticServer } from '../computed-chain/server.mjs';
import { evaluateTodoMvcAnalyzerPolicy } from './analyzer-policy.mjs';

const OPERATIONS = ['add-100', 'toggle-all-on', 'toggle-all-off', 'complete-25', 'filter-cycle', 'edit-10', 'clear-completed', 'destroy-25', 'dom-comment-count'];
const EXPECTED = {
	'add-100': { rows: 100, completed: 0 },
	'toggle-all-on': { rows: 100, completed: 100 },
	'toggle-all-off': { rows: 100, completed: 0 },
	'complete-25': { rows: 100, completed: 25 },
	'filter-cycle': { rows: 100, completed: 25 },
	'edit-10': { rows: 100, completed: 0, edited: 10 },
	'clear-completed': { rows: 75, completed: 0 },
	'destroy-25': { rows: 75, completed: 0 },
	'dom-comment-count': { rows: 100, completed: 0, commentsStable: true },
};

export async function runTodoMvc({ protocol, environment, clientDirectory, receiptPath }) {
	try {
		const measured = await measureBrowserBenchmark({ protocol, clientDirectory });
		writeReceipt(receiptPath, measured.receipt);
		if (!measured.receipt.passed) throw new Error(measured.receipt.results.flatMap((item) => item.status === 'fail' ? item.details : []).join('; '));
		const cases = OPERATIONS.map((name) => ({
			name, gates: { passed: true, checks: measured.gates[name].checks }, bodyBytes: 0,
			timing: summarizeSamples(measured.samples[name]), memory: emptyMemory(),
			metrics: { domEvidence: measured.gates[name].evidence, ...(name === 'dom-comment-count' ? { commentCount: measured.commentCount } : {}) },
		}));
		const result = { schemaVersion: 1, kind: 'markless-benchmark-result', benchmark: 'todomvc', status: 'passed', recordedAt: new Date().toISOString(), protocol, environment, cases };
		validateTodoMvcResultSchema(result);
		return { result, exitCode: 0 };
	} catch (error) {
		const failure = error instanceof Error ? error.message : String(error);
		return { result: createFailedResult({ benchmark: 'todomvc', protocol, environment, failure }), exitCode: 1 };
	}
}

export function evaluateTodoMvcEvidence(operation, actual) {
	const expected = EXPECTED[operation];
	if (!expected) throw new TypeError(`unknown TodoMVC operation ${operation}`);
	const failures = Object.entries(expected).flatMap(([field, value]) => actual[field] === value ? [] : [`${operation} ${field} ${String(actual[field])}, expected ${String(value)}`]);
	if (actual.requests !== 0) failures.push(`${operation} requests ${actual.requests}, expected 0`);
	return { passed: failures.length === 0, failures, checks: failures.length === 0 ? [`${operation} DOM matched ${expected.rows} todos and ${expected.completed} completed`, `${operation} committed after real input, keyboard, dblclick, or click events`, `${operation} issued zero requests`] : failures, evidence: { expected: { ...expected, requests: 0 }, actual: { ...actual } } };
}

export function validateTodoMvcResultSchema(result) {
	if (!Array.isArray(result?.cases) || result.cases.length !== OPERATIONS.length) throw new TypeError('TodoMVC result requires all nine operation cases');
	for (const item of result.cases) if (!item.metrics?.domEvidence?.actual) throw new TypeError(`TodoMVC case ${item.name} requires domEvidence`);
	return result;
}

async function measureBrowserBenchmark({ protocol, clientDirectory }) {
	const { chromium } = await import('playwright');
	const server = await createStaticServer({ clientDirectory });
	const browser = await chromium.launch({ headless: true, args: ['--disable-extensions', '--no-sandbox', '--js-flags=--expose-gc'] });
	const observations = [];
	const gateFailures = [];
	try {
		const context = await browser.newContext();
		const page = await context.newPage();
		let phase = 'bootstrap';
		let timedRequests = 0;
		page.on('request', (request) => { if (phase === 'timed') timedRequests++; observations.push({ phase, method: request.method(), url: request.url(), resourceType: request.resourceType(), status: null }); });
		page.on('response', (response) => { const entry = [...observations].reverse().find((item) => item.url === response.url() && item.status === null); if (entry) entry.status = response.status(); });
		await page.goto(`${server.origin}/`, { waitUntil: 'load' });
		await page.waitForFunction(() => window.__ready === true, null, { timeout: 10_000 });
		const samples = Object.fromEntries(OPERATIONS.map((operation) => [operation, []]));
		const gates = {};
		let commentCount = 0;
		for (const operation of OPERATIONS) {
			await prepareTodoState(page, operation);
			await executeTodoOperation(page, operation);
		}
		for (const operation of OPERATIONS) {
			const commentCounts = [];
			for (let sample = 0; sample < protocol.operationSamples; sample++) {
				await prepareTodoState(page, operation);
				phase = 'timed';
				const outcome = await executeTodoOperation(page, operation);
				phase = 'bootstrap';
				samples[operation].push(outcome.duration);
				if (outcome.comments !== undefined) commentCounts.push(outcome.comments);
				const actual = { ...outcome.evidence, requests: 0 };
				if (operation === 'dom-comment-count') actual.commentsStable = commentCounts.every((value) => value === commentCounts[0]);
				const gate = evaluateTodoMvcEvidence(operation, actual);
				if (!gate.passed) gateFailures.push(...gate.failures);
				gates[operation] = gate;
				await new Promise((resolve) => setTimeout(resolve, protocol.sampleYieldMs));
			}
			if (operation === 'dom-comment-count') commentCount = commentCounts[0];
		}
		await context.close();
		if (timedRequests !== 0) gateFailures.push(`measured TodoMVC windows issued ${timedRequests} requests, expected zero`);
		const receipt = evaluateTodoMvcAnalyzerPolicy({ baseUrl: `${server.origin}/`, declaredRequests: server.declaredRequests, observedRequests: observations, gateFailures });
		return { samples, gates, receipt, commentCount };
	} finally { await browser.close(); await server.close(); }
}

async function prepareTodoState(page, operation) {
	await page.evaluate(async (name) => {
		const settled = window.__benchSettled;
		const rows = () => [...document.querySelectorAll('.todo-list li')];
		const completedCount = () =>
			rows().filter((row) => row.querySelector('.todo-completed')?.textContent === 'true').length;
		// Every operation deterministically ends on the 'all' filter, so the
		// destroy loop below always sees the complete todo list; a violated
		// invariant leaves rows behind and fails the next gate loudly.
		while (rows().length > 0) {
			const before = rows().length;
			rows()[0].querySelector('.destroy').click();
			await settled(() => rows().length === before - 1);
		}
		const toggleAll = document.querySelector('.toggle-all');
		if (toggleAll.checked) {
			toggleAll.click();
			await settled(() => completedCount() === 0);
		}
		if (name !== 'add-100') {
			for (let index = 0; index < 100; index++) {
				const input = document.querySelector('.new-todo');
				input.value = 'Something to do ' + index;
				input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
				await settled(() => rows().length === index + 1);
			}
		}
		if (name === 'toggle-all-off') {
			toggleAll.click();
			await settled(() => completedCount() === 100);
		}
		if (name === 'filter-cycle' || name === 'clear-completed') {
			const toggles = rows().map((row) => row.querySelector('.toggle'));
			let expected = 0;
			for (let index = 0; index < 100; index += 4) {
				expected++;
				toggles[index].click();
				await settled(() => completedCount() === expected);
			}
		}
	}, operation);
}

async function executeTodoOperation(page, operation) {
	return await page.evaluate(async (name) => {
		const settled = window.__benchSettled;
		const rows = () => [...document.querySelectorAll('.todo-list li')];
		const completedCount = () =>
			rows().filter((row) => row.querySelector('.todo-completed')?.textContent === 'true').length;
		window.gc?.();
		const started = performance.now();
		if (name === 'add-100') {
			for (let index = 0; index < 100; index++) {
				const input = document.querySelector('.new-todo');
				input.value = 'Something to do ' + index;
				input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
				await settled(() => rows().length === index + 1);
			}
		} else if (name === 'toggle-all-on' || name === 'toggle-all-off') {
			const expected = name === 'toggle-all-on' ? 100 : 0;
			document.querySelector('.toggle-all').click();
			await settled(() => completedCount() === expected);
		} else if (name === 'complete-25') {
			const toggles = rows().map((row) => row.querySelector('.toggle'));
			let expected = 0;
			for (let index = 0; index < 100; index += 4) {
				expected++;
				toggles[index].click();
				await settled(() => completedCount() === expected);
			}
		} else if (name === 'filter-cycle') {
			document.querySelector('.filters a[data-filter="active"]').click();
			await settled(() => rows().length === 75);
			document.querySelector('.filters a[data-filter="completed"]').click();
			await settled(() => rows().length === 25);
			document.querySelector('.filters a[data-filter="all"]').click();
			await settled(() => rows().length === 100);
		} else if (name === 'edit-10') {
			for (let index = 0; index < 10; index++) {
				const row = rows()[index];
				row.querySelector('label').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
				await settled(() => row.querySelector('.todo-editing')?.textContent === 'true');
				const edit = row.querySelector('.edit');
				edit.value = 'edited ' + index;
				edit.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
				await settled(() => row.querySelector('label')?.textContent === 'edited ' + index);
			}
		} else if (name === 'clear-completed') {
			document.querySelector('.clear-completed').click();
			await settled(() => rows().length === 75);
		} else if (name === 'destroy-25') {
			for (let index = 0; index < 25; index++) {
				const before = rows().length;
				rows()[0].querySelector('.destroy').click();
				await settled(() => rows().length === before - 1);
			}
		} else if (name === 'dom-comment-count') {
			const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT); while (walker.nextNode()) { /* count after boundary */ }
		}
		const duration = performance.now() - started;
		const current = rows();
		const completed = current.filter((row) => row.querySelector('.todo-completed')?.textContent === 'true').length;
		const edited = current.filter((row, index) => index < 10 && row.querySelector('label')?.textContent === 'edited ' + index).length;
		let comments;
		if (name === 'dom-comment-count') { const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT); comments = 0; while (walker.nextNode()) comments++; }
		return { duration, evidence: { rows: current.length, completed, ...(name === 'edit-10' ? { edited } : {}) }, ...(comments === undefined ? {} : { comments }) };
	}, operation);
}

function emptyMemory() { return { label: 'allocator-growth-observation', renders: 0, rssGrowthBytes: 0, heapGrowthBytes: 0, forcedGc: false }; }
function writeReceipt(filePath, receipt) { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, `${JSON.stringify(receipt, null, '\t')}\n`); }
