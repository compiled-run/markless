import { markless } from '@markless/bundler/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [markless({ executionLog: 'never' })],
	build: {
		modulePreload: false,
		target: 'es2022',
	},
});
