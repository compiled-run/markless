import { cp, mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { buildFixture } from '../support/fixture-build.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// On a router-built page the overlay behaviour must install, so a shown popover or modal hears Escape and an outside press.

vi.setConfig({ testTimeout: 60_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let browser: Browser | undefined;
let server: BuiltServer | undefined;

beforeAll(async () => {
	root = await realpath(await mkdtemp(join(tmpdir(), 'markless-overlay-dismiss-app-')));
	await cp(resolve(import.meta.dirname, '../fixtures/overlay-dismiss-app'), root, { recursive: true });
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

const hidden = (page: Page, selector: string) =>
	page.locator(selector).evaluate((element) => (element as HTMLElement).hidden);

async function opened(trigger: string, surface: string) {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`${server!.origin}/`);
	await page.locator(trigger).click();
	await expect.poll(() => hidden(page, surface)).toBe(false);
	return { page, errors };
}

test('a popover opened on a router-built page closes on a press outside it', async () => {
	const { page, errors } = await opened('[data-popover-trigger]', '[data-popover]');
	await page.locator('[data-changes]').click();
	await expect.poll(() => hidden(page, '[data-popover]')).toBe(true);
	expect(errors).toEqual([]);
	await page.close();
});

test('a popover opened on a router-built page closes on Escape', async () => {
	const { page, errors } = await opened('[data-popover-trigger]', '[data-popover]');
	await page.keyboard.press('Escape');
	await expect.poll(() => hidden(page, '[data-popover]')).toBe(true);
	expect(errors).toEqual([]);
	await page.close();
});

test('a modal opened on a router-built page closes on Escape', async () => {
	const { page, errors } = await opened('[data-modal-trigger]', '[data-modal]');
	await page.keyboard.press('Escape');
	await expect.poll(() => hidden(page, '[data-modal]')).toBe(true);
	expect(errors).toEqual([]);
	await page.close();
});
