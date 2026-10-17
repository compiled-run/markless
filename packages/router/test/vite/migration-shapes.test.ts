import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';

// Shapes real app ports (a dashboard and a notes app) hit, pinned on a built app
// served by its own Nitro server and driven in Chromium.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-migration-app-'));
	await cp(resolve(import.meta.dirname, '../fixtures/migration-app'), root, { recursive: true });
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
	browser = await chromium.launch();
});

afterAll(async () => {
	await browser?.close();
	server?.close();
	if (root) await rm(root, { recursive: true, force: true });
});

async function open(path: string): Promise<{ page: Page; errors: string[] }> {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`${server!.origin}${path}`);
	return { page, errors };
}

test('every sibling statement of an @try arm renders on the server', async () => {
	const html = await (await fetch(`${server!.origin}/siblings`)).text();
	expect(html).toContain('<h2 data-owner="">Ada</h2>');
	expect(html).toContain('<li data-line="">$12</li><li data-line="">$30</li>');
	expect(html).toContain('<p data-closing="">end of ledger</p>');
});

test('two boundaries reading one streamed value both leave their pending arm', async () => {
	const { page, errors } = await open('/shared');
	await expect.poll(() => page.locator('[data-high]').textContent()).toBe('21C');
	await expect.poll(() => page.locator('[data-low]').textContent()).toBe('9C');
	expect(await page.locator('[data-skeleton]').count()).toBe(0);
	expect(errors).toEqual([]);
	await page.close();
});

test('a list over a component’s own state re-renders inside an @try arm', async () => {
	const { page, errors } = await open('/tags');
	await page.click('[data-add-tag]');
	await page.click('[data-add-tag]');
	await expect
		.poll(() => page.locator('[data-tags] li').allTextContents())
		.toEqual(['tag-1', 'tag-2']);
	expect(errors).toEqual([]);
	await page.close();
});

test('a callback prop called from another file receives its argument', async () => {
	const { page, errors } = await open('/filter');
	await page.fill('[data-filter]', 'oak');
	await expect.poll(() => page.locator('[data-needle]').textContent()).toBe('needle:oak');
	expect(errors).toEqual([]);
	await page.close();
});

test('a child handler reads the page props it was given', async () => {
	const { page, errors } = await open('/echo?sort=asc');
	await page.click('[data-echo]');
	await expect.poll(() => page.locator('[data-heard]').textContent()).toBe('/echo?sort=asc');
	expect(errors).toEqual([]);
	await page.close();
});

test.each(['/form-served', '/form-streamed'])(
	'preventDefault stops a submit inside an @try arm (%s)',
	async (path) => {
		const { page, errors } = await open(path);
		await page.locator('[data-save]').waitFor();
		await page.click('[data-save]');
		await expect.poll(() => page.locator('[data-saved]').textContent()).toMatch(/^saved /);
		expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(path);
		expect(errors).toEqual([]);
		await page.close();
	},
);
