// Method provenance: goals/unified-render-model/notes/T006-measure.mjs and
// goals/unified-render-model/notes/executed-decompose.mjs, copied by technique
// on 2026-08-01. The gitignored originals remain evidence, not dependencies.

import { spawn } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASYNC_BOUNDARY_ARM } from '../../packages/serializer/src/protocol.ts';

const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(PACKAGE_DIR, '../..');
// Use an already-installed workspace importer before this new package has had
// its first pnpm install; after install this resolves the same pinned version.
const require = createRequire(resolve(ROOT, 'demos/news/package.json'));
const { chromium } = require('playwright');
const BASELINE_PATH = resolve(PACKAGE_DIR, 'baselines/executed-at-load.json');
const FIXED_MICROTASK_TURNS = 8;
// Measured 2,958 bytes: listeners plus the press-time page fetch that keeps a navigation to one round.
const STATIC_ROUTER_BRIDGE_DOWNLOAD_CAP = 3_072;
// Measured 862 bytes: the bridge adding its listeners and the inline line that calls it.
const STATIC_ROUTER_EXECUTED_AT_LOAD_CAP = 1_024;
// Measured 15,323 bytes: the resume entry, the route's lean dispatch and its helpers; the full resume runtime is fallback only.
const STATIC_ROUTER_FIRST_CLICK_DOWNLOAD_CAP = 16_384;
// Measured 364 ms (runs 356-366); unmet target 212 ms, the time before static pages stopped preloading code (252 ms here).
const STATIC_ROUTER_NAVIGATION_MS_CAP = 384;
// Measured 8 ms (runs 7-9) with idle preloading the next pages' code; 9 ms is what the page took when it preloaded everything at load.
const STATIC_ROUTER_FAST_NAVIGATION_MS_CAP = 9;
const NAVIGATION_SAMPLES = 5;
// 150 ms latency, 1.6 Mbps down: the network profile the navigation regression was reported under.
const THROTTLED_NETWORK = {
	offline: false,
	latency: 150,
	downloadThroughput: 1_600_000 / 8,
	uploadThroughput: 750_000 / 8,
};
const MODE = process.argv[2];
// Whole-app executed bytes grow with app code, so they are reported against the last accepted
// numbers, never gated (owner ruling 2026-09-24). The gate is the four proofs plus exact repeatability.
const ACCEPTED_LOAD_BYTES = {
	'music-player-csr': 543,
	'music-player-ssr': 1_216,
	'live-feed-csr': 3_693,
	'live-feed-ssr': 1_323,
};

const combos = [
	{
		id: 'music-player-csr',
		demo: 'demos/music-player',
		environment: 'csr',
		path: '/',
		settledSelector: '.youtube-frame-host[data-command="cue"]',
		proof: proveMusicPlayer,
		interact: interactMusicPlayer,
	},
	{
		id: 'music-player-ssr',
		demo: 'demos/music-player-ssr',
		environment: 'ssr',
		path: '/',
		settledSelector: '.youtube-frame-host[data-command="cue"]',
		proof: proveMusicPlayer,
		interact: interactMusicPlayer,
	},
	{
		id: 'live-feed-csr',
		demo: 'demos/live-feed',
		environment: 'csr',
		path: '/?latency=0',
		settledSelector: '[data-update-list][data-row-count="3"]',
		proof: proveLiveFeedCsr,
		interact: interactLiveFeedCsr,
	},
	{
		id: 'live-feed-ssr',
		demo: 'demos/live-feed-ssr',
		environment: 'ssr',
		path: '/?latency=0',
		settledSelector: '[data-update-list][data-row-count="3"]',
		proof: proveLiveFeedSsr,
		interact: interactLiveFeed,
	},
];

// Free high ports, so concurrent runs on one machine never collide.
for (const combo of combos) combo.port = await freePort();

if (MODE !== 'baseline' && MODE !== 'gate') {
	throw new Error('Usage: node measure.mjs baseline|gate');
}

const repeatCount = MODE === 'gate' ? 3 : 1;
const measurements = {};
const heldPendingRuns = [];

for (const combo of process.env.MARKLESS_MEASURE_ONLY_STATIC_ROUTER ? [] : combos) {
	console.log(`\n== ${combo.id}: consumer build ==`);
	await run('pnpm', ['--dir', resolve(ROOT, combo.demo), 'build'], {
		env: { ...process.env, MARKLESS_CONSUMER_BUILD: '1' },
	});
	const preview = startPreview(combo);
	try {
		await waitForServer(comboUrl(combo), preview);
		const runs = [];
		for (let runIndex = 0; runIndex < repeatCount; runIndex++) {
			console.log(`-- proof then coverage run ${runIndex + 1}/${repeatCount}`);
			await runProof(combo);
			runs.push(await measureCombo(combo));
		}
		assertRepeatable(combo.id, runs);
		if (MODE === 'gate') reportLoadBytes(combo.id, runs[0]);
		measurements[combo.id] = runs[0];
		console.log(
			`-- ${combo.id}: load=${runs[0].totalExecutedBytes} payload-script=${runs[0].payloadScriptBytes} post-interaction=${runs[0].postInteraction.totalExecutedBytes}`,
		);

		if (combo.id === 'live-feed-ssr') {
			for (let runIndex = 0; runIndex < repeatCount; runIndex++) {
				console.log(`-- held-pending diagnostic ${runIndex + 1}/${repeatCount}`);
				await proveHeldPendingSsr(combo);
				heldPendingRuns.push(
					await measureCombo({
						...combo,
						id: 'live-feed-ssr-held-pending',
						path: '/?latency=900',
						// Diagnostic scenario: record executed bytes only. Whether the
						// STREAMED-settle path wires in-arm records is a separate open
						// question (see T005 findings); no interaction is asserted here.
						interact: null,
						// Self-wake execution continues past the settled marker, so a
						// single snapshot races it; capture only once quiesced.
						stabilize: true,
					}),
				);
			}
			assertRepeatable('live-feed-ssr-held-pending', heldPendingRuns);
		}
	} finally {
		try {
			process.kill(-preview.pid, 'SIGTERM');
		} catch {
			preview.kill('SIGTERM');
		}
		await waitForExit(preview);
	}
}

