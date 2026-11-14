import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { chromium, type Page } from '@playwright/test';
import { resolve } from 'pathe';
import { afterEach, describe, expect, test } from 'vitest';

// Lists placed in a child's keyed rows, the TanStack playground's shape, answered in the browser of a
// production build. Which renderer filled them is read from V8 coverage mapped through the build's own
// source maps: the settle kernel, or the whole-module prerender evaluator.

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const fixture = resolve(import.meta.dirname, 'fixtures/kernel-placed-rows');
const dist = resolve(fixture, 'dist');
const EVALUATOR = 'packages/web/src/prerender/evaluator.ts';
const KERNEL = 'packages/web/src/settle-kernel.ts';
let server: Server | undefined;

afterEach(async () => {
	await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
	server = undefined;
});

type Shape = 'lists' | 'evaluated' | 'siblings';

let built: Shape | undefined;
async function buildAndServe(shape: Shape): Promise<string> {
	if (built !== shape) {
		await rm(dist, { force: true, recursive: true });
		await exec(resolve(root, 'node_modules/.bin/vp'), ['build', '--app'], {
			cwd: fixture,
			env: { ...process.env, KERNEL_ROWS_SHAPE: shape },
		});
		built = shape;
	}
	const entry = (await import(
		`${pathToFileURL(resolve(dist, 'server-render/server.js')).href}?shape=${shape}&t=${Date.now()}`
	)) as { render(): Promise<string> };
	const head = (await readFile(resolve(dist, 'index.html'), 'utf8')).replace('<div id="app"></div>', '');
	const html = `<!doctype html><html><head>${head}</head><body>${await entry.render()}</body></html>`;
	server = createServer(async (request, response) => {
		const path = new URL(request.url ?? '/', 'http://fixture.local').pathname;
		if (path === '/') {
			response.setHeader('Content-Type', 'text/html;charset=utf-8');
			response.end(html);
			return;
		}
		try {
			response.setHeader('Content-Type', 'text/javascript');
			response.end(await readFile(resolve(dist, `.${path}`)));
		} catch {
			response.statusCode = 404;
			response.end();
		}
	});
	await new Promise<void>((done) => server!.listen(0, '127.0.0.1', done));
	return `http://127.0.0.1:${(server!.address() as AddressInfo).port}/`;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Source map v3: per generated line, segments of [column, source, line, column] deltas in base64 VLQ.
function decodeMappings(mappings: string) {
	const lines: Array<Array<readonly [column: number, source: number]>> = [];
	let source = 0;
	let originalLine = 0;
	let originalColumn = 0;
	for (const line of mappings.split(';')) {
		const segments: Array<readonly [number, number]> = [];
		let column = 0;
		for (const segment of line.split(',')) {
			if (!segment) continue;
			const fields: number[] = [];
			let value = 0;
			let shift = 0;
			for (const char of segment) {
				const digit = BASE64.indexOf(char);
				value += (digit & 31) << shift;
				if (digit & 32) shift += 5;
				else {
					fields.push(value & 1 ? -(value >>> 1) : value >>> 1);
					value = 0;
					shift = 0;
				}
			}
			column += fields[0]!;
			if (fields.length >= 4) {
				source += fields[1]!;
				originalLine += fields[2]!;
				originalColumn += fields[3]!;
				segments.push([column, source]);
			}
		}
		lines.push(segments);
	}
	return lines;
}

// The source module each executed function of the served chunks was built from.
async function executedSources(coverage: ReadonlyArray<{ url: string; functions: ReadonlyArray<{ ranges: ReadonlyArray<{ startOffset: number; count: number }> }> }>) {
	const sources = new Set<string>();
	for (const script of coverage) {
		if (!script.url.startsWith('http')) continue;
		const path = new URL(script.url).pathname;
		if (!path.endsWith('.js')) continue;
		const code = await readFile(resolve(dist, `.${path}`), 'utf8').catch(() => undefined);
		const map = await readFile(resolve(dist, `.${path}.map`), 'utf8').catch(() => undefined);
		if (!code || !map) continue;
		const parsed = JSON.parse(map) as { sources: string[]; mappings: string };
		const lines = decodeMappings(parsed.mappings);
		const lineStarts = [0];
		for (let index = 0; index < code.length; index++) if (code[index] === '\n') lineStarts.push(index + 1);
		for (const fn of script.functions) {
			const range = fn.ranges[0];
			if (!range || range.count === 0) continue;
			let line = lineStarts.length - 1;
			while (lineStarts[line]! > range.startOffset) line--;
			const column = range.startOffset - lineStarts[line]!;
			const segment = (lines[line] ?? []).filter(([at]) => at <= column).at(-1);
			if (!segment) continue;
			const file = parsed.sources[segment[1]];
			if (file) sources.add(resolve(dist, 'build', file).slice(root.length + 1));
		}
	}
	return sources;
}

// The page's own lists stream from the server. A list added in the browser asks there; its answer is held
// until the new row stands, so the measured window is that answer landing and nothing else.
async function addedListFill(page: Page, url: string, rowStandsFirst: boolean) {
	await page.addInitScript(() => {
		const held = globalThis as typeof globalThis & { __answers?: Promise<void>; __release?: () => void };
		held.__answers = new Promise<void>((release) => (held.__release = release));
	});
	const cdp = await page.context().newCDPSession(page);
	const urls = new Map<string, string>();
	cdp.on('Debugger.scriptParsed', (script) => urls.set(script.scriptId, script.url));
	await cdp.send('Debugger.enable');
	await cdp.send('Profiler.enable');
	await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: false });
	await page.goto(url, { waitUntil: 'networkidle' });
	const fetched: string[] = [];
	await expect.poll(() => page.locator('[data-view="1"] [data-row]').count()).toBeGreaterThan(0);
	// Counts reset on each take. A row whose components the evaluator renders stands only once their answers land.
	if (rowStandsFirst) {
		await page.locator('[data-add]').click();
		await expect.poll(() => page.locator('[data-view="2"]').count()).toBe(1);
		await page.waitForLoadState('networkidle');
		await cdp.send('Profiler.takePreciseCoverage');
	} else {
		await cdp.send('Profiler.takePreciseCoverage');
		await page.locator('[data-add]').click();
	}
	// This fixture's document names no preloads, so the press may load the page's pack; the answer must not fetch.
	page.on('request', (request) => {
		if (request.resourceType() === 'script') fetched.push(new URL(request.url()).pathname);
	});
	await page.evaluate(() => (globalThis as typeof globalThis & { __release?: () => void }).__release?.());
	await expect.poll(() => page.locator('[data-view="2"] [data-row]').count()).toBeGreaterThan(0);
	await page.waitForLoadState('networkidle');
	const { result } = (await cdp.send('Profiler.takePreciseCoverage')) as {
		result: ReadonlyArray<Parameters<typeof executedSources>[0][number] & { scriptId: string }>;
	};
	await cdp.detach();
	expect(fetched).toEqual([]);
	return executedSources(result.map((script) => ({ ...script, url: script.url || (urls.get(script.scriptId) ?? '') })));
}

