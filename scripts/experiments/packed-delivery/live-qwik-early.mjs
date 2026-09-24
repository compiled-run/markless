import fs from 'node:fs';
import { chromium } from '@playwright/test';
const origin = process.env.MARKLESS_PREVIEW_ORIGIN;
if (!origin) throw Error('MARKLESS_PREVIEW_ORIGIN is required');
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
const output = process.env.COMPARISON_OUTPUT;
if (!output) throw Error('COMPARISON_OUTPUT is required');
const selectedProfiles = process.env.COMPARISON_PROFILES?.split(',') ?? ['normal', 'constrained'];
const selectedKinds = process.env.COMPARISON_KINDS?.split(',') ?? ['sidebar', 'counter'];
const selectedSites = process.env.COMPARISON_SITES?.split(',') ?? ['markless', 'qwik'];
const sampleCount = Number(process.env.COMPARISON_SAMPLES ?? 5);
const receipt = {
	started: new Date().toISOString(),
	method: `fresh Chrome contexts, HTTP cache disabled, normal site workers allowed; input captured at window before app scripts; trusted mouse click immediately after first contentful paint and visible hittable control discovered; offscreen counter scrolled into view, no preload wait; navigation-to-first verified DOM response and click-to-DOM response; ${sampleCount} visits per selected site, control and condition; alternating site order when both sites are selected`,
	profiles: {
		normal: { cpu: 1 },
		constrained: { cpu: 4, rtt: 150, downloadMbps: 5, uploadMbps: 1 },
	},
	samples: [],
	selection: { selectedProfiles, selectedKinds, selectedSites, sampleCount },
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
receipt.browser = browser.version();
async function visit(name, kind, profile, iteration) {
	const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
	if (name === 'markless') await context.addCookies(cookies);
	const page = await context.newPage(),
		cdp = await context.newCDPSession(page);
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
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile === 'constrained' ? 4 : 1 });
	if (profile === 'constrained')
		await cdp.send('Network.emulateNetworkConditions', {
			offline: false,
			latency: 150,
			downloadThroughput: 625000,
			uploadThroughput: 125000,
		});
	const prefix = name === 'markless' ? '/markless/build/' : '/build/',
		pending = new Set(),
		requests = [],
		errors = [];
	page.on('request', (r) => {
		if (new URL(r.url()).pathname.startsWith(prefix)) {
			pending.add(r);
			requests.push(r.url());
		}
	});
	for (const type of ['requestfinished', 'requestfailed'])
		page.on(type, (r) => pending.delete(r));
	page.on('pageerror', (e) => errors.push(e.message));
	const url =
		name === 'markless'
			? origin + '/markless/concepts/state'
			: kind === 'sidebar'
				? 'https://next.qwik.dev/docs/core/state/'
				: 'https://next.qwik.dev/demo/state/counter-signal/';
	const row = { name, kind, profile, iteration, url };
	try {
		await page.addInitScript(
			({ kind }) => {
				performance.setResourceTimingBufferSize(10000);
				const a = (window.__early = {
					actions: [],
					transitions: [],
					target: null,
					watch: null,
					ready: null,
				});
				a.read = () =>
					kind === 'sidebar'
						? a.watch?.getAttribute('aria-expanded')
						: Number(a.target?.textContent.match(/\d+/)?.[0]);
				window.addEventListener(
					'pointerdown',
					(e) => {
						if (e.isTrusted) a.down = { time: performance.now(), event: e.timeStamp };
					},
					true,
				);
				window.addEventListener(
					'click',
					(e) => {
						if (e.isTrusted && a.target?.contains(e.target)) {
							a.actions.push({
								capture: performance.now(),
								event: e.timeStamp,
								pointerdown: a.down,
								before: a.read(),
							});
						}
					},
					true,
				);
				a.observe = () => {
					new MutationObserver(() => {
						const value = a.read();
						if (a.transitions.at(-1)?.value !== value)
							a.transitions.push({ time: performance.now(), value });
						const event = a.actions.find((x) => x.done === undefined);
						if (event && value !== event.before) {
							event.done = performance.now();
							event.after = value;
							event.ms = event.done - event.capture;
							event.pointerdownMs = event.done - event.pointerdown.time;
						}
					}).observe(a.watch, {
						attributes: true,
						childList: true,
						characterData: true,
						subtree: true,
					});
				};
			},
			{ name, kind },
		);
		const response = await page.goto(url, { waitUntil: 'commit', timeout: 60000 });
		row.status = response.status();
		await page.waitForFunction(
			({ name, kind }) => {
				const a = window.__early;
				if (!a || !performance.getEntriesByName('first-contentful-paint').length)
					return false;
				const target = [...document.querySelectorAll('button')].find((x) =>
					kind === 'sidebar'
						? x.textContent.trim() ===
							(name === 'markless' ? 'Core concepts' : 'Foundation')
						: (name === 'markless' ? /^Clicked \d+ times$/ : /^Increment \d+$/).test(
								x.textContent.trim(),
							),
				);
				if (!target) return false;
				if (kind === 'counter') {
					const r = target.getBoundingClientRect();
					if (r.top < 0 || r.bottom > innerHeight)
						target.scrollIntoView({ block: 'center', behavior: 'instant' });
				}
				const box = target.getBoundingClientRect(),
					style = getComputedStyle(target),
					x = box.left + box.width / 2,
					y = box.top + box.height / 2;
				if (
					!box.width ||
					!box.height ||
					style.visibility === 'hidden' ||
					style.display === 'none' ||
					x < 0 ||
					y < 0 ||
					x > innerWidth ||
					y > innerHeight ||
					!target.contains(document.elementFromPoint(x, y))
				)
					return false;
				a.target = target;
				a.watch =
					kind === 'sidebar' && name === 'markless'
						? target.closest('[role=treeitem]')
						: target;
				a.ready = {
					time: performance.now(),
					x,
					y,
					value:
						kind === 'sidebar'
							? a.watch.getAttribute('aria-expanded')
							: Number(target.textContent.match(/\d+/)[0]),
				};
				a.observe();
				return true;
			},
			{ name, kind },
			{ polling: 'raf', timeout: 10000 },
		);
		const ready = await page.evaluate(() => window.__early.ready);
		row.pendingAtInput = pending.size;
		row.frameworkRequestsAtInput = requests.length;
		await page.mouse.click(ready.x, ready.y, { delay: 0 });
		await page.waitForFunction(() => window.__early.actions[0]?.done !== undefined, null, {
			timeout: 10000,
		});
		row.first = await page.evaluate(() => ({
			ready: window.__early.ready,
			action: window.__early.actions[0],
			navigationToWorking: window.__early.actions[0].done,
			visibleDetectionToClick: window.__early.actions[0].capture - window.__early.ready.time,
			paint: performance
				.getEntriesByType('paint')
				.map((x) => ({ name: x.name, start: x.startTime })),
		}));
		if (kind === 'counter') {
			const expected = ready.value + 11,
				start = await page.evaluate(() => performance.now());
			for (let i = 0; i < 10; i++) await page.mouse.click(ready.x, ready.y, { delay: 0 });
			await page.waitForFunction((expected) => window.__early.read() === expected, expected, {
				timeout: 10000,
			});
			row.burst = await page.evaluate(
				({ expected, start }) => ({
					expected,
					actual: window.__early.read(),
					trustedClicks: window.__early.actions.length,
					elapsed: performance.now() - start,
					clickTimes: window.__early.actions.map((x) => x.capture),
					transitions: window.__early.transitions,
				}),
				{ expected, start },
			);
		} else {
			for (let i = 1; i < 3; i++) {
				await page.mouse.click(ready.x, ready.y, { delay: 0 });
				await page.waitForFunction(
					(i) => window.__early.actions[i]?.done !== undefined,
					i,
					{ timeout: 10000 },
				);
			}
			row.repeats = await page.evaluate(() => window.__early.actions.slice(1));
		}
		row.success = true;
	} catch (e) {
		row.success = false;
		row.error = String(e);
		row.audit = await page
			.evaluate(() => {
				const a = window.__early;
				return a
					? {
							ready: a.ready,
							actions: a.actions,
							transitions: a.transitions,
							value: a.read(),
						}
					: null;
			})
			.catch(() => null);
		if (kind === 'counter' && row.audit?.ready) {
			await page.mouse.click(row.audit.ready.x, row.audit.ready.y, { delay: 0 });
			await page.waitForTimeout(1000);
			row.recovery = await page.evaluate(() => ({
				value: window.__early.read(),
				connected: window.__early.target?.isConnected,
				actions: window.__early.actions,
				buttons: [...document.querySelectorAll('button')]
					.map((x) => x.textContent)
					.filter((x) => /^(Clicked|Increment)/.test(x)),
			}));
		}
	} finally {
		row.delivery = delivery;
		row.cacheEvents = cacheEvents;
		row.failures = failures;
		row.serviceWorker = await page
			.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null)
			.catch(() => null);
		row.mainDocumentFramework = await page
			.evaluate((prefix) => {
				const resources = performance
					.getEntriesByType('resource')
					.filter(
						(x) =>
							new URL(x.name).pathname.startsWith(prefix) &&
							new URL(x.name).pathname.endsWith('.js'),
					);
				return {
					requests: resources.length,
					encodedBytes: resources.reduce((n, x) => n + x.encodedBodySize, 0),
				};
			}, prefix)
			.catch(() => null);
		row.errors = errors;
		row.frameworkRequestsTotal = requests.length;
		row.pendingAtFinish = pending.size;
		receipt.samples.push(row);
		fs.writeFileSync(output, JSON.stringify(receipt, null, 2));
		console.log(
			JSON.stringify({
				name,
				kind,
				profile,
				iteration,
				success: row.success,
				first: row.first?.action.ms,
				navToWorking: row.first?.navigationToWorking,
				pendingAtInput: row.pendingAtInput,
				burst: row.burst
					? {
							actual: row.burst.actual,
							expected: row.burst.expected,
							trustedClicks: row.burst.trustedClicks,
						}
					: undefined,
				error: row.error,
				errors,
			}),
		);
		await context.close();
	}
}
try {
	for (const profile of selectedProfiles)
		for (const kind of selectedKinds)
			for (let i = 0; i < sampleCount; i++)
				for (const name of (i % 2 ? ['qwik', 'markless'] : ['markless', 'qwik']).filter(
					(name) => selectedSites.includes(name),
				))
					await visit(name, kind, profile, i);
	receipt.finished = new Date().toISOString();
	fs.writeFileSync(output, JSON.stringify(receipt, null, 2));
} finally {
	await browser.close();
}
