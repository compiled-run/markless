import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';
import { resolve } from 'pathe';
import { afterAll, expect, test } from 'vitest';

// A prerendered page's startup script lists only the event types its served
// markup needs. An element an @if inside @try commits after resume can ask for
// a type the list never had (dblclick here), and the runtime hands that type
// back to the startup script, which must start listening for it.

const exec = promisify(execFile);
const fixture = resolve(import.meta.dirname, '../fixtures/vite-prerender-multi-child');
const buildScript = resolve(import.meta.dirname, 'helpers/build-packing-fixture.ts');
const outRoots: string[] = [];
afterAll(() => Promise.all(outRoots.map((path) => rm(path, { force: true, recursive: true }))));

const pages = [
	{ page: 'late-mount/TryIf.tsrx', script: 'data-markless-self-wake' },
	{ page: 'late-mount/SettleTryIf.tsrx', script: 'data-markless-settle-module' },
] as const;

for (const { page, script } of pages) {
	test(`${page}: a chip mounted after resume takes an event type the startup script never listed`, async () => {
		const dist = resolve(
			fixture,
			'node_modules/.markless-late-events',
			page.replace(/\W/g, '-'),
		);
		outRoots.push(dist);
		await exec(process.execPath, [buildScript, 'vite-prerender-multi-child', dist, '0'], {
			cwd: fixture,
			env: { ...process.env, MARKLESS_FIXTURE_PAGE: page, MARKLESS_PRERENDER_WAKE: '1' },
		});
		const html = await readFile(resolve(dist, 'index.html'), 'utf8');
		expect(html).toContain(script);
		expect(html).not.toMatch(/\(\[[^\]]*"dblclick"/);

		const server = createServer(async (request, response) => {
			const path = new URL(request.url ?? '/', 'http://fixture.local').pathname;
			try {
				const body = await readFile(
					resolve(dist, `.${path === '/' ? '/index.html' : path}`),
				);
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
		const { port } = server.address() as AddressInfo;
		const browser = await chromium.launch();
		try {
			const tab = await browser.newPage();
			const errors: string[] = [];
			tab.on('pageerror', (error) => errors.push(error.message));
			await tab.goto(`http://127.0.0.1:${port}/`);
			await tab.waitForLoadState('networkidle');
			const chip = tab.locator('[data-chip]');
			await tab.locator('[data-open]').click();
			await expect.poll(() => chip.textContent()).toBe('chip 0/0');
			await chip.click();
			await expect.poll(() => chip.textContent()).toBe('chip 1/0');
			await chip.dispatchEvent('dblclick');
			await expect.poll(() => chip.textContent()).toBe('chip 1/1');
			expect(errors).toEqual([]);
		} finally {
			await browser.close();
			await new Promise<void>((done) => server.close(() => done()));
		}
	}, 120_000);
}
