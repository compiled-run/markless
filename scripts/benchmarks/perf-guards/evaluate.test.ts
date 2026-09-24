import { describe, expect, test } from 'vitest';
import { accept } from './cli.mjs';
import { evaluate } from './evaluate.mjs';
import { criticalPathRounds } from './measure.mjs';
import { compareCells } from './timing-guard.mjs';

type Json = Record<string, any>;

function measurement(): Json {
	return {
		sites: {
			bench: {
				routes: {
					'/records': {
						preload: {
							files: ['/build/a.js', '/build/b.js'],
							gzipBytes: 50_000,
							rounds: 1,
							chain: [],
							notPreloaded: [],
							missingFiles: [],
							attribution: { runtime: 30_000, glue: 8_000, author: 12_000 },
						},
						payPerUse: {
							pageMaps: ['pages/records.tsrx'],
							shipped: 12,
							demandedFeatures: ['web/resume-keyed-repeats'],
							undemanded: [],
						},
						controls: [{ key: 'sort-score', kind: 'click', inputJs: [], errors: [] }],
						waste: {
							gzipBytes: 20_000,
							files: [
								{ file: '/build/a.js', gzipBytes: 40_000, neverGzipBytes: 20_000 },
							],
						},
					},
				},
				compileHints: { hinted: ['/build/a.js'], hintedNotPreloaded: [] },
				runtimeModules: { 'web/resume-branches': 4_000, 'web/resume-runtime': 9_000 },
				runtimeFeatures: { 'web/resume-branches': ['branch records'] },
				lean: {
					'/': {
						'click@counter-increment': 'scalar',
						'click@toggle-button': 'full-resume',
					},
				},
				execution: {
					counter: {
						caseId: 'overview-counter-first',
						route: '/',
						executedChars: 20_000,
						functions: 100,
						modules: 10,
						inputJs: [],
						scripts: [
							{
								url: '/build/a.js',
								executedChars: 20_000,
								functions: 100,
								modules: 10,
								initialized: [],
							},
						],
					},
				},
				sameTask: [
					{
						route: '/',
						name: 'toggle again',
						event: 'click',
						sawEvent: true,
						sameTask: true,
						responded: true,
					},
				],
				navigation: [
					{
						from: '/',
						to: '/records',
						link: 'nav-records',
						rounds: 1,
						documents: 0,
						errors: [],
						fetched: [{ file: '/build/r.js', named: true, round: 1, via: [] }],
					},
				],
			},
		},
		constructGlue: {
			'event handler': { bytesPerInstance: 2_900, oneInstance: 15_000 },
			'keyed @for': { bytesPerInstance: 5_300, oneInstance: 16_000 },
		},
	};
}

const anchors = (): Json => ({
	version: 2,
	runtimeModules: { 'web/resume-branches': 4_000, 'web/resume-runtime': 9_000 },
	constructGlue: { 'event handler': 2_900, 'keyed @for': 5_300 },
	execution: { counter: { executedChars: 20_000, functions: 100, modules: 10 } },
	lean: { '/': ['click@counter-increment'] },
	allowFullResume: [],
	knownViolations: [],
	history: [],
});

const failures = (m: Json, a: Json = anchors()) =>
	evaluate(m, a).failures.map((f: Json) => `[${f.guard}] ${f.message}`);

