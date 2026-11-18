import { cp, mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { buildFixture } from '../support/fixture-build.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// A handler opens an @if and closes it as soon as the opened panel has rendered. The panel's async value must not
// run with the value that closed it, even when its code is already on the page.

vi.setConfig({ testTimeout: 60_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let browser: Browser | undefined;
let server: BuiltServer | undefined;

type ArmClose = {
	readonly subjectLog: Array<number | null>;
	readonly labelLog: number[];
	waitingFor(id: number): number;
	settleAll(id: number): void;
};

beforeAll(async () => {
	root = await realpath(await mkdtemp(join(tmpdir(), 'markless-arm-close-async-app-')));
	await cp(resolve(import.meta.dirname, '../fixtures/arm-close-async-app'), root, { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await symlink(resolve(packagesRoot, 'router/node_modules/nitro'), join(root, 'node_modules/nitro'), 'dir');
	await buildFixture({ root });
	server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	browser = await launchBrowser(chromium);
}, 240_000);

afterAll(async () => {
	await browser?.close();
	await server?.close();
	if (root) await rm(root, { recursive: true, force: true });
});

test('closing an @if right after it opens runs nothing with the closing value', async () => {
	const tab = await browser!.newPage();
	const errors: string[] = [];
	tab.on('pageerror', (error) => errors.push(error.message));
	await tab.goto(`${server!.origin}/`);
	await tab.click('[data-open-then-close]');
	await tab.waitForFunction(() => ((globalThis as { armClose?: ArmClose }).armClose?.labelLog.length ?? 0) > 0);
	// The reopen's pass runs after the one the close started, so a run that close let through has started by then.
	await tab.click('[data-open-one]');
	await tab.waitForFunction(() => ((globalThis as { armClose?: ArmClose }).armClose?.waitingFor(1) ?? 0) > 0);
	await tab.evaluate(() => (globalThis as { armClose?: ArmClose }).armClose!.settleAll(1));
	await tab.waitForFunction(() => document.querySelector('[data-name]')?.textContent === 'subject 1 round 0');
	expect(await tab.evaluate(() => (globalThis as { armClose?: ArmClose }).armClose!.subjectLog)).toEqual([1]);
	expect(errors).toEqual([]);
	await tab.close();
});
