import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';

// Defects real app ports hit, pinned on a production build served by its own Nitro server in Chromium.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-defects-app-'));
	await cp(resolve(import.meta.dirname, '../fixtures/defects-app'), root, { recursive: true });
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
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await page.goto(`${server!.origin}${path}`);
	return { page, errors };
}

const text = (page: Page, selector: string) => page.locator(selector).textContent();

test('a handler that calls a callback prop runs the rest of its body', async () => {
	const { page, errors } = await open('/callback-body');
	await page.dispatchEvent('[data-body-trigger]', 'pointerdown', { button: 0 });
	await expect.poll(() => text(page, '[data-body-calls]')).toBe('1');
	await expect.poll(() => text(page, '[data-body-open]')).toBe('open');
	await expect.poll(() => text(page, '[data-body-after]')).toBe('1');
	expect(errors).toEqual([]);
	await page.close();
});

test('a component nested in a component used many times binds handlers to its own instance', async () => {
	const { page, errors } = await open('/rows-menu');
	await page.dispatchEvent('[data-trigger="-2"]', 'pointerdown', { button: 0 });
	await expect.poll(() => text(page, '[data-at]')).toBe('-2');
	await expect.poll(() => text(page, '[data-open]')).toBe('row');
	await expect.poll(() => text(page, '[data-presses="2"]')).toBe('1');
	await expect.poll(() => text(page, '[data-picked]')).toBe('1');
	await expect.poll(() => page.getAttribute('[data-trigger="-2"]', 'aria-expanded')).toBe('true');
	expect(await text(page, '[data-presses="1"]')).toBe('0');
	await page.dispatchEvent('[data-trigger="-3"]', 'pointerdown', { button: 0 });
	await expect.poll(() => text(page, '[data-at]')).toBe('-3');
	await expect.poll(() => text(page, '[data-presses="3"]')).toBe('1');
	await expect.poll(() => text(page, '[data-picked]')).toBe('2');
	expect(errors).toEqual([]);
	await page.close();
});

test('a spread-forwarding trigger nested in a component used many times opens its own row', async () => {
	const { page, errors } = await open('/users-table');
	await page.dispatchEvent('#menu-row-actions-1-trigger', 'pointerdown', { button: 0 });
	await expect.poll(() => text(page, '[data-at]')).toBe('-1');
	await expect.poll(() => text(page, '[data-open]')).toBe('row-actions');
	await expect
		.poll(() => page.getAttribute('#menu-row-actions-1-trigger', 'aria-expanded'))
		.toBe('true');
	expect(await page.getAttribute('#menu-row-actions-0-trigger', 'aria-expanded')).toBe('false');
	await page.dispatchEvent('#menu-row-actions-2-trigger', 'pointerdown', { button: 0 });
	await expect.poll(() => text(page, '[data-at]')).toBe('-2');
	await page.click('[data-select="-2"]');
	await expect.poll(() => text(page, '[data-select="-2"]')).toBe('on');
	expect(errors).toEqual([]);
	await page.close();
});

test('a pending async handler does not hold later clicks', async () => {
	const { page, errors } = await open('/async-handler');
	await page.click('[data-slow]');
	await expect.poll(() => text(page, '[data-slow-state]')).toBe('waiting');
	await page.click('[data-quick]');
	await page.click('[data-quick]');
	// The slow handler stays pending until the page says so, so only a held queue keeps this at 0.
	await expect.poll(() => text(page, '[data-quick-count]')).toBe('2');
	expect(await text(page, '[data-slow-state]')).toBe('waiting');
	await page.evaluate(() => (globalThis as { __finishSlow?: () => void }).__finishSlow?.());
	await expect.poll(() => text(page, '[data-slow-state]')).toBe('done');
	expect(errors).toEqual([]);
	await page.close();
});

