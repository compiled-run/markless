import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';
import { resolve } from 'pathe';
import { afterAll, expect, test } from 'vitest';
import { buildFixture } from '../../router/test/support/fixture-build.ts';
import { listenOnFreePort } from './helpers/listen.ts';

// The linker keys a composed child by the module it is imported from, not by its declared name.

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const outRoots: string[] = [];
afterAll(() => Promise.all(outRoots.map((path) => rm(path, { force: true, recursive: true }))));

function expectAllFour(markers: Record<string, string>) {
	expect(markers['[data-widget="first"]']).toBe('First');
	expect(markers['[data-widget="second"]']).toBe('Second');
	expect(markers['[data-named="a"]']).toBe('Named A');
	expect(markers['[data-named="b"]']).toBe('Named B');
}

test('CSR: same-name default and named exports from different directories render their own markup', async () => {
	const fixtureRoot = resolve(root, 'packages/bundler/fixtures/vite-csr-export-collision');
	const outDir = resolve(fixtureRoot, 'node_modules/.markless-export-collision');
	outRoots.push(outDir);
	await buildFixture({
		root: fixtureRoot,
		configFile: resolve(fixtureRoot, 'vite.config.ts'),
		build: { outDir, emptyOutDir: true },
	});

	const server = createServer(async (request, response) => {
		const path = request.url === '/' ? '/index.html' : request.url!.split('?')[0]!;
		try {
			const body = await readFile(resolve(outDir, `.${path}`));
			response.setHeader('content-type', path.endsWith('.js') ? 'text/javascript' : 'text/html');
			response.end(body);
		} catch {
			response.statusCode = 404;
			response.end();
		}
	});
	const port = await listenOnFreePort(server);
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(String(error)));
		await page.goto(`http://127.0.0.1:${port}/`);
		await expect.poll(() => page.locator('[data-widget], [data-named]').count()).toBe(4);
		const markers: Record<string, string> = {};
		for (const selector of [
			'[data-widget="first"]',
			'[data-widget="second"]',
			'[data-named="a"]',
			'[data-named="b"]',
		])
			markers[selector] = (await page.locator(selector).textContent()) ?? '';
		expect(errors).toEqual([]);
		expectAllFour(markers);
	} finally {
		await browser.close();
		server.close();
	}
}, 120_000);

test('SSR: same-name default and named exports from different directories render their own markup', async () => {
	const fixtureRoot = resolve(root, 'packages/bundler/fixtures/vite-ssr-export-collision');
	const dist = resolve(fixtureRoot, 'dist');
	await rm(dist, { force: true, recursive: true });
	await exec(resolve(root, 'node_modules/.bin/vp'), ['build', '--app'], { cwd: fixtureRoot });

	const entry = (await import(
		`${pathToFileURL(resolve(dist, 'server-render/server.js')).href}?test=${Date.now()}`
	)) as { render(): Promise<string> };
	const body = await entry.render();

	const markers: Record<string, string> = {};
	for (const [selector, pattern] of [
		['[data-widget="first"]', /data-widget="first"[^>]*>([^<]*)</],
		['[data-widget="second"]', /data-widget="second"[^>]*>([^<]*)</],
		['[data-named="a"]', /data-named="a"[^>]*>([^<]*)</],
		['[data-named="b"]', /data-named="b"[^>]*>([^<]*)</],
	] as const)
		markers[selector] = body.match(pattern)?.[1] ?? '';
	expectAllFour(markers);
}, 120_000);
