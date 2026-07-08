// SHELL-DECOMPOSITION ORACLE (goal shell-decomposition T003, T116 discipline).
//
// Proves the owner's "no big shifts on refresh" outcome against a built
// markless-dashboard, with the artifact-patch isolation method from
// arm-rendering T121 / preload-integrity T005: the app's .output is COPIED to
// a scratch dir and every hardwired 127.0.0.1:4620 /api origin is rewritten to
// a fresh proxy port, so the owner's live :4620/:3000 processes are never
// touched and no DSM source or e2e fixture is modified.
//
// Phases (--phase <name>, default "cls"):
//
//   cls      Throttled (/api/view +300ms) receipts:
//            (a) first-flush capture — the static chrome bytes (app-header,
//                wordmark; underline-nav on direct repo-path loads) must be in
//                the FIRST streamed chunk, before any settled <template m:arm>;
//            (b) chromium refresh probe on home/issues/pr-detail — per-frame
//                bounding boxes of the chrome selectors; chrome must be present
//                from the first contentful frame and never move (<=1px) while
//                the data wells settle. Ordering-based (the 300ms throttle
//                guarantees pre-settle frames), no absolute-time assertions.
//
//   journey  Unthrottled navigation journey home -> repo code -> issues:
//            frame sampler asserts ZERO pending-arm ("Loading…"/.empty-state)
//            frames (D8 intact) and a stable header box across swaps; then the
//            preload doctrine probe — actor-select change + tab navigation must
//            trigger ZERO new /build/*.js fetches (cold-fetch check).
//
//   specs    The immutable playwright suite (all seven specs) against the
//            patched serve copy, repeated SPECS_REPEAT (2) times. Playwright's
//            own webServer owns the backend port (fresh seeded root via the
//            DSM global-setup); zero spec/testid/URL edits.
//
// Invocation (markless repo root; requires a built dashboard:
// `pnpm --dir ../design-system-manager/markless-dashboard build`):
//
//   node scripts/test-utils/shell-chrome-oracle.ts [--phase cls|journey|specs]
//
// Env: DSM_ROOT (../design-system-manager), THROTTLE_DELAY_MS (300),
//      PREVIEW_PORT (4961), BACKEND_PORT (4962), PROXY_PORT (4963),
//      SPECS_REPEAT (2).
import { spawn, type ChildProcess } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import { tmpdir } from 'node:os';
// Node-only repo script (never shipped): node:path is fine here; the
// runtime-agnostic pathe/ufo rule guards the framework packages.
import { join, resolve } from 'node:path';
import process from 'node:process';
import { startLatencyProxy } from './dsm-latency-proxy.ts';

const repoRoot = resolve(import.meta.dirname, '../..');
const dsmRoot = resolve(repoRoot, process.env.DSM_ROOT ?? '../design-system-manager');
const appDir = join(dsmRoot, 'markless-dashboard');
const phase = process.argv.includes('--phase')
	? process.argv[process.argv.indexOf('--phase') + 1]
	: 'cls';
const delayMs = Number(process.env.THROTTLE_DELAY_MS ?? '300');
const previewPort = Number(process.env.PREVIEW_PORT ?? '4961');
const backendPort = Number(process.env.BACKEND_PORT ?? '4962');
const proxyPort = Number(process.env.PROXY_PORT ?? '4963');
const specsRepeat = Number(process.env.SPECS_REPEAT ?? '2');

const repoId = 'alpha-project-a';
// A hash URL's server document is always '/', so a cold refresh of a repo hash
// route paints the SSR'd home shell first and the router swaps to the target
// page at boot. The no-jump contract is therefore two-tier:
//   - .app-header/.wordmark: painted at the FIRST contentful frame and stable
//     (<=1px) across the WHOLE stream (identical static markup on every page,
//     so the boot swap may not move them);
//   - the target page's chrome frame (mountRequired): fully present the moment
//     the page mounts (mountSelector appears) — BEFORE any data settles — and
//     stable from then on while the wells fill in.
const pages = [
	{
		label: 'home',
		hash: '/#/',
		contentReady: '[data-testid^="repo-link-"]',
		mountSelector: null as string | null,
		mountRequired: ['main#app'],
	},
	{
		label: 'issues',
		hash: `/#/r/${repoId}/issues`,
		contentReady: '[data-testid="new-issue"]',
		mountSelector: '.underline-nav',
		mountRequired: ['#repo-context', '.underline-nav', 'main#app'],
	},
	{
		label: 'pr-detail',
		hash: `/#/r/${repoId}/pulls/pr-1`,
		contentReady: '[data-testid="merge-box"]',
		mountSelector: '.underline-nav',
		mountRequired: ['#repo-context', '.underline-nav', 'main#app'],
	},
];
const chromeSelectors = ['.app-header', '.wordmark', '#repo-context', '.underline-nav', 'main#app', 'aside.rail'];
const firstPaintSelectors = ['.app-header', '.wordmark'];
const shiftTolerancePx = 1;

