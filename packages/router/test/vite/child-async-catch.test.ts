import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';
import { buildFixture } from '../support/fixture-build.ts';

// A child declared beside its parent, whose async value and attributes read a prop, fails a search
// and retries it, on a production build: loaded as a document and reached through a link.
// Under /handler, a save fails in a form's onSubmit or a button's onClick: the handler sits in the page, a child in the
// same file, a child in another file, or a grandchild; the @catch sits around the child, inside it, or nowhere.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-child-async-catch-app-'));
	await cp(resolve(import.meta.dirname, '../fixtures/child-async-catch-app'), root, {
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

const items = (page: Page) => page.locator('li').allInnerTexts();

async function searchFailsThenRetries(page: Page, errors: ReadonlyArray<string>) {
	await expect.poll(() => items(page)).toHaveLength(7);
	await page.waitForLoadState('networkidle');
	await page.locator('input').pressSequentially('ap', { delay: 100 });
	await expect.poll(() => items(page)).toEqual(['apple', 'apricot', 'grape']);
	await expect
		.poll(() => page.locator('li').evaluateAll((rows) => rows.map((row) => row.dataset.match)))
		.toEqual(['yes', 'yes', 'no']);
	await expect.poll(() => page.locator('ul').getAttribute('style')).toBe('opacity: 1');
	await page.locator('input').fill('');
	await expect.poll(() => items(page)).toHaveLength(7);
	await page.locator('input').pressSequentially('berry!', { delay: 100 });
	await expect.poll(() => page.locator('main p').allInnerTexts()).toEqual(['Search is down']);
	// A failed refresh keeps the last list and shows the @catch content after it.
	expect(await page.locator('ul ~ p').count()).toBe(1);
	await expect.poll(() => page.locator('[aria-busy="true"]').count()).toBe(0);
	await page.getByText('Try again').click();
	await expect.poll(() => items(page)).toEqual(['blueberry']);
	await expect.poll(() => page.locator('ul').getAttribute('style')).toBe('opacity: 1');
	await expect.poll(() => page.locator('[aria-busy="true"]').count()).toBe(0);
	expect(errors).toEqual([]);
}

async function open() {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	return { page, errors };
}

test('loaded as a document: a failed search shows @catch, and Try again recovers', async () => {
	const { page, errors } = await open();
	await page.goto(`${server!.origin}/search`);
	await searchFailsThenRetries(page, errors);
	await page.close();
});

test('reached through a link: a failed search shows @catch, and Try again recovers', async () => {
	const { page, errors } = await open();
	await page.goto(`${server!.origin}/`);
	await page.waitForLoadState('networkidle');
	await page.getByText('Search').click();
	await expect.poll(() => page.url()).toBe(`${server!.origin}/search`);
	await searchFailsThenRetries(page, errors);
	await page.close();
});

const placements = ['page', 'same', 'other', 'deep'];
// A @catch with a handler of its own (reset) loads the full runtime with the page; a plain one leaves it to the first click.
const caught = [
	...placements.flatMap((placement) => [`around-${placement}`, `around-static-${placement}`]),
	...placements
		.slice(1)
		.flatMap((placement) => [`inside-${placement}`, `inside-static-${placement}`]),
];
const uncaught = placements.map((placement) => `none-${placement}`);
const handlers = [
	['onSubmit', '[data-submit]'],
	['onClick', '[data-click]'],
] as const;
const failures = [
	['an HTTP 500', 'Saving failed (500)'],
	['a failed connection', 'Failed to fetch'],
] as const;
const arrivals = [
	['loaded as a document', failures],
	['reached through a link', failures.slice(0, 1)],
] as const;

async function openSaver(name: string, arrival: string, failure: string) {
	const { page, errors } = await open();
	await page.route('**/api/save', (route) =>
		failure === 'a failed connection'
			? route.abort('connectionfailed')
			: route.fulfill({ status: 500, body: 'nope' }),
	);
	const path = `/handler/${name}`;
	if (arrival === 'loaded as a document') await page.goto(`${server!.origin}${path}`);
	else {
		await page.goto(`${server!.origin}/handler`);
		await page.waitForLoadState('networkidle');
		await page.locator(`a[href="${path}"]`).click();
		await expect.poll(() => page.url()).toBe(`${server!.origin}${path}`);
	}
	await expect.poll(() => page.locator('.loads').textContent()).toMatch(/^loads \d+$/);
	await page.waitForLoadState('networkidle');
	// Every line the shared announcer says from now on.
	await page.evaluate(() => {
		const said: string[] = [];
		(window as { __said?: string[] }).__said = said;
		new MutationObserver(() => {
			const line = document.querySelector('[data-markless-announcer]')?.textContent ?? '';
			if (line && said.at(-1) !== line) said.push(line);
		}).observe(document.body, { childList: true, subtree: true, characterData: true });
	});
	const said = () => page.evaluate(() => (window as { __said?: string[] }).__said ?? []);
	return { page, errors, said };
}

for (const [arrival, failing] of arrivals)
	describe(`a failing save, ${arrival}`, () => {
		for (const name of caught)
			for (const [handler, selector] of handlers)
				for (const [failure, message] of failing)
					test(`${name}: ${handler} failing with ${failure} shows in the nearest @catch and announces the failure`, async () => {
						const { page, errors, said } = await openSaver(name, arrival, failure);
						await page.locator(selector).click();
						await expect
							.poll(() => page.locator('.caught').textContent())
							.toBe(`caught: ${message}`);
						await expect
							.poll(() => page.locator('.note').textContent())
							.toBe('sending');
						await expect.poll(() => page.locator('[aria-busy="true"]').count()).toBe(0);
						await expect
							.poll(() => page.locator('[aria-disabled="true"]').count())
							.toBe(0);
						// A slow save may say the busy line first; the closing line names the failure, and nothing says it was saved.
						await expect.poll(async () => (await said()).at(-1)).toBe('Update failed');
						expect(await said()).not.toContain('Updated');
						expect(await page.locator('.caught').textContent()).toBe(
							`caught: ${message}`,
						);
						if (!name.includes('static')) {
							const runs = () =>
								page.evaluate(
									() => (globalThis as { __thingRuns?: number }).__thingRuns ?? 0,
								);
							const shown = await page.locator('.loads').textContent();
							const ranBefore = await runs();
							await page.locator('[data-reset]').click();
							await expect.poll(() => page.locator('.caught').count()).toBe(0);
							expect(await page.locator('.note').textContent()).toBe('sending');
							// Pins main: reset after a handler failure loads nothing again here (async.mdx says so; catch-reset.ts re-runs the failed gate).
							await page.waitForLoadState('networkidle');
							expect([
								await runs(),
								await page.locator('.loads').textContent(),
							]).toEqual([ranBefore, shown]);
						}
						expect(errors).toEqual([]);
						await page.close();
					});
		for (const name of uncaught)
			for (const [handler, selector] of handlers)
				for (const [failure, message] of failing)
					test(`${name}: ${handler} failing with ${failure} and no @catch around it stays uncaught`, async () => {
						const { page, errors, said } = await openSaver(name, arrival, failure);
						await page.locator(selector).click();
						await expect.poll(() => errors).toEqual([message]);
						await expect
							.poll(() => page.locator('.note').textContent())
							.toBe('sending');
						await expect.poll(() => page.locator('[aria-busy="true"]').count()).toBe(0);
						await expect.poll(async () => (await said()).at(-1)).toBe('Update failed');
						expect(await said()).not.toContain('Updated');
						await page.close();
					});
	});

// A later export fed a state from the page, renamed before the save fails: its @catch reads the prop as it stands now.
describe('a failing save in a prop-fed later export', () => {
	for (const arrival of ['loaded as a document', 'reached through a link'])
		test(`${arrival}: the @catch shows the prop's current value`, async () => {
			const { page, errors } = await openSaver('inside-static-prop', arrival, 'an HTTP 500');
			await page.locator('[data-rename]').click();
			await expect.poll(() => page.locator('.label').textContent()).toBe('Invoice 8');
			await page.locator('[data-submit]').click();
			await expect
				.poll(() => page.locator('.caught').textContent())
				.toBe('caught: Saving failed (500) for Invoice 8');
			expect(errors).toEqual([]);
			await page.close();
		});
});
