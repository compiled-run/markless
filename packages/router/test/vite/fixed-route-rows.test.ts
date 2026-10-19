import { cp, mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { marklessBuildManifestPath } from '../../../bundler/src/build/build-manifests.ts';
import { MARKLESS_BYTE_ATTRIBUTION } from '../../../bundler/src/build/chunking.ts';
import { router } from '../../src/vite/index.ts';
import { startBuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// `pages/solo.tsrx` lists rows over its own props and nothing imports it, so its
// rows can never change and the page ships no row-building code. `pages/list.tsrx`
// has the same shape but `pages/index.tsrx` renders it as a child with a prop that
// changes, so it keeps its general rows and updates.
const packagesRoot = resolve(import.meta.dirname, '../../..');
const cleanups: Array<() => Promise<void> | void> = [];
let origin = '';
let appRoot = '';

beforeAll(async () => {
	const root = (appRoot = await mkdtemp(join(tmpdir(), 'markless-fixed-rows-')));
	cleanups.push(() => rm(root, { recursive: true, force: true }));
	await cp(resolve(import.meta.dirname, '../fixtures/fixed-rows-app'), root, { recursive: true });
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
	const server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	cleanups.push(() => server.close());
	origin = server.origin;
}, 240_000);

afterAll(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const repeatsOf = (html: string) =>
	JSON.parse(/<script type="markless\/view">(.*?)<\/script>/.exec(html)![1]!)
		.keyedRepeats as Array<Record<string, unknown>>;

test('a page nothing imports ships its fixed rows without row-building code, and its rows still dispatch', async () => {
	const html = await (await fetch(`${origin}/solo`)).text();
	const [repeat] = repeatsOf(html);
	expect(repeat).toMatchObject({ fixed: true });
	expect(repeat).not.toHaveProperty('rowTemplate');

	const browser = await launchBrowser(chromium);
	cleanups.push(() => browser.close());
	const page = await browser.newPage();
	const scripts: string[] = [];
	page.on('response', (response) => {
		if (response.request().resourceType() === 'script')
			scripts.push(new URL(response.url()).pathname);
	});
	await page.goto(`${origin}/solo`);
	await page.click('[data-row="b"]');
	await expect.poll(() => page.textContent('[data-picked]')).toBe('b');
	const attribution = JSON.parse(
		await readFile(
			marklessBuildManifestPath(join(appRoot, '.output/public'), MARKLESS_BYTE_ATTRIBUTION),
			'utf8',
		),
	) as {
		readonly chunks: Record<
			string,
			{ readonly modules: ReadonlyArray<[string, string, number]> }
		>;
	};
	const loaded = scripts.flatMap((path) =>
		(attribution.chunks[path.split('/').pop()!]?.modules ?? []).map(([, module]) => module),
	);
	expect(loaded).toContain('web/resume-keyed-repeats');
	expect(loaded).not.toContain('web/fns/row-mint');
});

test('the same shape rendered as a child keeps changeable rows and follows its props', async () => {
	const html = await (await fetch(`${origin}/`)).text();
	const repeats = repeatsOf(html);
	expect(repeats.length).toBeGreaterThan(0);
	expect(repeats.some((repeat) => repeat.fixed)).toBe(false);
	expect(repeats.every((repeat) => 'rowTemplate' in repeat)).toBe(true);

	const browser = await launchBrowser(chromium);
	cleanups.push(() => browser.close());
	const page = await browser.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`${origin}/`);
	expect(await page.locator('[data-list] li').allTextContents()).toEqual(['row 0', 'row 1']);
	await page.click('[data-more]');
	await expect.poll(() => page.textContent('[data-title]')).toBe('clicked 1');
	expect(errors).toEqual([]);
});
