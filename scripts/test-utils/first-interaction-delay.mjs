#!/usr/bin/env node
// first-interaction-delay.mjs
//
// Reproducible headless measurement harness for the SSR first-interaction
// delay investigation (goal ssr-first-interaction-delay, task T003).
//
// What it measures:
//   For the SSR music app (demos/music-player-ssr) and its CSR twin
//   (demos/music-player), in prod-shaped preview builds, it measures the
//   time from a real first click (CDP input) to the first observable DOM
//   effect of that click. The interaction is clicking the nav
//   "Library" button (`nav .library-button`), whose deterministic DOM
//   effect in BOTH apps is the button's class changing to
//   "library-button active" (and the root `.App` gaining `library-active`).
//
// How it measures:
//   - Fresh browser context per iteration (cold-in-page first click), cache
//     enabled inside the iteration so modulepreload warming works.
//   - Navigate, wait for `load` + network idle so preloads finish.
//   - In-page: a capture-phase click listener records `event.timeStamp`
//     (the real input timestamp on the performance timeline) and a
//     MutationObserver on the button's class attribute records
//     `performance.now()` when the effect lands.
//     delay = effectTime - clickTimeStamp.
//   - Cross-check: Event Timing API entries (`event` + `first-input`).
//   - Breakdown: performance resource entries that started after the click
//     (transferSize 0 => preload-cache hit / eval-bound, nonzero => cold
//     fetch / preload gap).
//   - All non-localhost requests (YouTube embed, cover art) are blocked so
//     the measurement is hermetic and network idle is reachable.
//
// Usage:
//   node scripts/test-utils/first-interaction-delay.mjs [--skip-build]
//     [--iterations N] [--dev-iterations N] [--skip-dev] [--json-only]
//
// Exits nonzero if any mode fails to produce results.

import { spawn, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);
const flagValue = (name, fallback) => {
	const index = args.indexOf(name);
	if (index === -1 || index + 1 >= args.length) return fallback;
	return Number(args[index + 1]);
};

const config = {
	skipBuild: hasFlag('--skip-build'),
	skipDev: hasFlag('--skip-dev'),
	jsonOnly: hasFlag('--json-only'),
	iterations: flagValue('--iterations', 7),
	devIterations: flagValue('--dev-iterations', 3),
	csrPort: flagValue('--csr-port', 4381),
	ssrPort: flagValue('--ssr-port', 4382),
	ssrDevPort: flagValue('--ssr-dev-port', 4383),
};

const INTERACTION = {
	selector: 'nav .library-button',
	description:
		'click nav .library-button; effect = button class becomes "library-button active" (root .App also gains "library-active")',
};

function log(...parts) {
	if (!config.jsonOnly) console.error(...parts);
}

// --- playwright loader ------------------------------------------------------
// Playwright is a transitive dependency (vitest browser mode); it is not
// hoisted to the workspace root, so fall back to the pnpm store.
async function loadPlaywright() {
	try {
		return await import('playwright');
	} catch {
		const pnpmDir = join(repoRoot, 'node_modules', '.pnpm');
		const entry = readdirSync(pnpmDir).find((name) => /^playwright@\d/.test(name));
		if (!entry) throw new Error('playwright not found in node_modules/.pnpm');
		const requireFromStore = createRequire(
			join(pnpmDir, entry, 'node_modules', 'playwright', 'package.json'),
		);
		return requireFromStore('playwright');
	}
}

// --- server lifecycle -------------------------------------------------------
const runningServers = [];

