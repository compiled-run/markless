import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { readFile, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { chromium, type Page } from '@playwright/test';
import { resolve } from 'pathe';
import { afterEach, describe, expect, test } from 'vitest';
import { marklessBuildManifestPath } from '../src/build/build-manifests.ts';
import { runtimeModuleIdFromOrigin } from '../src/build/bundle-graph.ts';
import { MARKLESS_INTERACTION_CLOSURES } from '../src/build/chunking.ts';
import { readInteractionClosuresAsset } from '../src/build/interaction-closures.ts';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const outerRead = resolve(import.meta.dirname, 'fixtures/vite-ssr-row-outer-read');
const componentRows = resolve(import.meta.dirname, 'fixtures/component-row-demand');
let server: Server | undefined;

afterEach(async () => {
	await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
	server = undefined;
});

async function buildAndServe(fixture: string, env: Record<string, string>): Promise<string> {
	await build(fixture, env);
	return serve(fixture);
}

async function build(fixture: string, env: Record<string, string>): Promise<void> {
	await rm(resolve(fixture, 'dist'), { force: true, recursive: true });
	await exec(resolve(root, 'node_modules/.bin/vp'), ['build', '--app'], {
		cwd: fixture,
		env: { ...process.env, ...env },
	});
}

let componentRowsBuilt: Promise<void> | undefined;
async function serveComponentRows(): Promise<string> {
	await (componentRowsBuilt ??= build(componentRows, {}));
	return `${await serve(componentRows)}/`;
}

async function serve(fixture: string): Promise<string> {
	const dist = resolve(fixture, 'dist');
	const entry = (await import(
		`${pathToFileURL(resolve(dist, 'server-render/server.js')).href}?test=${Date.now()}`
	)) as { render(): Promise<string> };
	const html = `<!doctype html><html><body>${await entry.render()}</body></html>`;
	server = createServer(async (request, response) => {
		const path = new URL(request.url ?? '/', 'http://fixture.local').pathname;
		if (path === '/') {
			response.setHeader('Content-Type', 'text/html;charset=utf-8');
			response.end(html);
			return;
		}
		try {
			const source = await readFile(resolve(dist, `.${path}`));
			response.setHeader(
				'Content-Type',
				path.endsWith('.html') ? 'text/html;charset=utf-8' : 'text/javascript',
			);
			response.end(source);
		} catch {
			response.statusCode = 404;
			response.end();
		}
	});
	await new Promise<void>((done) => server!.listen(0, '127.0.0.1', done));
	return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

function rows(page: Page) {
	return page.evaluate(() =>
		[...document.querySelectorAll('li')].map((row) => {
			const state = row.classList.contains('chosen') ? 'chosen' : row.classList.contains('idle') ? 'idle' : '?';
			return `${row.dataset.slug}:${state}:${row.querySelector('.flag')?.textContent}:${row.querySelector('.mark')?.textContent}`;
		}),
	);
}

// The scoped module's class stays on every row, served or rebuilt.
function rowsKeepScope(page: Page) {
	return page.evaluate(() =>
		[...document.querySelectorAll('li')].every((row) => row.classList.length === 2),
	);
}

// Row markup reading page state outside the @for follows writes to it, whichever handler wrote it.
async function exerciseOuterReads(url: string, ready: (page: Page) => Promise<void>) {
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(url);
		await ready(page);
		expect(await rows(page)).toEqual(['a:idle:off:', 'b:idle:off:', 'c:idle:off:']);

		await page.click('li[data-slug="b"] .choose');
		await expect.poll(() => page.textContent('#chosen')).toBe('b');
		await expect.poll(() => rows(page)).toEqual(['a:idle:off:B', 'b:chosen:on:B', 'c:idle:off:B']);

		await page.click('#choose-c');
		await expect.poll(() => rows(page)).toEqual(['a:idle:off:C', 'b:idle:off:C', 'c:chosen:on:C']);

		await page.click('#append');
		await expect
			.poll(() => rows(page))
			.toEqual(['a:idle:off:C', 'b:idle:off:C', 'c:chosen:on:C', 'd:idle:off:C']);
		await page.click('li[data-slug="d"] .choose');
		await expect
			.poll(() => rows(page))
			.toEqual(['a:idle:off:D', 'b:idle:off:D', 'c:idle:off:D', 'd:chosen:on:D']);
		expect(await rowsKeepScope(page)).toBe(true);
		expect(errors).toEqual([]);
	} finally {
		await browser.close();
	}
}

for (const [label, env] of [
	['packed', {}],
	['unpacked', { ROW_OUTER_UNPACKED: '1' }],
] as const) {
	describe(`row bindings reading outer state (${label})`, () => {
		test('follow writes after SSR resume and in a client render', async () => {
			const url = await buildAndServe(outerRead, env);
			await exerciseOuterReads(`${url}/`, async () => {});
			await exerciseOuterReads(`${url}/csr.html`, (page) =>
				page.waitForSelector('body[data-ready="true"]').then(() => undefined),
			);
		}, 180_000);
	});
}

const titles = (page: Page, shelf: number) =>
	page.locator(`section[data-shelf="${shelf}"] [data-title]`).allTextContents();

// Files of the packs no route loads, and the runtime they hold, from the pack planner's own manifest.
async function leftOutOfThePage(): Promise<{ files: Set<string>; runtime: string[] }> {
	const asset = readInteractionClosuresAsset(
		await readFile(
			marklessBuildManifestPath(resolve(componentRows, 'dist'), MARKLESS_INTERACTION_CLOSURES),
			'utf8',
		),
	);
	const routeFiles = new Set(
		asset.routes.flatMap((route) => [...(route.files?.firstUse ?? []), ...(route.files?.render ?? [])]),
	);
	const files = new Set<string>();
	const runtime: string[] = [];
	for (const [name, packFiles] of Object.entries(asset.packFiles ?? {})) {
		if (packFiles.some((file) => routeFiles.has(file))) continue;
		for (const file of packFiles) files.add(`/${file}`);
		for (const id of asset.packs[name] ?? []) {
			const runtimeId = runtimeModuleIdFromOrigin(resolve(componentRows, id));
			if (runtimeId) runtime.push(runtimeId);
		}
	}
	return { files, runtime };
}

async function exerciseComponentRows(url: string) {
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		const fetched: string[] = [];
		page.on('request', (request) => {
			if (request.resourceType() === 'script') fetched.push(new URL(request.url()).pathname);
		});
		await page.goto(url, { waitUntil: 'networkidle' });
		await expect.poll(() => titles(page, 0)).toEqual(['Dune', 'Emma', 'Ubik']);
		await expect.poll(() => titles(page, 1)).toEqual(['Dune', 'Ubik']);
		const first = page.locator('section[data-shelf="0"]');
		await first.locator('[data-toggle]').click();
		await expect.poll(() => first.locator('[data-detail]').textContent()).toBe('Filter: ');
		await first.locator('[data-toggle]').click();
		await expect.poll(() => first.locator('[data-detail]').count()).toBe(0);
		await first.locator('[data-edit]').nth(1).click();
		await expect.poll(() => page.locator('[data-editing]').textContent()).toBe('Emma');
		await page.locator('[data-close]').click();
		await expect.poll(() => page.locator('[data-editor]').count()).toBe(0);

		await page.locator('[data-new-title]').fill('Eon');
		await page.locator('[data-save]').click();
		await expect.poll(() => page.locator('[data-saved]').textContent()).toBe('1');
		await expect.poll(() => titles(page, 0)).toEqual(['Dune', 'Emma', 'Ubik', 'Eon']);

		await page.locator('[data-add-shelf]').click();
		const added = page.locator('section[data-shelf="2"]');
		await expect.poll(() => titles(page, 2)).toEqual(['Dune', 'Emma', 'Eon']);
		await added.locator('[data-toggle]').click();
		await expect.poll(() => added.locator('[data-detail]').textContent()).toBe('Filter: e');
		await added.locator('[data-edit]').first().click();
		await expect.poll(() => page.locator('[data-editing]').textContent()).toBe('Dune');

		await page.locator('[data-poll]').click();
		await expect.poll(() => page.locator('[data-polls]').textContent()).toBe('3');
		await expect.poll(() => titles(page, 1)).toEqual(['Dune', 'Ubik']);

		await page.locator('[data-browse]').click();
		const catalog = page.locator('[data-catalog]');
		await expect.poll(() => catalog.locator('[data-pick]').allTextContents()).toEqual(['Dune']);
		await catalog.locator('[data-pick]').click();
		await expect.poll(() => catalog.locator('[data-picked]').textContent()).toBe('Dune');
		await page.locator('[data-browse]').click();
		await expect.poll(() => catalog.count()).toBe(0);

		expect(errors).toEqual([]);
		const leftOut = await leftOutOfThePage();
		expect(leftOut.runtime).toContain('web/resume-repeat-branch-arm');
		expect(fetched.filter((file) => leftOut.files.has(file))).toEqual([]);
	} finally {
		await browser.close();
	}
}

