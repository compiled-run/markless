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
import {
	PROTOCOL_KEEP_ATTRIBUTE,
	PROTOCOL_KEEP_INSTANCE_ATTRIBUTE,
} from '../../../serializer/src/protocol-keep.ts';

// /guide and /reference render one side navigation with its own state and a `path` prop; /about renders a different one.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-kept-state-app-'));
	await cp(resolve(import.meta.dirname, '../fixtures/kept-state-app'), root, { recursive: true });
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
	const page = await browser!.newPage({ viewport: { width: 1000, height: 700 } });
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await page.goto(`${server!.origin}${path}`);
	await page.waitForLoadState('networkidle');
	return { page, errors };
}

const shows = (page: Page, title: string) =>
	page.waitForFunction(
		(text) => document.querySelector('[data-title]')?.textContent === text,
		title,
	);

const sideNav = (page: Page) =>
	page.evaluate(() => {
		const aside = document.querySelector('[data-side-nav]')!;
		return {
			same: aside === (globalThis as { __aside?: Element }).__aside,
			shown: aside.querySelector('[data-shown]')!.textContent,
			count: aside.querySelector('[data-count]')!.textContent,
			here: aside.querySelector('[data-here]')!.textContent,
			marked: aside.getAttribute('data-marked'),
		};
	});

const remember = (page: Page) =>
	page.evaluate(() => {
		(globalThis as { __aside?: Element }).__aside = document.querySelector('[data-side-nav]')!;
	});

async function toggle(page: Page, count: string): Promise<void> {
	await page.click('[data-toggle]');
	await page.waitForFunction(
		(expected) => document.querySelector('[data-count]')?.textContent === expected,
		count,
	);
}

const fetchText = async (path: string) => (await fetch(`${server!.origin}${path}`)).text();
const openingTag = (html: string, marker: string) =>
	new RegExp(`<[^>]*${marker}[^>]*>`).exec(html)?.[0] ?? '';
const attribute = (tag: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];

test('the server marks a part with state that two pages render alike as kept, with its instance', async () => {
	const guide = openingTag(await fetchText('/guide'), 'data-side-nav');
	const reference = openingTag(await fetchText('/reference'), 'data-side-nav');
	const about = openingTag(await fetchText('/about'), 'data-side-nav');
	expect(attribute(guide, PROTOCOL_KEEP_ATTRIBUTE)).toBeTruthy();
	expect(attribute(guide, PROTOCOL_KEEP_ATTRIBUTE)).toBe(
		attribute(reference, PROTOCOL_KEEP_ATTRIBUTE),
	);
	expect(attribute(guide, PROTOCOL_KEEP_INSTANCE_ATTRIBUTE)).toBeTruthy();
	expect(attribute(about, PROTOCOL_KEEP_ATTRIBUTE)).not.toBe(
		attribute(guide, PROTOCOL_KEEP_ATTRIBUTE),
	);
});

test('a kept part keeps its state and its nodes across an in-place navigation', async () => {
	const { page, errors } = await open('/guide');
	await toggle(page, '1');
	await remember(page);
	await page.click('[data-nav="reference"]');
	await shows(page, 'Reference page');
	expect(await sideNav(page)).toMatchObject({ same: true, shown: 'open', count: '1' });
	expect(errors).toEqual([]);
	await page.close();
});

test('a kept part keeps focus on its own control across the navigation', async () => {
	const { page, errors } = await open('/guide');
	await toggle(page, '1');
	await page.evaluate(() => {
		document.querySelector<HTMLButtonElement>('[data-toggle]')!.focus();
		document.querySelector<HTMLAnchorElement>('[data-nav="reference"]')!.click();
	});
	await shows(page, 'Reference page');
	expect(
		await page.evaluate(
			() => document.activeElement === document.querySelector('[data-toggle]'),
		),
	).toBe(true);
	expect(errors).toEqual([]);
	await page.close();
});

test('the handlers of a kept part still work after the navigation', async () => {
	const { page, errors } = await open('/guide');
	await toggle(page, '1');
	await page.click('[data-nav="reference"]');
	await shows(page, 'Reference page');
	await toggle(page, '2');
	expect(await sideNav(page)).toMatchObject({ shown: 'closed', count: '2' });
	await toggle(page, '3');
	expect(await sideNav(page)).toMatchObject({ shown: 'open', count: '3' });
	expect(errors).toEqual([]);
	await page.close();
});

