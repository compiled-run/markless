import { cp, mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
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

// A refresh marks busy a binding that reads the async value through a sync computed, in an island as on a page.
for (const path of ['/page-busy', '/busy'])
	test(`a refreshing @try marks its binding busy: ${path}`, async () => {
		const page = await browser!.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(`${server!.origin}${path}`);
		const total = () =>
			page.evaluate(() => {
				const shown = document.querySelector('.total');
				return `${shown?.textContent} ${shown?.getAttribute('aria-busy') ?? '-'}`;
			});
		await expect.poll(total).toBe('1 -');
		await page.click('[data-more]');
		await expect.poll(total).toBe('1 true');
		await expect.poll(total).toBe('2 -');
		expect(errors).toEqual([]);
		await page.close();
	}, 60_000);

test("two islands of one component: a refresh marks only its own island's binding busy", async () => {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`${server!.origin}/busy-two`);
	const totals = () =>
		page.evaluate(() =>
			[...document.querySelectorAll('.total')]
				.map((shown) => `${shown.textContent} ${shown.getAttribute('aria-busy') ?? '-'}`)
				.join('|'),
		);
	await expect.poll(totals).toBe('1 -|1 -');
	await page.locator('[data-more]').nth(1).click();
	await expect.poll(totals).toBe('1 -|1 true');
	await expect.poll(totals).toBe('1 -|2 -');
	expect(errors).toEqual([]);
	await page.close();
}, 60_000);

const shownText = (page: Page, selector: string) =>
	page.evaluate((s) => [...document.querySelectorAll(s)].map((node) => node.textContent?.trim()).join('|'), selector);

// Spec 01 "Conditional identity": state an MDX island's arm declares starts over when the arm opens again.
test('MDX islands: state declared in an @if starts over when it reopens', async () => {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`${server!.origin}/arm-state`);
	const presses = page.locator('.presses').nth(1);
	await presses.locator('[data-open]').click();
	await expect.poll(() => shownText(page, '[data-press]')).toBe('0');
	await presses.locator('[data-press]').click();
	await presses.locator('[data-press]').click();
	await expect.poll(() => shownText(page, '[data-press]')).toBe('2');
	await presses.locator('[data-open]').click();
	await expect.poll(() => shownText(page, '[data-press]')).toBe('');
	await presses.locator('[data-open]').click();
	await expect.poll(() => shownText(page, '[data-press]')).toBe('0');
	expect(errors).toEqual([]);
	await page.close();
}, 60_000);

// An @if and a @switch inside an island's open @if keep updating, and each arm's state starts over.
for (const path of ['/nested', '/nested-host'])
test(`MDX islands: branches nested in an open @if update while it stays open: ${path}`, async () => {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => void (message.type() === 'error' && errors.push(message.text())));
	await page.goto(`${server!.origin}${path}`);
	const shown = (...selectors: string[]) => Promise.all(selectors.map((selector) => shownText(page, selector)));
	await page.click('[data-outer]');
	await expect.poll(() => shown('[data-a]', '[data-off]', '[data-move]')).toEqual(['0', 'off', 'pick']);
	await page.click('[data-a]');
	await page.click('[data-inner]');
	await page.click('[data-ember]');
	await expect.poll(() => shown('[data-a]', '[data-b]', '[data-move]')).toEqual(['1', '0', 'ember']);
	await page.click('[data-b]');
	await expect.poll(() => shown('[data-b]')).toEqual(['1']);
	await page.click('[data-inner]');
	await page.click('[data-inner]');
	await expect.poll(() => shown('[data-a]', '[data-b]')).toEqual(['1', '0']);
	await page.click('[data-outer]');
	await page.click('[data-outer]');
	await expect.poll(() => shown('[data-a]', '[data-b]', '[data-move]')).toEqual(['0', '0', 'ember']);
	expect(errors).toEqual([]);
	await page.close();
}, 60_000);
