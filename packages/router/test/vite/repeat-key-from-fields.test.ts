import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { buildFixture } from '../support/fixture-build.ts';

// A @for keyed by a string joined from the row's own fields keeps each row's elements, and a row component's state,
// with its key when rows move (as fresh objects), drop out or arrive after a server render.
const packagesRoot = resolve(import.meta.dirname, '../../..');
let root: string;
let browser: Browser;
let app: BuiltServer;

const files: Record<string, string> = {
	'package.json': '{ "type": "module" }\n',
	'vite.config.ts': `import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';

export default { plugins: [markless(), router()] };
`,
	'document.tsrx': `import type { Children } from '@markless/core';
import { Html } from '@markless/router';

export default function Document({ children }: { readonly children?: Children }) @{
	<Html>
		<head>
			<meta charset="utf-8" />
		</head>
		<body>{children}</body>
	</Html>
}
`,
	'pages/stock.tsrx': `import { state } from '@markless/core';

export default function Stock() @{
	let bins = state([
		{ sku: 'tee', variant: { code: 's' } },
		{ sku: 'tee', variant: { code: 'm' } },
		{ sku: 'cap', variant: { code: 'm' } },
	]);
	<section>
		<button type="button" data-rotate onClick={() => (bins = [...bins.slice(1), bins[0]!].map((bin) => ({ ...bin, variant: { ...bin.variant } })))}>rotate</button>
		<button type="button" data-restock onClick={() => bins.unshift({ sku: 'sock', variant: { code: 'l' } })}>restock</button>
		<table>
			<tbody>
				@for (const { sku, variant } of bins; index at; key sku + '/' + variant.code) {
					<tr>
						<td>{sku + '/' + variant.code}</td>
						<td><button type="button" onClick={() => bins.splice(at, 1)}>{'drop ' + sku + '/' + variant.code}</button></td>
					</tr>
				}
			</tbody>
		</table>
	</section>
}
`,
	'lib/Tally.tsrx': `import { state } from '@markless/core';

export default function Tally({ label }: { readonly label: string }) @{
	let taps = state(0);
	<button type="button" onClick={() => taps++}>{label}: {taps}</button>
}
`,
	'pages/seats.tsrx': `import { state } from '@markless/core';
import Tally from '../lib/Tally.tsrx';

export default function Seats() @{
	let seats = state([
		{ row: 'b', n: 2 },
		{ row: 'b', n: 1 },
		{ row: 'a', n: 2 },
	]);
	<main>
		<button type="button" data-flip onClick={() => (seats = seats.map((seat) => ({ ...seat })).reverse())}>flip</button>
		<ol>
			@for (const seat of seats; key \`\${seat.row}\${seat.n}\`) {
				<li><Tally label={seat.row + seat.n} /></li>
			}
		</ol>
	</main>
}
`,
	'pages/shelf.tsrx': `import { state } from '@markless/core';

export default function Shelf() @{
	let open = state(false);
	let books = state([
		{ shelf: 3, title: 'Dune' },
		{ shelf: 1, title: 'Emma' },
	]);
	<div>
		<button type="button" data-open onClick={() => (open = !open)}>shelf</button>
		<button type="button" data-sort onClick={() => (books = [...books].sort((a, b) => a.shelf - b.shelf).map((book) => ({ ...book })))}>sort</button>
		@if (open) {
			<ul>
				@for (const book of books; key \`\${book.shelf}|\${book.title}\`) {
					<li><span>{book.title}</span></li>
				}
			</ul>
		}
	</div>
}
`,
};

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-repeat-key-from-fields-'));
	for (const [path, source] of Object.entries(files)) {
		await mkdir(dirname(join(root, path)), { recursive: true });
		await writeFile(join(root, path), source);
	}
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await symlink(join(packagesRoot, 'router/node_modules/nitro'), join(root, 'node_modules/nitro'), 'dir');
	const nodeEnv = process.env.NODE_ENV;
	process.env.NODE_ENV = 'production';
	try {
		await buildFixture({ root, configFile: join(root, 'vite.config.ts') });
	} finally {
		if (nodeEnv === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = nodeEnv;
	}
	app = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	browser = await launchBrowser(chromium);
}, 240_000);

