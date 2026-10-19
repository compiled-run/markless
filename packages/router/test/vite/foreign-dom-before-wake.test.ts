import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'pathe';
import { chromium, type Browser } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// A built router app whose page loads a parser-blocking third-party script in the middle of its
// markup: the script edits the page while the HTML is still arriving, before Markless boots.

const packagesRoot = resolve(import.meta.dirname, '../../..');

const files: Record<string, string> = {
	'document.tsrx': [
		"import type { Children } from '@markless/core';",
		"import { Html } from '@markless/router';",
		'export default function Document({ children }: { readonly children?: Children }) @{',
		'\t<Html><head><meta charset="utf-8" /></head><body>{children}</body></Html>',
		'}',
	].join('\n'),
	'public/docsearch.js': [
		"var slot = document.querySelector('[data-search-slot]');",
		"var button = document.createElement('button');",
		"button.className = 'DocSearch DocSearch-Button';",
		'button.innerHTML = \'<span class="DocSearch-Button-Container"><svg width="20" height="20"><path d="M0 0"></path></svg><span>Search</span></span><span><kbd>K</kbd></span>\';',
		'slot.replaceChildren(button);',
	].join('\n'),
	'public/buttons.js': [
		"var star = document.querySelector('a.github-button');",
		"var span = document.createElement('span');",
		'span.innerHTML = \'<iframe title="Star on GitHub"></iframe>\';',
		'star.replaceWith(span);',
		"document.querySelector('header').insertBefore(document.createElement('span'), span);",
	].join('\n'),
	'public/swap.js': [
		"var owned = document.querySelector('[data-owned]');",
		"var swapped = document.createElement('section');",
		"swapped.setAttribute('data-swapped', '');",
		'owned.replaceWith(swapped);',
	].join('\n'),
	'pages/index.tsrx': [
		"import { state } from '@markless/core';",
		'export default function Home() @{',
		'\tlet count = state(0);',
		'\t<main>',
		'\t\t<header>',
		'\t\t\t<div data-search-slot><button type="button">Search</button></div>',
		'\t\t\t<script src="/docsearch.js"></script>',
		'\t\t\t<a class="github-button" href="https://github.com/">Star</a>',
		'\t\t\t<script src="/buttons.js"></script>',
		'\t\t\t<a href="/">Home</a>',
		'\t\t</header>',
		"\t\t<p data-owned class={count > 0 ? 'on' : 'off'}>{count}</p>",
		'\t\t<button type="button" data-bump onClick={() => count++}>Bump</button>',
		'\t\t<output data-count>{count}</output>',
		'\t</main>',
		'}',
	].join('\n'),
	'public/insert.js': "document.querySelector('main').prepend(document.createElement('aside'));",
	'src/note-form.tsrx': [
		"import { state } from '@markless/core';",
		'export default function NoteForm({ title }: { readonly title: string }) @{',
		"\tlet saved = state('');",
		'\t<form data-note-form onSubmit={(event) => { event.preventDefault(); saved = `saved ${title}`; }}>',
		'\t\t<input name="body" value="draft" />',
		'\t\t<button type="submit" data-save>save</button>',
		'\t\t<output data-saved>{saved}</output>',
		'\t</form>',
		'}',
	].join('\n'),
	'pages/form.tsrx': [
		"import NoteForm from '../src/note-form.tsrx';",
		'export default function FormPage() @{',
		'\t<main>',
		'\t\t<p>notes</p>',
		'\t\t<script src="/insert.js"></script>',
		'\t\t<NoteForm title="plain note" />',
		'\t</main>',
		'}',
	].join('\n'),
	'pages/form-arm.tsrx': [
		"import { computed } from '@markless/core';",
		"import NoteForm from '../src/note-form.tsrx';",
		'export default function FormArmPage() @{',
		"\tconst note = computed(async () => ({ title: 'arm note' }));",
		'\t<main>',
		'\t\t<p>notes</p>',
		'\t\t<script src="/insert.js"></script>',
		'\t\t@try {',
		'\t\t\t<NoteForm title={note.title} />;',
		'\t\t} @pending {',
		'\t\t\t<p>loading note</p>;',
		'\t\t}',
		'\t</main>',
		'}',
	].join('\n'),
	'pages/owned.tsrx': [
		"import { state } from '@markless/core';",
		'export default function Owned() @{',
		'\tlet count = state(0);',
		'\tlet other = state(0);',
		'\t<main>',
		"\t\t<p data-owned class={count > 0 ? 'on' : 'off'}>{count}</p>",
		'\t\t<script src="/swap.js"></script>',
		'\t\t<button type="button" data-bump onClick={() => count++}>Bump</button>',
		'\t\t<button type="button" data-other onClick={() => other++}>Other</button>',
		'\t\t<output data-other-count>{other}</output>',
		'\t</main>',
		'}',
	].join('\n'),
};

let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-router-foreign-dom-'));
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

async function open(path: string) {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await page.goto(server!.origin + path);
	return { page, errors };
}

test('a DocSearch-style swap and a buttons.js-style insertion before wake leave the page resuming', async () => {
	const { page, errors } = await open('/');
	expect(await page.locator('.DocSearch').count()).toBe(1);
	expect(await page.locator('a.github-button').count()).toBe(0);
	await page.click('[data-bump]');
	await page.waitForFunction(() => document.querySelector('[data-count]')?.textContent === '1');
	await page.waitForFunction(() => document.querySelector('[data-owned]')?.className === 'on');
	expect(errors).toEqual([]);
	await page.close();
}, 30_000);

test('a script that swaps an element Markless updates leaves the rest of the page resuming', async () => {
	const { page } = await open('/owned');
	expect(await page.locator('[data-swapped]').count()).toBe(1);
	await page.click('[data-bump]');
	await page.click('[data-other]');
	await page.waitForFunction(
		() => document.querySelector('[data-other-count]')?.textContent === '1',
	);
	await page.close();
}, 30_000);

test.each([
	['/form', 'plain note'],
	['/form-arm', 'arm note'],
])(
	'a script that changed the page before wake leaves the first submit on %s prevented',
	async (path, title) => {
		const { page, errors } = await open(path);
		expect(await page.locator('main > aside').count()).toBe(1);
		expect(await page.locator('[data-note-form][data-markless-sync]').count()).toBe(1);
		await page.click('[data-save]');
		await page.waitForFunction(
			(text) => document.querySelector('[data-saved]')?.textContent === text,
			`saved ${title}`,
		);
		expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(path);
		expect(errors).toEqual([]);
		await page.close();
	},
	30_000,
);