describe('performance guards', () => {
	test('the anchored measurement holds every guard', () => {
		expect(failures(measurement())).toEqual([]);
	});

	test('app size never fails: 5 KB more author code only changes the informational G1/G6 lines', () => {
		const m = measurement();
		const route = m.sites.bench.routes['/records'];
		route.preload.gzipBytes += 5 * 1024;
		route.preload.attribution.author += 5 * 1024;
		route.waste.gzipBytes += 5 * 1024;
		const result = evaluate(m, anchors());
		expect(result.failures).toEqual([]);
		expect(result.notes.map((n: Json) => n.message)).toContainEqual(
			expect.stringContaining(
				'bench /records: critical path 53.8 KB gzip in 2 files (runtime 29.3 KB, glue 7.8 KB, author 16.7 KB)',
			),
		);
	});

	test('G1 fails a second serial fetch round on the boot path', () => {
		const m = measurement();
		Object.assign(m.sites.bench.routes['/records'].preload, {
			rounds: 2,
			chain: ['/build/a.js', '/build/c.js'],
			notPreloaded: ['/build/c.js'],
		});
		expect(failures(m)).toEqual([
			expect.stringContaining(
				'[G1] bench /records: boot needs 2 serial fetch rounds (anchor: 1). Chain: /build/a.js -> /build/c.js',
			),
		]);
	});

	test('G2 names the control whose first use fetched JS', () => {
		const m = measurement();
		m.sites.bench.routes['/records'].controls[0].inputJs = ['/build/late.js'];
		expect(failures(m)).toEqual([
			expect.stringContaining(
				'[G2] bench /records: first click on "sort-score" fetched 1 JS file(s) after the input: /build/late.js',
			),
		]);
	});

	test('G3 fails execution growth over 25% and names the action and anchor', () => {
		const within = measurement();
		within.sites.bench.execution.counter.executedChars = 24_000;
		expect(failures(within)).toEqual([]);

		const over = measurement();
		over.sites.bench.execution.counter.executedChars = 30_000;
		const [message] = failures(over);
		expect(message).toContain('[G3] counter (overview-counter-first on /)');
		expect(message).toContain('anchor 19.5 KB / 100 / 10 (+50% source)');
		expect(message).toContain('pnpm perf:guard:accept execution "counter"');
	});

	test('G4 fails a lean action that moved to full resume unless it is allowed with a reason', () => {
		const m = measurement();
		m.sites.bench.lean['/']['click@counter-increment'] = 'full-resume';
		expect(failures(m)).toEqual([
			expect.stringContaining(
				'[G4] bench /: action "click@counter-increment" moved from a lean dispatch path to full resume',
			),
		]);
		const allowed = {
			...anchors(),
			allowFullResume: [{ route: '/', action: 'click@counter-increment', reason: 'x' }],
		};
		expect(failures(m, allowed)).toEqual([]);
	});

	test('G5 fails a handler that ran after a task hop', () => {
		const m = measurement();
		m.sites.bench.sameTask[0].sameTask = false;
		expect(failures(m)).toEqual([
			expect.stringContaining(
				'[G5] bench /: after the runtime started, "toggle again" (click) changed the DOM only after another task ran',
			),
		]);
	});

	test('G7 fails the compile hint on a file no route preloads', () => {
		const m = measurement();
		m.sites.bench.compileHints = {
			hinted: ['/build/a.js', '/build/lazy.js'],
			hintedNotPreloaded: ['/build/lazy.js'],
		};
		expect(failures(m)).toEqual([
			expect.stringContaining(
				'[G7] bench: the eager compile hint is on files no route preloads: /build/lazy.js',
			),
		]);
	});

	test("G9 fails a chunk that names another chunk's hashed file", () => {
		const m = measurement();
		m.sites.bench.chunkNameReferences = [{ file: '/build/a.js', names: ['/build/b.js'] }];
		expect(failures(m)).toEqual([
			expect.stringContaining('[G9] bench: /build/a.js names /build/b.js.'),
		]);
		m.sites.bench.chunkNameReferences = [];
		expect(failures(m)).toEqual([]);
	});

	test('G8 fails a chained navigation fetch, and a recorded known violation only reports it', () => {
		const m = measurement();
		Object.assign(m.sites.bench.navigation[0], {
			rounds: 2,
			fetched: [
				{ file: '/build/r.js', named: true, round: 1, via: [] },
				{ file: '/build/late.js', named: false, round: 2, via: ['/build/r.js'] },
			],
		});
		expect(failures(m)).toEqual([
			expect.stringContaining(
				'[G8] bench / -> /records: navigation fetched JS in 2 serial rounds (anchor: 1): /build/late.js (round 2, imported by /build/r.js)',
			),
		]);
		const known = {
			...anchors(),
			knownViolations: [
				{ guard: 'G8', subject: 'bench / -> /records', reason: 'pre-existing' },
			],
		};
		expect(failures(m, known)).toEqual([]);
	});

	test('G10 fails a runtime module that grew past its per-feature budget and names the feature', () => {
		const small = measurement();
		small.sites.bench.runtimeModules['web/resume-branches'] += 100;
		expect(failures(small)).toEqual([]);

		const large = measurement();
		large.sites.bench.runtimeModules['web/resume-branches'] += 200;
		expect(failures(large)).toEqual([
			expect.stringContaining(
				'[G10] bench: runtime feature module web/resume-branches (demanded by branch records) got heavier: 4000 -> 4200 B (+200 B rendered, budget +128 B)',
			),
		]);
		expect(failures(large)[0]).toContain(
			'pnpm perf:guard:accept runtime "web/resume-branches"',
		);
	});

	test('G10 fails a runtime module that ships without an anchor', () => {
		const m = measurement();
		m.sites.bench.runtimeModules['web/new-helper'] = 300;
		expect(failures(m)).toEqual([
			expect.stringContaining(
				'[G10] bench: new runtime module web/new-helper (framework infrastructure no compiled record names) ships 300 B',
			),
		]);
	});

	test('G11 fails a runtime feature module on a page whose own demand never names it', () => {
		const m = measurement();
		m.sites.bench.routes['/records'].payPerUse.undemanded = ['web/resume-behaviors'];
		expect(failures(m)).toEqual([
			expect.stringContaining(
				"[G11] bench /records: runtime feature module web/resume-behaviors ships in the page's download, but no compiled demand of the page's own modules (pages/records.tsrx) names it",
			),
		]);
	});

	test('G12 fails emitted glue per construct past its budget and names the construct', () => {
		const within = measurement();
		within.constructGlue['event handler'].bytesPerInstance += 24;
		expect(failures(within)).toEqual([]);

		const over = measurement();
		over.constructGlue['event handler'].bytesPerInstance += 64;
		expect(failures(over)).toEqual([
			expect.stringContaining(
				'[G12] event handler: the compiler emits 2964 B of glue per instance on the minimal fixture, anchor 2900 B: +64 B per event handler (budget +24 B)',
			),
		]);
	});

	test('accept re-anchors one subject and records the reason', () => {
		const m = measurement();
		m.sites.bench.runtimeModules['web/resume-branches'] = 4_400;
		const next = accept(
			anchors(),
			m,
			'runtime',
			'web/resume-branches',
			'branches learn nested arms',
			'2026-09-24',
		);
		expect(next.runtimeModules['web/resume-branches']).toBe(4_400);
		expect(next.runtimeModules['web/resume-runtime']).toBe(9_000);
		expect(next.history).toEqual([
			{
				date: '2026-09-24',
				guard: 'runtime',
				subject: 'web/resume-branches',
				from: 4_000,
				to: 4_400,
				reason: 'branches learn nested arms',
			},
		]);
		expect(() => accept(anchors(), m, 'runtime', 'web/resume-branches', '')).toThrow(
			'--reason',
		);

		m.constructGlue['keyed @for'].bytesPerInstance = 5_500;
		const glue = accept(
			anchors(),
			m,
			'construct',
			'keyed @for',
			'rows carry keys',
			'2026-09-24',
		);
		expect(glue.constructGlue).toEqual({ 'event handler': 2_900, 'keyed @for': 5_500 });
	});

	test('accepting a lean regression records an allowlist entry with the reason', () => {
		const m = measurement();
		m.sites.bench.lean['/']['click@counter-increment'] = 'full-resume';
		const next = accept(anchors(), m, 'lean', '/', 'counter now reads a handle', '2026-09-23');
		expect(next.allowFullResume).toEqual([
			{ route: '/', action: 'click@counter-increment', reason: 'counter now reads a handle' },
		]);
		expect(failures(m, next)).toEqual([]);
	});
});

