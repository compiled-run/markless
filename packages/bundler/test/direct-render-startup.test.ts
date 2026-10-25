import { createServer } from 'node:http';
import { readFile, rm } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { resolve } from 'pathe';
import { createBuilder } from 'vite';
import { afterAll, expect, test } from 'vitest';

const fixtures = resolve(import.meta.dirname, '../fixtures');
const outRoots: string[] = [];
afterAll(() => Promise.all(outRoots.map((path) => rm(path, { force: true, recursive: true }))));

// Thrown only by the canonical client render and the prerender evaluator behind it.
const RENDER_FALLBACK_MARKERS = [
	'MARKLESS_CANONICAL_CLIENT_ROOT_MISSING',
	'MARKLESS_PRERENDER_DATA_ROOT_MISSING',
];

async function build(name: string) {
	const root = resolve(fixtures, name);
	const outDir = resolve(root, 'node_modules/.markless-direct-startup');
	outRoots.push(outDir);
	const builder = await createBuilder({
		configFile: resolve(root, 'vite.config.ts'),
		root,
		logLevel: 'error',
		build: { outDir, emptyOutDir: true },
	});
	await builder.buildApp();
	const html = await readFile(resolve(outDir, 'index.html'), 'utf8');
	const startup = [...html.matchAll(/(?:src|href)=["']?\.?\/?([^"' >]+\.js)/g)].map(
		(match) => match[1]!,
	);
	const code = (await Promise.all(startup.map((file) => readFile(resolve(outDir, file), 'utf8')))).join('\n');
	return { outDir, startup, code, gzip: gzipSync(code).length };
}

async function serve(outDir: string) {
	const server = createServer(async (request, response) => {
		const path = request.url === '/' ? '/index.html' : request.url!.split('?')[0]!;
		try {
			const body = await readFile(resolve(outDir, `.${path}`));
			response.setHeader('content-type', path.endsWith('.js') ? 'text/javascript' : 'text/html');
			response.end(body);
		} catch {
			response.statusCode = 404;
			response.end();
		}
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const address = server.address();
	return { server, origin: `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}` };
}

test('a directly rendered app imported through @markless/core preloads none of the render fallbacks and still renders and reacts', async () => {
	const direct = await build('vite-csr-direct');
	for (const marker of RENDER_FALLBACK_MARKERS) expect(direct.code).not.toContain(marker);
	console.info(`direct startup: ${direct.startup.length} scripts, ${direct.code.length} B raw, ${direct.gzip} B gzip`);

	const { server, origin } = await serve(direct.outDir);
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(String(error)));
		const scripts: string[] = [];
		page.on('request', (request) => {
			if (request.url().endsWith('.js')) scripts.push(new URL(request.url()).pathname);
		});
		await page.goto(origin);
		await expect.poll(() => page.locator('li').count()).toBe(2);
		await page.locator('[data-add]').click();
		await expect.poll(() => page.locator('li').count()).toBe(3);
		await page.locator('li:nth-child(2) [data-pick]').click();
		await expect.poll(() => page.locator('li.picked').textContent()).toBe('second');
		expect(errors).toEqual([]);
		expect(scripts.map((path) => path.replace(/^\//, '')).sort()).toEqual([...direct.startup].sort());
	} finally {
		await browser.close();
		server.close();
	}
}, 180_000);

// The scoped style keeps this app off the direct-DOM path.
test('an app that can reach the render fallbacks keeps them in its startup scripts', async () => {
	const control = await build('vite-csr-styles');
	expect(RENDER_FALLBACK_MARKERS.some((marker) => control.code.includes(marker))).toBe(true);
}, 180_000);
