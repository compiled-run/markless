import { markless } from '@markless/core/vite';
import { playwright } from 'vite-plus/test/browser-playwright';
import { defineProject } from 'vitest/config';
import { executedModulesPlugin } from '../bundler/test-support/executed-modules-plugin.ts';
import { testSSR } from './src/ssr-plugin.ts';

// Browser test project for @markless/vitest-browser. Runs the CSR + SSR
// resume harness tests in a real headless Chromium through the vite-plus
// playwright provider. The markless plugin compiles .tsrx fixtures; testSSR
// rewrites string and first-flush streaming markers into SSR browser commands.
export default defineProject({
	plugins: [testSSR(), executedModulesPlugin(), markless()],
	// A fixture that fails to compile must not cover the page a real pointer drives.
	server: { hmr: { overlay: false } },
	test: {
		name: 'browser',
		include: ['browser/**/*.test.ts'],
		// Serial on purpose: 136 files sharing one dev server push cold demand-loaded
		// symbol modules past the 1000ms poll ceiling (green 2/2 serial, ~9 red parallel).
		fileParallelism: false,
		browser: {
			enabled: true,
			headless: true,
			provider: playwright(),
			instances: [{ browser: 'chromium' }],
		},
	},
});
