// Method provenance: goals/unified-render-model/notes/T006-measure.mjs and
// goals/unified-render-model/notes/executed-decompose.mjs, copied by technique
// on 2026-08-01. The gitignored originals remain evidence, not dependencies.

import { spawn } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
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
const MODE = process.argv[2];
const MAX_CEILING_HEADROOM = 0.05;
const ACCEPTED_LOAD_BYTES = {
	// Owner-signed 2026-08-02 ("parity is fine", ceiling <= 1,400): prerendered
	// boot measured 937 — ratcheted to the real number, not the allowance.
	'music-player-csr': 937,
	'music-player-ssr': 1_213,
	// Owner re-anchor ruling 2026-08-04: honest bridge-release marker.
	// Supersedes 28,564/36,000 (premature-capture fiction).
	// Macrotask-class 48,573 recorded.
	'live-feed-csr': 48_573,
	// lf-ssr accepted stays 1,285; measures 1,320 — the +35 is documented
	// irreducible (pre-first-click arm listener install, t010b3/T013 receipts)
	// and passes within the 5% headroom by design.
	'live-feed-ssr': 1_285,
};
const LOAD_BYTE_CEILINGS = Object.fromEntries(
	Object.entries(ACCEPTED_LOAD_BYTES).map(([id, accepted]) => [
		id,
		Math.floor(accepted * (1 + MAX_CEILING_HEADROOM)),
	]),
);

const combos = [
	{
		id: 'music-player-csr',
		demo: 'demos/music-player',
		environment: 'csr',
		port: 5311,
		path: '/',
		settledSelector: '.youtube-frame-host[data-command="cue"]',
		proof: proveMusicPlayer,
		interact: interactMusicPlayer,
	},
	{
		id: 'music-player-ssr',
		demo: 'demos/music-player-ssr',
		environment: 'ssr',
		port: 5312,
		path: '/',
		settledSelector: '.youtube-frame-host[data-command="cue"]',
		proof: proveMusicPlayer,
		interact: interactMusicPlayer,
	},
	{
		id: 'live-feed-csr',
		demo: 'demos/live-feed',
		environment: 'csr',
		port: 5313,
		path: '/?latency=0',
		settledSelector: '#app[data-feed-settle-arrived]',
		proof: proveLiveFeedCsr,
		interact: interactLiveFeedCsr,
	},
	{
		id: 'live-feed-ssr',
		demo: 'demos/live-feed-ssr',
		environment: 'ssr',
		port: 5314,
		path: '/?latency=0',
		settledSelector: '[data-update-list][data-row-count="3"]',
		proof: proveLiveFeedSsr,
		interact: interactLiveFeed,
	},
];

if (MODE !== 'baseline' && MODE !== 'gate') {
	throw new Error('Usage: node measure.mjs baseline|gate');
}

const repeatCount = MODE === 'gate' ? 3 : 1;
const measurements = {};
const heldPendingRuns = [];

for (const combo of combos) {
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
		if (MODE === 'gate') assertLoadCeiling(combo.id, runs[0]);
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
	console.log('\nGate passed: four proofs green and three runs exactly repeatable.');
}

// Any straggler handle (an orphaned pipe, a browser that ignored close) must
// not turn a finished measurement into an hours-long silent hang.
process.exit(0);

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
		const payloadScriptBytes = await page.evaluate(() =>
			[...document.querySelectorAll('script[type="markless/state"],script[type="markless/view"]')]
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

		if (combo.interact) await combo.interact(page);
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

async function interactLiveFeedCsr(page) {
	await page.click('[data-increase-weight]');
	await waitForAttribute(page, '[data-weight]', 'data-weight', '3');
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

function assertLoadCeiling(label, run) {
	const ceiling = LOAD_BYTE_CEILINGS[label];
	if (!Number.isInteger(ceiling)) {
		throw new Error(`${label} has no executed-at-load ceiling.`);
	}
	if (run.totalExecutedBytes > ceiling) {
		throw new Error(
			`${label} executed ${run.totalExecutedBytes} bytes at load, above its hard ceiling of ${ceiling} (accepted ${ACCEPTED_LOAD_BYTES[label]}, maximum headroom ${MAX_CEILING_HEADROOM * 100}%).`,
		);
	}
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