await gateStaticRouter();
if (process.env.MARKLESS_MEASURE_ONLY_STATIC_ROUTER) process.exit(0);

const proofIds = Object.keys(measurements);
if (proofIds.length !== combos.length || combos.some((combo) => !measurements[combo.id])) {
	throw new Error('All four proved combinations must be present before recording.');
}

if (MODE === 'baseline') {
	const baseline = {
		schemaVersion: 1,
		commit: (await capture('git', ['rev-parse', 'HEAD'], { cwd: ROOT })).trim(),
		date: new Date().toISOString(),
		metric: 'v8-precise-coverage-executed-bytes',
		posture: {
			consumerBuild: true,
			coverageStartedBeforeNavigation: true,
			settleWindow: { kind: 'fixed-microtasks', turns: FIXED_MICROTASK_TURNS },
			scriptFilter: 'same-origin',
			ordinarySsr: 'server-settled-fast-endpoint',
		},
		combos: measurements,
		diagnostics: {
			heldPendingSsr: {
				classification: 'held-pending-self-wake-diagnostic-not-ordinary-lazy-ssr',
				measurement: heldPendingRuns[0],
			},
		},
	};
	await writeJsonAtomically(BASELINE_PATH, baseline);
	console.log(`\nWrote ${BASELINE_PATH}`);
} else {
	const baseline = JSON.parse(await readFile(BASELINE_PATH, 'utf8'));
	assertBaselineShape(baseline);
	console.log(
		'\nGate passed: four proofs green and three runs exactly repeatable. Executed bytes are reported above, not gated.',
	);
}

// Any straggler handle (an orphaned pipe, a browser that ignored close) must
// not turn a finished measurement into an hours-long silent hang.
process.exit(0);

// A router page with no handlers runs no framework code at load and downloads only the link bridge's intent listener;
// at idle it may fetch next-page HTML, never framework modules. The counter page is the one-handler comparison.
async function gateStaticRouter() {
	const combo = { id: 'static-router', demo: 'demos/static-router', path: '/' };
	combo.port = await freePort();
	console.log(`\n== ${combo.id}: consumer build ==`);
	await run('pnpm', ['--dir', resolve(ROOT, combo.demo), 'build'], {
		env: { ...process.env, MARKLESS_CONSUMER_BUILD: '1' },
	});
	const preview = startPreview(combo);
	try {
		await waitForServer(comboUrl(combo), preview);
		const runs = [];
		for (let runIndex = 0; runIndex < repeatCount; runIndex++)
			runs.push(await measureStaticRouter(combo));
		const signatures = runs.map((entry) => JSON.stringify(entry));
		if (signatures.some((signature) => signature !== signatures[0]))
			throw new Error(`static-router was not exactly repeatable:\n${signatures.join('\n')}`);
		const { staticPage, handlerPage } = runs[0];
		console.log(
			`-- static-router "/": downloaded ${staticPage.downloadedBytes} bytes of JS at load (${staticPage.downloads.map((d) => `${d.url} ${d.bytes}`).join(', ') || 'none'}), executed ${staticPage.executedBytes} (${staticPage.executed.map((d) => `${d.url} ${d.executedBytes}`).join(', ') || 'none'}); after idle downloaded ${staticPage.afterIdle.downloadedBytes}, executed ${staticPage.afterIdle.executedBytes}.`,
		);
		console.log(
			`-- static-router "/counter/": downloaded ${handlerPage.downloadedBytes} bytes of JS at load, executed ${handlerPage.executedBytes}; after the first click executed ${handlerPage.afterClick.executedBytes} (${handlerPage.afterClick.executed.map((d) => `${d.url} ${d.executedBytes}`).join(', ')}); downloads ${handlerPage.downloads.map((d) => `${d.url} ${d.bytes}`).join(', ')}.`,
		);
		console.log(
			`-- static-router "/counter/": the first click needed ${handlerPage.firstClick.downloadedBytes} bytes of JS downloaded (${handlerPage.firstClick.downloads.map((d) => `${d.url} ${d.bytes}`).join(', ')}).`,
		);
		const failed = [];
		if (handlerPage.firstClick.downloadedBytes > STATIC_ROUTER_FIRST_CLICK_DOWNLOAD_CAP)
			failed.push(
				`static-router "/counter/": the first click needed ${handlerPage.firstClick.downloadedBytes} bytes of JS downloaded; it must stay within ${STATIC_ROUTER_FIRST_CLICK_DOWNLOAD_CAP}.`,
			);
		const navigation = await measureStaticNavigation(combo);
		console.log(
			`-- static-router "/" -> "/counter/" under 150 ms / 1.6 Mbps: median ${navigation.cold.median} ms (${navigation.cold.samples.join(', ')}); after idle median ${navigation.afterIdle.median} ms (${navigation.afterIdle.samples.join(', ')}).`,
		);
		if (navigation.cold.median > STATIC_ROUTER_NAVIGATION_MS_CAP)
			failed.push(
				`static-router: navigating from "/" to "/counter/" took a median ${navigation.cold.median} ms under throttling; it must stay within ${STATIC_ROUTER_NAVIGATION_MS_CAP}.`,
			);
		if (navigation.afterIdle.median > navigation.cold.median)
			failed.push(
				`static-router: navigating after idle (${navigation.afterIdle.median} ms) was slower than without idle (${navigation.cold.median} ms).`,
			);
		console.log(
			`-- static-router "/" -> "/counter/" unthrottled after idle: median ${navigation.fastAfterIdle.median} ms (${navigation.fastAfterIdle.samples.join(', ')}).`,
		);
		if (navigation.fastAfterIdle.median > STATIC_ROUTER_FAST_NAVIGATION_MS_CAP)
			failed.push(
				`static-router: after idle on a fast connection, navigating from "/" to "/counter/" took a median ${navigation.fastAfterIdle.median} ms; it must stay within ${STATIC_ROUTER_FAST_NAVIGATION_MS_CAP}.`,
			);
		if (failed.length) throw new Error(failed.join('\n'));
	} finally {
		try {
			process.kill(-preview.pid, 'SIGTERM');
		} catch {
			preview.kill('SIGTERM');
		}
		await waitForExit(preview);
	}
}

