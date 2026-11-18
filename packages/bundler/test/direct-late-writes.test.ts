import { createServer } from 'node:http';
import { readFile, rm } from 'node:fs/promises';
import { chromium, type Browser } from '@playwright/test';
import { resolve } from 'pathe';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { compileTsrxModule } from '@markless/compiler';
import { buildFixture } from '../../router/test/support/fixture-build.ts';
import { launchBrowser } from '../../../scripts/test-utils/browser.ts';

// A write the handler makes after it has returned (a timer, a promise, a view transition) reaches the page
// of a directly rendered app just as a write made inside the handler does.

const root = resolve(import.meta.dirname, '../fixtures/vite-csr-direct/late-writes');
const outDir = resolve(root, '../node_modules/.markless-late-writes');
let browser: Browser | undefined;
let server: ReturnType<typeof createServer> | undefined;
let origin = '';

beforeAll(async () => {
	await buildFixture({
		root,
		configFile: resolve(root, 'vite.config.ts'),
		build: { outDir, emptyOutDir: true },
	});
	server = createServer(async (request, response) => {
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
	await new Promise<void>((done) => server!.listen(0, '127.0.0.1', done));
	const address = server.address();
	origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
	browser = await launchBrowser(chromium);
}, 240_000);

afterAll(async () => {
	await browser?.close();
	server?.close();
	await rm(outDir, { recursive: true, force: true });
});

test.each(['hand', 'count'])('%s compiles to the direct chunk renderer', async (name) => {
	const filename = resolve(root, `src/${name}.tsrx`);
	const result = await compileTsrxModule({ filename, source: await readFile(filename, 'utf8'), symbols: [] });
	expect(result.publicRenderModule.moduleSource).toContain('createMarklessDirectChunkRenderer');
});

const writes = ['sync', 'timeout', 'await', 'transition', 'then'] as const;

test.each(writes)('a keyed list shows a row written %s', async (write) => {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(origin);
	const rows = page.locator(`[data-hand="${write}"] li`);
	await expect.poll(() => rows.allTextContents()).toEqual(['A', 'B', 'C']);
	await page.click(`[data-hand="${write}"] [data-write="${write}"]`);
	await expect.poll(() => rows.allTextContents(), { timeout: 2_000 }).toEqual(['A', 'B', 'C', 'D']);
	expect(errors).toEqual([]);
	await page.close();
});

test('a keyed list shows two rows swapped by two writes in a timer', async () => {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(origin);
	const rows = page.locator('[data-hand="swap"] li');
	await expect.poll(() => rows.allTextContents()).toEqual(['A', 'B', 'C']);
	await page.click('[data-hand="swap"] [data-write="swap"]');
	await expect.poll(() => rows.allTextContents(), { timeout: 2_000 }).toEqual(['C', 'B', 'A']);
	expect(errors).toEqual([]);
	await page.close();
});

test.each(writes)('a text read shows a count written %s', async (write) => {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(origin);
	const text = page.locator(`[data-count="${write}"] p`);
	await expect.poll(() => text.textContent()).toBe('0');
	await page.click(`[data-count="${write}"] [data-write="${write}"]`);
	await expect.poll(() => text.textContent(), { timeout: 2_000 }).toBe('1');
	expect(errors).toEqual([]);
	await page.close();
});
