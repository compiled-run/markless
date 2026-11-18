import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'pathe';
import { chromium } from '@playwright/test';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';
import { startBuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { FRAGMENT_REGION_END, fragmentRequestUrl } from '../../src/vite/fragment-navigation.ts';
import { buildFixture } from '../support/fixture-build.ts';

// A built router app whose pages read the server-only `http` prop, plus the app files the "Load data for a page" docs show.

vi.setConfig({ testTimeout: 30_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
const dataDocs = resolve(packagesRoot, '../website/pages/router/data.mdx');
const roots: string[] = [];
let origin = '';
let close: (() => void) | undefined;

async function fixtureCopy(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'markless-page-http-app-'));
	roots.push(root);
	await cp(resolve(import.meta.dirname, '../fixtures/page-http-app'), root, { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await symlink(
		resolve(packagesRoot, 'router/node_modules/nitro'),
		join(root, 'node_modules/nitro'),
		'dir',
	);
	await symlink(
		resolve(packagesRoot, '../node_modules/vite-plus'),
		join(root, 'node_modules/vite-plus'),
		'dir',
	);
	for (const [file, source] of await docsAppFiles()) {
		await mkdir(dirname(join(root, file)), { recursive: true });
		await writeFile(join(root, file), source);
	}
	return root;
}

// Every titled fence outside a <Code> playground on the docs page is a file of the app it describes.
async function docsAppFiles(): Promise<Map<string, string>> {
	const files = new Map<string, string>();
	const lines = (await readFile(dataDocs, 'utf8')).split('\n');
	let playground = false;
	for (let at = 0; at < lines.length; at++) {
		const line = lines[at]!.trim();
		if (line.startsWith('<Code')) playground = true;
		if (line === '</Code>') playground = false;
		const title = /^```\w+ title="([^"]+)"$/.exec(line)?.[1];
		if (!title || playground) continue;
		const body: string[] = [];
		for (at++; lines[at]!.trim() !== '```'; at++) body.push(lines[at]!);
		expect(files.has(title), `two fences on the docs page are titled ${title}`).toBe(false);
		files.set(title, `${body.join('\n')}\n`);
	}
	return files;
}

async function build(root: string): Promise<void> {
	await buildFixture({
		root,
		configFile: join(root, 'vite.config.ts'),
	});
}

beforeAll(async () => {
	const root = await fixtureCopy();
	await build(root);
	const server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	origin = server.origin;
	close = () => server.close();
}, 240_000);

afterAll(async () => {
	close?.();
	await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

test('a page for a missing record answers 404 with its own body and headers', async () => {
	const response = await fetch(`${origin}/invoices/missing`, {
		headers: { cookie: 'session=top-secret' },
	});
	const html = await response.text();

	expect(response.status).toBe(404);
	expect(response.headers.get('x-invoice')).toBe('missing');
	expect(response.headers.get('cache-control')).toBe('no-store');
	expect(html).toContain('No invoice missing');
	expect(html).toContain('<p data-request-id="">mw-1</p>');
	const payload = /<script type="markless\/state">(.*?)<\/script>/.exec(html)?.[1] ?? '';
	expect(payload).toContain('["params",');
	expect(payload).not.toContain('"http"');
	expect(html).not.toContain('top-secret');
});

test('a page for a present record answers 200 with the header it set', async () => {
	const response = await fetch(`${origin}/invoices/7`);

	expect(response.status).toBe(200);
	expect(response.headers.get('x-invoice')).toBe('7');
	expect(response.headers.get('cache-control')).toBeNull();
	expect(await response.text()).toContain('Invoice INV-0007');
});

test("the 404 page for an unknown path keeps the middleware's headers and cookies", async () => {
	const response = await fetch(`${origin}/no-such-page`);

	expect(response.status).toBe(404);
	expect(await response.text()).toContain('Page not found');
	expect(response.headers.get('x-request-id')).toBe('mw-1');
	expect(response.headers.getSetCookie()).toEqual(['visit=mw-1; Path=/; HttpOnly']);
});

test("a page keeps the middleware's headers and cookies", async () => {
	const response = await fetch(`${origin}/invoices/7`);

	expect(response.status).toBe(200);
	expect(response.headers.get('x-request-id')).toBe('mw-1');
	expect(response.headers.getSetCookie()).toEqual(['visit=mw-1; Path=/; HttpOnly']);
});

test('middleware sees the page path a navigation fetch names, so a page guard also guards its fragment', async () => {
	const response = await fetch(fragmentRequestUrl(`${origin}/invoices/7`));

	expect(response.headers.get('x-middleware-path')).toBe('/invoices/7');
	const html = await response.text();
	expect(html).toContain('Invoice INV-0007');
	expect(html).toContain(FRAGMENT_REGION_END);
});

test('a status write after the response started streaming raises the named error', async () => {
	const response = await fetch(`${origin}/late`);
	expect(response.status).toBe(200);
	const reader = response.body!.getReader();
	const decoder = new TextDecoder();
	let html = '';
	while (!html.includes('data-pending')) {
		const chunk = await reader.read();
		expect(chunk.done).toBe(false);
		html += decoder.decode(chunk.value, { stream: true });
	}

	expect(await (await fetch(`${origin}/api/release-late-write`)).json()).toEqual({
		released: true,
	});
	for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read())
		html += decoder.decode(chunk.value, { stream: true });

	expect(html).toContain('MARKLESS_ROUTER_RESPONSE_COMMITTED');
});

test('a branch decided by http serves its arm from the server and ships none of http', async () => {
	const allowed = await fetch(`${origin}/admin`);
	const html = await allowed.text();
	expect(allowed.status).toBe(200);
	expect(html).toContain('Signed in as mw-1.');
	expect(html).not.toContain('data-forbidden');
	expect(html).not.toMatch(/searchParams|"locals"|visit=mw-1/);

	const refused = await fetch(`${origin}/admin?forbidden`);
	const refusedHtml = await refused.text();
	expect(refused.status).toBe(403);
	expect(refusedHtml).toContain('Guides only');
	expect(refusedHtml).not.toContain('Signed in as');
});

test('a page whose browser code reads http does not build', async () => {
	const root = await fixtureCopy();
	await writeFile(
		join(root, 'pages/leak.tsrx'),
		`import type { PageProps } from '@markless/router';

export default function Leak({ http }: PageProps) @{
	<button type="button" onClick={() => console.log(http.request.headers.get('cookie'))}>Leak</button>
}
`,
	);

	await expect(buildFixture({ root })).rejects.toThrow(/MARKLESS_SERVER_ONLY_PROP_BROWSER_READ/);
}, 240_000);

test("the page data pattern the docs show builds, and keeps the visitor's cookie on both sides", async () => {
	expect([...(await docsAppFiles()).keys()].toSorted()).toEqual([
		'api/reviews/[name].get.ts',
		'pages/recipes/[name].tsrx',
		'server/db.ts',
		'server/session.ts',
		'src/reviews.ts',
		'vite.config.ts',
	]);
	const signedIn = await fetch(`${origin}/recipes/lemon-cake`, {
		headers: { cookie: 'session=top-secret' },
	});
	const html = await signedIn.text();
	expect(signedIn.status).toBe(200);
	expect(html).toContain('<p>Lovely and lemony</p><p>Too sweet for me</p>');
	expect(html).not.toContain('Sign in to read reviews.');
	expect(await (await fetch(`${origin}/recipes/lemon-cake`)).text()).toContain(
		'Sign in to read reviews.',
	);
	expect((await fetch(`${origin}/api/reviews/lemon-cake?page=2`)).status).toBe(401);

	const browser = await launchBrowser(chromium);
	try {
		const context = await browser.newContext();
		await context.addCookies([{ name: 'session', value: 'top-secret', url: origin }]);
		const tab = await context.newPage();
		const errors: string[] = [];
		tab.on('pageerror', (error) => errors.push(String(error)));
		await tab.goto(`${origin}/recipes/lemon-cake`);
		await tab.getByText('Lovely and lemony').waitFor();
		await tab.getByRole('button', { name: 'Older reviews' }).click();
		await tab.getByText('Needs more zest').waitFor();
		expect(await tab.locator('main p').allInnerTexts()).toEqual([
			'Made it twice',
			'Needs more zest',
		]);
		expect(errors).toEqual([]);
	} finally {
		await browser.close();
	}
});
