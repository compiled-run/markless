// Run after `pnpm --dir website build`: node --experimental-strip-types website/scripts/playground-perf.ts [--out <path> | --check] [--browser chromium|firefox|webkit]
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	chromium,
	devices,
	firefox,
	webkit,
	type Browser,
	type BrowserContext,
	type Locator,
	type Page,
} from 'playwright-core';
import { ERROR_PAUSE_MS } from '../components/docs/code/session.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pagePath = '/ui/styling';
const editorAssets = /\.wasm|compile-worker|_code-frame|code-session|editor|highlight/;
// Hashed chunk names hide the editor, highlighter and session, so their bodies identify them.
const editorBodies = /insertText|code:modules|yuku|getTheme/;
const blocks = [
	{ title: 'styled-picker.tsrx', caretAfter: '\t\t\t\tTheme\n', visible: 'Theme' },
	{ title: 'save-tip.tsrx', caretAfter: '\t\t\t\tSave\n', visible: 'Save' },
] as const;

const outIndex = process.argv.indexOf('--out');
const outPath = outIndex > 0 ? process.argv[outIndex + 1] : undefined;
const checking = process.argv.includes('--check');
const browserIndex = process.argv.indexOf('--browser');
const browserName = browserIndex > 0 ? process.argv[browserIndex + 1] : 'chromium';
if (browserName !== 'chromium' && browserName !== 'firefox' && browserName !== 'webkit')
	throw new Error(`--browser must be chromium, firefox or webkit, not ${browserName}`);
// CPU throttling is a Chrome DevTools Protocol call; firefox and webkit have no equivalent.
const throttles = browserName === 'chromium';
const mobileDevice = 'iPhone 15';
const editorFlag = 'markless-code:editor';

const freePort = () =>
	new Promise<number>((done, fail) => {
		const probe = createServer();
		probe.on('error', fail);
		probe.listen(0, '127.0.0.1', () => {
			const address = probe.address();
			const port = typeof address === 'object' && address ? address.port : 0;
			probe.close(() => done(port));
		});
	});

const port = await freePort();
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['.output/server/index.mjs'], {
	cwd: root,
	env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
	stdio: ['ignore', 'pipe', 'pipe'],
});
const serverLog: string[] = [];
server.stdout.on('data', (chunk) => serverLog.push(String(chunk)));
server.stderr.on('data', (chunk) => serverLog.push(String(chunk)));
const stop = () => {
	if (!server.killed) server.kill('SIGKILL');
};
process.on('exit', stop);

for (let attempt = 0; ; attempt += 1) {
	try {
		if ((await fetch(`${origin}${pagePath}`)).status < 500) break;
	} catch {}
	if (attempt > 80) throw new Error(`server never answered\n${serverLog.join('')}`);
	await new Promise((done) => setTimeout(done, 250));
}

type Asset = {
	url: string;
	status: number;
	transferredBytes: number;
	uncompressedBytes: number;
	encoding: string | null;
	contentLength: number | null;
	matchedBy: 'url' | 'body';
};