async function measureStaticRouter(combo) {
	const url = comboUrl(combo);
	const origin = new URL(url).origin;
	const browser = await chromium.launch();
	try {
		const staticRun = await openMeasuredPage(browser);
		const { page, cdp, scriptUrlById, downloads, fragments, failures } = staticRun;
		await page.goto(url, { waitUntil: 'load' });
		await fixedMicrotaskWindow(page);
		const atLoad = coverageSnapshot(
			await cdp.send('Profiler.takePreciseCoverage'),
			url,
			scriptUrlById,
		);
		const loadDownloads = downloads.map((entry) => entry);
		await staticRun.settled();
		const bridgePath = await page.evaluate(
			() =>
				/import b from"([^"]+)"/.exec(
					document.querySelector('script[data-markless-router-link-resumer]')
						?.textContent ?? '',
				)?.[1] ?? null,
		);
		const preloads = await page.evaluate(() =>
			[...document.querySelectorAll('link[rel="modulepreload"]')].map(
				(link) => new URL(link.href).pathname,
			),
		);
		const frameworkDownloads = loadDownloads.filter((entry) => entry.url !== bridgePath);
		if (
			!bridgePath ||
			frameworkDownloads.length > 0 ||
			preloads.some((href) => href !== bridgePath)
		)
			throw new Error(
				`static-router "/": a page with no handlers must download only the link bridge at load; bridge ${bridgePath}, downloads ${JSON.stringify(loadDownloads)}, modulepreloads ${JSON.stringify(preloads)}.`,
			);
		const bridgeBytes = loadDownloads.reduce((sum, entry) => sum + entry.bytes, 0);
		if (bridgeBytes > STATIC_ROUTER_BRIDGE_DOWNLOAD_CAP)
			throw new Error(
				`static-router "/": the link bridge downloads ${bridgeBytes} bytes at load; its intent listener must stay within ${STATIC_ROUTER_BRIDGE_DOWNLOAD_CAP}.`,
			);
		const frameworkExecuted = atLoad.scripts.filter(
			(script) => script.url !== '/' && script.url !== bridgePath,
		);
		if (frameworkExecuted.length > 0)
			throw new Error(
				`static-router "/": no framework module may execute at load; ran ${JSON.stringify(frameworkExecuted)}.`,
			);
		if (atLoad.executedBytes > STATIC_ROUTER_EXECUTED_AT_LOAD_CAP)
			throw new Error(
				`static-router "/": ${atLoad.executedBytes} bytes ran at load; installing the link listeners must stay within ${STATIC_ROUTER_EXECUTED_AT_LOAD_CAP}.`,
			);

		await page.evaluate(
			() =>
				new Promise((done) => {
					globalThis.__releaseIdle();
					requestIdleCallback(() => setTimeout(done, 1_000), { timeout: 5_000 });
				}),
		);
		await page.waitForLoadState('networkidle');
		await staticRun.settled();
		const idleDownloadedBytes = downloads.reduce((sum, entry) => sum + entry.bytes, 0);
		const afterIdle = coverageSnapshot(
			await cdp.send('Profiler.takePreciseCoverage'),
			url,
			scriptUrlById,
		);
		const idleModules = downloads.filter((entry) => !entry.url.startsWith('/_markless/links/'));
		const idleRan = afterIdle.scripts.filter(
			(script) => script.url !== '/' && !script.url.startsWith('/_markless/links/'),
		);
		if (idleModules.length === 0 || idleRan.length > 0)
			throw new Error(
				`static-router "/": idle preloads the next pages' code without running it; downloaded ${JSON.stringify(idleModules)}, ran ${JSON.stringify(idleRan)}.`,
			);

		// In-place navigation still swaps on a click, and the swapped-in page resumes.
		await page.evaluate(() => (globalThis.__staticRouterSameDocument = true));
		await page.click('a[href="/counter/"]');
		await waitForText(page, 'h1', 'Counter');
		if (!(await page.evaluate(() => globalThis.__staticRouterSameDocument === true)))
			throw new Error(
				'static-router: the Counter link reloaded the document instead of swapping in place.',
			);
		if (!fragments.some((path) => path.includes('/counter')))
			throw new Error(
				'static-router: the Counter link swapped without fetching its fragment.',
			);
		await page.click('[data-counter]');
		await waitForText(page, '[data-counter]', 'Count 1');
		failures.assertClean('static-router "/"');
		await page.close();

		const handlerRun = await openMeasuredPage(browser);
		const handlerUrl = new URL('/counter/', url).href;
		await handlerRun.page.goto(handlerUrl, { waitUntil: 'load' });
		await fixedMicrotaskWindow(handlerRun.page);
		const handlerAtLoad = coverageSnapshot(
			await handlerRun.cdp.send('Profiler.takePreciseCoverage'),
			handlerUrl,
			handlerRun.scriptUrlById,
		);
		const handlerDownloads = [...handlerRun.downloads];
		await handlerRun.settled();
		await handlerRun.page.click('[data-counter]');
		await waitForText(handlerRun.page, '[data-counter]', 'Count 1');
		await fixedMicrotaskWindow(handlerRun.page);
		const handlerAfterClick = coverageSnapshot(
			await handlerRun.cdp.send('Profiler.takePreciseCoverage'),
			handlerUrl,
			handlerRun.scriptUrlById,
		);
		await handlerRun.settled();
		const firstClickDownloads = handlerRun.downloads.filter(
			(entry) => !entry.url.startsWith('/_markless/links/'),
		);
		handlerRun.failures.assertClean('static-router "/counter/"');

		return {
			staticPage: {
				downloadedBytes: bridgeBytes,
				downloads: loadDownloads,
				executedBytes: atLoad.executedBytes,
				executed: atLoad.scripts,
				afterIdle: {
					downloadedBytes: idleDownloadedBytes,
					executedBytes: afterIdle.executedBytes,
				},
			},
			handlerPage: {
				downloadedBytes: handlerDownloads.reduce((sum, entry) => sum + entry.bytes, 0),
				executedBytes: handlerAtLoad.executedBytes,
				downloads: handlerDownloads,
				afterClick: {
					executedBytes: handlerAfterClick.executedBytes,
					executed: handlerAfterClick.scripts,
				},
				firstClick: {
					downloadedBytes: firstClickDownloads.reduce(
						(sum, entry) => sum + entry.bytes,
						0,
					),
					downloads: firstClickDownloads,
				},
			},
		};
	} finally {
		await browser.close();
	}

	async function openMeasuredPage(browser) {
		const page = await browser.newPage();
		const failures = capturePageFailures(page);
		const cdp = await page.context().newCDPSession(page);
		const scriptUrlById = new Map();
		const downloads = [];
		const fragments = [];
		await cdp.send('Profiler.enable');
		await cdp.send('Debugger.enable');
		cdp.on('Debugger.scriptParsed', (event) => scriptUrlById.set(event.scriptId, event.url));
		await cdp.send('Profiler.startPreciseCoverage', {
			callCount: false,
			detailed: true,
			allowTriggeredUpdates: false,
		});
		// Idle work is after load by definition; hold it so the load snapshot never races an idle callback.
		await page.addInitScript(() => {
			const held = [];
			const idle = globalThis.requestIdleCallback.bind(globalThis);
			globalThis.requestIdleCallback = (callback, options) => held.push([callback, options]);
			globalThis.__releaseIdle = () => {
				globalThis.requestIdleCallback = idle;
				for (const [callback, options] of held.splice(0)) idle(callback, options);
			};
		});
		const bodies = [];
		page.on('request', (request) => {
			const requestUrl = new URL(request.url());
			if (requestUrl.origin !== origin) return;
			if (request.resourceType() === 'fetch') fragments.push(requestUrl.pathname);
			if (!requestUrl.pathname.endsWith('.js')) return;
			const entry = { url: requestUrl.pathname, bytes: 0 };
			downloads.push(entry);
			bodies.push(
				request
					.response()
					.then((response) => response?.body())
					.then((body) => (entry.bytes = body?.length ?? 0))
					.catch(() => {}),
			);
		});
		const settled = () => Promise.all(bodies);
		return { page, cdp, scriptUrlById, downloads, fragments, failures, settled };
	}
}

