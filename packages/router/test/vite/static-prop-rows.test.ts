import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';
import { buildFixture } from '../support/fixture-build.ts';

// `pages/library.tsrx` hands an imported list a module constant, which forwards it one
// component deeper, and hands the same list state that changes. The fixed instance serves
// its rows as HTML only; the live one keeps its collection; the buttons inside both still work.

vi.setConfig({ testTimeout: 60_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-static-prop-rows-'));
	await cp(resolve(import.meta.dirname, '../fixtures/static-prop-rows-app'), root, { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await buildFixture({ root });
	server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	browser = await launchBrowser(chromium);
}, 240_000);

afterAll(async () => {
	await browser?.close();
	server?.close();
	if (root) await rm(root, { recursive: true, force: true });
});

const script = (html: string, type: string) =>
	new RegExp(`<script type="markless/${type}"[^>]*>([\\s\\S]*?)</script>`).exec(html)?.[1] ?? '';

async function rowsStillAnswer(tab: Page): Promise<void> {
	await tab.click('[data-tally="b-2"]');
	await tab.click('[data-tally="b-2"]');
	await expect.poll(() => tab.textContent('[data-tally="b-2"] [data-taps]')).toBe('2');
	expect(await tab.textContent('[data-tally="b-1"] [data-taps]')).toBe('0');
	await tab.click('[data-arrive]');
	await expect.poll(() => tab.locator('[data-tally^="n-"]').count()).toBe(2);
	await tab.click('[data-tally="n-2"]');
	await expect.poll(() => tab.textContent('[data-tally="n-2"] [data-taps]')).toBe('1');
}

test('the fixed list serves its rows once, as HTML, and the live list keeps its collection', async () => {
	const html = await (await fetch(`${server!.origin}/library`)).text();
	expect(html).toContain('fixed-blurb-one');
	const state = script(html, 'state');
	expect(state).not.toContain('fixed-blurb-one');
	expect(state).not.toContain('fixed-blurb-two');
	expect(state).toContain('live-blurb-one');
});

test('buttons inside the fixed rows work after resume', async () => {
	const tab = await browser!.newPage();
	const errors: string[] = [];
	tab.on('pageerror', (error) => errors.push(String(error)));
	await tab.goto(`${server!.origin}/library`);
	await rowsStillAnswer(tab);
	expect(errors).toEqual([]);
	await tab.close();
});

test('buttons inside the fixed rows work after a client navigation to the page', async () => {
	const tab = await browser!.newPage();
	const errors: string[] = [];
	tab.on('pageerror', (error) => errors.push(String(error)));
	await tab.goto(`${server!.origin}/`);
	await tab.click('[data-nav="library"]');
	await tab.waitForSelector('[data-page="library"]');
	expect(await tab.evaluate(() => location.pathname)).toBe('/library');
	await rowsStillAnswer(tab);
	expect(errors).toEqual([]);
	await tab.close();
});