test('@for over a computed list from a module function updates in the browser', async () => {
	const { page, errors } = await open('/computed-list');
	await expect.poll(() => page.locator('[data-plain] li').count()).toBe(3);
	await page.fill('[data-needle]', 'a');
	await expect
		.poll(() => page.locator('[data-plain] li').allTextContents())
		.toEqual(['Ada', 'Brian']);
	await expect
		.poll(() => page.locator('[data-components] li').allTextContents())
		.toEqual(['Ada', 'Brian']);
	await page.fill('[data-needle]', 'cl');
	await expect.poll(() => page.locator('[data-plain] li').allTextContents()).toEqual(['Cleo']);
	await expect
		.poll(() => page.locator('[data-components] li').allTextContents())
		.toEqual(['Cleo']);
	expect(errors).toEqual([]);
	await page.close();
});

test('a text hole beside an element keeps the element when it updates', async () => {
	const { page, errors } = await open('/text-beside');
	await page.click('[data-page]');
	await expect.poll(() => text(page, '[data-page]')).toMatch(/2\s*$/);
	expect(await text(page, '[data-page] .sr-only')).toBe('Go to page 2');
	await page.click('[data-page]');
	await expect.poll(() => text(page, '[data-page] .sr-only')).toBe('Go to page 3');
	expect((await text(page, '[data-page]'))?.trim()).toMatch(/^Go to page 3\s*3$/);
	expect(errors).toEqual([]);
	await page.close();
});

test('@for over a prop adds component rows, and row attributes follow their items', async () => {
	const { page, errors } = await open('/list-rows');
	await page.click('[data-add-title]');
	await expect
		.poll(() => page.locator('[data-prop-rows] li').allTextContents())
		.toEqual(['X', 'E1']);
	await page.click('[data-flip]');
	await expect
		.poll(() =>
			page
				.locator('[data-attr-rows] li')
				.evaluateAll((items) => items.map((item) => item.getAttribute('data-on'))),
		)
		.toEqual(['yes', 'yes']);
	await page.click('[data-reverse]');
	await expect
		.poll(() => page.locator('[data-attr-rows] li').allTextContents())
		.toEqual(['b', 'a']);
	expect(errors).toEqual([]);
	await page.close();
});

test('an @for loop variable named error builds and renders', async () => {
	const { page, errors } = await open('/error-loop');
	expect(await page.locator('[data-errors] li').allTextContents()).toEqual([
		'too short',
		'missing digit',
	]);
	await page.click('[data-clear]');
	await expect
		.poll(() => page.locator('[data-errors] li').allTextContents())
		.toEqual(['missing digit']);
	expect(errors).toEqual([]);
	await page.close();
});

test('a plain const string passed to a child that reads it in a handler', async () => {
	const { page, errors } = await open('/const-prop');
	await page.click('[data-say]');
	await expect.poll(() => text(page, '[data-said]')).toBe('hello');
	expect(errors).toEqual([]);
	await page.close();
});

test('an async value in its own element beside a state hole in @try survives a click', async () => {
	const { page, errors } = await open('/try-button');
	await page.locator('[data-try-button]').waitFor();
	expect(await text(page, '[data-try-button]')).toBe('Inbox 0');
	await page.click('[data-try-button]');
	await expect.poll(() => text(page, '[data-try-button]')).toBe('Inbox 1');
	expect(errors).toEqual([]);
	await page.close();
});

// A script outside Markless draws links into an element whose own click handler is Markless's
// and redraws them from a document listener, as a soft navigation does.
async function drawForeignLinks(page: Page) {
	await page.evaluate(() => {
		const list = document.querySelector<HTMLElement>('[data-favourites]')!;
		const draw = () => {
			list.innerHTML =
				'<p><a href="#article" data-fav><img alt="" width="20" height="20" data-fav-img></a></p>';
		};
		draw();
		document.addEventListener('click', (event) => {
			if (!(event.target as Element).closest?.('[data-fav]')) return;
			event.preventDefault();
			draw();
		});
	});
}