// Pointer press on the Counter link until its heading is in the document, timed in the page.
async function measureStaticNavigation(combo) {
	const browser = await chromium.launch();
	try {
		const sample = async (afterIdle, network) => {
			const context = await browser.newContext();
			try {
				const page = await context.newPage();
				const failures = capturePageFailures(page);
				const cdp = await context.newCDPSession(page);
				await cdp.send('Network.enable');
				if (network) await cdp.send('Network.emulateNetworkConditions', network);
				await page.addInitScript((holdIdle) => {
					if (holdIdle) globalThis.requestIdleCallback = () => 0;
					addEventListener(
						'pointerdown',
						() => (globalThis.__navStart = performance.now()),
						{
							capture: true,
						},
					);
					new MutationObserver(() => {
						if (
							globalThis.__navEnd === undefined &&
							document.querySelector('h1')?.textContent === 'Counter'
						)
							globalThis.__navEnd = performance.now();
					}).observe(document, { subtree: true, childList: true, characterData: true });
				}, !afterIdle);
				await page.goto(comboUrl(combo), { waitUntil: 'load' });
				await page.waitForLoadState('networkidle');
				if (afterIdle) {
					await page.evaluate(
						() =>
							new Promise((done) =>
								requestIdleCallback(() => setTimeout(done, 500), {
									timeout: 5_000,
								}),
							),
					);
					await page.waitForLoadState('networkidle');
				}
				await page.evaluate(() => (globalThis.__navSameDocument = true));
				await page.click('a[href="/counter/"]');
				await page.waitForFunction(() => globalThis.__navEnd !== undefined, null, {
					timeout: 15_000,
				});
				if (!(await page.evaluate(() => globalThis.__navSameDocument === true)))
					throw new Error('static-router: the timed navigation reloaded the document.');
				failures.assertClean('static-router navigation timing');
				return Math.round(
					await page.evaluate(() => globalThis.__navEnd - globalThis.__navStart),
				);
			} finally {
				await context.close();
			}
		};
		const series = async (afterIdle, network = THROTTLED_NETWORK) => {
			const samples = [];
			for (let index = 0; index < NAVIGATION_SAMPLES; index++)
				samples.push(await sample(afterIdle, network));
			const sorted = [...samples].sort((a, b) => a - b);
			return { median: sorted[sorted.length >> 1], samples };
		};
		return {
			cold: await series(false),
			afterIdle: await series(true),
			fastAfterIdle: await series(true, null),
		};
	} finally {
		await browser.close();
	}
}

