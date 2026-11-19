import { cp, mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium } from '@playwright/test';
import { afterAll, expect, test } from 'vitest';
import { startBuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';
import { buildFixture } from '../support/fixture-build.ts';
import {
	FRAGMENT_PATH_PREFIX,
	FRAGMENT_PRERENDERED,
	FRAGMENT_REGION_END,
	fragmentPageUrl,
} from '../../src/vite/fragment-navigation.ts';

// Nitro builds its prerenderer separately from the Vite services; a page it cannot reach prerenders as a 404.
const packagesRoot = resolve(import.meta.dirname, '../../..');
const cleanups: Array<() => Promise<void> | void> = [];
afterAll(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

test('routes with a prerender route rule are written as their page HTML at build', async () => {
	const root = await mkdtemp(join(tmpdir(), 'markless-prerender-'));
	cleanups.push(() => rm(root, { recursive: true, force: true }));
	await cp(resolve(import.meta.dirname, '../fixtures/prerender-app'), root, { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await buildFixture({
		root,
		nitro: { routeRules: { '/': { prerender: true }, '/guide': { prerender: true } } },
	});

	const publicDir = join(root, '.output/public');
	const home = await readFile(join(publicDir, 'index.html'), 'utf8');
	expect(home).toContain('data-page="home"');
	expect(home).toContain('Prerendered home');
	expect(home).toContain('<title>Prerender app</title>');
	const guide = await readFile(join(publicDir, 'guide/index.html'), 'utf8');
	expect(guide).toContain('data-page="guide"');
	expect(guide).toContain('Prerendered guide');

	const server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	cleanups.push(() => server.close());
	const browser = await launchBrowser(chromium);
	cleanups.push(() => browser.close());
	const page = await browser.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(server.origin + '/');
	await page.click('[data-click]');
	await expect.poll(() => page.textContent('[data-click]')).toBe('1');
	await page.click('[data-to-guide]');
	await page.waitForSelector('[data-page="guide"]');
	expect(new URL(page.url()).pathname).toBe('/guide');
	expect(errors).toEqual([]);
}, 180_000);

// Served as a static host would: every request is a file under .output/public, a path names its index.html.
async function serveFiles(dir: string) {
	const server = createServer(async (request, response) => {
		const path = decodeURIComponent(new URL(request.url!, 'http://localhost').pathname);
		for (const file of [join(dir, path), join(dir, path, 'index.html')]) {
			const body = await readFile(file).catch(() => undefined);
			if (!body) continue;
			const type = file.endsWith('.js')
				? 'text/javascript'
				: file.endsWith('.css')
					? 'text/css'
					: 'text/html;charset=utf-8';
			response.writeHead(200, {
				'content-type': type,
				'cache-control': 'public, max-age=0, must-revalidate',
			});
			return response.end(body);
		}
		response.writeHead(404).end();
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	cleanups.push(() => server.close());
	return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test('a fragment prerendered for the build is fetched once a session: a revisit swaps it in with no request', async () => {
	const root = await mkdtemp(join(tmpdir(), 'markless-prerender-fragments-'));
	cleanups.push(() => rm(root, { recursive: true, force: true }));
	await cp(resolve(import.meta.dirname, '../fixtures/prerender-app'), root, { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	const routes = ['/', '/guide'];
	await buildFixture({
		root,
		router: { prefetch: { idle: 'none' } },
		nitro: {
			routeRules: Object.fromEntries(
				routes.flatMap((route) => [
					[route, { prerender: true }],
					[`${FRAGMENT_PATH_PREFIX}${route}`, { prerender: true }],
				]),
			),
		},
	});
	const publicDir = join(root, '.output/public');
	const fragment = await readFile(
		join(publicDir, `${FRAGMENT_PATH_PREFIX}/guide/index.html`),
		'utf8',
	);
	expect(fragment.endsWith(FRAGMENT_PRERENDERED + FRAGMENT_REGION_END)).toBe(true);
	expect(await readFile(join(publicDir, 'guide/index.html'), 'utf8')).not.toContain(
		FRAGMENT_PRERENDERED,
	);

	const origin = await serveFiles(publicDir);
	const browser = await launchBrowser(chromium);
	cleanups.push(() => browser.close());
	const page = await browser.newPage();
	const errors: string[] = [];
	const fragments: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('request', (request) => {
		const destination = fragmentPageUrl(new URL(request.url()));
		if (destination) fragments.push(destination.pathname);
	});
	await page.goto(origin + '/');
	for (const [link, landed] of [
		['[data-to-guide]', 'guide'],
		['[data-to-home]', 'home'],
		['[data-to-guide]', 'guide'],
		['[data-to-home]', 'home'],
	] as const) {
		await page.click(link);
		await page.waitForSelector(`[data-page="${landed}"]`);
	}
	expect(new URL(page.url()).pathname).toBe('/');
	expect(fragments.toSorted()).toEqual(['/', '/guide']);
	expect(errors).toEqual([]);
}, 180_000);
