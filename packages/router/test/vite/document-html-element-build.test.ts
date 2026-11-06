import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'pathe';
import { chromium } from '@playwright/test';
import { createBuilder, createServer } from 'vite';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { SERVED_HTML_ATTRIBUTES_PROPERTY } from '../../src/route-dom.ts';
import { fragmentRequestUrl } from '../../src/vite/fragment-navigation.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// A document.tsrx that writes <html> itself, with a scoped <style>, the way the website's does.

const packagesRoot = resolve(import.meta.dirname, '../../..');

const files: Record<string, string> = {
	'document.tsrx': [
		"import type { Children } from '@markless/core';",
		'export default function Document({',
		'\turl,',
		'\tchildren,',
		'}: { readonly url?: { readonly pathname: string }; readonly children?: Children }) @{',
		"\tconst theme = url?.pathname === '/' ? 'paper' : undefined;",
		'\t<html lang="fr" data-theme={theme} class={theme}>',
		'\t\t<head>',
		'\t\t\t<meta charset="utf-8" />',
		'\t\t\t<meta name="viewport" content="width=device-width, initial-scale=1" />',
		'\t\t\t<title>Own root</title>',
		'\t\t\t<link rel="icon" href="/icon.svg" />',
		'\t\t\t<script src="/boot.js"></script>',
		'\t\t</head>',
		'\t\t<body>',
		'\t\t\t<style>',
		'\t\t\t\t.shell { padding: 1rem; }',
		'\t\t\t</style>',
		'\t\t\t<div class="shell">{children}</div>',
		'\t\t</body>',
		'\t</html>;',
		'}',
	].join('\n'),
	'pages/index.tsrx': [
		"import { state } from '@markless/core';",
		'export default function Home() @{',
		'\tlet count = state(0);',
		'\t<main><button type="button" data-bump onClick={() => count++}>{count}</button></main>',
		'}',
	].join('\n'),
	'public/boot.js': 'document.documentElement.dataset.booted = "yes";\n',
};

const METADATA = ['head', 'meta', 'title', 'link', 'script'];

function expectOneRootAndUnscopedHead(html: string) {
	expect(html.match(/<html[\s>]/gi)).toHaveLength(1);
	expect(html.match(/<\/html>/gi)).toHaveLength(1);
	expect(html).toMatch(
		/^<!doctype html><html lang="fr" data-theme="paper" class="paper mk-[a-z0-9]+">/,
	);
	for (const tag of METADATA)
		for (const open of html.match(new RegExp(`<${tag}(?=[\\s>])[^>]*>`, 'gi')) ?? [])
			expect(open, open).not.toMatch(/\bmk-[a-z0-9]+/);
	expect(/<body[^>]*>/.exec(html)?.[0]).toMatch(/class="mk-[a-z0-9]+"/);
}

let root = '';
let server: BuiltServer | undefined;

beforeAll(async () => {
	root = await realpath(await mkdtemp(join(tmpdir(), 'markless-router-html-element-')));
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const name of ['core', 'router'])
		await symlink(join(packagesRoot, name), join(root, 'node_modules/@markless', name), 'dir');
	for (const [file, source] of Object.entries(files)) {
		await mkdir(dirname(join(root, file)), { recursive: true });
		await writeFile(join(root, file), source);
	}
	const builder = await createBuilder({
		root,
		configFile: false,
		logLevel: 'silent',
		nitro: { routeRules: { '/': { prerender: true } } },
		plugins: [markless(), router()],
	} as Parameters<typeof createBuilder>[0]);
	await builder.buildApp();
	server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
}, 240_000);

afterAll(async () => {
	await server?.close();
	if (root) await rm(root, { recursive: true, force: true });
});

test('the prerendered page has one <html> and an unscoped head', async () => {
	expectOneRootAndUnscopedHead(await readFile(join(root, '.output/public/index.html'), 'utf8'));
});

test('the served page has one <html>, and the browser sees the served root attributes', async () => {
	expectOneRootAndUnscopedHead(await (await fetch(server!.origin)).text());
	const fragment = await (await fetch(fragmentRequestUrl(`${server!.origin}/`))).text();
	expect(fragment.match(/<html[\s>]/gi)?.length ?? 0).toBeLessThanOrEqual(1);

	const browser = await launchBrowser(chromium);
	try {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(String(error)));
		await page.goto(server!.origin);
		const served = await page.evaluate(
			(property) =>
				Object.fromEntries(
					(document.documentElement as unknown as Record<string, [string, string][]>)[
						property
					]!,
				),
			SERVED_HTML_ATTRIBUTES_PROPERTY,
		);
		expect(served).toMatchObject({ lang: 'fr', 'data-theme': 'paper' });
		expect(served.class).toMatch(/^paper mk-[a-z0-9]+$/);
		expect(await page.evaluate(() => document.documentElement.dataset.booted)).toBe('yes');
		await page.click('[data-bump]');
		await page.waitForFunction(
			() => document.querySelector('[data-bump]')?.textContent === '1',
		);
		expect(errors).toEqual([]);
	} finally {
		await browser.close();
	}
}, 60_000);

test('the dev server serves one <html> and an unscoped head', async () => {
	const dev = await createServer({
		root,
		configFile: false,
		logLevel: 'silent',
		plugins: [markless(), router()],
		server: { port: 0, strictPort: false, ws: false, fs: { strict: false } },
	});
	try {
		await dev.listen();
		const url = dev.resolvedUrls?.local[0];
		expect(url).toBeTruthy();
		expectOneRootAndUnscopedHead(await (await fetch(new URL('/', url))).text());
	} finally {
		await dev.close();
	}
}, 120_000);