function startServer({ filter, script, port, label }) {
	const child = spawn(
		'pnpm',
		['--filter', filter, script, '--', '--port', String(port), '--strictPort'],
		{ cwd: repoRoot, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
	);
	let output = '';
	child.stdout.on('data', (chunk) => {
		output += chunk;
	});
	child.stderr.on('data', (chunk) => {
		output += chunk;
	});
	const server = {
		label,
		port,
		child,
		getOutput: () => output,
	};
	runningServers.push(server);
	return server;
}

async function waitForServer(server, timeoutMs = 45_000) {
	const url = `http://localhost:${server.port}/`;
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (server.child.exitCode !== null) {
			throw new Error(
				`${server.label} exited before ready (code ${server.child.exitCode}):\n${server.getOutput()}`,
			);
		}
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
			if (response.ok) return;
		} catch {
			// not ready yet
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error(`${server.label} not ready after ${timeoutMs}ms:\n${server.getOutput()}`);
}

function stopServer(server) {
	if (!server || server.child.exitCode !== null) return;
	try {
		process.kill(-server.child.pid, 'SIGTERM');
	} catch {
		try {
			server.child.kill('SIGTERM');
		} catch {}
	}
}

async function stopAllServers() {
	for (const server of runningServers) stopServer(server);
	await new Promise((r) => setTimeout(r, 750));
	for (const server of runningServers) {
		if (server.child.exitCode === null) {
			try {
				process.kill(-server.child.pid, 'SIGKILL');
			} catch {}
		}
	}
	runningServers.length = 0;
}

process.on('SIGINT', async () => {
	await stopAllServers();
	process.exit(130);
});

// --- builds ------------------------------------------------------------------
function buildApp(filter) {
	log(`[build] ${filter}`);
	const result = spawnSync('pnpm', ['--filter', filter, 'build'], {
		cwd: repoRoot,
		stdio: config.jsonOnly ? 'ignore' : ['ignore', 2, 2],
	});
	if (result.status !== 0) {
		throw new Error(`build failed for ${filter} (exit ${result.status})`);
	}
}

// --- in-page measurement ----------------------------------------------------
async function measureIteration(browser, url, selector) {
	const context = await browser.newContext();
	// Hermetic run: block third-party requests (YouTube embed, cover art) so
	// network idle is reachable and timings are not polluted by the network.
	await context.route('**/*', (route) => {
		const requestUrl = route.request().url();
		if (requestUrl.startsWith('http://localhost:') || requestUrl.startsWith('data:')) {
			route.continue();
		} else {
			route.abort();
		}
	});
	try {
		const page = await context.newPage();
		await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
		// Preloads finish; page "looks ready" to the user.
		await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
		await page.waitForSelector(selector, { state: 'visible', timeout: 10_000 });
		// Small settle so pending microtasks/layout from load are not attributed
		// to the click.
		await page.waitForTimeout(150);

		await page.evaluate((sel) => {
			const target = document.querySelector(sel);
			window.__fid = {
				clickTime: null,
				effectTime: null,
				eventEntries: [],
				preClickResourceCount: performance.getEntriesByType('resource').length,
			};
			window.addEventListener(
				'click',
				(event) => {
					if (window.__fid.clickTime === null) window.__fid.clickTime = event.timeStamp;
				},
				{ capture: true },
			);
			const observer = new MutationObserver(() => {
				if (window.__fid.effectTime === null && target.classList.contains('active')) {
					window.__fid.effectTime = performance.now();
				}
			});
			observer.observe(target, { attributes: true, attributeFilter: ['class'] });
			try {
				new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) {
						window.__fid.eventEntries.push({
							type: entry.entryType,
							name: entry.name,
							startTime: entry.startTime,
							processingStart: entry.processingStart,
							processingEnd: entry.processingEnd,
							duration: entry.duration,
						});
					}
				}).observe({ type: 'event', durationThreshold: 16 });
				new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) {
						window.__fid.eventEntries.push({
							type: entry.entryType,
							name: entry.name,
							startTime: entry.startTime,
							processingStart: entry.processingStart,
							processingEnd: entry.processingEnd,
							duration: entry.duration,
						});
					}
				}).observe({ type: 'first-input' });
			} catch {
				// Event Timing API optional; primary measurement does not need it.
			}
		}, selector);

		// Real input path: Playwright resolves coordinates and dispatches
		// mousedown/mouseup/click through CDP Input.
		await page.click(selector);
		await page.waitForFunction(() => window.__fid.effectTime !== null, null, {
			timeout: 20_000,
		});
		// Let trailing post-click resource entries (late dynamic imports) land.
		await page.waitForTimeout(400);

		return await page.evaluate(() => {
			const { clickTime, effectTime, eventEntries } = window.__fid;
			const postClickResources = performance
				.getEntriesByType('resource')
				.filter((entry) => entry.startTime >= clickTime - 1)
				.map((entry) => ({
					name: entry.name.replace(/^https?:\/\/[^/]+/, ''),
					initiatorType: entry.initiatorType,
					transferSize: entry.transferSize,
					duration: Math.round(entry.duration * 100) / 100,
					startAfterClickMs: Math.round((entry.startTime - clickTime) * 100) / 100,
				}));
			return {
				delayMs: effectTime - clickTime,
				clickTime,
				effectTime,
				eventEntries,
				postClickResources,
			};
		});
	} finally {
		await context.close();
	}
}

async function measureMode(browser, { label, url, iterations, selector }) {
	const results = [];
	for (let i = 0; i < iterations; i++) {
		const iteration = await measureIteration(browser, url, selector);
		results.push(iteration);
		log(`[${label}] iteration ${i + 1}/${iterations}: ${iteration.delayMs.toFixed(1)}ms`);
	}
	return results;
}

// --- stats -------------------------------------------------------------------
function stats(delays) {
	const sorted = [...delays].sort((a, b) => a - b);
	const at = (q) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
	const mean = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
	const variance = sorted.reduce((sum, v) => sum + (v - mean) ** 2, 0) / sorted.length;
	const round = (v) => Math.round(v * 10) / 10;
	return {
		runs: sorted.length,
		min_ms: round(sorted[0]),
		median_ms: round(at(0.5)),
		p90_ms: round(at(0.9)),
		max_ms: round(sorted[sorted.length - 1]),
		mean_ms: round(mean),
		stddev_ms: round(Math.sqrt(variance)),
	};
}

