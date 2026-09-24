// One Chromium visit with CDP network timing (start and end per request), optional V8 precise coverage and
// response bodies, driven with the benchmark's page agent so readiness and response detection match run.mjs.
import zlib from 'node:zlib';
import { pageAgent } from '../../lib/page-agent.mjs';

export const VIEWPORT = { width: 1440, height: 1000 };
const INPUT_EVENTS = { click: ['pointerdown'], press: ['keydown'], insertText: ['input'] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const contextLost = (e) => /Execution context was destroyed|navigat|frame was detached|Cannot find context/i.test(String(e?.message ?? e));

async function poll(page, fn, arg, timeoutMs, polling = 'raf') {
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

async function evaluate(page, fn, arg) {
	for (let i = 0; i < 40; i++) {
		try {
			return await page.evaluate(fn, arg);
		} catch (error) {
			if (!contextLost(error)) throw error;
			await sleep(25);
		}
	}
	throw new Error('page context kept changing');
}

export const isJs = (e) => e.type === 'script' || /javascript|ecmascript/i.test(e.mimeType ?? '') || /\.m?js(\?|$)/.test(e.url);

/**
 * options: { cpu, coverage, bodies, actionTimeoutMs }.
 * Returns helpers; all epochs are wall-clock ms (CDP wallTime and page timeOrigin + now share that clock).
 */
export async function openVisit(browser, { cpu = 1, coverage = false, bodies = false, actionTimeoutMs = 10000 } = {}) {
	const context = await browser.newContext({ viewport: VIEWPORT, serviceWorkers: 'allow', ignoreHTTPSErrors: true });
	await context.addInitScript(pageAgent);
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e?.message ?? e).slice(0, 300)));
	const cdp = await context.newCDPSession(page);
	const byId = new Map();
	const entries = [];
	let clockOffset = null;
	const toEpoch = (ts) => (clockOffset === null ? null : (ts + clockOffset) * 1000);
	const bodyJobs = [];
	cdp.on('Network.requestWillBeSent', (e) => {
		if (clockOffset === null && e.wallTime) clockOffset = e.wallTime - e.timestamp;
		const existing = byId.get(e.requestId);
		if (existing) {
			existing.url = e.request.url;
			return;
		}
		const entry = {
			url: e.request.url,
			method: e.request.method,
			type: (e.type ?? 'other').toLowerCase(),
			initiator: e.initiator?.type ?? null,
			linkPreload: !!e.request.isLinkPreload,
			priority: e.request.initialPriority ?? null,
			startEpoch: e.wallTime * 1000,
			endEpoch: null,
			status: null,
			mimeType: null,
			headerBytes: 0,
			wireBytes: 0,
			decodedBytes: 0,
			failed: null,
		};
		byId.set(e.requestId, entry);
		entries.push(entry);
	});
	cdp.on('Network.responseReceived', (e) => {
		const entry = byId.get(e.requestId);
		if (!entry) return;
		entry.type = (e.type ?? entry.type).toLowerCase();
		entry.status = e.response.status;
		entry.mimeType = e.response.mimeType ?? null;
		entry.headerBytes = e.response.encodedDataLength ?? 0;
	});
	cdp.on('Network.dataReceived', (e) => {
		const entry = byId.get(e.requestId);
		if (entry) entry.decodedBytes += e.dataLength;
	});
	cdp.on('Network.loadingFinished', (e) => {
		const entry = byId.get(e.requestId);
		if (!entry) return;
		entry.endEpoch = toEpoch(e.timestamp);
		entry.wireBytes = Math.max(0, e.encodedDataLength - entry.headerBytes);
		if (bodies && (isJs(entry) || entry.type === 'document'))
			bodyJobs.push(
				cdp
					.send('Network.getResponseBody', { requestId: e.requestId })
					.then(({ body, base64Encoded }) => {
						const buf = base64Encoded ? Buffer.from(body, 'base64') : Buffer.from(body, 'utf8');
						entry.gzipBytes = zlib.gzipSync(buf, { level: 6 }).length;
						entry.bodyBytes = buf.length;
						if (isJs(entry)) entry.text = buf.toString('utf8');
					})
					.catch((err) => (entry.bodyError = String(err.message ?? err).slice(0, 120))),
			);
	});
	cdp.on('Network.loadingFailed', (e) => {
		const entry = byId.get(e.requestId);
		if (!entry) return;
		entry.endEpoch = toEpoch(e.timestamp);
		entry.failed = { errorText: e.errorText, canceled: !!e.canceled };
	});
	await cdp.send('Network.enable');
	await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
	if (cpu !== 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
	const coverageSnapshots = [];
	if (coverage) {
		await cdp.send('Profiler.enable');
		await cdp.send('Profiler.startPreciseCoverage', { callCount: false, detailed: true });
	}
	const inFlight = () => entries.filter((e) => e.endEpoch === null).length;

	const visit = {
		page,
		entries,
		errors,
		coverageSnapshots,
		async goto(url, waitUntil = 'load') {
			const res = await page.goto(url, { waitUntil, timeout: 60000 });
			return res?.status() ?? null;
		},
		/** Waits for quietMs with no request in flight (max timeoutMs). */
		async settle(quietMs = 1000, timeoutMs = 20000) {
			const start = Date.now();
			let quietSince = Date.now();
			while (Date.now() - start < timeoutMs) {
				if (inFlight()) quietSince = Date.now();
				else if (Date.now() - quietSince >= quietMs) return { waitedMs: Date.now() - start, timedOut: false };
				await sleep(25);
			}
			return { waitedMs: Date.now() - start, timedOut: true };
		},
		/** Execution since the previous snapshot (V8 resets the binary counters on every take). */
		async takeCoverage(label) {
			if (!coverage) return null;
			const { result } = await cdp.send('Profiler.takePreciseCoverage');
			const snap = { label, epoch: Date.now(), scripts: result.filter((s) => s.url && !s.url.startsWith('pptr:') && !s.url.startsWith('__playwright')) };
			coverageSnapshots.push(snap);
			return snap;
		},
		async waitActionable(target) {
			const hit = await poll(page, (t) => window.__bench?.actionable(t) ?? false, target, actionTimeoutMs);
			if (!hit) throw new Error(`${target.selector} not actionable within ${actionTimeoutMs} ms`);
			return hit;
		},
		/** Untimed step (CONTRACT case `pre` shape). */
		async step(step) {
			if (step.click) {
				const hit = await visit.waitActionable(step.click);
				for (let i = 0; i < (step.times ?? 1); i++) await page.mouse.click(hit.x, hit.y);
			} else if (step.hover) {
				const hit = await visit.waitActionable(step.hover);
				await page.mouse.move(hit.x, hit.y);
			} else if (step.focus) {
				const ok = await poll(page, (t) => window.__bench?.focus(t) ?? false, step.focus, actionTimeoutMs);
				if (!ok) throw new Error(`could not focus ${step.focus.selector}`);
			} else if (step.selectAll) await page.keyboard.press('ControlOrMeta+A');
			else if (step.press) await page.keyboard.press(step.press);
			else if (step.insertText !== undefined) await page.keyboard.insertText(step.insertText);
			else if (step.scrollTo !== undefined) await evaluate(page, (y) => window.scrollTo(0, y), step.scrollTo);
			else if (step.waitFor) {
				const ok = await poll(page, (p) => window.__bench?.check(p) ?? false, step.waitFor, actionTimeoutMs);
				if (!ok) throw new Error('waitFor assertion did not hold');
			} else if (step.goBack) await page.goBack({ waitUntil: 'commit' });
		},
		/** Measured input with the page agent's input and presentation detection. Returns epochs. */
		async measure(step, expect, actionId = 'measured') {
			const kind = step.click ? 'click' : step.press ? 'press' : 'insertText';
			const armSpec = { actionId, inputEvents: INPUT_EVENTS[kind], documentFallback: false, stages: [{ name: 'response', expect }] };
			let hit = null;
			if (step.click) {
				hit = await poll(
					page,
					({ target, armSpec }) => {
						const B = window.__bench;
						const point = B?.actionable(target);
						if (!point) return false;
						B.arm(armSpec);
						return point;
					},
					{ target: step.click, armSpec },
					actionTimeoutMs,
				);
				if (!hit) throw new Error(`${step.click.selector} not actionable within ${actionTimeoutMs} ms`);
			} else await evaluate(page, (spec) => window.__bench.arm(spec), armSpec);
			const sentAt = Date.now();
			if (step.click) for (let i = 0; i < (step.times ?? 1); i++) await page.mouse.click(hit.x, hit.y);
			else if (step.press) await page.keyboard.press(step.press);
			else await page.keyboard.insertText(step.insertText);
			const result = await poll(page, (id) => window.__bench?.resultFor(id) ?? false, actionId, actionTimeoutMs, 20);
			if (!result) {
				const armed = await evaluate(page, () => window.__bench?.armedState() ?? null).catch(() => null);
				const error = new Error(`${armed?.inputEpoch != null ? 'input observed, ' : ''}no response for ${actionId} within ${actionTimeoutMs} ms`);
				Object.assign(error, { sentAt, inputEpoch: armed?.inputEpoch ?? null, navOrigin: await evaluate(page, () => window.__bench.navOrigin).catch(() => null) });
				throw error;
			}
			const stage = result.stages.at(-1);
			const inputEpoch = Number.isFinite(result.inputEpoch) && Math.abs(result.inputEpoch - result.inputCaptureEpoch) < 10000 ? result.inputEpoch : result.inputCaptureEpoch;
			const navOrigin = await evaluate(page, () => window.__bench.navOrigin);
			return { sentAt, actionableEpoch: hit?.epoch ?? null, inputEpoch, domEpoch: stage.domEpoch, presentEpoch: stage.presentEpoch, navOrigin };
		},
		async hints() {
			return evaluate(page, () => [...document.querySelectorAll('link[rel="modulepreload"], link[rel="preload"], link[rel="prefetch"]')].map((l) => ({ rel: l.rel, href: l.href, as: l.getAttribute('as') })));
		},
		async close() {
			await Promise.allSettled(bodyJobs);
			if (coverage) await cdp.send('Profiler.stopPreciseCoverage').catch(() => {});
			await context.close().catch(() => {});
		},
		async finishBodies() {
			await Promise.allSettled(bodyJobs);
		},
	};
	return visit;
}