/** Every request the context makes, with in-flight tracking for a network-quiet wait. */
function recordNetwork(context: BrowserContext) {
	let inflight = 0;
	let lastChange = performance.now();
	const pending: Promise<Asset | undefined>[] = [];
	const otherUrls: string[] = [];
	const settle = () => {
		inflight -= 1;
		lastChange = performance.now();
	};
	context.on('request', () => {
		inflight += 1;
		lastChange = performance.now();
	});
	context.on('requestfailed', settle);
	context.on('requestfinished', (request) => {
		settle();
		const byUrl = editorAssets.test(new URL(request.url()).pathname);
		const script = /\.m?js$/.test(new URL(request.url()).pathname);
		if (!byUrl && !script) {
			otherUrls.push(request.url().replace(origin, ''));
			return;
		}
		pending.push(
			(async () => {
				const response = await request.response();
				if (!response) return undefined;
				const sizes = await request.sizes();
				const body = await response.body().catch(() => Buffer.alloc(0));
				if (!byUrl && !editorBodies.test(body.toString('utf8'))) {
					otherUrls.push(request.url().replace(origin, ''));
					return undefined;
				}
				const headers = await response.allHeaders();
				return {
					matchedBy: byUrl ? ('url' as const) : ('body' as const),
					url: request.url().replace(origin, ''),
					status: response.status(),
					transferredBytes: sizes.responseBodySize + sizes.responseHeadersSize,
					uncompressedBytes: body.length,
					encoding: headers['content-encoding'] ?? null,
					contentLength: headers['content-length'] ? Number(headers['content-length']) : null,
				};
			})(),
		);
	});
	return {
		async quiet(windowMs = 750, timeoutMs = 60000) {
			const deadline = performance.now() + timeoutMs;
			while (inflight > 0 || performance.now() - lastChange < windowMs) {
				if (performance.now() > deadline) throw new Error(`network never went quiet (${inflight} in flight)`);
				await new Promise((done) => setTimeout(done, 50));
			}
		},
		otherUrls,
		async assets() {
			return (await Promise.all(pending)).filter((asset): asset is Asset => asset !== undefined);
		},
	};
}

function summarizeAssets(assets: Asset[]) {
	const wasmByModule: Record<string, number> = {};
	for (const asset of assets) {
		const name = /([^/?]+)\.wasm/.exec(asset.url)?.[1];
		if (!name) continue;
		const module = name.replace(/-[A-Za-z0-9_-]{8}$/, '');
		wasmByModule[module] = (wasmByModule[module] ?? 0) + 1;
	}
	return {
		requestCount: assets.length,
		transferredBytesTotal: assets.reduce((sum, asset) => sum + asset.transferredBytes, 0),
		uncompressedBytesTotal: assets.reduce((sum, asset) => sum + asset.uncompressedBytes, 0),
		uniqueUrlUncompressedBytes: [...new Map(assets.map((asset) => [asset.url, asset.uncompressedBytes])).values()].reduce(
			(sum, bytes) => sum + bytes,
			0,
		),
		wasmRequestsByModule: wasmByModule,
		wasmTransferredBytes: assets
			.filter((asset) => asset.url.includes('.wasm'))
			.reduce((sum, asset) => sum + asset.transferredBytes, 0),
		compileWorkerScriptLoads: assets.filter((asset) => /compile-worker/.test(asset.url)).length,
		codeFrameLoads: assets.filter((asset) => /_code-frame/.test(asset.url)).length,
		requests: assets,
	};
}

const blockFor = (page: Page, title: string) =>
	page.locator('.code-block').filter({ has: page.locator(`[data-code-file="${title}"]`) }).first();

async function blockStates(page: Page) {
	return page.locator('.code-block').evaluateAll((all) => all.map((box) => (box as HTMLElement).dataset.code));
}

async function scrollPast(browser: Browser) {
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	const network = recordNetwork(context);
	const page = await context.newPage();
	await page.goto(`${origin}${pagePath}`, { waitUntil: 'load' });
	const blockCount = await page.locator('.code-block').count();
	const titles = await page
		.locator('.code-block')
		.evaluateAll((all) =>
			all.map((box) => box.querySelector<HTMLElement>('[data-code-file]')?.dataset.codeFile ?? ''),
		);
	const statesBeforeScroll = await blockStates(page);
	const height = await page.evaluate(() => document.documentElement.scrollHeight);
	for (let y = 0; y <= height; y += 300) {
		await page.evaluate((top) => window.scrollTo(0, top), y);
		await page.evaluate(
			() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
		);
	}
	await network.quiet();
	const result = {
		page: pagePath,
		blockCount,
		blockFiles: titles,
		blockStatesBeforeScroll: statesBeforeScroll,
		blockStatesAfterScroll: await blockStates(page),
		...summarizeAssets(await network.assets()),
		otherRequests: network.otherUrls,
	};
	await context.close();
	return result;
}