// --- main --------------------------------------------------------------------
async function main() {
	const { chromium } = await loadPlaywright();

	if (!config.skipBuild) {
		buildApp('markless-music-player');
		buildApp('markless-music-player-ssr');
	}

	log('[serve] starting preview servers');
	const csrServer = startServer({
		filter: 'markless-music-player',
		script: 'preview',
		port: config.csrPort,
		label: 'csr-preview',
	});
	const ssrServer = startServer({
		filter: 'markless-music-player-ssr',
		script: 'preview',
		port: config.ssrPort,
		label: 'ssr-preview',
	});
	await Promise.all([waitForServer(csrServer), waitForServer(ssrServer)]);

	const browser = await chromium.launch({ headless: true });
	const report = {
		harness: 'first-interaction-delay',
		date: new Date().toISOString(),
		interaction: INTERACTION.description,
		notes: [
			'fresh browser context per iteration (cold-in-page first click)',
			'non-localhost requests blocked (YouTube embed, cover art) for hermetic timing',
			'delay = DOM class mutation performance.now() - click event.timeStamp',
		],
		modes: {},
	};

	try {
		const ssrResults = await measureMode(browser, {
			label: 'ssr-preview',
			url: `http://localhost:${config.ssrPort}/`,
			iterations: config.iterations,
			selector: INTERACTION.selector,
		});
		const csrResults = await measureMode(browser, {
			label: 'csr-preview',
			url: `http://localhost:${config.csrPort}/`,
			iterations: config.iterations,
			selector: INTERACTION.selector,
		});
		await stopAllServers();

		report.modes['ssr-preview'] = {
			stats: stats(ssrResults.map((r) => r.delayMs)),
			delays_ms: ssrResults.map((r) => Math.round(r.delayMs * 10) / 10),
			postClickResources: ssrResults[ssrResults.length - 1].postClickResources,
			eventTiming: ssrResults[ssrResults.length - 1].eventEntries,
		};
		report.modes['csr-preview'] = {
			stats: stats(csrResults.map((r) => r.delayMs)),
			delays_ms: csrResults.map((r) => Math.round(r.delayMs * 10) / 10),
			postClickResources: csrResults[csrResults.length - 1].postClickResources,
			eventTiming: csrResults[csrResults.length - 1].eventEntries,
		};

		if (!config.skipDev) {
			log('[serve] starting ssr dev server (secondary comparison)');
			const devServer = startServer({
				filter: 'markless-music-player-ssr',
				script: 'dev',
				port: config.ssrDevPort,
				label: 'ssr-dev',
			});
			await waitForServer(devServer, 60_000);
			const devResults = await measureMode(browser, {
				label: 'ssr-dev',
				url: `http://localhost:${config.ssrDevPort}/`,
				iterations: config.devIterations,
				selector: INTERACTION.selector,
			});
			await stopAllServers();
			report.modes['ssr-dev'] = {
				stats: stats(devResults.map((r) => r.delayMs)),
				delays_ms: devResults.map((r) => Math.round(r.delayMs * 10) / 10),
				postClickResources: devResults[devResults.length - 1].postClickResources,
				note: 'dev mode is a secondary comparison; preview numbers are the primary result',
			};
		}
	} finally {
		await browser.close();
		await stopAllServers();
	}

	// --- output ---------------------------------------------------------------
	if (!config.jsonOnly) {
		const rows = Object.entries(report.modes).map(([mode, data]) => ({
			mode,
			runs: data.stats.runs,
			'min ms': data.stats.min_ms,
			'median ms': data.stats.median_ms,
			'p90 ms': data.stats.p90_ms,
			'max ms': data.stats.max_ms,
			'stddev ms': data.stats.stddev_ms,
		}));
		console.error('');
		console.error(`interaction: ${report.interaction}`);
		// stdout is reserved for the JSON report; route the table to stderr.
		new console.Console(process.stderr).table(rows);
		const ssrGap =
			report.modes['ssr-preview'].stats.median_ms - report.modes['csr-preview'].stats.median_ms;
		console.error(
			`SSR - CSR median gap (preview): ${Math.round(ssrGap * 10) / 10}ms`,
		);
		console.error('post-click resources (SSR preview, last iteration):');
		for (const resource of report.modes['ssr-preview'].postClickResources) {
			console.error(
				`  ${resource.name} transferSize=${resource.transferSize} duration=${resource.duration}ms start=+${resource.startAfterClickMs}ms (${resource.initiatorType})`,
			);
		}
		console.error('');
	}
	console.log(JSON.stringify(report, null, 2));
}

main()
	.then(() => process.exit(0))
	.catch(async (error) => {
		console.error('[first-interaction-delay] failed:', error);
		await stopAllServers();
		process.exit(1);
	});
