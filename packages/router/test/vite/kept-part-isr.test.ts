import { cp, mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { PROTOCOL_KEEP_SHARED_PREFIX } from '../../../serializer/src/protocol-keep.ts';
import { startBuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// A Nitro `vercel` build of two pages that share kept parts, with ISR on the plain fragment address of one page, served
// through Vercel's routing (test/support/vercel-sim.mjs): the address that names the kept parts is cached the same way.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 240_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
const simulator = resolve(import.meta.dirname, '../support/vercel-sim.mjs');
const cleanups: Array<() => Promise<void> | void> = [];
let browser: Browser;
let origin = '';
let routes: Array<{ readonly src?: string; readonly dest?: string }> = [];

beforeAll(async () => {
	const root = await mkdtemp(join(tmpdir(), 'markless-kept-part-isr-'));
	cleanups.push(() => rm(root, { recursive: true, force: true }));
	await cp(resolve(import.meta.dirname, '../fixtures/shared-layout-app'), root, { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	const builder = await createBuilder({
		root,
		configFile: false,
		logLevel: 'silent',
		nitro: {
			preset: 'vercel',
			routeRules: { '/_markless/fragment/beta': { isr: 60, prerender: true } },
		},
		plugins: [markless(), router()],
	} as Parameters<typeof createBuilder>[0]);
	await builder.buildApp();
	routes = JSON.parse(await readFile(join(root, '.vercel/output/config.json'), 'utf8')).routes;
	const server = await startBuiltServer(simulator, {
		env: { PATH: process.env.PATH, VERCEL_OUTPUT: join(root, '.vercel/output') },
	});
	cleanups.push(() => server.close());
	origin = server.origin;
	browser = await launchBrowser(chromium);
	cleanups.push(() => browser.close());
});

afterAll(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

test('the address naming kept parts reaches the same ISR function as the plain address, and leaves them out', async () => {
	const named = `/_markless/fragment/${PROTOCOL_KEEP_SHARED_PREFIX}a1${PROTOCOL_KEEP_SHARED_PREFIX}b2/beta`;
	const isr = (path: string) =>
		routes.find((route) => route.src && new RegExp(`^${route.src}$`).test(path))?.dest ?? '';
	expect(isr(named)).toContain('-isr?');
	expect(isr('/_markless/fragment/beta')).toContain('-isr?');

	const page = await browser.newPage();
	const errors: string[] = [];
	const answers: Array<{ readonly address: string; readonly body: Promise<string> }> = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	page.on('response', (response) => {
		const address = new URL(response.url()).pathname;
		if (address.endsWith('/beta') && address.startsWith('/_markless/fragment/'))
			answers.push({ address, body: response.text().catch(() => '') });
	});
	await page.goto(`${origin}/alpha`);
	await page.click('[data-top="beta"]');
	await page.waitForFunction(() => document.querySelector('[data-title]')?.textContent === 'Beta');
	const answer = answers.find((candidate) =>
		candidate.address.startsWith(`/_markless/fragment/${PROTOCOL_KEEP_SHARED_PREFIX}`),
	)!;
	expect(answer).toBeDefined();
	expect(await answer.body).not.toContain('Release notes');
	expect(await page.textContent('[data-banner] strong')).toBe('Release notes');
	expect(errors).toEqual([]);
	await page.close();
});
