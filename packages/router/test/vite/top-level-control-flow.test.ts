import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, webkit, type Browser, type BrowserType, type Page } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { PROTOCOL_CONTAINER_END_COMMENT } from '../../../serializer/src/protocol-page-markers.ts';

// A keyed @for written straight into a page's template, with no element around it, keeps its rows
// as the container's own children: served, resumed, client-rendered and swapped in by navigation.

vi.setConfig({ testTimeout: 30_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');

const documentWith = (body: string) =>
	[
		"import type { Children } from '@markless/core';",
		"import { Html } from '@markless/router';",
		'export default function Document({ children }: { readonly children?: Children }) @{',
		'\t<Html>',
		'\t\t<head><meta charset="utf-8" /></head>',
		`\t\t${body}`,
		'\t</Html>',
		'}',
	].join('\n');

const rowsPage = [
	"import { state } from '@markless/core';",
	'export default function Rows() @{',
	"\tlet rows = state([{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }]);",
	'\tlet added = state(0);',
	"\tlet picked = state('none');",
	'\t<h2 data-page="rows">Rows</h2>',
	'\t<div data-controls>',
	'\t\t<output data-picked>{picked}</output>',
	'\t\t<button type="button" data-append onClick={() => { added++; rows = [...rows, { id: `n${added}`, label: `New ${added}` }]; }}>Append</button>',
	"\t\t<button type=\"button\" data-prepend onClick={() => rows = [{ id: 'z', label: 'Zeta' }, ...rows]}>Prepend</button>",
	'\t\t<button type="button" data-drop onClick={() => rows = rows.slice(1)}>Drop first</button>',
	'\t\t<button type="button" data-reverse onClick={() => rows = [...rows].reverse()}>Reverse</button>',
	'\t\t<a href="/other" data-nav="other">Other</a>',
	'\t</div>',
	'\t@for (const row of rows; key row.id) {',
	'\t\t<p data-row={row.id} onClick={() => picked = row.label}>{row.label}</p>',
	'\t}',
	'\t<p data-after>after the rows</p>',
	'}',
].join('\n');

// The rows close the page, so a new last row has no page element after it to go in front of.
const tailPage = [
	"import { state } from '@markless/core';",
	'export default function Tail() @{',
	"\tlet rows = state([{ id: 'a', label: 'Alpha' }]);",
	'\tlet added = state(0);',
	'\t<h2 data-page="tail">Tail</h2>',
	'\t<button type="button" data-append onClick={() => { added++; rows = [...rows, { id: `n${added}`, label: `New ${added}` }]; }}>Append</button>',
	'\t@for (const row of rows; key row.id) {',
	'\t\t<p data-row={row.id}>{row.label}</p>',
	'\t}',
	'}',
].join('\n');

// Served empty, so the server paints the @empty arm where the rows go.
const emptyPage = [
	"import { state } from '@markless/core';",
	'export default function Empty() @{',
	'\tlet rows = state([] as Array<{ id: string; label: string }>);',
	'\tlet added = state(0);',
	'\t<h2 data-page="empty">Empty</h2>',
	'\t<button type="button" data-append onClick={() => { added++; rows = [...rows, { id: `n${added}`, label: `New ${added}` }]; }}>Append</button>',
	'\t<button type="button" data-clear onClick={() => rows = []}>Clear</button>',
	'\t@for (const row of rows; key row.id) {',
	'\t\t<p data-row={row.id}>{row.label}</p>',
	'\t} @empty {',
	'\t\t<p data-empty>nothing yet</p>',
	'\t}',
	'\t<p data-after>after the rows</p>',
	'}',
].join('\n');

const otherPage = [
	'export default function Other() @{',
	'\t<main data-page="other"><a href="/" data-nav="home">Rows</a><a href="/branches" data-nav="branches">Branches</a><a href="/tail" data-nav="tail">Tail</a></main>',
	'}',
].join('\n');

const branchesPage = [
	"import { state } from '@markless/core';",
	'export default function Branches() @{',
	"\tlet mode = state('a');",
	'\t<h2 data-page="branches">Branches</h2>',
	"\t<button type=\"button\" data-flip onClick={() => mode = mode === 'a' ? 'b' : 'a'}>Flip</button>",
	"\t@if (mode === 'a') {",
	'\t\t<p data-if>if a</p>',
	'\t} @else {',
	'\t\t<p data-if>if b</p>',
	'\t}',
	'\t@switch (mode) {',
	"\t\t@case 'a': { <p data-switch>switch a</p> }",
	'\t\t@default: { <p data-switch>switch other</p> }',
	'\t}',
	'\t<p data-after>after the branches</p>',
	'}',
].join('\n');

const pages = {
	'pages/index.tsrx': rowsPage,
	'pages/other.tsrx': otherPage,
	'pages/branches.tsrx': branchesPage,
	'pages/tail.tsrx': tailPage,
	'pages/empty.tsrx': emptyPage,
};

type App = { readonly origin: string; readonly close: () => Promise<void> };

async function serve(name: string, files: Record<string, string>): Promise<App> {
	const root = await mkdtemp(join(tmpdir(), `markless-${name}-`));
	await cp(resolve(import.meta.dirname, '../fixtures/page-region-app'), root, {
		recursive: true,
	});
	await rm(join(root, 'src'), { recursive: true, force: true });
	for (const [file, source] of Object.entries(files)) await writeFile(join(root, file), source);
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	let server: BuiltServer;
	try {
		const builder = await createBuilder({
			root,
			configFile: false,
			logLevel: 'silent',
			plugins: [markless(), router()],
		} as Parameters<typeof createBuilder>[0]);
		await builder.buildApp();
		server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
			env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
		});
	} catch (error) {
		await rm(root, { recursive: true, force: true });
		throw error;
	}
	return {
		origin: server.origin,
		close: async () => {
			server.close();
			await rm(root, { recursive: true, force: true });
		},
	};
}

