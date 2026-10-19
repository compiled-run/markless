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

// A built router app in a real browser: each page is opened fresh, so the gesture under test is the one that wakes it.

const packagesRoot = resolve(import.meta.dirname, '../../..');

const files: Record<string, string> = {
	'document.tsrx': [
		"import type { Children } from '@markless/core';",
		"import { Html } from '@markless/router';",
		'export default function Document({ children }: { readonly children?: Children }) @{',
		'\t<Html><head><meta charset="utf-8" /><script src="/foreign.js" defer></script></head><body>{children}</body></Html>',
		'}',
	].join('\n'),
	'public/foreign.js': [
		"document.addEventListener('DOMContentLoaded', function () {",
		"\tvar slot = document.querySelector('[data-slot]');",
		'\tif (slot) {',
		"\t\tvar button = document.createElement('button');",
		"\t\tbutton.className = 'DocSearch';",
		"\t\tbutton.innerHTML = '<span><svg></svg>Search</span><span>K</span>';",
		'\t\tslot.appendChild(button);',
		'\t}',
		"\tvar star = document.querySelector('a.github-button');",
		'\tif (star) {',
		"\t\tvar span = document.createElement('span');",
		"\t\tspan.innerHTML = '<iframe></iframe>';",
		'\t\tstar.replaceWith(span);',
		'\t}',
		"\tvar owned = document.querySelector('[data-owned]');",
		'\tif (owned) {',
		"\t\tvar swapped = document.createElement('section');",
		"\t\tswapped.setAttribute('data-swapped', '');",
		'\t\towned.replaceWith(swapped);',
		'\t}',
		'});',
	].join('\n'),
	'pages/absent.tsrx': [
		"import { state } from '@markless/core';",
		'export default function Absent() @{',
		'\tlet open = state(false);',
		'\t<div>',
		'\t\t<button type="button" data-toggle onClick={() => (open = !open)}>Toggle</button>',
		"\t\t<div data-contents style={open ? undefined : 'display: none;'}>Contents</div>",
		'\t</div>',
		'}',
	].join('\n'),
	'pages/rows.tsrx': [
		"import { computed, state } from '@markless/core';",
		"const ITEMS = ['foo', 'bar', 'baz'];",
		'export default function Rows() @{',
		"\tlet search = state('');",
		'\tconst filtered = computed(() => ITEMS.filter((item) => item.startsWith(search)));',
		'\t<div>',
		'\t\t<input data-search value={search} onInput={(event) => (search = (event.target as HTMLInputElement).value)} />',
		'\t\t<ul data-results>',
		'\t\t\t@for (const item of filtered; key item) {',
		'\t\t\t\t<li>{item}</li>',
		'\t\t\t}',
		'\t\t</ul>',
		'\t</div>',
		'}',
	].join('\n'),
	'parts/demos.tsrx': [
		"import { computed, state } from '@markless/core';",
		"const ITEMS = ['foo', 'bar', 'baz'];",
		'export function CounterDemo() @{',
		'\tlet count = state(0);',
		'\t<div><button type="button" data-count onClick={() => count++}>Increment</button><span data-count-value>{count}</span></div>',
		'}',
		'export function DropdownDemo() @{',
		'\tlet open = state(false);',
		'\t<div',
		'\t\tattach={(demo) => {',
		'\t\t\tconst outside = (event: MouseEvent) => {',
		"\t\t\t\tif (!demo.contains(event.target as Node)) demo.dispatchEvent(new CustomEvent('outside'));",
		'\t\t\t};',
		"\t\t\tdocument.addEventListener('click', outside);",
		"\t\t\treturn () => document.removeEventListener('click', outside);",
		'\t\t}}',
		'\t\tonOutside={() => (open = false)}',
		'\t>',
		'\t\t<button type="button" data-demo-toggle onClick={() => (open = !open)}>Toggle</button>',
		"\t\t<div data-demo-contents style={open ? undefined : 'display: none;'}>Contents...</div>",
		'\t</div>',
		'}',
		'export function SearchDemo() @{',
		"\tlet search = state('');",
		'\tconst filtered = computed(() => ITEMS.filter((item) => item.startsWith(search)));',
		'\t<div>',
		'\t\t<input data-demo-search placeholder="Search..." value={search} onInput={(event) => (search = (event.target as HTMLInputElement).value)} />',
		'\t\t<ul data-demo-results>',
		'\t\t\t<template></template>',
		'\t\t\t@for (const item of filtered; key item) {',
		'\t\t\t\t<li>{item}</li>',
		'\t\t\t}',
		'\t\t</ul>',
		'\t</div>',
		'}',
	].join('\n'),
	'pages/demos.tsrx': [
		"import { CounterDemo, DropdownDemo, SearchDemo } from '../parts/demos.tsrx';",
		'export default function Demos() @{',
		'\t<div style="display: contents">',
		'\t\t<main>',
		'\t\t\t<h1>Start Here</h1>',
		'\t\t\t<CounterDemo />',
		'\t\t\t<p>Between the demos.</p>',
		'\t\t\t<DropdownDemo />',
		'\t\t\t<SearchDemo />',
		'\t\t</main>',
		'\t</div>',
		'}',
	].join('\n'),
	'pages/row-class.tsrx': [
		"import { computed, state } from '@markless/core';",
		"const ITEMS = ['foo', 'bar', 'baz'];",
		'export default function RowClass() @{',
		"\tlet search = state('');",
		'\tconst filtered = computed(() => ITEMS.filter((item) => item.startsWith(search)));',
		'\t<div>',
		'\t\t<input data-search value={search} onInput={(event) => (search = (event.target as HTMLInputElement).value)} />',
		'\t\t<ul data-results>',
		'\t\t\t@for (const item of filtered; key item) {',
		"\t\t\t\t<li class={search ? 'hit' : 'all'}>{item}</li>",
		'\t\t\t}',
		'\t\t</ul>',
		'\t</div>',
		'}',
	].join('\n'),
	'pages/row-handler.tsrx': [
		"import { state } from '@markless/core';",
		'export default function RowHandler() @{',
		"\tlet items = state([{ id: 'a', label: 'A' }]);",
		'\t<div>',
		"\t\t<button type=\"button\" data-add onClick={() => (items = [...items, { id: 'b' + items.length, label: 'B' }])}>Add</button>",
		'\t\t<ul data-results>',
		'\t\t\t@for (const item of items; key item.id) {',
		'\t\t\t\t<li onClick={() => (items = items.filter((each) => each.id !== item.id))}>{item.label}</li>',
		'\t\t\t}',
		'\t\t</ul>',
		'\t</div>',
		'}',
	].join('\n'),
	'pages/foreign.tsrx': [
		"import { state } from '@markless/core';",
		'export default function Foreign() @{',
		'\tlet count = state(0);',
		'\t<main>',
		'\t\t<header>',
		'\t\t\t<div data-slot></div>',
		'\t\t\t<a class="github-button" href="https://github.com/">Star</a>',
		'\t\t\t<a href="/">Home</a>',
		'\t\t</header>',
		'\t\t<button type="button" data-bump onClick={() => count++}>Bump</button>',
		'\t\t<output data-count>{count}</output>',
		'\t</main>',
		'}',
	].join('\n'),
	'pages/owned.tsrx': [
		"import { state } from '@markless/core';",
		'export default function Owned() @{',
		'\tlet count = state(0);',
		'\tlet other = state(0);',
		'\t<main>',
		"\t\t<p data-owned class={count > 0 ? 'on' : 'off'}><span>{count}</span></p>",
		'\t\t<button type="button" data-bump onClick={() => count++}>Bump</button>',
		'\t\t<button type="button" data-other onClick={() => other++}>Other</button>',
		'\t\t<output data-other-count>{other}</output>',
		'\t</main>',
		'}',
	].join('\n'),
	'pages/wake.tsrx': [
		"import { state } from '@markless/core';",
		'export default function Wake() @{',
		"\tlet seen = state('no');",
		"\tlet measured = state('no');",
		'\t<main>',
		"\t\t<div data-visible onVisible={() => { seen = 'yes'; }}>Visible</div>",
		"\t\t<div data-attach attach={(element) => { element.setAttribute('data-attached', 'yes'); }} onVisible={() => {}}>Attached</div>",
		'\t\t<div data-writer attach={(element) => { measured = element.tagName.toLowerCase(); }} onVisible={() => {}}>Writer</div>',
		'\t\t<output data-seen>{seen}</output>',
		'\t\t<output data-measured>{measured}</output>',
		'\t</main>',
		'}',
	].join('\n'),
};

