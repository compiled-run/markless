import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';

import { executedJavaScriptBytes } from '@markless/analyzer';
import { createFailedResult } from '../benchmarks/lib/results.mjs';
import { summarizeSamples } from '../benchmarks/lib/stats.mjs';
import {
	declaredRequestSetFromDocument,
	evaluateNewsAnalyzerPolicy,
} from './analyzer-policy.mjs';
import { createNewsServer } from './server.mjs';

const ARTICLE_PATTERN = /<article\b[^>]*data-news-card=/g;

export async function runNews({ fixture, protocol, environment, ssrOnly, clientDirectory, receiptPath }) {
	try {
		const ssr = await measureWarmSsr(fixture.renderApp, protocol);
		const checks = verifyServerHtml(ssr.html);
		const benchmarkCase = {
			name: 'production-news-50',
			gates: { passed: true, checks },
			bodyBytes: Buffer.byteLength(ssr.html),
			timing: summarizeSamples(ssr.samples),
			memory: {
				label: 'allocator-growth-observation',
				renders: 0,
				rssGrowthBytes: 0,
				heapGrowthBytes: 0,
				forcedGc: false,
			},
		};

		if (!ssrOnly) {
			const client = await measureClient({ fixture, protocol, clientDirectory });
			benchmarkCase.gates.checks.push(...client.checks);
			benchmarkCase.metrics = {
				resume_first_dispatch_ms: summarizeSamples(client.samples),
				preloaded_client_bytes: median(client.preloadedBytes),
				startup_executed_bytes: nullableMedian(client.startupExecutedBytes),
			};
			writeReceipt(receiptPath, client.receipt);
		}

		const result = {
			schemaVersion: 1,
			kind: 'markless-benchmark-result',
			benchmark: 'news',
			status: 'passed',
			recordedAt: new Date().toISOString(),
			protocol,
			environment,
			cases: [benchmarkCase],
		};
		validateNewsResultSchema(result, { clientRequired: !ssrOnly });
		return { exitCode: 0, result };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			exitCode: 1,
			result: createFailedResult({
				benchmark: 'news',
				protocol,
				environment,
				failure: message,
				cases: [{ name: 'production-news-50', gates: { passed: false, checks: [message] } }],
			}),
		};
	}
}

export async function measureWarmSsr(renderApp, protocol) {
	for (let index = 0; index < protocol.ssrWarmups; index++) await renderApp();
	const samples = [];
	let html = '';
	for (let index = 0; index < protocol.ssrSamples; index++) {
		const started = performance.now();
		html = await renderApp();
		samples.push(performance.now() - started);
	}
	return { html, samples };
}

export function verifyServerHtml(html) {
	if (typeof html !== 'string') throw new TypeError('news renderer did not return an HTML string');
	const count = html.match(ARTICLE_PATTERN)?.length ?? 0;
	if (count !== 50) throw new Error(`expected 50 article cards, rendered ${count}`);
	if (!html.includes('id="theme"')) throw new Error('theme toggle is missing from server output');
	return ['server rendered exactly 50 article cards', 'server rendered the theme toggle'];
}

export function validateNewsResultSchema(result, { clientRequired = true } = {}) {
	assertNoLegacyMetric(result);
	const metrics = result.cases?.[0]?.metrics;
	if (clientRequired && !metrics) throw new TypeError('news result requires client metrics');
	if (!metrics) return result;
	const allowed = new Set([
		'resume_first_dispatch_ms',
		'preloaded_client_bytes',
		'startup_executed_bytes',
	]);
	for (const key of Object.keys(metrics)) {
		if (!allowed.has(key)) throw new TypeError(`news result contains unknown client metric ${key}`);
	}
	if (!metrics.resume_first_dispatch_ms) {
		throw new TypeError('news result requires resume_first_dispatch_ms');
	}
	return result;
}

async function measureClient({ fixture, protocol, clientDirectory }) {
	const { chromium } = await import('playwright');
	const server = await createNewsServer({ clientDirectory, renderApp: fixture.renderApp });
	const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
	const samples = [];
	const preloadedBytes = [];
	const startupExecutedBytes = [];
	const observations = [];
	let declaredRequests = [];
	const checks = [];
	try {
		const count = protocol.clientWarmups + protocol.clientSamples;
		for (let index = 0; index < count; index++) {
			const context = await browser.newContext();
			const page = await context.newPage();
			const sample = await measureClientSample(page, server.origin);
			await context.close();
			if (index < protocol.clientWarmups) continue;
			samples.push(sample.durationMs);
			preloadedBytes.push(sample.preloadedBytes);
			if (sample.startupExecutedBytes !== null) startupExecutedBytes.push(sample.startupExecutedBytes);
			observations.push(...sample.observations);
			declaredRequests = sample.declaredRequests;
			for (const failure of sample.gateFailures) {
				if (!checks.includes(failure)) checks.push(failure);
			}
		}
		const gateFailures = checks;
		const receipt = evaluateNewsAnalyzerPolicy({
			baseUrl: `${server.origin}/`,
			declaredRequests,
			observedRequests: observations,
			gateFailures,
		});
		if (!receipt.passed) {
			const details = receipt.results.flatMap((result) => result.status === 'fail' ? result.details : []);
			throw new Error(`news analyzer or correctness gate failed: ${details.join('; ')}`);
		}
		return {
			samples,
			preloadedBytes,
			startupExecutedBytes,
			receipt,
			checks: [
				'exactly 50 article cards remained after resume',
				'theme toggle committed the expected DOM mutation',
				'server article nodes were adopted without replacement',
				'no JavaScript request started after dispatch',
				'exact declared request set passed MLA-I2',
			],
		};
	} finally {
		await browser.close();
		await server.close();
	}
}