// Runtime the page's records never name is packed apart; whatever a component row, an @if that runs a
// component, a form or a poll reaches must arrive with the page's pack, never from a pack left out of it.
test('a page whose rows are components never fetches the runtime its build left out', async () => {
	await exerciseComponentRows(await serveComponentRows());
}, 180_000);

type HeldIdle = typeof globalThis & { __heldIdle: Array<() => void> };

// Idle is held, through the clock every root inherits and the browser's own callback, so "before idle" is a state the test reads, not a race.
function holdIdle() {
	const held: Array<() => void> = ((globalThis as HeldIdle).__heldIdle = []);
	Object.defineProperty(Element.prototype, '__mClock', {
		configurable: true,
		get: () => ({ frame: (run: () => void) => requestAnimationFrame(run), idle: (run: () => void) => held.push(run) }),
	});
	globalThis.requestIdleCallback = ((run: IdleRequestCallback) =>
		held.push(() => run({ didTimeout: false, timeRemaining: () => 50 }))) as typeof requestIdleCallback;
}

async function drainIdle(page: Page) {
	for (let quiet = 0; quiet < 3; ) {
		const ran = await page.evaluate(() => {
			const due = (globalThis as HeldIdle).__heldIdle.splice(0);
			for (const run of due) run();
			return due.length;
		});
		quiet = ran ? 0 : quiet + 1;
		await page.waitForTimeout(50);
	}
}

