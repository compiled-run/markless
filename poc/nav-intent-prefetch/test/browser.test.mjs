import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createPocServer } from '../server.mjs';

const root = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

test('records destination fetches before render with intent and after render without it', async (context) => {
	const chromium = await loadChromium(context);
	if (!chromium) return;
	const server = await createPocServer();
	const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
	try {
		const timelines = {};
		for (const mode of ['prefetch', 'plain'])
			timelines[mode] = await measure({ browser, mode, origin: server.origin });
		assertTimeline('prefetch', timelines.prefetch, (event, render) => event < render);
		assertTimeline('plain', timelines.plain, (event, render) => event > render);
		assert.deepEqual(
			timelines.prefetch.derivedAsyncComputedIds,
			timelines.plain.derivedAsyncComputedIds,
			'both runs must derive the same compiler-owned async demand',
		);
		assert.deepEqual(
			timelines.prefetch.events.map((event) => event.name).sort(),
			timelines.plain.events.map((event) => event.name).sort(),
			'both runs must issue the same destination requests',
		);
		assert.ok(
			timelines.prefetch.events.filter(
				(event) =>
					event.settledMs === null || event.settledMs > timelines.prefetch.renderStartMs,
			).length >= 2,
			'intent navigation must commit while multiple destination fetches are still in flight',
		);
		fs.mkdirSync(path.join(root, 'results'), { recursive: true });
		for (const [mode, timeline] of Object.entries(timelines))
			fs.writeFileSync(
				path.join(root, 'results', `timeline-${mode}.json`),
				`${JSON.stringify({ schemaVersion: 1, mode, ...timeline }, null, '\t')}\n`,
			);
	} finally {
		await browser.close();
		await server.close();
	}
});

async function measure({ browser, mode, origin }) {
	const run = `${mode}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	const reset = await fetch(`${origin}/api/_reset?run=${encodeURIComponent(run)}`, {
		method: 'POST',
	});
	assert.equal(reset.status, 200);
	const page = await browser.newPage();
	try {
		await page.goto(`${origin}/?mode=${mode}&run=${encodeURIComponent(run)}`);
		await page.waitForFunction(() => globalThis.__navIntentReady === true);
		if (mode === 'prefetch') await page.locator('[data-route-b]').dispatchEvent('pointerdown');
		await page.locator('[data-route-b]').click();
		await page.waitForSelector('[data-recommendations]');
		assert.equal(
			await page.locator('[data-recommendations]').textContent(),
			'Signals, Compilers',
		);
		assert.equal(await page.locator('[data-catalog]').textContent(), 'Markless Handbook');
		const response = await fetch(`${origin}/api/_timeline?run=${encodeURIComponent(run)}`);
		assert.equal(response.status, 200);
		return response.json();
	} finally {
		await page.close();
	}
}

function assertTimeline(mode, timeline, ordered) {
	assert.equal(typeof timeline.renderStartMs, 'number', `${mode} must record render start time`);
	assert.equal(typeof timeline.renderStartSequence, 'number');
	assert.ok(timeline.derivedAsyncComputedIds.length > 0);
	assert.equal(timeline.events.length, timeline.derivedAsyncComputedIds.length);
	for (const event of timeline.events) {
		assert.ok(
			ordered(event.startSequence, timeline.renderStartSequence),
			`${mode} ${event.name} sequence ${event.startSequence} has the wrong side of render ${timeline.renderStartSequence}`,
		);
		assert.ok(
			ordered(event.startMs, timeline.renderStartMs),
			`${mode} ${event.name} at ${event.startMs}ms has the wrong side of render at ${timeline.renderStartMs}ms`,
		);
	}
}

async function loadChromium(context) {
	let playwright;
	try {
		playwright = await import('playwright');
	} catch {
		try {
			playwright =
				await import('../../../demos/chained-async-comparison/node_modules/playwright/index.mjs');
		} catch {
			context.skip(
				'Playwright is missing; install dependencies in demos/chained-async-comparison',
			);
			return null;
		}
	}
	const executable = playwright.chromium.executablePath();
	if (!executable || !fs.existsSync(executable)) {
		context.skip('Playwright Chromium is missing; install it before the browser proof');
		return null;
	}
	return playwright.chromium;
}