function startPreview(combo) {
	const child = spawn(
		'pnpm',
		[
			'--dir',
			resolve(ROOT, combo.demo),
			'preview',
			'--host',
			'127.0.0.1',
			'--port',
			String(combo.port),
			'--strictPort',
		],
		{
			cwd: ROOT,
			env: { ...process.env, MARKLESS_CONSUMER_BUILD: '1' },
			stdio: ['ignore', 'pipe', 'pipe'],
			// The pnpm wrapper spawns the real vite server as a grandchild; a
			// plain child.kill orphans it, leaking the preview port and hanging
			// the script at exit. Own the whole process group instead.
			detached: true,
		},
	);
	child.stdout.pipe(process.stdout);
	child.stderr.pipe(process.stderr);
	return child;
}

async function runProof(combo) {
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		const failures = capturePageFailures(page);
		await combo.proof(page, combo);
		failures.assertClean(combo.id);
	} finally {
		await browser.close();
	}
}

async function measureCombo(combo) {
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		const failures = capturePageFailures(page);
		const cdp = await page.context().newCDPSession(page);
		const scriptUrlById = new Map();
		await cdp.send('Profiler.enable');
		await cdp.send('Runtime.enable');
		await cdp.send('Debugger.enable');
		cdp.on('Debugger.scriptParsed', (event) => scriptUrlById.set(event.scriptId, event.url));
		await cdp.send('Profiler.startPreciseCoverage', {
			callCount: false,
			detailed: true,
			allowTriggeredUpdates: false,
		});

		const url = comboUrl(combo);
		const heldAtSettleArrival = combo.id === 'live-feed-csr';
		if (heldAtSettleArrival) await installSettleArrivalBridge(page);
		await page.goto(url, { waitUntil: heldAtSettleArrival ? 'domcontentloaded' : 'load' });
		// S4 machine record: the served HTML's payload-script bytes. The payload
		// delta work (T002) is judged on this number; zero for empty-delta pages.
		// A settle fill plan is payload too — it is data the page ships so the
		// browser need not execute a description, so it counts here or the
		// executed number would fall by moving bytes rather than removing them.
		const payloadScriptBytes = await page.evaluate(() =>
			[
				...document.querySelectorAll(
					'script[type="markless/state"],script[type="markless/view"],script[type="markless/fill-plan"]',
				),
			]
				.map((script) => script.textContent?.length ?? 0)
				.reduce((total, length) => total + length, 0),
		);
		await assertBoundaryDecisionFieldsAgree(page, combo.id, combo.environment);
		if (heldAtSettleArrival) await releaseSettleArrivalBridge(page);
		await page.waitForSelector(combo.settledSelector, {
			timeout: 15_000,
			...(heldAtSettleArrival ? { state: 'attached' } : {}),
		});
		await fixedMicrotaskWindow(page);
		const beforeInteraction = combo.stabilize
			? await stableCoverageSnapshot(cdp, url, scriptUrlById, page, combo.id)
			: coverageSnapshot(await cdp.send('Profiler.takePreciseCoverage'), url, scriptUrlById);
		if (heldAtSettleArrival) {
			await page.waitForLoadState('load');
		}

		const pointer = trackPointer(page);
		if (combo.interact) await combo.interact(page);
		await fixedMicrotaskWindow(page);
		await pointer.settle();
		await fixedMicrotaskWindow(page);
		const postInteraction = coverageSnapshot(
			await cdp.send('Profiler.takePreciseCoverage'),
			url,
			scriptUrlById,
		);
		await cdp.send('Profiler.stopPreciseCoverage');
		failures.assertClean(combo.id);
		return {
			proof: 'green',
			posture: combo.environment === 'ssr' ? 'server-settled' : 'client-settled',
			path: combo.path,
			payloadScriptBytes,
			totalExecutedBytes: beforeInteraction.executedBytes,
			perScript: beforeInteraction.scripts,
			postInteraction: {
				totalExecutedBytes: postInteraction.executedBytes,
				perScript: postInteraction.scripts,
			},
		};
	} finally {
		await browser.close();
	}
}

