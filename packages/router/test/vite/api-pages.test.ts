import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { fragmentPageUrl } from '../../src/vite/fragment-navigation.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';

// A site whose content lives at /api/: page files in pages/api/ are pages, the files in api/
// stay endpoints, and the build stops only when one address is answered by both.

vi.setConfig({ testTimeout: 30_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
const roots: string[] = [];
let server: BuiltServer | undefined;
let browser: Browser | undefined;

async function app(files: Record<string, string> = {}): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'markless-api-pages-'));
	roots.push(root);
	await cp(resolve(import.meta.dirname, '../fixtures/api-page-app'), root, { recursive: true });
	for (const [file, source] of Object.entries(files)) await writeFile(join(root, file), source);
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

const build = async (root: string) =>
	(
		await createBuilder({
			root,
			configFile: false,
			logLevel: 'silent',
			plugins: [markless(), router()],
		})
	).buildApp();

beforeAll(async () => {
	const root = await app();
	await build(root);
	server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
	await browser?.close();
	server?.close();
	await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

test('a page in pages/api/ answers /api while the endpoints in api/ keep answering', async () => {
	const page = await fetch(`${server!.origin}/api`);
	expect(page.status).toBe(200);
	expect(page.headers.get('content-type')).toContain('text/html');
	expect(await page.text()).toContain('<h1>API reference</h1>');
	expect(await (await fetch(`${server!.origin}/api/x`)).json()).toEqual({ endpoint: 'x' });
	expect(await (await fetch(`${server!.origin}/api/contact`)).text()).toContain(
		'data-page="contact"',
	);
	const posted = await fetch(`${server!.origin}/api/contact`, { method: 'POST' });
	expect(await posted.json()).toEqual({ posted: true });
	expect((await fetch(`${server!.origin}/api/missing`)).status).toBe(404);
});

test('a link to a page under /api navigates by fragment and the page resumes', async () => {
	const tab = await browser!.newPage();
	const errors: string[] = [];
	const requests: string[] = [];
	tab.on('pageerror', (error) => errors.push(String(error)));
	tab.on('request', (request) => {
		const requested = new URL(request.url());
		const fragment = fragmentPageUrl(requested);
		requests.push(`${(fragment ?? requested).pathname}${fragment ? ' fragment' : ''}`);
	});
	await tab.goto(`${server!.origin}/`);
	await tab.locator('[data-nav="api"]').click();
	await tab.waitForSelector('[data-page="api"]');
	await tab.locator('[data-open]').click();
	await expect.poll(() => tab.locator('[data-opened]').textContent()).toBe('1');
	expect(requests).toContain('/api fragment');
	expect(requests).not.toContain('/api');
	expect(errors).toEqual([]);
	await tab.close();
});

test('the build stops when a page and an endpoint answer one address', async () => {
	const root = await app({
		'api/index.ts': 'export default function index() {\n\treturn Response.json({});\n}\n',
	});
	await expect(build(root)).rejects.toThrow(
		'Route conflict: /api is answered by both a page and an endpoint:\n- pages/api/index.tsrx\n- api/index.ts',
	);
});
