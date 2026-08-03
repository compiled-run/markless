import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { markless } from '../../../core/src/vite.ts';

export default defineConfig(({ command }) => ({
	build:
		command === 'build'
			? {
					rolldownOptions: {
						input: {
							index: 'index.html',
							nonPrerenderPage: 'src/non-prerender-page.ts',
						},
						preserveEntrySignatures: 'exports-only',
					},
				}
			: undefined,
	environments: {
		ssr: {
			build: {
				rolldownOptions: {
					input: fileURLToPath(new URL('./src/root.tsrx', import.meta.url)),
				},
			},
		},
		ssrRender: {
			consumer: 'server',
			build: {
				outDir: 'dist/server-render',
				rolldownOptions: {
					input: fileURLToPath(new URL('./src/server.ts', import.meta.url)),
				},
			},
		},
	},
	plugins: [markless()],
}));
