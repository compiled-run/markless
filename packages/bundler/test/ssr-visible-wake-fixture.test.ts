import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readdir, readFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';
import { resolve } from 'pathe';
import { expect, test } from 'vitest';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const fixture = resolve(root, 'packages/bundler/fixtures/vite-ssr-visible-wake');
const dist = resolve(fixture, 'dist');
const port = 4407;

// Unpacked, the full prerender resume is its own chunk, and the trigger group's path never fetches it.
// Packed, that code rides the preloaded pack; the per-element counts pin the trigger group's behaviour.
test.each([false, true])(
	'onVisible on a wake-channel page fires at load and on scroll with no gesture, once per element, through its own trigger group (packing: %s)',
	async (packing) => {
		await rm(dist, { force: true, recursive: true });
		await exec(resolve(root, 'node_modules/.bin/vp'), ['build', '--app'], {
			cwd: fixture,
			env: { ...process.env, MARKLESS_FIXTURE_NATIVE_PACKING: packing ? '1' : '0' },
		});

		const buildDir = resolve(dist, 'build');
		const fullResumeChunks = new Set<string>();
		if (!packing) {
			for (const file of await readdir(buildDir))
				if (
					file.endsWith('.js') &&
					/export\{[^}]*resumeFromPrerenderRecords/.test(
						await readFile(resolve(buildDir, file), 'utf8'),
					)
				)
					fullResumeChunks.add(`/build/${file}`);
			expect(fullResumeChunks.size).toBe(1);
		}
		const entry = (await import(
			`${pathToFileURL(resolve(dist, 'server-render/server.js')).href}?test=${Date.now()}`
		)) as { render(): Promise<string> };
		const body = await entry.render();
		expect(body).not.toContain('markless/view');
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
		await new Promise<void>((done) => server.listen(port, '127.0.0.1', done));
		const browser = await chromium.launch();
		try {
			const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
			const scripts: string[] = [];
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			page.on('request', (request) => {
				if (request.resourceType() === 'script')
					scripts.push(new URL(request.url()).pathname);
			});
			const count = () => page.locator('output').textContent();
			const fullResumeFetched = () => scripts.some((url) => fullResumeChunks.has(url));

			await page.goto(`http://127.0.0.1:${port}/`);
			await expect.poll(count).toBe('1');
			await page.waitForTimeout(300);
			expect(await count()).toBe('1');
			if (!packing) expect(fullResumeFetched()).toBe(false);

			await page.locator('footer').scrollIntoViewIfNeeded();
			await expect.poll(count).toBe('2');
			await expect.poll(() => page.locator('[data-seen]').count()).toBe(1);
			await expect.poll(() => page.locator('[data-many]').count()).toBe(1);

			await page.evaluate(() => window.scrollTo(0, 0));
			await page.locator('footer').scrollIntoViewIfNeeded();
			await page.evaluate(() => window.scrollTo(0, 0));
			await page.waitForTimeout(300);
			expect(await count()).toBe('2');
			if (!packing) expect(fullResumeFetched()).toBe(false);

			await page.locator('[data-add]').click();
			await expect.poll(count).toBe('12');
			await page.locator('[data-snapshot]').click();
			await expect.poll(() => page.locator('[data-snapshot-value]').textContent()).toBe('24');
			await page.locator('footer').scrollIntoViewIfNeeded();
			await page.waitForTimeout(300);
			expect(await count()).toBe('12');
			expect(await page.locator('[data-many]').count()).toBe(1);
			expect(errors).toEqual([]);
		} finally {
			await browser.close();
			await new Promise((done) => server.close(done));
		}
	},
	120_000,
);
