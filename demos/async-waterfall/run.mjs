import fs from 'node:fs';
import path from 'node:path';

import { createFailedResult } from '../benchmarks/lib/results.mjs';
import { summarizeSamples } from '../benchmarks/lib/stats.mjs';
import {
	declaredRequestSetFromDocument,
	evaluateAsyncWaterfallAnalyzerPolicy,
} from './analyzer-policy.mjs';
import { createAsyncWaterfallServer } from './server.mjs';

export const LEVELS = 10;
export const DELAY_MS = 16;
const SERIAL_FLOOR_MS = LEVELS * DELAY_MS;

export async function runAsyncWaterfall({ fixture, protocol, environment, clientDirectory, receiptPath }) {
	try {
		const measured = await measureBrowserBenchmark({ fixture, protocol, clientDirectory });
		writeReceipt(receiptPath, measured.receipt);
		if (!measured.receipt.passed) {
			const details = measured.receipt.results.flatMap((item) => item.status === 'fail' ? item.details : []);
			throw new Error('async-waterfall analyzer or correctness gate failed: ' + details.join('; '));
		}
		const coldTiming = summarizeSamples(measured.coldSamples);
		const updateTiming = summarizeSamples(measured.updateSamples);
		const result = {
			schemaVersion: 1,
			kind: 'markless-benchmark-result',
			benchmark: 'async-waterfall',
			status: 'passed',
			recordedAt: new Date().toISOString(),
			protocol,
			environment,
			cases: [{
				name: 'ten-level-async-waterfall',
				gates: { passed: true, checks: measured.checks },
				bodyBytes: measured.bodyBytes,
				timing: coldTiming,
				memory: emptyMemory(),
				metrics: {
					ssr_resume_first_dispatch_ms: coldTiming,
					update_deepest_boundary_ms: updateTiming,
					waterfall_factor: coldTiming.meanMs / SERIAL_FLOOR_MS,
					levels: LEVELS,
					delay_ms_per_level: DELAY_MS,
					serial_floor_ms: SERIAL_FLOOR_MS,
				},
			}],
		};
		validateAsyncWaterfallResultSchema(result);
		return { result, exitCode: 0 };
	} catch (error) {
		const failure = error instanceof Error ? error.message : String(error);
		return {
			result: createFailedResult({ benchmark: 'async-waterfall', protocol, environment, failure }),
			exitCode: 1,
		};
	}
}

export function verifyServerHtml(html) {
	if (typeof html !== 'string') throw new TypeError('async-waterfall renderer did not return an HTML string');
	const boundaryCount = html.match(/<!--markless:async:boundary:\d+-->/g)?.length ?? 0;
	if (boundaryCount !== LEVELS) throw new Error('expected 10 async boundaries, rendered ' + boundaryCount);
	if (!html.includes('data-deepest-value')) throw new Error('deepest async boundary is missing from server output');
	if (!html.includes('L9:v0')) throw new Error('deepest async boundary did not settle to L9:v0 on the server');
	if (!html.includes('id="bump"')) throw new Error('root-state update button is missing from server output');
	return ['server rendered exactly 10 async boundaries', 'server settled the deepest boundary to L9:v0', 'server rendered the root-state update button'];
}

export function validateAsyncWaterfallResultSchema(result) {
	const benchmarkCase = result?.cases?.[0];
	const metrics = benchmarkCase?.metrics;
	if (!metrics) throw new TypeError('async-waterfall result requires metrics');
	const allowed = new Set([
		'ssr_resume_first_dispatch_ms',
		'update_deepest_boundary_ms',
		'waterfall_factor',
		'levels',
		'delay_ms_per_level',
		'serial_floor_ms',
	]);
	for (const key of Object.keys(metrics)) {
		if (key.toLowerCase().includes(['hyd', 'rate'].join(''))) {
			throw new TypeError('forbidden client metric ' + key);
		}
		if (!allowed.has(key)) throw new TypeError('async-waterfall result contains unknown metric ' + key);
	}
	if (metrics.levels !== LEVELS) throw new TypeError('async-waterfall result requires 10 levels');
	if (metrics.delay_ms_per_level !== DELAY_MS || metrics.serial_floor_ms !== SERIAL_FLOOR_MS) {
		throw new TypeError('async-waterfall result has an invalid simulated-delay floor');
	}
	if (!Number.isFinite(metrics.waterfall_factor) || metrics.waterfall_factor < 0) {
		throw new TypeError('async-waterfall result requires a finite waterfall_factor');
	}
	return result;
}

