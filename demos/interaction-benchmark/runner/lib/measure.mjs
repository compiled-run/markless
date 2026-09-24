import { pageAgent } from './page-agent.mjs';
import { appliedProfile } from './profiles.mjs';

export const SCHEMA_VERSION = 1;
export const VIEWPORT = { width: 1440, height: 1000 };
const SETTLE_QUIET_MS = 500;
const SETTLE_EXTRA_MS = 500;

export const labels = {
	inputToResponseMs: 'input event.timeStamp -> presentation estimate: start of the first animation frame after the assertion holds, then the next rAF callback (not a paint timestamp)',
	inputToDomMs: 'input event.timeStamp -> first moment the assertion holds (MutationObserver callback or per-frame check)',
	navToResponseMs: 'performance.timeOrigin of the first document -> presentation estimate (early phase only; null for settled, where the runner wait dominates)',
	pendingMs: 'input -> presentation estimate of the pending assertion',
	serverMs: 'Resource Timing responseEnd - requestStart of the server request',
	eventDurationMs: 'Chromium Event Timing: max duration over the input interaction; null when no entry reached the 16 ms reporting threshold or the browser lacks Event Timing',
	bytes: 'responses whose request started before the presentation estimate, counted in full after in-flight requests finish (drain, max drainTimeoutMs); compressed = encoded body (Resource Timing encodedBodySize when non-zero, else CDP total minus header bytes / WebKit request.sizes().responseBodySize); decoded = CDP dataReceived sum / WebKit Resource Timing decodedBodySize',
	requests: 'main-frame requests; initial = started before the input; perAction = input to presentation estimate',
};

const INPUT_EVENTS = { click: ['pointerdown'], press: ['keydown'], insertText: ['input'], goBack: ['popstate', 'navigate'] };

const contextLost = (e) => /Execution context was destroyed|navigat|frame was detached|Cannot find context|Target page, context or browser has been closed/i.test(String(e?.message ?? e));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// waitForFunction that survives document replacement until its deadline; returns null on timeout.
async function pollPage(page, fn, arg, { timeoutMs, polling = 'raf' }) {
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
			if (contextLost(error) && !/closed/i.test(String(error?.message))) {
				await sleep(10);
				continue;
			}
			if (/Timeout/i.test(String(error?.message))) return null;
			throw error;
		}
	}
}

async function evaluateSafe(page, fn, arg) {
	for (let i = 0; i < 40; i++) {
		try {
			return await page.evaluate(fn, arg);
		} catch (error) {
			if (!contextLost(error) || /closed/i.test(String(error?.message))) throw error;
			await sleep(25);
		}
	}
	throw new Error('page context kept changing');
}

class VisitFailure extends Error {
	constructor(kind, message, observed) {
		super(message);
		this.kind = kind;
		this.observed = observed;
	}
}

function parsePreloadHints(html, linkHeader) {
	const count = { modulepreload: 0, preload: 0 };
	const fromHtml = { ...count };
	for (const tag of html?.match(/<link\b[^>]*>/gi) ?? []) {
		const rel = tag.match(/\brel\s*=\s*["']?([^"'\s>]+)/i)?.[1]?.toLowerCase();
		if (rel in fromHtml) fromHtml[rel]++;
	}
	const fromHeader = { ...count };
	for (const part of (linkHeader ?? '').split(/,(?=\s*<)/)) {
		const rel = part.match(/;\s*rel\s*=\s*"?([^";,]+)/i)?.[1]?.toLowerCase();
		for (const r of rel?.split(/\s+/) ?? []) if (r in fromHeader) fromHeader[r]++;
	}
	return { html: fromHtml, header: fromHeader, total: fromHtml.modulepreload + fromHtml.preload + fromHeader.modulepreload + fromHeader.preload };
}

function eventDuration(events, inputTimeStamp, inputEventType) {
	if (!events || inputTimeStamp === null) return { value: null, reason: events ? 'no input timestamp' : 'Event Timing unsupported' };
	const first = events.find((e) => e.name === inputEventType && Math.abs(e.startTime - inputTimeStamp) < 1);
	if (!first) return { value: null, reason: 'no Event Timing entry at or above the 16 ms threshold' };
	const related = first.interactionId ? events.filter((e) => e.interactionId === first.interactionId) : [first];
	return { value: Math.max(...related.map((e) => e.duration)), reason: null };
}