async function bootEveryBlock(browser: Browser) {
	const { context, network, page } = await freshPage(browser, true);
	const blockCount = await scrollEveryBlockIntoView(page);
	for (let index = 0; index < blockCount; index += 1)
		await page.locator('.code-block').nth(index).and(page.locator('[data-code="ready"]')).waitFor({ timeout: 60000 });
	await network.quiet();
	const { requests, ...summary } = summarizeAssets(await network.assets());
	const result = { page: pagePath, blockCount, blockStates: await blockStates(page), ...summary, requests };
	await context.close();
	return result;
}

/** Puts the caret right after the newline-free text of `marker` in the block's visible textarea. */
async function caretAfter(block: Locator, marker: string) {
	await block.locator('[data-code-input]:visible').first().evaluate((element, wanted) => {
		const area = element as HTMLTextAreaElement;
		const at = area.value.indexOf(wanted);
		if (at < 0) throw new Error(`marker ${JSON.stringify(wanted)} not in the textarea`);
		const end = at + wanted.replace(/\n$/, '').length;
		area.focus();
		area.setSelectionRange(end, end);
	}, marker);
}

/** ms from the keystroke until the block's iframe shows `text` and the frame is on screen. */
async function keystrokeToResult(page: Page, block: Locator, key: string, text: string) {
	const handle = await block.locator('iframe.code-frame').elementHandle();
	const frame = await handle?.contentFrame();
	if (!frame) throw new Error('the block has no result frame');
	const started = performance.now();
	await page.keyboard.press(key);
	await frame.waitForFunction((want) => (document.body.textContent ?? '').includes(want), text, {
		polling: 'raf',
		timeout: 60000,
	});
	await block.locator('iframe.code-frame').waitFor({ state: 'visible', timeout: 60000 });
	return Math.round(performance.now() - started);
}

const median = (values: number[]) => {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
};

async function wakeAndReady(page: Page, block: Locator) {
	const stateBefore = await block.evaluate((box) => (box as HTMLElement).dataset.code);
	const started = performance.now();
	await block.hover();
	await block.and(page.locator('[data-code="ready"]')).waitFor({ timeout: 60000 });
	const hoverToReadyMs = Math.round(performance.now() - started);
	return {
		stateBeforeHover: stateBefore,
		hoverToReadyMs,
		navigationStartToReadyObservedMs: Math.round(await page.evaluate(() => performance.now())),
	};
}

async function editing(browser: Browser, cpuThrottle: number) {
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	const page = await context.newPage();
	if (cpuThrottle > 1) {
		const cdp = await context.newCDPSession(page);
		await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
	}
	await page.goto(`${origin}${pagePath}`, { waitUntil: 'load' });

	const [first, second] = blocks;
	const firstBlock = blockFor(page, first.title);
	const firstReady = await wakeAndReady(page, firstBlock);
	await caretAfter(firstBlock, first.caretAfter);
	const firstEditMs = await keystrokeToResult(page, firstBlock, '1', `${first.visible}1`);
	const followUps: number[] = [];
	let typed = '1';
	for (const key of ['2', '3', '4', '5', '6']) {
		typed += key;
		followUps.push(await keystrokeToResult(page, firstBlock, key, `${first.visible}${typed}`));
	}

	const secondBlock = blockFor(page, second.title);
	const secondReady = await wakeAndReady(page, secondBlock);
	await caretAfter(secondBlock, second.caretAfter);
	const secondEditMs = await keystrokeToResult(page, secondBlock, '1', `${second.visible}1`);

	await context.close();
	return {
		cpuThrottle,
		firstBlock: {
			file: first.title,
			...firstReady,
			firstEditKeystrokeToResultMs: firstEditMs,
			followUpEditsMs: followUps,
			followUpEditsMedianMs: median(followUps),
		},
		secondBlock: {
			file: second.title,
			...secondReady,
			firstEditKeystrokeToResultMs: secondEditMs,
		},
	};
}


type Check = { name: string; ok: boolean; detail: unknown };

