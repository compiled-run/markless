import { defineConfig } from 'vitest/config';

// Standalone lane: `pnpm perf:guard` builds the benchmark app and the docs site, so it runs alone.
export default defineConfig({
	root: new URL('../../../..', import.meta.url).pathname,
	test: {
		name: 'perf-guards',
		include: ['packages/bundler/test/perf-guards/*.guard.ts'],
		environment: 'node',
		fileParallelism: false,
		testTimeout: 60_000,
		// Measuring took 7.6 min (run 43455257900), then up to 10 min waiting for the queue entry ahead and ~1 min of downloads: 18.6, so 25 leaves 6.4.
		hookTimeout: 1_500_000,
	},
});
