import fs from 'node:fs';
import { chromium } from '@playwright/test';
const output = process.env.COMPARISON_OUTPUT;
if (!output) throw Error('COMPARISON_OUTPUT is required');
const cookies = fs
	.readFileSync(process.env.PREVIEW_COOKIE_JAR, 'utf8')
	.split('\n')
	.filter((x) => x.includes('\t'))
	.map((l) => {
		const [d, , p, s, e, n, v] = l.split('\t');
		return {
			domain: d.replace(/^#HttpOnly_/, ''),
			path: p,
			secure: s === 'TRUE',
			httpOnly: d.startsWith('#HttpOnly_'),
			expires: Number(e) || -1,
			name: n,
			value: v,
		};
	});
const sites = {
	markless: {
		url: process.env.MARKLESS_PREVIEW_ORIGIN + '/markless/concepts/state',
		prefix: '/markless/build/',
		button: 'Core concepts',
		watch: '[role="treeitem"][aria-label="Core concepts"]',
	},
	qwik: {
		url: 'https://next.qwik.dev/docs/core/state/',
		prefix: '/build/',
		button: 'Foundation',
	},
};
const receipt = {
	started: new Date().toISOString(),
	method: 'trusted captured click to aria-expanded mutation, preloads settled; ten fresh contexts per site and CPU condition, three clicks each; alternating site order; one warmup visit per site excluded; no network throttling; HTTP cache disabled; service workers allowed; fresh storage, no pre-existing registrations',
	noiseThreshold: 'max(10 ms, 10% of slower median, twice larger MAD)',
	samples: [],
	warmup: [],
	failures: [],
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
receipt.browser = browser.version();
const median = (a) => {
	const s = [...a].sort((x, y) => x - y);
	return (s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2;
};
async function visit(name, cpu, iteration, warmup = false) {
	const site = sites[name],
		context = await browser.newContext({
			viewport: { width: 1440, height: 1000 },
			serviceWorkers: 'allow',
		});
	if (name === 'markless') await context.addCookies(cookies);
	const page = await context.newPage(),
		cdp = await context.newCDPSession(page),
		pending = new Set(),
		requests = [],
		errors = [];
	const delivery = [];
	const cacheEvents = [];
	const failures = [];
	cdp.on('Network.responseReceived', (e) =>
		delivery.push({
			url: e.response.url,
			status: e.response.status,
			protocol: e.response.protocol,
			fromDiskCache: !!e.response.fromDiskCache,
			fromServiceWorker: !!e.response.fromServiceWorker,
		}),
	);
	cdp.on('Network.requestServedFromCache', (e) => cacheEvents.push(e.requestId));
	page.on('requestfailed', (r) => failures.push({ url: r.url(), error: r.failure() }));
	await cdp.send('Network.enable');
	await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
	page.on('request', (r) => {
		requests.push({ url: r.url(), type: r.resourceType() });
		if (new URL(r.url()).pathname.startsWith(site.prefix)) pending.add(r);
	});
	for (const event of ['requestfinished', 'requestfailed'])
		page.on(event, (r) => pending.delete(r));
	page.on('pageerror', (e) => errors.push(e.message));
	try {
		await page.addInitScript(() => {
			performance.setResourceTimingBufferSize(10000);
			window.__liveTiming = { clicks: [], el: null };
			window.addEventListener(
				'pointerdown',
				(e) => {
					if (e.isTrusted)
						window.__liveTiming.down = { time: performance.now(), event: e.timeStamp };
				},
				true,
			);
			window.addEventListener(
				'click',
				(e) => {
					const a = window.__liveTiming;
					if (e.isTrusted && a.el)
						a.clicks.push({
							capture: performance.now(),
							event: e.timeStamp,
							pointerdown: a.down,
							before: a.el.getAttribute('aria-expanded'),
						});
				},
				true,
			);
		});
		const response = await page.goto(site.url, {
			waitUntil: 'domcontentloaded',
			timeout: 60000,
		});
		if (response.status() !== 200) throw Error('HTTP ' + response.status());
		await page.waitForTimeout(750);
		for (let i = 0; pending.size && i < 100; i++) await page.waitForTimeout(200);
		if (pending.size) throw Error('Script requests still pending');
		const target = page.getByRole('button', { name: site.button, exact: true });
		await target.waitFor({ state: 'visible' });
		const watched = site.watch ? page.locator(site.watch) : target;
		const handle = await watched.elementHandle();
		await page.evaluate((el) => {
			window.__liveTiming.el = el;
			new MutationObserver(() => {
				const a = window.__liveTiming.clicks.at(-1);
				if (a && !a.done && el.getAttribute('aria-expanded') !== a.before) {
					a.done = performance.now();
					a.after = el.getAttribute('aria-expanded');
					a.ms = a.done - a.capture;
					a.eventMs = a.done - a.event;
					a.pointerdownMs = a.done - a.pointerdown.time;
				}
			}).observe(el, { attributes: true, attributeFilter: ['aria-expanded'] });
		}, handle);
		const initial = await page.evaluate((prefix) => {
			const rs = performance
				.getEntriesByType('resource')
				.filter(
					(r) =>
						new URL(r.name).pathname.startsWith(prefix) &&
						new URL(r.name).pathname.endsWith('.js'),
				);
			return {
				frameworkRequests: rs.length,
				encodedBytes: rs.reduce((s, x) => s + x.encodedBodySize, 0),
				zeroTransfer: rs.filter((x) => !x.transferSize).length,
			};
		}, site.prefix);
		const actions = [];
		for (let action = 0; action < 3; action++) {
			const cursor = requests.length;
			await target.click();
			await page.waitForFunction(
				(i) => window.__liveTiming.clicks[i]?.done !== undefined,
				action,
				{ timeout: 15000 },
			);
			const timing = await page.evaluate((i) => window.__liveTiming.clicks[i], action);
			await page.waitForTimeout(100);
			actions.push({
				...timing,
				newScriptRequests: requests.slice(cursor).filter((r) => r.type === 'script'),
				pendingScripts: pending.size,
			});
		}
		const result = {
			name,
			cpu,
			iteration,
			url: site.url,
			initial,
			actions,
			errors,
			delivery,
			cacheEvents,
			failures,
			serviceWorker: await page.evaluate(
				() => navigator.serviceWorker.controller?.scriptURL ?? null,
			),
		};
		(warmup ? receipt.warmup : receipt.samples).push(result);
		console.log(
			JSON.stringify({
				name,
				cpu,
				iteration,
				warmup,
				times: actions.map((x) => Number(x.ms.toFixed(2))),
				requests: initial.frameworkRequests,
				actionScripts: actions.map((x) => x.newScriptRequests.length),
				errors,
			}),
		);
	} catch (e) {
		const failure = {
			name,
			cpu,
			iteration,
			error: String(e),
			errors,
			dom: await page
				.locator('button')
				.evaluateAll((es) =>
					es
						.filter((x) => x.textContent?.trim() === 'Foundation')
						.map((x) => ({
							expanded: x.getAttribute('aria-expanded'),
							connected: x.isConnected,
						})),
				)
				.catch(() => []),
		};
		receipt.failures.push(failure);
		console.log(JSON.stringify(failure));
		throw e;
	} finally {
		await context.close();
		fs.writeFileSync(output, JSON.stringify(receipt, null, 2));
	}
}
try {
	for (const name of ['markless', 'qwik']) await visit(name, 1, -1, true);
	for (const cpu of [1, 4])
		for (let i = 0; i < 10; i++)
			for (const name of i % 2 ? ['qwik', 'markless'] : ['markless', 'qwik'])
				await visit(name, cpu, i);
	receipt.summary = [];
	for (const cpu of [1, 4])
		for (const name of ['markless', 'qwik']) {
			const samples = receipt.samples.filter((x) => x.cpu === cpu && x.name === name);
			receipt.summary.push({
				name,
				cpu,
				visits: samples.length,
				actions: [0, 1, 2].map((i) => {
					const values = samples.map((s) => s.actions[i].ms),
						m = median(values);
					return {
						median: m,
						mad: median(values.map((x) => Math.abs(x - m))),
						min: Math.min(...values),
						max: Math.max(...values),
					};
				}),
				requestCounts: [...new Set(samples.map((x) => x.initial.frameworkRequests))],
				actionScriptRequests: samples.reduce(
					(n, s) => n + s.actions.reduce((n, a) => n + a.newScriptRequests.length, 0),
					0,
				),
				errors: samples.flatMap((s) => s.errors),
			});
		}
	receipt.finished = new Date().toISOString();
	fs.writeFileSync(output, JSON.stringify(receipt, null, 2));
	console.log(JSON.stringify({ summary: receipt.summary, failures: receipt.failures }, null, 2));
} finally {
	await browser.close();
}
