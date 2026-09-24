#!/usr/bin/env node
// Holdout harness selftest: pure metric checks, the markless() options hook against the real bundler entry,
// and a Chromium + WebKit pass over a plain-HTML fixture whose slow control drops early clicks by construction.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectLanes } from './lanes.mjs';
import { freePort } from './lib/app-server.mjs';
import { VITE_ENTRY, wrapperSource } from './lib/markless-options-loader.mjs';
import {
	aggregate,
	fileUsage,
	networkRounds,
	roundTrips,
	sample,
	survival,
} from './lib/metrics.mjs';
import { markdown } from './report.mjs';
import { DEFAULTS, measureLanes } from './run.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const checks = [];
const check = (name, ok, detail = '') => {
	checks.push({ name, ok });
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};

// Pure metrics.
check('sample keeps all when under the cap', sample([1, 2, 3], 5).join() === '1,2,3');
check(
	'sample spreads evenly with both ends',
	sample([...Array(10).keys()], 4).join() === '0,3,6,9',
	sample([...Array(10).keys()], 4).join(),
);
const e = (s, end) => ({ startEpoch: s, endEpoch: end });
check(
	'roundTrips: parallel requests are one round',
	roundTrips([e(0, 10), e(1, 12), e(2, 9)]) === 1,
);
check(
	'roundTrips: discovered-after-finish chains add rounds',
	roundTrips([e(0, 10), e(11, 20), e(12, 15), e(21, 30), e(5, 8)]) === 3,
);
check(
	'roundTrips: unfinished requests are ignored',
	roundTrips([e(0, 10), { startEpoch: 20, endEpoch: null }]) === 1,
);
check(
	'networkRounds: zero-length cache hits add no rounds',
	networkRounds([e(0, 10), e(11, 11), e(11.2, 11.2), e(11.4, 11.4), e(12, 20)]) === 2,
);
const s = (hash) => ({ hash });
check(
	'survival: survived',
	survival({ idle: s('a'), clicked: s('b'), early: s('b') }) === 'survived',
);
check('survival: lost', survival({ idle: s('a'), clicked: s('b'), early: s('a') }) === 'lost');
check(
	'survival: diverged',
	survival({ idle: s('a'), clicked: s('b'), early: s('c') }) === 'diverged',
);
check(
	'survival: inert control',
	survival({ idle: s('a'), clicked: s('a'), early: s('a') }) === 'no-observable-response',
);
check(
	'survival: missing reference',
	survival({ idle: null, clicked: s('a'), early: s('a') }) === 'indeterminate',
);
const usage = fileUsage(
	['https://h/a.js', 'https://h/b.js', 'https://h/c.js'],
	[
		{ rel: 'modulepreload', href: 'https://h/a.js' },
		{ rel: 'modulepreload', href: 'https://h/b.js' },
		{ rel: 'modulepreload', href: 'https://h/z.js' },
	],
	new Map([
		['/a.js', 10],
		['/c.js', 3],
	]),
);
check(
	'fileUsage splits preloaded/used/unused',
	usage.jsFiles === 3 &&
		usage.preloaded === 2 &&
		usage.used === 2 &&
		usage.preloadedUnused === 1 &&
		usage.fetchedUnused === 1 &&
		usage.hintedNotFetched === 1,
	JSON.stringify(usage),
);
check(
	'fileUsage without coverage reports null use',
	fileUsage(['https://h/a.js'], [], null).used === null,
);

// Options hook: the wrapper matches only the bundler's vite entry and the forced option reaches markless().
check(
	'loader matches the workspace bundler vite entry',
	VITE_ENTRY.test('/x/packages/bundler/src/vite/index.ts') &&
		!VITE_ENTRY.test('/x/packages/core/src/vite.ts'),
);
check(
	'wrapper source forces options over the caller',
	wrapperSource('file:///r.ts', '{"a":1}').includes('real.markless({ ...options, ...forced })'),
);
const probe = `const { createRequire } = await import('node:module');
const require = createRequire(${JSON.stringify(path.join(selectLanes(['sr-app'])[0].root, 'package.json'))});
const { pathToFileURL } = await import('node:url');
const { markless } = await import(pathToFileURL(require.resolve('@markless/core/vite')).href);
console.log(JSON.stringify(markless().map((p) => p.name)));`;
const pluginNames = (options) => {
	const env = { ...process.env };
	if (options) env.HOLDOUT_MARKLESS_OPTIONS = JSON.stringify(options);
	else delete env.HOLDOUT_MARKLESS_OPTIONS;
	return JSON.parse(
		execFileSync(
			process.execPath,
			[
				'--import',
				path.join(here, 'lib/markless-options-hook.mjs'),
				'--input-type=module',
				'-e',
				probe,
			],
			{ env, encoding: 'utf8' },
		)
			.trim()
			.split('\n')
			.at(-1),
	);
};
const plain = pluginNames(null);
const packed = pluginNames({ experimentalNativePacking: true });
check(
	'hook: default build keeps the app config (fewer plugins)',
	packed.length > plain.length,
	`${plain.length} -> ${packed.length} plugins`,
);

// End to end in Chromium on a plain-HTML fixture.
const FIXTURE = `<!doctype html><html><head><meta charset="utf-8"><title>holdout fixture</title>
<link rel="modulepreload" href="/unused.js"><link rel="modulepreload" href="/app.js"></head><body>
<main><h1>Fixture</h1><button id="fast">Fast 0</button> <button id="slow">Slow 0</button> <button id="inert">Inert</button>
<input aria-label="Name"><a href="/two">Two</a></main>
<script type="module" src="/app.js"></script></body></html>`;
const APP = `const bump = (el) => { let n = 0; return () => { el.textContent = el.textContent.replace(/\\d+$/, ++n); }; };
const fast = document.getElementById('fast'); fast.addEventListener('click', bump(fast));
const slow = document.getElementById('slow'); import('/late.js').then(() => slow.addEventListener('click', bump(slow)));
const input = document.querySelector('input'); input.addEventListener('input', () => (document.querySelector('h1').textContent = 'Fixture ' + input.value));`;
const TWO =
	'<!doctype html><html><head><meta charset="utf-8"></head><body><main><h1>Two</h1><a href="/">Home</a></main></body></html>';
