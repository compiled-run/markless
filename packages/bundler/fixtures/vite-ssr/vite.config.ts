import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { markless } from '../../../core/src/vite.ts';
import { fixtureSsrHost } from './src/dev-server.ts';

export default defineConfig(({ command, mode }) => ({
	build:
		command === 'build'
			? {
					rolldownOptions: {
						input: 'index.html',
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
	plugins: [
		markless({ debug: mode === 'debug-channel' }),
		fixtureSsrHost({
			devRenderEntry: '/src/server.ts',
			builtRenderEntry: 'server-render/server.js',
		}),
	],
}));
