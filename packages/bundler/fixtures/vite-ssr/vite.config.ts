import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { arcade } from '../../../arcade/src/vite.ts';
import { fixtureSsrHost } from './src/dev-server.ts';

export default defineConfig(({ command }) => ({
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
	},
	plugins: [arcade(), fixtureSsrHost()],
}));
