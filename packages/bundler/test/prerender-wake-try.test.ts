import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { type Page } from '@playwright/test';
import { resolve } from 'pathe';
import { afterAll, expect, test } from 'vitest';
import { launchBrowser } from '../../../scripts/test-utils/browser.ts';

// @try on a page woken from prerender records: a nested @try and a @try in each keyed row.
const exec = promisify(execFile);
const fixture = resolve(import.meta.dirname, '../fixtures/vite-prerender-multi-child');
const buildScript = resolve(import.meta.dirname, 'helpers/build-packing-fixture.ts');
const outRoots: string[] = [];
afterAll(() => Promise.all(outRoots.map((path) => rm(path, { force: true, recursive: true }))));

async function withWokenPage(page: string, run: (tab: Page) => Promise<void>): Promise<void> {
	const dist = resolve(fixture, 'node_modules/.markless-wake-try', page.replace(/\W/g, '-'));
	outRoots.push(dist);
	await exec(process.execPath, [buildScript, 'vite-prerender-multi-child', dist, '0'], {
		cwd: fixture,
		env: { ...process.env, MARKLESS_FIXTURE_PAGE: page, MARKLESS_PRERENDER_WAKE: '1' },
	});
	const server = createServer(async (request, response) => {
		const path = new URL(request.url ?? '/', 'http://fixture.local').pathname;
		try {
			const body = await readFile(resolve(dist, `.${path === '/' ? '/index.html' : path}`));
			response.setHeader(
				'Content-Type',
				path.endsWith('.js') ? 'text/javascript' : 'text/html;charset=utf-8',
			);
			response.end(body);
		} catch {
			response.statusCode = 404;
			response.end();
		}
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const { port } = server.address() as AddressInfo;
	const browser = await launchBrowser();
	try {
		const tab = await browser.newPage();
		const errors: string[] = [];
		tab.on('pageerror', (error) => errors.push(error.message));
		tab.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		await tab.goto(`http://127.0.0.1:${port}/`);
		await tab.waitForLoadState('networkidle');
		await run(tab);
		expect(errors).toEqual([]);
	} finally {
		await browser.close();
		await new Promise<void>((done) => server.close(() => done()));
	}
}

const texts = (tab: Page, selector: string) => tab.locator(selector).allTextContents();

test('wake-try/NestedTry.tsrx: a @try inside a @try that settles in the browser runs its own value', async () => {
	await withWokenPage('wake-try/NestedTry.tsrx', async (tab) => {
		await expect.poll(() => texts(tab, '[data-outer]')).toEqual(['outer0 ready']);
		await expect.poll(() => texts(tab, '[data-inner]')).toEqual(['inner0 ready']);
		for (const round of [1, 2]) {
			await tab.locator('[data-again]').click();
			await expect.poll(() => texts(tab, '[data-outer]')).toEqual([`outer${round} ready`]);
			await expect.poll(() => texts(tab, '[data-inner]')).toEqual([`inner${round} ready`]);
		}
	});
}, 120_000);

test('wake-try/NestedTryOwnValue.tsrx: an inner @try and its outer @try each refresh on their own value', async () => {
	await withWokenPage('wake-try/NestedTryOwnValue.tsrx', async (tab) => {
		const shown = async () => [
			...(await texts(tab, '[data-aisle]')),
			...(await texts(tab, '[data-crate]')),
		];
		await expect.poll(shown).toEqual(['aisle1 ready', 'crate1 ready']);
		await tab.locator('[data-bin]').click();
		await expect.poll(shown).toEqual(['aisle1 ready', 'crate2 ready']);
		await tab.locator('[data-shelf]').click();
		await expect.poll(shown).toEqual(['aisle2 ready', 'crate2 ready']);
		await tab.locator('[data-bin]').click();
		await expect.poll(shown).toEqual(['aisle2 ready', 'crate3 ready']);
	});
}, 120_000);

test('wake-try/RowTry.tsrx: each keyed row over a state list settles its own @try and follows writes', async () => {
	await withWokenPage('wake-try/RowTry.tsrx', async (tab) => {
		await expect.poll(() => texts(tab, '[data-count]')).toEqual(['Pen: 3', 'Ink: 5']);
		await tab.locator('[data-again]').click();
		await expect.poll(() => texts(tab, '[data-count]')).toEqual(['Pen: 4', 'Ink: 6']);
		await tab.locator('[data-rename]').click();
		await expect.poll(() => texts(tab, '[data-count]')).toEqual(['Pen: 4', 'Nib: 6']);
	});
}, 120_000);

test('wake-try/RowTryNames.tsrx: rows keyed by their own value settle their @try and keep it when reordered', async () => {
	await withWokenPage('wake-try/RowTryNames.tsrx', async (tab) => {
		await expect
			.poll(() => texts(tab, '[data-status]'))
			.toEqual(['north t0 ready', 'south t0 ready']);
		await tab.locator('[data-tick]').click();
		await expect
			.poll(() => texts(tab, '[data-status]'))
			.toEqual(['north t1 ready', 'south t1 ready']);
		await tab.locator('[data-flip]').click();
		await expect
			.poll(() => texts(tab, '[data-status]'))
			.toEqual(['south t1 ready', 'north t1 ready']);
		await tab.locator('[data-tick]').click();
		await expect
			.poll(() => texts(tab, '[data-status]'))
			.toEqual(['south t2 ready', 'north t2 ready']);
	});
}, 120_000);

test.fails('wake-try/RowTryAdd.tsrx (waits on #776 and #784 landing together): a row added with its own @try shows its value, again after it is removed, and follows writes', async () => {
	await withWokenPage('wake-try/RowTryAdd.tsrx', async (tab) => {
		await expect.poll(() => texts(tab, '[data-count]')).toEqual(['Pen: 3']);
		await tab.locator('[data-add]').click();
		await expect.poll(() => texts(tab, '[data-count]')).toEqual(['Pen: 3', 'Ink: 5']);
		await tab.locator('[data-drop]').click();
		await expect.poll(() => texts(tab, '[data-count]')).toEqual(['Pen: 3']);
		await tab.locator('[data-add]').click();
		await expect.poll(() => texts(tab, '[data-count]')).toEqual(['Pen: 3', 'Ink: 5']);
		await tab.locator('[data-rename]').click();
		await expect.poll(() => texts(tab, '[data-count]')).toEqual(['Pen: 3', 'Nib: 5']);
		await tab.locator('[data-again]').click();
		await expect.poll(() => texts(tab, '[data-count]')).toEqual(['Pen: 4', 'Nib: 6']);
	});
}, 120_000);
