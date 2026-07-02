import { defineConfig } from 'vite-plus';
import { markless } from '@markless/bundler/vite';

export default defineConfig({
	plugins: [markless()],
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts'],
	},
});