test('a kept part that was never used still works after the navigation', async () => {
	const { page, errors } = await open('/guide');
	await page.click('[data-nav="reference"]');
	await shows(page, 'Reference page');
	expect(await sideNav(page)).toMatchObject({
		shown: 'closed',
		count: '0',
		here: 'Reference',
		marked: 'reference',
	});
	await toggle(page, '1');
	expect(await sideNav(page)).toMatchObject({ shown: 'open', marked: 'open reference' });
	expect(errors).toEqual([]);
	await page.close();
});

test('a prop the next page changes updates what reads it, and the state stays as the reader left it', async () => {
	const { page, errors } = await open('/guide');
	await toggle(page, '1');
	expect(await sideNav(page)).toMatchObject({ here: 'Guide', marked: 'open guide' });
	await page.click('[data-nav="reference"]');
	await shows(page, 'Reference page');
	expect(await sideNav(page)).toMatchObject({
		shown: 'open',
		count: '1',
		here: 'Reference',
		marked: 'open reference',
	});
	await toggle(page, '2');
	expect(await sideNav(page)).toMatchObject({ here: 'Reference', marked: 'reference' });
	expect(errors).toEqual([]);
	await page.close();
});

test('state the part set from a prop the two pages pass differently takes the next page value, and the rest stays', async () => {
	const { page, errors } = await open('/guide');
	await toggle(page, '1');
	expect(await page.textContent('[data-pin]')).toBe('loose');
	await page.click('[data-nav="reference"]');
	await shows(page, 'Reference page');
	expect(await page.textContent('[data-pin]')).toBe('pinned');
	expect(await sideNav(page)).toMatchObject({ shown: 'open', count: '1' });
	expect(errors).toEqual([]);
	await page.close();
});

test('Back and Forward keep the part and its state', async () => {
	const { page, errors } = await open('/guide');
	await toggle(page, '1');
	await remember(page);
	await page.click('[data-nav="reference"]');
	await shows(page, 'Reference page');
	await toggle(page, '2');
	await page.goBack();
	await shows(page, 'Guide page');
	expect(await sideNav(page)).toEqual({
		same: true,
		shown: 'closed',
		count: '2',
		here: 'Guide',
		marked: 'guide',
	});
	await page.goForward();
	await shows(page, 'Reference page');
	expect(await sideNav(page)).toEqual({
		same: true,
		shown: 'closed',
		count: '2',
		here: 'Reference',
		marked: 'reference',
	});
	await toggle(page, '3');
	expect(errors).toEqual([]);
	await page.close();
});

test('a full reload starts the part fresh', async () => {
	const { page, errors } = await open('/guide');
	await toggle(page, '1');
	await page.click('[data-nav="reference"]');
	await shows(page, 'Reference page');
	await page.reload();
	await page.waitForLoadState('networkidle');
	expect(await sideNav(page)).toMatchObject({ shown: 'closed', count: '0', here: 'Reference' });
	await toggle(page, '1');
	expect(errors).toEqual([]);
	await page.close();
});

test('a part the next page renders differently is replaced and starts fresh', async () => {
	const { page, errors } = await open('/guide');
	await toggle(page, '1');
	await page.click('[data-nav="about"]');
	await shows(page, 'About page');
	expect(await sideNav(page)).toMatchObject({ shown: 'closed', count: '0', here: 'About' });
	expect(await page.locator('[data-side-nav] .side-nav-extra').count()).toBe(1);
	await toggle(page, '1');
	expect(await sideNav(page)).toMatchObject({ shown: 'open' });
	expect(errors).toEqual([]);
	await page.close();
});

test('a kept part after content of a different length keeps its count', async () => {
	const { page, errors } = await open('/guide');
	const press = async (text: string) => {
		await page.click('[data-press]');
		await page.waitForFunction(
			(expected) => document.querySelector('[data-press]')?.textContent === expected,
			text,
		);
	};
	await press('pressed 1');
	await press('pressed 2');
	await page.click('[data-nav="reference"]');
	await shows(page, 'Reference page');
	expect(await page.textContent('[data-press]')).toBe('pressed 2');
	await press('pressed 3');
	expect(errors).toEqual([]);
	await page.close();
});
