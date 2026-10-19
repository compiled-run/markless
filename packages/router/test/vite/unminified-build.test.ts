import {
	cp,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	realpath,
	rm,
	symlink,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';

// An app built with `build: { minify: false }` ships readable chunks that must run as the minified ones do.

vi.setConfig({ testTimeout: 30_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');

const slowPage = [
	"import { computed, state } from '@markless/core';",
	"import Layout from '../src/layout.tsrx';",
	'export default function Slow() @{',
	'\tlet taps = state(0);',
	'\tconst report = computed(async () => {',
	'\t\tawait new Promise((resolve) => setTimeout(resolve, 100));',
	"\t\treturn { text: 'report ready' };",
	'\t});',
	'\t<Layout name="slow">',
	'\t\t@try {',
	'\t\t\t<p data-settled>{report.text} <button type="button" data-tap onClick={() => taps++}>more</button></p>',
	'\t\t} @pending {',
	'\t\t\t<p data-pending>loading report</p>',
	'\t\t}',
	'\t\t<output data-taps>{taps}</output>',
	'\t</Layout>',
	'}',
].join('\n');

let root: string;
let server: BuiltServer;
let browser: Browser;

beforeAll(async () => {
	root = await realpath(await mkdtemp(join(tmpdir(), 'markless-unminified-')));
	await cp(resolve(import.meta.dirname, '../fixtures/page-region-app'), root, {
		recursive: true,
	});
	await writeFile(join(root, 'pages/slow.tsrx'), slowPage);
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	const builder = await createBuilder({
		root,
		configFile: false,
		logLevel: 'silent',
		// Rolldown names modules relative to its cwd in unminified output; an app builds from its own root.
		build: { minify: false, rolldownOptions: { cwd: root } },
		plugins: [markless(), router()],
	} as Parameters<typeof createBuilder>[0]);
	await builder.buildApp();
	server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	browser = await chromium.launch();
}, 240_000);

afterAll(async () => {
	await browser?.close();
	server?.close();
	if (root) await rm(root, { recursive: true, force: true });
});

test('the client output is unminified', async () => {
	const build = join(root, '.output/public/build');
	const chunks = (await readdir(build)).filter((file) => file.endsWith('.js'));
	const sources = await Promise.all(chunks.map((file) => readFile(join(build, file), 'utf8')));
	expect(sources.some((source) => source.includes('//#region'))).toBe(true);
});

test('an unminified build resumes, navigates and settles a streamed @pending page', async () => {
	const page = await browser.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await page.goto(`${server.origin}/`);
	await page.locator('[data-bump]').click();
	await expect.poll(() => page.locator('[data-count]').textContent()).toBe('1');
	await page.locator('[data-nav="other"]').click();
	await page.locator('header[data-page="other"]').waitFor();
	await page.locator('[data-tap]').click();
	await expect.poll(() => page.locator('[data-taps]').textContent()).toBe('1');
	await page.goto(`${server.origin}/slow`);
	await page.locator('[data-settled]').waitFor();
	await page.locator('[data-tap]').click();
	await expect.poll(() => page.locator('[data-taps]').textContent()).toBe('1');
	expect(errors).toEqual([]);
	await page.close();
});
