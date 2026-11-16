import { cp, mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { buildFixture } from '../support/fixture-build.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// A write has reached the DOM by the time the code that wrote it returns, the page's first write included, so a
// view transition's "after" snapshot or a layout read right after the write sees the new page. Production only:
// the dev server fetches each module on first use, so its first write still lands after the handler.

vi.setConfig({ testTimeout: 60_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
const roots: string[] = [];
let browser: Browser | undefined;

async function copyFixture(): Promise<string> {
	const root = await realpath(await mkdtemp(join(tmpdir(), 'markless-first-write-sync-app-')));
	roots.push(root);
	await cp(resolve(import.meta.dirname, '../fixtures/first-write-sync-app'), root, { recursive: true });
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

type Seen = { readonly dealt: number[]; readonly snapshots: string[] };

// What each of three presses saw: the rows right after its write, and a view transition's "after" snapshot.
async function seenAfterWrites(origin: string, path: string, rows: string): Promise<Seen> {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.addInitScript(() => {
		const seen: Seen = { dealt: [], snapshots: [] };
		(globalThis as { seen?: Seen }).seen = seen;
		addEventListener('dealt', (event) => seen.dealt.push((event as CustomEvent<number>).detail));
		addEventListener('snapshot', (event) => seen.snapshots.push((event as CustomEvent<string>).detail));
	});
	await page.goto(`${origin}${path}`);
	const served = await page.evaluate((selector) => document.querySelectorAll(selector).length, rows);
	for (let press = 1; press <= 3; press++) {
		await page.click('[data-deal]');
		await page.waitForFunction(
			([selector, count, before]) =>
				document.querySelectorAll(selector).length === count &&
				(globalThis as { seen?: Seen }).seen!.dealt.length === count - before,
			[rows, served + press, served] as const,
		);
	}
	await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
	const seen = await page.evaluate(() => (globalThis as { seen?: Seen }).seen!);
	expect(errors).toEqual([]);
	await page.close();
	return seen;
}

const pages: ReadonlyArray<{ readonly path: string; readonly rows: string; readonly seen: Seen }> = [
	{
		path: '/',
		rows: 'ol > li',
		seen: { dealt: [4, 5, 6], snapshots: ['4 4 cards false', '5 5 cards false', '6 6 cards true'] },
	},
	{ path: '/direct', rows: 'ol > li', seen: { dealt: [2, 3, 4], snapshots: [] } },
	{ path: '/plain', rows: 'ol > li', seen: { dealt: [2, 3, 4], snapshots: [] } },
	{ path: '/counted', rows: 'ul > li', seen: { dealt: [2, 3, 4], snapshots: [] } },
];

describe('production build', () => {
	let server: BuiltServer | undefined;
	beforeAll(async () => {
		const root = await copyFixture();
		await buildFixture({ root });
		server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
			env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
		});
	}, 240_000);
	afterAll(() => server?.close());

	for (const { path, rows, seen } of pages)
		test(`${path}: every write, the first included, has reached the page when the handler returns`, async () => {
			expect(await seenAfterWrites(server!.origin, path, rows)).toEqual(seen);
		});
});
