import { markless } from '@markless/core/vite';
import { testSSR } from '@markless/vitest-browser/ssr-plugin';
import { playwright } from 'vite-plus/test/browser-playwright';
import { defineProject } from 'vitest/config';

// Browser test project for @markless/ui. The markless plugin compiles the
// package's .tsrx sources and fixtures; testSSR turns the SSR markers in the
// shared harness into browser commands.
export default defineProject({
	plugins: [testSSR(), markless()],
	test: {
		name: 'ui',
		include: ['test/**/*.test.ts'],
		browser: {
			enabled: true,
			headless: true,
			provider: playwright(),
			instances: [{ browser: 'chromium' }],
		},
	},
});
