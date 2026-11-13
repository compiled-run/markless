import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';
import { buildFixture } from '../support/fixture-build.ts';

// An async value in a component the page imports, on a production build served by its own Nitro server.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-async-child-app-'));
	await cp(resolve(import.meta.dirname, '../fixtures/async-child-app'), root, {
		recursive: true,
	});
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await buildFixture({
		root,
	});
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

async function served(path: string, expected: ReadonlyArray<string>) {
	const html = await (await fetch(`${server!.origin}${path}`)).text();
	expect(expected.filter((text) => !html.includes(`>${text}<`))).toEqual([]);
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`${server!.origin}${path}`);
	await expect.poll(() => page.locator('main').innerText()).toBe(expected.join('\n'));
	await page.waitForLoadState('networkidle');
	// lib/slow.ts counts every run of the recipe in the browser.
	expect(await page.evaluate(() => (window as { browserRuns?: number }).browserRuns ?? 0)).toBe(
		0,
	);
	expect(errors).toEqual([]);
	await page.close();
}

test('an async value in a component the page imports streams from the server', async () => {
	await served('/async-in-child', ['item 1']);
});

test('each instance of an async component, at any depth, streams its own value', async () => {
	await served('/async-in-children', ['head', 'item 1', 'item 2', 'item 3']);
});

test('a child with no props and a @try without @catch streams its value', async () => {
	await served('/child-async-not-streamed', ['loaded child']);
});

const browserRuns = (page: Page) => page.evaluate(() => (window as { browserRuns?: number }).browserRuns ?? 0);

// What the child shows after "Again": its new value, or the @catch text when the browser run failed.
async function afterAgain(page: Page, before: string) {
	await page.locator('#again').click();
	await expect
		.poll(async () => ((await page.locator('#detail-failed').count()) ? 'failed' : await page.locator('#detail').textContent()), {
			timeout: 5_000,
		})
		.not.toBe(before);
	return (await page.locator('#detail-failed').textContent()) ?? (await page.locator('#detail').textContent());
}

// A component placed in a layout's children reads the page's `params` and `url` like one placed directly.
for (const placement of ['framed', 'direct']) {
	test(`a ${placement} child's value from params and url streams from the server, and the browser does not load it again`, async () => {
		const page = await browser!.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(`${server!.origin}/${placement}/abc`);
		await expect.poll(() => page.locator('#detail').textContent(), { timeout: 5_000 }).toBe(`got abc at /${placement}/abc #1`);
		await page.waitForLoadState('networkidle');
		expect(await browserRuns(page)).toBe(0);
		expect(await page.locator('#detail-failed').count()).toBe(0);
		expect(errors).toEqual([]);
		await page.close();
	});

	test(`a ${placement} child rendered by client navigation reads params and url`, async () => {
		const page = await browser!.newPage();
		await page.goto(`${server!.origin}/links`);
		await page.locator(`#to-${placement}`).click();
		await expect.poll(() => page.locator('#detail').textContent(), { timeout: 5_000 }).toBe(`got xyz at /${placement}/xyz #1`);
		await page.close();
	});

	// Pinned: a child's async value re-run in the browser reads `url` from the child's own prop cell, which the server seeded without it; un-pin when it lands.
	test.fails(`a ${placement} child's value re-run in the browser reads the page's url`, async () => {
		const page = await browser!.newPage();
		await page.goto(`${server!.origin}/${placement}/abc`);
		await expect.poll(() => page.locator('#detail').textContent(), { timeout: 5_000 }).toBe(`got abc at /${placement}/abc #1`);
		const shown = await afterAgain(page, `got abc at /${placement}/abc #1`);
		await page.close();
		expect(shown).toBe(`got abc at /${placement}/abc #2`);
	});
}
