import { describe, expect, test } from 'vitest';
import {
	PREFETCH_DEFAULTS,
	PREFETCH_NETWORKS,
	PREFETCH_TRIGGERS,
	prefetchPolicy,
	prefetches,
} from '../../src/vite/prefetch-policy.ts';
import * as routerVite from '../../src/vite/index.ts';

describe('router prefetch policy', () => {
	test('defaults: intent on every network, idle on fast links, viewport off, two in flight', () => {
		expect(prefetchPolicy(undefined)).toEqual({
			levels: [2, 0, 1],
			concurrency: 2,
			budget: 2 * 1024 * 1024,
		});
		expect(prefetchPolicy(true)).toEqual(prefetchPolicy(undefined));
		expect(prefetchPolicy({})).toEqual(prefetchPolicy(undefined));
	});

	test('false and none turn every trigger off', () => {
		for (const off of [false, 'none'] as const) {
			expect(prefetchPolicy(off).levels).toEqual([0, 0, 0]);
			expect(prefetches(prefetchPolicy(off))).toBe(false);
		}
	});

	test('each trigger takes its own network class, and omitted ones keep their default', () => {
		expect(
			prefetchPolicy({ intent: 'all', viewport: 'all', idle: 'none', concurrency: 5 }),
		).toEqual({ levels: [2, 2, 0], concurrency: 5, budget: 2 * 1024 * 1024 });
		expect(prefetchPolicy({ budget: 500_000 }).budget).toBe(500_000);
		expect(prefetchPolicy({ viewport: 'fast' }).levels).toEqual([2, 1, 1]);
		expect(prefetches(prefetchPolicy({ intent: 'none', idle: 'none' }))).toBe(false);
	});

	test('a config the router does not understand fails the build instead of being ignored', () => {
		expect(() => prefetchPolicy({ intent: 'slow' as never })).toThrow(/prefetch\.intent/);
		expect(() => prefetchPolicy({ hover: 'all' } as never)).toThrow(
			/prefetch\.hover is not a trigger/,
		);
		expect(() => prefetchPolicy('fast' as never)).toThrow(/prefetch is "fast"/);
		expect(() => prefetchPolicy(null as never)).toThrow(/prefetch is null/);
		expect(() => prefetchPolicy([] as never)).toThrow(/prefetch is \[\]/);
		expect(() => prefetchPolicy({ concurrency: 0 })).toThrow(/concurrency/);
		expect(() => prefetchPolicy({ budget: -1 })).toThrow(/prefetch\.budget/);
		expect(() => prefetchPolicy({ budget: '2MB' as never })).toThrow(/prefetch\.budget/);
		expect(() => prefetchPolicy({ concurrency: 1.5 })).toThrow(/concurrency/);
	});

	test('the trigger and network lists a config writer detects are exported beside router()', () => {
		expect(routerVite.PREFETCH_TRIGGERS).toBe(PREFETCH_TRIGGERS);
		expect(routerVite.prefetchPolicy).toBe(prefetchPolicy);
		expect(routerVite.prefetchPolicy({ viewport: 'all', budget: 0 })).toEqual({
			levels: [2, 2, 1],
			concurrency: 2,
			budget: 0,
		});
		expect(routerVite.PREFETCH_NETWORKS).toBe(PREFETCH_NETWORKS);
		expect(routerVite.PREFETCH_DEFAULTS).toBe(PREFETCH_DEFAULTS);
		expect(routerVite.PREFETCH_LINK_CHOICES).toEqual(['intent', 'viewport']);
		expect(routerVite.PREFETCH_MARKS).toEqual([
			'markless:prefetch-budget-spent',
			'markless:prefetch-skipped',
		]);
		for (const trigger of PREFETCH_TRIGGERS)
			expect(PREFETCH_NETWORKS).toContain(PREFETCH_DEFAULTS[trigger]);
	});
});
