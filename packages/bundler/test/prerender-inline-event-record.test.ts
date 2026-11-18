import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { chromium, type Page } from '@playwright/test';
import { resolve } from 'pathe';
import { afterAll, expect, test } from 'vitest';

// A prerendered page's startup script records each event it forwards before the runtime starts,
// in the container's record of unhandled events an in-place navigation waits for.

const exec = promisify(execFile);
const fixture = resolve(import.meta.dirname, '../fixtures/vite-prerender-multi-child');
const buildScript = resolve(import.meta.dirname, 'helpers/build-packing-fixture.ts');
const outRoots: string[] = [];
afterAll(() => Promise.all(outRoots.map((path) => rm(path, { force: true, recursive: true }))));

const pages = [
	{ page: 'App.tsrx', boot: 'prerender', press: '[data-left-increment]', shows: '[data-counter-side="left"]', text: /^1$/ },
	{ page: 'late-mount/SettleTryIf.tsrx', boot: 'settle', press: '[data-open]', shows: '[data-chip]', text: /chip 0\/0/ },
] as const;

const unhandled = (tab: Page) =>
	tab.evaluate(
		() =>
			(document.querySelector('[data-async-container]') as { __mH?: Map<object, unknown> }).__mH
				?.size ?? 0,
	);

async function serve(dist: string) {
	const server = createServer(async (request, response) => {
		const path = new URL(request.url ?? '/', 'http://fixture.local').pathname;
		try {
			const body = await readFile(resolve(dist, `.${path === '/' ? '/index.html' : path}`));
			response.setHeader(
				'Content-Type',
				path.endsWith('.js') ? 'text/javascript' : 'text/html;charset=utf-8',
			);
			response.end(body);
		} catch {
			response.statusCode = 404;
			response.end();
		}
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	return {
		origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
		close: () => new Promise<void>((done) => server.close(() => done())),
	};
}

for (const { page, boot, press, shows, text } of pages) {
	test(`${boot} boot: an event before the runtime starts stays recorded until it is handled, and a failed forward is reported once`, async () => {
		const dist = resolve(fixture, 'node_modules/.markless-event-record', page.replace(/\W/g, '-'));
		outRoots.push(dist);
		await exec(process.execPath, [buildScript, 'vite-prerender-multi-child', dist, '0'], {
			cwd: fixture,
			env: { ...process.env, MARKLESS_FIXTURE_PAGE: page, MARKLESS_PRERENDER_WAKE: '1' },
		});
		const html = await readFile(resolve(dist, 'index.html'), 'utf8');
		const resumeModule = /data-markless-resume-module="([^"]+)"/.exec(html)![1]!;
		expect(html.includes('data-markless-settle-module')).toBe(boot === 'settle');
		expect(html).not.toContain('data-markless-self-wake');
		const server = await serve(dist);
		const browser = await chromium.launch();
		try {
			const tab = await browser.newPage();
			const errors: string[] = [];
			tab.on('pageerror', (error) => errors.push(error.message));
			let release!: () => void;
			const released = new Promise<void>((done) => (release = done));
			await tab.route(
				(url) => url.pathname === resumeModule,
				async (route) => {
					await released;
					await route.continue();
				},
			);
			await tab.goto(`${server.origin}/`);
			await tab.waitForLoadState('load');
			await tab.locator(press).click();
			await expect.poll(() => unhandled(tab)).toBe(1);
			// A followed link is the navigation itself: the boot forwards it but records nothing.
			// The settle page has no link of its own, and a link added to it fails its resume (also before the record).
			if (boot === 'prerender')
				await tab.evaluate(() => {
					const link = document.createElement('a');
					link.href = '#followed';
					link.textContent = 'Followed';
					document.querySelector('[data-async-container]')!.append(link);
					link.click();
					link.remove();
				});
			expect(await unhandled(tab)).toBe(1);
			release();
			await expect.poll(() => tab.locator(shows).textContent()).toMatch(text);
			await expect.poll(() => unhandled(tab)).toBe(0);
			expect(errors).toEqual([]);
			await tab.close();

			const failing = await browser.newPage();
			const failures: string[] = [];
			failing.on('pageerror', (error) => failures.push(error.message));
			await failing.route(
				(url) => url.pathname === resumeModule,
				(route) => route.abort(),
			);
			await failing.goto(`${server.origin}/`);
			await failing.waitForLoadState('load');
			await failing.locator(press).click();
			await expect.poll(() => failures.length).toBe(1);
			expect(await unhandled(failing)).toBe(0);
			await failing.close();
		} finally {
			await browser.close();
			await server.close();
		}
	}, 180_000);
}
