import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertTimeline } from './analyzer-policy.mjs';
import { createComparisonServer } from './server.mjs';
import { EXPECTED_TEXT } from './shared/data.js';

const root = path.dirname(fileURLToPath(import.meta.url));
export const LANES = ['markless', 'query', 'loader'];

export function ensureBuilds() {
	const outputs = [
		'markless/dist/server/entry-server.js',
		'tanstack-query/dist/server/server.js',
		'tanstack-loader/dist/server/server.js',
	];
	if (outputs.every((file) => fs.existsSync(path.join(root, file)))) return;
	execFileSync('pnpm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
}

export async function runComparison(chromium) {
	ensureBuilds();
	const server = await createComparisonServer();
	const browser = await chromium.launch({
		headless: true,
		args: ['--disable-extensions', '--no-sandbox'],
	});
	const timelines = {};
	try {
		for (const lane of LANES)
			timelines[lane] = await measureLane({ browser, origin: server.origin, lane });
		writeResults(timelines);
		return timelines;
	} finally {
		await browser.close();
		await server.close();
	}
}

async function measureLane({ browser, origin, lane }) {
	const run = `${lane}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	const reset = await fetch(`${origin}/api/_reset?run=${encodeURIComponent(run)}`, {
		method: 'POST',
	});
	if (!reset.ok) throw new Error(`${lane} timeline reset failed with ${reset.status}`);
	const context = await browser.newContext();
	const page = await context.newPage();
	try {
		await page.goto(`${origin}/${lane}/?run=${encodeURIComponent(run)}`, { waitUntil: 'load' });
		await page.waitForSelector('[data-reviews]', { timeout: 10_000 });
		await assertRenderedData(page, lane);
		const response = await fetch(`${origin}/api/_timeline?run=${encodeURIComponent(run)}`);
		if (!response.ok) throw new Error(`${lane} timeline read failed with ${response.status}`);
		const timeline = { schemaVersion: 1, lane, ...(await response.json()) };
		assertTimeline(lane, timeline);
		return timeline;
	} finally {
		await context.close();
	}
}

async function assertRenderedData(page, lane) {
	for (const [name, expected] of Object.entries(EXPECTED_TEXT)) {
		const actual = await page.locator(`[data-${name}]`).textContent();
		if (actual !== expected)
			throw new Error(
				`${lane} rendered ${name} as ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
			);
	}
	const failures = await page.locator('[data-error]').count();
	if (failures !== 0) throw new Error(`${lane} rendered ${failures} error arm(s)`);
}

function writeResults(timelines) {
	const directory = path.join(root, 'results');
	fs.mkdirSync(directory, { recursive: true });
	for (const lane of LANES) {
		fs.writeFileSync(
			path.join(directory, `timeline-${lane}.json`),
			JSON.stringify(timelines[lane], null, '\t') + '\n',
		);
	}
	const rows = LANES.map((lane) => {
		const starts = Object.fromEntries(
			timelines[lane].events.map((event) => [event.name, event.startMs.toFixed(1)]),
		);
		return `| ${lane} | ${starts.session} | ${starts.recommendations} | ${starts.catalog} | ${starts.reviews} |`;
	});
	const summary = [
		'# Chained async comparison timeline',
		'',
		'Fetch arrival times in milliseconds from each run epoch:',
		'',
		'| Lane | Session | Recommendations | Catalog | Reviews |',
		'| --- | ---: | ---: | ---: | ---: |',
		...rows,
		'',
	].join('\n');
	fs.writeFileSync(path.join(directory, 'summary.md'), summary);
}
