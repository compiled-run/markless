import { defineConfig } from 'vite';
import { arcade } from '../../../arcade/src/vite.ts';
import { fixtureSsrHost } from './src/dev-server.ts';

export default defineConfig(({ command }) => ({
	build:
		command === 'build'
			? {
					rolldownOptions: {
						input: {
							index: 'index.html',
							resume: 'src/entry-client.ts',
						},
						preserveEntrySignatures: 'exports-only',
					},
				}
			: undefined,
	environments: {
		ssr: {
			build: {
				rolldownOptions: {
					input: 'src/entry-server.ts',
				},
			},
		},
	},
	plugins: [arcade(), fixtureSsrHost()],
}));