async function installSettleArrivalBridge(page) {
	await page.addInitScript(() => {
		let release;
		const held = new Promise((resolve) => {
			release = resolve;
		});
		globalThis.__marklessMeasureSettleArrival = () => held;
		globalThis.__marklessReleaseSettleArrival = () => release();
	});
}

async function releaseSettleArrivalBridge(page) {
	await page.evaluate(() => globalThis.__marklessReleaseSettleArrival());
}

// Coverage is cumulative, so executed bytes only grow; a scenario is quiesced
// when two consecutive snapshots agree. Only diagnostics use this — the load
// laws keep the single-snapshot methodology their accepted numbers were
// ratcheted under.
async function stableCoverageSnapshot(cdp, url, scriptUrlById, page, comboId) {
	const maxAttempts = 40;
	const history = [];
	let previous = null;
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const snapshot = coverageSnapshot(
			await cdp.send('Profiler.takePreciseCoverage'),
			url,
			scriptUrlById,
		);
		history.push(snapshot.executedBytes);
		if (previous !== null && previous.executedBytes === snapshot.executedBytes) {
			return snapshot;
		}
		previous = snapshot;
		await page.waitForTimeout(250);
	}
	throw new Error(
		`${comboId}: coverage never quiesced across ${maxAttempts} snapshots: ${history.join(', ')}`,
	);
}

// Transitional test-only proof for the protocol cutover: every measured demo
// payload must carry the same runner node and served arm the former browser
// derivations chose. Production consumers no longer perform these derivations.
async function assertBoundaryDecisionFieldsAgree(page, comboId, environment) {
	const result = await page.evaluate((asyncBoundaryArm) => {
		const viewScripts = [...document.querySelectorAll('script[type="markless/view"]')];
		const stateScripts = [...document.querySelectorAll('script[type="markless/state"]')];
		const disagreements = [];
		for (const [payloadIndex, script] of viewScripts.entries()) {
			const payload = JSON.parse(script.textContent || 'null');
			const state = JSON.parse(stateScripts[payloadIndex]?.textContent || 'null');
			const computedById = new Map(
				(state?.computed ?? []).map((computed) => [computed.graphNodeId, computed]),
			);
			for (const boundary of payload?.asyncBoundaries ?? []) {
				const derivedRunnerGraphNodeId = boundary.asyncReads?.[0]?.graphNodeId ?? null;
				const runner = computedById.get(derivedRunnerGraphNodeId);
				const derivedInitiallyServedArm =
					runner?.snapshot?.status === 'fulfilled'
						? asyncBoundaryArm.try
						: runner?.snapshot?.status === 'rejected'
							? asyncBoundaryArm.catch
							: asyncBoundaryArm.pending;
				if (
					boundary.runnerGraphNodeId !== derivedRunnerGraphNodeId ||
					boundary.initiallyServedArm !== derivedInitiallyServedArm
				) {
					disagreements.push({
						payloadIndex,
						boundaryId: boundary.id,
						runnerGraphNodeId: boundary.runnerGraphNodeId,
						derivedRunnerGraphNodeId,
						initiallyServedArm: boundary.initiallyServedArm,
						derivedInitiallyServedArm,
					});
				}
			}
		}
		return {
			viewPayloadCount: viewScripts.length,
			statePayloadCount: stateScripts.length,
			disagreements,
		};
	}, ASYNC_BOUNDARY_ARM);
	if (environment === 'csr') {
		// Chunk-based CSR carries structure in renderData chunks; serialized
		// protocol payloads must not reappear in the page.
		if (result.viewPayloadCount !== 0 || result.statePayloadCount !== 0) {
			throw new Error(
				`${comboId}: chunk CSR must not embed markless/view or markless/state payloads (found ${result.viewPayloadCount} view, ${result.statePayloadCount} state).`,
			);
		}
		return;
	}
	if (result.viewPayloadCount === 0) {
		throw new Error(`${comboId}: expected at least one markless/view demo payload.`);
	}
	if (result.statePayloadCount !== result.viewPayloadCount) {
		throw new Error(
			`${comboId}: expected one markless/state payload for every markless/view payload.`,
		);
	}
	if (result.disagreements.length > 0) {
		throw new Error(
			`${comboId}: async-boundary decision fields disagree with the old derivations: ${JSON.stringify(result.disagreements)}`,
		);
	}
}

function coverageSnapshot({ result }, pageUrl, scriptUrlById) {
	const origin = new URL(pageUrl).origin;
	const scripts = [];
	for (const script of result) {
		const scriptUrl = script.url || scriptUrlById.get(script.scriptId) || '';
		if (!isSameOrigin(scriptUrl, origin)) continue;
		const executedBytes = executedBytesForScript(script.functions);
		if (executedBytes === 0) continue;
		scripts.push({ url: displayScriptUrl(scriptUrl, origin), executedBytes });
	}
	scripts.sort((a, b) => b.executedBytes - a.executedBytes || a.url.localeCompare(b.url));
	return {
		executedBytes: scripts.reduce((sum, script) => sum + script.executedBytes, 0),
		scripts,
	};
}