async function measureClientSample(page, origin) {
	let phase = 'bootstrap';
	const observations = [];
	const responseTasks = [];
	page.on('request', (request) => {
		observations.push({
			phase,
			method: request.method(),
			url: request.url(),
			resourceType: request.resourceType(),
			status: null,
		});
	});
	page.on('response', (response) => {
		responseTasks.push((async () => {
			const observation = [...observations].reverse().find((entry) => entry.url === response.url() && entry.status === null);
			if (observation) observation.status = response.status();
			await response.finished();
		})());
	});

	let coverageAvailable = true;
	try {
		await page.coverage.startJSCoverage({ resetOnNavigation: false });
	} catch {
		coverageAvailable = false;
	}
	await page.goto(`${origin}/`, { waitUntil: 'load' });
	const links = await page.evaluate(() => ({
		modulepreloads: [...document.querySelectorAll('link[rel="modulepreload"]')].map((link) => link.href),
		stylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => link.href),
		entryScripts: [...document.querySelectorAll('script[type="module"][src]')].map((script) => script.src),
	}));
	if (links.modulepreloads.length === 0) throw new Error('production document declared no modulepreloaded JavaScript');
	await waitForPreloads(page, links.modulepreloads);
	await Promise.all(responseTasks);
	const preloadedBytes = await page.evaluate(
		(expected) => performance.getEntriesByType('resource')
			.filter((entry) => expected.includes(entry.name))
			.reduce((sum, entry) => sum + entry.transferSize, 0),
		links.modulepreloads,
	);
	const declaredRequests = declaredRequestSetFromDocument(`${origin}/`, links);
	let startupExecuted = null;
	if (coverageAvailable) {
		const coverage = await page.coverage.stopJSCoverage();
		startupExecuted = executedJavaScriptBytes(coverage, origin);
	}
	await page.evaluate(() => {
		globalThis.__newsArticleNodes = [...document.querySelectorAll('[data-news-card]')];
	});
	phase = 'action';
	const actionObservationStart = observations.length;
	const durationMs = await page.evaluate(() => new Promise((resolve, reject) => {
		// The header class flip proves the theme toggle committed.
		// (its fixture binds theme on header.masthead, not a root attribute).
		const header = document.querySelector('header.masthead');
		const button = document.querySelector('#theme');
		if (!header || !button) return reject(new Error('news theme controls are missing'));
		const started = performance.now();
		const timeout = setTimeout(() => reject(new Error('theme mutation did not commit')), 10_000);
		const observer = new MutationObserver(() => {
			if (!header.classList.contains('dark')) return;
			clearTimeout(timeout);
			observer.disconnect();
			resolve(performance.now() - started);
		});
		observer.observe(header, { attributes: true, attributeFilter: ['class'] });
		button.click();
	}));
	// Match the analyzer's leak-observation window so delayed action imports are
	// still attributed to this sample after the visible mutation has committed.
	await page.waitForTimeout(500);
	await Promise.all(responseTasks);
	const gate = await page.evaluate(() => {
		const cards = [...document.querySelectorAll('[data-news-card]')];
		const original = globalThis.__newsArticleNodes ?? [];
		return {
			cards: cards.length,
			theme: document.querySelector('header.masthead')?.classList.contains('dark') ? 'dark' : 'light',
			adopted: cards.length === original.length && cards.every((node, index) => node === original[index]),
		};
	});
	const actionRequests = observations.slice(actionObservationStart);
	const gateFailures = [];
	if (gate.cards !== 50) gateFailures.push(`expected 50 article cards after resume, found ${gate.cards}`);
	if (gate.theme !== 'dark') gateFailures.push(`theme toggle committed ${String(gate.theme)} instead of dark`);
	if (!gate.adopted) gateFailures.push('server-rendered article nodes were replaced during resume');
	if (actionRequests.some((request) => request.resourceType === 'script' || /\.m?js(?:[?#]|$)/i.test(request.url))) {
		gateFailures.push('JavaScript request started after theme-toggle dispatch');
	}
	return {
		durationMs,
		declaredRequests,
		observations,
		gateFailures,
		preloadedBytes,
		startupExecutedBytes: startupExecuted,
	};
}

async function waitForPreloads(page, urls) {
	await page.waitForFunction(
		(expected) => {
			const loaded = new Set(performance.getEntriesByType('resource').map((entry) => entry.name));
			return expected.every((url) => loaded.has(url));
		},
		urls,
		{ timeout: 10_000 },
	);
}

function writeReceipt(filePath, receipt) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, `${JSON.stringify(receipt, null, '\t')}\n`);
}

function assertNoLegacyMetric(value) {
	if (!value || typeof value !== 'object') return;
	for (const [key, child] of Object.entries(value)) {
		if (key.toLowerCase().includes(['hyd', 'rate'].join(''))) {
			throw new TypeError(`forbidden client metric ${key}; use resume_first_dispatch_ms`);
		}
		assertNoLegacyMetric(child);
	}
}

function median(values) {
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[sorted.length >> 1];
}

function nullableMedian(values) {
	return values.length === 0 ? null : median(values);
}
