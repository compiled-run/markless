import { markless } from '@markless/core/vite';
import { defineConfig } from 'vite-plus';

export default defineConfig({
	plugins: [markless({ executionLog: 'never' })],
	build: {
		// One chunk holds the 100 nested components a client mount renders: 1,019 kB, linear in depth (computed-chain-growth.test.ts).
		chunkSizeWarningLimit: 1050,
		minify: 'oxc',
		target: 'es2022',
	},
});