const server = http.createServer((req, res) => {
	const url = new URL(req.url, 'http://x');
	const send = (type, body) => {
		res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
		res.end(body);
	};
	if (url.pathname === '/') send('text/html', FIXTURE);
	else if (url.pathname === '/two') send('text/html', TWO);
	else if (url.pathname === '/app.js') send('text/javascript', APP);
	else if (url.pathname === '/late.js')
		setTimeout(() => send('text/javascript', 'export {};'), 1500);
	else if (url.pathname === '/unused.js')
		send('text/javascript', 'export const unused = () => 1;');
	else {
		res.writeHead(404);
		res.end();
	}
});
const port = await freePort();
await new Promise((r) => server.listen(port, '127.0.0.1', r));
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'holdout-selftest-'));
try {
	const lane = {
		name: 'fixture',
		root: here,
		rendering: 'plain HTML fixture',
		routes: ['/'],
		ready: null,
	};
	await measureLanes({
		lanes: [lane],
		variants: ['default'],
		serve: async () => ({ origin: `http://127.0.0.1:${port}`, stop: async () => {} }),
		opts: {
			...DEFAULTS,
			browsers: ['chromium', 'webkit'],
			profiles: ['normal'],
			loadVisits: 1,
			lock: null,
		},
		out,
		log: () => {},
	});
	const all = fs
		.readFileSync(path.join(out, 'records.jsonl'), 'utf8')
		.trim()
		.split('\n')
		.map((l) => JSON.parse(l));
	const records = all.filter((r) => r.browser === 'chromium');
	const webkit = all.filter((r) => r.browser === 'webkit');
	const byControl = (kind, key) => records.find((r) => r.kind === kind && r.control === key);
	const load = records.find((r) => r.kind === 'load' && !r.coverageVisit);
	const cov = records.find((r) => r.kind === 'load' && r.coverageVisit);
	check(
		'load: document + three scripts counted',
		load?.requests >= 4 && load.files.jsFiles === 3,
		JSON.stringify(load?.files),
	);
	check(
		'load: modulepreloaded but never executed file detected',
		cov?.files.preloadedUnused === 1 && cov.executed.executedChars > 0,
		JSON.stringify(cov?.files),
	);
	check(
		'load: resource-timing rounds see the import chain (document, app.js, late.js)',
		load?.roundsSource === 'resource-timing' && load.rounds >= 2,
		`${load?.rounds} rounds`,
	);
	const discovery = records.find((r) => r.kind === 'discovery');
	check(
		'discovery: buttons and text input found, link excluded',
		discovery?.controlsFound === 4 && discovery.linksFound === 1,
		JSON.stringify(discovery),
	);
	check(
		'first click: fast button responds with a latency',
		byControl('clicks', 'button:Fast #')?.responded === true &&
			byControl('clicks', 'button:Fast #').inputToResponseMs > 0,
	);
	check(
		'first click: typing into the input responds',
		byControl('clicks', 'input:Name')?.responded === true,
	);
	check(
		'early: fast button survives',
		byControl('early', 'button:Fast #')?.verdict === 'survived',
	);
	check(
		'early: listener attached after paint loses the click',
		byControl('early', 'button:Slow #')?.verdict === 'lost',
		byControl('early', 'button:Slow #')?.verdict,
	);
	check(
		'early: inert button is not counted',
		byControl('early', 'button:Inert')?.verdict === 'no-observable-response',
	);
	const nav = records.find((r) => r.kind === 'nav');
	check(
		'nav: link arrives as a document load with rounds and latency',
		nav?.arrived && nav.newDocument && nav.rounds >= 1 && nav.latencyMs > 0,
		JSON.stringify(nav),
	);
	const wkClick = webkit.find((r) => r.kind === 'clicks' && r.control === 'button:Fast #');
	check(
		'webkit: first-click latency on the page clock (0-5000 ms)',
		wkClick?.inputToResponseMs > 0 && wkClick.inputToResponseMs < 5000,
		String(wkClick?.inputToResponseMs),
	);
	const wkNav = webkit.find((r) => r.kind === 'nav');
	check(
		'webkit: nav latency and resource-timing rounds',
		wkNav?.arrived && wkNav.latencyMs > 0 && wkNav.latencyMs < 5000 && wkNav.rounds >= 1,
		JSON.stringify({ latencyMs: wkNav?.latencyMs, rounds: wkNav?.rounds }),
	);
	check(
		'webkit: slow control loses the early click too',
		webkit.find((r) => r.kind === 'early' && r.control === 'button:Slow #')?.verdict === 'lost',
	);
	const rows = aggregate(records);
	check(
		'aggregate: one cell, 3 counted early clicks, survivors and a loss',
		rows.length === 1 &&
			rows[0].early.survived >= 1 &&
			rows[0].early.counted === 3 &&
			rows[0].early.lost >= 1,
		JSON.stringify(rows[0]?.early),
	);
	check(
		'report: markdown row rendered',
		markdown(rows, { date: 'selftest' }).includes('| default | chromium | normal |'),
	);
} finally {
	server.close();
	fs.rmSync(out, { recursive: true, force: true });
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
