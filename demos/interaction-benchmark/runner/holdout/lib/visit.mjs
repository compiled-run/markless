// One fresh-context holdout visit in Chromium or WebKit: page agent + page probe, a per-request network log
// from Playwright events (both browsers), and in Chromium the CDP cache/CPU settings and optional V8 coverage.
import { pageAgent } from '../../lib/page-agent.mjs';
import { CONTROL_SELECTOR } from '../../lib/controls.mjs';
import { startCoverage } from '../../lib/coverage.mjs';
import { CONTROL_SELECTOR_EXTRA, pageProbe } from './page-probe.mjs';

export const VIEWPORT = { width: 1440, height: 1000 };
export const SELECTOR = `${CONTROL_SELECTOR}, ${CONTROL_SELECTOR_EXTRA}`;
export const TEXT_INPUT_TYPES = ['', 'text', 'search', 'email', 'number', 'tel', 'url', 'password'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const contextLost = (e) =>
	/Execution context was destroyed|navigat|frame was detached|Cannot find context/i.test(
		String(e?.message ?? e),
	);
export const isJsUrl = (url) => /\.m?js(?:[?#]|$)/.test(url);

export const classify = (entry) => {
	if (entry.resourceType === 'document') return 'document';
	if (entry.resourceType === 'script' || isJsUrl(entry.url)) return 'js';
	if (entry.resourceType === 'stylesheet' || /\.css(?:[?#]|$)/.test(entry.url)) return 'css';
	if (entry.resourceType === 'fetch' || entry.resourceType === 'xhr') return 'data';
	return 'other';
};

export async function poll(page, fn, arg, timeoutMs, polling = 'raf') {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const remaining = deadline - Date.now();
		if (remaining <= 0) return null;
		try {
			const handle = await page.waitForFunction(fn, arg, { timeout: remaining, polling });
			const value = await handle.jsonValue();
			handle.dispose().catch(() => {});
			return value;
		} catch (error) {
			if (contextLost(error)) {
				await sleep(10);
				continue;
			}
			if (/Timeout/i.test(String(error?.message))) return null;
			throw error;
		}
	}
}

export async function evaluate(page, fn, arg) {
	for (let i = 0; i < 80; i++) {
		try {
			return await page.evaluate(fn, arg);
		} catch (error) {
			if (!contextLost(error)) throw error;
			await sleep(25);
		}
	}
	throw new Error('page context kept changing');
}

/** options: { browserName, cpu, coverage }. */
export async function openVisit(browser, { browserName, cpu = 1, coverage = false }) {
	const context = await browser.newContext({
		viewport: VIEWPORT,
		serviceWorkers: 'block',
		ignoreHTTPSErrors: true,
	});
	await context.addInitScript(pageAgent);
	await context.addInitScript(pageProbe, { selector: SELECTOR, textTypes: TEXT_INPUT_TYPES });
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e?.message ?? e).slice(0, 300)));
	const entries = [];
	const byRequest = new Map();
	const jobs = [];
	page.on('request', (request) => {
		let frame = null;
		try {
			frame = request.frame();
		} catch {}
		if (frame !== page.mainFrame()) return;
		const entry = {
			url: request.url(),
			resourceType: request.resourceType(),
			startEpoch: Date.now(),
			endEpoch: null,
			wireBytes: null,
			failed: null,
			navigation: request.isNavigationRequest(),
		};
		byRequest.set(request, entry);
		entries.push(entry);
	});
	const finish = (request, failed) => {
		const entry = byRequest.get(request);
		if (!entry) return;
		const timing = request.timing();
		entry.startEpoch = timing.startTime > 0 ? timing.startTime : entry.startEpoch;
		entry.endEpoch =
			timing.responseEnd >= 0 ? timing.startTime + timing.responseEnd : Date.now();
		if (failed) entry.failed = request.failure()?.errorText ?? 'failed';
		else
			jobs.push(
				request
					.sizes()
					.then((s) => (entry.wireBytes = s.responseBodySize))
					.catch(() => (entry.wireBytes = 0)),
			);
	};
	page.on('requestfinished', (r) => finish(r, false));
	page.on('requestfailed', (r) => finish(r, true));
	let cov = null;
	if (browserName === 'chromium') {
		const cdp = await context.newCDPSession(page);
		await cdp.send('Network.enable');
		await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
		if (cpu !== 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
		if (coverage) cov = await startCoverage(context, page);
	}
	const inFlight = () => entries.filter((e) => e.endEpoch === null).length;
	const visit = {
		page,
		entries,
		errors,
		coverage: cov,
		async goto(url, waitUntil = 'load') {
			const res = await page.goto(url, { waitUntil, timeout: 60000 });
			return res?.status() ?? null;
		},
		/** Waits for `load`, then quietMs with no request in flight (max timeoutMs), then two frames. */
		async settle(quietMs = 500, timeoutMs = 20000) {
			const start = Date.now();
			await page.waitForLoadState('load', { timeout: timeoutMs }).catch(() => {});
			let quietSince = Date.now();
			let timedOut = true;
			while (Date.now() - start < timeoutMs) {
				if (inFlight()) quietSince = Date.now();
				else if (Date.now() - quietSince >= quietMs) {
					timedOut = false;
					break;
				}
				await sleep(25);
			}
			await evaluate(
				page,
				() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
			).catch(() => {});
			return { waitedMs: Date.now() - start, timedOut };
		},
		async sizes() {
			await Promise.allSettled(jobs);
		},
		probe: (fn, arg) => evaluate(page, fn, arg),
		/**
		 * The current document's navigation and resource entries started at or after sinceEpoch, as epochs.
		 * Resource Timing is the same clock in both browsers; Playwright's WebKit request timing is not usable
		 * for ordering thousands of requests.
		 */
		async resourceTimeline(sinceEpoch = -Infinity) {
			return evaluate(
				page,
				(since) => {
					const origin = performance.timeOrigin;
					const entries = [
						...performance.getEntriesByType('navigation'),
						...performance.getEntriesByType('resource'),
					];
					return entries
						.map((e) => ({
							url: e.name,
							startEpoch: origin + e.startTime,
							endEpoch: e.responseEnd > 0 ? origin + e.responseEnd : null,
						}))
						.filter((e) => e.startEpoch >= since);
				},
				sinceEpoch,
			);
		},
		async hints() {
			return evaluate(page, () =>
				[
					...document.querySelectorAll(
						'link[rel="modulepreload"], link[rel="preload"], link[rel="prefetch"]',
					),
				].map((l) => ({ rel: l.rel, href: l.href, as: l.getAttribute('as') })),
			);
		},
		async close() {
			await Promise.allSettled(jobs);
			await cov?.stop();
			await context.close().catch(() => {});
		},
	};
	return visit;
}
