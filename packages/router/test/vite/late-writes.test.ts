import { cp, mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { buildFixture } from '../support/fixture-build.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// A write the handler makes after it has returned (a timer, a promise, a view transition) reaches a
// prerendered, resumed page just as a write made inside the handler does.

vi.setConfig({ testTimeout: 60_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let browser: Browser | undefined;
let server: BuiltServer | undefined;

beforeAll(async () => {
	root = await realpath(await mkdtemp(join(tmpdir(), 'markless-late-writes-app-')));
	await cp(resolve(import.meta.dirname, '../fixtures/late-writes-app'), root, { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await symlink(resolve(packagesRoot, 'router/node_modules/nitro'), join(root, 'node_modules/nitro'), 'dir');
	await buildFixture({ root });
	server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	browser = await launchBrowser(chromium);
}, 240_000);

afterAll(async () => {
	await browser?.close();
	server?.close();
	if (root) await rm(root, { recursive: true, force: true });
});

const writes = ['sync', 'timeout', 'await', 'transition', 'then'] as const;

async function pressed(path: string, write: string, read: (page: import('@playwright/test').Page) => Promise<unknown>, before: unknown, after: unknown) {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`${server!.origin}${path}`);
	expect(await read(page)).toEqual(before);
	await page.click(`[data-write="${write}"]`);
	await expect.poll(() => read(page), { timeout: 2_000 }).toEqual(after);
	expect(errors).toEqual([]);
	await page.close();
}

test.each(writes)('a keyed list shows a row written %s', (write) =>
	pressed('/hand', write, (page) => page.locator('li').allTextContents(), ['A', 'B', 'C'], ['A', 'B', 'C', 'D']),
);

test('a keyed list shows two rows swapped by two writes in a timer', () =>
	pressed('/hand', 'swap', (page) => page.locator('li').allTextContents(), ['A', 'B', 'C'], ['C', 'B', 'A']),
);

test.each(writes)('a text read shows a count written %s', (write) =>
	pressed('/count', write, (page) => page.locator('p').textContent(), '0', '1'),
);
