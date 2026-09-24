// Pure helpers for holdout records: request windows, network round trips, sampling, file usage, aggregation.
import { describe } from '../../lib/stats.mjs';
import { classify } from './visit.mjs';

/** Evenly spaced sample of at most `max` items, first and last included, order kept. */
export function sample(items, max) {
	if (!Number.isFinite(max) || items.length <= max) return [...items];
	if (max <= 0) return [];
	if (max === 1) return [items[0]];
	const picked = new Set();
	for (let i = 0; i < max; i++) picked.add(Math.round((i * (items.length - 1)) / (max - 1)));
	return [...picked].sort((a, b) => a - b).map((i) => items[i]);
}

/**
 * Serial network waves: the longest chain of requests in which each starts at or after the previous one's
 * end. Parallel requests share a wave; a request discovered only after another finished adds one.
 */
export function roundTrips(entries) {
	const done = entries
		.filter((e) => e.endEpoch !== null && e.startEpoch !== null)
		.sort((a, b) => a.startEpoch - b.startEpoch);
	const depth = [];
	let max = 0;
	for (let i = 0; i < done.length; i++) {
		let d = 1;
		for (let j = 0; j < i; j++)
			if (done[j].endEpoch <= done[i].startEpoch && depth[j] + 1 > d) d = depth[j] + 1;
		depth.push(d);
		if (d > max) max = d;
	}
	return max;
}

/**
 * Rounds over a Resource Timing timeline. Entries shorter than 1 ms are memory/HTTP cache hits (WebKit
 * cannot disable its cache): they cost no round trip, and back-to-back zero-length entries would chain.
 */
export const networkRounds = (timeline) =>
	roundTrips(timeline.filter((e) => e.endEpoch === null || e.endEpoch - e.startEpoch >= 1));

/** Requests (and their bytes by kind) started in [fromEpoch, toEpoch). */
export function requestWindow(entries, fromEpoch = -Infinity, toEpoch = Infinity) {
	const inside = entries.filter((e) => e.startEpoch >= fromEpoch && e.startEpoch < toEpoch);
	const byKind = {};
	for (const e of inside) {
		const kind = classify(e);
		const k = (byKind[kind] ??= { requests: 0, wireBytes: 0 });
		k.requests++;
		k.wireBytes += e.wireBytes ?? 0;
	}
	return {
		requests: inside.length,
		wireBytes: inside.reduce((t, e) => t + (e.wireBytes ?? 0), 0),
		failed: inside.filter((e) => e.failed && !/abort|cancel/i.test(e.failed)).length,
		byKind,
		jsFiles: [...new Set(inside.filter((e) => classify(e) === 'js').map((e) => e.url))],
		rounds: roundTrips(inside),
	};
}

const pathOf = (url) => {
	try {
		return new URL(url).pathname;
	} catch {
		return url;
	}
};

/**
 * JS files at load split by preload hint and by use. `executed` maps URL pathname -> executed characters
 * at load (Chromium coverage); null when coverage is unavailable (WebKit).
 */
export function fileUsage(loadJs, hints, executed) {
	const hinted = new Set(
		hints
			.filter((h) => h.rel === 'modulepreload' || (h.rel === 'preload' && h.as === 'script'))
			.map((h) => pathOf(h.href)),
	);
	const files = [...new Set(loadJs.map(pathOf))];
	const used = executed ? files.filter((f) => (executed.get(f) ?? 0) > 0) : null;
	return {
		jsFiles: files.length,
		preloaded: files.filter((f) => hinted.has(f)).length,
		hintedNotFetched: [...hinted].filter((f) => !files.includes(f)).length,
		used: used ? used.length : null,
		preloadedUnused: executed
			? files.filter((f) => hinted.has(f) && !(executed.get(f) > 0)).length
			: null,
		fetchedUnused: executed ? files.filter((f) => !(executed.get(f) > 0)).length : null,
	};
}

