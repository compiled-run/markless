import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, expect, test } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';

// A Link with no href rendered by a component file (not by the page itself) must
// not leave the pages composing that component importing render data it never exports.
const packagesRoot = resolve(import.meta.dirname, '../../..');
const cleanups: Array<() => Promise<void> | void> = [];
afterAll(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function freePort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const probe = createServer();
		probe.once('error', reject);
		probe.listen(0, '127.0.0.1', () => {
			const address = probe.address();
			probe.close(() =>
				typeof address === 'object' && address ? resolvePort(address.port) : reject(),
			);
		});
	});
}

test('a component file holding an href-less Link builds and serves every page composing it', async () => {
	const root = await mkdtemp(join(tmpdir(), 'markless-component-link-'));
	cleanups.push(() => rm(root, { recursive: true, force: true }));
	await cp(resolve(import.meta.dirname, '../fixtures/component-link-app'), root, { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	const builder = await createBuilder({
		root,
		configFile: false,
		logLevel: 'silent',
		plugins: [markless({ experimentalNativePacking: true }), router()],
	});
	await builder.buildApp();

	const port = await freePort();
	const server = spawn(process.execPath, [join(root, '.output/server/index.mjs')], {
		env: { PATH: process.env.PATH, PORT: String(port), HOST: '127.0.0.1' },
		stdio: 'ignore',
	});
	cleanups.push(() => void server.kill());
	const origin = `http://127.0.0.1:${port}`;
	const fetchPage = async (path: string) => {
		for (let attempt = 0; attempt < 100; attempt++) {
			const response = await fetch(new URL(path, origin)).catch(() => undefined);
			if (response) return response;
			await new Promise((wait) => setTimeout(wait, 100));
		}
		throw new Error('built server never answered');
	};
	for (const [path, page] of [
		['/', 'first'],
		['/second', 'second'],
	] as const) {
		const response = await fetchPage(path);
		expect(response.status, path).toBe(200);
		const html = await response.text();
		expect(html, path).toContain(`data-page="${page}"`);
		expect(html, path).toMatch(/<a [^>]*data-menu="nowhere"[^>]*>Nowhere<\/a>/);
		expect(html, path).toMatch(/<a [^>]*href="\/second"[^>]*>Second<\/a>/);
	}

	const browser = await chromium.launch();
	cleanups.push(() => browser.close());
	const page = await browser.newPage();
	await page.goto(origin + '/');
	await page.click('[data-click]');
	await expect.poll(() => page.textContent('[data-click]')).toBe('1');
	await page.click('[data-menu="second"]');
	await page.waitForSelector('[data-page="second"]');
	expect(new URL(page.url()).pathname).toBe('/second');
}, 180_000);
