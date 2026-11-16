import { cp, mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { buildFixture } from '../support/fixture-build.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// A popover in a row-level @if of a keyed @for: the served page painted the row @if's other arm last, and the
// popover's own derived attributes must still follow its state in every row that shows it.

vi.setConfig({ testTimeout: 60_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let browser: Browser | undefined;
let server: BuiltServer | undefined;

beforeAll(async () => {
	root = await realpath(await mkdtemp(join(tmpdir(), 'markless-mdx-row-arm-app-')));
	await cp(resolve(import.meta.dirname, '../fixtures/mdx-row-arm-app'), root, { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await symlink(join(packagesRoot, 'headless/components'), join(root, 'node_modules/@markless/ui'), 'dir');
	await symlink(resolve(packagesRoot, 'router/node_modules/nitro'), join(root, 'node_modules/nitro'), 'dir');
	await buildFixture({ root });
	server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	browser = await launchBrowser(chromium);
}, 240_000);

afterAll(async () => {
	await browser?.close();
	await server?.close();
	await rm(root, { recursive: true, force: true });
});

for (const word of ['values', 'instructions'])
	test(`the popover on "${word}" opens on hover, in a row whose @if the served page took the other way last`, async () => {
		const page = await browser!.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(`${server!.origin}/`);
		const trigger = page.locator(`[data-term="${word}"]`);
		await trigger.hover();
		await expect
			.poll(async () => ({
				expanded: await trigger.getAttribute('aria-expanded'),
				hidden: await page.locator(`[data-tip="${word}"]`).evaluate((tip) => (tip as HTMLElement).hidden),
			}))
			.toEqual({ expanded: 'true', hidden: false });
		expect(errors).toEqual([]);
		await page.close();
	});
