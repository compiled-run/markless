import { cp, mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { buildFixture } from '../support/fixture-build.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// An MDX island's @if arm that holds a component opens, and the component in it works.

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await realpath(await mkdtemp(join(tmpdir(), 'markless-mdx-arm-component-app-')));
	await cp(resolve(import.meta.dirname, '../fixtures/mdx-arm-component-app'), root, {
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

for (const [name, path, hasList] of [
	['an MDX island arm holding a component', '/panel', false],
	['an MDX island arm holding a keyed list and a component', '/rich', true],
	['the same arm on a page', '/page-rich', true],
] as const)
	test(
		name,
		async () => {
			const page = await browser!.newPage();
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			await page.goto(`${server!.origin}${path}`);
			const shown = () =>
				page.evaluate(
					() =>
						`${document.querySelectorAll('section li').length} ${document.querySelector('.badge')?.textContent ?? '-'}`,
				);
			await page.click('[data-open]');
			await expect
				.poll(async () => errors.join() || (await shown()))
				.toBe(hasList ? '2 0' : '0 0');
			await page.click('.badge');
			await expect
				.poll(async () => errors.join() || (await shown()))
				.toBe(hasList ? '2 1' : '0 1');
			if (hasList) {
				await page.click('[data-add]');
				await expect.poll(async () => errors.join() || (await shown())).toBe('3 1');
			}
			await page.click('[data-open]');
			await expect.poll(async () => errors.join() || (await shown())).toBe('0 -');
			await page.close();
		},
		60_000,
	);
