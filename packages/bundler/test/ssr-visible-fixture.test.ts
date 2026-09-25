import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';
import { resolve } from 'pathe';
import { expect, test } from 'vitest';
import { listenOnFreePort } from './helpers/listen.ts';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const fixture = resolve(root, 'packages/bundler/fixtures/vite-ssr-visible');
const dist = resolve(fixture, 'dist');
let port = 0;

// Unpacked, the scrolled-to element's handler is its own chunk, fetched only on scroll. Packed, it rides
// the preloaded pack; the count staying at 1 until the scroll shows it still runs only then.
test.each([false, true])(
	'onVisible fires at load and on scroll with no prior gesture, once per element (packing: %s)',
	async (packing) => {
		await rm(dist, { force: true, recursive: true });
		await exec(resolve(root, 'node_modules/.bin/vp'), ['build', '--app'], {
			cwd: fixture,
			env: { ...process.env, MARKLESS_FIXTURE_NATIVE_PACKING: packing ? '1' : '0' },
		});

		const entry = (await import(
			`${pathToFileURL(resolve(dist, 'server-render/server.js')).href}?test=${Date.now()}`
		)) as { render(): Promise<string> };
		const body = await entry.render();
		expect(body).toContain('IntersectionObserver');
		const html = `<!doctype html><html><head><meta name="viewport" content="width=800"></head><body>${body}</body></html>`;

		const server = createServer(async (request, response) => {
			const path = new URL(request.url ?? '/', 'http://fixture.local').pathname;
			if (path === '/') {
				response.setHeader('Content-Type', 'text/html;charset=utf-8');
				response.end(html);
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
		port = await listenOnFreePort(server);
		const browser = await chromium.launch();
		try {
			const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
			const scripts: string[] = [];
			page.on('request', (request) => {
				if (request.resourceType() === 'script') scripts.push(request.url());
			});
			const count = () => page.locator('output').textContent();

			await page.goto(`http://127.0.0.1:${port}/`);
			await expect.poll(count).toBe('1');
			await page.waitForTimeout(300);
			expect(await count()).toBe('1');
			const loadedBeforeScroll = new Set(scripts);

			await page.locator('footer').scrollIntoViewIfNeeded();
			await expect.poll(count).toBe('2');
			if (!packing) expect(scripts.some((url) => !loadedBeforeScroll.has(url))).toBe(true);

			await page.evaluate(() => window.scrollTo(0, 0));
			await page.locator('footer').scrollIntoViewIfNeeded();
			await page.evaluate(() => window.scrollTo(0, 0));
			await page.waitForTimeout(300);
			expect(await count()).toBe('2');

			await page.locator('button').click();
			await expect.poll(count).toBe('12');
			await page.locator('footer').scrollIntoViewIfNeeded();
			await page.waitForTimeout(300);
			expect(await count()).toBe('12');
		} finally {
			await browser.close();
			await new Promise((done) => server.close(done));
		}
	},
	120_000,
);
