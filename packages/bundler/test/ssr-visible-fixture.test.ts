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
const fixture = resolve(root, 'packages/bundler/fixtures/vite-ssr-visible');
const dist = resolve(fixture, 'dist');
const port = 4406;

test('onVisible fires at load and on scroll with no prior gesture, once per element', async () => {
	await rm(dist, { force: true, recursive: true });
	await exec(resolve(root, 'node_modules/.bin/vp'), ['build', '--app'], { cwd: fixture });

	const buildDir = resolve(dist, 'build');
	let resumeModuleUrl: string | undefined;
	for (const file of await readdir(buildDir))
		if (
			file.endsWith('.js') &&
			(await readFile(resolve(buildDir, file), 'utf8')).includes('resumeContainerEvent')
		)
			resumeModuleUrl = `/build/${file}`;
	expect(resumeModuleUrl).toBeDefined();
	const entry = (await import(
		`${pathToFileURL(resolve(dist, 'server-render/server.js')).href}?test=${Date.now()}`
	)) as { render(options: { resumeModuleUrl?: string }): Promise<string> };
	const body = await entry.render({ resumeModuleUrl });
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
		expect(scripts.some((url) => !loadedBeforeScroll.has(url))).toBe(true);

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
}, 120_000);