test('a click on a link a foreign script redraws reaches its container handler, cold and warm', async () => {
	const { page, errors } = await open('/foreign-links');
	await drawForeignLinks(page);
	await page.click('[data-fav-img]');
	await expect.poll(() => text(page, '[data-opened]')).toBe('1');
	await page.click('[data-fav-img]');
	await expect.poll(() => text(page, '[data-opened]')).toBe('2');
	await page.click('[data-like]');
	await expect.poll(() => text(page, '[data-like]')).toBe('1');
	expect(errors).toEqual([]);
	await page.close();
});

test('a computed that reads another computed follows both after resume', async () => {
	const { page, errors } = await open('/computed-chain');
	const items = () => page.locator('[data-window] li').allTextContents();
	expect(await items()).toEqual(['1', '2']);
	await page.click('[data-down]');
	await expect.poll(items).toEqual(['2', '3']);
	await page.click('[data-flip]');
	await expect.poll(items).toEqual(['2', '1']);
	expect(errors).toEqual([]);
	await page.close();
});

test('an async value and state joined in one run of text in @try both update, in place', async () => {
	const { page, errors } = await open('/async-join');
	await page.locator('[data-join]').waitFor();
	expect(await text(page, '[data-join]')).toBe('Inbox 0');
	const button = await page.locator('[data-join]').elementHandle();
	await page.click('[data-join]');
	await expect.poll(() => text(page, '[data-join]')).toBe('Inbox 1');
	await page.click('[data-join]');
	await expect.poll(() => text(page, '[data-join]')).toBe('Inbox 2');
	expect(await button!.evaluate((element) => element.isConnected)).toBe(true);
	expect(errors).toEqual([]);
	await page.close();
});

test('a streamed @try joining its async value with state updates text and attribute', async () => {
	const html = await (await fetch(`${server!.origin}/async-join-streamed`)).text();
	expect(html).toContain('data-join-loading');
	expect(html.indexOf('data-join-loading')).toBeLessThan(html.indexOf('data-join-title'));
	const { page, errors } = await open('/async-join-streamed');
	await page.locator('[data-join]').waitFor();
	expect(await text(page, '[data-join]')).toBe('0 in Inbox');
	expect(await page.getAttribute('[data-join-title]', 'title')).toBe('Inbox 0');
	await page.click('[data-join]');
	await expect.poll(() => text(page, '[data-join]')).toBe('1 in Inbox');
	await expect.poll(() => page.getAttribute('[data-join-title]', 'title')).toBe('Inbox 1');
	expect(errors).toEqual([]);
	await page.close();
});

test('a computed forwarded through a second component reaches the inner computed', async () => {
	const { page, errors } = await open('/prop-forwarded');
	await page.click('[data-next]');
	await expect.poll(() => text(page, '[data-direct] p')).toBe('got v1');
	await expect.poll(() => text(page, '[data-outer] p')).toBe('got v1');
	await page.click('[data-next]');
	await expect.poll(() => text(page, '[data-outer] p')).toBe('got v2');
	expect(errors).toEqual([]);
	await page.close();
});

test('a component handing its child a value under its own prop name keeps following its own prop', async () => {
	const { page, errors } = await open('/prop-name');
	await page.click('[data-toggle]');
	await expect.poll(() => text(page, '[data-dock]')).toBe('BOTTOM');
	await expect.poll(() => page.getAttribute('[data-details]', 'class')).toBe('row');
	await expect.poll(() => text(page, '[data-badge]')).toBe('badge BOTTOM');
	await expect.poll(() => page.getAttribute('[data-gauge]', 'title')).toBe('left:4');
	expect(errors).toEqual([]);
	await page.close();
});

test('nested @for rows in a component imported from a deeper folder fill both levels', async () => {
	const { page, errors } = await open('/nested-forwarded');
	await page.click('[data-fill]');
	await expect
		.poll(() =>
			page
				.locator('[data-field]')
				.evaluateAll((rows) => rows.map((row) => row.getAttribute('data-field'))),
		)
		.toEqual(['b', 'c']);
	await expect
		.poll(() => page.locator('[data-item]').allTextContents())
		.toEqual(['b1', 'b2', 'c1']);
	expect(errors).toEqual([]);
	await page.close();
});

