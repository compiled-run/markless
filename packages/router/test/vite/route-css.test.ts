import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { fragmentRequestUrl } from '../../src/vite/fragment-navigation.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';
import { buildFixture } from '../support/fixture-build.ts';

// Only the two ui pages render the study, whose sheet the pack planner places in a pack every page reaches.

vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
const STUDY_MARK = '--study-mark';
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-route-css-'));
	await cp(resolve(import.meta.dirname, '../fixtures/route-css-app'), root, { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	const nodeEnv = process.env.NODE_ENV;
	process.env.NODE_ENV = 'production';
	try {
		await buildFixture({ root });
	} finally {
		if (nodeEnv === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = nodeEnv;
	}
	server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	browser = await launchBrowser(chromium);
});

afterAll(async () => {
	await browser?.close();
	server?.close();
	if (root) await rm(root, { recursive: true, force: true });
});

const html = async (path: string) => (await fetch(`${server!.origin}${path}`)).text();
const fragment = async (path: string) =>
	(await fetch(fragmentRequestUrl(`${server!.origin}${path}`))).text();

const studyLook = (page: Page) =>
	page.evaluate(() => {
		const study = getComputedStyle(document.querySelector('[data-probe="study"]')!);
		const part = document.querySelector('.part-1');
		return {
			border: `${study.borderTopWidth} ${study.borderTopStyle} ${study.borderTopColor}`,
			padding: study.paddingTop,
			part: part ? getComputedStyle(part).marginLeft : null,
		};
	});

test('a page that renders the study carries its sheet and the pages that do not render it do not', async () => {
	for (const path of ['/ui/dial', '/ui/meter']) expect(await html(path)).toContain(STUDY_MARK);
	for (const path of ['/', '/notes', '/recipes', '/garden']) {
		expect(await html(path)).not.toContain(STUDY_MARK);
		expect(await fragment(path)).not.toContain(STUDY_MARK);
	}
});

test('a navigation from a page without the study to one with it shows the study styled as on a cold load', async () => {
	const cold = await browser!.newPage();
	await cold.goto(`${server!.origin}/ui/dial`);
	await cold.waitForLoadState('networkidle');
	await cold.locator('[data-toggle]').click();
	await expect.poll(() => cold.locator('.part-1').count()).toBe(1);
	const coldLook = await studyLook(cold);
	await cold.close();
	expect(coldLook.border).toBe('3px solid rgb(120, 20, 160)');
	expect(coldLook.part).toBe('1px');

	const page = await browser!.newPage();
	await page.goto(`${server!.origin}/`);
	await page.waitForLoadState('networkidle');
	expect(
		await page.evaluate(() =>
			[...document.styleSheets].some((sheet) =>
				[...sheet.cssRules].some((rule) => rule.cssText.includes('--study-mark')),
			),
		),
	).toBe(false);
	await page.locator('[data-nav="dial"]').click();
	await page.waitForFunction(() => document.querySelector('[data-title]')?.textContent === 'Dial');
	await page.waitForLoadState('networkidle');
	await page.locator('[data-toggle]').click();
	await expect.poll(() => page.locator('.part-1').count()).toBe(1);
	expect(await studyLook(page)).toEqual(coldLook);
	await page.close();
});
