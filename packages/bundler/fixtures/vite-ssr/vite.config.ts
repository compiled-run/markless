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
					input: 'src/root.tsrx',
				},
			},
		},
	},
	plugins: [arcade(), fixtureSsrHost()],
}));
