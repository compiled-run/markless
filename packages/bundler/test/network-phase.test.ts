import { describe, expect, test } from 'vitest';
import { evaluatePreloaderEvidence } from '../boxes/analyzer-gate.ts';
import {
	clickCausedRequests,
	preClickInstantMs,
	requestPhase,
} from '../boxes/network-phase.ts';

const PAGE_URL = 'http://fixture.local/';

type NetworkRecord = {
	readonly method: 'GET';
	readonly url: string;
	readonly startTimeMs: number;
	readonly endTimeMs: number | null;
	readonly status: number | null;
	readonly failedReason: string | null;
	readonly resourceType?: string | null;
};

function chunk(name: string, startTimeMs: number, endTimeMs: number): NetworkRecord {
	return {
		method: 'GET',
		url: `${PAGE_URL}build/${name}.js`,
		startTimeMs,
		endTimeMs,
		status: 200,
		failedReason: null,
		resourceType: 'script',
	};
}

// Witness appends a request on Network.loadingFinished, so both snapshots are
// completion-ordered. The pre-click snapshot holds the preloads that finished
// early; `late` started at page parse alongside them but, being the largest
// chunk, only finished after the snapshot was taken - the exact shape that made
// index-based phasing red on slower runners.
const early = chunk('chunk-early', 1_000, 5_800);
const late = chunk('chunk-late', 1_010, 6_003);
const clickCaused = chunk('chunk-click', 6_500, 7_200);

const beforeClick = [early];
const afterClickWithLatePreload = [early, late];
const afterClickWithNewFetch = [early, late, clickCaused];

describe('causal network phase classification', () => {
	test('a page-parse preload still in flight at click time is not click-caused', () => {
		expect(clickCausedRequests(beforeClick, afterClickWithLatePreload)).toEqual([]);
	});

	test('a request that starts after the click is still counted', () => {
		expect(clickCausedRequests(beforeClick, afterClickWithNewFetch).map((r) => r.url)).toEqual([
			clickCaused.url,
		]);
	});

	test('index-based phasing would have miscounted the same evidence', () => {
		// The defect this replaces, stated as evidence rather than as prose: the
		// completion-ordered slice sees the late preload as a post-click fetch.
		expect(afterClickWithLatePreload.slice(beforeClick.length)).toEqual([late]);
	});

	test('an empty pre-click snapshot leaves every later request click-caused', () => {
		expect(clickCausedRequests([], afterClickWithNewFetch)).toHaveLength(3);
		expect(preClickInstantMs([])).toBe(Number.NEGATIVE_INFINITY);
	});

	test('the pre-click instant is the latest completion observed before the click', () => {
		expect(preClickInstantMs([early, chunk('chunk-other', 1_020, 5_900)])).toBe(5_900);
		expect(requestPhase(late, preClickInstantMs(beforeClick))).toBe('bootstrap');
		expect(requestPhase(clickCaused, preClickInstantMs(beforeClick))).toBe('action');
	});
});

describe('preloader evidence phases the analyzer window by causality', () => {
	test('MLA-S1 passes when the only post-snapshot completion started at page parse', () => {
		const results = evaluatePreloaderEvidence({
			fixture: 'vite-csr-preloader',
			pageUrl: PAGE_URL,
			declaredPreloads: [early.url, late.url],
			actionStartTimeMs: preClickInstantMs(beforeClick),
			requests: afterClickWithLatePreload,
		});
		expect(results.find((result) => result.id === 'MLA-S1-PRELOAD-INTEGRITY')).toMatchObject({
			status: 'pass',
			details: [],
		});
	});

	test('MLA-S1 still fails on a module fetched after the click', () => {
		const results = evaluatePreloaderEvidence({
			fixture: 'vite-csr-preloader',
			pageUrl: PAGE_URL,
			declaredPreloads: [early.url, late.url],
			actionStartTimeMs: preClickInstantMs(beforeClick),
			requests: afterClickWithNewFetch,
		});
		const preload = results.find((result) => result.id === 'MLA-S1-PRELOAD-INTEGRITY');
		expect(preload?.status).toBe('fail');
		expect(preload?.details.join('\n')).toContain('chunk-click.js');
	});
});
