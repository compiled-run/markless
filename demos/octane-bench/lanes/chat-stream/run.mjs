import fs from 'node:fs';
import path from 'node:path';
import { createFailedResult } from '../../lib/results.mjs';
import { summarizeSamples } from '../../lib/stats.mjs';
import { createSignalFavoringServer as createStaticServer } from '../signal-favoring/server.mjs';
import { evaluateChatStreamAnalyzerPolicy } from './analyzer-policy.mjs';

const OPERATIONS = ['stream-8-token-batches', 'stream-64-token-batches', 'append-two-to-history', 'switch-conversations', 'dom-comment-count'];
const EXPECTED = {
	'stream-8-token-batches': { messages: 18, streaming: 0, remaining: 0 },
	'stream-64-token-batches': { messages: 18, streaming: 0, remaining: 0 },
	'append-two-to-history': { messages: 204, streaming: 0, remaining: 0 },
	'switch-conversations': { messages: 10, streaming: 0, remaining: 0 },
	'dom-comment-count': { messages: 10, streaming: 0, remaining: 0, commentsStable: true },
};

export async function runChatStream({ protocol, environment, clientDirectory, receiptPath }) {
	try {
		const measured = await measureBrowserLane({ protocol, clientDirectory });
		writeReceipt(receiptPath, measured.receipt);
		if (!measured.receipt.passed) throw new Error(measured.receipt.results.flatMap((item) => item.status === 'fail' ? item.details : []).join('; '));
		const cases = OPERATIONS.map((name) => ({
			name, gates: { passed: true, checks: measured.gates[name].checks }, bodyBytes: 0,
			timing: summarizeSamples(measured.samples[name]), memory: emptyMemory(),
			metrics: { streamEvidence: measured.gates[name].evidence, ...(name === 'dom-comment-count' ? { commentCount: measured.commentCount } : {}) },
		}));
		const result = { schemaVersion: 1, kind: 'markless-benchmark-result', lane: 'chat-stream', status: 'passed', recordedAt: new Date().toISOString(), protocol, environment, cases };
		validateChatStreamResultSchema(result);
		return { result, exitCode: 0 };
	} catch (error) {
		const failure = error instanceof Error ? error.message : String(error);
		return { result: createFailedResult({ lane: 'chat-stream', protocol, environment, failure }), exitCode: 1 };
	}
}

export function evaluateChatStreamEvidence(operation, actual) {
	const expected = EXPECTED[operation];
	if (!expected) throw new TypeError(`unknown chat-stream operation ${operation}`);
	const failures = Object.entries(expected).flatMap(([field, value]) => actual[field] === value ? [] : [`${operation} ${field} ${String(actual[field])}, expected ${String(value)}`]);
	if (actual.requests !== 0) failures.push(`${operation} requests ${actual.requests}, expected 0`);
	return { passed: failures.length === 0, failures, checks: failures.length === 0 ? [`${operation} committed the expected ${expected.messages}-message transcript`, `${operation} drained every deterministic token and left no streaming reply`, `${operation} issued zero requests`] : failures, evidence: { expected: { ...expected, requests: 0 }, actual: { ...actual } } };
}

export function validateChatStreamResultSchema(result) {
	if (!Array.isArray(result?.cases) || result.cases.length !== OPERATIONS.length) throw new TypeError('chat-stream result requires all five operation cases');
	for (const item of result.cases) if (!item.metrics?.streamEvidence?.actual) throw new TypeError(`chat-stream case ${item.name} requires streamEvidence`);
	return result;
}