const children: ChildProcess[] = [];
const scratchRoot = mkdtempSync(join(tmpdir(), 'markless-shell-chrome-oracle-'));
let proxyHandle: Awaited<ReturnType<typeof startLatencyProxy>> | undefined;
const failures: string[] = [];

function fail(message: string): never {
	console.error(`\nshell-chrome-oracle: FAIL — ${message}`);
	process.exitCode = 1;
	throw new Error(message);
}

function gate(condition: boolean, message: string): void {
	if (!condition) {
		failures.push(message);
		console.error(`  GATE FAIL: ${message}`);
	}
}

async function portInUse(port: number): Promise<boolean> {
	return new Promise((resolvePort) => {
		const socket = net.connect({ host: '127.0.0.1', port }, () => {
			socket.destroy();
			resolvePort(true);
		});
		socket.on('error', () => resolvePort(false));
	});
}

async function waitFor(label: string, probe: () => Promise<boolean>, timeoutMs: number): Promise<void> {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		if (await probe().catch(() => false)) return;
		await new Promise((resolveWait) => setTimeout(resolveWait, 250));
	}
	fail(`timed out waiting for ${label}`);
}

function spawnChild(
	command: string,
	args: string[],
	options: { cwd: string; env?: Record<string, string> },
): ChildProcess {
	const child = spawn(command, args, {
		cwd: options.cwd,
		env: { ...process.env, ...options.env },
		stdio: ['ignore', 'inherit', 'inherit'],
	});
	children.push(child);
	return child;
}

async function stopChild(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null) return;
	const exited = new Promise<void>((resolveExit) => child.once('exit', () => resolveExit()));
	child.kill('SIGTERM');
	await Promise.race([exited, new Promise((r) => setTimeout(r, 4000))]);
	if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
	await exited;
}

async function cleanup(): Promise<void> {
	for (const child of [...children].reverse()) await stopChild(child).catch(() => {});
	await proxyHandle?.close().catch(() => {});
	rmSync(scratchRoot, { recursive: true, force: true });
}

// --- artifact-patch isolation ------------------------------------------------

// Copy .output and rewrite every 127.0.0.1:4620 reference to the proxy port.
// Returns the number of files patched; grep-verifies zero '4620' remain.
function patchServeCopy(): string {
	const serveRoot = join(scratchRoot, 'output');
	cpSync(join(appDir, '.output'), serveRoot, { recursive: true });
	let patched = 0;
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir)) {
			const path = join(dir, entry);
			if (statSync(path).isDirectory()) {
				walk(path);
				continue;
			}
			if (!/\.(mjs|js|json)$/.test(entry)) continue;
			const text = readFileSync(path, 'utf8');
			if (!text.includes('127.0.0.1:4620')) continue;
			writeFileSync(path, text.replaceAll('127.0.0.1:4620', `127.0.0.1:${proxyPort}`));
			patched++;
		}
	};
	walk(serveRoot);
	const leftovers: string[] = [];
	const grep = (dir: string) => {
		for (const entry of readdirSync(dir)) {
			const path = join(dir, entry);
			if (statSync(path).isDirectory()) {
				grep(path);
				continue;
			}
			if (/\.(mjs|js|json|html)$/.test(entry) && readFileSync(path, 'utf8').includes('4620')) {
				leftovers.push(path);
			}
		}
	};
	grep(serveRoot);
	if (leftovers.length > 0) fail(`serve copy still references 4620: ${leftovers.join(', ')}`);
	// The nitro server bundle keeps external deps (nitro itself) unbundled;
	// resolve them from the app's own install (read-only).
	symlinkSync(join(appDir, 'node_modules'), join(serveRoot, 'node_modules'));
	console.log(`isolation: patched ${patched} serve-copy file(s) 4620 -> ${proxyPort}; grep 0 leftovers`);
	return serveRoot;
}

