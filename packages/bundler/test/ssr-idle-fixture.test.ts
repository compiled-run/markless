import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readdir, readFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { chromium, webkit } from '@playwright/test';
import { resolve } from 'pathe';
import { expect, test, vi } from 'vitest';
import { listenOnFreePort } from './helpers/listen.ts';

const exec = promisify(execFile);

// Each poll waits on a real browser loading, idling and fetching code, which takes seconds on a loaded machine.
vi.setConfig({ expect: { poll: { timeout: 15_000 } } });
const root = resolve(import.meta.dirname, '../../..');
const fixtureDir = (wake: boolean) =>
	resolve(root, `packages/bundler/fixtures/vite-ssr-idle${wake ? '-wake' : ''}`);

// Held through the deferred-trigger clock seam so "not idle yet" is a state the test observes rather than a race it wins.
const HOLD_IDLE = `(() => {
	const queued = [];
	Object.defineProperty(Element.prototype, "__mClock", { configurable: true, get: () => ({ frame: (run) => run(), idle: (run) => queued.push(run) }) });
	window.__releaseIdle = () => { for (const run of queued.splice(0)) run(); };
})();`;

test.each([
	{ packing: false, wake: false },
	{ packing: true, wake: false },
	{ packing: false, wake: true },
	{ packing: true, wake: true },
])(
	'onIdle runs once after load and idle with no gesture, fetching its code only then (%o)',
	async ({ packing, wake }) => {
		const fixture = fixtureDir(wake);
		const dist = resolve(fixture, 'dist');
		await rm(dist, { force: true, recursive: true });
		await exec(resolve(root, 'node_modules/.bin/vp'), ['build', '--app'], {
			cwd: fixture,
			env: {
				...process.env,
				MARKLESS_FIXTURE_NATIVE_PACKING: packing ? '1' : '0',
			},
		});
		const buildDir = resolve(dist, 'build');
		const analyticsChunks = new Set<string>();
		for (const file of await readdir(buildDir))
			if (
				file.endsWith('.js') &&
				(await readFile(resolve(buildDir, file), 'utf8')).includes('data-analytics')
			)
				analyticsChunks.add(`/build/${file}`);
		expect(analyticsChunks.size).toBe(1);

		const entry = (await import(
			`${pathToFileURL(resolve(dist, 'server-render/server.js')).href}?test=${Date.now()}`
		)) as { render(): Promise<string> };
		const body = await entry.render();
		expect(body.includes('markless/view')).toBe(!wake);
		expect(body).toContain('requestIdleCallback');
		// The image holds the load event, so idle before load is reachable on purpose.
		const html = `<!doctype html><html><head></head><body>${body}<img src="/slow.png" alt=""></body></html>`;
		let releaseImage = () => {};
		const imageReleased = new Promise<void>((done) => (releaseImage = done));

		const server = createServer(async (request, response) => {
			const path = new URL(request.url ?? '/', 'http://fixture.local').pathname;
			if (path === '/') {
				response.setHeader('Content-Type', 'text/html;charset=utf-8');
				response.end(html);
				return;
			}
			if (path === '/slow.png') {
				await imageReleased;
				response.setHeader('Content-Type', 'image/png');
				response.end();
				return;
			}
			try {
				const source = await readFile(resolve(dist, `.${path}`));
				response.setHeader('Content-Type', 'text/javascript');
				response.end(source);
			} catch {
				response.statusCode = 404;
				response.end();
			}
		});
		const port = await listenOnFreePort(server);
		const browser = await chromium.launch();
		try {
			const errors: string[] = [];
			const count = (page: import('@playwright/test').Page) =>
				page.locator('output').textContent();

			const loading = await browser.newPage();
			loading.on('pageerror', (error) => errors.push(error.message));
			await loading.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
			await loading.waitForTimeout(500);
			expect(await loading.evaluate(() => document.readyState)).not.toBe('complete');
			expect(await count(loading)).toBe('0');
			releaseImage();
			await expect.poll(() => count(loading)).toBe('1');
			expect(await loading.locator('body').getAttribute('data-idle-ready-state')).toBe(
				'complete',
			);
			await expect
				.poll(() => loading.locator('body').getAttribute('data-analytics'))
				.toBe('loaded');
			await loading.waitForTimeout(300);
			expect(await count(loading)).toBe('1');
			await loading.locator('button').click();
			await expect.poll(() => count(loading)).toBe('11');
			await loading.waitForTimeout(300);
			expect(await count(loading)).toBe('11');

			const held = await browser.newPage();
			held.on('pageerror', (error) => errors.push(error.message));
			await held.addInitScript(HOLD_IDLE);
			const scripts: string[] = [];
			held.on('request', (request) => {
				if (request.resourceType() === 'script')
					scripts.push(new URL(request.url()).pathname);
			});
			await held.goto(`http://127.0.0.1:${port}/`);
			await held.waitForTimeout(300);
			expect(await count(held)).toBe('0');
			expect(scripts.some((path) => analyticsChunks.has(path))).toBe(false);
			const beforeIdle = new Set(scripts);
			await expect
				.poll(async () => {
					await held.evaluate(() =>
						(window as { __releaseIdle?: () => void }).__releaseIdle?.(),
					);
					return count(held);
				})
				.toBe('1');
			await expect
				.poll(() => held.locator('body').getAttribute('data-analytics'))
				.toBe('loaded');
			expect(scripts.some((path) => analyticsChunks.has(path))).toBe(true);
			if (!packing)
				expect(scripts.filter((path) => !beforeIdle.has(path)).length).toBeGreaterThan(1);
			expect(errors).toEqual([]);
		} finally {
			await browser.close();
			await new Promise((done) => server.close(done));
		}
	},
	120_000,
);

// WebKit has neither scheduler.postTask nor requestIdleCallback, so its idle is the timeout fallback.
test('WebKit runs onIdle no sooner than 200 ms after load', async () => {
	const fixture = fixtureDir(false);
	const dist = resolve(fixture, 'dist');
	await rm(dist, { force: true, recursive: true });
	await exec(resolve(root, 'node_modules/.bin/vp'), ['build', '--app'], { cwd: fixture });
	const entry = (await import(
		`${pathToFileURL(resolve(dist, 'server-render/server.js')).href}?test=${Date.now()}`
	)) as { render(): Promise<string> };
	const html = `<!doctype html><html><head></head><body>${await entry.render()}</body></html>`;
	const server = createServer(async (request, response) => {
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
	const port = await listenOnFreePort(server);
	const browser = await webkit.launch();
	try {
		const page = await browser.newPage();
		await page.addInitScript(() =>
			addEventListener('load', () =>
				document.documentElement.setAttribute('data-load-at', String(performance.now())),
			),
		);
		await page.goto(`http://127.0.0.1:${port}/`);
		await expect.poll(() => page.locator('output').textContent()).toBe('1');
		const [loadAt, idleAt] = await page.evaluate(() => [
			Number(document.documentElement.getAttribute('data-load-at')),
			Number(document.body.getAttribute('data-idle-at')),
		]);
		expect(idleAt - loadAt).toBeGreaterThanOrEqual(200);
	} finally {
		await browser.close();
		await new Promise((done) => server.close(done));
	}
}, 120_000);
