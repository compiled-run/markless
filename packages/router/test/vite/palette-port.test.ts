import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// Repros from the shadcn docs palette port, on a production build served by its own Nitro server.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-palette-port-app-'));
	await cp(resolve(import.meta.dirname, '../fixtures/palette-port-app'), root, {
		recursive: true,
	});
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	const builder = await createBuilder({
		root,
		configFile: false,
		logLevel: 'silent',
		plugins: [markless(), router()],
	});
	await builder.buildApp();
	server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	browser = await launchBrowser(chromium);
});

afterAll(async () => {
	await browser?.close();
	await server?.close();
	if (root) await rm(root, { recursive: true, force: true });
});

async function open(path: string): Promise<{ page: Page; errors: string[] }> {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`${server!.origin}${path}`, { waitUntil: 'networkidle' });
	return { page, errors };
}

test('a row a re-settled @try adds runs its handler with its own row', async () => {
	const { page, errors } = await open('/try-row-handler-local');
	const rows = page.locator('main > p').filter({ hasText: /^row / });
	await expect.poll(() => rows.allInnerTexts()).toEqual(['row 0', 'row 1']);
	await page.getByRole('button', { name: 'more' }).click();
	await expect.poll(() => rows.allInnerTexts()).toEqual(['row 0', 'row 1', 'row 2']);
	for (const label of ['row 2', 'row 1', 'row 0', 'row 2']) {
		await rows.filter({ hasText: label }).click();
		await expect
			.poll(() => page.locator('main > p').first().innerText())
			.toBe(`picked ${label}`);
	}
	expect(errors).toEqual([]);
	await page.close();
});

test('a list whose wrapper binds the async value keeps its rows after the next settle', async () => {
	const { page, errors } = await open('/try-wrapper-binding');
	const more = page.getByRole('button', { name: 'more' });
	await more.click();
	await expect.poll(() => page.locator('ul li').allInnerTexts()).toEqual(['row 0']);
	await more.click();
	await expect.poll(() => page.locator('ul li').allInnerTexts()).toEqual(['row 0', 'row 1']);
	expect(await page.locator('ul').isVisible()).toBe(true);
	expect(errors).toEqual([]);
	await page.close();
});

// The palette page's own shape: one async list read by several @try blocks, rows with three handlers each.
test('every @try over one re-settled list keeps its rows, and each row runs its own handlers', async () => {
	const { page, errors } = await open('/palette-variants');
	const picks = page.locator('#v6 .pick');
	const picked = page.locator('#picked');
	await expect.poll(() => picks.allInnerTexts()).toEqual(['row 0', 'row 1']);
	await page.locator('#more').click();
	await page.locator('#more').click();
	await expect.poll(() => picks.allInnerTexts()).toEqual(['row 0', 'row 1', 'row 2', 'row 3']);
	await expect.poll(() => page.locator('#v5 li').allInnerTexts()).toEqual(['row 0', 'row 1', 'row 2', 'row 3']);
	expect(await page.locator('#v5 ul').isVisible()).toBe(true);
	await expect.poll(() => page.locator('#v4').innerText()).toBe('4');
	for (const index of [3, 0, 2, 1]) {
		await picks.nth(index).click();
		await expect.poll(() => picked.innerText()).toBe(`click row ${index}`);
		await picks.nth(index).dispatchEvent('cmdkselect');
		await expect.poll(() => picked.innerText()).toBe(`plain row ${index}`);
	}
	expect(errors).toEqual([]);
	await page.close();
});