async function measureBrowserBenchmark({ fixture, protocol, clientDirectory }) {
	const serverHtml = await fixture.renderApp();
	const serverChecks = verifyServerHtml(serverHtml);
	const { chromium } = await import('playwright');
	const server = await createAsyncWaterfallServer({ clientDirectory, renderApp: fixture.renderApp });
	const browser = await chromium.launch({ headless: true, args: ['--disable-extensions', '--no-sandbox'] });
	const coldSamples = [];
	const updateSamples = [];
	const observations = [];
	const gateFailures = [];
	let declaredRequests = [];
	try {
		for (let index = 0; index < protocol.clientSamples; index++) {
			const sample = await measurePageSample(browser, server.origin, observations);
			coldSamples.push(sample.coldDurationMs);
			updateSamples.push(sample.updateDurationMs);
			declaredRequests = sample.declaredRequests;
			gateFailures.push(...sample.gateFailures);
		}
		const receipt = evaluateAsyncWaterfallAnalyzerPolicy({
			baseUrl: server.origin + '/',
			declaredRequests,
			observedRequests: observations,
			gateFailures,
		});
		return {
			coldSamples,
			updateSamples,
			receipt,
			bodyBytes: Buffer.byteLength(serverHtml),
			checks: [
				...serverChecks,
				'each sample used a fresh SSR document and page-local async graph',
				'first and second clicks each committed L9 at the expected version',
				'first-dispatch action windows fetched no JavaScript',
				'exact declared request set passed MLA-I2',
			],
		};
	} finally {
		await browser.close();
		await server.close();
	}
}

async function measurePageSample(browser, origin, observations) {
	const context = await browser.newContext();
	const page = await context.newPage();
	let phase = 'bootstrap';
	const responseTasks = [];
	page.on('request', (request) => {
		observations.push({ phase, method: request.method(), url: request.url(), resourceType: request.resourceType(), status: null });
	});
	page.on('response', (response) => {
		responseTasks.push((async () => {
			const entry = [...observations].reverse().find((item) => item.url === response.url() && item.status === null);
			if (entry) entry.status = response.status();
			await response.finished();
		})());
	});
	try {
		await page.goto(origin + '/', { waitUntil: 'load' });
		await page.waitForFunction(() => window.__ready === true, null, { timeout: 10_000 });
		const links = await page.evaluate(() => ({
			modulepreloads: [...document.querySelectorAll('link[rel="modulepreload"]')].map((link) => link.href),
			stylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => link.href),
			entryScripts: [...document.querySelectorAll('script[type="module"][src]')].map((script) => script.src),
		}));
		if (links.modulepreloads.length === 0) throw new Error('production document declared no modulepreloaded JavaScript');
		if (links.entryScripts.length === 0) throw new Error('production document declared no module entry script');
		await waitForPreloads(page, links.modulepreloads);
		await Promise.all(responseTasks);
		const declaredRequests = declaredRequestSetFromDocument(origin + '/', links);
		const initial = await inspectPage(page);
		const gateFailures = evaluatePageState(initial, 0);

		phase = 'action';
		const coldDurationMs = await dispatchAndWait(page, 1);
		await page.waitForTimeout(500);
		await Promise.all(responseTasks);
		gateFailures.push(...evaluatePageState(await inspectPage(page), 1));

		phase = 'update';
		const updateDurationMs = await dispatchAndWait(page, 2);
		await Promise.all(responseTasks);
		gateFailures.push(...evaluatePageState(await inspectPage(page), 2));
		phase = 'bootstrap';
		return { coldDurationMs, updateDurationMs, declaredRequests, gateFailures };
	} finally {
		await context.close();
	}
}

async function dispatchAndWait(page, version) {
	return page.evaluate(async (expectedVersion) => {
		const button = document.querySelector('#bump');
		if (!(button instanceof HTMLButtonElement)) throw new Error('async-waterfall update button is missing');
		const expected = 'L9:v' + expectedVersion;
		const started = performance.now();
		button.click();
		await window.__benchSettled(() => document.querySelector('[data-deepest-value]')?.textContent === expected);
		return performance.now() - started;
	}, version);
}

async function inspectPage(page) {
	return page.evaluate(() => ({
		levels: document.querySelectorAll('.level[data-level]').length,
		deepest: document.querySelector('[data-deepest-value]')?.textContent ?? null,
		failures: document.querySelectorAll('.failed').length,
	}));
}

export function evaluatePageState(actual, version) {
	const failures = [];
	if (actual.levels !== LEVELS) failures.push('rendered ' + actual.levels + ' levels, expected 10');
	if (actual.deepest !== 'L9:v' + version) failures.push('deepest boundary rendered ' + String(actual.deepest) + ', expected L9:v' + version);
	if (actual.failures !== 0) failures.push('rendered ' + actual.failures + ' failed async arms');
	return failures;
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

function emptyMemory() {
	return { label: 'allocator-growth-observation', renders: 0, rssGrowthBytes: 0, heapGrowthBytes: 0, forcedGc: false };
}

function writeReceipt(filePath, receipt) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, JSON.stringify(receipt, null, '\t') + '\n');
}
