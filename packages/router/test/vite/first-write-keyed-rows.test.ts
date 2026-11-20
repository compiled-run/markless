import { cp, mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { buildFixture } from '../support/fixture-build.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// The first press after a server render and resume: the line right after a keyed-list write already sees the
// new rows in the DOM and in an array element handle bound in the rows, and the handle holds the rows only.

vi.setConfig({ testTimeout: 60_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
const roots: string[] = [];
let browser: Browser | undefined;

async function copyFixture(): Promise<string> {
	const root = await realpath(
		await mkdtemp(join(tmpdir(), 'markless-first-write-keyed-rows-app-')),
	);
	roots.push(root);
	await cp(resolve(import.meta.dirname, '../fixtures/first-write-keyed-rows-app'), root, {
		recursive: true,
	});
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await symlink(
		resolve(packagesRoot, 'router/node_modules/nitro'),
		join(root, 'node_modules/nitro'),
		'dir',
	);
	return root;
}

beforeAll(async () => {
	browser = await launchBrowser(chromium);
});

afterAll(async () => {
	await browser?.close();
	await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

// What the handler's line after the write reported on a fresh page's first press.
async function firstPress(origin: string, path: string, op: string): Promise<string> {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.addInitScript(() => {
		const seen: string[] = [];
		(globalThis as { seen?: string[] }).seen = seen;
		addEventListener('seen', (event) => seen.push((event as CustomEvent<string>).detail));
	});
	await page.goto(`${origin}${path}`);
	await page.click(`[data-op="${op}"]`);
	await page.waitForFunction(() => (globalThis as { seen?: string[] }).seen!.length === 1);
	const seen = await page.evaluate(() => (globalThis as { seen?: string[] }).seen![0]!);
	expect(errors).toEqual([]);
	await page.close();
	return seen;
}

const writes = [
	['add', 'dom [x,y,t2] handle [i:x,i:y,i:t2]'],
	['del', 'dom [y] handle [i:y]'],
	['move', 'dom [y,x] handle [i:y,i:x]'],
] as const;

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

	for (const kind of ['mdx', 'page'])
		describe(kind === 'mdx' ? 'an MDX island' : 'a page', () => {
			for (const collection of ['set', 'array', 'map'])
				for (const [op, seen] of writes)
					test(`a ${collection} in state, ${op}: the next line sees the rows in the DOM and in the handle`, async () => {
						expect(
							await firstPress(server!.origin, `/${kind}-${collection}-handle`, op),
						).toBe(seen);
					});

			test('a Set that starts empty, written by a component function', async () => {
				expect(await firstPress(server!.origin, `/${kind}-empty-set-handle`, 'add')).toBe(
					'dom [a] handle [i:a]',
				);
			});

			// The handler sits in a row of another list, as a pile of gems feeding a Set does.
			test('a write from a row handler of another list', async () => {
				expect(await firstPress(server!.origin, `/${kind}-gauntlet`, 'add')).toBe(
					'dom [red] handle [i:red]',
				);
			});

			// Rows that sit straight in an element beside other elements: the handle holds the rows, not their siblings.
			for (const [op, seen] of writes)
				test(`rows beside siblings, ${op}: the handle holds the rows only`, async () => {
					expect(await firstPress(server!.origin, `/${kind}-unwrapped`, op)).toBe(seen);
				});
		});
});