const bootCounts = (assets: Asset[]) => {
	const summary = summarizeAssets(assets);
	return {
		wasmRequests: assets.filter((asset) => asset.url.includes('.wasm')).length,
		wasmRequestsByModule: summary.wasmRequestsByModule,
		compileWorkerScriptLoads: summary.compileWorkerScriptLoads,
		codeFrameLoads: summary.codeFrameLoads,
	};
};

async function scrollEveryBlockIntoView(page: Page) {
	const count = await page.locator('.code-block').count();
	for (let index = 0; index < count; index += 1) {
		await page.locator('.code-block').nth(index).scrollIntoViewIfNeeded();
		await page.evaluate(
			() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
		);
	}
	return count;
}

type WorkerLogEntry = { block: string; warmUp: boolean; sent: number; ok?: boolean; replied?: number };

/** Records, on `window.workerLog`, each compile the page sends and when its reply arrives. */
async function logWorker(context: BrowserContext) {
	await context.addInitScript(() => {
		if (window !== window.top) return;
		const log: WorkerLogEntry[] = [];
		(window as unknown as { workerLog: typeof log }).workerLog = log;
		const Native = window.Worker;
		window.Worker = class extends Native {
			constructor(url: string | URL, options?: WorkerOptions) {
				super(url, options);
				const sent = new Map<number, WorkerLogEntry>();
				const post = this.postMessage.bind(this);
				this.postMessage = (message: { id: number; block: string; warmUp?: boolean }) => {
					sent.set(message.id, { block: message.block, warmUp: message.warmUp === true, sent: performance.now() });
					post(message);
				};
				this.addEventListener('message', (event: MessageEvent<{ id: number; outcome: { ok: boolean } }>) => {
					const request = sent.get(event.data.id);
					if (request) log.push({ ...request, ok: event.data.outcome.ok, replied: performance.now() });
				});
			}
		};
	});
}

async function freshPage(browser: Browser, flag: boolean, logged = false) {
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	if (logged) await logWorker(context);
	if (flag)
		await context.addInitScript((key) => {
			if (window === window.top) localStorage.setItem(key, '1');
		}, editorFlag);
	const network = recordNetwork(context);
	const page = await context.newPage();
	await page.goto(`${origin}${pagePath}`, { waitUntil: 'load' });
	return { context, network, page };
}

async function frameShows(block: Locator, text: string) {
	await block.locator('iframe.code-frame').waitFor({ state: 'visible', timeout: 60000 });
	const frame = await (await block.locator('iframe.code-frame').elementHandle())?.contentFrame();
	if (!frame) throw new Error('the block has no result frame');
	await frame.waitForFunction((want) => (document.body.textContent ?? '').includes(want), text, {
		timeout: 60000,
	});
	return true;
}

