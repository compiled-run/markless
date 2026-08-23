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
		// Family suites are colocated beside their components; the framework-
		// machinery witnesses live in the framework's own browser project.
		//
		// The suffix is load-bearing, not decoration. A family folder also holds
		// its screen-reader suites - <family>.sr.ts for the virtual reader, and
		// <family>.nvda.ts / <family>.voiceover.ts for the real ones - and those
		// belong to other runners (test-support/vitest.config.ts and
		// test-support/playwright.config.ts). Widening this to src/**/*.ts would
		// pull all three into the browser project, where the real-reader specs
		// have no reader to drive.
		include: ['src/**/*.browser.ts'],
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