function bootBackend(): ChildProcess {
	const githubRoot = join(scratchRoot, 'github');
	cpSync(join(dsmRoot, 'e2e/fixtures/sandbox-github'), githubRoot, { recursive: true });
	return spawnChild('node', ['apps/github-manager/server/main.ts'], {
		cwd: dsmRoot,
		env: {
			PORT: String(backendPort),
			DSM_GITHUB_ROOT: githubRoot,
			DSM_REGISTRY_ROOT: join(githubRoot, 'registry'),
			DSM_DASHBOARD_OUT: join(scratchRoot, 'dashboard.html'),
		},
	});
}

function bootServe(serveRoot: string): ChildProcess {
	return spawnChild('node', ['server/index.mjs'], {
		cwd: serveRoot,
		env: {
			PORT: String(previewPort),
			HOST: '127.0.0.1',
			DSM_API_ORIGIN: `http://127.0.0.1:${proxyPort}`,
		},
	});
}

// --- playwright loader (pnpm store fallback, same as first-interaction-delay)

async function loadPlaywright(): Promise<typeof import('playwright')> {
	try {
		return await import('playwright');
	} catch {
		const pnpmDir = join(repoRoot, 'node_modules/.pnpm');
		const entry = readdirSync(pnpmDir).find((name) => /^playwright@\d/.test(name));
		if (!entry) fail('playwright not found in node_modules/.pnpm');
		const requireFromStore = createRequire(
			join(pnpmDir, entry, 'node_modules', 'playwright', 'package.json'),
		);
		return requireFromStore('playwright');
	}
}

// --- streamed first-flush capture ---------------------------------------------

async function captureStreamedDocument(url: string) {
	const startedAt = Date.now();
	const response = await fetch(url);
	if (!response.ok || !response.body) fail(`GET ${url} -> ${response.status}`);
	const chunks: { at: number; text: string }[] = [];
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push({ at: Date.now() - startedAt, text: decoder.decode(value, { stream: true }) });
	}
	return { chunks, html: chunks.map((chunk) => chunk.text).join('') };
}

function firstFlushReceipt(label: string, capture: Awaited<ReturnType<typeof captureStreamedDocument>>, requiredMarkers: string[]) {
	const first = capture.chunks[0]?.text ?? '';
	const settledChunk = capture.chunks.find((chunk) => chunk.text.includes('<template m:arm'));
	const missing = requiredMarkers.filter((marker) => !first.includes(marker));
	gate(missing.length === 0, `${label}: first flush missing static chrome markers: ${missing.join(', ')}`);
	gate(!first.includes('<template m:arm'), `${label}: settled arm template already in the first chunk (stream did not engage)`);
	gate(settledChunk !== undefined, `${label}: no settled <template m:arm> arrived on the response`);
	console.log(
		`first-flush[${label}]: chunk0 @${capture.chunks[0]?.at}ms (${first.length}B) ` +
			`markers ${requiredMarkers.length - missing.length}/${requiredMarkers.length} present` +
			(missing.length ? ` (MISSING: ${missing.join(', ')})` : '') +
			`; settled template @${settledChunk?.at ?? 'never'}ms on chunk ${capture.chunks.indexOf(settledChunk!)} of ${capture.chunks.length}`,
	);
}

// --- in-page frame sampler ----------------------------------------------------

const samplerInit = `(() => {
	const selectors = ${JSON.stringify(chromeSelectors)};
	const samples = [];
	window.__chromeSamples = samples;
	const tick = () => {
		const frame = { t: performance.now(), hasContent: document.body ? document.body.childElementCount > 0 : false, pendingArm: false, boxes: {} };
		if (document.body) {
			const empty = document.querySelector('.empty-state');
			frame.pendingArm = !!empty && /Loading/.test(empty.textContent || '');
			for (const selector of selectors) {
				const el = document.querySelector(selector);
				if (el) {
					const r = el.getBoundingClientRect();
					frame.boxes[selector] = { x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
				}
			}
		}
		samples.push(frame);
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
})();`;

