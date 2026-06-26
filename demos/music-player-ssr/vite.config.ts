import { defineConfig } from 'vite';
import { arcade } from 'arcade/vite';
import { musicPlayerSsrHost } from './src/dev-server.ts';

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
					input: 'src/App.tsrx',
				},
			},
		},
	},
	plugins: [arcade(), musicPlayerSsrHost()],
}));
