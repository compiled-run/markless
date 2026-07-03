import { markless } from '@markless/core/vite';
import { playwright } from 'vite-plus/test/browser-playwright';
import { defineProject } from 'vitest/config';
import { testSSR } from './src/ssr-plugin.ts';

// Browser test project for @markless/vitest-browser. Runs the CSR + SSR
// resume harness tests in a real headless Chromium through the vite-plus
// playwright provider. The markless plugin compiles .tsrx fixtures; testSSR
// rewrites renderSSR(Component) marker calls into the SSR browser command.
export default defineProject({
	plugins: [testSSR(), markless()],
	test: {
		name: 'browser',
		include: ['browser/**/*.test.ts'],
		browser: {
			enabled: true,
			headless: true,
			provider: playwright(),
			instances: [{ browser: 'chromium' }],
		},
	},
});
