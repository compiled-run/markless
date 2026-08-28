import { markless } from '@markless/core/vite';
import { playwright } from 'vite-plus/test/browser-playwright';
import { defineConfig } from 'vitest/config';

// The chaos lane: the same browser, provider and setup file as the `ui` project
// in ../vitest.config.ts, on its own standalone config because the lane is gated
// and must stay out of the root vite.config.ts projects list.
//
// No testSSR plugin: every storm mounts client-side. The SSR marker is rewritten
// at its literal call site, so it cannot be reached through a family descriptor.
export default defineConfig({
	// The package, not this folder: the storms import scenarios from ../src.
	root: new URL('..', import.meta.url).pathname,
	plugins: [markless()],
	define: {
		// The one way a seed reaches the page: vitest runs in node, the storm
		// generator runs in the browser, where process.env does not exist.
		__CHAOS_SEED__: JSON.stringify(process.env.CHAOS_SEED ?? ''),
	},
	test: {
		name: 'ui-chaos',
		// The suffix is what keeps this lane out of the `ui` project, which takes
		// only `src/**/*.browser.ts` and `test-support/**/*.browser.ts`.
		include: ['chaos/**/*.chaos.ts'],
		setupFiles: ['./test-support/browser-setup.ts'],
		// Serial for the same measured reason the `ui` lane is: parallel iframes
		// contend on one dev server until gesture latency crosses the poll ceiling.
		fileParallelism: false,
		browser: {
			enabled: true,
			headless: true,
			provider: playwright(),
			screenshotDirectory: 'test/__screenshots__',
			instances: [{ browser: 'chromium' }],
		},
	},
});
