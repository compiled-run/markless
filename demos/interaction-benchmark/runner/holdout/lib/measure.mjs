// Per-route holdout measurement: load visits (requests, bytes, files, V8 execution at load), then for each
// sampled control a settled first click and a paint-gated early click, then one navigation per internal link.
import { windowExecution } from '../../lib/coverage.mjs';
import { fileUsage, requestWindow, networkRounds, sample, survival } from './metrics.mjs';
import { SELECTOR, classify, evaluate, openVisit, poll } from './visit.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (e) =>
	String(e?.message ?? e)
		.split('\n')[0]
		.slice(0, 200);
const pathOf = (url) => new URL(url).pathname;

async function waitReady(visit, ready, timeoutMs) {
	if (!ready) return true;
	return !!(await poll(
		visit.page,
		(sel) => !!document.querySelector(sel),
		ready,
		timeoutMs,
		100,
	));
}

async function settleAll(visit, lane, opts) {
	const settled = await visit.settle(opts.quietMs, opts.settleTimeoutMs);
	const ready = await waitReady(visit, lane.ready, opts.actionTimeoutMs);
	if (lane.ready) await visit.settle(opts.quietMs, opts.settleTimeoutMs);
	return { ...settled, ready };
}

/** Paint-gated actionable point of the control with this key (the runner's page-agent check). */
async function actionablePoint(visit, key, timeoutMs) {
	return poll(
		visit.page,
		({ key, selector }) => {
			const nth = window.__holdout?.ordinalOf(key) ?? -1;
			if (nth < 0) return false;
			const point = window.__bench?.actionable({ selector, nth });
			return point ? { ...point, nth } : false;
		},
		{ key, selector: SELECTOR },
		timeoutMs,
	);
}

/** Uses the control once: click, plus one character for text fields; selects take another option. */
async function useControl(visit, control, point) {
	const page = visit.page;
	if (control.kind === 'select') {
		const el = page.locator(SELECTOR).nth(point.nth);
		const values = await el.evaluate((s) => [...s.options].map((o) => o.value));
		const current = await el.inputValue();
		await el.selectOption(values.find((v) => v !== current) ?? current, { timeout: 5000 });
		return;
	}
	await page.mouse.click(point.x, point.y);
	if (control.kind === 'type') await page.keyboard.type('a');
}

const signature = (visit) => evaluate(visit.page, () => window.__holdout.signature());
const response = (visit) => evaluate(visit.page, () => window.__holdout.response());

function inputTiming(res) {
	const inputEpoch = res.input?.epoch ?? null;
	return {
		inputEpoch,
		inputToResponseMs:
			inputEpoch !== null && res.firstPresentEpoch
				? res.firstPresentEpoch - inputEpoch
				: null,
		inputToFirstMutationMs:
			inputEpoch !== null && res.firstMutationEpoch
				? res.firstMutationEpoch - inputEpoch
				: null,
		inputAfterFcpMs:
			inputEpoch !== null && res.fcpMs !== null
				? inputEpoch - (res.timeOrigin + res.fcpMs)
				: null,
	};
}

async function loadVisit(browser, ctx, { coverage }) {
	const { lane, url, opts, cell } = ctx;
	const visit = await openVisit(browser, { browserName: cell.browser, cpu: cell.cpu, coverage });
	try {
		const startEpoch = Date.now();
		const status = await visit.goto(url, 'commit');
		const settled = await settleAll(visit, lane, opts);
		const settledMs = Date.now() - startEpoch;
		const snapshot = await evaluate(visit.page, () => ({
			fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
			controls: window.__holdout.controls(),
			links: window.__holdout.links(),
		}));
		const hints = await visit.hints();
		const timeline = await visit.resourceTimeline();
		const scripts = coverage ? await visit.coverage.take() : null;
		await visit.sizes();
		const win = requestWindow(visit.entries);
		let executed = null;
		let executedByPath = null;
		if (scripts) {
			const exec = windowExecution(scripts);
			executedByPath = new Map();
			for (const s of exec.perScript)
				executedByPath.set(
					pathOf(s.url),
					(executedByPath.get(pathOf(s.url)) ?? 0) + s.executedChars,
				);
			executed = {
				executedChars: exec.executedChars,
				functions: exec.functions,
				scripts: exec.perScript.length,
			};
		}
		const loadJs = visit.entries.filter((e) => classify(e) === 'js').map((e) => e.url);
		return {
			record: {
				kind: 'load',
				coverageVisit: coverage,
				status,
				requests: win.requests,
				wireBytes: win.wireBytes,
				byKind: win.byKind,
				failedRequests: win.failed,
				rounds: networkRounds(timeline),
				roundsSource: 'resource-timing',
				files: fileUsage(loadJs, hints, executedByPath),
				executed,
				fcpMs: coverage ? null : snapshot.fcpMs,
				settledMs: coverage ? null : settledMs,
				settleTimedOut: settled.timedOut,
				ready: settled.ready,
				errors: visit.errors,
			},
			controls: snapshot.controls,
			links: snapshot.links,
		};
	} finally {
		await visit.close();
	}
}