afterAll(async () => {
	await app?.close();
	await browser?.close();
	if (root) await rm(root, { recursive: true, force: true });
}, 60_000);

async function visit(path: string, run: (page: Page) => Promise<void>) {
	const page = await browser.newPage({ baseURL: app.origin });
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	try {
		expect((await page.goto(path))?.status()).toBe(200);
		await run(page);
		expect(errors).toEqual([]);
	} finally {
		await page.close();
	}
}

// Each row's label, and whether its element is the one it had when marked.
function rowsOf(page: Page, selector: string) {
	return page.evaluate(
		(selector) =>
			[...document.querySelectorAll<HTMLElement & { mark?: string }>(selector)].map((row) => {
				const label = row.firstElementChild!.textContent!;
				return row.mark === undefined ? label : `${label}${row.mark === label ? '' : ` (was ${row.mark})`} kept`;
			}),
		selector,
	);
}

function mark(page: Page, selector: string) {
	return page.evaluate((selector) => {
		for (const row of document.querySelectorAll<HTMLElement & { mark?: string }>(selector))
			row.mark = row.firstElementChild!.textContent!;
	}, selector);
}

test('rows keyed by a + join of destructured fields keep their elements as they move, drop and arrive', async () => {
	await visit('/stock', async (page) => {
		const rows = () => rowsOf(page, 'tbody tr');
		expect(await rows()).toEqual(['tee/s', 'tee/m', 'cap/m']);
		await mark(page, 'tbody tr');

		await page.click('[data-rotate]');
		await expect.poll(rows).toEqual(['tee/m kept', 'cap/m kept', 'tee/s kept']);

		await page.getByRole('button', { name: 'drop cap/m' }).click();
		await expect.poll(rows).toEqual(['tee/m kept', 'tee/s kept']);

		await page.click('[data-restock]');
		await expect.poll(rows).toEqual(['sock/l', 'tee/m kept', 'tee/s kept']);

		await page.getByRole('button', { name: 'drop tee/s' }).click();
		await expect.poll(rows).toEqual(['sock/l', 'tee/m kept']);
	});
});

test("a row component keyed by a template literal of the row's fields keeps its state when the rows are reversed", async () => {
	await visit('/seats', async (page) => {
		const tallies = () => page.locator('ol button').allTextContents();
		expect(await tallies()).toEqual(['b2: 0', 'b1: 0', 'a2: 0']);
		await page.getByRole('button', { name: 'b1: 0' }).click();
		await page.getByRole('button', { name: 'b1: 1' }).click();
		await page.getByRole('button', { name: 'a2: 0' }).click();
		await expect.poll(tallies).toEqual(['b2: 0', 'b1: 2', 'a2: 1']);
		await mark(page, 'ol li');

		await page.click('[data-flip]');
		await expect.poll(tallies).toEqual(['a2: 1', 'b1: 2', 'b2: 0']);
		expect(await rowsOf(page, 'ol li')).toEqual(['a2: 1 kept', 'b1: 2 kept', 'b2: 0 kept']);
	});
});

test('rows a key template keys, first built in the browser when their @if opens, keep their elements when sorted', async () => {
	await visit('/shelf', async (page) => {
		const rows = () => rowsOf(page, 'ul li');
		expect(await rows()).toEqual([]);
		await page.click('[data-open]');
		await expect.poll(rows).toEqual(['Dune', 'Emma']);
		await mark(page, 'ul li');

		await page.click('[data-sort]');
		await expect.poll(rows).toEqual(['Emma kept', 'Dune kept']);
	});
});
