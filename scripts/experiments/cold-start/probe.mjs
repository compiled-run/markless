import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
const output = '/tmp/markless-cold-start',
	server = JSON.parse(readFileSync(`${output}/server.json`));
const path = process.argv[2] ?? '/markless/';
const browser = await chromium.launch({ headless: true }),
	context = await browser.newContext({
		viewport: { width: 1440, height: 1000 },
		colorScheme: 'light',
	}),
	page = await context.newPage();
page.setDefaultTimeout(180000);
page.setDefaultNavigationTimeout(180000);
const requests = [],
	errors = [],
	pending = new Map(),
	started = performance.now();
let phase = 'load';
page.on('pageerror', (error) => errors.push({ phase, message: error.message }));
page.on('request', (request) => {
	const item = {
		url: request.url(),
		type: request.resourceType(),
		phase,
		start: performance.now() - started,
	};
	requests.push(item);
	pending.set(request, item);
});
page.on('requestfinished', async (request) => {
	const item = pending.get(request);
	if (!item) return;
	item.milliseconds = performance.now() - started - item.start;
	try {
		item.sizes = await request.sizes();
		item.timing = request.timing();
	} catch {}
});
page.on('requestfailed', (request) => {
	const item = pending.get(request);
	if (item) item.failure = request.failure();
});
const save = (data) =>
	writeFileSync(
		`${output}/${server.label}-browser.json`,
		JSON.stringify({ server, path, ...data, requests, errors }, null, 2),
	);
const interactions = [];
let documentMilliseconds, visibleMilliseconds;
try {
	await page.goto(new URL(path, server.url).href, { waitUntil: 'commit' });
	documentMilliseconds = performance.now() - started;
	await page.locator('[data-theme-toggle="dark"]').waitFor({ state: 'visible' });
	visibleMilliseconds = performance.now() - started;
	for (let i = 0; i < 3; i++) {
		const target = i % 2 === 0 ? 'dark' : 'light';
		phase = i === 0 ? 'first-interaction' : `warm-${i}`;
		const button = page.locator(`[data-theme-toggle="${target}"]`),
			box = await button.boundingBox();
		if (!box) throw Error('Theme control has no visible box');
		const begin = performance.now();
		await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
		await page.waitForFunction(
			(target) => document.documentElement.getAttribute('data-theme') === target,
			target,
		);
		interactions.push({ target, milliseconds: performance.now() - begin });
		save({ documentMilliseconds, visibleMilliseconds, interactions });
	}
	phase = 'idle';
	await page.waitForTimeout(1000);
	save({ documentMilliseconds, visibleMilliseconds, interactions });
	console.log(
		JSON.stringify({
			documentMilliseconds,
			visibleMilliseconds,
			interactions,
			scripts: requests.filter((r) => r.type === 'script').length,
			errors,
		}),
	);
} catch (error) {
	save({ documentMilliseconds, visibleMilliseconds, interactions, failure: error.message });
	throw error;
} finally {
	await context.close();
	await browser.close();
	await fetch(new URL('/__cold_profile', server.url))
		.then((r) => r.text())
		.then(console.log)
		.catch((error) => console.log(error.message));
}
