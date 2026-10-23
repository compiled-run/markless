import { readFile, stat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, resolve } from 'pathe';
import { chromium } from '@playwright/test';
import { startBuiltServer as startNitroServer } from '../../../../scripts/test-utils/built-server.ts';

export type ServedApp = { readonly url: string; close(): Promise<void> };

const CONTENT_TYPES: Record<string, string> = {
	'.css': 'text/css',
	'.html': 'text/html;charset=utf-8',
	'.js': 'text/javascript',
	'.json': 'application/json',
};

/** Serves a built static app directory the way a static host would. */
export async function serveStaticDirectory(directory: string): Promise<ServedApp> {
	const server = createServer(async (request, response) => {
		let file = resolve(
			directory,
			`.${decodeURIComponent(new URL(request.url ?? '/', 'http://app.local').pathname)}`,
		);
		try {
			if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
			response.setHeader(
				'Content-Type',
				CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
			);
			response.end(await readFile(file));
		} catch {
			response.statusCode = 404;
			response.end();
		}
	});
	return listen(server);
}

/** Starts a demo's built Nitro server. */
export async function startBuiltServer(demo: string): Promise<ServedApp> {
	const server = await startNitroServer(resolve(demo, '.output/server/index.mjs'), {
		cwd: demo,
		env: { ...process.env, HOST: '127.0.0.1' },
	});
	return {
		url: `${server.origin}/`,
		close: async () => server.close('SIGKILL'),
	};
}

/**
 * Bytes of same-origin JavaScript V8 ran before the first input, inline scripts included:
 * the ranges precise block coverage counts as executed once the page has loaded and settled.
 */
export async function executedAtLoad(
	url: string,
	options: { readonly settledSelector?: string } = {},
): Promise<number> {
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		const origin = new URL(url).origin;
		// Only same-origin JS is counted; live third-party images held the load event past 30 s.
		await page.route(
			(requestUrl) => requestUrl.origin !== origin,
			(route) => route.abort('blockedbyclient'),
		);
		const cdp = await page.context().newCDPSession(page);
		const scriptUrls = new Map<string, string>();
		await cdp.send('Profiler.enable');
		await cdp.send('Debugger.enable');
		cdp.on('Debugger.scriptParsed', (event) => scriptUrls.set(event.scriptId, event.url));
		await cdp.send('Profiler.startPreciseCoverage', { callCount: false, detailed: true });
		await page.goto(url, { waitUntil: 'load' });
		if (options.settledSelector)
			await page.waitForSelector(options.settledSelector, { state: 'attached' });
		await page.waitForLoadState('networkidle');
		// Idle callbacks run first-in first-out, so this one lands after the idle work the page queued at load.
		await page.evaluate(() => new Promise<void>((settled) => requestIdleCallback(() => settled())));
		const { result } = await cdp.send('Profiler.takePreciseCoverage');
		let executed = 0;
		for (const script of result) {
			const scriptUrl = script.url || scriptUrls.get(script.scriptId) || '';
			if (scriptUrl.startsWith(origin)) executed += executedBytes(script.functions);
		}
		return executed;
	} finally {
		await browser.close();
	}
}

type CoverageRange = { startOffset: number; endOffset: number; count: number };

function executedBytes(functions: readonly { ranges: readonly CoverageRange[] }[]): number {
	const events: { offset: number; open: boolean; range: CoverageRange }[] = [];
	for (const fn of functions)
		for (const range of fn.ranges) {
			events.push({ offset: range.startOffset, open: true, range });
			events.push({ offset: range.endOffset, open: false, range });
		}
	events.sort((a, b) => a.offset - b.offset || Number(a.open) - Number(b.open));
	const active: CoverageRange[] = [];
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
		if (event.open) active.push(event.range);
		else active.splice(active.indexOf(event.range), 1);
	}
	return executed;
}

function listen(server: Server): Promise<ServedApp> {
	return new Promise((settle) =>
		server.listen(0, '127.0.0.1', () => {
			const { port } = server.address() as AddressInfo;
			settle({
				url: `http://127.0.0.1:${port}/`,
				close: () => new Promise<void>((done) => server.close(() => done())),
			});
		}),
	);
}