/** Survival verdict for one early click against the settled reference end states. */
export function survival({ idle, clicked, early }) {
	if (!clicked || !idle || !early) return 'indeterminate';
	if (idle.hash === clicked.hash) return 'no-observable-response';
	if (early.hash === clicked.hash) return 'survived';
	if (early.hash === idle.hash) return 'lost';
	return 'diverged';
}

const med = (values) => describe(values).median;
// Records written before rounds came from Resource Timing carry Playwright request timing, which WebKit
// reports in event order rather than network order.
const roundsOf = (r) => (r.roundsSource || r.browser === 'chromium' ? r.rounds : null);

/** One summary row per lane / variant / browser / profile from the flat record list. */
export function aggregate(records) {
	const cells = new Map();
	for (const r of records) {
		const key = [r.lane, r.variant, r.browser, r.profile].join('|');
		if (!cells.has(key))
			cells.set(key, {
				lane: r.lane,
				variant: r.variant,
				browser: r.browser,
				profile: r.profile,
				load: [],
				clicks: [],
				early: [],
				nav: [],
			});
		cells.get(key)[r.kind]?.push(r);
	}
	return [...cells.values()].map((c) => {
		const loads = c.load.filter((r) => !r.error);
		const early = c.early.map((r) => r.verdict);
		const counted = early.filter((v) => v === 'survived' || v === 'lost' || v === 'diverged');
		const clicks = c.clicks.filter((r) => !r.error && r.responded);
		const navs = c.nav.filter((r) => !r.error);
		return {
			lane: c.lane,
			variant: c.variant,
			browser: c.browser,
			profile: c.profile,
			load: {
				visits: loads.length,
				requests: med(loads.map((r) => r.requests)),
				wireKB: med(loads.map((r) => r.wireBytes / 1024)),
				jsFiles: med(loads.map((r) => r.files.jsFiles)),
				jsKB: med(loads.map((r) => (r.byKind.js?.wireBytes ?? 0) / 1024)),
				preloaded: med(loads.map((r) => r.files.preloaded)),
				preloadedUnused: med(loads.map((r) => r.files.preloadedUnused)),
				executedChars: med(loads.map((r) => r.executed?.executedChars)),
				executedFunctions: med(loads.map((r) => r.executed?.functions)),
				rounds: med(loads.map(roundsOf)),
				fcpMs: med(loads.map((r) => r.fcpMs)),
				settledMs: med(loads.map((r) => r.settledMs)),
			},
			early: {
				controls: c.early.length,
				survived: early.filter((v) => v === 'survived').length,
				lost: early.filter((v) => v === 'lost').length,
				diverged: early.filter((v) => v === 'diverged').length,
				counted: counted.length,
				inert: early.filter((v) => v === 'no-observable-response').length,
				indeterminate: early.filter((v) => v === 'indeterminate').length,
				inputToResponseMs: med(
					c.early.filter((r) => r.verdict === 'survived').map((r) => r.inputToResponseMs),
				),
			},
			firstClick: {
				controls: c.clicks.length,
				responded: clicks.length,
				inputToResponseMs: med(clicks.map((r) => r.inputToResponseMs)),
				p95Ms: describe(clicks.map((r) => r.inputToResponseMs)).p95,
				clicksFetchingJs: clicks.filter((r) => r.clickJs.requests > 0).length,
				clickJsKB: clicks.reduce((t, r) => t + r.clickJs.wireBytes / 1024, 0),
				clickJsRequests: clicks.reduce((t, r) => t + r.clickJs.requests, 0),
			},
			nav: {
				links: c.nav.length,
				ok: navs.filter((r) => r.arrived).length,
				documentLoads: navs.filter((r) => r.newDocument).length,
				rounds: med(navs.map(roundsOf)),
				latencyMs: med(navs.filter((r) => r.arrived).map((r) => r.latencyMs)),
				wireKB: med(navs.map((r) => r.wireBytes / 1024)),
			},
		};
	});
}
