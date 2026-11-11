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

// A page's async value with no state behind it, re-asked after Back/Forward, updates its @try arm in place.

vi.setConfig({ testTimeout: 30_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-idle-wake-refresh-app-'));
	await cp(resolve(import.meta.dirname, '../fixtures/idle-wake-refresh-app'), root, { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await symlink(resolve(packagesRoot, 'router/node_modules/nitro'), join(root, 'node_modules/nitro'), 'dir');
	const builder = await createBuilder({ root, configFile: false, logLevel: 'silent', plugins: [markless(), router()] });
	await builder.buildApp();
	server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	browser = await launchBrowser(chromium);
}, 240_000);

afterAll(async () => {
	await browser?.close();
	await server?.close();
	if (root) await rm(root, { recursive: true, force: true });
});

type Container = { __mReask?: true | (() => void); __asyncResumeRuntimeStarted?: unknown };

async function hold(page: Page) {
	await page.evaluate(() => {
		const note = document.querySelector<HTMLInputElement>('[data-note]')!;
		const list = document.querySelector<HTMLElement>('[data-list]')!;
		note.value = 'typed';
		note.focus();
		note.setSelectionRange(2, 3);
		list.scrollTop = 200;
		(window as unknown as { __held: unknown }).__held = { section: document.querySelector('[data-shelf]'), note, list };
	});
}

const kept = (page: Page) =>
	page.evaluate(() => {
		const held = (window as unknown as { __held: Record<string, Element> }).__held;
		const note = document.querySelector<HTMLInputElement>('[data-note]');
		return {
			section: document.querySelector('[data-shelf]') === held.section,
			list: document.querySelector('[data-list]') === held.list,
			note: note === held.note,
			focus: document.activeElement === held.note,
			value: note?.value,
			caret: [note?.selectionStart, note?.selectionEnd],
			scroll: document.querySelector('[data-list]')?.scrollTop,
		};
	});

const inPlace = { section: true, list: true, note: true, focus: true, value: 'typed', caret: [2, 3], scroll: 200 };

// Calls the wired re-ask, or marks the container shown again before its runtime wakes, as the router does on Back/Forward.
async function reask(page: Page) {
	await page.evaluate(() => {
		const container = document.querySelector('[data-async-container]') as unknown as Container;
		if (typeof container.__mReask === 'function') return container.__mReask();
		container.__mReask = true;
		dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
	});
	await page.waitForFunction(() => typeof (document.querySelector('[data-async-container]') as unknown as Container).__mReask === 'function');
	await page.waitForTimeout(200);
}

test('a re-ask through the idle wake, and the next one, keep the @try arm, focus, caret, typed value and scroll', async () => {
	const page = await browser!.newPage({ viewport: { width: 800, height: 600 } });
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	await page.goto(server!.origin + '/');
	await page.waitForSelector('[data-list] li');
	expect(await page.evaluate(() => !!(document.querySelector('[data-async-container]') as unknown as Container).__asyncResumeRuntimeStarted)).toBe(false);
	await hold(page);
	await reask(page);
	expect(await kept(page)).toEqual(inPlace);
	await reask(page);
	expect(await kept(page)).toEqual(inPlace);
	expect(errors).toEqual([]);
	await page.close();
});

test('the same page reached by a fragment navigation keeps its @try block across a re-ask', async () => {
	const page = await browser!.newPage({ viewport: { width: 800, height: 600 } });
	const errors: string[] = [];
	const documents: string[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	page.on('request', (request) => {
		if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents.push(new URL(request.url()).pathname);
	});
	await page.goto(server!.origin + '/start');
	await page.click('[data-to-shelf]');
	await page.waitForSelector('[data-page="shelf"] [data-list] li');
	expect(documents).toEqual(['/start']);
	await hold(page);
	await reask(page);
	expect(await kept(page)).toEqual(inPlace);
	await reask(page);
	expect(await kept(page)).toEqual(inPlace);
	expect(errors).toEqual([]);
	await page.close();
});