interface FrameSample {
	t: number;
	hasContent: boolean;
	pendingArm: boolean;
	boxes: Record<string, { x: number; y: number; w: number; h: number }>;
}

function maxShiftPx(frames: FrameSample[], selector: string): { shift: number; seen: number } {
	const seen = frames.filter((sample) => sample.boxes[selector]);
	if (seen.length === 0) return { shift: 0, seen: 0 };
	const origin = seen[0].boxes[selector];
	let shift = 0;
	for (const sample of seen) {
		const box = sample.boxes[selector];
		shift = Math.max(shift, Math.abs(box.x - origin.x) + Math.abs(box.y - origin.y));
	}
	return { shift, seen: seen.length };
}

interface StabilityOptions {
	firstPaint: string[]; // must exist at the first contentful frame
	mountSelector: string | null; // frame that marks "target page mounted" (null = first contentful)
	mountRequired: string[]; // must exist AT the mount frame (before data settles)
	stable: string[]; // <=1px movement from the mount frame on
	wholeStreamStable: string[]; // <=1px movement across every contentful frame
}

function chromeStability(label: string, samples: FrameSample[], options: StabilityOptions) {
	const contentful = samples.filter((sample) => sample.hasContent);
	const firstContentful = contentful[0];
	if (!firstContentful) {
		gate(false, `${label}: no contentful frame sampled`);
		return;
	}
	for (const selector of options.firstPaint) {
		const appearedAt = contentful.find((sample) => sample.boxes[selector]);
		const delay = appearedAt ? Math.round(appearedAt.t - firstContentful.t) : -1;
		gate(
			firstContentful.boxes[selector] !== undefined,
			`${label}: ${selector} absent at first contentful frame (${appearedAt ? `appeared +${delay}ms later` : 'never appeared'} — chrome not painted at first flush)`,
		);
	}
	const mountIndex = options.mountSelector
		? contentful.findIndex((sample) => sample.boxes[options.mountSelector!])
		: 0;
	if (mountIndex === -1) {
		gate(false, `${label}: ${options.mountSelector} never appeared (target page chrome never mounted)`);
		return;
	}
	const mountFrame = contentful[mountIndex];
	const mountDelay = Math.round(mountFrame.t - firstContentful.t);
	for (const selector of options.mountRequired) {
		gate(
			mountFrame.boxes[selector] !== undefined,
			`${label}: ${selector} absent at page mount (+${mountDelay}ms) — chrome frame incomplete before data settles`,
		);
	}
	const postMount = contentful.slice(mountIndex);
	for (const selector of options.stable) {
		const { shift, seen } = maxShiftPx(postMount, selector);
		if (seen === 0) continue;
		console.log(`cls[${label}] ${selector}: post-mount shift=${shift.toFixed(1)}px over ${seen} frames (mount +${mountDelay}ms)`);
		gate(shift <= shiftTolerancePx, `${label}: ${selector} moved ${shift.toFixed(1)}px after page mount (> ${shiftTolerancePx}px)`);
	}
	for (const selector of options.wholeStreamStable) {
		const { shift, seen } = maxShiftPx(contentful, selector);
		if (seen === 0) continue;
		console.log(`cls[${label}] ${selector}: whole-stream shift=${shift.toFixed(1)}px over ${seen}/${contentful.length} frames`);
		gate(shift <= shiftTolerancePx, `${label}: ${selector} moved ${shift.toFixed(1)}px across the refresh stream (> ${shiftTolerancePx}px)`);
	}
}

// --- phases --------------------------------------------------------------------

