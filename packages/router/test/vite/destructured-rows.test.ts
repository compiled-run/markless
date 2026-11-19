import { cp, mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { buildFixture } from '../support/fixture-build.ts';
import { startFixtureDev } from '../support/fixture-dev.ts';
import { startBuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// A row whose loop variable is destructured (`const [face, n] of counts`) hands its parts to a handler, and the
// handler's write reaches the page on the first click after a server render.

vi.setConfig({ testTimeout: 60_000, hookTimeout: 240_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
const roots: string[] = [];
let browser: Browser | undefined;

async function copyFixture(): Promise<string> {
	const root = await realpath(await mkdtemp(join(tmpdir(), 'markless-destructured-rows-app-')));
	roots.push(root);
	await cp(resolve(import.meta.dirname, '../fixtures/destructured-rows-app'), root, { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await symlink(resolve(packagesRoot, 'router/node_modules/nitro'), join(root, 'node_modules/nitro'), 'dir');
	return root;
}

beforeAll(async () => {
	browser = await launchBrowser(chromium);
});

afterAll(async () => {
	await browser?.close();
	await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

const takenBack = { clicks: ['up 2', 'party 1', 'up 1'], seen: ['up 2|party 1', 'up 1|party 1', 'up 1', ''] };

const pages = [
	{ path: '/map', source: 'a Map in state', ...takenBack },
	{ path: '/island', source: 'a Map in state, inside an MDX page', ...takenBack },
	{ path: '/inline', source: 'a Map in state, rows in the page itself', ...takenBack },
	{ path: '/tuples', source: 'an array of tuples', ...takenBack },
	{
		path: '/entries',
		source: 'Object.entries of an object',
		clicks: ['party 1', 'up 2'],
		seen: ['up 2|party 1 #', 'up 2|party 1 #party', 'up 2|party 1 #party,up'],
	},
	{ path: '/set', source: 'a Set', clicks: ['party', 'up'], seen: ['up|party', 'up', ''] },
] as const;

// The row labels, then what the page wrote down, after each click.
async function clicks(origin: string, path: string, labels: readonly string[]): Promise<string[]> {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`${origin}${path}`);
	const shown = () =>
		page.evaluate(() => {
			const rows = [...document.querySelectorAll('[data-rows] button')].map((row) => row.textContent).join('|');
			const taken = document.querySelector('[data-taken]');
			return taken ? `${rows} #${taken.textContent}` : rows;
		});
	const seen = [await shown()];
	for (const label of labels) {
		const before = seen.at(-1)!;
		const row = page.getByRole('button', { name: label, exact: true });
		if ((await row.count()) !== 1) break;
		await row.click();
		await expect.poll(shown, { timeout: 2_000 }).not.toBe(before).catch(() => {});
		seen.push(await shown());
	}
	expect(errors).toEqual([]);
	await page.close();
	return seen;
}

function suite(start: () => Promise<{ readonly origin: string; close(): unknown }>) {
	let server: { readonly origin: string; close(): unknown } | undefined;
	beforeAll(async () => {
		server = await start();
	});
	afterAll(() => server?.close());

	for (const { path, source, clicks: labels, seen } of pages)
		test(`rows over ${source}: each click after a server render reaches the page`, async () => {
			expect(await clicks(server!.origin, path, labels)).toEqual(seen);
		});
}

describe('production build', () => {
	suite(async () => {
		const root = await copyFixture();
		await buildFixture({ root });
		return startBuiltServer(join(root, '.output/server/index.mjs'), {
			env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
		});
	});
});

describe('dev server', () => {
	suite(async () => startFixtureDev(await copyFixture()));
});