const apps: Record<
	'bare' | 'leading',
	{ app?: App; readonly before: readonly string[]; readonly after: readonly string[] }
> = {
	bare: { before: [], after: [] },
	leading: { before: ['header'], after: ['footer'] },
};

beforeAll(async () => {
	[apps.bare.app, apps.leading.app] = await Promise.all([
		serve('top-level-bare', {
			'document.tsrx': documentWith('<body>{children}</body>'),
			...pages,
		}),
		serve('top-level-leading', {
			'document.tsrx': documentWith(
				'<body><header data-site><a href="/other" data-nav="site-other">Other</a></header>{children}<footer data-site-footer>Site footer</footer></body>',
			),
			...pages,
		}),
	]);
}, 240_000);

afterAll(async () => {
	await Promise.all(Object.values(apps).map(({ app }) => app?.close()));
});

// The element children of body the way an author's CSS sees them, framework scripts aside.
const bodyShape = (page: Page) =>
	page.evaluate(() =>
		[...document.body.children]
			.filter((element) => element.localName !== 'script' && element.localName !== 'template')
			.map((element) => {
				const row = element.getAttribute('data-row');
				return row ? `row:${row}` : element.localName;
			}),
	);

// Every page node, rows included, sits between the page-start and page-end comments.
const rowsInsidePage = (page: Page) =>
	page.evaluate((endComment) => {
		const nodes = [...document.body.childNodes];
		const end = nodes.findIndex(
			(node) => node.nodeType === 8 && (node as Comment).data === endComment,
		);
		const after = document.querySelector('[data-after]');
		return [...document.querySelectorAll('[data-row]')].every(
			(row) =>
				row.parentElement === document.body &&
				(end < 0 || nodes.indexOf(row) < end) &&
				(!after ||
					Boolean(row.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING)),
		);
	}, PROTOCOL_CONTAINER_END_COMMENT);

