import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';
import { buildFixture } from '../support/fixture-build.ts';

// The kept-late-handler app as a production build: its pages run the lean dispatch paths a dev server does not.

vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;
const LONG_DEADLINE_MS = 10 * 60_000;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-kept-late-handler-built-'));
	await cp(resolve(import.meta.dirname, '../fixtures/kept-late-handler-app'), root, { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await buildFixture({ root });
	server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	browser = await launchBrowser(chromium);
});

afterAll(async () => {
	await browser?.close();
	await server?.close();
	if (root) await rm(root, { recursive: true, force: true });
});

// The router's swap deadline, set on its config as the page creates it.
async function swapDeadline(page: Page, ms: number): Promise<void> {
	await page.addInitScript((deadline) => {
		let state: { config: { swapDeadlineMs: number } } | undefined;
		Object.defineProperty(document, '__marklessFragmentNav', {
			configurable: true,
			get: () => state,
			set: (next: typeof state) => {
				if (next) next.config.swapDeadlineMs = deadline;
				state = next;
			},
		});
	}, ms);
}

test('a lean handler whose returned promise is still out does not hold back the link click after it', async () => {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await swapDeadline(page, LONG_DEADLINE_MS);
	let asked!: () => void;
	const sent = new Promise<void>((done) => (asked = done));
	await page.route(
		(url) => url.pathname === '/hold',
		() => asked(),
	);
	await page.goto(`${server!.origin}/lean`);
	await page.waitForLoadState('load');
	await page.click('[data-hold]');
	await sent;
	// The lean path ran the handler: no runtime started.
	expect(
		await page.evaluate(
			() =>
				!!(
					document.querySelector('[data-hold]')!.closest('[data-async-container]') as Element & {
						__asyncResumeRuntimeStarted?: boolean;
					}
				).__asyncResumeRuntimeStarted,
		),
	).toBe(false);
	await page.click('[data-nav="reference"]');
	await page.waitForFunction(() => document.querySelector('[data-title]')?.textContent === 'Reference page');
	expect(new URL(page.url()).pathname).toBe('/reference');
	expect(errors).toEqual([]);
	await page.unrouteAll({ behavior: 'ignoreErrors' });
	await page.close();
});