describe('critical path rounds', () => {
	const graph: Record<string, string[]> = { '/a.js': ['/b.js'], '/b.js': ['/c.js'], '/c.js': [] };
	const imports = (path: string) => graph[path] ?? [];

	test('a fully preloaded import closure is one round', () => {
		expect(criticalPathRounds(['/a.js'], ['/a.js', '/b.js', '/c.js'], imports).rounds).toBe(1);
	});

	test('each unpreloaded link in a static chain adds a round', () => {
		expect(criticalPathRounds(['/a.js'], ['/a.js'], imports)).toEqual({
			rounds: 3,
			chain: ['/a.js', '/b.js', '/c.js'],
			notPreloaded: ['/b.js', '/c.js'],
		});
	});
});

describe('timing guard comparison', () => {
	const cell = (variant: string, median: number, successes = 10) => ({
		variant,
		caseId: 'records-search',
		phase: 'early',
		visits: 10,
		successes,
		metrics: { inputToResponseMs: { median } },
	});

	test('only a slowdown past both the ratio and the absolute floor is a regression', () => {
		expect(
			compareCells([cell('baseline', 100), cell('current', 120)], {
				ratio: 0.25,
				minMs: 30,
			})[0].regression,
		).toBe(false);
		expect(
			compareCells([cell('baseline', 100), cell('current', 140)], {
				ratio: 0.25,
				minMs: 30,
			})[0].regression,
		).toBe(true);
		expect(
			compareCells([cell('baseline', 100), cell('current', 100, 8)], {
				ratio: 0.25,
				minMs: 30,
			})[0].regression,
		).toBe(true);
	});
});