/**
 * One fresh-context visit of one case in one phase. Returns { result, raw }: `result` conforms to
 * shared/result.schema.json, `raw` keeps every diagnostic. Page behaviour never throws out of here.
 */
export async function runVisit({ browser, browserName, playwrightVersion, target, caseDef, phase, profile, visitIndex, order, runId, opts }) {
	const failures = [];
	const isChromium = browserName === 'chromium';
	const applied = appliedProfile(profile, browserName, opts.networkShaping);
	const shapedBase = applied.networkMethod === 'proxy' ? target.shapedUrls?.[profile.name] : undefined;
	const url = new URL(caseDef.route, shapedBase ?? target.url).href;
	const raw = {
		runId,
		order,
		target: target.name,
		caseId: caseDef.id,
		phase,
		browser: browserName,
		profile: profile.name,
		visitIndex,
		url,
		profileApplied: applied,
		failures,
		steps: [],
		unavailable: {},
		consoleErrors: [],
		expectedResourceErrors: [],
		pageErrors: [],
	};
	const timings = { navToResponseMs: null, inputToResponseMs: null, inputToDomMs: null, eventDurationMs: null, pendingMs: null, serverMs: null, fcp: null, lcp: null, ttfb: null, longTasks: { count: null, totalMs: null, window: 'navigation-to-response' } };
	let responseEvidence = null;
	let inputEpoch = null;
	let responseEpoch = null;

	const context = await browser.newContext({ viewport: VIEWPORT, serviceWorkers: 'allow', ignoreHTTPSErrors: true });
	await context.addInitScript(pageAgent);
	const page = await context.newPage();
	const entries = [];
	const cdpEntries = new Map();
	const pwEntries = new Map();
	const pending = new Set();
	const mainFrame = page.mainFrame();
	const isMain = (req) => {
		try {
			return req.frame() === mainFrame;
		} catch {
			return false;
		}
	};
	const expectedStatus = (message, location) => {
		const status = Number(message.match(/^Failed to load resource: .*status of (\d{3})/)?.[1]);
		return !!location && Object.entries(caseDef.expectStatus ?? {}).some(([part, want]) => status === want && location.includes(part));
	};
	page.on('console', (m) => {
		if (m.type() !== 'error') return;
		const entry = { text: m.text().slice(0, 500), location: m.location()?.url ?? null };
		(expectedStatus(entry.text, entry.location) ? raw.expectedResourceErrors : raw.consoleErrors).push(entry);
	});
	page.on('pageerror', (e) => raw.pageErrors.push(String(e?.stack ?? e).slice(0, 1000)));
	page.on('request', (req) => {
		const main = isMain(req);
		if (main) pending.add(req);
		if (isChromium) return;
		const entry = { url: req.url(), method: req.method(), type: req.resourceType(), startEpoch: Date.now(), mainFrame: main, bodyBytes: 0, headerBytes: 0, decodedBytes: 0, status: null, failed: null, encoding: null, protocol: null, fromServiceWorker: false };
		pwEntries.set(req, entry);
		entries.push(entry);
	});
	page.on('response', (res) => {
		const entry = pwEntries.get(res.request());
		if (!entry) return;
		entry.status = res.status();
		entry.fromServiceWorker = res.fromServiceWorker();
		entry.encoding = res.headers()['content-encoding'] ?? null;
	});
	page.on('requestfinished', async (req) => {
		pending.delete(req);
		const entry = pwEntries.get(req);
		if (!entry) return;
		try {
			const sizes = await req.sizes();
			entry.bodyBytes = sizes.responseBodySize;
			entry.headerBytes = sizes.responseHeadersSize;
		} catch {}
	});
	page.on('requestfailed', (req) => {
		pending.delete(req);
		const entry = pwEntries.get(req);
		const errorText = req.failure()?.errorText ?? 'unknown';
		if (entry) entry.failed = { errorText, canceled: /cancel|abort/i.test(errorText) };
	});

	const actionTimeout = opts.actionTimeoutMs;
	const waitActionable = async (target, armSpec) => {
		const hit = await pollPage(
			page,
			({ target, armSpec }) => {
				const B = window.__bench;
				if (!B) return false;
				const point = B.actionable(target);
				if (!point) return false;
				if (armSpec) {
					if (B.check(armSpec.stages.at(-1).expect)) return { ...point, alreadySatisfied: true };
					point.armedEpoch = B.arm(armSpec);
				}
				return point;
			},
			{ target, armSpec },
			{ timeoutMs: actionTimeout },
		);
		if (!hit) {
			const observed = await evaluateSafe(page, (t) => window.__bench?.describe([{ target: t }]), target).catch(() => null);
			throw new VisitFailure('precondition', `${target.selector} not painted, visible, stable over two frames, enabled and hittable within ${actionTimeout} ms`, observed);
		}
		if (hit.alreadySatisfied) {
			const observed = await evaluateSafe(page, (p) => window.__bench.describe(p), armSpec.stages.at(-1).expect).catch(() => null);
			throw new VisitFailure('wrong-response', 'expected response already present before the input', observed);
		}
		return hit;
	};
	const dispatch = async (step, hit) => {
		if (step.click) for (let i = 0; i < (step.times ?? 1); i++) await page.mouse.click(hit.x, hit.y);
		else if (step.press) await page.keyboard.press(step.press);
		else if (step.insertText !== undefined) await page.keyboard.insertText(step.insertText);
		else if (step.goBack) await page.goBack({ waitUntil: 'commit', timeout: actionTimeout }).catch((e) => raw.steps.push({ goBackError: String(e.message) }));
	};
	const runPre = async (step) => {
		let gate = null;
		if (step.click) await dispatch(step, (gate = await waitActionable(step.click, null)));
		else if (step.focus) {
			gate = await pollPage(page, (t) => window.__bench?.focus(t) ?? false, step.focus, { timeoutMs: actionTimeout });
			if (!gate) throw new VisitFailure('precondition', `could not focus ${step.focus.selector} after it was painted, stable over two frames and hittable`);
		} else if (step.selectAll) await page.keyboard.press('ControlOrMeta+A');
		else if (step.scrollTo !== undefined) await evaluateSafe(page, (y) => window.scrollTo(0, y), step.scrollTo);
		else if (step.waitFor) {
			const ok = await pollPage(page, (p) => window.__bench?.check(p) ?? false, step.waitFor, { timeoutMs: actionTimeout });
			if (!ok) throw new VisitFailure('precondition', 'pre-step assertion did not hold', await evaluateSafe(page, (p) => window.__bench?.describe(p), step.waitFor).catch(() => null));
		} else await dispatch(step, null);
		raw.steps.push({ pre: Object.keys(step)[0], at: Date.now(), ...(gate ? { actionableEpoch: gate.epoch, paint: gate.paint } : {}) });
	};
	let measuredInput = null;
	let inputLost = null;
	const kindOf = (step) => (step.click ? 'click' : step.press ? 'press' : step.insertText !== undefined ? 'insertText' : 'goBack');
	// Arms the in-page detector, sends the trusted input, waits for every stage's presentation estimate.
	const measure = async (actionId, step, stages) => {
		const kind = kindOf(step);
		const armSpec = { actionId, inputEvents: INPUT_EVENTS[kind], documentFallback: kind === 'goBack', stages };
		let hit = null;
		if (step.click) hit = await waitActionable(step.click, armSpec);
		if (actionId === 'measured' && hit) raw.inputPaintGate = hit.paint;
		else await evaluateSafe(page, (spec) => window.__bench.arm(spec), armSpec);
		const pendingAtInput = pending.size;
		await dispatch(step, hit);
		const result = await pollPage(page, (id) => window.__bench?.resultFor(id) ?? false, actionId, { timeoutMs: actionTimeout, polling: 20 });
		if (!result) {
			const armed = await evaluateSafe(page, () => window.__bench?.armedState() ?? null).catch(() => null);
			if (actionId === 'measured' && armed?.inputEpoch != null) measuredInput = { epoch: armed.inputEpoch, document: armed.inputDocument };
			const observed = await evaluateSafe(page, (p) => window.__bench?.describe(p), stages.at(-1).expect).catch(() => null);
			const changed = (armed?.observed?.length ?? 0) > 1 || armed?.stages?.some((s) => s.domEpoch !== undefined);
			const seen = armed != null && armed.inputEpoch != null;
			const kind = seen ? (changed ? 'wrong-response' : 'input-lost') : 'timeout';
			if (kind === 'input-lost') inputLost ??= { actionId, inputEpoch: armed.inputEpoch, inputDocument: armed.inputDocument };
			const message = kind === 'input-lost' ? `input observed by the page, but the DOM never changed within ${actionTimeout} ms` : `${seen ? '' : 'input never observed; '}no response satisfying the assertion within ${actionTimeout} ms`;
			throw new VisitFailure(kind, message, { observed, transitions: armed?.observed ?? null, stages: armed?.stages ?? null });
		}
		if (actionId === 'measured') measuredInput = { epoch: result.inputEpoch, document: result.inputDocument };
		return { result, hit, pendingAtInput };
	};

	try {
		if (applied.networkMethod === 'proxy' && !shapedBase)
			throw new VisitFailure('unsupported', `the ${profile.name} profile needs the proxy's shaped listener, and ${target.name} is not proxied (${target.transport}); pass --network-shaping cdp for Chromium-only CDP emulation`);
		if (isChromium) {
			const cdp = await context.newCDPSession(page);
			const { frameTree } = await cdp.send('Page.getFrameTree');
			const mainFrameId = frameTree.frame.id;
			cdp.on('Network.requestWillBeSent', (e) => {
				const existing = cdpEntries.get(e.requestId);
				if (existing) {
					existing.redirects++;
					existing.url = e.request.url;
					return;
				}
				const entry = { url: e.request.url, method: e.request.method, type: (e.type ?? 'Other').toLowerCase(), startEpoch: e.wallTime * 1000, mainFrame: e.frameId === mainFrameId, totalBytes: 0, headerBytes: 0, decodedBytes: 0, status: null, failed: null, encoding: null, protocol: null, fromServiceWorker: false, fromDiskCache: false, redirects: 0 };
				cdpEntries.set(e.requestId, entry);
				entries.push(entry);
			});
			cdp.on('Network.responseReceived', (e) => {
				const entry = cdpEntries.get(e.requestId);
				if (!entry) return;
				entry.type = (e.type ?? entry.type).toLowerCase();
				entry.status = e.response.status;
				entry.protocol = e.response.protocol ?? null;
				entry.fromServiceWorker = !!e.response.fromServiceWorker;
				entry.fromDiskCache = !!e.response.fromDiskCache;
				entry.headerBytes = e.response.encodedDataLength ?? 0;
				const headers = Object.fromEntries(Object.entries(e.response.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
				entry.encoding = headers['content-encoding'] ?? null;
				entry.headers = entry.type === 'document' ? headers : undefined;
			});
			cdp.on('Network.dataReceived', (e) => {
				const entry = cdpEntries.get(e.requestId);
				if (entry) entry.decodedBytes += e.dataLength;
			});
			cdp.on('Network.loadingFinished', (e) => {
				const entry = cdpEntries.get(e.requestId);
				if (entry) entry.totalBytes = e.encodedDataLength;
			});
			cdp.on('Network.loadingFailed', (e) => {
				const entry = cdpEntries.get(e.requestId);
				if (entry) entry.failed = { errorText: e.errorText, canceled: !!e.canceled || /ABORTED/.test(e.errorText) };
			});
			await cdp.send('Network.enable');
			await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
			await cdp.send('Emulation.setCPUThrottlingRate', { rate: applied.cpu.slowdown });
			if (applied.networkMethod === 'cdp')
				await cdp.send('Network.emulateNetworkConditions', {
					offline: false,
					latency: profile.network.latencyMs,
					downloadThroughput: (profile.network.downloadKbps * 1000) / 8,
					uploadThroughput: (profile.network.uploadKbps * 1000) / 8,
				});
		} else {
			raw.unavailable.cacheDisabled = 'WebKit has no CDP: cold only via a fresh context; in-visit HTTP cache reuse is possible';
			raw.unavailable.cpuThrottling = applied.cpuNotApplied?.reason ?? 'WebKit cannot throttle CPU (no CDP); this profile requests none';
		}

		let response;
		try {
			response = await page.goto(url, { waitUntil: phase === 'early' ? 'commit' : 'load', timeout: opts.navTimeoutMs });
		} catch (error) {
			throw new VisitFailure('navigation-error', String(error.message).slice(0, 500));
		}
		const status = response?.status() ?? null;
		const headers = response ? await response.allHeaders().catch(() => response.headers()) : {};
		responseEvidence = {
			status,
			protocol: null,
			contentEncoding: headers['content-encoding'] ?? null,
			cacheControl: headers['cache-control'] ?? null,
			xVercelCache: headers['x-vercel-cache'] ?? null,
			server: headers.server ?? null,
			transport: `${target.transport === 'proxy' ? target.proxyProtocol ?? 'proxy' : 'direct'}${applied.networkMethod ? `; network shaped by ${applied.networkMethod === 'proxy' ? 'proxy link emulation' : 'CDP emulation'}` : ''}`,
		};
		const finalUrl = response?.url() ?? url;
		if (status === 401 || status === 403 || /vercel\.com\/(login|sso)|_vercel_sso/.test(finalUrl))
			throw new VisitFailure(/vercel/.test(finalUrl) || target.host === 'vercel' ? 'deployment-protection' : 'navigation-error', `document answered ${status} at ${finalUrl}`);
		if (status !== null && status >= 400) {
			const body = status >= 500 ? await response.text().then((t) => t.trim().slice(0, 200)).catch(() => '') : '';
			throw new VisitFailure('navigation-error', `document answered ${status}${body ? `: ${body}` : ''}`);
		}
		raw.preloadHintsPromise = response
			? response
					.text()
					.then((html) => parsePreloadHints(html, headers.link))
					.catch((e) => ({ error: String(e.message) }))
			: null;

		if (phase === 'settled') {
			const started = Date.now();
			const deadline = started + opts.settleTimeoutMs;
			let quietSince = Date.now();
			while (Date.now() < deadline) {
				if (pending.size) quietSince = Date.now();
				else if (Date.now() - quietSince >= SETTLE_QUIET_MS) break;
				await sleep(25);
			}
			const timedOut = pending.size > 0 || Date.now() - quietSince < SETTLE_QUIET_MS;
			await sleep(SETTLE_EXTRA_MS);
			raw.settle = { waitedMs: Date.now() - started, timedOut, pendingAtEnd: pending.size };
			if (timedOut) raw.settleWarning = `network never quiet for ${SETTLE_QUIET_MS} ms within ${opts.settleTimeoutMs} ms; input issued anyway`;
		}

		for (const step of caseDef.pre) await runPre(step);

		const stages = [...(caseDef.pending ? [{ name: 'pending', expect: caseDef.pending }] : []), { name: 'response', expect: caseDef.expect }];
		const { result, hit, pendingAtInput } = await measure('measured', caseDef.input, stages);
		let navOrigin = await evaluateSafe(page, () => window.__bench.navOrigin);
		inputEpoch = result.inputEpoch;
		let inputTimeSource = 'event.timeStamp';
		if (!Number.isFinite(inputEpoch) || Math.abs(inputEpoch - result.inputCaptureEpoch) > 10000) {
			inputEpoch = result.inputCaptureEpoch;
			inputTimeSource = 'capture listener (event.timeStamp not comparable)';
		}
		const final = result.stages.at(-1);
		responseEpoch = final.presentEpoch;
		timings.inputToDomMs = final.domEpoch - inputEpoch;
		timings.inputToResponseMs = final.presentEpoch - inputEpoch;
		timings.navToResponseMs = phase === 'early' ? final.presentEpoch - navOrigin : null;
		const pendingStage = result.stages.find((s) => s.name === 'pending');
		if (pendingStage) timings.pendingMs = pendingStage.presentEpoch - inputEpoch;
		raw.measured = { inputKind: kindOf(caseDef.input), inputEvent: result.inputEventType, inputTimeSource, inputDocument: result.inputDocument, responseDocument: final.document, detectedBy: final.detectedBy, scrolledIntoView: !!hit?.scrolled, actionableToInputMs: hit?.epoch ? inputEpoch - hit.epoch : null, pendingRequestsAtInput: pendingAtInput, stages: result.stages.map(({ expect: _expect, ...s }) => ({ ...s, domMs: s.domEpoch - inputEpoch, presentMs: s.presentEpoch - inputEpoch })), transitions: result.observed };

		await sleep(caseDef.holdMs ?? 100);
		const stillHolds = await pollPage(page, (p) => window.__bench?.check(p) ?? false, caseDef.expect, { timeoutMs: 50 });
		if (!stillHolds) throw new VisitFailure('wrong-response', `assertion stopped holding within ${caseDef.holdMs ?? 100} ms of the response`, await evaluateSafe(page, (p) => window.__bench?.describe(p), caseDef.expect).catch(() => null));
		if (caseDef.forbidRequest) {
			const sent = entries.filter((e) => e.startEpoch >= inputEpoch && e.url.includes(caseDef.forbidRequest));
			if (sent.length) throw new VisitFailure('wrong-response', `${sent.length} forbidden ${caseDef.forbidRequest} request(s) sent`);
		}
		for (const [i, extra] of (caseDef.followUps ?? []).entries()) await measure(`then-${i}`, extra.input, [{ name: 'response', expect: extra.expect }]);
	} catch (error) {
		if (error instanceof VisitFailure) failures.push({ kind: error.kind, message: error.message, observed: error.observed ?? null });
		else failures.push({ kind: contextLost(error) ? 'navigation-error' : 'runner-error', message: String(error?.stack ?? error).slice(0, 1500) });
	}

	// Let requests started before the response finish so their byte counts are complete; timings are already taken.
	const drainStart = Date.now();
	let drainQuiet = Date.now();
	while (Date.now() - drainStart < opts.drainTimeoutMs) {
		if (pending.size) drainQuiet = Date.now();
		else if (Date.now() - drainQuiet >= 200) break;
		await sleep(25);
	}
	raw.drain = { waitedMs: Date.now() - drainStart, pendingAtEnd: pending.size };
	const docs = await evaluateSafe(page, () => window.__bench.allSnapshots()).catch(() => []);
	const inputSnapshot = measuredInput ? docs[measuredInput.document]?.snapshot : null;
	raw.inputAfterFcpMs = inputSnapshot?.fcpMs != null && Number.isFinite(measuredInput.epoch) ? measuredInput.epoch - (inputSnapshot.timeOrigin + inputSnapshot.fcpMs) : null;
	const firstDoc = docs[0]?.snapshot ?? null;
	if (inputLost) {
		const doc = docs[inputLost.inputDocument]?.snapshot ?? firstDoc;
		const rel = (epoch) => (doc && Number.isFinite(epoch) ? epoch - doc.timeOrigin : null);
		const scripts = (doc?.resources ?? []).filter((r) => r.initiatorType === 'script' || /\.m?js(\?|$)/.test(r.name)).map((r) => ({ url: r.name, initiatorType: r.initiatorType, startMs: r.startTime, responseEndMs: r.responseEnd }));
		const inputMs = rel(inputLost.inputEpoch);
		raw.inputLost = {
			actionId: inputLost.actionId,
			clock: 'ms since the input document timeOrigin',
			inputMs,
			fcpMs: doc?.fcpMs ?? null,
			scripts,
			scriptsArrivedAfterInput: inputMs === null ? null : scripts.filter((r) => r.responseEndMs > inputMs).length,
			lastScriptResponseEndMs: scripts.length ? Math.max(...scripts.map((r) => r.responseEndMs)) : null,
		};
	}
	const supported = firstDoc?.supported ?? {};
	if (firstDoc) {
		timings.fcp = firstDoc.fcpMs;
		timings.lcp = firstDoc.lcpMs;
		timings.ttfb = firstDoc.navigation?.responseStart ?? null;
		if (!supported.paint) raw.unavailable.fcp = 'paint timing unsupported';
		if (!supported.lcp) raw.unavailable.lcp = 'largest-contentful-paint unsupported';
		if (!supported.longtask) raw.unavailable.longTasks = 'longtask entries unsupported';
		if (!supported.event) raw.unavailable.eventDurationMs = 'Event Timing unsupported';
		if (supported.longtask) {
			const until = responseEpoch ?? Infinity;
			const tasks = docs.flatMap((d) => (d.snapshot?.longTasks ?? []).map((t) => ({ ...t, epoch: d.timeOrigin + t.start })).filter((t) => t.epoch < until));
			timings.longTasks = { count: tasks.length, totalMs: tasks.reduce((a, t) => a + t.duration, 0), window: 'navigation-to-response' };
		}
		if (raw.measured) {
			const inputDoc = docs[raw.measured.inputDocument]?.snapshot;
			const measuredEvent = eventDuration(inputDoc?.events ?? null, inputDoc ? inputEpoch - inputDoc.timeOrigin : null, raw.measured.inputEvent);
			timings.eventDurationMs = measuredEvent.value;
			if (measuredEvent.reason) raw.eventDurationNote = measuredEvent.reason;
			if (caseDef.server) {
				const doc = docs[raw.measured.responseDocument]?.snapshot;
				const after = (doc?.resources ?? []).filter((r) => doc.timeOrigin + r.startTime >= inputEpoch - 1);
				const match = after.find((r) => r.name.includes(caseDef.server)) ?? after.find((r) => r.initiatorType === 'fetch' || r.initiatorType === 'xmlhttprequest');
				if (match) {
					timings.serverMs = match.responseEnd - (match.requestStart > 0 ? match.requestStart : match.startTime);
					raw.serverRequest = { url: match.name, matchedBy: match.name.includes(caseDef.server) ? 'url' : 'first fetch/xhr after input', requestStartAvailable: match.requestStart > 0 };
				} else raw.serverRequest = { url: null, note: 'no server request found in Resource Timing after the input' };
			}
		}
		const meta = firstDoc.meta;
		raw.observedMeta = meta;
		if (!failures.some((f) => f.kind === 'unsupported' || f.kind === 'navigation-error' || f.kind === 'deployment-protection')) {
			if (meta.entrant !== target.entrant) failures.push({ kind: 'build-mismatch', message: `benchmark:entrant meta is ${JSON.stringify(meta.entrant)}, expected ${target.entrant}` });
			else if (!meta.build || meta.build !== target.buildId) failures.push({ kind: 'build-mismatch', message: `benchmark:build meta is ${JSON.stringify(meta.build)}, run recorded ${JSON.stringify(target.buildId)}` });
		}
		raw.preloadHints = { ...(raw.preloadHintsPromise ? await raw.preloadHintsPromise : { error: 'no document response' }), dom: firstDoc.preloadHintsInDom.length };
	} else if (!failures.some((f) => f.kind === 'unsupported')) raw.unavailable.rendering = 'no document snapshot';
	delete raw.preloadHintsPromise;

	// Resource Timing is the exact body size where the browser exposes it; CDP/Playwright otherwise.
	const timingByUrl = new Map();
	for (const d of docs) for (const r of d.snapshot?.resources ?? []) if (!timingByUrl.has(r.name)) timingByUrl.set(r.name, r);
	for (const e of entries) {
		const rt = timingByUrl.get(e.url);
		if (isChromium) e.bodyBytes = rt?.encodedBodySize > 0 ? rt.encodedBodySize : Math.max(0, e.totalBytes - e.headerBytes);
		else {
			e.decodedBytes = rt?.decodedBodySize ?? 0;
			if (e.type === 'document') {
				const nav = docs.find((d) => d.snapshot?.url === e.url)?.snapshot?.navigation;
				if (nav) e.decodedBytes = nav.decodedBodySize;
			}
		}
	}
	const main = entries.filter((e) => e.mainFrame);
	const until = responseEpoch ?? Infinity;
	const counted = main.filter((e) => e.startEpoch <= until);
	const sum = (list, key) => list.reduce((a, e) => a + (e[key] ?? 0), 0);
	const ofType = (types) => counted.filter((e) => types.includes(e.type));
	const doc = main.find((e) => e.type === 'document');
	if (responseEvidence && doc) responseEvidence.protocol = doc.protocol ?? responseEvidence.protocol;
	const bytes = {
		compressedJs: sum(ofType(['script']), 'bodyBytes'),
		decodedJs: sum(ofType(['script']), 'decodedBytes'),
		html: { compressed: sum(ofType(['document']), 'bodyBytes'), decoded: sum(ofType(['document']), 'decodedBytes') },
		compressedCss: sum(ofType(['stylesheet']), 'bodyBytes'),
		decodedCss: sum(ofType(['stylesheet']), 'decodedBytes'),
		other: sum(counted.filter((e) => !['script', 'document', 'stylesheet'].includes(e.type)), 'bodyBytes'),
	};
	const failedRequests = main.filter((e) => e.failed && !e.failed.canceled);
	const actionWindow = main.filter((e) => inputEpoch !== null && e.startEpoch >= inputEpoch && e.startEpoch <= until);
	const requests = {
		initial: inputEpoch === null ? counted.length : main.filter((e) => e.startEpoch < inputEpoch).length,
		perAction: actionWindow.length,
		perActionDocument: actionWindow.filter((e) => e.type === 'document').length,
		failed: failedRequests.length,
	};
	raw.network = {
		source: isChromium ? 'cdp+resource-timing' : 'playwright-events+resource-timing',
		cacheDisabled: isChromium ? true : 'fresh-context-only',
		encodings: [...new Set(main.map((e) => e.encoding).filter(Boolean))],
		protocols: [...new Set(main.map((e) => e.protocol).filter(Boolean))],
		fromDiskCache: main.filter((e) => e.fromDiskCache).length,
		nonMainFrameRequests: entries.length - main.length,
		failedRequests: main.filter((e) => e.failed).map((e) => ({ url: e.url, type: e.type, ...e.failed })),
		requests: main.map((e) => ({ url: e.url, method: e.method, type: e.type, startEpoch: e.startEpoch, status: e.status, bodyBytes: e.bodyBytes, decodedBytes: e.decodedBytes, encoding: e.encoding, fromServiceWorker: e.fromServiceWorker })),
	};
	raw.serviceWorker = {
		allowed: true,
		controller: docs.map((d) => d.snapshot?.serviceWorkerController).find(Boolean) ?? null,
		workers: context.serviceWorkers().map((w) => w.url()),
		responsesFromServiceWorker: main.filter((e) => e.fromServiceWorker).length,
	};
	if (failedRequests.length && !failures.length) failures.push({ kind: 'request-failed', message: `${failedRequests.length} main-frame request(s) failed: ${failedRequests.slice(0, 3).map((e) => `${e.url} ${e.failed.errorText}`).join('; ')}` });
	if (raw.pageErrors.length) failures.push({ kind: 'page-error', message: `${raw.pageErrors.length} uncaught page error(s): ${raw.pageErrors[0].slice(0, 200)}` });
	if (raw.consoleErrors.length) failures.push({ kind: 'page-error', message: `${raw.consoleErrors.length} console error(s): ${raw.consoleErrors[0].text.slice(0, 200)}` });
	await context.close().catch(() => {});

	const first = failures[0] ?? null;
	const result = {
		schemaVersion: SCHEMA_VERSION,
		runId,
		framework: { entrant: target.entrant, variant: target.variant, renderMode: target.renderMode, versions: target.versions },
		build: { id: target.buildId ?? 'missing', sourceRevision: target.sourceRevision },
		deployment: { url, host: target.host, region: null, cacheState: 'cold-browser', responseEvidence },
		browser: { name: browserName, version: browser.version(), playwright: playwrightVersion, viewport: VIEWPORT },
		profile: { network: applied.network, cpu: applied.cpu },
		caseId: caseDef.id,
		phase,
		visitIndex,
		order,
		timings: first ? { ...timings, navToResponseMs: null, inputToResponseMs: null, inputToDomMs: null, pendingMs: null } : timings,
		bytes,
		requests,
		failure: first ? { kind: first.kind, message: first.message } : null,
		timestamp: new Date().toISOString(),
	};
	if (first && timings.inputToResponseMs !== null) raw.timingsOfFailedVisit = timings;
	return { result, raw };
}
