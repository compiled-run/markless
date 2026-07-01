import { defineConfig } from 'rolldown';
import { marklessClient, marklessServer } from '@markless/bundler/rolldown';

export default defineConfig([
	{
		input: 'src/client.ts',
		output: {
			dir: 'dist/client',
			format: 'esm',
		},
		plugins: [marklessClient()],
	},
	{
		input: 'src/render.ts',
		output: {
			dir: 'dist/render',
			format: 'esm',
		},
		plugins: [marklessServer()],
	},
]);
