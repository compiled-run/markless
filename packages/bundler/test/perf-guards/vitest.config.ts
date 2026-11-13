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
		// Measuring takes about 6 min on the runner; in the merge queue the baseline then waits up to 10 for the entry ahead to measure.
		hookTimeout: 1_200_000,
	},
});
