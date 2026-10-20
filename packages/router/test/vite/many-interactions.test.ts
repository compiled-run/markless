import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// A docs-style accordion page driven through many interactions, on a fresh load and after a fragment navigation:
// every branch swap must keep the container's element census in step with the DOM.

const packagesRoot = resolve(import.meta.dirname, '../../..');

const section = (index: number) => [
	`\t\t<section data-item="${index}">`,
	`\t\t\t<h3><button type="button" data-trigger="${index}" aria-expanded={open === ${index} ? 'true' : 'false'} onClick={() => (open = open === ${index} ? -1 : ${index})}>Item ${index}</button></h3>`,
	`\t\t\t@if (open === ${index}) {`,
	`\t\t\t\t<div data-panel="${index}"><p>Panel <strong>${index}</strong> text</p><ul><li>one</li><li>two</li></ul></div>`,
	'\t\t\t}',
	'\t\t</section>',
];

const files: Record<string, string> = {
	'document.tsrx': [
		"import type { Children } from '@markless/core';",
		"import { Html } from '@markless/router';",
		'export default function Document({ children }: { readonly children?: Children }) @{',
		'\t<Html><head><meta charset="utf-8" /></head><body>{children}</body></Html>',
		'}',
	].join('\n'),
	'pages/index.tsrx': [
		"import { state } from '@markless/core';",
		'export default function Home() @{',
		'\tlet count = state(0);',
		'\t<main>',
		'\t\t<nav><a data-go href="/accordion">Accordion</a></nav>',
		'\t\t<button type="button" data-bump onClick={() => count++}>Bump</button>',
		'\t\t<output>{count}</output>',
		'\t</main>',
		'}',
	].join('\n'),
	'pages/accordion.tsrx': [
		"import { state } from '@markless/core';",
		"const MANAGERS = ['pnpm', 'npm', 'yarn', 'bun'];",
		'export default function Accordion() @{',
		'\tlet open = state(0);',
		"\tlet manager = state('pnpm');",
		'\t<main>',
		'\t\t<nav><a href="/">Home</a></nav>',
		'\t\t<div role="tablist">',
		'\t\t\t@for (const name of MANAGERS; key name) {',
		"\t\t\t\t<button type=\"button\" role=\"tab\" data-tab={name} aria-selected={manager === name ? 'true' : 'false'} onClick={() => (manager = name)}>{name}</button>",
		'\t\t\t}',
		'\t\t</div>',
		'\t\t@if (manager === "npm") {',
		'\t\t\t<pre data-command><code>npx init</code></pre>',
		'\t\t} @else {',
		'\t\t\t<div data-command><pre><code>{manager} dlx init</code></pre></div>',
		'\t\t}',
		...[0, 1, 2, 3, 4, 5].flatMap(section),
		'\t\t<footer><button type="button" data-last onClick={() => (open = -1)}>Close all</button></footer>',
		'\t</main>',
		'}',
	].join('\n'),
};

let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-router-many-interactions-'));
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
		plugins: [markless(), router()],
	});
	await builder.buildApp();
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

async function open(path: string): Promise<{ readonly page: Page; readonly errors: string[] }> {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	page.on('console', (message) => {
		if (message.type() === 'error' || /MARKLESS_|Resume locator/.test(message.text()))
			errors.push(message.text());
	});
	await page.goto(server!.origin + path);
	return { page, errors };
}

// Pinned census slots that point at detached elements or out of DOM order.
const censusDrift = (page: Page) =>
	page.evaluate(() => {
		const census = (document.body as HTMLElement & { __marklessCensus?: Array<Element | null> })
			.__marklessCensus;
		if (!census) return ['no census'];
		const drift: string[] = [];
		let previous: Element | undefined;
		census.forEach((element, index) => {
			if (!element) return;
			if (!element.isConnected) drift.push(`${index} <${element.tagName.toLowerCase()}> detached`);
			else if (
				previous &&
				previous !== element &&
				!(previous.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)
			)
				drift.push(`${index} <${element.tagName.toLowerCase()}> out of order`);
			if (element.isConnected) previous = element;
		});
		return drift;
	});

async function driveAccordion(page: Page): Promise<void> {
	for (let round = 0; round < 3; round++) {
		for (const name of ['npm', 'yarn', 'pnpm', 'bun', 'npm']) {
			await page.click(`[data-tab="${name}"]`);
			await page.waitForFunction(
				(name) => document.querySelector(`[data-tab="${name}"]`)?.getAttribute('aria-selected') === 'true',
				name,
			);
		}
		for (const index of [0, 1, 2, 3, 4, 5, 5, 2]) {
			await page.click(`[data-trigger="${index}"]`);
			await page.waitForFunction(
				(index) => {
					const expanded = document.querySelector(`[data-trigger="${index}"]`)?.getAttribute('aria-expanded') === 'true';
					return expanded === !!document.querySelector(`[data-panel="${index}"]`);
				},
				index,
			);
		}
		await page.click('[data-last]');
		await page.waitForFunction(() => !document.querySelector('[data-panel]'));
	}
	expect(await page.textContent('[data-command]')).toContain('npx init');
}

test('many branch swaps on a fresh load keep the census on the live elements', async () => {
	const { page, errors } = await open('/accordion');
	await driveAccordion(page);
	expect(await censusDrift(page)).toEqual([]);
	expect(errors).toEqual([]);
	await page.close();
}, 60_000);

test('many branch swaps after a fragment navigation keep the census on the live elements', async () => {
	const { page, errors } = await open('/');
	await page.click('[data-bump]');
	await page.click('[data-go]');
	await page.waitForURL(`${server!.origin}/accordion`);
	await page.waitForSelector('[data-trigger="0"]');
	await driveAccordion(page);
	expect(await censusDrift(page)).toEqual([]);
	await page.click('a[href="/"]');
	await page.waitForURL(`${server!.origin}/`);
	await page.click('a[href="/accordion"]');
	await page.waitForURL(`${server!.origin}/accordion`);
	await page.waitForSelector('[data-trigger="0"]');
	await driveAccordion(page);
	expect(await censusDrift(page)).toEqual([]);
	expect(errors).toEqual([]);
	await page.close();
}, 90_000);