const rowShape = (before: readonly string[], rows: readonly string[], after: readonly string[]) => [
	...before,
	'h2',
	'div',
	...rows.map((row) => `row:${row}`),
	'p',
	...after,
];

type Opened = { readonly page: Page; readonly errors: string[] };

async function open(browser: Browser, url: string): Promise<Opened> {
	const page = await browser.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await page.goto(url);
	return { page, errors };
}

const landedOn = (page: Page, name: string) =>
	page.waitForFunction(
		(expected) => document.querySelector('[data-page]')?.getAttribute('data-page') === expected,
		name,
	);

async function expectRows(
	page: Page,
	shape: { readonly before: readonly string[]; readonly after: readonly string[] },
	rows: readonly string[],
) {
	await expect.poll(() => bodyShape(page)).toEqual(rowShape(shape.before, rows, shape.after));
	expect(await rowsInsidePage(page)).toBe(true);
}

const pick = async (page: Page, row: string, label: string) => {
	await page.locator(`[data-row="${row}"]`).click();
	await expect.poll(() => page.locator('[data-picked]').textContent()).toBe(label);
};

async function editRows(
	page: Page,
	shape: { readonly before: readonly string[]; readonly after: readonly string[] },
) {
	await pick(page, 'b', 'Beta');
	await page.locator('[data-append]').click();
	await expectRows(page, shape, ['a', 'b', 'n1']);
	expect(await page.locator('[data-row="n1"]').textContent()).toBe('New 1');
	await page.locator('[data-prepend]').click();
	await expectRows(page, shape, ['z', 'a', 'b', 'n1']);
	await page.locator('[data-drop]').click();
	await expectRows(page, shape, ['a', 'b', 'n1']);
	await page.locator('[data-reverse]').click();
	await expectRows(page, shape, ['n1', 'b', 'a']);
	await pick(page, 'a', 'Alpha');
	await pick(page, 'n1', 'New 1');
	await page.locator('[data-append]').click();
	await expectRows(page, shape, ['n1', 'b', 'a', 'n2']);
	await pick(page, 'n2', 'New 2');
}

test('the server sends the top-level rows as the container children, before the page end', async () => {
	for (const { app } of Object.values(apps)) {
		const html = await (await fetch(`${app!.origin}/`)).text();
		const body = html.slice(html.indexOf('<body'));
		expect(
			[...body.matchAll(/data-row="(\w+)">(\w+)</g)].map((match) => match.slice(1)),
		).toEqual([
			['a', 'Alpha'],
			['b', 'Beta'],
		]);
		const end = body.indexOf(`<!--${PROTOCOL_CONTAINER_END_COMMENT}-->`);
		expect(end).toBeGreaterThan(body.indexOf('data-after'));
		expect(body.indexOf('data-row="b"')).toBeLessThan(body.indexOf('data-after'));
		expect(body).not.toContain('<div data-async-container');
	}
});

