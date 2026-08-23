import { markless } from '@markless/core/vite';
import { playwright } from 'vite-plus/test/browser-playwright';
import { defineConfig } from 'vitest/config';

// Standalone project: the screen-reader lane is not in the root vite.config.ts
// projects list, so `pnpm test:sr` points vitest straight at this file.
export default defineConfig({
	// The package, not this folder: the suites live under ../src beside the
	// components they read, and import their scenarios from there.
	root: new URL('..', import.meta.url).pathname,
	plugins: [markless()],
	test: {
		name: 'ui-sr',
		// Colocated beside each family, the way `<family>.browser.ts` is. The
		// suffix is what separates the lanes: the `ui` browser project takes only
		// `.browser.ts`, and this one only `.sr.ts`.
		include: ['src/**/*.sr.ts'],
		browser: {
			enabled: true,
			headless: true,
			provider: playwright(),
			screenshotDirectory: 'test/__screenshots__',
			instances: [{ browser: 'chromium' }],
		},
	},
});
