// Behaviour checks for the one-list fixture: gestures after the fill, before the fill, and a refresh after the first gesture.
// Usage: node correctness.mjs <built app dir>
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { chromium } = createRequire(resolve(ROOT, 'demos/news/package.json'))('playwright');
const app = resolve(process.argv[2]);
const port = await new Promise((done) => {
	const server = createServer().listen(0, '127.0.0.1', () => {
		const { port } = server.address();
		server.close(() => done(port));
	});
});
const server = spawn(process.execPath, [resolve(app, '.output/server/index.mjs')], {
	env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
	stdio: 'ignore',
});
const url = `http://127.0.0.1:${port}/`;
for (let i = 0; i < 100; i++) {
	if (await fetch(url).then((r) => r.ok, () => false)) break;
	await new Promise((r) => setTimeout(r, 100));
}

const rows = (page) => page.$$eval('[data-list] li', (items) => items.map((item) => item.textContent));
const text = (page, selector) => page.$eval(selector, (element) => element.textContent);
const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });

const browser = await chromium.launch();
try {
	const open = async (hold) => {
		const context = await browser.newContext();
		const page = await context.newPage();
		const errors = [];
		page.on('pageerror', (error) => errors.push(String(error.message)));
		const scripts = [];
		page.on('request', (request) => request.resourceType() === 'script' && scripts.push(request.url()));
		if (hold) await page.route(/chunk-.*\.js$/, hold);
		return { context, page, errors, scripts };
	};

	{
		const { context, page, errors } = await open();
		await page.goto(url);
		await page.waitForSelector('[data-list] li');
		const fetchesBefore = await page.evaluate(() => globalThis.__todoFetches ?? 0);
		await page.evaluate(() => {
			window.__armWrites = 0;
			new MutationObserver((records) => (window.__armWrites += records.length)).observe(
				document.querySelector('[data-list]').parentNode,
				{ childList: true, subtree: true, characterData: true },
			);
		});
		await page.click('main > button');
		await page.waitForTimeout(800);
		check('the first gesture keeps the filled arm as it is', (await page.evaluate(() => window.__armWrites)) === 0, await page.evaluate(() => window.__armWrites));
		const fetches = await page.evaluate(() => globalThis.__todoFetches ?? 0);
		check('the first gesture does not fetch the list again', fetches === fetchesBefore, { before: fetchesBefore, after: fetches });
		await page.click('main > button');
		await page.waitForTimeout(200);
		check('fills at load', (await rows(page)).length === 3, await rows(page));
		await page.click('section > button');
		await page.waitForFunction(() => document.querySelector('section > button')?.textContent === 'Filter done');
		await page.waitForFunction(() => document.querySelectorAll('[data-list] li').length === 1, null, { timeout: 5000 }).catch(() => {});
		check('refresh after the first gesture', (await rows(page)).join() === 'Write the fill plan', await rows(page));
		await page.click('main > button');
		await page.waitForFunction(() => document.querySelector('main > button')?.textContent === 'Count 3', null, { timeout: 5000 }).catch(() => {});
		check('later gestures', (await text(page, 'main > button')) === 'Count 3', await text(page, 'main > button'));
		check('no page errors (after fill)', errors.length === 0, errors);
		await context.close();
	}

	for (const target of ['main > button', 'section > button']) {
		// Every chunk waits until the click has happened, so the click lands before the fill.
		let release;
		const gate = new Promise((done) => (release = done));
		const { context, page, errors } = await open(async (route) => {
			await gate;
			await route.continue();
		});
		await page.goto(url, { waitUntil: 'domcontentloaded' });
		const before = await rows(page);
		await page.click(target);
		release();
		const expected = target === 'main > button' ? 'Count 1' : 'Filter done';
		await page.waitForFunction(
			([selector, value]) => document.querySelector(selector)?.textContent === value,
			[target, expected],
			{ timeout: 10000 },
		).catch(() => {});
		await page.waitForTimeout(500);
		check(`click on ${target} before the fill lands`, (await text(page, target)) === expected, {
			before,
			after: await text(page, target),
			rows: await rows(page),
		});
		check(`no page errors (${target} before fill)`, errors.length === 0, errors);
		await context.close();
	}
} finally {
	await browser.close();
	server.kill();
}
console.log(JSON.stringify(results, null, 1));
process.exitCode = results.every((result) => result.ok) ? 0 : 1;
