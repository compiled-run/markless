import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { chromium, type Page } from '@playwright/test';
import { resolve } from 'pathe';
import { afterAll, expect, test } from 'vitest';

// Content an @if mounts after a prerendered page resumed: a component with state
// of its own, and computed text the page never rendered because the arm was
// closed. Each has to mount and keep updating the way it does on an SSR page.

const exec = promisify(execFile);
const fixture = resolve(import.meta.dirname, '../fixtures/vite-prerender-multi-child');
const buildScript = resolve(import.meta.dirname, 'helpers/build-packing-fixture.ts');
const outRoots: string[] = [];
afterAll(() => Promise.all(outRoots.map((path) => rm(path, { force: true, recursive: true }))));

async function withBuiltPage(
	page: string,
	env: Record<string, string>,
	run: (tab: Page) => Promise<void>,
): Promise<void> {
	const dist = resolve(fixture, 'node_modules/.markless-arm-children', page.replace(/\W/g, '-'));
	outRoots.push(dist);
	await exec(process.execPath, [buildScript, 'vite-prerender-multi-child', dist, '0'], {
		cwd: fixture,
		env: { ...process.env, ...env, MARKLESS_FIXTURE_PAGE: page },
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
	const browser = await chromium.launch();
	try {
		const tab = await browser.newPage();
		const errors: string[] = [];
		tab.on('pageerror', (error) => errors.push(error.message));
		await tab.goto(`http://127.0.0.1:${port}/`);
		await tab.waitForLoadState('networkidle');
		await run(tab);
		expect(errors).toEqual([]);
	} finally {
		await browser.close();
		await new Promise<void>((done) => server.close(() => done()));
	}
}

async function mountTapRemount(tab: Page): Promise<void> {
	const chip = tab.locator('[data-chip]');
	const open = tab.locator('[data-open]');
	await open.click();
	await expect.poll(() => chip.textContent()).toBe('chip 0');
	await chip.click();
	await expect.poll(() => chip.textContent()).toBe('chip 1');
	await chip.click();
	await expect.poll(() => chip.textContent()).toBe('chip 2');
	await open.click();
	await expect.poll(() => chip.count()).toBe(0);
	await open.click();
	await expect.poll(() => chip.textContent()).toBe('chip 0');
	await chip.click();
	await expect.poll(() => chip.textContent()).toBe('chip 1');
}

const statefulChildPages = [
	{ page: 'arm-children/SameModuleChild.tsrx', env: {} },
	{ page: 'arm-children/SettledSameModuleChild.tsrx', env: {} },
	{ page: 'arm-children/SettleTwoPlainChild.tsrx', env: { MARKLESS_PRERENDER_WAKE: '1' } },
] as const;

for (const { page, env } of statefulChildPages) {
	test(`${page}: a same-module component with its own state mounts and updates after resume`, async () => {
		await withBuiltPage(page, env, mountTapRemount);
	}, 120_000);
}

for (const page of ['arm-children/TemplateHole.tsrx', 'arm-children/NamedComputed.tsrx']) {
	test(`${page}: computed text in an arm closed at render shows its value on first open`, async () => {
		await withBuiltPage(page, {}, async (tab) => {
			const chip = tab.locator('[data-chip]');
			await tab.locator('[data-open]').click();
			await expect.poll(() => chip.textContent()).toBe('chip 0');
			await tab.locator('[data-tap]').click();
			await expect.poll(() => chip.textContent()).toBe('chip 1');
		});
	}, 120_000);
}

const armTextPages = [
	{ page: 'arm-children/TwoHoleText.tsrx', text: (taps: number) => `chip ${taps}/${taps * 2}` },
	{ page: 'arm-children/TextBesideComponent.tsrx', text: (taps: number) => `chip ${taps}` },
] as const;

for (const { page, text } of armTextPages) {
	test(`${page}: page text inside an arm opened after resume keeps updating`, async () => {
		await withBuiltPage(page, {}, async (tab) => {
			const logged: string[] = [];
			tab.on('console', (message) => {
				if (message.type() === 'error' || message.type() === 'warning') logged.push(message.text());
			});
			const chip = tab.locator('[data-chip]');
			await tab.locator('[data-open]').click();
			await expect.poll(() => chip.textContent()).toBe(text(0));
			await tab.locator('[data-tap]').click();
			await expect.poll(() => chip.textContent()).toBe(text(1));
			await tab.locator('[data-tap]').click();
			await expect.poll(() => chip.textContent()).toBe(text(2));
			expect(logged).toEqual([]);
		});
	}, 120_000);
}

test('arm-children/ArmTextWithChild.tsrx: page text and component text in one arm both update', async () => {
	await withBuiltPage('arm-children/ArmTextWithChild.tsrx', {}, async (tab) => {
		const logged: string[] = [];
		tab.on('console', (message) => {
			if (message.type() === 'error' || message.type() === 'warning') logged.push(message.text());
		});
		const chip = tab.locator('[data-chip]');
		const own = tab.locator('[data-own]');
		await tab.locator('[data-open]').click();
		await expect.poll(() => chip.textContent()).toBe('chip 0/0');
		await expect.poll(() => own.textContent()).toBe('chip 0/0');
		await tab.locator('[data-tap]').click();
		await expect.poll(() => chip.textContent()).toBe('chip 1/2');
		await own.click();
		await expect.poll(() => own.textContent()).toBe('chip 1/2');
		await own.click();
		await expect.poll(() => own.textContent()).toBe('chip 2/4');
		await tab.locator('[data-open]').click();
		await expect.poll(() => own.count()).toBe(0);
		await tab.locator('[data-open]').click();
		await expect.poll(() => own.textContent()).toBe('chip 0/0');
		await tab.locator('[data-tap]').click();
		await expect.poll(() => chip.textContent()).toBe('chip 2/4');
		await own.click();
		await expect.poll(() => own.textContent()).toBe('chip 1/2');
		expect(logged).toEqual([]);
	});
}, 120_000);

test('arm-children/ChildTwoHoleText.tsrx: a component text with two holes updates after its arm opens', async () => {
	await withBuiltPage('arm-children/ChildTwoHoleText.tsrx', {}, async (tab) => {
		const logged: string[] = [];
		tab.on('console', (message) => {
			if (message.type() === 'error' || message.type() === 'warning') logged.push(message.text());
		});
		const own = tab.locator('[data-own]');
		await tab.locator('[data-open]').click();
		await expect.poll(() => own.textContent()).toBe('chip 0/0');
		await own.click();
		await expect.poll(() => own.textContent()).toBe('chip 1/2');
		await own.click();
		await expect.poll(() => own.textContent()).toBe('chip 2/4');
		expect(logged).toEqual([]);
	});
}, 120_000);
