import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'pathe';
import { chromium } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

const packagesRoot = resolve(import.meta.dirname, '../../..');

const files: Record<string, string> = {
	'document.tsrx': [
		"import type { Children } from '@markless/core';",
		"import { Html } from '@markless/router';",
		'export default function Document({',
		'\tchildren,',
		'\turl,',
		'}: { readonly children?: Children; readonly url: { readonly pathname: string } }) @{',
		'\t<Html lang="fr" class="theme-dark" data-theme="paper" data-ready data-path={url.pathname}>',
		'\t\t<head><meta charset="utf-8" /><title>Attributes</title></head>',
		'\t\t<body>{children}</body>',
		'\t</Html>',
		'}',
	].join('\n'),
	'pages/index.tsrx': [
		"import { state } from '@markless/core';",
		'export default function Home() @{',
		'\tlet count = state(0);',
		'\t<main><button type="button" data-bump onClick={() => count++}>{count}</button></main>',
		'}',
	].join('\n'),
	'bare/document.tsrx': [
		"import type { Children } from '@markless/core';",
		"import { Html } from '@markless/router';",
		'export default function Document({ children }: { readonly children?: Children }) @{',
		'\t<Html><head><meta charset="utf-8" /></head><body>{children}</body></Html>',
		'}',
	].join('\n'),
};

type App = { readonly root: string; readonly server: BuiltServer };
const apps: App[] = [];

async function serve(documentSource: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'markless-router-html-attributes-'));
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const name of ['core', 'router'])
		await symlink(join(packagesRoot, name), join(root, 'node_modules/@markless', name), 'dir');
	for (const [file, source] of Object.entries({
		'document.tsrx': documentSource,
		'pages/index.tsrx': files['pages/index.tsrx']!,
	})) {
		await mkdir(dirname(join(root, file)), { recursive: true });
		await writeFile(join(root, file), source);
	}
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
	apps.push({ root, server });
	return server.origin;
}

let origin = '';
let bareOrigin = '';

beforeAll(async () => {
	origin = await serve(files['document.tsrx']!);
	bareOrigin = await serve(files['bare/document.tsrx']!);
}, 240_000);

afterAll(async () => {
	for (const app of apps.splice(0)) {
		app.server.close();
		await rm(app.root, { recursive: true, force: true });
	}
});

test('attributes written on <Html> in document.tsrx reach the served <html> tag', async () => {
	const html = await (await fetch(origin)).text();
	expect(html).toMatch(/^<!doctype html><html [^>]*>/);
	const openTag = /<html[^>]*>/.exec(html)?.[0] ?? '';
	expect(openTag).toContain('lang="fr"');
	expect(openTag).toContain('class="theme-dark"');
	expect(openTag).toContain('data-theme="paper"');
	expect(openTag).toContain('data-ready=');
	expect(openTag).toContain('data-path="/"');
	expect(html.match(/<html[\s>]/g)).toHaveLength(1);

	const browser = await launchBrowser(chromium);
	try {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(String(error)));
		await page.goto(origin);
		expect(
			await page.evaluate(() => ({
				lang: document.documentElement.lang,
				className: document.documentElement.className,
				theme: document.documentElement.dataset.theme,
			})),
		).toEqual({ lang: 'fr', className: 'theme-dark', theme: 'paper' });
		await page.click('[data-bump]');
		await page.waitForFunction(
			() => document.querySelector('[data-bump]')?.textContent === '1',
		);
		expect(errors).toEqual([]);
	} finally {
		await browser.close();
	}
}, 60_000);

test('a bare <Html> keeps the default lang', async () => {
	const html = await (await fetch(bareOrigin)).text();
	expect(/<html[^>]*>/.exec(html)?.[0]).toBe('<html lang="en">');
});
