import { markless } from '@markless/core/vite';
import { testSSR } from '@markless/vitest-browser/ssr-plugin';
import { playwright } from 'vite-plus/test/browser-playwright';
import { defineProject } from 'vitest/config';

// Browser test project for @markless/ui. Each family's browser suite is
// colocated in its own src/<family>/ folder beside the component, next to the
// .tsrx test apps it renders. The markless plugin compiles those apps; testSSR
// turns the SSR markers in the shared harness into browser commands.
export default defineProject({
	plugins: [testSSR(), markless()],
	test: {
		name: 'ui',
		// Family suites are colocated beside their components. test/ holds only the
		// framework-machinery witnesses that exercise that machinery through this
		// package's families, so they cannot live in the framework's own browser
		// project without dragging this package into its module graph.
		include: ['src/**/*.browser.ts', 'test/**/*.test.ts'],
		browser: {
			enabled: true,
			headless: true,
			provider: playwright(),
			// Failure screenshots stay out of src/, which ships in the package.
			screenshotDirectory: 'test/__screenshots__',
			instances: [{ browser: 'chromium' }],
		},
	},
});
