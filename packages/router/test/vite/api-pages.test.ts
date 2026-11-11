import { createServer, type Server } from 'node:http';
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
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';
import { buildFixture } from '../support/fixture-build.ts';

// A site whose content lives at /api/: page files in pages/api/ are pages, the files in api/
// stay endpoints, and the build stops only when one address is answered by both. An endpoint
// refuses a write the browser says another site sent.

vi.setConfig({ testTimeout: 30_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
const roots: string[] = [];
let server: BuiltServer | undefined;
let browser: Browser | undefined;
let otherSite: Server | undefined;

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
	await buildFixture({ root });
	server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	browser = await launchBrowser(chromium);
}, 120_000);

afterAll(async () => {
	await browser?.close();
	otherSite?.close();
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

test('an endpoint refuses a write the browser marks cross-site and accepts its own site and servers', async () => {
	const origin = server!.origin;
	const send = (method: string, headers: Record<string, string> = {}, path = '/api/x') =>
		fetch(`${origin}${path}`, { method, headers });
	for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
		for (const site of ['cross-site', 'same-site']) {
			const refused = await send(method, { 'sec-fetch-site': site, origin: 'https://evil.example' });
			expect(refused.status).toBe(403);
			expect((await refused.text()).startsWith('MARKLESS_ROUTER_CROSS_SITE_WRITE_REFUSED: ')).toBe(true);
		}
		expect((await send(method, { 'sec-fetch-site': 'same-origin', origin })).status).toBe(200);
		expect((await send(method, { 'sec-fetch-site': 'none' })).status).toBe(200);
		expect((await send(method, { origin: 'https://evil.example' })).status).toBe(403);
		expect((await send(method, { origin })).status).toBe(200);
		expect((await send(method)).status).toBe(200);
	}
	for (const method of ['GET', 'HEAD', 'OPTIONS'])
		expect(
			(await send(method, { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' })).status,
		).toBe(200);
});

test('a cached endpoint refuses a cross-site write too', async () => {
	const accepted = await fetch(`${server!.origin}/api/tally`, { method: 'POST' });
	expect(accepted.status).toBe(200);
	const refused = await fetch(`${server!.origin}/api/tally`, {
		method: 'POST',
		headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' },
	});
	expect(refused.status).toBe(403);
});

test('a form on one of the app pages posts to an endpoint with JavaScript off', async () => {
	const context = await browser!.newContext({ javaScriptEnabled: false });
	const tab = await context.newPage();
	await tab.goto(`${server!.origin}/api/contact`);
	const [response] = await Promise.all([
		tab.waitForResponse((response) => response.request().method() === 'POST'),
		tab.getByRole('button', { name: 'Send' }).click(),
	]);
	expect(response.status()).toBe(200);
	expect(await response.json()).toEqual({ posted: true });
	await context.close();
});

test('a form on another site that posts to an endpoint is refused', async () => {
	const target = `${server!.origin}/api/contact`;
	otherSite = createServer((_request, response) => {
		response.setHeader('content-type', 'text/html');
		response.end(
			`<form method="post" action="${target}"><input name="note" value="x"><button>Send</button></form>`,
		);
	});
	await new Promise<void>((listening) => otherSite!.listen(0, 'localhost', listening));
	const { port } = otherSite.address() as { port: number };
	const tab = await browser!.newPage();
	await tab.goto(`http://localhost:${port}/`);
	const [response] = await Promise.all([
		tab.waitForResponse((response) => response.url() === target),
		tab.getByRole('button', { name: 'Send' }).click(),
	]);
	expect((await response.request().allHeaders())['sec-fetch-site']).toBe('cross-site');
	expect(response.status()).toBe(403);
	await tab.close();
});
