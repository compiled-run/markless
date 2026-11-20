import { cp, mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { buildFixture } from '../support/fixture-build.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// First press after a server render and resume: the line after a keyed-list write sees exactly the rows on screen.

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

// What the handler's line after the write reported on the last of a fresh page's presses.
async function firstPress(origin: string, path: string, ops: string): Promise<string> {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.addInitScript(() => {
		const seen: string[] = [];
		(globalThis as { seen?: string[] }).seen = seen;
		addEventListener('seen', (event) => seen.push((event as CustomEvent<string>).detail));
	});
	await page.goto(`${origin}${path}`);
	const presses = ops.split(',');
	for (const [index, op] of presses.entries()) {
		await page.click(`[data-op="${op}"]`);
		await expect
			.poll(
				async () =>
					errors.join() ||
					(await page.evaluate(() => (globalThis as { seen?: string[] }).seen!.length)),
			)
			.toBe(index + 1);
		// A later press reads what the earlier one settled to.
		if (index < presses.length - 1) await page.waitForLoadState('networkidle');
	}
	const seen = await page.evaluate(() => (globalThis as { seen?: string[] }).seen!.at(-1)!);
	await page.close();
	return seen;
}

const cases: ReadonlyArray<readonly [string, string, string, string]> = [
	// The handler sits in a row of another list, in an MDX island: late before #726.
	[
		"a write from another list's row handler, MDX island",
		'/mdx-gauntlet',
		'add',
		'dom [red] handle [i:red]',
	],
	[
		'the reported repro: a Set that starts empty, MDX island',
		'/mdx-empty-set-handle',
		'add',
		'dom [a] handle [i:a]',
	],
	[
		'rows before siblings, add, MDX island',
		'/mdx-unwrapped',
		'add',
		'dom [x,y,t2] handle [i:x,i:y,i:t2]',
	],
	['rows before siblings, add', '/page-unwrapped', 'add', 'dom [x,y,t2] handle [i:x,i:y,i:t2]'],
	['rows before siblings, delete', '/page-unwrapped', 'del', 'dom [y] handle [i:y]'],
	['rows before siblings, reorder', '/page-unwrapped', 'move', 'dom [y,x] handle [i:y,i:x]'],
	['rows between siblings', '/page-between', 'add', 'dom [x,y,t2] handle [i:x,i:y,i:t2]'],
	['rows after an @if, add', '/page-from-end', 'add', 'dom [x,y,t2] handle [i:x,i:y,i:t2]'],
	['rows after an @if, delete', '/page-from-end', 'del', 'dom [y] handle [i:y]'],
	['a list in a closed @if arm', '/page-arm-list', 'peek', 'dom [] handle []'],
	// The handle lists the rows in screen order, whatever order the write leaves the keys in.
	['a row put in front', '/page-order', 'unshift', 'dom [w,x,y] handle [i:w,i:x,i:y]'],
	['a row put in the middle', '/page-order', 'splice', 'dom [x,m,y] handle [i:x,i:m,i:y]'],
	['rows reversed in place', '/page-order', 'reverse', 'dom [y,x] handle [i:y,i:x]'],
	['rows sorted in place', '/page-order', 'sort', 'dom [y,x] handle [i:y,i:x]'],
	['rows reordered by one assignment', '/page-order', 'assign', 'dom [y,x] handle [i:y,i:x]'],
	[
		'a list in an @if arm, once a write has opened it',
		'/page-arm-list',
		'open,peek',
		'dom [x,y] handle [li:x,li:y]',
	],
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

	for (const [name, path, op, seen] of cases)
		test(name, async () => {
			expect(await firstPress(server!.origin, path, op)).toBe(seen);
		});
});
