// Standalone browser proof for the 4 storage contract cases.
//
// Why this exists: the vitest-browser lane (storage.test.ts) deadlocks at the
// vitest<->playwright `createTesters` handshake on this machine under memory
// pressure. This runner reproduces the SAME 4 contract assertions using only a
// programmatic vite server (markless plugin, for real SSR + client resume
// modules) + plain playwright chromium — no vitest orchestration — which the
// markless demo suite proves runs fine here.
//
// Run: node packages/vitest-browser/storage-runner.mjs  (from the worktree root
// OR the package dir; deps resolve from the vitest-browser package context).

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { markless } from '@markless/core/vite';
import { renderToString } from '@markless/web';
import { chromium } from 'playwright';

const root = path.dirname(fileURLToPath(import.meta.url));
const fixtures = {
	'/': path.join(root, 'browser/fixtures/storage.tsrx'), // explicit key 'theme'
	'/derived': path.join(root, 'browser/fixtures/storage-derived.tsrx'), // derived key markless:theme
};

const vite = await createServer({
	configFile: false,
	root,
	appType: 'custom',
	logLevel: 'warn',
	server: { middlewareMode: false },
	plugins: [markless()],
});

vite.middlewares.use(async (req, res, next) => {
	const url = (req.url || '/').split('?')[0];
	const fixture = fixtures[url];
	if (!fixture) return next();
	try {
		const mod = await vite.ssrLoadModule(fixture);
		const artifact = mod.default ?? mod.App;
		const body = await renderToString(artifact, { executionLog: 'never' });
		let html = await vite.transformIndexHtml(url, `<!doctype html><html><head></head><body>${body}</body></html>`);
		res.setHeader('content-type', 'text/html');
		res.end(html);
	} catch (error) {
		console.error('[render error]', error);
		next(error);
	}
});

await vite.listen();
const address = vite.httpServer.address();
const origin = `http://localhost:${address.port}`;

const PROBE_INIT = `
	window.__getItemKeys = [];
	const _get = Storage.prototype.getItem;
	Storage.prototype.getItem = function (k) { window.__getItemKeys.push(k); return _get.call(this, k); };
`;
const SEED_DARK = `try { localStorage.setItem('theme', 'dark'); } catch {}`;

const results = [];
async function testCase(name, fn) {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	page.on('console', (m) => { if (m.type() === 'error') console.error('[page error]', m.text()); });
	page.on('pageerror', (e) => console.error('[pageerror]', e.message));
	try {
		await fn(page);
		results.push(`PASS  ${name}`);
	} catch (error) {
		results.push(`FAIL  ${name}\n        ${error.message}`);
	} finally {
		await ctx.close();
	}
}

const themeText = (page) => page.textContent('output[data-theme-value]');
const dataTheme = (page) => page.getAttribute('html', 'data-theme');
async function wake(page) {
	await page.click('button[data-wake]');
	await page.waitForFunction(
		() => document.querySelector('output[data-wake-count]')?.textContent === '1',
		null,
		{ timeout: 10_000 },
	);
}
async function pollThemeText(page, expected) {
	await page.waitForFunction(
		(want) => document.querySelector('output[data-theme-value]')?.textContent === want,
		expected,
		{ timeout: 10_000 },
	);
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-extensions'] });
try {
	// 1. cold: seed sets the fallback attribute before the framework wakes.
	await testCase('cold load seeds the fallback before framework wake', async (page) => {
		await page.goto(`${origin}/`, { waitUntil: 'load' });
		await page.waitForSelector('output[data-theme-value]');
		assert.equal(await dataTheme(page), 'light', 'documentElement data-theme');
		assert.equal(await themeText(page), 'light', 'output text');
	});

	// 2. warm: seed adopts localStorage with exactly one driver read, none after wake.
	await testCase('warm load adopts the seed without an extra runtime driver read', async (page) => {
		await page.addInitScript(SEED_DARK);
		await page.addInitScript(PROBE_INIT);
		await page.goto(`${origin}/`, { waitUntil: 'load' });
		await page.waitForSelector('output[data-theme-value]');
		assert.equal(await dataTheme(page), 'dark', 'documentElement data-theme');
		assert.deepEqual(await page.evaluate(() => window.__getItemKeys), ['theme'], 'driver reads at mount');
		await wake(page);
		await pollThemeText(page, 'dark');
		assert.deepEqual(await page.evaluate(() => window.__getItemKeys), ['theme'], 'driver reads after wake');
	});

	// 3. write: toggle updates every plane and survives a fresh SSR mount.
	await testCase('writes update every plane and survive a fresh SSR mount', async (page) => {
		await page.goto(`${origin}/`, { waitUntil: 'load' });
		await page.waitForSelector('button[data-toggle]');
		await page.click('button[data-toggle]');
		await pollThemeText(page, 'dark');
		assert.equal(await dataTheme(page), 'dark', 'attr after toggle');
		assert.equal(await page.evaluate(() => localStorage.getItem('theme')), 'dark', 'localStorage after toggle');
		// fresh SSR mount (reload) — localStorage persists in the same context
		await page.goto(`${origin}/`, { waitUntil: 'load' });
		await page.waitForSelector('output[data-theme-value]');
		await wake(page);
		await pollThemeText(page, 'dark');
		assert.equal(await dataTheme(page), 'dark', 'attr after remount');
		assert.equal(await page.evaluate(() => localStorage.getItem('theme')), 'dark', 'localStorage after remount');
	});

	// 4. derived key: storage('light') -> localStorage key markless:theme + sanitized attr data-markless-theme.
	await testCase('derived key uses markless:<identifier> and a sanitized data attribute', async (page) => {
		await page.goto(`${origin}/derived`, { waitUntil: 'load' });
		await page.waitForSelector('output[data-theme-value]');
		assert.equal(await page.getAttribute('html', 'data-markless-theme'), 'light', 'derived cold attr');
		assert.equal(await themeText(page), 'light', 'derived cold value');
		await page.click('button[data-toggle]');
		await pollThemeText(page, 'dark');
		assert.equal(await page.getAttribute('html', 'data-markless-theme'), 'dark', 'derived attr after toggle');
		assert.equal(await page.evaluate(() => localStorage.getItem('markless:theme')), 'dark', 'derived localStorage key');
		assert.equal(await page.evaluate(() => localStorage.getItem('theme')), null, 'no unprefixed key written');
	});

	// 5. derived warm: a stored markless:theme value seeds the no-flash attr before
	// wake, and the component adopts it on wake (mirrors the explicit warm case).
	await testCase('derived key adopts a warm markless:theme value', async (page) => {
		await page.addInitScript(`try { localStorage.setItem('markless:theme', 'dark'); } catch {}`);
		await page.goto(`${origin}/derived`, { waitUntil: 'load' });
		await page.waitForSelector('output[data-theme-value]');
		assert.equal(await page.getAttribute('html', 'data-markless-theme'), 'dark', 'derived warm attr at first paint');
		await wake(page);
		await pollThemeText(page, 'dark');
	});
} finally {
	await browser.close();
	await vite.close();
}

console.log('\n=== STORAGE BROWSER CONTRACT ===');
for (const line of results) console.log(line);
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed === 0 ? 0 : 1);
