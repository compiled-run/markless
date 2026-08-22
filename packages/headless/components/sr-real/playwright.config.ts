import { screenReaderConfig } from '@guidepup/playwright';
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { PREVIEW_ORIGIN } from '../../../../apps/sr-gallery/preview-server.ts';

// The repo root, so the web server command reads the same way it does in CI.
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

export default defineConfig({
	...screenReaderConfig,
	testDir: fileURLToPath(new URL('.', import.meta.url)),
	// A real reader speaks in real time and cannot be hurried; these are not the
	// timings of an ordinary browser test.
	timeout: 5 * 60_000,
	// One reader per machine: two tests reading at once would interleave their
	// transcripts into each other's logs.
	workers: 1,
	fullyParallel: false,
	reporter: process.env.CI ? [['github'], ['list']] : [['list']],
	// The gallery is served by the framework's own dev server. Playwright starts
	// it when nothing is listening yet and reuses whatever is, so the CI boot
	// check and this config never race for the port.
	webServer: {
		command: 'pnpm --dir apps/sr-gallery dev',
		cwd: repoRoot,
		url: PREVIEW_ORIGIN,
		reuseExistingServer: true,
		timeout: 180_000,
	},
	projects: [
		{ name: 'nvda', testMatch: /.*\.nvda\.spec\.ts$/ },
		{ name: 'voiceover', testMatch: /.*\.voiceover\.spec\.ts$/ },
	],
});