async function checks(browser: Browser): Promise<Check[]> {
	const results: Check[] = [];
	const [first] = blocks;

	{
		const { context, network, page } = await freshPage(browser, false);
		const blockCount = await scrollEveryBlockIntoView(page);
		await network.quiet();
		const scrolled = { blockCount, states: await blockStates(page), ...bootCounts(await network.assets()) };
		results.push({
			name: 'scrolling every block into view boots nothing',
			ok:
				blockCount > 0 &&
				scrolled.wasmRequests === 0 &&
				scrolled.compileWorkerScriptLoads === 0 &&
				scrolled.codeFrameLoads === 0 &&
				scrolled.states.every((state) => state === 'idle'),
			detail: scrolled,
		});

		const target = blockFor(page, first.title);
		await target.hover();
		await target.and(page.locator('[data-code="ready"]')).waitFor({ timeout: 60000 });
		await network.quiet();
		const states = await blockStates(page);
		const hovered = { states, ...bootCounts(await network.assets()) };
		const index = (await page.locator('.code-block').evaluateAll((all) =>
			all.map((box) => box.querySelector<HTMLElement>('[data-code-file]')?.dataset.codeFile ?? ''),
		)).indexOf(first.title);
		results.push({
			name: 'hovering one block boots only that block',
			ok:
				hovered.codeFrameLoads === 1 &&
				hovered.compileWorkerScriptLoads === 1 &&
				states.every((state, at) => (at === index ? state !== 'idle' : state === 'idle')),
			detail: hovered,
		});
		await context.close();
	}

	{
		const { context, page } = await freshPage(browser, false);
		// Scripts asked for after the hover wait until the key is typed, so the typing lands before the session loads.
		let release = () => {};
		const typed = new Promise<void>((done) => (release = done));
		let holding = false;
		await context.route('**/*.js', async (route) => {
			if (holding) await typed;
			await route.continue();
		});
		const target = blockFor(page, first.title);
		holding = true;
		await target.hover();
		await target.locator('[data-code-input]:visible:not([readonly])').first().waitFor({ timeout: 60000 });
		await caretAfter(target, first.caretAfter);
		const stateWhenTyped = await target.evaluate((box) => (box as HTMLElement).dataset.code);
		await page.keyboard.type('9');
		holding = false;
		release();
		await frameShows(target, `${first.visible}9`);
		results.push({
			name: 'typing before the block is ready reaches the result',
			ok: stateWhenTyped !== 'ready',
			detail: { stateWhenTyped, shown: `${first.visible}9` },
		});
		await context.close();
	}

	{
		const { context, network, page } = await freshPage(browser, true);
		const blockCount = await scrollEveryBlockIntoView(page);
		for (let index = 0; index < blockCount; index += 1)
			await page.locator('.code-block').nth(index).and(page.locator('[data-code="ready"]')).waitFor({ timeout: 60000 });
		const states = await blockStates(page);
		await network.quiet();
		const counts = bootCounts(await network.assets());
		results.push({
			name: 'a returning editor gets blocks booted on sight',
			ok: blockCount > 0 && states.every((state) => state !== 'idle') && counts.codeFrameLoads === blockCount,
			detail: { blockCount, states, ...counts },
		});
		results.push({
			name: 'every booted block shares one compiler',
			ok:
				blockCount === 3 &&
				counts.compileWorkerScriptLoads === 1 &&
				counts.wasmRequests === 3 &&
				Object.values(counts.wasmRequestsByModule).every((count) => count === 1),
			detail: { blockCount, ...counts },
		});
		await context.close();
	}

	{
		const { context, page } = await freshPage(browser, false, true);
		const edits = blocks.map((block) => ({ block, target: blockFor(page, block.title) }));
		for (const { target } of edits) {
			await target.hover();
			await target.and(page.locator('[data-code="ready"]')).waitFor({ timeout: 60000 });
		}
		let started = 0;
		for (const { block, target } of edits) {
			await caretAfter(target, block.caretAfter);
			started ||= performance.now();
			await page.keyboard.type('8');
		}
		const typedWithinMs = Math.round(performance.now() - started);
		for (const { block, target } of edits) await frameShows(target, `${block.visible}8`);
		const shown = await Promise.all(
			edits.map(async ({ target }) => {
				const frame = await (await target.locator('iframe.code-frame').elementHandle())?.contentFrame();
				return (await frame?.evaluate(() => document.body.textContent ?? '')) ?? '';
			}),
		);
		const edited = (
			(await page.evaluate(() => (window as unknown as { workerLog: WorkerLogEntry[] }).workerLog)) as WorkerLogEntry[]
		).filter((entry) => !entry.warmUp);
		const [firstEdit, secondEdit] = edited;
		const overlapped = Boolean(firstEdit && secondEdit && secondEdit.sent < firstEdit.replied!);
		results.push({
			name: 'edits to two blocks compiling at once both reach their own frames',
			ok:
				edited.length === 2 &&
				firstEdit!.block !== secondEdit!.block &&
				overlapped &&
				shown.every((text, at) =>
					blocks.every((block, other) => text.includes(`${block.visible}8`) === (at === other)),
				),
			detail: { typedWithinMs, overlapped, shown: shown.map((text) => text.replace(/\s+/g, ' ').slice(0, 120)) },
		});
		await context.close();
	}

	{
		const { context, page } = await freshPage(browser, false);
		const target = blockFor(page, first.title);
		await target.hover();
		await target.and(page.locator('[data-code="ready"]')).waitFor({ timeout: 60000 });
		await caretAfter(target, first.caretAfter);
		await page.keyboard.type('7');
		await frameShows(target, `${first.visible}7`);
		const started = performance.now();
		await page.keyboard.type('}');
		await target.and(page.locator('[data-code="error"]')).waitFor({ timeout: 60000 });
		const errorShownAfterMs = Math.round(performance.now() - started);
		const keptResult = await target.evaluate(
			(box, want) => {
				const frame = box.querySelector<HTMLIFrameElement>('iframe.code-frame')!;
				return !frame.hidden && (frame.contentDocument?.body.textContent ?? '').includes(want);
			},
			`${first.visible}7`,
		);
		results.push({
			name: 'a build error waits for the reader to pause and keeps the last good result',
			ok: errorShownAfterMs >= ERROR_PAUSE_MS && keptResult,
			detail: { errorShownAfterMs, pauseMs: ERROR_PAUSE_MS, keptResult },
		});
		await context.close();
	}

	{
		const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
		await logWorker(context);
		let release = () => {};
		const released = new Promise<void>((done) => (release = done));
		await context.route('**/*.wasm', async (route) => {
			await released;
			await route.continue();
		});
		const page = await context.newPage();
		await page.goto(`${origin}${pagePath}`, { waitUntil: 'load' });
		const [a, b] = blocks.map((block) => ({ block, target: blockFor(page, block.title) }));
		await a!.target.hover();
		await a!.target.and(page.locator('[data-code="ready"]')).waitFor({ timeout: 60000 });
		await caretAfter(a!.target, a!.block.caretAfter);
		await page.keyboard.type('6');
		await a!.target.and(page.locator('[data-code="running"]')).waitFor({ timeout: 60000 });
		await b!.target.hover();
		await b!.target.and(page.locator('[data-code="ready"]')).waitFor({ timeout: 60000 });
		release();
		await frameShows(a!.target, `${a!.block.visible}6`);
		const log = await page.waitForFunction(
			() => {
				const entries = (window as unknown as { workerLog: WorkerLogEntry[] }).workerLog;
				return entries.filter((entry) => entry.ok).length >= 3 ? entries : undefined;
			},
			undefined,
			{ timeout: 60000 },
		);
		const replies = (await log.jsonValue()) as { block: string; warmUp: boolean; ok: boolean }[];
		const built = replies.filter((entry) => entry.ok);
		const aEdit = built.findIndex((entry) => !entry.warmUp && entry.block === built[0]?.block);
		const bWarmUp = built.findIndex((entry) => entry.warmUp && entry.block !== built[0]?.block);
		const bFrame = await (await b!.target.locator('iframe.code-frame').elementHandle())?.contentFrame();
		await bFrame?.waitForFunction((want) => (document.body.textContent ?? '').includes(want), b!.block.visible, {
			timeout: 60000,
		});
		const bStageShown = await b!.target.evaluate(
			(box) => !box.querySelector<HTMLElement>('[data-code-stage]')!.hidden &&
				box.querySelector<HTMLIFrameElement>('iframe.code-frame')!.hidden,
		);
		results.push({
			name: 'a warm-up never runs ahead of another block’s waiting edit',
			ok: aEdit >= 0 && bWarmUp > aEdit && bStageShown,
			detail: { replies, bStageShown },
		});
		await context.close();
	}

	{
		const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
		const page = await context.newPage();
		await page.goto(`${origin}${pagePath}`, { waitUntil: 'load' });
		const target = blockFor(page, first.title);
		await target.hover();
		await target.and(page.locator('[data-code="ready"]')).waitFor({ timeout: 60000 });
		await caretAfter(target, first.caretAfter);
		await page.keyboard.type('7');
		await frameShows(target, `${first.visible}7`);
		const savedKeys = await page.evaluate((flag) => {
			localStorage.removeItem(flag);
			return Object.keys(localStorage).filter((key) => key.startsWith('markless-code:'));
		}, editorFlag);
		await page.close();

		const network = recordNetwork(context);
		const again = await context.newPage();
		await again.goto(`${origin}${pagePath}`, { waitUntil: 'load' });
		const restored = blockFor(again, first.title);
		await frameShows(restored, `${first.visible}7`);
		await network.quiet();
		const states = await blockStates(again);
		const counts = bootCounts(await network.assets());
		results.push({
			name: 'a block with a saved edit boots on sight and shows it',
			ok:
				savedKeys.length === 1 &&
				(await restored.evaluate((box) => box.hasAttribute('data-restored'))) &&
				counts.codeFrameLoads === 1 &&
				states.filter((state) => state !== 'idle').length === 1,
			detail: { savedKeys, states, ...counts },
		});
		await context.close();
	}

	if (browserName === 'webkit') {
		const context = await browser.newContext(devices[mobileDevice]);
		const page = await context.newPage();
		await page.goto(`${origin}${pagePath}`, { waitUntil: 'load' });
		const target = blockFor(page, first.title);
		await target.scrollIntoViewIfNeeded();
		const stateBeforeTap = await target.evaluate((box) => (box as HTMLElement).dataset.code);
		await target.locator('[data-code-input]:visible').first().tap();
		await target.and(page.locator('[data-code="ready"]')).waitFor({ timeout: 60000 });
		await caretAfter(target, first.caretAfter);
		await page.keyboard.type('5');
		await frameShows(target, `${first.visible}5`);
		results.push({
			name: `a tap boots a block and an edit shows its result (${mobileDevice} emulation)`,
			ok: stateBeforeTap === 'idle',
			detail: { device: mobileDevice, stateBeforeTap, shown: `${first.visible}5` },
		});
		await context.close();
	}
	return results;
}

