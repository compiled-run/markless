import { markless } from '@markless/core/vite';
import { testSSR } from '@markless/vitest-browser/ssr-plugin';
import { playwright } from 'vite-plus/test/browser-playwright';
import { defineProject } from 'vitest/config';

// Browser test project for @markless/ui. Each family's browser suite is
// colocated in its own src/<family>/ folder beside the component, next to the
// .tsrx test apps it renders. The markless plugin compiles those apps; testSSR
// turns the SSR markers in the shared harness into browser commands.
//
// The chaos lane in chaos/vitest.config.ts is this package's second browser
// lane, on the same provider and the same setup file. It is a standalone config
// rather than a second project here: a project config file contributes exactly
// one project, and this file is named in the root vite.config.ts projects list,
// which would ungate a lane that is meant to be run on request.
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
		// Two roots: the colocated family suites, and the cross-family conformance
		// battery in test-support/, which holds every family to one shared set of
		// checks and so belongs to no single family folder.
		include: ['src/**/*.browser.ts', 'test-support/**/*.browser.ts'],
		setupFiles: ['./test-support/browser-setup.ts'],
		// Serial on purpose (U173 measurement): parallel iframes contend on one
		// dev server and CPU until gesture latency crosses the 1000ms poll
		// ceiling (p99 1230ms parallel vs 363ms serial) — and serial is FASTER
		// (~50s vs ~118s; cold imports 24s vs 1265s cumulative).
		fileParallelism: false,
		// CI's 2-core runners push gesture latency past the 1000ms poll default
		// even serial (the p99 measurement above); every expect.poll in the lane
		// gets the budget the slow environment actually needs, and fast machines
		// still return on the first poll.
		expect: { poll: { timeout: 5_000 } },
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