// V8 reports nested block ranges. Sweep their boundaries and let the
// innermost active range decide whether each byte interval executed; summing
// positive ranges directly would double count outer functions and branches.
function executedBytesForScript(functions) {
	const events = [];
	for (const fn of functions) {
		for (const range of fn.ranges) {
			events.push({ offset: range.startOffset, kind: 'open', range });
			events.push({ offset: range.endOffset, kind: 'close', range });
		}
	}
	events.sort((a, b) => a.offset - b.offset || eventOrder(a.kind) - eventOrder(b.kind));
	const active = [];
	let previous = events[0]?.offset ?? 0;
	let executed = 0;
	for (const event of events) {
		if (event.offset > previous && active.length > 0) {
			const innermost = active.reduce((best, range) =>
				range.startOffset >= best.startOffset ? range : best,
			);
			if (innermost.count > 0) executed += event.offset - previous;
		}
		previous = event.offset;
		if (event.kind === 'open') active.push(event.range);
		else active.splice(active.indexOf(event.range), 1);
	}
	return executed;
}

function eventOrder(kind) {
	return kind === 'close' ? 0 : 1;
}

async function proveMusicPlayer(page, combo) {
	await page.goto(comboUrl(combo), { waitUntil: 'load' });
	await waitForText(page, 'body', 'Do I Clench My Fists? (Slowed + Reverb)');
	await waitForAttribute(page, '.youtube-frame-host', 'data-command', 'cue');
	await waitForAttribute(page, '.youtube-frame-host', 'data-video-id', 'DwTzcZxyUUg');
	await page.click('[aria-label="Play or pause"]');
	await waitForAttribute(page, '.youtube-frame-host', 'data-command', 'play');
	await page.click('[aria-label="Next track"]');
	await waitForText(page, 'body', 'Empty Crown');
	await waitForAttribute(page, '.youtube-frame-host', 'data-video-id', 'm_qlgFQs7E4');
}

async function interactMusicPlayer(page) {
	await page.click('[aria-label="Play or pause"]');
	await waitForAttribute(page, '.youtube-frame-host', 'data-command', 'play');
}

async function proveLiveFeedCsr(page, combo) {
	await page.goto(comboUrl(combo), { waitUntil: 'load' });
	await proveSettledLiveFeed(page, 'atlas-204');
	await interactLiveFeedCsr(page);
	await page.goto(new URL('/?latency=0&fail=1', comboUrl(combo)).href, { waitUntil: 'load' });
	await waitForText(page, '[data-feed-error]', 'Local updates unavailable');
}

async function proveLiveFeedSsr(page, combo) {
	const response = await page.request.get(comboUrl(combo));
	const html = await response.text();
	if (
		!response.ok() ||
		!html.includes('data-feed-settled') ||
		html.includes('data-feed-pending')
	) {
		throw new Error('Fast SSR proof did not return an already-settled page.');
	}
	await page.goto(comboUrl(combo), { waitUntil: 'load' });
	await proveSettledLiveFeed(page);
	await interactLiveFeed(page, { weightedCountAfter: '9' });
	const rejected = await page.request.get(new URL('/?latency=0&fail=1', comboUrl(combo)).href);
	if (!(await rejected.text()).includes('data-feed-error')) {
		throw new Error('Fast SSR rejection proof did not render its catch arm.');
	}
}

async function proveHeldPendingSsr(combo) {
	const response = await fetch(new URL('/?latency=900', comboUrl(combo)));
	if (!response.ok || !response.body) throw new Error('Held SSR stream did not start.');
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let firstFlush = '';
	while (!firstFlush.includes('data-feed-pending')) {
		const chunk = await reader.read();
		if (chunk.done) break;
		firstFlush += decoder.decode(chunk.value, { stream: true });
	}
	await reader.cancel();
	if (
		!firstFlush.includes('data-feed-pending') ||
		!firstFlush.includes('data-markless-self-wake')
	) {
		throw new Error('Held SSR proof did not flush pending plus self-wake markers.');
	}
}

async function proveSettledLiveFeed(page, interactiveRowKey = 'beacon-118') {
	await waitForAttribute(page, '[data-update-list]', 'data-row-count', '3');
	await waitForAttribute(page, '[data-update-list] > :nth-child(1)', 'data-row-key', 'atlas-204');
	await waitForAttribute(
		page,
		'[data-update-list] > :nth-child(2)',
		'data-row-key',
		'beacon-118',
	);
	await waitForText(page, '[data-weighted-count]', 'Weighted count 6');
	await page.click(`[data-row-key="${interactiveRowKey}"]`);
	// T009c chunk commits register settled-arm row events in both environments.
	await waitForText(page, '[data-selected-key]', `Selected ${interactiveRowKey}`);
}

async function interactLiveFeed(page) {
	await page.click('[data-increase-weight]');
	await waitForAttribute(page, '[data-weight]', 'data-weight', '3');
	await waitForText(page, '[data-weighted-count]', 'Weighted count 9');
}

// Same assertion as interactLiveFeed: the weight bump must move the derived
// count too, not just its own attribute. The CSR/SSR asymmetry that used to
// live here recorded the cross-component computed bug (T002 ruling section 5).
async function interactLiveFeedCsr(page) {
	await page.click('[data-increase-weight]');
	await waitForAttribute(page, '[data-weight]', 'data-weight', '3');
	await waitForText(page, '[data-weighted-count]', 'Weighted count 9');
}

async function waitForText(page, selector, text) {
	await page.waitForFunction(
		({ selector, text }) => document.querySelector(selector)?.textContent?.includes(text),
		{ selector, text },
		{ timeout: 15_000 },
	);
}

async function waitForAttribute(page, selector, attribute, value) {
	await page.waitForFunction(
		({ selector, attribute, value }) =>
			document.querySelector(selector)?.getAttribute(attribute) === value,
		{ selector, attribute, value },
		{ timeout: 15_000 },
	);
}

