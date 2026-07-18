import { fileURLToPath } from 'node:url';
import { markless } from '@markless/core/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	base: '/markless/',
	plugins: [markless({ executionLog: 'never' })],
	build: {
		outDir: 'dist/client',
		emptyOutDir: true,
		minify: 'oxc',
		target: 'es2022',
		rolldownOptions: { input: 'index.html', preserveEntrySignatures: 'exports-only' },
	},
	environments: {
		ssr: {
			build: {
				outDir: 'dist/ssr-symbol',
				rolldownOptions: { input: fileURLToPath(new URL('./app.tsrx', import.meta.url)) },
			},
		},
		ssrRender: {
			consumer: 'server',
			build: {
				outDir: 'dist/server',
				emptyOutDir: true,
				minify: false,
				rolldownOptions: {
					input: fileURLToPath(new URL('./entry-server.mjs', import.meta.url)),
				},
			},
		},
	},
});
