import { markless } from '@markless/core/vite';
import { playwright } from 'vite-plus/test/browser-playwright';
import { defineConfig } from 'vitest/config';

// Standalone project: the screen-reader lane is not in the root vite.config.ts
// projects list, so `pnpm test:sr` points vitest straight at this file.
export default defineConfig({
	// The package, not this folder: the suites import scenarios from ../src.
	root: new URL('..', import.meta.url).pathname,
	plugins: [markless()],
	test: {
		name: 'ui-sr',
		include: ['sr/**/*.sr.test.ts'],
		browser: {
			enabled: true,
			headless: true,
			provider: playwright(),
			screenshotDirectory: 'test/__screenshots__',
			instances: [{ browser: 'chromium' }],
		},
	},
});
