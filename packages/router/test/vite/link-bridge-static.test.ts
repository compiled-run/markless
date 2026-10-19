import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { fragmentPageUrl } from '../../src/vite/fragment-navigation.ts';
import { startBuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// A built app whose middleware redirects every path that is not one of its pages, as a signed-in-only app does.

vi.setConfig({ testTimeout: 30_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
const REDIRECT_UNKNOWN_PATHS = `const pages = new Set(['/', '/other', '/slow', '/form']);

export default function request(http: import('@markless/router').MiddlewareHttpContext) {
	if (!pages.has(http.url.pathname)) return Response.redirect(new URL('/', http.url), 302);
}
`;

let root = '';
let origin = '';
let close: (() => void) | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-link-bridge-static-'));
	await cp(resolve(import.meta.dirname, '../fixtures/fragment-app'), root, { recursive: true });
	await mkdir(join(root, 'middleware'), { recursive: true });
	await writeFile(join(root, 'middleware/redirect.ts'), REDIRECT_UNKNOWN_PATHS);
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await symlink(
		resolve(packagesRoot, 'router/node_modules/nitro'),
		join(root, 'node_modules/nitro'),
		'dir',
	);
	const nodeEnv = process.env.NODE_ENV;
	process.env.NODE_ENV = 'production';
	try {
		const builder = await createBuilder({
			root,
			configFile: false,
			logLevel: 'silent',
			plugins: [markless(), router()],
		});
		await builder.buildApp();
	} finally {
		if (nodeEnv === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = nodeEnv;
	}
	const server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	origin = server.origin;
	close = () => server.close();
	browser = await launchBrowser(chromium);
}, 240_000);

afterAll(async () => {
	await browser?.close();
	close?.();
	if (root) await rm(root, { recursive: true, force: true });
});

async function linkBridgePath(): Promise<string> {
	const html = await (await fetch(origin)).text();
	const path = /data-markless-router-link-resumer>import b from"([^"]+)"/.exec(html)?.[1];
	if (!path) throw new Error('the built page carries no link bridge module');
	return path;
}

test('the link bridge is a static file in the client output, served past the redirecting middleware', async () => {
	const path = await linkBridgePath();
	expect(path).toMatch(/^\/_markless\/links\/[0-9a-z]+\.js$/);
	const written = await readFile(join(root, '.output/public', path), 'utf8');
	const response = await fetch(origin + path, { redirect: 'manual' });
	expect(response.status).toBe(200);
	expect(response.headers.get('content-type')).toMatch(/javascript/);
	expect(response.headers.get('cache-control')).toContain('immutable');
	expect(await response.text()).toBe(written);
});

test('a link click still swaps the page in place', async () => {
	const page = await browser!.newPage();
	const documents: string[] = [];
	const fragments: string[] = [];
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	page.on('request', (request) => {
		const url = new URL(request.url());
		const fragment = fragmentPageUrl(url);
		if (request.resourceType() === 'document') documents.push(url.pathname);
		else if (fragment) fragments.push(fragment.pathname);
	});
	await page.goto(origin);
	await page.locator('[data-increment]').waitFor();
	await page.locator('[data-nav="other"]').click();
	await page.waitForFunction(
		() => document.querySelector('[data-page]')?.getAttribute('data-page') === 'other',
	);
	expect(page.url()).toBe(`${origin}/other`);
	expect(documents).toEqual(['/']);
	expect(fragments).toContain('/other');
	expect(errors).toEqual([]);
	await page.close();
});