// The row mint leaves the page's render data to the first row build: a press that adds a component row
// evaluates it from the pack the page already loaded, before or after the page went idle, and fetches no script.
test('a component row added before or after the page is idle builds with no script fetched after load', async () => {
	const url = await serveComponentRows();
	const browser = await chromium.launch();
	try {
		for (const idle of ['held', 'reached'] as const) {
			const page = await browser.newPage();
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			await page.addInitScript(holdIdle);
			await page.goto(url, { waitUntil: 'networkidle' });
			// This fixture's HTML lists no preloads, so a first input loads the page's pack and the row mint with it.
			const first = page.locator('section[data-shelf="0"]');
			await first.locator('[data-toggle]').click();
			await expect.poll(() => first.locator('[data-detail]').textContent()).toBe('Filter: ');
			await page.waitForLoadState('networkidle');
			const afterLoad: string[] = [];
			page.on('request', (request) => {
				if (request.resourceType() === 'script') afterLoad.push(new URL(request.url()).pathname);
			});
			if (idle === 'reached') await drainIdle(page);
			// Nothing idle has run when the press arrives.
			else
				expect(
					await page.evaluate(() => (globalThis as HeldIdle).__heldIdle.length),
				).toBeGreaterThan(0);
			await page.locator('[data-add-shelf]').click();
			await expect.poll(() => titles(page, 2), { timeout: 10_000 }).toEqual(['Dune', 'Emma']);
			await page.locator('section[data-shelf="2"] [data-toggle]').click();
			await expect
				.poll(() => page.locator('section[data-shelf="2"] [data-detail]').textContent())
				.toBe('Filter: e');
			expect({ idle, errors, afterLoad }).toEqual({ idle, errors: [], afterLoad: [] });
			await page.close();
		}
	} finally {
		await browser.close();
	}
}, 180_000);
