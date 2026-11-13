// Press-to-effect time when the press lands as soon as the button exists, before the page's preloads finish, on a throttled network.
// Usage: node early-press.mjs <built app dir> [runs]   env: PRESS (selector), EXPECT (text after the press), PROFILES
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { chromium } = createRequire(resolve(ROOT, 'demos/news/package.json'))('playwright');
const app = resolve(process.argv[2]);
const runs = Number(process.argv[3] ?? 5);
const press = process.env.PRESS ?? 'main > button';
const expected = process.env.EXPECT ?? 'Count 1';
const KBIT = 1000 / 8;
// The migrator's check profiles (src/check/throttle.ts), applied through Chromium's network emulation.
const PROFILES = {
	'regular-3g': { latency: 100, downloadThroughput: 750 * KBIT, uploadThroughput: 250 * KBIT },
	'slow-4g': { latency: 150, downloadThroughput: 1600 * KBIT, uploadThroughput: 750 * KBIT },
};
const profiles = (process.env.PROFILES ?? 'regular-3g,slow-4g').split(',');

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

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const browser = await chromium.launch();
const results = {};
try {
	for (const profile of profiles) {
		const samples = [];
		for (let run = 0; run < runs; run++) {
			const context = await browser.newContext();
			await context.addInitScript(
				([selector, value]) => {
					const record = (window.__press = {});
					document.addEventListener(
						'pointerdown',
						(event) => {
							if (record.at !== undefined || !event.target.closest?.(selector)) return;
							record.at = performance.now();
							const target = event.target.closest(selector);
							const check = () => {
								if (record.effect === undefined && target.textContent === value)
									record.effect = performance.now() - record.at;
							};
							new MutationObserver(check).observe(target, { subtree: true, childList: true, characterData: true });
							check();
						},
						true,
					);
				},
				[press, expected],
			);
			const page = await context.newPage();
			const errors = [];
			page.on('pageerror', (error) => errors.push(String(error.message)));
			const scripts = [];
			page.on('request', (request) => request.resourceType() === 'script' && scripts.push(request.url()));
			const cdp = await context.newCDPSession(page);
			await cdp.send('Network.enable');
			await cdp.send('Network.emulateNetworkConditions', { offline: false, ...PROFILES[profile] });
			await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
			const navigated = page.goto(url, { waitUntil: 'commit', timeout: 120000 });
			await navigated;
			await page.waitForSelector(press, { timeout: 120000 });
			const scriptsAtPress = scripts.length;
			await page.click(press, { timeout: 120000 });
			await page.waitForFunction(() => window.__press?.effect !== undefined, null, { timeout: 120000 }).catch(() => {});
			const record = await page.evaluate(() => ({
				...window.__press,
				// Scripts still downloading when the press landed.
				scriptsUnfinishedAtPress: performance
					.getEntriesByType('resource')
					.filter((entry) => entry.initiatorType !== 'fetch' && entry.name.endsWith('.js') && entry.responseEnd > (window.__press?.at ?? 0)).length,
			}));
			const loadDone = await page.evaluate(() => performance.getEntriesByType('navigation')[0]?.loadEventEnd ?? 0);
			samples.push({ effectMs: record?.effect ?? null, pressAt: record?.at, scriptsUnfinishedAtPress: record?.scriptsUnfinishedAtPress, scriptsRequestedBeforePress: scriptsAtPress, scriptsTotal: scripts.length, loadDone, errors });
			await context.close();
		}
		const effects = samples.map((sample) => sample.effectMs ?? Infinity);
		results[profile] = { medianMs: median(effects), minMs: Math.min(...effects), maxMs: Math.max(...effects), samples };
	}
} finally {
	await browser.close();
	server.kill();
}
console.log(JSON.stringify({ app, press, results }, null, 1));
