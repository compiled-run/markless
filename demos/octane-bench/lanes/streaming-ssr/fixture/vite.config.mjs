import { markless } from '@markless/core/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [markless({ executionLog: 'never' })],
	build: {
		ssr: 'entry-server.mjs',
		outDir: 'dist',
		emptyOutDir: true,
		minify: false,
	},
});
