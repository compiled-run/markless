import { defineConfig } from 'vite-plus';
import { markless } from '@markless/bundler/vite';

export default defineConfig({
	plugins: [markless({ packing: process.env.MARKLESS_FIXTURE_NATIVE_PACKING !== '0' })],
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts'],
	},
});