let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-router-first-gestures-'));
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
		if (message.type() === 'error') errors.push(message.text());
	});
	await page.goto(server!.origin + path);
	return { page, errors };
}

test('the first click that removes an attribute removes it', async () => {
	const { page, errors } = await open('/absent');
	await page.click('[data-toggle]');
	await page.waitForFunction(
		() => !document.querySelector('[data-contents]')?.hasAttribute('style'),
	);
	await page.click('[data-toggle]');
	await page.waitForFunction(
		() => document.querySelector('[data-contents]')?.getAttribute('style') === 'display: none;',
	);
	expect(errors).toEqual([]);
	await page.close();
}, 30_000);

test('the first keystroke updates a keyed list', async () => {
	const { page, errors } = await open('/rows');
	const items = () =>
		page.$$eval('[data-results] li', (rows) => rows.map((row) => row.textContent));
	expect(await items()).toEqual(['foo', 'bar', 'baz']);
	await page.locator('[data-search]').pressSequentially('b');
	await expect.poll(items).toEqual(['bar', 'baz']);
	await page.locator('[data-search]').pressSequentially('az');
	await expect.poll(items).toEqual(['baz']);
	expect(errors).toEqual([]);
	await page.close();
}, 30_000);

test('onVisible runs before any input, starts the attach on its host, and attach can write state', async () => {
	const { page, errors } = await open('/wake');
	await page.waitForFunction(() => document.querySelector('[data-seen]')?.textContent === 'yes');
	await page.waitForFunction(
		() => document.querySelector('[data-attach]')?.getAttribute('data-attached') === 'yes',
	);
	await page.waitForFunction(
		() => document.querySelector('[data-measured]')?.textContent === 'div',
	);
	expect(errors).toEqual([]);
	await page.close();
}, 30_000);