const rowsOf = (page: Page, view: number, list: string) => page.locator(`[data-view="${view}"] ${list} [data-row]`);
// Per list: the rows its filter keeps, '' -> all, 'u' -> Dune and Ubik, 'e' (the added list) -> Dune and Emma.
const SHOWN = [3, 2, 2];

// A row handler writes the owner's state, a write to the owner's state reaches every row, and a refetch keeps
// the nodes of the rows it brings back unchanged.
async function exerciseRows(page: Page, list: string, reloads: number) {
	for (const [view, count] of SHOWN.entries()) {
		const owner = page.locator(`[data-view="${view}"] ${list}`);
		await expect.poll(() => rowsOf(page, view, list).count()).toBe(count);
		await rowsOf(page, view, list).first().locator('[data-pick]').click();
		await expect
			.poll(() => owner.locator('[data-picked]').textContent(), { message: `${list} list ${view} pick` })
			.toBe('Dune');
		await owner.locator('[data-mark]').click();
		await expect
			.poll(() => owner.locator('[data-mark-text]').allTextContents(), { message: `${list} list ${view}` })
			.toEqual(Array(count).fill('-+'));
	}
	await page.evaluate((selector) => {
		for (const row of document.querySelectorAll(`${selector} [data-row]`))
			(row as HTMLElement & { __kept?: string }).__kept = row.getAttribute('data-row')!;
	}, list);
	await page.locator('[data-reload]').click();
	await expect
		.poll(() => rowsOf(page, 0, list).locator('[data-pick]').allTextContents())
		.toEqual(['Dune', 'Emma', `Ubik ${reloads}`]);
	const kept = await page.evaluate(
		(selector) =>
			[0, 2].map((view) =>
				[...document.querySelectorAll(`[data-view="${view}"] ${selector} [data-row]`)].map(
					(row) => (row as HTMLElement & { __kept?: string }).__kept ?? 'new',
				),
			),
		list,
	);
	// Ubik's text changed with the refetch, so only the rows that came back unchanged must keep their nodes.
	expect(kept).toEqual([['1', '2', kept[0]![2]], ['1', '2']]);
}

describe('a list added in component rows, answered in the browser of a production build', () => {
	test('the kernel fills them without the evaluator running, and their rows stay live', async () => {
		const url = await buildAndServe('lists');
		const browser = await chromium.launch();
		try {
			const page = await browser.newPage();
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			const ran = await addedListFill(page, url, true);
			expect(ran.has(KERNEL)).toBe(true);
			expect(ran.has(EVALUATOR)).toBe(false);
			await exerciseRows(page, '.list', 1);
			expect(errors).toEqual([]);
		} finally {
			await browser.close();
		}
	}, 180_000);

	test('component rows the kernel refuses fill through the evaluator, and their rows stay live', async () => {
		const url = await buildAndServe('evaluated');
		const browser = await chromium.launch();
		try {
			const page = await browser.newPage();
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			const ran = await addedListFill(page, url, false);
			expect(ran.has(EVALUATOR)).toBe(true);
			await exerciseRows(page, '.carded', 1);
			expect(errors).toEqual([]);
		} finally {
			await browser.close();
		}
	}, 180_000);

	test('rows whose expression reads the owner state follow its writes through the evaluator', async () => {
		const url = await buildAndServe('evaluated');
		const browser = await chromium.launch();
		try {
			const page = await browser.newPage();
			await addedListFill(page, url, false);
			await exerciseRows(page, '.joined', 1);
		} finally {
			await browser.close();
		}
	}, 180_000);

	test('a row holding two list components as direct siblings fills both, and their rows stay live', async () => {
		const url = await buildAndServe('siblings');
		const browser = await chromium.launch();
		try {
			const page = await browser.newPage();
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			await addedListFill(page, url, false);
			await exerciseRows(page, '.joined', 1);
			await exerciseRows(page, '.carded', 2);
			expect(errors).toEqual([]);
		} finally {
			await browser.close();
		}
	}, 180_000);
});
