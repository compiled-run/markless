// Click-to-new-content for in-place navigations on a built docs site, per network profile.
// node scripts/benchmarks/router-navigation/nav-bench.mjs --server <.output/server/index.mjs> --label <name> --out <file.json>
//   [--start /router/links] [--runs 5] [--targets 8] [--revisits 4] [--dwell 150] [--profiles fast,cpu4x,slow]
// The built server sits behind a gzip proxy, as a CDN would compress it. Each run is a fresh browser context:
// land, wait for idle, then for each target rest the pointer on its sidebar link for --dwell ms and press it;
// afterwards revisit the first --revisits targets the same way. Times run from pointerdown to the first frame
// that shows the destination's <h1>.
import { spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { writeFileSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

const { values } = parseArgs({
	options: {
		server: { type: 'string' },
		label: { type: 'string' },
		out: { type: 'string' },
		start: { type: 'string', default: '/router/links' },
		runs: { type: 'string', default: '5' },
		targets: { type: 'string', default: '8' },
		revisits: { type: 'string', default: '4' },
		dwell: { type: 'string', default: '150' },
		profiles: { type: 'string', default: 'fast,cpu4x,slow' },
	},
});
const PROFILES = {
	fast: { net: null, cpu: 1 },
	cpu4x: { net: null, cpu: 4 },
	// Lighthouse's Slow 4G.
	slow: { net: { latency: 150, downloadThroughput: 200_000, uploadThroughput: 93_750 }, cpu: 1 },
};
const runs = Number(values.runs);
const dwell = Number(values.dwell);

async function startServer(entry) {
	const port = 4900 + Math.floor(Math.random() * 500);
	const child = spawn(process.execPath, [entry], {
		env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NITRO_PORT: String(port) },
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	const origin = `http://127.0.0.1:${port}`;
	for (let tries = 0; tries < 200; tries++) {
		try {
			await fetch(origin + '/');
			return { origin, close: () => child.kill() };
		} catch {
			await new Promise((done) => setTimeout(done, 100));
		}
	}
	child.kill();
	throw new Error(`the built server at ${entry} never answered`);
}

// Compresses text answers the server sent uncompressed, streaming, without a length.
function startProxy(upstream) {
	const target = new URL(upstream);
	const proxy = createServer((req, res) => {
		const forward = httpRequest(
			{
				host: target.hostname,
				port: target.port,
				path: req.url,
				method: req.method,
				headers: { ...req.headers, host: target.host, 'accept-encoding': 'identity' },
			},
			(upstreamResponse) => {
				const type = upstreamResponse.headers['content-type'] ?? '';
				const compress =
					/text|javascript|json|svg/.test(type) &&
					!upstreamResponse.headers['content-encoding'] &&
					/gzip/.test(req.headers['accept-encoding'] ?? '');
				const headers = { ...upstreamResponse.headers };
				if (compress) {
					delete headers['content-length'];
					headers['content-encoding'] = 'gzip';
				}
				res.writeHead(upstreamResponse.statusCode ?? 502, headers);
				if (!compress) return upstreamResponse.pipe(res);
				const gzip = createGzip({ level: 6, flush: 2 });
				upstreamResponse.pipe(gzip).pipe(res);
			},
		);
		forward.on('error', () => res.destroy());
		req.pipe(forward);
	});
	return new Promise((done) =>
		proxy.listen(0, '127.0.0.1', () =>
			done({
				origin: `http://127.0.0.1:${proxy.address().port}`,
				close: () => proxy.close(),
			}),
		),
	);
}

async function measureRun(browser, origin, profile) {
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const page = await context.newPage();
	const cdp = await context.newCDPSession(page);
	await cdp.send('Network.enable');
	if (profile.net)
		await cdp.send('Network.emulateNetworkConditions', { offline: false, ...profile.net });
	if (profile.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
	const fragments = [];
	cdp.on('Network.requestWillBeSent', (event) => {
		if (event.request.url.includes('/_markless/fragment/'))
			fragments.push({
				id: event.requestId,
				url: event.request.url,
				purpose: event.request.headers.Purpose ?? event.request.headers.purpose ?? '',
			});
	});
	const finished = new Map();
	cdp.on('Network.loadingFinished', (event) =>
		finished.set(event.requestId, event.encodedDataLength),
	);
	cdp.on('Network.loadingFailed', (event) => finished.set(event.requestId, -1));
	await page.goto(origin + values.start, { waitUntil: 'load', timeout: 120_000 });
	await page.waitForTimeout(4000);
	const targets = await page.evaluate((count) => {
		const here = location.pathname;
		const seen = new Set([here]);
		const links = [];
		for (const anchor of document.querySelectorAll('nav a[href^="/"]')) {
			const url = new URL(anchor.href);
			if (seen.has(url.pathname) || url.hash) continue;
			const box = anchor.getBoundingClientRect();
			if (!box.width || box.top < 0 || box.bottom > innerHeight) continue;
			seen.add(url.pathname);
			links.push(url.pathname);
		}
		// Spread over the sidebar, not its first few.
		const step = Math.max(1, Math.floor(links.length / count));
		return links.filter((_, index) => index % step === 0).slice(0, count);
	}, Number(values.targets));
	const plan = [
		...targets.map((path) => ({ path, visit: 'first' })),
		...targets.slice(0, Number(values.revisits)).map((path) => ({ path, visit: 'revisit' })),
	];
	const rows = [];
	for (const step of plan) {
		const link = page.locator(`nav a[href="${step.path}"]`).filter({ visible: true }).first();
		const box = await link.boundingBox().catch(() => null);
		if (!box) {
			rows.push({ ...step, error: 'link not on screen' });
			continue;
		}
		const before = await page.evaluate(() => ({
			h1: document.querySelector('h1')?.textContent ?? '',
			path: location.pathname,
		}));
		const sent = fragments.length;
		await page.evaluate((b) => {
			window.__t = { down: null, paint: null };
			document.addEventListener('pointerdown', () => (window.__t.down = performance.now()), {
				capture: true,
				once: true,
			});
			const tick = () => {
				const t = window.__t;
				const h1 = document.querySelector('h1')?.textContent ?? '';
				if (t.down != null && location.pathname !== b.path && h1 && h1 !== b.h1)
					return requestAnimationFrame(() => (t.paint = performance.now()));
				if (t.down == null || performance.now() - t.down < 20_000)
					requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		}, before);
		const x = box.x + box.width / 2;
		const y = box.y + box.height / 2;
		await page.mouse.move(x - 40, y);
		await page.mouse.move(x, y, { steps: 4 });
		await page.waitForTimeout(dwell);
		await page.mouse.down();
		await page.mouse.up();
		await page
			.waitForFunction(() => window.__t.paint != null, null, { timeout: 25_000 })
			.catch(() => {});
		const t = await page.evaluate(() => window.__t);
		await page.waitForTimeout(1500);
		const own = fragments
			.slice(sent)
			.filter((f) => new URL(f.url).pathname.endsWith(step.path));
		rows.push({
			...step,
			ms: t.paint != null ? Math.round(t.paint - t.down) : null,
			fragmentRequests: own.length,
			prefetchedBefore: fragments
				.slice(0, sent)
				.some((f) => new URL(f.url).pathname.endsWith(step.path)),
		});
		// Rest the pointer off the links before the next step.
		await page.mouse.move(1400, 880);
	}
	const bytes = fragments.reduce((sum, f) => sum + Math.max(0, finished.get(f.id) ?? 0), 0);
	const cancelled = fragments.filter((f) => finished.get(f.id) === -1).length;
	await context.close();
	return { rows, fragmentRequests: fragments.length, fragmentBytes: bytes, cancelled };
}

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
function summarise(samples) {
	const sorted = samples.filter((n) => n != null).toSorted((a, b) => a - b);
	if (!sorted.length) return null;
	return {
		median: quantile(sorted, 0.5),
		p10: quantile(sorted, 0.1),
		p90: quantile(sorted, 0.9),
		n: sorted.length,
	};
}

const server = await startServer(values.server);
const proxy = await startProxy(server.origin);
const browser = await chromium.launch();
const result = { label: values.label, dwellMs: dwell, runs, profiles: {} };
try {
	for (const name of values.profiles.split(',')) {
		const all = [];
		for (let run = 0; run < runs; run++)
			all.push(await measureRun(browser, proxy.origin, PROFILES[name]));
		const rows = all.flatMap((run) => run.rows);
		const cell = (visit) => {
			const picked = rows.filter((row) => row.visit === visit);
			return {
				ms: summarise(picked.map((row) => row.ms)),
				// Medians per run, so the spread shows run-to-run variation.
				runMedians: all.map(
					(run) =>
						summarise(
							run.rows.filter((row) => row.visit === visit).map((row) => row.ms),
						)?.median,
				),
				fragmentRequestsPerClick:
					picked.reduce((s, row) => s + (row.fragmentRequests ?? 0), 0) / picked.length,
				errors: picked.filter((row) => row.error).length,
			};
		};
		result.profiles[name] = {
			first: cell('first'),
			revisit: cell('revisit'),
			fragmentRequestsPerRun: all.reduce((s, run) => s + run.fragmentRequests, 0) / runs,
			fragmentKiloBytesPerRun: Math.round(
				all.reduce((s, run) => s + run.fragmentBytes, 0) / runs / 1024,
			),
			cancelledPerRun: all.reduce((s, run) => s + run.cancelled, 0) / runs,
			raw: all,
		};
		console.log(
			values.label,
			name,
			JSON.stringify({
				first: result.profiles[name].first.ms,
				revisit: result.profiles[name].revisit.ms,
			}),
		);
	}
} finally {
	await browser.close();
	proxy.close();
	server.close();
}
writeFileSync(values.out, JSON.stringify(result, null, 1));