test('a callback a row passes its child reads that row, served and added', async () => {
	const { page, errors } = await open('/row-callbacks');
	await page.click('[data-sort-text="Time"]');
	await expect.poll(() => text(page, '[data-sort]')).toBe('time');
	await page.click('[data-sort-cell="Channel"]');
	await expect.poll(() => text(page, '[data-sort]')).toBe('channel');
	await page.click('[data-pick-cell="beta"]');
	await expect.poll(() => text(page, '[data-picked]')).toBe('2');
	await page.click('[data-shared-cell="Time"]');
	await expect.poll(() => text(page, '[data-shared-sort]')).toBe('sorted by clicked');
	await page.click('[data-local-cell="gamma"]');
	await expect.poll(() => text(page, '[data-shared-picked]')).toBe('1');
	await page.click('[data-reverse]');
	await page.click('[data-sort-text="Serial"]');
	await expect.poll(() => text(page, '[data-sort]')).toBe('serial');
	await page.click('[data-add-col]');
	await page.click('[data-sort-text="Args"]');
	await expect.poll(() => text(page, '[data-sort]')).toBe('args');
	expect(errors).toEqual([]);
	await page.close();
});

test('a same-module child given a state prop writes it into page-scope shared state', async () => {
	const { page, errors } = await open('/child-writes');
	await page.click('[data-count-button]');
	await expect.poll(() => text(page, '[data-shared-picked]')).toBe('1');
	await page.click('[data-label-button]');
	await expect.poll(() => text(page, '[data-shared-sort]')).toBe('tagged');
	expect(errors).toEqual([]);
	await page.close();
});

test('a child rendered per row reads its row prop in a handler, served and added', async () => {
	const { page, errors } = await open('/row-props');
	await page.click('[data-header-text="time"]');
	await expect.poll(() => text(page, '[data-sort]')).toBe('time');
	await page.click('[data-shared-header="channel"]');
	await expect.poll(() => text(page, '[data-shared-sort]')).toBe('sorted by channel');
	await page.click('[data-cell="b"]');
	await expect.poll(() => text(page, '[data-picked]')).toBe('2');
	await page.click('[data-bound-header="serial"]');
	await expect.poll(() => text(page, '[data-sort]')).toBe('bound serial');
	await page.click('[data-local-cell="c"]');
	await expect.poll(() => text(page, '[data-shared-picked]')).toBe('3');
	await page.click('[data-add-item]');
	await page.click('[data-cell="d"]');
	await expect.poll(() => text(page, '[data-picked]')).toBe('4');
	await page.click('[data-local-cell="d"]');
	await expect.poll(() => text(page, '[data-shared-picked]')).toBe('4');
	expect(errors).toEqual([]);
	await page.close();
});

test('a keyed list after another list in the same parent follows its collection', async () => {
	const { page, errors } = await open('/sibling-lists');
	await page.click('[data-fill]');
	const rows = (selector: string) =>
		page.locator(selector).evaluateAll((items) => items.map((item) => item.textContent));
	await expect.poll(() => rows('[data-local-row]')).toEqual(['robj', 'sval']);
	await expect.poll(() => rows('[data-inline-row]')).toEqual(['robj', 'sval']);
	await expect.poll(() => rows('[data-tag]')).toEqual(['r', 's']);
	await expect.poll(() => rows('[data-imported-row]')).toEqual(['robj', 'sval']);
	expect(errors).toEqual([]);
	await page.close();
});

test('an @if arm holding imported components with constant props flips between them', async () => {
	const { page, errors } = await open('/theme-icon');
	const icon = (name: string) => page.getAttribute('[data-theme] svg', name);
	expect(await icon('data-icon')).toBe('sun');
	await page.click('[data-theme]');
	await expect.poll(() => icon('data-icon')).toBe('moon');
	expect(await icon('width')).toBe('15');
	await page.click('[data-theme]');
	await expect.poll(() => icon('data-icon')).toBe('sun');
	expect(await icon('height')).toBe('13');
	expect(errors).toEqual([]);
	await page.close();
});
