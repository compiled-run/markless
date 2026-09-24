import { markless } from '@markless/core/vite';
import { playwright } from 'vite-plus/test/browser-playwright';
import type { Plugin } from 'vite';
import { defineProject } from 'vitest/config';
import type { BrowserCommand } from 'vitest/node';
import { executedModulesPlugin } from '../bundler/test-support/executed-modules-plugin.ts';
import { testSSR } from './src/ssr-plugin.ts';

// A refused fixture's error overlay covers the shared tester page for every later file;
// the browser server forces `hmr: false`, so `hmr.overlay` cannot turn it off.
function noErrorOverlay(): Plugin {
	return {
		name: 'markless-test:no-error-overlay',
		configureServer(server) {
			const hot = server.environments.client.hot;
			const send = hot.send.bind(hot) as (...args: unknown[]) => void;
			hot.send = ((...args: unknown[]) => {
				const payload = args[0] as { readonly type?: unknown } | string | undefined;
				if (typeof payload === 'object' && payload?.type === 'error') return;
				send(...args);
			}) as typeof hot.send;
		},
	};
}

// Off-page coordinates so no element, in any tester frame, sits under the mouse.
const parkPointer: BrowserCommand<[]> = async ({ page }) => {
	await page.mouse.move(-1, -1);
};

// Browser test project for @markless/vitest-browser. Runs the CSR + SSR
// resume harness tests in a real headless Chromium through the vite-plus
// playwright provider. The markless plugin compiles .tsrx fixtures; testSSR
// rewrites string and first-flush streaming markers into SSR browser commands.
export default defineProject({
	plugins: [testSSR(), executedModulesPlugin(), markless(), noErrorOverlay()],
	test: {
		name: 'browser',
		include: ['browser/**/*.test.ts'],
		setupFiles: ['./browser/support/park-pointer.ts'],
		// Serial on purpose: 136 files sharing one dev server push cold demand-loaded
		// symbol modules past the 1000ms poll ceiling (green 2/2 serial, ~9 red parallel).
		fileParallelism: false,
		browser: {
			enabled: true,
			headless: true,
			provider: playwright(),
			instances: [{ browser: 'chromium' }],
			commands: { parkPointer },
		},
	},
});