for (const [name, browserType] of [
	['chromium', chromium],
	['webkit', webkit],
] as ReadonlyArray<readonly [string, BrowserType]>) {
	describe(`top-level control flow (${name})`, () => {
		let browser: Browser;
		beforeAll(async () => {
			browser = await browserType.launch();
		});
		afterAll(async () => {
			await browser?.close();
		});

		for (const [layout, shape] of Object.entries(apps)) {
			test(`${layout}: served rows resume and follow appends, removals and reorders`, async () => {
				const { page, errors } = await open(browser, `${shape.app!.origin}/`);
				await expectRows(page, shape, ['a', 'b']);
				await editRows(page, shape);
				expect(errors).toEqual([]);
				await page.close();
			});

			test(`${layout}: a client render of the hash route renders and edits the rows`, async () => {
				const { page, errors } = await open(browser, `${shape.app!.origin}/other#/`);
				await landedOn(page, 'rows');
				await expectRows(page, shape, ['a', 'b']);
				await editRows(page, shape);
				expect(errors).toEqual([]);
				await page.close();
			});

			test(`${layout}: a fragment swap to the rows page renders and edits the rows`, async () => {
				const { page, errors } = await open(browser, `${shape.app!.origin}/other`);
				await landedOn(page, 'other');
				await page.locator('[data-nav="home"]').click();
				await landedOn(page, 'rows');
				await expectRows(page, shape, ['a', 'b']);
				await editRows(page, shape);
				await page.locator('[data-nav="other"]').click();
				await landedOn(page, 'other');
				await page.locator('[data-nav="home"]').click();
				await landedOn(page, 'rows');
				await expectRows(page, shape, ['a', 'b']);
				await page.locator('[data-reverse]').click();
				await expectRows(page, shape, ['b', 'a']);
				expect(errors).toEqual([]);
				await page.close();
			});

			test(`${layout}: rows that close the page grow inside it on every render`, async () => {
				const tail = (rows: readonly string[]) => [
					...shape.before,
					'h2',
					'button',
					...rows.map((row) => `row:${row}`),
					...shape.after,
				];
				for (const url of ['/tail', '/other#/tail']) {
					const { page, errors } = await open(browser, `${shape.app!.origin}${url}`);
					await landedOn(page, 'tail');
					await expect.poll(() => bodyShape(page)).toEqual(tail(['a']));
					await page.locator('[data-append]').click();
					await expect.poll(() => bodyShape(page)).toEqual(tail(['a', 'n1']));
					expect(await rowsInsidePage(page)).toBe(true);
					expect(errors).toEqual([]);
					await page.close();
				}
				const { page, errors } = await open(browser, `${shape.app!.origin}/other`);
				await page.locator('[data-nav="tail"]').click();
				await landedOn(page, 'tail');
				await page.locator('[data-append]').click();
				await expect.poll(() => bodyShape(page)).toEqual(tail(['a', 'n1']));
				expect(await rowsInsidePage(page)).toBe(true);
				expect(errors).toEqual([]);
				await page.close();
			});

			test(`${layout}: a top-level @empty arm swaps with the rows in place`, async () => {
				const empty = (middle: readonly string[]) => [
					...shape.before,
					'h2',
					'button',
					'button',
					...middle,
					'p',
					...shape.after,
				];
				for (const url of ['/empty', '/other#/empty']) {
					const { page, errors } = await open(browser, `${shape.app!.origin}${url}`);
					await landedOn(page, 'empty');
					await expect.poll(() => bodyShape(page)).toEqual(empty(['p']));
					expect(await page.locator('[data-empty]').count()).toBe(1);
					await page.locator('[data-append]').click();
					await expect.poll(() => bodyShape(page)).toEqual(empty(['row:n1']));
					expect(await page.locator('[data-empty]').count()).toBe(0);
					await page.locator('[data-clear]').click();
					await expect.poll(() => bodyShape(page)).toEqual(empty(['p']));
					expect(await page.locator('[data-empty]').count()).toBe(1);
					await page.locator('[data-append]').click();
					await expect.poll(() => bodyShape(page)).toEqual(empty(['row:n2']));
					expect(await rowsInsidePage(page)).toBe(true);
					expect(errors).toEqual([]);
					await page.close();
				}
			});

			test(`${layout}: top-level @if and @switch flip in place`, async () => {
				const { page, errors } = await open(browser, `${shape.app!.origin}/branches`);
				const texts = () =>
					page.evaluate(() =>
						[
							...document.querySelectorAll('[data-if], [data-switch], [data-after]'),
						].map((element) => element.textContent),
					);
				expect(await texts()).toEqual(['if a', 'switch a', 'after the branches']);
				await page.locator('[data-flip]').click();
				await expect.poll(texts).toEqual(['if b', 'switch other', 'after the branches']);
				await page.locator('[data-flip]').click();
				await expect.poll(texts).toEqual(['if a', 'switch a', 'after the branches']);
				expect(errors).toEqual([]);
				await page.close();
			});
		}
	});
}