async function settledClick(browser, ctx, control) {
	const { lane, url, opts, cell } = ctx;
	const visit = await openVisit(browser, { browserName: cell.browser, cpu: cell.cpu });
	try {
		await visit.goto(url, 'commit');
		await settleAll(visit, lane, opts);
		const point = await actionablePoint(visit, control.key, opts.actionTimeoutMs);
		if (!point)
			return {
				record: {
					kind: 'clicks',
					control: control.key,
					error: 'not actionable after settle',
				},
			};
		const idle = await signature(visit);
		await evaluate(visit.page, () => window.__holdout.reset());
		const sentEpoch = Date.now();
		await useControl(visit, control, point);
		await sleep(opts.responseWaitMs);
		await visit.settle(opts.quietMs, opts.settleTimeoutMs);
		await sleep(opts.responseWaitMs);
		const clicked = await signature(visit).catch(() => null);
		const res = await response(visit).catch(() => null);
		await visit.sizes();
		const timing = res ? inputTiming(res) : { inputEpoch: null };
		const clickJs = requestWindow(
			visit.entries.filter((e) => classify(e) === 'js'),
			sentEpoch,
		);
		return {
			record: {
				kind: 'clicks',
				control: control.key,
				controlKind: control.kind,
				responded: !!clicked && clicked.hash !== idle.hash,
				...timing,
				clickJs: {
					requests: clickJs.requests,
					wireBytes: clickJs.wireBytes,
					files: clickJs.jsFiles.map(pathOf),
				},
				errors: visit.errors,
			},
			idle,
			clicked,
		};
	} catch (error) {
		return { record: { kind: 'clicks', control: control.key, error: short(error) } };
	} finally {
		await visit.close();
	}
}

async function earlyClick(browser, ctx, control, reference) {
	const { lane, url, opts, cell } = ctx;
	const visit = await openVisit(browser, {
		browserName: cell.browser,
		cpu: cell.cpu,
		delayAdoptionMs: opts.delayAdoptionMs,
	});
	try {
		await visit.goto(url, 'commit');
		const point = await actionablePoint(visit, control.key, opts.actionTimeoutMs);
		if (!point)
			return {
				kind: 'early',
				control: control.key,
				verdict: 'indeterminate',
				error: 'never actionable',
			};
		const beforeInput = visit.entries.filter(
			(e) => e.endEpoch === null && classify(e) === 'js',
		).length;
		await useControl(visit, control, point);
		await sleep(opts.responseWaitMs);
		await settleAll(visit, lane, opts);
		await sleep(opts.responseWaitMs);
		const early = await signature(visit).catch(() => null);
		const res = await response(visit).catch(() => null);
		const verdict = survival({ idle: reference?.idle, clicked: reference?.clicked, early });
		return {
			kind: 'early',
			control: control.key,
			verdict,
			...(res ? inputTiming(res) : {}),
			jsInFlightAtInput: beforeInput,
			errors: visit.errors,
		};
	} catch (error) {
		return {
			kind: 'early',
			control: control.key,
			verdict: 'indeterminate',
			error: short(error),
		};
	} finally {
		await visit.close();
	}
}