const browser =
	browserName === 'chromium'
		? await chromium.launch({ channel: 'chrome', headless: true })
		: await (browserName === 'firefox' ? firefox : webkit).launch({ headless: true });
const browserLabel = `${browserName === 'chromium' ? 'chrome' : browserName} ${browser.version()} headless`;
const skipped = [
	...(throttles ? [] : ['CPU 4x editing: CPU throttling is a Chrome DevTools Protocol call, chromium only']),
	...(browserName === 'firefox' ? [`${mobileDevice} tap check: webkit only, Playwright's Firefox has no mobile emulation`] : []),
];
try {
	if (checking) {
		console.log(`browser: ${browserLabel}`);
		for (const reason of skipped) console.log(`skip ${reason}`);
		const results = await checks(browser);
		for (const result of results)
			console.log(`${result.ok ? 'ok  ' : 'FAIL'} ${result.name}\n     ${JSON.stringify(result.detail)}`);
		process.exitCode = results.every((result) => result.ok) ? 0 : 1;
	} else {
	const summary = {
		measuredAt: new Date().toISOString(),
		page: pagePath,
		browser: browserLabel,
		viewport: '1280x900',
		notes: [
			'transferredBytes = encoded response body plus headers as received; uncompressedBytes = decoded body length',
			'keystroke-to-result has no debounce: a keystroke sends its compile at once unless the block has one in flight',
			'each scenario runs in a fresh browser context with an empty cache',
		],
		scrollPast: await scrollPast(browser),
		bootEveryBlock: await bootEveryBlock(browser),
		editing: await editing(browser, 1),
		editingCpu4x: throttles ? await editing(browser, 4) : { skipped: skipped[0] },
	};
	const json = JSON.stringify(summary, null, '\t');
	console.log(json);
	if (outPath) {
		await mkdir(dirname(resolve(outPath)), { recursive: true });
		await writeFile(resolve(outPath), `${json}\n`);
	}
	}
} finally {
	await browser.close();
	stop();
}