// Chrome sends the pointerover for DOM changed under a resting pointer on its own timer; re-send the move so every run sees it.
function trackPointer(page) {
	let at;
	const click = page.click.bind(page);
	page.click = async (selector, options) => {
		const box = await page.locator(selector).first().boundingBox();
		if (box) at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
		return click(selector, options);
	};
	return {
		settle: async () => {
			if (at) await page.mouse.move(at.x, at.y);
		},
	};
}

async function fixedMicrotaskWindow(page) {
	await page.evaluate(async (turns) => {
		for (let index = 0; index < turns; index++) await new Promise(queueMicrotask);
	}, FIXED_MICROTASK_TURNS);
}

function capturePageFailures(page) {
	const failures = [];
	page.on('pageerror', (error) => failures.push(`page error: ${error.message}`));
	page.on('console', (message) => {
		// The rejection proof forces the demo endpoint to answer 503 on purpose; the
		// browser's resource-load error for that response is expected, not dirt.
		if (message.type() === 'error' && !/status of 503/.test(message.text()))
			failures.push(`console error: ${message.text()}`);
	});
	page.on('requestfailed', (request) => {
		if (new URL(request.url()).origin === new URL(page.url()).origin) {
			failures.push(
				`failed same-origin request: ${request.url()} (${request.failure()?.errorText ?? 'unknown'})`,
			);
		}
	});
	return {
		assertClean(label) {
			if (page.isClosed()) failures.push('page closed before proof completed');
			if (failures.length > 0)
				throw new Error(`${label} proof failed:\n${failures.join('\n')}`);
		},
	};
}

function assertRepeatable(label, runs) {
	const signatures = runs.map(repeatabilitySignature);
	if (signatures.some((signature) => signature !== signatures[0])) {
		throw new Error(
			`${label} precise coverage was not exactly repeatable across ${runs.length} runs:\n${signatures.join('\n')}`,
		);
	}
}

function reportLoadBytes(label, run) {
	const accepted = ACCEPTED_LOAD_BYTES[label];
	const delta = run.totalExecutedBytes - accepted;
	console.log(
		`-- ${label}: executed ${run.totalExecutedBytes} bytes at load (informational; last accepted ${accepted}, ${delta >= 0 ? '+' : ''}${delta}).`,
	);
}

function repeatabilitySignature(run) {
	return JSON.stringify({
		totalExecutedBytes: run.totalExecutedBytes,
		perScript: run.perScript,
		postInteraction: run.postInteraction,
	});
}

function assertBaselineShape(baseline) {
	if (!baseline || baseline.metric !== 'v8-precise-coverage-executed-bytes') {
		throw new Error('Committed baseline has the wrong metric or is missing.');
	}
	for (const combo of combos) {
		const row = baseline.combos?.[combo.id];
		if (!row || row.proof !== 'green' || !Number.isInteger(row.totalExecutedBytes)) {
			throw new Error(`Committed baseline is missing a green ${combo.id} measurement.`);
		}
		if (!Number.isInteger(row.payloadScriptBytes)) {
			throw new Error(`Committed baseline is missing ${combo.id} payload-script bytes.`);
		}
	}
	if (!baseline.diagnostics?.heldPendingSsr?.measurement) {
		throw new Error('Committed baseline is missing the held-pending SSR diagnostic.');
	}
}

function isSameOrigin(scriptUrl, origin) {
	try {
		return new URL(scriptUrl).origin === origin;
	} catch {
		return false;
	}
}

function displayScriptUrl(scriptUrl, origin) {
	const url = new URL(scriptUrl);
	return `${url.pathname}${url.search}${url.hash}` || scriptUrl.slice(origin.length);
}

function freePort() {
	return new Promise((settle, fail) => {
		const probe = createServer();
		probe.once('error', fail);
		probe.listen(0, '127.0.0.1', () => {
			const { port } = probe.address();
			probe.close(() => settle(port));
		});
	});
}

function comboUrl(combo) {
	return new URL(combo.path, `http://127.0.0.1:${combo.port}`).href;
}

async function waitForServer(url, child) {
	for (let attempt = 0; attempt < 120; attempt++) {
		if (child.exitCode !== null) throw new Error(`Preview exited with ${child.exitCode}.`);
		try {
			const response = await fetch(url);
			if (response.ok) return;
		} catch {}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(`Preview did not become ready: ${url}`);
}

async function run(command, args, options = {}) {
	const child = spawn(command, args, {
		cwd: options.cwd ?? ROOT,
		env: options.env ?? process.env,
		stdio: 'inherit',
	});
	const code = await waitForExit(child);
	if (code !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${code}.`);
}

async function capture(command, args, options = {}) {
	return await new Promise((resolvePromise, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd ?? ROOT,
			env: options.env ?? process.env,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (chunk) => (stdout += chunk));
		child.stderr.on('data', (chunk) => (stderr += chunk));
		child.on('error', reject);
		child.on('exit', (code) =>
			code === 0
				? resolvePromise(stdout)
				: reject(new Error(stderr || `${command} exited ${code}`)),
		);
	});
}

async function waitForExit(child) {
	if (child.exitCode !== null) return child.exitCode;
	return await new Promise((resolvePromise, reject) => {
		child.once('error', reject);
		child.once('exit', (code) => resolvePromise(code ?? 1));
	});
}

async function writeJsonAtomically(path, value) {
	await mkdir(dirname(path), { recursive: true });
	const temporary = `${path}.tmp`;
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
	await rename(temporary, path);
}
