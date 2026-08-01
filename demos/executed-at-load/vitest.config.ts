import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	resolve: {
		alias: {
			'@markless/compiler': fileURLToPath(
				new URL('../../packages/compiler/src/index.ts', import.meta.url),
			),
		},
	},
	test: {
		include: ['fixtures/**/*.test.ts'],
	},
});