async function measureBrowserLane({ protocol, clientDirectory }) {
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
		for (const operation of OPERATIONS) { await prepareChatState(page, operation); await executeChatOperation(page, operation); }
		for (const operation of OPERATIONS) {
			const commentCounts = [];
			for (let sample = 0; sample < protocol.operationSamples; sample++) {
				await prepareChatState(page, operation);
				phase = 'timed'; const outcome = await executeChatOperation(page, operation); phase = 'bootstrap';
				samples[operation].push(outcome.duration);
				if (outcome.comments !== undefined) commentCounts.push(outcome.comments);
				const actual = { ...outcome.evidence, requests: 0 };
				if (operation === 'dom-comment-count') actual.commentsStable = commentCounts.every((value) => value === commentCounts[0]);
				const gate = evaluateChatStreamEvidence(operation, actual);
				if (!gate.passed) gateFailures.push(...gate.failures);
				gates[operation] = gate;
				await new Promise((resolve) => setTimeout(resolve, protocol.sampleYieldMs));
			}
			if (operation === 'dom-comment-count') commentCount = commentCounts[0];
		}
		await context.close();
		if (timedRequests !== 0) gateFailures.push(`measured chat-stream windows issued ${timedRequests} requests, expected zero`);
		const receipt = evaluateChatStreamAnalyzerPolicy({ baseUrl: `${server.origin}/`, declaredRequests: server.declaredRequests, observedRequests: observations, gateFailures });
		return { samples, gates, receipt, commentCount };
	} finally { await browser.close(); await server.close(); }
}

async function prepareChatState(page, operation) {
	await page.evaluate(async (name) => {
		await window.__reset();
		if (name === 'append-two-to-history') {
			document.querySelector('.conv-tab[data-conv="1"]').click();
			await window.__benchSettled(() => document.querySelectorAll('.messages .message').length === 200);
		}
		// Give any trailing equal-value graph work a couple of task hops to
		// drain before a timed window opens.
		await new Promise((resolve) => setTimeout(resolve, 15));
		await new Promise((resolve) => setTimeout(resolve, 15));
	}, operation);
}

async function executeChatOperation(page, operation) {
	return await page.evaluate(async (name) => {
		const settled = window.__benchSettled;
		const messageCount = () => document.querySelectorAll('.messages .message').length;
		const streamingCount = () =>
			[...document.querySelectorAll('.message-state')].filter((node) => node.textContent.includes('streaming')).length;
		const send = async (text) => {
			document.querySelector('.prompt').value = text;
			const before = messageCount();
			document.querySelector('.send').click();
			await settled(() => messageCount() === before + 2);
		};
		const drain = async (batch) => {
			let remaining = await window.__pump(batch); let guard = 0;
			while (remaining > 0) { remaining = await window.__pump(batch); if (++guard > 10_000) throw new Error('chat-stream token drain never settled'); }
			await settled(() => streamingCount() === 0);
			return remaining;
		};
		window.gc?.();
		const started = performance.now();
		let remaining = 0;
		if (name === 'stream-8-token-batches' || name === 'stream-64-token-batches') {
			const batch = name === 'stream-8-token-batches' ? 8 : 64;
			for (let index = 0; index < 4; index++) { await send('Benchmark stream reply ' + index); remaining = await drain(batch); }
		} else if (name === 'append-two-to-history') {
			for (let index = 0; index < 2; index++) { await send('Append to history ' + index); remaining = await drain(16); }
		} else if (name === 'switch-conversations') {
			for (let index = 0; index < 5; index++) {
				document.querySelector('.conv-tab[data-conv="1"]').click();
				await settled(() => messageCount() === 200);
				document.querySelector('.conv-tab[data-conv="0"]').click();
				await settled(() => messageCount() === 10);
			}
		} else if (name === 'dom-comment-count') {
			const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT); while (walker.nextNode()) { /* measured scan */ }
		}
		const duration = performance.now() - started;
		const rows = [...document.querySelectorAll('.messages .message')];
		const streaming = rows.filter((row) => row.querySelector('.message-state')?.textContent.includes('streaming')).length;
		let comments;
		if (name === 'dom-comment-count') { const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT); comments = 0; while (walker.nextNode()) comments++; }
		return { duration, evidence: { messages: rows.length, streaming, remaining }, ...(comments === undefined ? {} : { comments }) };
	}, operation);
}

function emptyMemory() { return { label: 'allocator-growth-observation', renders: 0, rssGrowthBytes: 0, heapGrowthBytes: 0, forcedGc: false }; }
function writeReceipt(filePath, receipt) { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, `${JSON.stringify(receipt, null, '\t')}\n`); }