async function navigate(browser, ctx, link) {
	const { lane, url, opts, cell } = ctx;
	const visit = await openVisit(browser, { browserName: cell.browser, cpu: cell.cpu });
	try {
		await visit.goto(url, 'commit');
		await settleAll(visit, lane, opts);
		const armSpec = {
			actionId: 'holdout-nav',
			inputEvents: ['pointerdown'],
			documentFallback: true,
			stages: [{ name: 'url', expect: [{ pathname: link.pathname }] }],
		};
		const point = await poll(
			visit.page,
			({ nth, armSpec }) => {
				const B = window.__bench;
				const p = B?.actionable({ selector: 'a[href]', nth });
				if (!p) return false;
				B.arm(armSpec);
				return p;
			},
			{ nth: link.nth, armSpec },
			opts.actionTimeoutMs,
		);
		if (!point) return { kind: 'nav', link: link.pathname, error: 'link not actionable' };
		const docsBefore = visit.entries.filter((e) => e.navigation).length;
		const sentEpoch = Date.now();
		await visit.page.mouse.click(point.x, point.y);
		const result = await poll(
			visit.page,
			() => window.__bench?.resultFor('holdout-nav') ?? false,
			null,
			opts.actionTimeoutMs,
			20,
		);
		await visit.settle(opts.quietMs, opts.settleTimeoutMs);
		await visit.sizes();
		// WebKit may stamp inputEpoch on the epoch clock; the capture time is the fallback.
		const inputEpoch = !result
			? null
			: Math.abs(result.inputEpoch - result.inputCaptureEpoch) < 10000
				? result.inputEpoch
				: result.inputCaptureEpoch;
		const after = visit.entries.filter((e) => e.startEpoch >= sentEpoch);
		const win = requestWindow(after);
		const timeline = await visit.resourceTimeline(sentEpoch).catch(() => []);
		const probe = await response(visit).catch(() => null);
		const contentEpoch = probe
			? Math.max(
					probe.anyMutationEpoch ?? 0,
					probe.fcpMs !== null ? probe.timeOrigin + probe.fcpMs : 0,
				)
			: 0;
		return {
			kind: 'nav',
			link: link.pathname,
			arrived: !!result,
			newDocument: visit.entries.filter((e) => e.navigation).length > docsBefore,
			latencyMs: result ? result.stages.at(-1).presentEpoch - inputEpoch : null,
			contentMs: result && contentEpoch > inputEpoch ? contentEpoch - inputEpoch : null,
			rounds: networkRounds(timeline),
			roundsSource: 'resource-timing',
			requests: win.requests,
			wireBytes: win.wireBytes,
			byKind: win.byKind,
			errors: visit.errors,
		};
	} catch (error) {
		return { kind: 'nav', link: link.pathname, error: short(error) };
	} finally {
		await visit.close();
	}
}

/**
 * All records for one route in one cell ({ browser, profile, cpu }). `url` is the route on the cell's origin.
 * opts: loadVisits, maxControls, maxLinks, quietMs, settleTimeoutMs, actionTimeoutMs, responseWaitMs, coverage, log.
 */
export async function measureRoute(browser, { lane, route, url, cell, opts }) {
	const ctx = { lane, url, opts, cell };
	const base = { route };
	const records = [];
	const push = (r) => records.push({ ...base, ...r });
	let controls = [];
	let links = [];
	for (let i = 0; i < opts.loadVisits; i++) {
		try {
			const out = await loadVisit(browser, ctx, { coverage: false });
			push(out.record);
			if (i === 0) ({ controls, links } = out);
		} catch (error) {
			push({ kind: 'load', error: short(error) });
		}
	}
	if (opts.coverage && cell.browser === 'chromium') {
		try {
			push((await loadVisit(browser, ctx, { coverage: true })).record);
		} catch (error) {
			push({ kind: 'load', coverageVisit: true, error: short(error) });
		}
	}
	const picked = sample(
		controls.filter((c) => c.kind !== 'skip'),
		opts.maxControls,
	);
	push({
		kind: 'discovery',
		controlsFound: controls.length,
		controlsMeasured: picked.map((c) => c.key),
		linksFound: links.length,
	});
	const idleHashes = new Set();
	const early = [];
	for (const control of picked) {
		const settled = await settledClick(browser, ctx, control);
		push(settled.record);
		if (settled.idle) idleHashes.add(settled.idle.hash);
		for (let i = 0; i < (opts.earlyRepeats ?? 1); i++)
			early.push(await earlyClick(browser, ctx, control, settled));
		opts.log?.(
			`    ${control.key}: ${settled.record.error ?? (settled.record.responded ? `${Math.round(settled.record.inputToResponseMs ?? -1)} ms` : 'no response')} / early ${early.at(-1).verdict}`,
		);
	}
	const unstable = idleHashes.size > 1;
	for (const r of early)
		push(
			unstable && r.verdict === 'diverged'
				? { ...r, verdict: 'indeterminate', unstablePage: true }
				: r,
		);
	for (const link of links.slice(0, opts.maxLinks)) {
		const r = await navigate(browser, ctx, link);
		push(r);
		opts.log?.(
			`    nav ${link.pathname}: ${r.error ?? `${Math.round(r.latencyMs ?? -1)} ms, ${r.rounds} rounds${r.newDocument ? ', document' : ''}`}`,
		);
	}
	return records;
}
