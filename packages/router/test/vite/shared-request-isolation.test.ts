import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// An app-scoped shared value seeded from request data, rendered by overlapping requests on one built server.

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-shared-isolation-app-'));
	await cp(resolve(import.meta.dirname, '../fixtures/shared-isolation-app'), root, {
		recursive: true,
	});
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
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
});

afterAll(async () => {
	await browser?.close();
	await server?.close();
	if (root) await rm(root, { recursive: true, force: true });
});

const names = Array.from({ length: 24 }, (_, i) => `visitor${String(i).padStart(2, '0')}`);

const field = (html: string, attribute: string) =>
	new RegExp(`<[a-z0-9]+[^>]*\\s${attribute}[\\s>=][^>]*>([^<]*)<`).exec(html)?.[1];

const payload = (html: string) =>
	new RegExp(`<script type="markless/state">([\\s\\S]*?)</script>`).exec(html)?.[1] ?? '';

// Each render waits by its name's number (see the fixture's delayFor), so every render is suspended at its await while later ones run.
async function renderBatch(): Promise<Map<string, string>> {
	const pages = await Promise.all(
		names.map(async (name) => {
			const response = await fetch(`${server!.origin}/who/${name}`);
			expect(response.status).toBe(200);
			return [name, await response.text()] as const;
		}),
	);
	return new Map(pages);
}

function expectOnlyOwn(name: string, html: string) {
	expect(field(html, 'data-heading')).toBe(name);
	expect(field(html, 'data-greeting')).toBe(`hello ${name}/${name}`);
	expect(field(html, 'data-badge')).toBe(name);
	const state = payload(html);
	expect(state).toContain(JSON.stringify(name));
	for (const other of names) if (other !== name) expect(html).not.toContain(other);
}

test('overlapping renders each see only their own app-scoped shared value', async () => {
	const pages = await renderBatch();
	for (const [name, html] of pages) expectOnlyOwn(name, html);
});

test('a render that never seeds the value starts from the default after earlier requests', async () => {
	await renderBatch();
	const [anonymous, again] = await Promise.all([
		Promise.all(Array.from({ length: 8 }, () => fetch(`${server!.origin}/anon`).then((r) => r.text()))),
		renderBatch(),
	]);
	for (const html of anonymous) {
		expect(field(html, 'data-heading')).toBe('nobody');
		expect(field(html, 'data-greeting')).toBe('hello nobody');
		expect(field(html, 'data-badge')).toBe('nobody');
		for (const name of names) expect(html).not.toContain(name);
	}
	for (const [name, html] of again) expectOnlyOwn(name, html);
});

test('the browser resumes with the value its own request rendered, from the first frame', async () => {
	const name = names[7]!;
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await page.addInitScript(() => {
		const seen: string[] = [];
		(globalThis as { __badges?: string[] }).__badges = seen;
		new MutationObserver(() => {
			const badge = document.querySelector('[data-badge]')?.textContent;
			if (badge != null && seen.at(-1) !== badge) seen.push(badge);
		}).observe(document, { subtree: true, childList: true, characterData: true });
	});
	await page.goto(`${server!.origin}/who/${name}`);
	await expect.poll(() => page.evaluate(() => document.readyState)).toBe('complete');
	expect(await page.locator('[data-heading]').textContent()).toBe(name);
	expect(await page.locator('[data-greeting]').textContent()).toBe(`hello ${name}/${name}`);
	expect(await page.locator('[data-badge]').textContent()).toBe(name);
	expect(await page.evaluate(() => (globalThis as { __badges?: string[] }).__badges)).toEqual([name]);
	expect(errors).toEqual([]);
	await page.close();
});
