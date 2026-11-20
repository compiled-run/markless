import { cp, mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { buildFixture } from '../support/fixture-build.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// An MDX island's list whose parent element an @if arm renders: the arm names the list by the island's prefixed id.

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await realpath(await mkdtemp(join(tmpdir(), 'markless-mdx-arm-list-app-')));
	await cp(resolve(import.meta.dirname, '../fixtures/mdx-arm-list-app'), root, {
		recursive: true,
	});
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await symlink(
		resolve(packagesRoot, 'router/node_modules/nitro'),
		join(root, 'node_modules/nitro'),
		'dir',
	);
	await buildFixture({ root });
	server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	browser = await launchBrowser(chromium);
}, 240_000);

afterAll(async () => {
	await browser?.close();
	server?.close();
	await rm(root, { recursive: true, force: true });
});

test('a write adds its row, before and after the arm closes and opens again', async () => {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`${server!.origin}/`);
	const rows = () =>
		page.evaluate(() =>
			[...document.querySelectorAll('section li')].map((row) => row.textContent).join(','),
		);
	await page.click('[data-add]');
	await expect.poll(rows).toBe('x,y,t2');
	await page.click('[data-toggle]');
	await expect.poll(rows).toBe('');
	await page.click('[data-toggle]');
	await page.click('[data-add]');
	await expect.poll(rows).toBe('x,y,t2,t3');
	expect(errors).toEqual([]);
	await page.close();
}, 60_000);