test('composed demos: the first toggle shows its contents and the first keystroke filters', async () => {
	const toggled = await open('/demos');
	await toggled.page.click('[data-demo-toggle]');
	await toggled.page.waitForFunction(
		() => !document.querySelector('[data-demo-contents]')?.hasAttribute('style'),
	);
	expect(toggled.errors).toEqual([]);
	await toggled.page.close();

	const typed = await open('/demos');
	const items = () =>
		typed.page.$$eval('[data-demo-results] li', (rows) => rows.map((row) => row.textContent));
	await typed.page.locator('[data-demo-search]').pressSequentially('b');
	await expect.poll(items).toEqual(['bar', 'baz']);
	expect(typed.errors).toEqual([]);
	await typed.page.close();
}, 30_000);

test('the first keystroke updates a row class bound to page state', async () => {
	const { page, errors } = await open('/row-class');
	await page.click('[data-search]');
	await page.keyboard.type('b');
	await page.waitForFunction(() => document.querySelectorAll('[data-results] li').length === 2);
	await page.waitForFunction(
		() => document.querySelector('[data-results] li')?.className === 'hit',
	);
	expect(errors).toEqual([]);
	await page.close();
}, 30_000);

test('a handler in a served row keeps its row item on the first click', async () => {
	const { page, errors } = await open('/row-handler');
	await page.click('[data-results] li');
	await page.waitForFunction(() => document.querySelectorAll('[data-results] li').length === 0);
	expect(errors).toEqual([]);
	await page.close();
}, 30_000);

test('a script that inserts and swaps static elements before the first click leaves resume working', async () => {
	const { page, errors } = await open('/foreign');
	await page.waitForFunction(
		() => !!document.querySelector('.DocSearch') && !document.querySelector('a.github-button'),
	);
	await page.click('[data-bump]');
	await page.waitForFunction(() => document.querySelector('[data-count]')?.textContent === '1');
	expect(errors).toEqual([]);
	await page.close();
}, 30_000);

test('a script that swaps an element Markless updates breaks only that element', async () => {
	const { page, errors } = await open('/owned');
	await page.waitForFunction(() => !!document.querySelector('[data-swapped]'));
	await page.click('[data-bump]');
	await page.click('[data-other]');
	await page.waitForFunction(
		() => document.querySelector('[data-other-count]')?.textContent === '1',
	);
	expect(errors).toEqual([]);
	await page.close();
}, 30_000);