async function phaseCls() {
	const base = `http://127.0.0.1:${previewPort}`;

	// (a) streamed first-flush receipts. The document for a hash URL is '/', so
	// header chrome must flush there; a direct repo-path load must also carry
	// the nav skeleton in its first chunk.
	firstFlushReceipt('home', await captureStreamedDocument(`${base}/`), ['class="app-header"', 'wordmark']);
	const issuesPath = `${base}/r/${repoId}/issues`;
	const issuesProbe = await fetch(issuesPath);
	if (issuesProbe.ok) {
		firstFlushReceipt('issues-path', await captureStreamedDocument(issuesPath), [
			'class="app-header"',
			'wordmark',
			'underline-nav',
		]);
	} else {
		console.log(`first-flush[issues-path]: skipped (GET /r/${repoId}/issues -> ${issuesProbe.status}; hash-only routing)`);
	}
	const statsAfterCapture = proxyHandle!.stats();
	gate(statsAfterCapture.delayed >= 1, 'latency proxy delayed no /api/view requests (throttle not engaged)');

	// (b) chromium refresh probes.
	const { chromium } = await loadPlaywright();
	const browser = await chromium.launch({ headless: true });
	try {
		for (const page of pages) {
			const context = await browser.newContext();
			const tab = await context.newPage();
			await tab.addInitScript(samplerInit);
			await tab.goto(`${base}${page.hash}`, { waitUntil: 'commit' });
			try {
				await tab.waitForFunction(
					() => {
						const select = document.querySelector('#actor-select') as HTMLSelectElement | null;
						return !!select && select.options.length > 0;
					},
					{ timeout: 20_000 },
				);
				await tab.waitForSelector(page.contentReady, { timeout: 20_000 });
			} catch (error) {
				gate(false, `refresh:${page.label}: settle wait failed (${(error as Error).message.split('\n')[0]})`);
			}
			// Let a few settled frames accumulate so post-settle stability is measured.
			await tab.waitForTimeout(400);
			const samples = (await tab.evaluate('window.__chromeSamples')) as FrameSample[];
			chromeStability(`refresh:${page.label}`, samples, {
				firstPaint: [...firstPaintSelectors, ...(page.mountSelector === null ? ['main#app'] : [])],
				mountSelector: page.mountSelector,
				mountRequired: page.mountRequired,
				stable: chromeSelectors,
				wholeStreamStable: firstPaintSelectors,
			});
			await context.close();
		}
	} finally {
		await browser.close();
	}
}

async function phaseJourney() {
	const base = `http://127.0.0.1:${previewPort}`;
	const { chromium } = await loadPlaywright();
	const browser = await chromium.launch({ headless: true });
	try {
		const context = await browser.newContext();
		const tab = await context.newPage();
		const buildFetches: string[] = [];
		tab.on('request', (request) => {
			if (request.url().includes('/build/') && request.url().endsWith('.js')) buildFetches.push(request.url());
		});
		await tab.addInitScript(samplerInit);
		await tab.goto(`${base}/#/`, { waitUntil: 'commit' });
		await tab.waitForSelector(`[data-testid="repo-link-${repoId}"]`, { timeout: 20_000 });
		await tab.waitForTimeout(200);
		const journeyStart = (await tab.evaluate('window.__chromeSamples.length')) as number;

		// home -> repo code -> issues (fast local navigations: D8 must hold live).
		await tab.click(`[data-testid="repo-link-${repoId}"]`);
		await tab.waitForSelector('[data-testid="branch-selector"]', { timeout: 20_000 });
		await tab.click(`.underline-nav a[href="#/r/${repoId}/issues"]`);
		await tab.waitForSelector('[data-testid="new-issue"]', { timeout: 20_000 });
		await tab.waitForTimeout(300);

		const samples = (await tab.evaluate('window.__chromeSamples')) as FrameSample[];
		const journeyFrames = samples.slice(journeyStart);
		const pendingFrames = journeyFrames.filter((sample) => sample.pendingArm);
		console.log(
			`journey: ${journeyFrames.length} frames sampled across home->code->issues; ` +
				`pending-arm frames=${pendingFrames.length}`,
		);
		gate(pendingFrames.length === 0, `journey: ${pendingFrames.length} pending-arm frame(s) visible during fast navigation (D8 regression)`);
		// Across client navigations only the always-present header chrome is
		// position-gated (per-page frames legitimately differ below it).
		chromeStability('journey', journeyFrames, {
			firstPaint: [],
			mountSelector: null,
			mountRequired: [],
			stable: [],
			wholeStreamStable: firstPaintSelectors,
		});

		// Preload doctrine (preload-integrity doctrine 1): INTERACTIONS fetch
		// ZERO framework chunks — the new Shell/RepoTabs boundary symbols must be
		// covered. Route navigations demand-load the destination route's chunks
		// by design (reported, not gated), but navigating BACK must fetch zero
		// (everything already demanded once — no cold-fetch thrash).
		const before = buildFetches.length;
		await tab.selectOption('#actor-select', 'app-owner');
		await tab.waitForTimeout(400);
		const afterSelect = buildFetches.length;
		gate(afterSelect - before === 0, `cold-fetch: actor-select interaction fetched ${afterSelect - before} framework chunk(s)`);
		await tab.click(`.underline-nav a[href="#/r/${repoId}/pulls"]`);
		await tab.waitForSelector(`[data-testid="pr-link-pr-1"], .box-header`, { timeout: 20_000 });
		await tab.waitForTimeout(400);
		const afterNav = buildFetches.length;
		await tab.selectOption('#actor-select', 'app-owner');
		await tab.waitForTimeout(400);
		const afterSelect2 = buildFetches.length;
		gate(afterSelect2 - afterNav === 0, `cold-fetch: post-navigation actor-select interaction fetched ${afterSelect2 - afterNav} framework chunk(s)`);
		await tab.click(`.underline-nav a[href="#/r/${repoId}/issues"]`);
		await tab.waitForSelector('[data-testid="new-issue"]', { timeout: 20_000 });
		await tab.waitForTimeout(400);
		const afterReturn = buildFetches.length;
		console.log(
			`cold-fetch probe: /build/*.js — baseline ${before}, actor-select +${afterSelect - before}, ` +
				`tab nav demand-load +${afterNav - afterSelect} (route chunks, informational), ` +
				`post-nav actor-select +${afterSelect2 - afterNav}, return nav +${afterReturn - afterSelect2}`,
		);
		gate(afterReturn - afterSelect2 === 0, `cold-fetch: returning to an already-demanded route fetched ${afterReturn - afterSelect2} framework chunk(s)`);
		await context.close();
	} finally {
		await browser.close();
	}
}

