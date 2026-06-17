import { defineConfig } from 'rolldown';
import { arcadeClient, arcadeServer } from '@arcadejs/bundler/rolldown';

export default defineConfig([
	{
		input: 'src/client.ts',
		output: {
			dir: 'dist/client',
			format: 'esm',
		},
		plugins: [arcadeClient()],
	},
	{
		input: 'src/render.ts',
		output: {
			dir: 'dist/render',
			format: 'esm',
		},
		plugins: [arcadeServer()],
	},
]);
