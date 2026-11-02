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
	PROTOCOL_VARY_ATTRIBUTE,
} from '../../../serializer/src/protocol-keep.ts';

// Two pages render one site header whose only difference is which nav link is active.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-route-header-app-'));
	await cp(resolve(import.meta.dirname, '../fixtures/route-header-app'), root, {
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

const fetchText = async (path: string) => (await fetch(`${server!.origin}${path}`)).text();
const openingTag = (html: string, marker: string) =>
	new RegExp(`<[^>]*${marker}[^>]*>`).exec(html)?.[0] ?? '';
const keepHash = (tag: string) => new RegExp(`${PROTOCOL_KEEP_ATTRIBUTE}="([^"]+)"`).exec(tag)?.[1];

test('the server keeps a header that differs between routes only in an attribute bound to a prop, and names that attribute', async () => {
	const guide = await fetchText('/guide');
	const reference = await fetchText('/reference');
	const guideHeader = openingTag(guide, 'data-site-header');
	expect(keepHash(guideHeader)).toBeTruthy();
	expect(keepHash(guideHeader)).toBe(keepHash(openingTag(reference, 'data-site-header')));
	expect(openingTag(guide, 'data-nav="guide"')).toContain(
		`${PROTOCOL_VARY_ATTRIBUTE}="data-active"`,
	);
	expect(openingTag(guide, 'data-search')).not.toContain(PROTOCOL_VARY_ATTRIBUTE);
	// The fragment carries the next page's values in place.
	const fragment = await fetchText('/_markless/fragment/reference');
	expect(openingTag(fragment, 'data-nav="reference"')).toContain('data-active="true"');
	expect(openingTag(fragment, 'data-nav="guide"')).toContain('data-active="false"');
});

test('a header shared by two routes stays the same nodes, and only its active link changes', async () => {
	const { page, errors } = await open('/guide');
	await page.evaluate(() => {
		const host = globalThis as { __header?: Element; __links?: Element[] };
		host.__header = document.querySelector('[data-site-header]')!;
		host.__links = [...document.querySelectorAll('[data-nav]')];
	});
	await page.click('[data-nav="reference"]');
	await page.waitForFunction(
		() => document.querySelector('[data-title]')?.textContent === 'Reference page',
	);
	expect(
		await page.evaluate(() => {
			const host = globalThis as { __header?: Element; __links?: Element[] };
			return {
				header: document.querySelector('[data-site-header]') === host.__header,
				links: [...document.querySelectorAll('[data-nav]')].every(
					(link, index) => link === host.__links![index],
				),
				active: [...document.querySelectorAll('[data-nav]')].map((link) =>
					link.getAttribute('data-active'),
				),
			};
		}),
	).toEqual({ header: true, links: true, active: ['false', 'true', 'false'] });
	expect(errors).toEqual([]);
	await page.close();
});

test('a focused header button keeps focus and an attribute a script set on it across the navigation', async () => {
	const { page, errors } = await open('/guide');
	await page.evaluate(() => {
		const button = document.querySelector<HTMLButtonElement>('[data-search]')!;
		button.setAttribute('data-script-mark', 'set by a script');
		button.focus();
		(globalThis as { __button?: Element }).__button = button;
		document.querySelector<HTMLAnchorElement>('[data-nav="reference"]')!.click();
	});
	await page.waitForFunction(
		() => document.querySelector('[data-title]')?.textContent === 'Reference page',
	);
	expect(
		await page.evaluate(() => {
			const button = document.querySelector('[data-search]')!;
			return {
				same: button === (globalThis as { __button?: Element }).__button,
				focused: document.activeElement === button,
				mark: button.getAttribute('data-script-mark'),
			};
		}),
	).toEqual({ same: true, focused: true, mark: 'set by a script' });
	expect(errors).toEqual([]);
	await page.close();
});

test('the region the two routes render differently shows only the next page', async () => {
	const { page, errors } = await open('/guide');
	await page.click('[data-nav="reference"]');
	await page.waitForFunction(
		() => document.querySelector('[data-title]')?.textContent === 'Reference page',
	);
	expect(
		await page.evaluate(() => ({
			main: document.querySelector('main')?.getAttribute('data-main'),
			text: document.querySelector('main')?.textContent,
			kept: document.querySelector('main')?.hasAttribute('data-markless-keep'),
		})),
	).toEqual({
		main: 'reference',
		text: 'Reference pageThe reference page has its own content, which a navigation replaces.',
		kept: false,
	});
	expect(errors).toEqual([]);
	await page.close();
});

test('a kept part whose root carries the attribute a prop sets keeps its frame, takes the new value and the next page content', async () => {
	const guide = await fetchText('/guide');
	const reference = await fetchText('/reference');
	const shell = openingTag(guide, 'data-docs-shell');
	expect(keepHash(shell)).toBeTruthy();
	expect(keepHash(shell)).toBe(keepHash(openingTag(reference, 'data-docs-shell')));
	expect(shell).toContain(`${PROTOCOL_VARY_ATTRIBUTE}="data-section"`);
	const { page, errors } = await open('/guide');
	await page.evaluate(() => {
		const host = globalThis as { __shell?: Element; __footer?: Element };
		host.__shell = document.querySelector('[data-docs-shell]')!;
		host.__footer = document.querySelector('.docs-footer')!;
		host.__shell.setAttribute('data-script-mark', 'kept');
	});
	await page.click('[data-nav="reference"]');
	await page.waitForFunction(
		() => document.querySelector('[data-title]')?.textContent === 'Reference page',
	);
	expect(
		await page.evaluate(() => {
			const host = globalThis as { __shell?: Element; __footer?: Element };
			const shell = document.querySelector('[data-docs-shell]')!;
			return {
				shell: shell === host.__shell,
				footer: document.querySelector('.docs-footer') === host.__footer,
				section: shell.getAttribute('data-section'),
				mark: shell.getAttribute('data-script-mark'),
				content: document
					.querySelector('[data-docs-content] main')
					?.getAttribute('data-main'),
			};
		}),
	).toEqual({
		shell: true,
		footer: true,
		section: 'reference',
		mark: 'kept',
		content: 'reference',
	});
	expect(errors).toEqual([]);
	await page.close();
});

test('a part whose text a prop sets is not kept', async () => {
	const guide = await fetchText('/guide');
	expect(openingTag(guide, 'data-page-note')).not.toContain(PROTOCOL_KEEP_ATTRIBUTE);
	expect(guide.match(new RegExp(`${PROTOCOL_KEEP_ATTRIBUTE}=`, 'g'))).toHaveLength(2);
});