async function phaseSpecs() {
	for (let run = 1; run <= specsRepeat; run++) {
		const playwright = spawnChild('npx', ['playwright', 'test'], {
			cwd: dsmRoot,
			env: {
				DSM_E2E_PORT: String(backendPort),
				DSM_E2E_TARGET_URL: `http://127.0.0.1:${previewPort}`,
			},
		});
		const exitCode = await new Promise<number>((resolveExit) =>
			playwright.once('exit', (code) => resolveExit(code ?? 1)),
		);
		gate(exitCode === 0, `specs run ${run}/${specsRepeat}: playwright exited ${exitCode}`);
		console.log(`specs run ${run}/${specsRepeat}: exit ${exitCode}`);
		if (exitCode !== 0) break;
	}
}

// --- main ----------------------------------------------------------------------

try {
	if (!existsSync(join(dsmRoot, 'apps/github-manager/server/main.ts'))) {
		fail(`github-manager backend not found under ${dsmRoot}`);
	}
	if (!existsSync(join(appDir, '.output'))) {
		fail(`markless-dashboard has no .output build — run: pnpm --dir ${appDir} build`);
	}
	for (const port of [proxyPort, backendPort, previewPort]) {
		if (await portInUse(port)) fail(`port ${port} is already in use — free it first`);
	}

	const serveRoot = patchServeCopy();
	proxyHandle = await startLatencyProxy({
		listenPort: proxyPort,
		upstreamOrigin: `http://127.0.0.1:${backendPort}`,
		delayMs: phase === 'cls' ? delayMs : 0,
		delayPathPrefixes: ['/api/view'],
	});

	if (phase !== 'specs') {
		bootBackend();
		await waitFor(
			`backend on :${backendPort}`,
			async () => (await fetch(`http://127.0.0.1:${backendPort}/api/view`)).ok,
			20_000,
		);
	}
	bootServe(serveRoot);
	await waitFor(
		`patched serve on :${previewPort}`,
		async () => (await fetch(`http://127.0.0.1:${previewPort}/`)).ok,
		30_000,
	);

	if (phase === 'cls') await phaseCls();
	else if (phase === 'journey') await phaseJourney();
	else if (phase === 'specs') await phaseSpecs();
	else fail(`unknown --phase ${phase} (cls|journey|specs)`);

	if (failures.length > 0) {
		fail(`${failures.length} gate(s) failed:\n  - ${failures.join('\n  - ')}`);
	}
	console.log(`\nshell-chrome-oracle: PASS (phase ${phase}) — owner :4620/:3000 untouched, fixtures unmodified\n`);
} finally {
	await cleanup();
}
